using Microsoft.AspNetCore.Mvc;
using FullStackSample.Services;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/system/timings")]
    public class TimingsController : ControllerBase
    {
        private readonly DeviceService _device;
        public TimingsController(DeviceService device)
        {
            _device = device;
        }

        [HttpGet]
        public IActionResult Get()
        {
            return Ok(_device.GetTimings());
        }

        public class TimingsDto
        {
            public int? initialReadyMs { get; set; }
            public int? enteringMs { get; set; }
            public int? weighingMs { get; set; }
            public int? afterWeightMs { get; set; }
            public int? exitMs { get; set; }
        }

        [HttpPost]
        public IActionResult Post([FromBody] TimingsDto dto)
        {
            if (dto == null) return BadRequest("payload required");
            _device.UpdateTimings(dto.initialReadyMs, dto.enteringMs, dto.weighingMs, dto.afterWeightMs, dto.exitMs);
            return Ok(_device.GetTimings());
        }
    }
}
