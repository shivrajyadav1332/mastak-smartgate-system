using System;
using System.ComponentModel.DataAnnotations;

namespace FullStackSample.Models
{
    public class Vehicle
    {
        public int Id { get; set; }

        [Required]
        public string PlateNumber { get; set; } = string.Empty;

        // Control state set by backend when a vehicle is posted
        public string Status { get; set; } = "PENDING";

        // Weight in kilograms assigned by backend when accepted
        public int Weight { get; set; } = 0;

        // Barrier state for UI: "OPEN" or "CLOSED"
        public string Barrier { get; set; } = "CLOSED";
        public DateTime EntryTime { get; set; } = DateTime.Now;
    }
}
