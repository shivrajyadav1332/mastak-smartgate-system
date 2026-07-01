using System;
using System.ComponentModel.DataAnnotations;

namespace FullStackSample.Models
{
    public class Customer
    {
        public int Id { get; set; }
        [Required]
        public string Name { get; set; } = string.Empty;
    }

    public class Material
    {
        public int Id { get; set; }
        [Required]
        public string Name { get; set; } = string.Empty;
    }

    public class Driver
    {
        public int Id { get; set; }
        [Required]
        public string Name { get; set; } = string.Empty;
        public string LicenseNumber { get; set; } = string.Empty;
    }

    public class Transaction
    {
        public int Id { get; set; }
        [Required]
        public string VehicleNumber { get; set; } = string.Empty;
        public string DriverName { get; set; } = string.Empty;
        public string CustomerName { get; set; } = string.Empty;
        public string MaterialName { get; set; } = string.Empty;
        public string Destination { get; set; } = string.Empty;
        public string PurchaseOrder { get; set; } = string.Empty;

        // Weights
        public double GrossWeight { get; set; } = 0;
        public double TareWeight { get; set; } = 0;
        public double NetWeight { get; set; } = 0;

        // Timestamps
        public DateTime EntryTime { get; set; } = DateTime.Now;
        public DateTime? ExitTime { get; set; }

        // Status: "IN COMPLETED" or "COMPLETED"
        public string Status { get; set; } = "IN COMPLETED";
    }

    public class WeightLog
    {
        public int Id { get; set; }
        public int TransactionId { get; set; }
        public double Weight { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.Now;
        public string Type { get; set; } = "GROSS"; // "GROSS" or "TARE"
    }

    public class CameraImage
    {
        public int Id { get; set; }
        public int? TransactionId { get; set; }
        public string ImagePath { get; set; } = string.Empty;
        public DateTime CapturedAt { get; set; } = DateTime.Now;
        public string CameraType { get; set; } = "ENTRY"; // "ENTRY" or "EXIT"
    }

    public class Operator
    {
        public int Id { get; set; }
        [Required]
        public string Username { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }

    public class AuditLog
    {
        public int Id { get; set; }
        public string Action { get; set; } = string.Empty;
        public string Details { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.Now;
        public string Username { get; set; } = "System";
    }
}
