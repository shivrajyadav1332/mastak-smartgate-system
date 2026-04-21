using Microsoft.AspNetCore.Mvc;
using FullStackSample.Services;
using System.Linq;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/logs")]
    public class LogsController : ControllerBase
    {
        private readonly DeviceService _device;
        public LogsController(DeviceService device)
        {
            _device = device;
        }

        [HttpGet]
        public IActionResult Get()
        {
            var logs = _device.GetRecentLogs(50)
                .Select(l => new { plate = l.Plate, status = l.Status, timestamp = l.Timestamp, weight = l.Weight });
            return Ok(logs);
        }
    }
}
