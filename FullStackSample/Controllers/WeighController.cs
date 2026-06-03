using Microsoft.AspNetCore.Mvc;
using FullStackSample.Services;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/weigh")]
    public class WeighController : ControllerBase
    {
        private readonly DeviceService _device;
        public WeighController(DeviceService device)
        {
            _device = device;
        }

        public class WeighCompleteDto { public int? delayMs { get; set; } }

        [HttpPost("complete")]
        public IActionResult Complete([FromBody] WeighCompleteDto? dto)
        {
            try
            {
                var delay = dto?.delayMs ?? 3000;

                // Trigger backend-owned JSON sequence; SignalR will drive the UI.
                var resp = new
                {
                    weighCompleted = true,
                    stage = "exit",
                    autoClose = true,
                    delay = delay
                };

                _device.CompleteWeighment($"WEIGH-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", 0, Math.Max(0, delay / 1000));

                return Ok(new { status = "SUCCESS", message = "Weigh completed, exit sequence started", payload = resp });
            }
            catch
            {
                return StatusCode(500, new { status = "ERROR", message = "Failed to complete weigh" });
            }
        }
    }
}
