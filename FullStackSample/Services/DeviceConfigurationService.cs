using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Net.Http;
using System.Diagnostics;
using FullStackSample.Models;

namespace FullStackSample.Services
{
    /// <summary>
    /// Service for managing hardware device IP addresses and configurations
    /// </summary>
    public class DeviceConfigurationService
    {
        private readonly Dictionary<string, DeviceConfig> _deviceConfigs;
        private readonly HttpClient _httpClient;
        private readonly ILogger<DeviceConfigurationService> _logger;
        private readonly object _lock = new object();

        public DeviceConfigurationService(ILogger<DeviceConfigurationService> logger)
        {
            _logger = logger;
            _deviceConfigs = new Dictionary<string, DeviceConfig>();
            
            // Initialize HTTP client with timeout
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromSeconds(5);

            // Load default configurations
            InitializeDefaultDevices();
        }

        /// <summary>
        /// Initialize default device configurations
        /// </summary>
        private void InitializeDefaultDevices()
        {
            lock (_lock)
            {
                // ANPR Camera
                _deviceConfigs["anpr_001"] = new DeviceConfig
                {
                    DeviceId = "anpr_001",
                    DeviceName = "ANPR Camera - Entry",
                    DeviceType = "ANPR",
                    IpAddress = "192.168.1.100",
                    Port = 8080,
                    Protocol = "HTTP",
                    IsActive = true,
                    Description = "Automatic Number Plate Recognition Camera at entry gate"
                };

                // Boom Barrier - Entry
                _deviceConfigs["barrier_entry"] = new DeviceConfig
                {
                    DeviceId = "barrier_entry",
                    DeviceName = "Boom Barrier - Entry",
                    DeviceType = "BOOM_BARRIER",
                    IpAddress = "192.168.1.101",
                    Port = 502,
                    Protocol = "MODBUS",
                    IsActive = true,
                    Description = "Entry boom barrier control"
                };

                // Boom Barrier - Exit
                _deviceConfigs["barrier_exit"] = new DeviceConfig
                {
                    DeviceId = "barrier_exit",
                    DeviceName = "Boom Barrier - Exit",
                    DeviceType = "BOOM_BARRIER",
                    IpAddress = "192.168.1.102",
                    Port = 502,
                    Protocol = "MODBUS",
                    IsActive = true,
                    Description = "Exit boom barrier control"
                };

                // LED Message Display - Entry
                _deviceConfigs["led_entry"] = new DeviceConfig
                {
                    DeviceId = "led_entry",
                    DeviceName = "LED Message Display - Entry",
                    DeviceType = "LED_MESSAGE",
                    IpAddress = "192.168.1.103",
                    Port = 8081,
                    Protocol = "HTTP",
                    IsActive = true,
                    Description = "Entry LED message display board"
                };

                // LED Message Display - Exit
                _deviceConfigs["led_exit"] = new DeviceConfig
                {
                    DeviceId = "led_exit",
                    DeviceName = "LED Message Display - Exit",
                    DeviceType = "LED_MESSAGE",
                    IpAddress = "192.168.1.104",
                    Port = 8081,
                    Protocol = "HTTP",
                    IsActive = true,
                    Description = "Exit LED message display board"
                };

                // Weigh Bridge
                _deviceConfigs["weigh_bridge"] = new DeviceConfig
                {
                    DeviceId = "weigh_bridge",
                    DeviceName = "Weighbridge Scale",
                    DeviceType = "WEIGH_BRIDGE",
                    IpAddress = "192.168.1.105",
                    Port = 502,
                    Protocol = "MODBUS",
                    IsActive = true,
                    Description = "Weighbridge measurement system"
                };

                // Traffic Signal - Entry
                _deviceConfigs["signal_entry"] = new DeviceConfig
                {
                    DeviceId = "signal_entry",
                    DeviceName = "Traffic Signal - Entry",
                    DeviceType = "SIGNAL",
                    IpAddress = "192.168.1.106",
                    Port = 502,
                    Protocol = "MODBUS",
                    IsActive = true,
                    Description = "Entry traffic signal control (RED/GREEN)"
                };

                // Traffic Signal - Exit
                _deviceConfigs["signal_exit"] = new DeviceConfig
                {
                    DeviceId = "signal_exit",
                    DeviceName = "Traffic Signal - Exit",
                    DeviceType = "SIGNAL",
                    IpAddress = "192.168.1.107",
                    Port = 502,
                    Protocol = "MODBUS",
                    IsActive = true,
                    Description = "Exit traffic signal control (RED/GREEN)"
                };

                _logger.LogInformation("Initialized 8 default device configurations");
            }
        }

