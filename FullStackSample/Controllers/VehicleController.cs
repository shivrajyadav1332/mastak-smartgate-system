using Microsoft.AspNetCore.Mvc;
using FullStackSample.Services;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api/vehicle")]
    public class VehicleController : ControllerBase
    {
        private readonly DeviceService _service;

        public VehicleController(DeviceService service)
        {
            _service = service;
        }

        [HttpPost("arrive")]
        public IActionResult Arrive([FromBody] dynamic data)
        {
            string plate = data?.plate ?? string.Empty;
            var result = _service.ProcessVehicle((string)plate);
            return Ok(result);
        }

        [HttpPost("arrive/{plate}")]
        public IActionResult ArriveByPlate(string plate)
        {
            var result = _service.ProcessVehicle(plate ?? string.Empty);
            return Ok(result);
        }

        [HttpGet("logs")]
        public IActionResult GetLogs()
        {
            return Ok(_service.GetLogs());
        }
    }
}
