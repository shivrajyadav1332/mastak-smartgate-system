using Microsoft.AspNetCore.Mvc;
using WeighbridgeMockAPIReplica.Hubs;

namespace WeighbridgeMockAPIReplica.Controllers
{
    [ApiController]
    [Route("api/debug")]
    public class DiagnosticsController : ControllerBase
    {
        [HttpGet("signalr-connections")]
        public IActionResult GetSignalRConnectionCount()
        {
            var count = DeviceStatusHub.ConnectionCount;
            return Ok(new { connections = count });
        }
    }
}
