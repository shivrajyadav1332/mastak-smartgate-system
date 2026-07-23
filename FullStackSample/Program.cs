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

// Device Configuration Service (singleton) for managing hardware device IP addresses
builder.Services.AddSingleton<DeviceConfigurationService>();

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

// Create the SQLite database once and preserve operational transactions across restarts.
using (var scope = app.Services.CreateScope())
{
    try
    {
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        context.Database.EnsureCreated();
        EnsureTransactionColumn(context, "AnprResult", "TEXT NOT NULL DEFAULT ''");
        EnsureTransactionColumn(context, "OperatorName", "TEXT NOT NULL DEFAULT 'System'");
        EnsureTransactionColumn(context, "SlipGeneratedAt", "TEXT NULL");
        EnsureTransactionColumn(context, "QrPayload", "TEXT NOT NULL DEFAULT ''");
        Console.WriteLine("Database successfully initialized and seeded.");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error initializing database: {ex.Message}");
    }
}

static void EnsureTransactionColumn(AppDbContext context, string columnName, string definition)
{
    var connection = context.Database.GetDbConnection();
    if (connection.State != System.Data.ConnectionState.Open) connection.Open();

    using var inspect = connection.CreateCommand();
    inspect.CommandText = "PRAGMA table_info('Transactions')";
    using var reader = inspect.ExecuteReader();
    var exists = false;
    while (reader.Read())
    {
        if (string.Equals(reader.GetString(1), columnName, StringComparison.OrdinalIgnoreCase))
        {
            exists = true;
            break;
        }
    }
    reader.Close();
    if (exists) return;

    using var alter = connection.CreateCommand();
    alter.CommandText = $"ALTER TABLE Transactions ADD COLUMN {columnName} {definition}";
    alter.ExecuteNonQuery();
}

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
