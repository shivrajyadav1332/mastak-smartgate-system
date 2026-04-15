using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using FullStackSample.Models;
using System.Linq;
using System.Text.RegularExpressions;
using System.IO;
using System.Text.Json;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class VehicleController : ControllerBase
    {
        private readonly FullStackSample.Data.AppDbContext _context;
        private readonly Microsoft.AspNetCore.SignalR.IHubContext<FullStackSample.Hubs.VehicleHub> _hub;
        private readonly IConfiguration _configuration;
        private static bool lastWasAccepted = false;
        // Runtime editable allow-list (overrides appsettings when set)
        private static List<string>? _runtimeAllowedPlates = null;
        // in-memory vehicle log used by demo UI
        private static List<FullStackSample.Models.Vehicle> vehicles = new List<FullStackSample.Models.Vehicle>();
        // simple incremental id generator for in-memory entries
        private static int currentId = 1;

        public VehicleController(FullStackSample.Data.AppDbContext context, Microsoft.AspNetCore.SignalR.IHubContext<FullStackSample.Hubs.VehicleHub> hub, IConfiguration configuration)
        {
            _context = context;
            _hub = hub;
            _configuration = configuration;
            // initialize runtime list from configuration on first construction
            try
            {
                if (_runtimeAllowedPlates == null)
                {
                    var cfg = _configuration.GetSection("AllowedPlates").Get<List<string>>();
                    if (cfg != null && cfg.Count > 0)
                    {
                        _runtimeAllowedPlates = cfg.Select(s => s.ToUpper()).ToList();
                    }
                    else
                    {
                        _runtimeAllowedPlates = new List<string>();
                    }
                }
            }
            catch { _runtimeAllowedPlates = new List<string>(); }
        }

        [HttpGet]
        public IActionResult Get()
        {
            // Return in-memory vehicles list (most recent first)
            var outLogs = vehicles
                .OrderByDescending(x => x.EntryTime)
                .Select(v => new
                {
                    id = v.Id,
                    plateNumber = v.PlateNumber,
                    status = v.Status,
                    entryTime = v.EntryTime,
                    weight = v.Weight
                });

            return Ok(outLogs);
        }


        [HttpPost]
        public async Task<IActionResult> Post([FromBody] VehicleDto? dto)
        {
            try
            {
                if (dto == null)
                    return BadRequest("Vehicle body is required.");

                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var vehicle = new Vehicle { PlateNumber = dto.PlateNumber, EntryTime = DateTime.Now };
                vehicle.Id = currentId++;

                // Alternate logic: ACCEPTED / REJECTED toggles on each request
                if (!lastWasAccepted)
                {
                    vehicle.Status = "ACCEPTED";
                    lastWasAccepted = true;
                }
                else
                {
                    vehicle.Status = "REJECTED";
                    lastWasAccepted = false;
                }

                // Weight only if accepted
                vehicle.Weight = vehicle.Status == "ACCEPTED" ? new Random().Next(2500, 6000) : 0;

                // Barrier
                vehicle.Barrier = vehicle.Status == "ACCEPTED" ? "OPEN" : "CLOSED";

                // Store in-memory log (most recent first)
                vehicles.Insert(0, vehicle);

                // Broadcast to connected frontends via SignalR
                try
                {
                    var payload = new { plateNumber = vehicle.PlateNumber, status = vehicle.Status, weight = vehicle.Weight, barrier = vehicle.Barrier, time = vehicle.EntryTime };
                    await _hub.Clients.All.SendCoreAsync("VehicleAdded", new object[] { payload });
                }
                catch { }

                return Ok(new { plateNumber = vehicle.PlateNumber, status = vehicle.Status, weight = vehicle.Weight, barrier = vehicle.Barrier });
            }
            catch (Exception ex)
            {
                return Problem(detail: ex.ToString());
            }
        }

        [HttpGet("latest")]
        public IActionResult GetLatestVehicle()
        {
            var v = _context.Vehicles
                .OrderByDescending(x => x.Id)
                .FirstOrDefault();

            if (v == null) return NotFound();

            return Ok(new
            {
                plateNumber = v.PlateNumber,
                status = v.Status,
                signal = v.Status == "ACCEPTED" ? "GREEN" : "RED",
                barrier = v.Status == "ACCEPTED" ? "OPEN" : "CLOSED",
                moveTruck = v.Status == "ACCEPTED",
                weight = v.Weight
            });
        }

        [HttpGet("logs")]
        public IActionResult GetLogs()
        {
            var outLogs = vehicles
                .OrderByDescending(x => x.EntryTime)
                .Take(20)
                .Select(v => new
                {
                    plateNumber = v.PlateNumber,
                    status = v.Status,
                    time = v.EntryTime,
                    weight = v.Weight
                });

            return Ok(outLogs);
        }

        [HttpGet("check/{plate}")]
        public IActionResult CheckVehicle(string plate)
        {
            if (string.IsNullOrEmpty(plate)) return BadRequest("plate required");

            return Ok(new { status = IsPlateAllowed(plate) ? "ACCEPTED" : "REJECTED" });
        }

        [HttpGet("allowed")]
        public IActionResult GetAllowedPlates()
        {
            // return runtime list if present, otherwise config or fallback
            var list = (_runtimeAllowedPlates != null && _runtimeAllowedPlates.Count > 0)
                ? _runtimeAllowedPlates
                : _configuration.GetSection("AllowedPlates").Get<List<string>>()?.Select(s => s.ToUpper()).ToList() ?? new List<string>();

            return Ok(list);
        }

        [HttpPost("allowed")]
        public IActionResult SetAllowedPlates([FromBody] List<string>? plates)
        {
            if (plates == null) return BadRequest("plates array required");

            _runtimeAllowedPlates = plates.Select(s => (s ?? string.Empty).ToUpper()).Where(s => !string.IsNullOrEmpty(s)).ToList();

            // attempt to persist to appsettings.json so restarts keep the list
            try
            {
                var basePath = Directory.GetCurrentDirectory();
                var configPath = Path.Combine(basePath, "appsettings.json");
                var obj = new { AllowedPlates = _runtimeAllowedPlates };
                var json = JsonSerializer.Serialize(obj, new JsonSerializerOptions { WriteIndented = true });
                System.IO.File.WriteAllText(configPath, json);
            }
            catch { /* ignore persistence errors */ }

            return Ok(_runtimeAllowedPlates);
        }

        // Centralized allow-list check used by both CheckVehicle and AddVehicle
        private bool IsPlateAllowed(string plate)
        {
            if (string.IsNullOrEmpty(plate)) return false;

            var configured = _configuration.GetSection("AllowedPlates").Get<List<string>>();
            if (configured != null && configured.Count > 0)
            {
                return configured.Select(s => s.ToUpper()).Contains(plate.ToUpper());
            }

            // Fallback allow-list if config not present
            var allowedVehicles = new List<string> { "ABC-1234", "HFC-4556" };
            return allowedVehicles.Contains(plate.ToUpper());
        }

        // Alternate POST endpoint expecting a full Vehicle model (used by backend UI)
        [HttpPost("add")]
        public async Task<IActionResult> AddVehicle([FromBody] FullStackSample.Models.Vehicle? vehicle)
        {
            if (vehicle == null) return BadRequest("Vehicle body is required.");

            vehicle.EntryTime = DateTime.Now;

            // Use same allow-list logic as the check endpoint
            if (IsPlateAllowed(vehicle.PlateNumber))
            {
                vehicle.Status = "ACCEPTED";
                vehicle.Weight = new Random().Next(1000, 5000);
            }
            else
            {
                vehicle.Status = "REJECTED";
                vehicle.Weight = 0;
            }

            // Barrier state based on decision
            vehicle.Barrier = vehicle.Status == "ACCEPTED" ? "OPEN" : "CLOSED";

            // Persist to database if available
            try
            {
                _context.Vehicles.Add(vehicle);
                _context.SaveChanges();
            }
            catch
            {
                // Fallback to in-memory store for demo scenarios where DB isn't configured
                vehicle.Id = currentId++;
                vehicles.Insert(0, vehicle);
            }

            // Broadcast via SignalR if hub available
            try { await _hub.Clients.All.SendCoreAsync("VehicleAdded", new object[] { new { plateNumber = vehicle.PlateNumber, status = vehicle.Status, weight = vehicle.Weight, barrier = vehicle.Barrier, time = vehicle.EntryTime } }); } catch { }

            return Ok(vehicle);
        }

        [HttpPut("{id}")]
        public IActionResult Put(int id, [FromBody] VehicleDto? dto)
        {
            if (dto == null)
                return BadRequest("Vehicle body is required.");

            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var v = _context.Vehicles.Find(id);
            if (v == null) return NotFound();

            if (_context.Vehicles.Any(x => x.Id != id && x.PlateNumber.ToUpper() == dto.PlateNumber.ToUpper()))
                return BadRequest("A vehicle with the same plate number already exists.");

            v.PlateNumber = dto.PlateNumber;
            _context.SaveChanges();
            return Ok(v);
        }

        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            var v = _context.Vehicles.Find(id);
            if (v == null) return NotFound();

            _context.Vehicles.Remove(v);
            _context.SaveChanges();
            return Ok();
        }
    }
}
