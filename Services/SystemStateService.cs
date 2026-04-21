using Microsoft.AspNetCore.SignalR;
using WeighbridgeMockAPIReplica.Hubs;
using System.Threading.Tasks;

namespace WeighbridgeMockAPIReplica.Services
{
    public class SystemState
    {
        public string EntrySignal { get; set; } = "GREEN";
        public string EntryBarrier { get; set; } = "OPEN";
        public string ExitSignal { get; set; } = "RED";
        public string ExitBarrier { get; set; } = "CLOSED";
        public string CurrentTruckPlate { get; set; } = string.Empty;
        public int CurrentWeight { get; set; } = 0;
        public string Mode { get; set; } = "ANPR";
        public string LedMessage { get; set; } = "READY FOR VEHICLE";
    }

    public class SystemStateService
    {
        private readonly IHubContext<DeviceStatusHub> _hub;
        private readonly object _lock = new();
        private SystemState _state = new SystemState();

        public SystemStateService(IHubContext<DeviceStatusHub> hub)
        {
            _hub = hub;
        }

        public SystemState GetState()
        {
            lock (_lock) { return _state; }
        }

        private Task BroadcastAsync()
        {
            // Broadcast a snapshot named "SystemStateChanged" that the frontend already listens to
            // Also emit explicit change events for signals and barriers to help UI animations
            var tasks = new List<Task>();
            tasks.Add(_hub.Clients.All.SendAsync("SystemStateChanged", _state));
            tasks.Add(_hub.Clients.All.SendAsync("EntrySignalChanged", _state.EntrySignal));
            tasks.Add(_hub.Clients.All.SendAsync("ExitSignalChanged", _state.ExitSignal));
            tasks.Add(_hub.Clients.All.SendAsync("EntryBarrierChanged", _state.EntryBarrier));
            tasks.Add(_hub.Clients.All.SendAsync("ExitBarrierChanged", _state.ExitBarrier));
            // LED message and weight updates can be broadcast as part of the full state snapshot (already included)
            return Task.WhenAll(tasks);
        }

        public void StartVehicleFlow(string plate, int weight)
        {
            // fire-and-forget background flow
            _ = Task.Run(async () =>
            {
                lock (_lock)
                {
                    _state.CurrentTruckPlate = plate;
                    _state.CurrentWeight = 0;
                    _state.EntrySignal = "GREEN";
                    _state.EntryBarrier = "OPEN";
                    _state.ExitSignal = "RED";
                    _state.ExitBarrier = "CLOSED";
                    _state.Mode = "ANPR";
                    _state.LedMessage = "VEHICLE ENTERING";
                }
                await BroadcastAsync(); // BEFORE ARRIVAL

                await Task.Delay(800); // brief pause

                lock (_lock)
                {
                    _state.EntrySignal = "RED";
                    _state.EntryBarrier = "CLOSED";
                    _state.ExitSignal = "RED";
                    _state.LedMessage = "WEIGHING IN PROGRESS";
                }
                await BroadcastAsync(); // DURING WEIGHING

                await Task.Delay(1500); // simulate weighing time

                // simulate measured weight being the provided weight
                var measured = weight;
                var accepted = (measured >= 1000);

                lock (_lock)
                {
                    _state.CurrentWeight = measured;
                }

                // AFTER WEIGHT: keep entry closed, open exit only here
                lock (_lock)
                {
                    _state.EntrySignal = "RED";
                    _state.EntryBarrier = "CLOSED"; // ensure entry stays closed
                    _state.ExitSignal = "GREEN";    // allow exit
                    _state.ExitBarrier = "OPEN";    // open exit barrier only after weighing
                    _state.LedMessage = "WEIGHT MEASURED - PROCEED TO EXIT";
                }
                await BroadcastAsync(); // AFTER WEIGHT (exit opened here)

                await Task.Delay(1200);

                // RESET
                lock (_lock)
                {
                    _state.EntrySignal = "GREEN";
                    _state.EntryBarrier = "OPEN";
                    _state.ExitSignal = "RED";
                    _state.ExitBarrier = "CLOSED";
                    _state.CurrentTruckPlate = string.Empty;
                    _state.CurrentWeight = 0;
                    _state.LedMessage = "READY FOR NEXT VEHICLE";
                }
                await BroadcastAsync();
            });
        }
    }
}
