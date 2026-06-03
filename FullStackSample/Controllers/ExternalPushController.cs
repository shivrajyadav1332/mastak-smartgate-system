using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using FullStackSample.Hubs;
using System.Threading.Tasks;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/external")]
    public class ExternalPushController : ControllerBase
    {
        private readonly IHubContext<VehicleHub> _hub;
        public ExternalPushController(IHubContext<VehicleHub> hub) => _hub = hub;

        [HttpPost("push")]
        public async Task<IActionResult> Push([FromBody] object payload)
        {
            if (payload == null) return BadRequest(new { status = "ERROR", message = "payload required" });

            // Broadcast payload to SignalR clients. Frontend listens for 'ReceiveSystemStatus' and 'DeviceEvent'.
            await _hub.Clients.All.SendAsync("ReceiveSystemStatus", payload);
            await _hub.Clients.All.SendAsync("DeviceEvent", payload);

            return Ok(new { status = "SENT" });
        }
    }
}
