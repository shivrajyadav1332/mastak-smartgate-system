using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using FullStackSample.Hubs;

namespace FullStackSample.Services
{
    public class DeviceLogEntry
    {
        public string Plate { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty; // ACCEPTED / REJECTED
        public DateTime Timestamp { get; set; }
        public int? Weight { get; set; }
    }

    public class DeviceService
    {
        private readonly IHubContext<VehicleHub> _hub;

        // Configurable demo timings (milliseconds) - can be updated at runtime
        private int _initialReadyMs = 800;
        private int _enteringMs = 3000; // default to 3s to match desired flow
        private int _weighingMs = 2000;
        private int _afterWeightMs = 1200;
        private int _exitMs = 1200;

        // System state
        public string EntrySignal { get; private set; } = "RED";
        public string ExitSignal { get; private set; } = "RED";
        public string EntryBarrier { get; private set; } = "CLOSED";
        public string ExitBarrier { get; private set; } = "CLOSED";
        public string CurrentTruckPlate { get; private set; } = string.Empty;
        public int CurrentWeight { get; private set; } = 0;
        public string Mode { get; private set; } = "ANPR";
        public string LedMessage { get; private set; } = "NO LED MESSAGE";

        // In-memory logs
        private readonly List<DeviceLogEntry> _logs = new List<DeviceLogEntry>();

        // Allow-list (can be replaced/updated at runtime from Excel)
        private readonly HashSet<string> _allowedPlates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private readonly Random _rnd = new Random();
        private readonly object _lock = new object();

        public DeviceService(IHubContext<VehicleHub> hub, ExcelPlateService? excel = null)
        {
            _hub = hub;
            // If an Excel service is provided, try to load a default plates file from disk
            try
            {
                if (excel != null)
                {
                    var defaultPath = Path.Combine(AppContext.BaseDirectory, "MockData", "allowed-plates.xlsx");
                    if (File.Exists(defaultPath))
                    {
                        using var fs = File.OpenRead(defaultPath);
                        var plates = excel.LoadPlatesAsync(fs, defaultPath).GetAwaiter().GetResult();
                        foreach (var p in plates) _allowedPlates.Add(p.Trim());
                    }
                }
            }
            catch
            {
                // ignore
            }
            // Read optional environment variables to override default timings (milliseconds)
            try
            {
                var v = Environment.GetEnvironmentVariable("DEVICE_INITIAL_READY_MS");
                if (int.TryParse(v, out var iv)) _initialReadyMs = iv;
                v = Environment.GetEnvironmentVariable("DEVICE_ENTERING_MS");
                if (int.TryParse(v, out var iv2)) _enteringMs = iv2;
                v = Environment.GetEnvironmentVariable("DEVICE_WEIGHING_MS");
                if (int.TryParse(v, out var iv3)) _weighingMs = iv3;
                v = Environment.GetEnvironmentVariable("DEVICE_AFTERWEIGHT_MS");
                if (int.TryParse(v, out var iv4)) _afterWeightMs = iv4;
                v = Environment.GetEnvironmentVariable("DEVICE_EXIT_MS");
                if (int.TryParse(v, out var iv5)) _exitMs = iv5;
            }
            catch
            {
                // ignore env parse errors
            }
        }

        // Check plate and update state accordingly. Returns "ACCEPTED" or "REJECTED".
        public string CheckPlate(string plate)
        {
            if (string.IsNullOrWhiteSpace(plate)) return "REJECTED";
            var normalized = plate.Trim().ToUpperInvariant();

            var accepted = _allowedPlates.Contains(normalized);

            lock (_lock)
            {
                CurrentTruckPlate = normalized;
                if (accepted)
                {
                    EntrySignal = "GREEN";
                    OpenEntryBarrier();
                }
                else
                {
                    EntrySignal = "RED";
                    CloseEntryBarrier();
                }
            }

            var status = accepted ? "ACCEPTED" : "REJECTED";
            AddLog(new DeviceLogEntry { Plate = normalized, Status = status, Timestamp = DateTime.UtcNow });
            return status;
        }

