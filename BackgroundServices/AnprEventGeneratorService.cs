using WeighbridgeMockAPIReplica.EventHandlers;

namespace WeighbridgeMockAPIReplica.BackgroundServices
{
    /// <summary>
    /// Background service that generates mock ANPR events every 1 minute
    /// </summary>
    public class AnprEventGeneratorService : BackgroundService
    {
        private readonly ILogger<AnprEventGeneratorService> _logger;
        private readonly IServiceProvider _serviceProvider;
        private readonly TimeSpan _interval = TimeSpan.FromMinutes(1);

        public AnprEventGeneratorService(
            ILogger<AnprEventGeneratorService> logger,
            IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("ANPR Event Generator Service starting up. Events will be generated every {Interval} minutes", _interval.TotalMinutes);

            // Wait 10 seconds before first event (to allow app startup)
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

            _logger.LogInformation("ANPR Event Generator Service started. First event will be generated shortly.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    _logger.LogDebug("Creating service scope for ANPR event generation...");

                    using (var scope = _serviceProvider.CreateScope())
                    {
                        _logger.LogDebug("Getting AnprEventHandler from service container...");
                        var anprHandler = scope.ServiceProvider.GetRequiredService<AnprEventHandler>();

                        _logger.LogDebug("Generating mock ANPR event...");
                        // Generate and raise a mock ANPR event
                        var anprEvent = anprHandler.GenerateMockAnprEvent();

                        _logger.LogDebug("Raising ANPR event async...");
                        await anprHandler.RaiseAnprEventAsync(anprEvent);

                        _logger.LogInformation(
                            "Mock ANPR event generated successfully: Truck {TruckPlate} detected. Next event in {Minutes} minutes",
                            anprEvent.EventInfo.Text,
                            _interval.TotalMinutes);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error generating ANPR event: {ErrorMessage}", ex.Message);
                    _logger.LogError("Stack trace: {StackTrace}", ex.StackTrace);
                }

                try
                {
                    _logger.LogDebug("Waiting {Minutes} minutes before next ANPR event...", _interval.TotalMinutes);
                    // Wait for the interval before generating next event
                    await Task.Delay(_interval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    _logger.LogInformation("ANPR Event Generator Service cancellation requested");
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during delay: {ErrorMessage}", ex.Message);
                }
            }

            _logger.LogInformation("ANPR Event Generator Service stopped");
        }
    }
}
