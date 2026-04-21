using WeighbridgeMockAPIReplica.EventHandlers;

namespace WeighbridgeMockAPIReplica.BackgroundServices
{
    /// <summary>
    /// Background service that generates mock QR scan events periodically
    /// </summary>
    public class QRScanEventGeneratorService : BackgroundService
    {
        private readonly ILogger<QRScanEventGeneratorService> _logger;
        private readonly IServiceProvider _serviceProvider;
        private readonly TimeSpan _interval = TimeSpan.FromMinutes(20); // Slightly offset from ANPR

        public QRScanEventGeneratorService(
            ILogger<QRScanEventGeneratorService> logger,
            IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("QR Scanner Event Generator Service started. Events will be generated every {Interval} minutes", _interval.TotalMinutes);

            // Wait 1 minute before first event (offset from ANPR)
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using (var scope = _serviceProvider.CreateScope())
                    {
                        var qrHandler = scope.ServiceProvider.GetRequiredService<QRScannerEventHandler>();

                        // Generate and raise a mock QR scan event
                        var qrEvent = qrHandler.GenerateMockQRScan();
                        await qrHandler.RaiseQRScanEventAsync(qrEvent);

                        _logger.LogInformation(
                            "Mock QR scan event generated: {QRCode}. Next event in {Minutes} minutes",
                            qrEvent.QRCode,
                            _interval.TotalMinutes);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error generating QR scan event");
                }

                // Wait for the interval before generating next event
                await Task.Delay(_interval, stoppingToken);
            }

            _logger.LogInformation("QR Scanner Event Generator Service stopped");
        }
    }
}
