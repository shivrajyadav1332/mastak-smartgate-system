using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using FullStackSample.Services;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/vehicle")]
    public class VehicleApiController : ControllerBase
    {
        private readonly DeviceService _device;
        private static readonly List<VehicleDto> _vehicles = new();
        private static int _nextId = 1;

        public VehicleApiController(DeviceService device)
        {
            _device = device;
        }

        [HttpGet]
        public IActionResult Get()
        {
            // return a snapshot of known vehicles
            var list = _vehicles.OrderBy(v => v.EntryTime).ToList();
            return Ok(list);
        }

        [HttpPost]
        public IActionResult Post([FromBody] VehicleCreateDto? body)
        {
            if (body == null || string.IsNullOrWhiteSpace(body.PlateNumber))
                return BadRequest("plateNumber is required");

            var dto = new VehicleDto { Id = _nextId++, PlateNumber = body.PlateNumber.Trim(), EntryTime = DateTime.UtcNow };
            _vehicles.Add(dto);

            // Kick off device processing so UI can observe state changes
            try { _ = _device.ProcessVehicle(dto.PlateNumber); } catch { }

            return Ok(dto);
        }

        [HttpPut("{id}")]
        public IActionResult Put(int id, [FromBody] VehicleCreateDto? body)
        {
            var item = _vehicles.FirstOrDefault(v => v.Id == id);
            if (item == null) return NotFound();
            if (body == null || string.IsNullOrWhiteSpace(body.PlateNumber)) return BadRequest("plateNumber is required");
            item.PlateNumber = body.PlateNumber.Trim();
            return Ok(item);
        }

        [HttpDelete("{id}")]
        public IActionResult Delete(int id)
        {
            var item = _vehicles.FirstOrDefault(v => v.Id == id);
            if (item == null) return NotFound();
            _vehicles.Remove(item);
            return Ok();
        }
    }

    public class VehicleDto
    {
        public int Id { get; set; }
        public string PlateNumber { get; set; } = string.Empty;
        public DateTime EntryTime { get; set; }
    }

    public class VehicleCreateDto
    {
        public string PlateNumber { get; set; } = string.Empty;
    }
}