        public void OpenEntryBarrier()
        {
            lock (_lock)
            {
                EntryBarrier = "OPEN";
            }
            _ = BroadcastStateAsync();
        }

        public void CloseEntryBarrier()
        {
            lock (_lock)
            {
                EntryBarrier = "CLOSED";
            }
            _ = BroadcastStateAsync();
        }

        public void OpenExitBarrier()
        {
            lock (_lock)
            {
                ExitBarrier = "OPEN";
            }
            _ = BroadcastStateAsync();
        }

        public void CloseExitBarrier()
        {
            lock (_lock)
            {
                ExitBarrier = "CLOSED";
            }
            _ = BroadcastStateAsync();
        }

        // Allow externally setting full system state (used by test/preset endpoint)
        public void SetSystemState(string entrySignal, string exitSignal, string entryBarrier, string exitBarrier, string currentTruckPlate, int currentWeight, string mode, string ledMessage)
        {
            lock (_lock)
            {
                if (!string.IsNullOrEmpty(entrySignal)) EntrySignal = entrySignal;
                if (!string.IsNullOrEmpty(exitSignal)) ExitSignal = exitSignal;
                if (!string.IsNullOrEmpty(entryBarrier)) EntryBarrier = entryBarrier;
                if (!string.IsNullOrEmpty(exitBarrier)) ExitBarrier = exitBarrier;
                if (currentTruckPlate != null) CurrentTruckPlate = currentTruckPlate;
                CurrentWeight = currentWeight;
                if (!string.IsNullOrEmpty(mode)) Mode = mode;
                if (!string.IsNullOrEmpty(ledMessage)) LedMessage = ledMessage;
            }
            // Broadcast updated state to SignalR clients
            try
            {
                _ = BroadcastStateAsync();
            }
            catch { }
        }

        private async Task BroadcastStateAsync()
        {
            try
            {
                var state = new
                {
                    entrySignal = EntrySignal,
                    exitSignal = ExitSignal,
                    entryBarrier = EntryBarrier,
                    exitBarrier = ExitBarrier,
                    currentTruckPlate = CurrentTruckPlate,
                    currentWeight = CurrentWeight,
                    mode = Mode,
                    ledMessage = LedMessage
                };

                if (_hub != null)
                {
                    // Log server-side broadcast for debugging
                    Console.WriteLine($"[DeviceService] Broadcasting SystemStateChanged: entry={EntrySignal}, exit={ExitSignal}, entryBarrier={EntryBarrier}, exitBarrier={ExitBarrier}, plate={CurrentTruckPlate}, weight={CurrentWeight}");
                    await _hub.Clients.All.SendAsync("SystemStateChanged", state);
                    // Also emit explicit events for signals and barriers to help UI animation
                    Console.WriteLine($"[DeviceService] Emitting EntrySignalChanged: {EntrySignal}");
                    await _hub.Clients.All.SendAsync("EntrySignalChanged", EntrySignal);
                    Console.WriteLine($"[DeviceService] Emitting ExitSignalChanged: {ExitSignal}");
                    await _hub.Clients.All.SendAsync("ExitSignalChanged", ExitSignal);
                    Console.WriteLine($"[DeviceService] Emitting EntryBarrierChanged: {EntryBarrier}");
                    await _hub.Clients.All.SendAsync("EntryBarrierChanged", EntryBarrier);
                    Console.WriteLine($"[DeviceService] Emitting ExitBarrierChanged: {ExitBarrier}");
                    await _hub.Clients.All.SendAsync("ExitBarrierChanged", ExitBarrier);
                }
            }
            catch
            {
                // ignore broadcast errors in demo
            }
        }

        // Simulate weight in kg between 10,000 and 50,000
        public int GetWeight()
        {
            lock (_lock)
            {
                var w = _rnd.Next(10000, 50001);
                CurrentWeight = w;
                return w;
            }
        }

        public (string EntrySignal, string ExitSignal) GetSignalsStatus()
        {
            lock (_lock)
            {
                return (EntrySignal, ExitSignal);
            }
        }

