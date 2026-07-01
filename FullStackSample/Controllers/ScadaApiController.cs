using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using FullStackSample.Data;
using FullStackSample.Models;
using FullStackSample.Services;
using FullStackSample.Hubs;

namespace FullStackSample.Controllers
{
    [ApiController]
    [Route("api")]
    public class ScadaApiController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly DeviceService _device;
        private readonly IHubContext<VehicleHub> _hub;

        public ScadaApiController(AppDbContext context, DeviceService device, IHubContext<VehicleHub> hub)
        {
            _context = context;
            _device = device;
            _hub = hub;
        }

        // DTOs
        public class PlateCheckRequest
        {
            public string PlateNumber { get; set; } = string.Empty;
        }

        public class VehicleInRequest
        {
            public string PlateNumber { get; set; } = string.Empty;
            public double GrossWeight { get; set; }
        }

        public class VehicleOutRequest
        {
            public string PlateNumber { get; set; } = string.Empty;
            public double TareWeight { get; set; }
        }

        public class BarrierControlRequest
        {
            public string Barrier { get; set; } = "entry"; // "entry" or "exit"
        }

        public class SignalControlRequest
        {
            public string Signal { get; set; } = "entry"; // "entry" or "exit"
        }

        // 1. POST /api/vehicle/check
        [HttpPost("vehicle/check")]
        public async Task<IActionResult> CheckVehicle([FromBody] PlateCheckRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.PlateNumber))
            {
                return BadRequest(new { success = false, message = "Plate number is required." });
            }

            var plate = req.PlateNumber.Trim().ToUpperInvariant();
            var vehicle = await _context.Vehicles
                .FirstOrDefaultAsync(v => v.PlateNumber.ToUpper() == plate || v.PlateNumber.ToUpper().Replace("-", "") == plate.Replace("-", ""));

            if (vehicle == null || !vehicle.IsRegistered)
            {
                // Reject vehicle
                _device.EntrySignal = "RED";
                _device.EntryBarrier = "CLOSED";
                _device.CurrentTruckPlate = plate;
                _device.CurrentDriverName = "Unknown";
                _device.CurrentCustomerName = "Unknown";
                _device.CurrentMaterialName = "Unknown";
                _device.CurrentDestination = "None";
                _device.CurrentPurchaseOrder = "None";
                _device.LiveCameraImage = "/assets/images/anpr_entry.svg";
                _device.AnprCameraStatus = "Active (Unregistered)";
                _device.CurrentProcessStep = "Vehicle Not Registered Boom Barrier remains CLOSED.";
                _device.SystemStatus = "Vehicle Rejected";
                _device.Stage = "INVALID";

                await _device.TriggerBroadcastAsync();
                await _hub.Clients.All.SendAsync("VehicleProcessed", new { plate = plate, status = "REJECTED", reason = "Unregistered" });

                // Log audit trail
                _context.AuditLogs.Add(new AuditLog { Action = "CHECK_VEHICLE_REJECTED", Details = $"Vehicle check failed for {plate}. Reason: Unregistered.", Timestamp = DateTime.Now });
                await _context.SaveChangesAsync();

                return Ok(new { success = false, message = "Vehicle Not Registered Boom Barrier remains CLOSED." });
            }

            // Accept vehicle: load seeded values
            var driverName = string.IsNullOrEmpty(vehicle.DriverName) ? "John Doe" : vehicle.DriverName;
            var destination = string.IsNullOrEmpty(vehicle.Destination) ? "Warehouse A" : vehicle.Destination;
            var purchaseOrder = string.IsNullOrEmpty(vehicle.PurchaseOrder) ? "PO-99881" : vehicle.PurchaseOrder;

            // Fetch from Seeded tables if matching
            var customer = await _context.Customers.FirstOrDefaultAsync(c => c.Id == 1);
            var material = await _context.Materials.FirstOrDefaultAsync(m => m.Id == 1);

            var customerName = customer?.Name ?? "Tandu Cement Ltd";
            var materialName = material?.Name ?? "Fly Ash";

            // Update DeviceState
            _device.EntrySignal = "GREEN";
            _device.EntryBarrier = "OPEN";
            _device.CurrentTruckPlate = vehicle.PlateNumber;
            _device.CurrentDriverName = driverName;
            _device.CurrentCustomerName = customerName;
            _device.CurrentMaterialName = materialName;
            _device.CurrentDestination = destination;
            _device.CurrentPurchaseOrder = purchaseOrder;
            _device.LiveCameraImage = "/assets/images/anpr_entry.svg";
            _device.AnprCameraStatus = "Active (Plate Captured)";
            _device.CurrentProcessStep = "Vehicle Verified. Proceed to Weighbridge.";
            _device.SystemStatus = "Entry Signal GREEN - Barrier OPEN";
            _device.Stage = "ARRIVED";
            _device.OnScale = false;

            await _device.TriggerBroadcastAsync();
            await _hub.Clients.All.SendAsync("VehicleProcessed", new { plate = vehicle.PlateNumber, status = "ACCEPTED" });

            // Create image log
            _context.CameraImages.Add(new CameraImage { ImagePath = "/assets/images/anpr_entry.svg", CameraType = "ENTRY", CapturedAt = DateTime.Now });
            _context.AuditLogs.Add(new AuditLog { Action = "CHECK_VEHICLE_ACCEPTED", Details = $"Vehicle check success for {vehicle.PlateNumber}.", Timestamp = DateTime.Now });
            await _context.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                driverName = driverName,
                destination = destination,
                purchaseOrder = purchaseOrder,
                vehicleNumber = vehicle.PlateNumber
            });
        }

        // 2. POST /api/vehicle/in
        [HttpPost("vehicle/in")]
        public async Task<IActionResult> VehicleIn([FromBody] VehicleInRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.PlateNumber))
            {
                return BadRequest(new { success = false, message = "Plate number is required." });
            }

            var plate = req.PlateNumber.Trim().ToUpperInvariant();
            var vehicle = await _context.Vehicles.FirstOrDefaultAsync(v => v.PlateNumber.ToUpper() == plate || v.PlateNumber.ToUpper().Replace("-", "") == plate.Replace("-", ""));
            if (vehicle == null)
            {
                return NotFound(new { success = false, message = "Vehicle not found." });
            }

            // Simulate truck positioning on scale and entry barrier closing automatically
            _device.EntryBarrier = "CLOSED";
            _device.EntrySignal = "RED";
            _device.OnScale = true;
            _device.CurrentProcessStep = "Truck stops on weighbridge. Weighing Gross Weight...";
            _device.SystemStatus = "Weighing Gross Weight";
            _device.Stage = "WEIGHING";
            _device.GrossWeight = req.GrossWeight > 0 ? req.GrossWeight : 27500;
            _device.CurrentWeight = (int)_device.GrossWeight;

            await _device.TriggerBroadcastAsync();
            await Task.Delay(1000); // simulate stabilization

            // Create a Transaction in database
            var transaction = new Transaction
            {
                VehicleNumber = vehicle.PlateNumber,
                DriverName = string.IsNullOrEmpty(vehicle.DriverName) ? "John Doe" : vehicle.DriverName,
                CustomerName = _device.CurrentCustomerName,
                MaterialName = _device.CurrentMaterialName,
                Destination = string.IsNullOrEmpty(vehicle.Destination) ? "Warehouse A" : vehicle.Destination,
                PurchaseOrder = string.IsNullOrEmpty(vehicle.PurchaseOrder) ? "PO-99881" : vehicle.PurchaseOrder,
                GrossWeight = _device.GrossWeight,
                TareWeight = 0,
                NetWeight = 0,
                EntryTime = DateTime.Now,
                Status = "IN COMPLETED"
            };

            _context.Transactions.Add(transaction);
            await _context.SaveChangesAsync();

            // Save WeightLog
            _context.WeightLogs.Add(new WeightLog
            {
                TransactionId = transaction.Id,
                Weight = transaction.GrossWeight,
                Type = "GROSS",
                Timestamp = DateTime.Now
            });

            // Update UI State to complete
            _device.CurrentProcessStep = "Gross Weight Captured. Status: IN COMPLETED. Exit barrier opening...";
            _device.SystemStatus = "Weighing IN Complete - Proceed to Exit";
            _device.Stage = "WEIGHT_CALCULATED";
            _device.LedMessage = "PROCEED TO EXIT";

            await _device.TriggerBroadcastAsync();
            await _hub.Clients.All.SendAsync("VehicleAdded", new { plateNumber = vehicle.PlateNumber, status = "IN COMPLETED", weight = transaction.GrossWeight });

            _context.AuditLogs.Add(new AuditLog { Action = "WEIGH_IN_COMPLETE", Details = $"Gross weight captured: {transaction.GrossWeight} kg for {vehicle.PlateNumber}.", Timestamp = DateTime.Now });
            await _context.SaveChangesAsync();

            // After gross weight is captured: open exit boom, wait for truck to leave scale, then close
            var autoCloseSec = Math.Max(1, _device.GetExitAutoCloseMs() / 1000);
            _device.CompleteWeighment(vehicle.PlateNumber, transaction.GrossWeight, autoCloseSec);

            return Ok(transaction);
        }

        // 3. POST /api/vehicle/out
        [HttpPost("vehicle/out")]
        public async Task<IActionResult> VehicleOut([FromBody] VehicleOutRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.PlateNumber))
            {
                return BadRequest(new { success = false, message = "Plate number is required." });
            }

            var plate = req.PlateNumber.Trim().ToUpperInvariant();

            // Find in-progress transaction
            var transaction = await _context.Transactions
                .Where(t => (t.VehicleNumber.ToUpper() == plate || t.VehicleNumber.ToUpper().Replace("-", "") == plate.Replace("-", "")) && t.Status == "IN COMPLETED")
                .OrderByDescending(t => t.EntryTime)
                .FirstOrDefaultAsync();

            if (transaction == null)
            {
                // Reject truck
                _device.ExitSignal = "RED";
                _device.ExitBarrier = "CLOSED";
                _device.CurrentProcessStep = "No Entry Record Found. Rejecting Truck.";
                _device.SystemStatus = "Exit Rejected";
                _device.Stage = "INVALID";
                _device.LiveCameraImage = "/assets/images/anpr_exit.svg";
                _device.AnprCameraStatus = "Active (Rejected Exit)";

                await _device.TriggerBroadcastAsync();
                
                _context.AuditLogs.Add(new AuditLog { Action = "WEIGH_OUT_REJECTED", Details = $"Exit check failed for {plate}. Reason: No Entry Record Found.", Timestamp = DateTime.Now });
                await _context.SaveChangesAsync();

                return Ok(new { success = false, message = "No Entry Record Found" });
            }

            // Transaction exists
            var tare = req.TareWeight > 0 ? req.TareWeight : 9500;
            var net = transaction.GrossWeight - tare;

            // Set Exit Signal GREEN, open exit barrier
            _device.ExitSignal = "GREEN";
            _device.ExitBarrier = "OPEN";
            _device.OnScale = true;
            _device.LiveCameraImage = "/assets/images/anpr_exit.svg";
            _device.AnprCameraStatus = "Active (Exit Captured)";
            _device.CurrentProcessStep = "Vehicle Verified. Truck moves onto scale. Capturing Tare Weight...";
            _device.SystemStatus = "Weighing Tare Weight";
            _device.Stage = "EXIT";

            await _device.TriggerBroadcastAsync();
            await Task.Delay(1000); // simulate stabilization

            // Update Transaction
            transaction.TareWeight = tare;
            transaction.NetWeight = net;
            transaction.ExitTime = DateTime.Now;
            transaction.Status = "COMPLETED";

            _context.WeightLogs.Add(new WeightLog
            {
                TransactionId = transaction.Id,
                Weight = tare,
                Type = "TARE",
                Timestamp = DateTime.Now
            });

            _context.CameraImages.Add(new CameraImage
            {
                TransactionId = transaction.Id,
                ImagePath = "/assets/images/anpr_exit.svg",
                CameraType = "EXIT",
                CapturedAt = DateTime.Now
            });

            _context.AuditLogs.Add(new AuditLog { Action = "WEIGH_OUT_COMPLETE", Details = $"Tare: {tare} kg. Net: {net} kg for {transaction.VehicleNumber}.", Timestamp = DateTime.Now });
            await _context.SaveChangesAsync();

            // Broadcast UI final updates
            _device.GrossWeight = transaction.GrossWeight;
            _device.TareWeight = tare;
            _device.NetWeight = net;
            _device.CurrentWeight = (int)tare;
            _device.CurrentProcessStep = "Transaction Completed. Gross, Tare, and Net weight updated.";
            _device.SystemStatus = "Transaction Completed. Safe Journey!";
            _device.Stage = "IDLE"; // reset flow stage

            await _device.TriggerBroadcastAsync();
            await _hub.Clients.All.SendAsync("ExitBarrierOpened");

            // Auto-close exit barrier after a short delay
            _ = Task.Run(async () =>
            {
                await Task.Delay(3000);
                _device.ExitBarrier = "CLOSED";
                _device.ExitSignal = "RED";
                _device.OnScale = false;
                _device.CurrentTruckPlate = string.Empty;
                _device.CurrentDriverName = string.Empty;
                _device.CurrentCustomerName = string.Empty;
                _device.CurrentMaterialName = string.Empty;
                _device.CurrentDestination = string.Empty;
                _device.CurrentPurchaseOrder = string.Empty;
                _device.GrossWeight = 0;
                _device.TareWeight = 0;
                _device.NetWeight = 0;
                _device.CurrentWeight = 0;
                _device.AnprCameraStatus = "Ready";
                _device.CurrentProcessStep = "Ready for next vehicle.";
                _device.SystemStatus = "System Online";

                await _device.TriggerBroadcastAsync();
                await _hub.Clients.All.SendAsync("ExitBarrierClosed");
            });

            return Ok(new
            {
                success = true,
                transaction = transaction
            });
        }

        // 4. GET /api/transaction/latest
        [HttpGet("transaction/latest")]
        public async Task<IActionResult> GetLatestTransaction()
        {
            var tx = await _context.Transactions
                .OrderByDescending(t => t.EntryTime)
                .FirstOrDefaultAsync();

            if (tx == null) return NotFound(new { message = "No transactions found." });
            return Ok(tx);
        }

        // 5. GET /api/transaction/{id}
        [HttpGet("transaction/{id}")]
        public async Task<IActionResult> GetTransactionById(int id)
        {
            var tx = await _context.Transactions.FindAsync(id);
            if (tx == null) return NotFound(new { message = "Transaction not found." });
            return Ok(tx);
        }

        // 6. GET /api/dashboard/status
        [HttpGet("dashboard/status")]
        public IActionResult GetDashboardStatus()
        {
            return Ok(new
            {
                entrySignal = _device.EntrySignal,
                exitSignal = _device.ExitSignal,
                entryBoomBarrier = _device.EntryBarrier,
                exitBoomBarrier = _device.ExitBarrier,
                anprCameraStatus = _device.AnprCameraStatus,
                truckPosition = _device.OnScale ? 50 : 0, // mock position 0/50/100
                grossWeight = _device.GrossWeight,
                tareWeight = _device.TareWeight,
                netWeight = _device.NetWeight,
                customer = _device.CurrentCustomerName,
                material = _device.CurrentMaterialName,
                driver = _device.CurrentDriverName,
                vehicleNumber = _device.CurrentTruckPlate,
                liveCameraImages = _device.LiveCameraImage,
                currentProcessStep = _device.CurrentProcessStep,
                systemStatus = _device.SystemStatus
            });
        }

        // 7. POST /api/barrier/open
        [HttpPost("barrier/open")]
        public async Task<IActionResult> OpenBarrier([FromBody] BarrierControlRequest req)
        {
            if (req.Barrier.ToLower() == "exit")
            {
                _device.ExitBarrier = "OPEN";
                _device.ExitSignal = "GREEN";
            }
            else
            {
                _device.EntryBarrier = "OPEN";
                _device.EntrySignal = "GREEN";
            }
            await _device.TriggerBroadcastAsync();
            return Ok(new { status = "SUCCESS", barrier = req.Barrier, state = "OPEN" });
        }

        // 8. POST /api/barrier/close
        [HttpPost("barrier/close")]
        public async Task<IActionResult> CloseBarrier([FromBody] BarrierControlRequest req)
        {
            if (req.Barrier.ToLower() == "exit")
            {
                _device.ExitBarrier = "CLOSED";
                _device.ExitSignal = "RED";
            }
            else
            {
                _device.EntryBarrier = "CLOSED";
                _device.EntrySignal = "RED";
            }
            await _device.TriggerBroadcastAsync();
            return Ok(new { status = "SUCCESS", barrier = req.Barrier, state = "CLOSED" });
        }

        // 9. POST /api/signal/red
        [HttpPost("signal/red")]
        public async Task<IActionResult> SetSignalRed([FromBody] SignalControlRequest req)
        {
            if (req.Signal.ToLower() == "exit")
            {
                _device.ExitSignal = "RED";
            }
            else
            {
                _device.EntrySignal = "RED";
            }
            await _device.TriggerBroadcastAsync();
            return Ok(new { status = "SUCCESS", signal = req.Signal, state = "RED" });
        }

        // 10. POST /api/signal/green
        [HttpPost("signal/green")]
        public async Task<IActionResult> SetSignalGreen([FromBody] SignalControlRequest req)
        {
            if (req.Signal.ToLower() == "exit")
            {
                _device.ExitSignal = "GREEN";
            }
            else
            {
                _device.EntrySignal = "GREEN";
            }
            await _device.TriggerBroadcastAsync();
            return Ok(new { status = "SUCCESS", signal = req.Signal, state = "GREEN" });
        }

        // 11. POST /api/camera/capture
        [HttpPost("camera/capture")]
        public async Task<IActionResult> CameraCapture()
        {
            var imagePath = _device.Stage == "EXIT" ? "/assets/images/anpr_exit.svg" : "/assets/images/anpr_entry.svg";
            _device.LiveCameraImage = imagePath;
            _device.AnprCameraStatus = "Active (Captured)";

            _context.CameraImages.Add(new CameraImage
            {
                ImagePath = imagePath,
                CameraType = _device.Stage == "EXIT" ? "EXIT" : "ENTRY",
                CapturedAt = DateTime.Now
            });
            await _context.SaveChangesAsync();
            await _device.TriggerBroadcastAsync();

            return Ok(new { status = "SUCCESS", imagePath = imagePath, timestamp = DateTime.Now });
        }

        // 12. POST /api/print/slip
        [HttpPost("print/slip")]
        public async Task<IActionResult> PrintSlip([FromBody] TransactionIdRequest req)
        {
            if (req == null || req.TransactionId <= 0) return BadRequest("TransactionId is required.");

            var tx = await _context.Transactions.FindAsync(req.TransactionId);
            if (tx == null) return NotFound("Transaction not found.");

            var slipText = $"====================================\n" +
                           $"         TANDU CEMENT LTD           \n" +
                           $"       WEIGHMENT SLIP TICKET        \n" +
                           $"====================================\n" +
                           $"Ticket ID: TX-{tx.Id:D6}\n" +
                           $"Vehicle:   {tx.VehicleNumber}\n" +
                           $"Driver:    {tx.DriverName}\n" +
                           $"Customer:  {tx.CustomerName}\n" +
                           $"Material:  {tx.MaterialName}\n" +
                           $"Date:      {tx.EntryTime:dd-MM-yyyy HH:mm:ss}\n" +
                           $"------------------------------------\n" +
                           $"Gross Wt:  {tx.GrossWeight:F0} kg\n" +
                           $"Tare Wt:   {tx.TareWeight:F0} kg\n" +
                           $"Net Weight:{tx.NetWeight:F0} kg\n" +
                           $"------------------------------------\n" +
                           $"Status:    COMPLETED\n" +
                           $"====================================\n";

            return Ok(new { status = "SUCCESS", ticket = slipText });
        }

        public class TransactionIdRequest
        {
            public int TransactionId { get; set; }
        }
    }
}
