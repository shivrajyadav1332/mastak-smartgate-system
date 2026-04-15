using System.ComponentModel.DataAnnotations;

namespace FullStackSample.Models
{
    public class VehicleDto
    {
        [Required]
        public string PlateNumber { get; set; } = string.Empty;
    }
}
