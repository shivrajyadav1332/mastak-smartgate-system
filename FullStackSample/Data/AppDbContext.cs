using Microsoft.EntityFrameworkCore;
using FullStackSample.Models;

namespace FullStackSample.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<Vehicle> Vehicles { get; set; }
    }
}
