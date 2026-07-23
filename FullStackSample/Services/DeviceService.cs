using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.IO;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using FullStackSample.Hubs;
using Microsoft.Extensions.DependencyInjection;
using FullStackSample.Data;
using FullStackSample.Models;

namespace FullStackSample.Services
{
    public class DeviceLogEntry
    {
        public string Plate { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty; // ACCEPTED / REJECTED
        public DateTime Timestamp { get; set; }
        public int? Weight { get; set; }
    }

    // Models for optional payload-driven exit sequence (production schema)
    public class ExitSequenceConfig
    {
        public string? Trigger { get; set; }
        public string? Stage { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("exit_sequence")]
        public List<ExitAction>? ExitSequence { get; set; }
    }

    public class ExitAction
    {
        public int Step { get; set; }
        public string Action { get; set; } = string.Empty;
        public string? Expected { get; set; }
        public string? Signal { get; set; }
        public string? Value { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("delay_ms")]
        public int? DelayMs { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("timeout_ms")]
        public int? TimeoutMs { get; set; }
        public string? Next { get; set; }
    }

    public class DeviceService
    {
        // Current active weighment info (simplified single active weighment model)
        private WeighmentStatus? _currentWeighment = null;
        // Current high-level stage for the demo flow: ENTRY, WEIGHING, WEIGH_COMPLETE, EXIT, IDLE
        public string Stage { get; set; } = "IDLE";
        private readonly IHubContext<VehicleHub> _hub;

        // Configurable demo timings (milliseconds) - can be updated at runtime
        private int _initialReadyMs = 800;
        private int _enteringMs = 3000; // default to 3s to match desired flow
        private int _weighingMs = 2000;
        private int _afterWeightMs = 1200;
        private int _exitMs = 1200;

        // System state
        public string EntrySignal { get; set; } = "RED";
        public string ExitSignal { get; set; } = "RED";
        public string EntryBarrier { get; set; } = "CLOSED";
        public string ExitBarrier { get; set; } = "CLOSED";
        // Position sensor: true when a vehicle is on the scale
        public bool OnScale { get; set; } = false;
        public string CurrentTruckPlate { get; set; } = string.Empty;
        public int CurrentWeight { get; set; } = 0;
        public string Mode { get; set; } = "ANPR";
        public string LedMessage { get; set; } = "NO LED MESSAGE";

        // New fields for SCADA Dashboard database integration
        public string CurrentDriverName { get; set; } = string.Empty;
        public string CurrentCustomerName { get; set; } = string.Empty;
        public string CurrentMaterialName { get; set; } = string.Empty;
        public string CurrentDestination { get; set; } = string.Empty;
        public string CurrentPurchaseOrder { get; set; } = string.Empty;
        public double GrossWeight { get; set; } = 0;
        public double TareWeight { get; set; } = 0;
        public double NetWeight { get; set; } = 0;
        public string TransactionNumber { get; set; } = string.Empty;
        public string ApprovalStatus { get; set; } = "PENDING";
        public string CurrentProcessStep { get; set; } = "Idle";
        public string SystemStatus { get; set; } = "System Online";
        public string OperatorMessage { get; set; } = string.Empty;
        public string LiveCameraImage { get; set; } = string.Empty;
        public string AnprCameraStatus { get; set; } = "Ready";
        
        // Exit barrier auto-close (milliseconds) and cancellation token for scheduled close
        private int _exitAutoCloseMs = 30000;
        private CancellationTokenSource? _exitAutoCloseCts = null;
        // Optional payload-driven exit sequence loaded from JSON
        private ExitSequenceConfig? _exitSequenceConfig;
        // Vehicle-passed signaling for wait_for_vehicle_pass
        private TaskCompletionSource<bool>? _vehiclePassedTcs = null;
        private bool _exitSequenceRunning = false;
        private bool _exitClearanceGranted = false;

        // In-memory logs
        private readonly List<DeviceLogEntry> _logs = new List<DeviceLogEntry>();

        // Allow-list (can be replaced/updated at runtime from Excel)
        private readonly HashSet<string> _allowedPlates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        private readonly Random _rnd = new Random();
        private readonly object _lock = new object();

        // Weighment status model used for barrier-status API
        private class WeighmentStatus
        {
            public string WeighmentId { get; set; } = string.Empty;
            public string TruckNo { get; set; } = string.Empty;
            public string VehicleStatus { get; set; } = string.Empty; // WEIGH_COMPLETED, EXIT_COMPLETED
            public double WeightKg { get; set; }
            public string EntryBarrierStatus { get; set; } = "CLOSED";
            public string ExitBarrierStatus { get; set; } = "CLOSED";
            public bool AutoCloseEnabled { get; set; } = false;
            public int AutoCloseAfterSeconds { get; set; } = 0;
            public DateTime? OpenedAt { get; set; }
            public DateTime? WillCloseAt { get; set; }
            public DateTime? ClosedAt { get; set; }
            public object BackendProcess { get; set; } = new { step = string.Empty, nextAction = string.Empty, message = string.Empty };
        }

