using Microsoft.AspNetCore.Mvc;
using FullStackSample.Services;
using FullStackSample.Models;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace FullStackSample.Controllers
{
    /// <summary>
    /// API Controller for managing hardware device IP addresses and configurations
    /// </summary>
    [ApiController]
    [Route("api/devices")]
    public class DeviceConfigController : ControllerBase
    {
        private readonly DeviceConfigurationService _deviceConfigService;
        private readonly ILogger<DeviceConfigController> _logger;

        public DeviceConfigController(DeviceConfigurationService deviceConfigService, ILogger<DeviceConfigController> logger)
        {
            _deviceConfigService = deviceConfigService;
            _logger = logger;
        }

        /// <summary>
        /// Get all device configurations
        /// GET /api/devices
        /// </summary>
        [HttpGet]
        public IActionResult GetAllDevices()
        {
            try
            {
                var devices = _deviceConfigService.GetAllDevices();
                return Ok(new
                {
                    success = true,
                    data = devices,
                    count = devices.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error getting all devices: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Get device configuration by ID
        /// GET /api/devices/{deviceId}
        /// </summary>
        [HttpGet("{deviceId}")]
        public IActionResult GetDeviceById(string deviceId)
        {
            try
            {
                var device = _deviceConfigService.GetDeviceById(deviceId);
                if (device == null)
                {
                    return NotFound(new { success = false, error = "Device not found" });
                }

                return Ok(new { success = true, data = device });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error getting device {deviceId}: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Get devices by type (ANPR, BOOM_BARRIER, LED_MESSAGE, WEIGH_BRIDGE, SIGNAL)
        /// GET /api/devices/type/{deviceType}
        /// </summary>
        [HttpGet("type/{deviceType}")]
        public IActionResult GetDevicesByType(string deviceType)
        {
            try
            {
                var devices = _deviceConfigService.GetDevicesByType(deviceType);
                return Ok(new
                {
                    success = true,
                    data = devices,
                    count = devices.Count,
                    type = deviceType
                });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error getting devices of type {deviceType}: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Create a new device configuration
        /// POST /api/devices
        /// </summary>
        [HttpPost]
        public IActionResult CreateDevice([FromBody] DeviceConfigRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.DeviceName) || 
                    string.IsNullOrWhiteSpace(request.IpAddress) ||
                    string.IsNullOrWhiteSpace(request.DeviceType))
                {
                    return BadRequest(new { success = false, error = "Missing required fields" });
                }

                // Generate device ID
                string deviceId = $"{request.DeviceType.ToLower()}_{System.Guid.NewGuid().ToString().Substring(0, 8)}";

                var device = _deviceConfigService.AddOrUpdateDevice(deviceId, request);
                
                _logger.LogInformation($"Created new device: {deviceId}");
                return CreatedAtAction(nameof(GetDeviceById), new { deviceId = device.DeviceId }, 
                    new { success = true, data = device });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error creating device: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Update device configuration
        /// PUT /api/devices/{deviceId}
        /// </summary>
        [HttpPut("{deviceId}")]
        public IActionResult UpdateDevice(string deviceId, [FromBody] DeviceConfigRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.DeviceName) || 
                    string.IsNullOrWhiteSpace(request.IpAddress) ||
                    string.IsNullOrWhiteSpace(request.DeviceType))
                {
                    return BadRequest(new { success = false, error = "Missing required fields" });
                }

                var device = _deviceConfigService.AddOrUpdateDevice(deviceId, request);
                _logger.LogInformation($"Updated device: {deviceId}");
                
                return Ok(new { success = true, data = device });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error updating device {deviceId}: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Update only IP address of a device
        /// PATCH /api/devices/{deviceId}/ip
        /// </summary>
        [HttpPatch("{deviceId}/ip")]
        public IActionResult UpdateDeviceIp(string deviceId, [FromBody] dynamic request)
        {
            try
            {
                string? newIp = request?.ipAddress;
                int? newPort = request?.port;

                if (string.IsNullOrWhiteSpace(newIp))
                {
                    return BadRequest(new { success = false, error = "IP address is required" });
                }

                var device = _deviceConfigService.UpdateDeviceIp(deviceId, newIp, newPort);
                if (device == null)
                {
                    return NotFound(new { success = false, error = "Device not found" });
                }

                _logger.LogInformation($"Updated IP for device {deviceId}: {newIp}");
                return Ok(new { success = true, data = device });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error updating device IP {deviceId}: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Delete device configuration
        /// DELETE /api/devices/{deviceId}
        /// </summary>
        [HttpDelete("{deviceId}")]
        public IActionResult DeleteDevice(string deviceId)
        {
            try
            {
                var deleted = _deviceConfigService.DeleteDevice(deviceId);
                if (!deleted)
                {
                    return NotFound(new { success = false, error = "Device not found" });
                }

                _logger.LogInformation($"Deleted device: {deviceId}");
                return Ok(new { success = true, message = "Device deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error deleting device {deviceId}: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Test connectivity to a specific device
        /// POST /api/devices/{deviceId}/test
        /// </summary>
        [HttpPost("{deviceId}/test")]
        public async Task<IActionResult> TestDeviceConnectivity(string deviceId)
        {
            try
            {
                var status = await _deviceConfigService.TestDeviceConnectivity(deviceId);
                return Ok(new { success = true, data = status });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error testing device {deviceId}: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Test connectivity to all devices
        /// POST /api/devices/test/all
        /// </summary>
        [HttpPost("test/all")]
        public async Task<IActionResult> TestAllDevicesConnectivity()
        {
            try
            {
                var results = await _deviceConfigService.TestAllDevicesConnectivity();
                var online = results.Count(r => r.Status == "ONLINE");
                var offline = results.Count(r => r.Status == "OFFLINE");
                
                return Ok(new
                {
                    success = true,
                    data = results,
                    summary = new { total = results.Count, online, offline }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error testing all devices: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Get connectivity status of all active devices
        /// GET /api/devices/status/active
        /// </summary>
        [HttpGet("status/active")]
        public async Task<IActionResult> GetActiveDevicesStatus()
        {
            try
            {
                var statuses = await _deviceConfigService.GetActiveDevicesStatus();
                var online = statuses.Count(s => s.Status == "ONLINE");
                
                return Ok(new
                {
                    success = true,
                    data = statuses,
                    summary = new { total = statuses.Count, online }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error getting active devices status: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Get device statistics
        /// GET /api/devices/stats
        /// </summary>
        [HttpGet("stats")]
        public IActionResult GetDeviceStatistics()
        {
            try
            {
                var stats = _deviceConfigService.GetDeviceStatistics();
                return Ok(new { success = true, data = stats });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error getting device statistics: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }

        /// <summary>
        /// Get device by IP address
        /// GET /api/devices/lookup/{ipAddress}
        /// </summary>
        [HttpGet("lookup/{ipAddress}")]
        public IActionResult GetDeviceByIp(string ipAddress)
        {
            try
            {
                var device = _deviceConfigService.GetDeviceByIpAddress(ipAddress);
                if (device == null)
                {
                    return NotFound(new { success = false, error = "No device found with this IP" });
                }

                return Ok(new { success = true, data = device });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error looking up device by IP {ipAddress}: {ex.Message}");
                return StatusCode(500, new { success = false, error = "Internal server error" });
            }
        }
    }
}
