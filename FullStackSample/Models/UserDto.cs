using System.ComponentModel.DataAnnotations;

namespace FullStackSample.Models
{
    public class UserDto
    {
        [Required]
        public string Name { get; set; } = string.Empty;
    }
}