        private readonly IServiceProvider _serviceProvider;

        public DeviceService(IHubContext<VehicleHub> hub, IServiceProvider serviceProvider, ExcelPlateService? excel = null)
        {
            _hub = hub;
            _serviceProvider = serviceProvider;
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

            // Attempt to load payload_exit_sequence.json from common locations
            try
            {
                _exitSequenceConfig = TryLoadExitSequence();
                if (_exitSequenceConfig != null)
                {
                    Console.WriteLine($"[DeviceService] Loaded exit sequence config stage={_exitSequenceConfig.Stage} steps={_exitSequenceConfig.ExitSequence?.Count ?? 0}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DeviceService] Failed to load payload_exit_sequence.json: {ex.Message}");
            }
        }

        // Try to locate and parse payload_exit_sequence.json from common run-time locations
        private ExitSequenceConfig? TryLoadExitSequence()
        {
            try
            {
                // Search upward from both AppContext.BaseDirectory and CurrentDirectory
                var roots = new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() };
                foreach (var root in roots)
                {
                    try
                    {
                        var dir = new DirectoryInfo(root);
                        for (int i = 0; i < 6 && dir != null; i++)
                        {
                            var candidate = Path.Combine(dir.FullName, "payload_exit_sequence.json");
                            if (File.Exists(candidate))
                            {
                                var txt = File.ReadAllText(candidate);
                                var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                                var seq = JsonSerializer.Deserialize<ExitSequenceConfig>(txt, opts);
                                if (seq != null) return seq;
                            }
                            dir = dir.Parent;
                        }
                    }
                    catch { }
                }
            }
            catch { }
            return null;
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

        public async Task BeginEntryProcessAsync()
        {
            try { _exitAutoCloseCts?.Cancel(); _exitAutoCloseCts = null; } catch { }
            lock (_lock)
            {
                _exitClearanceGranted = false;
                Stage = "ENTRY";
                EntrySignal = "RED";
                EntryBarrier = "CLOSED";
                ExitSignal = "RED";
                ExitBarrier = "CLOSED";
            }
            await BroadcastStateAsync();
            await _hub.Clients.All.SendAsync("TruckEntryChanged", new { stage = Stage, plateNumber = CurrentTruckPlate, onScale = OnScale });
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
                // Exit may only open from the completed OUT workflow, and never while truck is on scale.
                if (!string.Equals(Stage, "EXIT", StringComparison.OrdinalIgnoreCase) ||
                    !_exitClearanceGranted || OnScale)
                {
                    ExitBarrier = "CLOSED";
                    ExitSignal = "RED";
                    return;
                }
                ExitBarrier = "OPEN";
                ExitSignal = "GREEN";
            }
            _ = BroadcastStateAsync();

            // schedule auto-close using configured delay
            try
            {
                // cancel previous auto-close if present
                _exitAutoCloseCts?.Cancel();
                _exitAutoCloseCts = new CancellationTokenSource();
                var ct = _exitAutoCloseCts.Token;
                var delay = Math.Max(0, _exitAutoCloseMs);
                // fire-and-forget task to close barrier after delay
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await Task.Delay(delay, ct);
                        if (ct.IsCancellationRequested) return;
                        // close and broadcast
                        lock (_lock)
                        {
                            ExitBarrier = "CLOSED";
                            ExitSignal = "RED";
                        }
                        await BroadcastStateAsync();
                    }
                    catch (TaskCanceledException) { }
                    catch (Exception ex) { Console.WriteLine($"[DeviceService] exit auto-close task failed: {ex}"); }
                });
            }
            catch (Exception) { }
        }

        private async Task OpenExitBarrierForSequenceAsync()
        {
            try { _exitAutoCloseCts?.Cancel(); _exitAutoCloseCts = null; } catch { }
            lock (_lock)
            {
                // Only allow sequence-driven open after the active transaction has been
                // persisted and its caller has explicitly granted exit clearance, and never while on scale.
                if (!string.Equals(Stage, "EXIT", StringComparison.OrdinalIgnoreCase) ||
                    !_exitClearanceGranted || OnScale)
                {
                    ExitBarrier = "CLOSED";
                    ExitSignal = "RED";
                    return;
                }
                ExitBarrier = "OPEN";
                ExitSignal = "GREEN";
                if (_currentWeighment != null)
                {
                    _currentWeighment.ExitBarrierStatus = "OPEN";
                    _currentWeighment.OpenedAt = DateTime.UtcNow;
                    _currentWeighment.ClosedAt = null;
                    _currentWeighment.BackendProcess = new { step = "EXIT_BARRIER_OPENED", nextAction = "WAIT_FOR_VEHICLE_PASS", message = "Exit barrier opened after weighment completion." };
                }
            }
            await BroadcastStateAsync();
            await _hub.Clients.All.SendAsync("ExitBarrierOpened");
        }

        private async Task CloseExitBarrierForSequenceAsync()
        {
            try { _exitAutoCloseCts?.Cancel(); _exitAutoCloseCts = null; } catch { }
            lock (_lock)
            {
                ExitBarrier = "CLOSED";
                ExitSignal = "RED";
                if (_currentWeighment != null)
                {
                    _currentWeighment.ExitBarrierStatus = "CLOSED";
                    _currentWeighment.ClosedAt = DateTime.UtcNow;
                    _currentWeighment.VehicleStatus = "EXIT_COMPLETED";
                    _currentWeighment.BackendProcess = new { step = "EXIT_BARRIER_CLOSED", nextAction = "RESET_STATE", message = "Exit barrier closed after vehicle passed or timeout elapsed." };
                }
            }
            await BroadcastStateAsync();
            await _hub.Clients.All.SendAsync("ExitBarrierClosed");
        }

        // Open exit barrier for a specific delay (ms). This does not change the
        // configured _exitAutoCloseMs and schedules a one-off auto-close using the
        // provided delay. Useful for flows that require a specific short delay.
        public void OpenExitForDelay(int delayMs)
        {
            var delay = Math.Max(0, delayMs);

            lock (_lock)
            {
                if (!string.Equals(Stage, "EXIT", StringComparison.OrdinalIgnoreCase) ||
                    !_exitClearanceGranted || OnScale)
                {
                    ExitBarrier = "CLOSED";
                    ExitSignal = "RED";
                    return;
                }
                ExitBarrier = "OPEN";
                ExitSignal = "GREEN";
            }
            _ = BroadcastStateAsync();

            // Emit explicit EXIT_OPEN event for clients that prefer event messages
            try
            {
                if (_hub != null)
                {
                    var evOpen = new { @event = "EXIT_OPEN", barrier = "OPEN", signal = "GREEN" };
                    Console.WriteLine("[DeviceService] Emitting DeviceEvent: EXIT_OPEN");
                    _ = _hub.Clients.All.SendAsync("DeviceEvent", evOpen);
                }
            }
            catch { }

            try
            {
                _exitAutoCloseCts?.Cancel();
                _exitAutoCloseCts = new CancellationTokenSource();
                var ct = _exitAutoCloseCts.Token;

                _ = Task.Run(async () =>
                {
                    try
                    {
                        await Task.Delay(delay, ct);
                        if (ct.IsCancellationRequested) return;

                        lock (_lock)
                        {
                            ExitBarrier = "CLOSED";
                            ExitSignal = "RED";
                            // update weighment status if present
                            if (_currentWeighment != null)
                            {
                                _currentWeighment.ExitBarrierStatus = "CLOSED";
                                _currentWeighment.ClosedAt = DateTime.UtcNow;
                                _currentWeighment.VehicleStatus = "EXIT_COMPLETED";
                                _currentWeighment.BackendProcess = new { step = "EXIT_BARRIER_CLOSED", nextAction = "NONE", message = "Exit barrier closed automatically after weighment completion." };
                            }
                        }
                        await BroadcastStateAsync();

                        // Emit explicit EXIT_CLOSE event so clients can transition UI reliably
                        try
                        {
                            if (_hub != null)
                            {
                                var evClose = new { @event = "EXIT_CLOSE", barrier = "CLOSED", signal = "RED" };
                                Console.WriteLine("[DeviceService] Emitting DeviceEvent: EXIT_CLOSE");
                                await _hub.Clients.All.SendAsync("DeviceEvent", evClose);
                            }
                        }
                        catch { }
                    }
                    catch (TaskCanceledException) { }
                    catch (Exception ex) { Console.WriteLine($"[DeviceService] OpenExitForDelay task failed: {ex}"); }
                });
            }
            catch { }
        }

        public void CloseExitBarrier()
        {
            // cancel any scheduled auto-close when manually closing
            try { _exitAutoCloseCts?.Cancel(); _exitAutoCloseCts = null; } catch { }
            lock (_lock)
            {
                ExitBarrier = "CLOSED";
                if (_currentWeighment != null)
                {
                    _currentWeighment.ExitBarrierStatus = "CLOSED";
                    _currentWeighment.ClosedAt = DateTime.UtcNow;
                    _currentWeighment.VehicleStatus = "EXIT_COMPLETED";
                    _currentWeighment.BackendProcess = new { step = "EXIT_BARRIER_CLOSED", nextAction = "NONE", message = "Exit barrier closed." };
                }
            }
            _ = BroadcastStateAsync();
        }

        // Public API for external systems (e.g., UI) to notify that vehicle has passed the exit sensor
        public void NotifyVehiclePassed()
        {
            lock (_lock)
            {
                OnScale = false; // vehicle left the scale/exit sensor
                CurrentProcessStep = "Truck exited weighbridge. Closing exit barrier...";
            }
            try
            {
                _vehiclePassedTcs?.TrySetResult(true);
            }
            catch { }
            _ = BroadcastStateAsync();
        }

        // API: complete weighment by id — opens exit barrier and schedules auto-close
        public void CompleteWeighment(string weighmentId, double weightKg, int autoCloseSeconds, bool exitClearanceConfirmed = false)
        {
            if (string.IsNullOrEmpty(weighmentId)) return;
            lock (_lock)
            {
                _exitClearanceGranted = exitClearanceConfirmed;
                if (!_exitClearanceGranted)
                {
                    ExitBarrier = "CLOSED";
                    ExitSignal = "RED";
                    _ = BroadcastStateAsync();
                    return;
                }

                // Set current weighment tracking
                _currentWeighment = new WeighmentStatus
                {
                    WeighmentId = weighmentId,
                    TruckNo = weighmentId,
                    VehicleStatus = "WEIGH_COMPLETED",
                    WeightKg = weightKg,
                    EntryBarrierStatus = EntryBarrier,
                    ExitBarrierStatus = "CLOSED",
                    AutoCloseEnabled = true,
                    AutoCloseAfterSeconds = Math.Max(0, autoCloseSeconds),
                    BackendProcess = new { step = "WEIGH_COMPLETE", nextAction = "RUN_EXIT_SEQUENCE", message = "Weighment completed. Exit sequence will validate stage, open exit, wait for vehicle pass, then close." }
                };

                // update internal auto-close config for this scheduled close
                _exitAutoCloseMs = Math.Max(0, autoCloseSeconds * 1000);
                Stage = "WEIGH_COMPLETED";
                LedMessage = "WEIGH COMPLETE - EXIT READY";
            }

            // Make the exit barrier visibly open immediately at EXIT stage,
            // even if the JSON-driven sequence later fails/aborts.
            _ = Task.Run(async () =>
            {
                try
                {
                    await RunConfiguredExitSequenceAsync();
                }
                catch { }
            });
        }

        // API: returns current barrier status for a weighment id (or current if null)
        public object GetBarrierStatus(string weighmentId)
        {
            lock (_lock)
            {
                var now = DateTime.UtcNow;
                if (_currentWeighment == null || (_currentWeighment != null && !string.Equals(_currentWeighment.WeighmentId, weighmentId, StringComparison.OrdinalIgnoreCase)))
                {
                    // return minimal default if no matching weighment
                    return new
                    {
                        weighmentId = weighmentId,
                        vehicleStatus = "UNKNOWN",
                        exitBarrierStatus = ExitBarrier,
                        autoCloseAfterSeconds = _exitAutoCloseMs / 1000,
                        remainingSeconds = 0
                    };
                }

                var ws = _currentWeighment!;
                var remaining = 0;
                if (ws.WillCloseAt.HasValue)
                {
                    remaining = Math.Max(0, (int)Math.Ceiling((ws.WillCloseAt.Value - now).TotalSeconds));
                }

                return new
                {
                    weighmentId = ws.WeighmentId,
                    truckNo = ws.TruckNo,
                    vehicleStatus = ws.VehicleStatus,
                    weightKg = ws.WeightKg,
                    entryBarrier = new { status = ws.EntryBarrierStatus },
                    exitBarrier = new
                    {
                        status = ws.ExitBarrierStatus,
                        autoCloseEnabled = ws.AutoCloseEnabled,
                        autoCloseAfterSeconds = ws.AutoCloseAfterSeconds,
                        openedAt = ws.OpenedAt?.ToString("o"),
                        willCloseAt = ws.WillCloseAt?.ToString("o"),
                        closedAt = ws.ClosedAt?.ToString("o")
                    },
                    backendProcess = ws.BackendProcess,
                    remainingSeconds = remaining
                };
            }
        }

        // Wait for vehicle-passed signal or timeout (returns true if signaled)
        private async Task<bool> WaitForVehicleExitAsync(int timeoutMs)
        {
            var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            var startedAt = DateTime.UtcNow;
            var timeout = Math.Max(0, timeoutMs);
            lock (_lock)
            {
                // replace any existing TCS for this run
                _vehiclePassedTcs = tcs;
                if (_currentWeighment != null)
                {
                    _currentWeighment.WillCloseAt = startedAt.AddMilliseconds(timeout);
                    _currentWeighment.BackendProcess = new { step = "WAIT_FOR_VEHICLE_PASS", nextAction = "CLOSE_EXIT_BARRIER", message = "Waiting for exit sensor/ANPR pass notification before closing barrier." };
                }
            }

            try
            {
                while (timeout == 0 || DateTime.UtcNow - startedAt < TimeSpan.FromMilliseconds(timeout))
                {
                    var remaining = timeout == 0 ? 0 : Math.Max(0, (int)Math.Ceiling((startedAt.AddMilliseconds(timeout) - DateTime.UtcNow).TotalSeconds));
                    await _hub.Clients.All.SendAsync("ExitAutoCloseTimerChanged", remaining);
                    var completed = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(1)));
                    if (completed == tcs.Task) return true;
                }

                await _hub.Clients.All.SendAsync("ExitAutoCloseTimerChanged", 0);
                return false;
            }
            finally
            {
                lock (_lock)
                {
                    if (_vehiclePassedTcs == tcs) _vehiclePassedTcs = null;
                }
            }
        }

        private void SetSignal(string? signalName, string? value)
        {
            if (string.IsNullOrEmpty(signalName) || string.IsNullOrEmpty(value)) return;
            lock (_lock)
            {
                if (string.Equals(signalName, "exit", StringComparison.OrdinalIgnoreCase))
                    ExitSignal = string.Equals(value, "GREEN", StringComparison.OrdinalIgnoreCase) && !_exitClearanceGranted
                        ? "RED"
                        : value.ToUpperInvariant();
                else if (string.Equals(signalName, "entry", StringComparison.OrdinalIgnoreCase))
                    EntrySignal = value.ToUpperInvariant();
            }
            _ = BroadcastStateAsync();
        }

        public Task RunConfiguredExitSequenceAsync()
        {
            var config = _exitSequenceConfig ?? TryLoadExitSequence();
            if (config == null) return Task.CompletedTask;
            return RunExitSequenceAsync(config);
        }

        // Execute the supplied JSON-driven exit sequence
        private async Task RunExitSequenceAsync(ExitSequenceConfig config)
        {
            if (config == null || config.ExitSequence == null) return;

            lock (_lock)
            {
                if (_exitSequenceRunning)
                {
                    Console.WriteLine("[RunExitSequence] duplicate trigger ignored while exit sequence is already running");
                    return;
                }
                _exitSequenceRunning = true;
            }

            try
            {
                // If the config specifies a target stage (e.g. "exit"), set it now
                if (!string.IsNullOrEmpty(config.Stage))
                {
                    lock (_lock)
                    {
                        Stage = config.Stage.ToUpperInvariant();
                    }
                    await BroadcastStateAsync();
                }

                foreach (var step in config.ExitSequence.OrderBy(s => s.Step))
                {
                    try
                    {
                        switch ((step.Action ?? string.Empty).ToLowerInvariant())
                        {
                        case "validate_stage":
                            if (!string.Equals(Stage, step.Expected ?? string.Empty, StringComparison.OrdinalIgnoreCase))
                            {
                                Console.WriteLine("[RunExitSequence] validate_stage failed — aborting sequence");
                                return;
                            }
                            break;

                        case "set_signal":
                            SetSignal(step.Signal, step.Value);
                            break;

                        case "open_exit_barrier":
                            if (step.DelayMs.HasValue && step.DelayMs.Value > 0) await Task.Delay(step.DelayMs.Value);
                            // Enforce rule: wait until truck leaves scale before opening!
                            while (OnScale)
                            {
                                Console.WriteLine("[RunExitSequence] Truck is still on scale. Waiting for it to leave scale before opening exit barrier...");
                                await Task.Delay(500);
                            }
                            await OpenExitBarrierForSequenceAsync();
                            break;

                        case "wait_for_vehicle_pass":
                            var timeout = step.TimeoutMs ?? 15000;
                            Console.WriteLine($"[RunExitSequence] waiting for vehicle pass up to {timeout}ms");
                            var passed = await WaitForVehicleExitAsync(timeout);
                            Console.WriteLine($"[RunExitSequence] wait_for_vehicle_pass result: {passed}");
                            break;

                        case "close_exit_barrier":
                            if (step.DelayMs.HasValue && step.DelayMs.Value > 0) await Task.Delay(step.DelayMs.Value);
                            await CloseExitBarrierForSequenceAsync();
                            break;

                        case "reset_state":
                            lock (_lock)
                            {
                                _exitClearanceGranted = false;
                                Stage = (step.Next ?? "IDLE").ToUpperInvariant();
                                OnScale = false;
                                EntrySignal = "RED";
                                EntryBarrier = "CLOSED";
                                ExitSignal = "RED";
                                ExitBarrier = "CLOSED";
                                CurrentTruckPlate = string.Empty;
                                CurrentWeight = 0;
                                LedMessage = "READY FOR NEXT VEHICLE";
                                CurrentProcessStep = "Idle";
                                OperatorMessage = "Idle";
                                SystemStatus = "System Online";
                            }
                            await _hub.Clients.All.SendAsync("ExitAutoCloseTimerChanged", 0);
                            await BroadcastStateAsync();
                            break;

                        default:
                            Console.WriteLine($"[RunExitSequence] unknown action '{step.Action}' — skipping");
                            break;
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[RunExitSequence] step {step.Step} failed: {ex.Message}");
                    }
                }
            }
            finally
            {
                lock (_lock)
                {
                    _exitSequenceRunning = false;
                }
            }
        }

        // Get/Set exit auto-close delay (ms)
        public int GetExitAutoCloseMs()
        {
            lock (_lock) { return _exitAutoCloseMs; }
        }

        public void SetExitAutoCloseMs(int ms)
        {
            lock (_lock)
            {
                _exitAutoCloseMs = Math.Max(0, ms);
            }
            // broadcast config change so clients can sync if needed
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

        public Task TriggerBroadcastAsync() => BroadcastStateAsync();

        private async Task BroadcastStateAsync()
        {
            try
            {
                // Map internal stage to a short event name for clients
                string? evt = Stage switch
                {
                    "IDLE" => "READY",
                    "ENTRY" => "VEHICLE_ENTRY",
                    "WEIGHING" => "WEIGHING",
                    "WEIGHT_CALCULATED" => "WEIGH_COMPLETE",
                    "AFTER_WEIGHT" => "EXIT_OPEN",
                    "EXIT_IN_PROGRESS" => "EXIT_IN_PROGRESS",
                    _ => null
                };

                var state = new
                {
                    eventName = evt,
                    entrySignal = EntrySignal,
                    exitSignal = ExitSignal,
                    entryBarrier = EntryBarrier,
                    exitBarrier = ExitBarrier,
                    onScale = OnScale,
                    stage = Stage,
                    currentTruckPlate = CurrentTruckPlate,
                    currentWeight = CurrentWeight,
                    mode = Mode,
                    ledMessage = LedMessage,

                    // SCADA database properties
                    currentDriverName = CurrentDriverName,
                    currentCustomerName = CurrentCustomerName,
                    currentMaterialName = CurrentMaterialName,
                    currentDestination = CurrentDestination,
                    currentPurchaseOrder = CurrentPurchaseOrder,
                    grossWeight = GrossWeight,
                    tareWeight = TareWeight,
                    netWeight = NetWeight,
                    transactionNumber = TransactionNumber,
                    approvalStatus = ApprovalStatus,
                    currentProcessStep = CurrentProcessStep,
                    operatorMessage = string.IsNullOrEmpty(OperatorMessage) ? CurrentProcessStep : OperatorMessage,
                    systemStatus = SystemStatus,
                    liveCameraImage = LiveCameraImage,
                    anprCameraStatus = AnprCameraStatus
                };

                if (_hub != null)
                {
                    // Log server-side broadcast for debugging
                    Console.WriteLine($"[DeviceService] Broadcasting ReceiveSystemStatus: entry={EntrySignal}, exit={ExitSignal}, entryBarrier={EntryBarrier}, exitBarrier={ExitBarrier}, plate={CurrentTruckPlate}, weight={CurrentWeight}");
                    // Send canonical system state payload expected by clients
                    await _hub.Clients.All.SendAsync("ReceiveSystemStatus", state);
                    // Also emit explicit events for signals and barriers to help UI animation (kept for compatibility)
                    Console.WriteLine($"[DeviceService] Emitting EntrySignalChanged: {EntrySignal}");
                    await _hub.Clients.All.SendAsync("EntrySignalChanged", EntrySignal);
                    Console.WriteLine($"[DeviceService] Emitting ExitSignalChanged: {ExitSignal}");
                    await _hub.Clients.All.SendAsync("ExitSignalChanged", ExitSignal);
                    Console.WriteLine($"[DeviceService] Emitting EntryBarrierChanged: {EntryBarrier}");
                    await _hub.Clients.All.SendAsync("EntryBarrierChanged", EntryBarrier);
                    Console.WriteLine($"[DeviceService] Emitting ExitBarrierChanged: {ExitBarrier}");
                    await _hub.Clients.All.SendAsync("ExitBarrierChanged", ExitBarrier);
                    // Also emit position sensor changes so UI can react
                    Console.WriteLine($"[DeviceService] Emitting OnScaleChanged: {OnScale}");
                    await _hub.Clients.All.SendAsync("OnScaleChanged", OnScale);
                    await _hub.Clients.All.SendAsync("WeightChanged", new { current = CurrentWeight, gross = GrossWeight, tare = TareWeight, net = NetWeight });
                    await _hub.Clients.All.SendAsync("CameraStatusChanged", new { status = AnprCameraStatus, image = LiveCameraImage });
                    await _hub.Clients.All.SendAsync("TransactionStatusChanged", new { transactionNumber = TransactionNumber, approvalStatus = ApprovalStatus, processStep = CurrentProcessStep, systemStatus = SystemStatus });

                    // Emit a concise event message for stage changes so clients can react reliably
                    if (!string.IsNullOrEmpty(evt))
                    {
                        var ev = new { @event = evt, entryBarrier = EntryBarrier, exitBarrier = ExitBarrier, entrySignal = EntrySignal, exitSignal = ExitSignal };
                        Console.WriteLine($"[DeviceService] Emitting DeviceEvent: {evt}");
                        await _hub.Clients.All.SendAsync("DeviceEvent", ev);
                    }
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
                        if (isAccepted)
                        {
                            EntrySignal = "GREEN";
                            EntryBarrier = "OPEN";
                            LedMessage = "READY FOR VEHICLE";
                        }
                        else
                        {
                            EntrySignal = "RED";
                            EntryBarrier = "CLOSED";
                            LedMessage = "INVALID VEHICLE - ENTRY DENIED";
                        }
                        ExitSignal = "RED";
                        ExitBarrier = "CLOSED";
                        CurrentTruckPlate = string.Empty;
                        CurrentWeight = 0;
                    }

                    Console.WriteLine($"[ProcessVehicle] initial READY delay {_initialReadyMs}ms for plate={normalized}");
                    await Task.Delay(_initialReadyMs);

                    Console.WriteLine($"[ProcessVehicle] isAccepted={isAccepted} for plate={normalized}");
                    if (!isAccepted)
                    {
                        // Rejected: ensure closed, update statuses, broadcast and delay
                        lock (_lock)
                        {
                            Stage = "INVALID";
                            EntrySignal = "RED";
                            EntryBarrier = "CLOSED";
                            ExitSignal = "RED";
                            ExitBarrier = "CLOSED";
                            CurrentTruckPlate = normalized;
                            CurrentDriverName = "Unknown";
                            CurrentCustomerName = "Unknown";
                            CurrentMaterialName = "Unknown";
                            CurrentDestination = "None";
                            CurrentPurchaseOrder = "None";
                            LiveCameraImage = "/assets/images/anpr_entry.svg";
                            AnprCameraStatus = "Active (Unregistered)";
                            CurrentProcessStep = "Vehicle Rejected";
                            SystemStatus = "Vehicle Rejected";
                            LedMessage = "INVALID VEHICLE - ENTRY DENIED";
                            OperatorMessage = "INVALID VEHICLE";
                            OnScale = false;
                        }
                        AddLog(new DeviceLogEntry { Plate = normalized, Status = "REJECTED", Timestamp = DateTime.UtcNow });
                        await BroadcastStateAsync();
                        await _hub.Clients.All.SendAsync("VehicleProcessed", new { plate = normalized, status = "REJECTED", reason = "Unregistered" });

                        // Persist rejection to SQLite database
                        try
                        {
                            using (var scope = _serviceProvider.CreateScope())
                            {
                                var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                                var transaction = new Transaction
                                {
                                    VehicleNumber = normalized,
                                    TransactionNumber = $"TXN-REJ-{DateTime.UtcNow:yyyyMMddHHmmss}",
                                    DriverName = "Unknown",
                                    CustomerName = "Unknown",
                                    MaterialName = "Unknown",
                                    Destination = "None",
                                    PurchaseOrder = "None",
                                    GrossWeight = 0,
                                    TareWeight = 0,
                                    NetWeight = 0,
                                    EntryTime = DateTime.Now,
                                    ApprovalStatus = "REJECTED",
                                    AnprResult = "INVALID",
                                    OperatorName = "Entry ANPR",
                                    Status = "REJECTED"
                                };
                                dbContext.Transactions.Add(transaction);
                                dbContext.AuditLogs.Add(new AuditLog { Action = "CHECK_VEHICLE_REJECTED", Details = $"Vehicle check failed for {normalized}. Reason: Unregistered.", Timestamp = DateTime.Now });
                                await dbContext.SaveChangesAsync();
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[ProcessVehicle] Database write error: {ex.Message}");
                        }

                        // Delay 7 seconds, then reset to IDLE
                        await Task.Delay(7000);

                        lock (_lock)
                        {
                            Stage = "IDLE";
                            EntrySignal = "RED";
                            EntryBarrier = "CLOSED";
                            ExitSignal = "RED";
                            ExitBarrier = "CLOSED";
                            CurrentTruckPlate = string.Empty;
                            CurrentDriverName = string.Empty;
                            CurrentCustomerName = string.Empty;
                            CurrentMaterialName = string.Empty;
                            CurrentDestination = string.Empty;
                            CurrentPurchaseOrder = string.Empty;
                            LiveCameraImage = string.Empty;
                            AnprCameraStatus = "Ready";
                            CurrentProcessStep = "Idle";
                            OperatorMessage = "Idle";
                            SystemStatus = "System Online";
                            LedMessage = "NO LED MESSAGE";
                            OnScale = false;
                        }
                        await BroadcastStateAsync();
                        Console.WriteLine($"[ProcessVehicle] Rejected plate={normalized} reset completed");
                        return;
                    }

                    // 2) TRUCK ENTERING
                    lock (_lock)
                    {
                        Stage = "ENTRY";
                        CurrentTruckPlate = normalized;
                        EntrySignal = "GREEN";
                        EntryBarrier = "OPEN";
                        // ensure exit remains closed while vehicle is entering
                        ExitSignal = "RED";
                        ExitBarrier = "CLOSED";
                        LedMessage = "VEHICLE ENTERING";
                    }
                    Console.WriteLine($"[ProcessVehicle] TRUCK ENTERING plate={normalized}");
                    _ = BroadcastStateAsync();
                    await Task.Delay(_enteringMs); // wait for truck to position on scale (3s)

                    // Vehicle is now positioned on the scale -> set position sensor
                    lock (_lock)
                    {
                        Stage = "WEIGHING";
                        OnScale = true;
                        // ensure exit closed during weighing
                        ExitSignal = "RED";
                        ExitBarrier = "CLOSED";
                        LedMessage = "WEIGHING IN PROGRESS";
                    }
                    Console.WriteLine($"[ProcessVehicle] OnScale=true for plate={normalized}");
                    _ = BroadcastStateAsync();

                    // 3) WEIGHING PROCESS
                    lock (_lock)
                    {
                        Stage = "WEIGHING";
                        EntrySignal = "RED";
                        ExitSignal = "RED";
                        EntryBarrier = "CLOSED";
                        ExitBarrier = "CLOSED";
                        LedMessage = "WEIGHING IN PROGRESS";
                    }
                    Console.WriteLine($"[ProcessVehicle] WEIGHING STARTED for plate={normalized}");
                    _ = BroadcastStateAsync();

                    // simulate weighing duration and assign deterministic demo weight
                    await Task.Delay(_weighingMs);
                    int measured;
                    lock (_lock)
                    {
                        measured = 27500; // deterministic demo value per requested flow
                        CurrentWeight = measured;
                    }
                    AddLog(new DeviceLogEntry { Plate = normalized, Status = "WEIGHED", Timestamp = DateTime.UtcNow, Weight = measured });
                    Console.WriteLine($"[ProcessVehicle] WEIGHT CALCULATED plate={normalized} weight={measured}");

                    // 4) WEIGHT CALCULATED: maintain closed/RED state and inform clients
                    lock (_lock)
                    {
                        Stage = "WEIGHT_CALCULATED";
                        EntrySignal = "RED";
                        ExitSignal = "RED";
                        EntryBarrier = "CLOSED";
                        ExitBarrier = "CLOSED";
                        CurrentTruckPlate = normalized;
                        CurrentWeight = measured;
                        LedMessage = "WEIGHT MEASURED";
                    }
                    _ = BroadcastStateAsync();

                    // small stabilization delay
                    await Task.Delay(1500);

                    // 5) TRUCK LEAVES SCALE: moves off scale but stops at closed exit barrier
                    lock (_lock)
                    {
                        OnScale = false;
                        CurrentWeight = 0;
                        CurrentProcessStep = "Truck leaves scale. Stopped at Exit Barrier.";
                        SystemStatus = "Truck off scale - Exit Barrier Closed";
                        LedMessage = "STOP AT BARRIER";
                    }
                    await BroadcastStateAsync();

                    // Wait 2.0s for the truck to animate off the scale and position in front of the exit barrier
                    await Task.Delay(2000);

                    // 6) EXIT: trigger exit sequence (exit signal green and open exit barrier)
                    lock (_lock)
                    {
                        Stage = "EXIT";
                        LedMessage = "PROCEED TO EXIT";
                        CurrentProcessStep = "Weight captured. Exit sequence running...";
                        SystemStatus = "Exit sequence running";
                        _currentWeighment = new WeighmentStatus
                        {
                            WeighmentId = $"PROCESS-{normalized}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                            TruckNo = normalized,
                            VehicleStatus = "WEIGH_COMPLETED",
                            WeightKg = measured,
                            EntryBarrierStatus = EntryBarrier,
                            ExitBarrierStatus = ExitBarrier,
                            AutoCloseEnabled = true,
                            AutoCloseAfterSeconds = _exitAutoCloseMs / 1000,
                            BackendProcess = new { step = "WEIGH_COMPLETE", nextAction = "RUN_EXIT_SEQUENCE", message = "Weigh complete. Running JSON-driven exit sequence." }
                        };
                    }
                    await BroadcastStateAsync();
                    await RunConfiguredExitSequenceAsync();
                    AddLog(new DeviceLogEntry { Plate = normalized, Status = "PROCESSED", Timestamp = DateTime.UtcNow, Weight = measured });
                    Console.WriteLine($"[ProcessVehicle] RESET after exit plate={normalized}");
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