        /// <summary>
        /// Get all device configurations
        /// </summary>
        public List<DeviceConfig> GetAllDevices()
        {
            lock (_lock)
            {
                return _deviceConfigs.Values.ToList();
            }
        }

        /// <summary>
        /// Get device configuration by ID
        /// </summary>
        public DeviceConfig? GetDeviceById(string deviceId)
        {
            lock (_lock)
            {
                _deviceConfigs.TryGetValue(deviceId, out var config);
                return config;
            }
        }

        /// <summary>
        /// Get all devices of a specific type
        /// </summary>
        public List<DeviceConfig> GetDevicesByType(string deviceType)
        {
            lock (_lock)
            {
                return _deviceConfigs.Values
                    .Where(d => d.DeviceType == deviceType)
                    .ToList();
            }
        }

        /// <summary>
        /// Add or update a device configuration
        /// </summary>
        public DeviceConfig AddOrUpdateDevice(string deviceId, DeviceConfigRequest request)
        {
            lock (_lock)
            {
                DeviceConfig config;

                if (_deviceConfigs.TryGetValue(deviceId, out var existing))
                {
                    // Update existing
                    config = existing;
                    config.DeviceName = request.DeviceName;
                    config.DeviceType = request.DeviceType;
                    config.IpAddress = request.IpAddress;
                    config.Port = request.Port;
                    config.Protocol = request.Protocol;
                    config.IsActive = request.IsActive;
                    config.Description = request.Description;
                    config.UpdatedAt = DateTime.UtcNow;
                    _logger.LogInformation($"Updated device configuration: {deviceId}");
                }
                else
                {
                    // Create new
                    config = new DeviceConfig
                    {
                        DeviceId = deviceId,
                        DeviceName = request.DeviceName,
                        DeviceType = request.DeviceType,
                        IpAddress = request.IpAddress,
                        Port = request.Port,
                        Protocol = request.Protocol,
                        IsActive = request.IsActive,
                        Description = request.Description,
                        CreatedAt = DateTime.UtcNow
                    };
                    _deviceConfigs[deviceId] = config;
                    _logger.LogInformation($"Created new device configuration: {deviceId}");
                }

                return config;
            }
        }

        /// <summary>
        /// Delete a device configuration
        /// </summary>
        public bool DeleteDevice(string deviceId)
        {
            lock (_lock)
            {
                var deleted = _deviceConfigs.Remove(deviceId);
                if (deleted)
                {
                    _logger.LogInformation($"Deleted device configuration: {deviceId}");
                }
                return deleted;
            }
        }

        /// <summary>
        /// Update only IP address for a device
        /// </summary>
        public DeviceConfig? UpdateDeviceIp(string deviceId, string newIpAddress, int? newPort = null)
        {
            lock (_lock)
            {
                if (_deviceConfigs.TryGetValue(deviceId, out var config))
                {
                    var oldIp = config.IpAddress;
                    config.IpAddress = newIpAddress;
                    if (newPort.HasValue)
                    {
                        config.Port = newPort.Value;
                    }
                    config.UpdatedAt = DateTime.UtcNow;
                    _logger.LogInformation($"Updated device IP: {deviceId} from {oldIp} to {newIpAddress}");
                    return config;
                }
                return null;
            }
        }