        public IReadOnlyList<DeviceLogEntry> GetRecentLogs(int max = 20)
        {
            lock (_lock)
            {
                return _logs.OrderByDescending(x => x.Timestamp).Take(max).ToList();
            }
        }

        public void AddLog(DeviceLogEntry entry)
        {
            lock (_lock)
            {
                _logs.Add(entry);
            }
        }

        // New simplified processing API requested by user
        private static List<object> simpleLogs = new List<object>();

        public object ProcessVehicle(string plate)
        {
            if (string.IsNullOrWhiteSpace(plate)) plate = string.Empty;
            var normalized = plate.Trim().ToUpperInvariant();
            bool isAccepted;
            lock (_lock)
            {
                // If there is no allow-list configured, accept all plates for demo purposes.
                isAccepted = _allowedPlates.Count == 0 || _allowedPlates.Contains(normalized);
            }

            // Immediate result returned to caller: provide quick acceptance status and initial state snapshot
            var initial = new
            {
                entrySignal = "GREEN",
                exitSignal = "RED",
                entryBarrier = "OPEN",
                exitBarrier = "CLOSED",
                currentTruckPlate = string.Empty,
                currentWeight = 0,
                mode = "ANPR",
                ledMessage = "READY FOR VEHICLE"
            };

            lock (_lock)
            {
                simpleLogs.Add(initial);
            }

            // Broadcast initial READY state so clients see INITIAL immediately
            _ = BroadcastStateAsync();

            var status = isAccepted ? "ACCEPTED" : "REJECTED";
            // Return an immediate, small payload the API consumer expects
            var immediate = new
            {
                status = status,
                weight = 0,
                state = initial
            };

            // Run full demo sequence in background so UI polling can observe state changes
            Task.Run(async () =>
            {
                try
                {
                    // 1) READY state before truck arrives
                    lock (_lock)
                    {
                        EntrySignal = "GREEN";
                        ExitSignal = "RED";
                        EntryBarrier = "OPEN";
                        ExitBarrier = "CLOSED";
                        CurrentTruckPlate = string.Empty;
                        CurrentWeight = 0;
                        LedMessage = "READY FOR VEHICLE";
                    }

                    Console.WriteLine($"[ProcessVehicle] initial READY delay {_initialReadyMs}ms for plate={normalized}");
                    await Task.Delay(_initialReadyMs);

                    Console.WriteLine($"[ProcessVehicle] isAccepted={isAccepted} for plate={normalized}");
                    if (!isAccepted)
                    {
                        // Rejected quickly: ensure closed
                        lock (_lock)
                        {
                            EntrySignal = "RED";
                            EntryBarrier = "CLOSED";
                            LedMessage = "VEHICLE REJECTED";
                        }
                        AddLog(new DeviceLogEntry { Plate = normalized, Status = "REJECTED", Timestamp = DateTime.UtcNow });
                        Console.WriteLine($"[ProcessVehicle] Rejected plate={normalized}");
                        return;
                    }

                    // 2) TRUCK ENTERING
                    // 2) TRUCK ENTERING
                    lock (_lock)
                    {
                        CurrentTruckPlate = normalized;
                        EntrySignal = "GREEN";
                        EntryBarrier = "OPEN";
                        ExitSignal = "RED";
                        ExitBarrier = "CLOSED";
                        LedMessage = "VEHICLE ENTERING";
                    }
                    Console.WriteLine($"[ProcessVehicle] TRUCK ENTERING plate={normalized}");
                    _ = BroadcastStateAsync();
                    await Task.Delay(_enteringMs); // wait for truck to position on scale (3s)

                    // 3) WEIGHING PROCESS
                    lock (_lock)
                    {
                        EntrySignal = "RED";
                        ExitSignal = "RED";
                        EntryBarrier = "CLOSED";
                        ExitBarrier = "CLOSED";
                        LedMessage = "WEIGHING STARTED";
                    }
                    Console.WriteLine($"[ProcessVehicle] WEIGHING STARTED for plate={normalized}");
                    _ = BroadcastStateAsync();

                    // simulate weighing duration and assign deterministic demo weight
                    await Task.Delay(_weighingMs);
                    int measured;
                    lock (_lock)
                    {
                        measured = 28500; // deterministic demo value per requested flow
                        CurrentWeight = measured;
                    }
                    AddLog(new DeviceLogEntry { Plate = normalized, Status = "WEIGHED", Timestamp = DateTime.UtcNow, Weight = measured });
                    Console.WriteLine($"[ProcessVehicle] WEIGHT CALCULATED plate={normalized} weight={measured}");

                    // 4) AFTER WEIGHT CALCULATION: keep entry closed, open exit here
                    lock (_lock)
                    {
                        // ensure entry remains closed and open exit immediately after weight calculation
                        EntrySignal = "RED";
                        EntryBarrier = "CLOSED";
                        ExitSignal = "GREEN";    // allow exit now
                        ExitBarrier = "OPEN";    // open exit barrier only after weighing
                        LedMessage = "WEIGHT MEASURED - PROCEED TO EXIT";
                        CurrentWeight = measured;
                    }
                    Console.WriteLine($"[ProcessVehicle] AFTER WEIGHT - exit opened for plate={normalized} weight={measured}");
                    _ = BroadcastStateAsync();

                    // wait for truck to move to exit and clear the scale
                    await Task.Delay(_afterWeightMs + _exitMs);

                    // 6) AFTER TRUCK EXIT - close exit and reset system
                    lock (_lock)
                    {
                        ExitBarrier = "CLOSED";
                        ExitSignal = "RED";
                        EntrySignal = "GREEN";
                        EntryBarrier = "OPEN";
                        CurrentTruckPlate = string.Empty;
                        CurrentWeight = 0;
                        LedMessage = "READY FOR NEXT VEHICLE";
                    }

                    Console.WriteLine($"[ProcessVehicle] RESET after exit plate={normalized}");
                    _ = BroadcastStateAsync();

                    AddLog(new DeviceLogEntry { Plate = normalized, Status = "PROCESSED", Timestamp = DateTime.UtcNow, Weight = measured });
                }
                catch
                {
                    // swallow background errors to avoid crashing host
                }
            });

