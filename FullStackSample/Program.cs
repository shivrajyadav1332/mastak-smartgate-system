using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore;
using FullStackSample.Data;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();

// SignalR for real-time notifications
builder.Services.AddSignalR();

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

// Ensure the app listens on the requested URL for the frontend JS fetch calls (HTTP).
app.Urls.Clear();
app.Urls.Add("http://localhost:5001");

app.Run();