        /// <summary>
        /// Test connectivity to a device
        /// </summary>
        public async Task<DeviceConnectivityStatus> TestDeviceConnectivity(string deviceId)
        {
            var device = GetDeviceById(deviceId);
            if (device == null)
            {
                return new DeviceConnectivityStatus
                {
                    DeviceId = deviceId,
                    Status = "ERROR",
                    ErrorMessage = "Device configuration not found"
                };
            }

            var status = new DeviceConnectivityStatus
            {
                DeviceId = deviceId,
                DeviceName = device.DeviceName
            };

            try
            {
                var stopwatch = Stopwatch.StartNew();
                
                string url = $"{device.Protocol.ToLower()}://{device.IpAddress}:{device.Port}";
                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(5));
                
                var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cts.Token);
                stopwatch.Stop();

                status.IsReachable = true;
                status.Status = response.IsSuccessStatusCode ? "ONLINE" : "OFFLINE";
                status.ResponseTime = (int)stopwatch.ElapsedMilliseconds;

                _logger.LogInformation($"Device connectivity test: {deviceId} - {status.Status}");
            }
            catch (HttpRequestException ex)
            {
                status.IsReachable = false;
                status.Status = "OFFLINE";
                status.ErrorMessage = $"Connection failed: {ex.Message}";
                _logger.LogWarning($"Device connectivity test failed for {deviceId}: {ex.Message}");
            }
            catch (OperationCanceledException)
            {
                status.IsReachable = false;
                status.Status = "OFFLINE";
                status.ErrorMessage = "Connection timeout";
                _logger.LogWarning($"Device connectivity test timeout for {deviceId}");
            }
            catch (Exception ex)
            {
                status.IsReachable = false;
                status.Status = "ERROR";
                status.ErrorMessage = ex.Message;
                _logger.LogError($"Unexpected error testing device {deviceId}: {ex.Message}");
            }

            return status;
        }

        /// <summary>
        /// Test connectivity to all devices
        /// </summary>
        public async Task<List<DeviceConnectivityStatus>> TestAllDevicesConnectivity()
        {
            var devices = GetAllDevices();
            var tasks = devices.Select(d => TestDeviceConnectivity(d.DeviceId)).ToList();
            var results = await Task.WhenAll(tasks);
            return results.ToList();
        }

        /// <summary>
        /// Get connectivity status for all active devices
        /// </summary>
        public async Task<List<DeviceConnectivityStatus>> GetActiveDevicesStatus()
        {
            var devices = GetAllDevices().Where(d => d.IsActive).ToList();
            var tasks = devices.Select(d => TestDeviceConnectivity(d.DeviceId)).ToList();
            var results = await Task.WhenAll(tasks);
            return results.ToList();
        }

        /// <summary>
        /// Get device by IP address
        /// </summary>
        public DeviceConfig? GetDeviceByIpAddress(string ipAddress)
        {
            lock (_lock)
            {
                return _deviceConfigs.Values
                    .FirstOrDefault(d => d.IpAddress == ipAddress);
            }
        }

        /// <summary>
        /// Get statistics about device configurations
        /// </summary>
        public object GetDeviceStatistics()
        {
            lock (_lock)
            {
                return new
                {
                    TotalDevices = _deviceConfigs.Count,
                    ActiveDevices = _deviceConfigs.Values.Count(d => d.IsActive),
                    InactiveDevices = _deviceConfigs.Values.Count(d => !d.IsActive),
                    ByType = _deviceConfigs.Values
                        .GroupBy(d => d.DeviceType)
                        .Select(g => new { Type = g.Key, Count = g.Count() })
                        .ToList(),
                    ByProtocol = _deviceConfigs.Values
                        .GroupBy(d => d.Protocol)
                        .Select(g => new { Protocol = g.Key, Count = g.Count() })
                        .ToList()
                };
            }
        }
    }
}
