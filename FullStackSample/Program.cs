using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore;
using FullStackSample.Data;
using FullStackSample.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();

// SignalR for real-time notifications
builder.Services.AddSignalR();

// Device service (singleton) that simulates devices and maintains state
builder.Services.AddSingleton<DeviceService>();

// Configure EF Core with SQLite
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=vehicles.db"));

// Configure CORS - allow any origin, method, header
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Enable serving default files (index.html) and static files for the frontend
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRouting();
app.UseCors("AllowAll");

app.UseAuthorization();

app.MapControllers();
app.MapHub<FullStackSample.Hubs.VehicleHub>("/hub/vehicle");

// Respect configured URLs from command-line or environment; default to http://localhost:5001
var configuredUrls = builder.Configuration["urls"] ?? Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://localhost:5001";
app.Urls.Clear();
foreach (var u in configuredUrls.Split(';', StringSplitOptions.RemoveEmptyEntries))
{
    app.Urls.Add(u);
}

app.Run();
