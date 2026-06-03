using Microsoft.AspNetCore.Mvc;
using FullStackSample.Services;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/weighment")]
    public class WeighmentController : ControllerBase
    {
        private readonly DeviceService _device;

        public WeighmentController(DeviceService device)
        {
            _device = device;
        }

        // POST api/weighment/{id}/complete
        [HttpPost("{id}/complete")]
        public IActionResult Complete(string id, [FromBody] CompleteRequest? body)
        {
            if (string.IsNullOrWhiteSpace(id)) return BadRequest();
            var weight = body?.weightKg ?? 0.0;
            var autoClose = body?.autoCloseAfterSeconds ?? 13;
            _device.CompleteWeighment(id, weight, autoClose);
            return Ok(new { status = "OK", weighmentId = id });
        }

        // GET api/weighment/{id}/barrier-status
        [HttpGet("{id}/barrier-status")]
        public IActionResult BarrierStatus(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return BadRequest();
            var res = _device.GetBarrierStatus(id);
            return Ok(res);
        }

        public class CompleteRequest
        {
            public double? weightKg { get; set; }
            public int? autoCloseAfterSeconds { get; set; }
        }
    }
}
