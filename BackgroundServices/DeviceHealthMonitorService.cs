using Microsoft.AspNetCore.SignalR;
using WeighbridgeMockAPIReplica.Hubs;

namespace WeighbridgeMockAPIReplica.BackgroundServices
{
    /// <summary>
    /// Background service that periodically broadcasts device health status
    /// </summary>
    public class DeviceHealthMonitorService : BackgroundService
    {
        private readonly ILogger<DeviceHealthMonitorService> _logger;
        private readonly IServiceProvider _serviceProvider;
        private readonly TimeSpan _interval = TimeSpan.FromMinutes(5);

        public DeviceHealthMonitorService(
            ILogger<DeviceHealthMonitorService> logger,
            IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Device Health Monitor Service started");

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); // Initial delay

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using (var scope = _serviceProvider.CreateScope())
                    {
                        var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<DeviceStatusHub>>();

                        // Broadcast device health status
                        var healthStatus = new
                        {
                            timestamp = DateTime.UtcNow,
                            devices = new[]
                            {
                                new { name = "ANPR Camera IN", status = "ONLINE", uptime = "99.9%" },
                                new { name = "ANPR Camera OUT", status = "ONLINE", uptime = "99.8%" },
                                new { name = "QR Scanner", status = "ONLINE", uptime = "100%" },
                                new { name = "Weighbridge Scale", status = "ONLINE", uptime = "99.5%" },
                                new { name = "Boom Barrier Entry", status = "ONLINE", uptime = "100%" },
                                new { name = "Boom Barrier Exit", status = "ONLINE", uptime = "99.7%" }
                            }
                        };

                        await hubContext.Clients.All.SendAsync("ReceiveDeviceHealth", healthStatus, stoppingToken);

                        _logger.LogDebug("Device health status broadcasted");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error broadcasting device health");
                }

                await Task.Delay(_interval, stoppingToken);
            }

            _logger.LogInformation("Device Health Monitor Service stopped");
        }
    }
}
