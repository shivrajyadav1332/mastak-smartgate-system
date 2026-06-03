using Microsoft.AspNetCore.Mvc;
using FullStackSample.Services;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/barrier")]
    public class BarrierController : ControllerBase
    {
        private readonly DeviceService _device;
        public BarrierController(DeviceService device)
        {
            _device = device;
        }

        [HttpPost("entry/open")]
        public IActionResult OpenEntry()
        {
            _device.OpenEntryBarrier();
            return Ok(new { entrySignal = _device.EntrySignal, entryBarrier = _device.EntryBarrier });
        }

        [HttpPost("entry/close")]
        public IActionResult CloseEntry()
        {
            _device.CloseEntryBarrier();
            return Ok(new { entrySignal = _device.EntrySignal, entryBarrier = _device.EntryBarrier });
        }

        [HttpPost("exit/open")]
        public IActionResult OpenExit()
        {
            _device.OpenExitBarrier();
            return Ok(new { exitSignal = _device.ExitSignal, exitBarrier = _device.ExitBarrier });
        }

        [HttpPost("exit/close")]
        public IActionResult CloseExit()
        {
            _device.CloseExitBarrier();
            return Ok(new { exitSignal = _device.ExitSignal, exitBarrier = _device.ExitBarrier });
        }

        [HttpGet("config/exit-autoclose")]
        public IActionResult GetExitAutoClose()
        {
            try
            {
                var ms = _device.GetExitAutoCloseMs();
                return Ok(new { exitAutoCloseMs = ms });
            }
            catch
            {
                return StatusCode(500);
            }
        }

        public class ExitAutoCloseDto { public int ms { get; set; } }

        [HttpPost("config/exit-autoclose")]
        public IActionResult SetExitAutoClose([FromBody] ExitAutoCloseDto dto)
        {
            if (dto == null) return BadRequest("payload required");
            try
            {
                var ms = Math.Max(0, dto.ms);
                _device.SetExitAutoCloseMs(ms);
                return Ok(new { exitAutoCloseMs = _device.GetExitAutoCloseMs() });
            }
            catch
            {
                return StatusCode(500);
            }
        }
    }
}
