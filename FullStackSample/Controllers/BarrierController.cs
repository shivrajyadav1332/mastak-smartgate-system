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
    }
}
