using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using WeighbridgeMockAPIReplica.Hubs;

namespace WeighbridgeMockAPIReplica.Controllers
{
    [ApiController]
    [Route("api/vehicle")]
    public class VehicleController : ControllerBase
    {
        private readonly WeighbridgeMockAPIReplica.Services.SystemStateService _stateService;
        private readonly IHubContext<DeviceStatusHub> _hub;

        public VehicleController(WeighbridgeMockAPIReplica.Services.SystemStateService stateService, IHubContext<DeviceStatusHub> hub)
        {
            _stateService = stateService;
            _hub = hub;
        }

        [HttpPost("process")]
        public IActionResult ProcessVehicle([FromBody] VehicleRequest request)
        {
            if (request == null)
            {
                return BadRequest(new { status = "ERROR", reason = "Invalid request" });
            }

            // Start the state-driven flow in the background; return immediate result for the weigh request
            _stateService.StartVehicleFlow(request.PlateNumber, request.Weight);

            if (request.Weight < 1000)
            {
                _ = _hub.Clients.All.SendAsync("VehicleProcessed", new { plate = request.PlateNumber, status = "REJECTED" });
                return Ok(new { status = "REJECTED", reason = "Underweight" });
            }

            _ = _hub.Clients.All.SendAsync("VehicleProcessed", new { plate = request.PlateNumber, status = "ACCEPTED", weight = request.Weight });
            return Ok(new { status = "ACCEPTED", weight = request.Weight });
        }

        // Convenience GET endpoint for quick functional testing (not used by production clients)
        [HttpGet("processTest")]
        public IActionResult ProcessTest([FromQuery] string plate, [FromQuery] int weight)
        {
            if (string.IsNullOrEmpty(plate)) return BadRequest(new { status = "ERROR", reason = "missing plate" });
            _stateService.StartVehicleFlow(plate, weight);
            return Ok(new { status = "STARTED", plate, weight });
        }
    }

    public class VehicleRequest
    {
        public string PlateNumber { get; set; }
        public int Weight { get; set; }
    }
}