            return initial;
        }

        public List<object> GetLogs()
        {
            lock (_lock)
            {
                return simpleLogs.ToList();
            }
        }

        // Replace the in-memory allowed-plates with a new set (used when uploading Excel/CSV)
        public void ReplaceAllowedPlates(IEnumerable<string> plates)
        {
            lock (_lock)
            {
                _allowedPlates.Clear();
                foreach (var p in plates)
                {
                    if (string.IsNullOrWhiteSpace(p)) continue;
                    _allowedPlates.Add(p.Trim());
                }
            }
            _ = BroadcastStateAsync();
        }

        // Expose current allowed plates (readonly snapshot)
        public IEnumerable<string> GetAllowedPlates()
        {
            lock (_lock)
            {
                return _allowedPlates.ToList();
            }
        }

        // Expose current timing configuration
        public object GetTimings()
        {
            lock (_lock)
            {
                return new
                {
                    initialReadyMs = _initialReadyMs,
                    enteringMs = _enteringMs,
                    weighingMs = _weighingMs,
                    afterWeightMs = _afterWeightMs,
                    exitMs = _exitMs
                };
            }
        }

        // Update timings (milliseconds). Nulls mean 'no change'.
        public void UpdateTimings(int? initialReadyMs, int? enteringMs, int? weighingMs, int? afterWeightMs, int? exitMs)
        {
            lock (_lock)
            {
                if (initialReadyMs.HasValue) _initialReadyMs = Math.Max(0, initialReadyMs.Value);
                if (enteringMs.HasValue) _enteringMs = Math.Max(0, enteringMs.Value);
                if (weighingMs.HasValue) _weighingMs = Math.Max(0, weighingMs.Value);
                if (afterWeightMs.HasValue) _afterWeightMs = Math.Max(0, afterWeightMs.Value);
                if (exitMs.HasValue) _exitMs = Math.Max(0, exitMs.Value);
            }
            // Broadcast that timings changed so clients (if interested) can react
            _ = BroadcastStateAsync();
        }
    }
}
