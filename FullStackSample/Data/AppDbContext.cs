using Microsoft.EntityFrameworkCore;
using FullStackSample.Models;

namespace FullStackSample.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<Vehicle> Vehicles { get; set; }
        public DbSet<Customer> Customers { get; set; }
        public DbSet<Material> Materials { get; set; }
        public DbSet<Driver> Drivers { get; set; }
        public DbSet<Transaction> Transactions { get; set; }
        public DbSet<WeightLog> WeightLogs { get; set; }
        public DbSet<CameraImage> CameraImages { get; set; }
        public DbSet<Operator> Operators { get; set; }
        public DbSet<AuditLog> AuditLogs { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Seed Customers
            modelBuilder.Entity<Customer>().HasData(
                new Customer { Id = 1, Name = "Tandu Cement Ltd" },
                new Customer { Id = 2, Name = "Acme Builders" },
                new Customer { Id = 3, Name = "Global Infra Corp" }
            );

            // Seed Materials
            modelBuilder.Entity<Material>().HasData(
                new Material { Id = 1, Name = "Fly Ash" },
                new Material { Id = 2, Name = "Gypsum" },
                new Material { Id = 3, Name = "Clinker" }
            );

            // Seed Drivers
            modelBuilder.Entity<Driver>().HasData(
                new Driver { Id = 1, Name = "John Doe", LicenseNumber = "DL-12345" },
                new Driver { Id = 2, Name = "Jane Smith", LicenseNumber = "DL-67890" },
                new Driver { Id = 3, Name = "Mike Johnson", LicenseNumber = "DL-54321" }
            );

            // Seed Operators
            modelBuilder.Entity<Operator>().HasData(
                new Operator { Id = 1, Username = "admin", Name = "Admin Operator" },
                new Operator { Id = 2, Username = "operator1", Name = "Gate Operator 1" }
            );

            // Seed Vehicles with process properties
            modelBuilder.Entity<Vehicle>().HasData(
                new Vehicle { Id = 1, PlateNumber = "ABC-1234", DriverName = "John Doe", Destination = "Warehouse A", PurchaseOrder = "PO-99881", IsRegistered = true, Status = "IDLE", Weight = 0, Barrier = "CLOSED" },
                new Vehicle { Id = 2, PlateNumber = "XYZ-9999", DriverName = "Jane Smith", Destination = "Silo B", PurchaseOrder = "PO-77332", IsRegistered = true, Status = "IDLE", Weight = 0, Barrier = "CLOSED" },
                new Vehicle { Id = 3, PlateNumber = "DEF-9012", DriverName = "Mike Johnson", Destination = "Plant 1", PurchaseOrder = "PO-44556", IsRegistered = true, Status = "IDLE", Weight = 0, Barrier = "CLOSED" }
            );
        }
    }
}
