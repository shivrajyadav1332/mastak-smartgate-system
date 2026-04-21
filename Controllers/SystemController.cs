using Microsoft.AspNetCore.Mvc;
using WeighbridgeMockAPIReplica.Services;

namespace WeighbridgeMockAPIReplica.Controllers
{
    [ApiController]
    [Route("api/system")]
    public class SystemController : ControllerBase
    {
        private readonly SystemStateService _stateService;

        public SystemController(SystemStateService stateService)
        {
            _stateService = stateService;
        }

        [HttpGet("state")]
        public IActionResult GetState()
        {
            var s = _stateService.GetState();
            return Ok(s);
        }
    }
}
