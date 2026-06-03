# Integration Guide - Connecting Device IPs to DeviceService

## Overview

This guide shows how to integrate the new `DeviceConfigurationService` with your existing `DeviceService` for actual device communication.

## Current Architecture

```
User Request
    ↓
Controllers (VehicleController, SystemController)
    ↓
DeviceService (simulates device behavior)
    ↓
SignalR Hub (broadcasts state to clients)
```

## Enhanced Architecture

```
User Request
    ↓
Controllers (VehicleController, SystemController)
    ↓
DeviceService
    ├→ Reads IP configs from DeviceConfigurationService
    ├→ Sends commands to actual devices
    └→ Updates state based on device response
    ↓
SignalR Hub (broadcasts state to clients)
```

## Integration Steps

### Step 1: Modify DeviceService Constructor

**Before:**
```csharp
public class DeviceService
{
    private readonly IHubContext<VehicleHub> _hub;
    
    public DeviceService(IHubContext<VehicleHub> hub)
    {
        _hub = hub;
    }
}
```

**After:**
```csharp
public class DeviceService
{
    private readonly IHubContext<VehicleHub> _hub;
    private readonly DeviceConfigurationService _deviceConfig;
    private readonly HttpClient _httpClient;
    private readonly ILogger<DeviceService> _logger;
    
    public DeviceService(
        IHubContext<VehicleHub> hub,
        DeviceConfigurationService deviceConfig,
        HttpClient httpClient,
        ILogger<DeviceService> logger)
    {
        _hub = hub;
        _deviceConfig = deviceConfig;
        _httpClient = httpClient;
        _logger = logger;
    }
}
```

### Step 2: Add Device Communication Methods

```csharp
/// <summary>
/// Send command to a physical device via its IP address
/// </summary>
private async Task<bool> SendCommandToDevice(string deviceId, string action, Dictionary<string, object>? parameters = null)
{
    var device = _deviceConfigService.GetDeviceById(deviceId);
    if (device == null || !device.IsActive)
    {
        _logger.LogWarning($"Device {deviceId} not found or inactive");
        return false;
    }

    try
    {
        var url = $"{device.Protocol.ToLower()}://{device.IpAddress}:{device.Port}/api/command";
        
        var request = new
        {
            action = action,
            parameters = parameters ?? new Dictionary<string, object>()
        };

        var content = new StringContent(
            System.Text.Json.JsonSerializer.Serialize(request),
            System.Text.Encoding.UTF8,
            "application/json"
        );

        var response = await _httpClient.PostAsync(url, content);
        
        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation($"Command sent to {deviceId}: {action}");
            return true;
        }
        else
        {
            _logger.LogError($"Device {deviceId} returned status {response.StatusCode}");
            return false;
        }
    }
    catch (Exception ex)
    {
        _logger.LogError($"Error sending command to {deviceId}: {ex.Message}");
        return false;
    }
}

/// <summary>
/// Open entry barrier
/// </summary>
public async Task OpenEntryBarrier()
{
    var device = _deviceConfigService.GetDeviceById("barrier_entry");
    if (device != null)
    {
        bool success = await SendCommandToDevice("barrier_entry", "open");
        if (success)
        {
            EntryBarrier = "OPEN";
            await NotifyStateChanged();
        }
    }
}

/// <summary>
/// Close entry barrier
/// </summary>
public async Task CloseEntryBarrier()
{
    var device = _deviceConfigService.GetDeviceById("barrier_entry");
    if (device != null)
    {
        bool success = await SendCommandToDevice("barrier_entry", "close");
        if (success)
        {
            EntryBarrier = "CLOSED";
            await NotifyStateChanged();
        }
    }
}

/// <summary>
/// Set LED message on display
/// </summary>
public async Task SetLedMessage(string message, string position = "entry")
{
    string deviceId = position == "entry" ? "led_entry" : "led_exit";
    var device = _deviceConfigService.GetDeviceById(deviceId);
    
    if (device != null)
    {
        var parameters = new Dictionary<string, object> { { "message", message } };
        bool success = await SendCommandToDevice(deviceId, "display_message", parameters);
        
        if (success)
        {
            LedMessage = message;
            await NotifyStateChanged();
        }
    }
}

/// <summary>
/// Set traffic signal color
/// </summary>
public async Task SetSignal(string color, string position = "entry")
{
    string deviceId = position == "entry" ? "signal_entry" : "signal_exit";
    var device = _deviceConfigService.GetDeviceById(deviceId);
    
    if (device != null)
    {
        var parameters = new Dictionary<string, object> { { "color", color } };
        bool success = await SendCommandToDevice(deviceId, "set_color", parameters);
        
        if (success)
        {
            if (position == "entry")
                EntrySignal = color;
            else
                ExitSignal = color;
            
            await NotifyStateChanged();
        }
    }
}

/// <summary>
/// Get vehicle weight from weighbridge
/// </summary>
public async Task<int> GetVehicleWeight()
{
    var device = _deviceConfigService.GetDeviceById("weigh_bridge");
    if (device == null) return 0;

    try
    {
        var url = $"{device.Protocol.ToLower()}://{device.IpAddress}:{device.Port}/api/weight";
        var response = await _httpClient.GetAsync(url);
        
        if (response.IsSuccessStatusCode)
        {
            var content = await response.Content.ReadAsStringAsync();
            var jsonDoc = System.Text.Json.JsonDocument.Parse(content);
            
            if (jsonDoc.RootElement.TryGetProperty("weight", out var weightElement))
            {
                return weightElement.GetInt32();
            }
        }
    }
    catch (Exception ex)
    {
        _logger.LogError($"Error getting weight: {ex.Message}");
    }

    return 0;
}

/// <summary>
/// Check plate using ANPR camera
/// </summary>
public async Task<string?> CheckPlateWithANPR()
{
    var device = _deviceConfigService.GetDeviceById("anpr_001");
    if (device == null) return null;

    try
    {
        var url = $"{device.Protocol.ToLower()}://{device.IpAddress}:{device.Port}/api/last-plate";
        var response = await _httpClient.GetAsync(url);
        
        if (response.IsSuccessStatusCode)
        {
            var content = await response.Content.ReadAsStringAsync();
            var jsonDoc = System.Text.Json.JsonDocument.Parse(content);
            
            if (jsonDoc.RootElement.TryGetProperty("plate", out var plateElement))
            {
                return plateElement.GetString();
            }
        }
    }
    catch (Exception ex)
    {
        _logger.LogError($"Error checking ANPR: {ex.Message}");
    }

    return null;
}
```

### Step 3: Update Program.cs

Add HttpClient and logging:

```csharp
// Add HttpClient for device communication
builder.Services.AddHttpClient();

// Add DeviceConfigurationService
builder.Services.AddSingleton<DeviceConfigurationService>();

// Add logging
builder.Services.AddLogging();
```

### Step 4: Update Workflow Integration

Modify your entry workflow to use real devices:

```csharp
// In VehicleController or SystemController
[HttpPost("entry/process")]
public async Task<IActionResult> ProcessEntry([FromBody] EntryRequest request)
{
    try
    {
        // Check plate with ANPR
        var plate = await _deviceService.CheckPlateWithANPR();
        
        if (plate != null && await CheckPlateAllowed(plate))
        {
            // Open barrier
            await _deviceService.OpenEntryBarrier();
            
            // Set LED message
            await _deviceService.SetLedMessage("WELCOME", "entry");
            
            // Set green signal
            await _deviceService.SetSignal("GREEN", "entry");
            
            return Ok(new { success = true, message = "Entry granted", plate = plate });
        }
        else
        {
            // Show denial message
            await _deviceService.SetLedMessage("ACCESS DENIED", "entry");
            
            // Set red signal
            await _deviceService.SetSignal("RED", "entry");
            
            return Ok(new { success = false, message = "Access denied" });
        }
    }
    catch (Exception ex)
    {
        _logger.LogError($"Error processing entry: {ex.Message}");
        return StatusCode(500, new { error = "Internal server error" });
    }
}
```

### Step 5: Exit Sequence Integration

```csharp
private async Task RunExitSequence()
{
    try
    {
        // Stage 1: Weigh vehicle
        int weight = await _deviceService.GetVehicleWeight();
        _logger.LogInformation($"Vehicle weight: {weight}kg");

        // Stage 2: Record weighment
        await RecordWeighment(CurrentTruckPlate, weight);

        // Stage 3: Open exit barrier
        await _deviceService.OpenExitBarrier();
        
        // Stage 4: Show message
        await _deviceService.SetLedMessage("THANK YOU", "exit");
        
        // Stage 5: Set green signal
        await _deviceService.SetSignal("GREEN", "exit");

        // Stage 6: Wait for vehicle to pass (30 seconds timeout)
        await Task.Delay(30000);

        // Stage 7: Close barrier
        await _deviceService.CloseExitBarrier();
        
        // Stage 8: Reset signals
        await _deviceService.SetSignal("RED", "exit");
        await _deviceService.SetLedMessage("READY", "exit");
    }
    catch (Exception ex)
    {
        _logger.LogError($"Error in exit sequence: {ex.Message}");
    }
}
```

## Example: Device Command Response Format

Your physical devices should respond to commands in this format:

### Request
```json
POST /api/command
{
  "action": "open",
  "parameters": {}
}
```

### Response
```json
{
  "success": true,
  "deviceId": "barrier_entry",
  "action": "open",
  "status": "OPEN",
  "timestamp": "2024-06-01T10:30:00Z"
}
```

## Testing the Integration

### 1. Test with Mock Devices

Create mock device API endpoints for testing:

```csharp
[ApiController]
[Route("api/mock")]
public class MockDeviceController : ControllerBase
{
    [HttpPost("command")]
    public IActionResult MockCommand([FromBody] dynamic command)
    {
        return Ok(new
        {
            success = true,
            action = command?.action,
            status = "SUCCESS",
            timestamp = DateTime.UtcNow
        });
    }

    [HttpGet("weight")]
    public IActionResult GetMockWeight()
    {
        var random = new Random();
        return Ok(new { weight = random.Next(5000, 25000) });
    }

    [HttpGet("last-plate")]
    public IActionResult GetMockPlate()
    {
        return Ok(new { plate = "ABC-1234" });
    }
}
```

### 2. Update Configuration for Testing

Change device IPs in `appsettings.json`:

```json
{
  "DeviceId": "barrier_entry",
  "IpAddress": "localhost",
  "Port": 5001,
  "Protocol": "HTTP"
}
```

### 3. Add Test Endpoints

```csharp
[HttpPost("test-entry")]
public async Task<IActionResult> TestEntry()
{
    try
    {
        await _deviceService.OpenEntryBarrier();
        await _deviceService.SetLedMessage("TEST MESSAGE", "entry");
        await _deviceService.SetSignal("GREEN", "entry");
        
        return Ok(new { success = true, message = "Entry test completed" });
    }
    catch (Exception ex)
    {
        return StatusCode(500, new { error = ex.Message });
    }
}
```

## Error Handling

Implement robust error handling:

```csharp
public class DeviceCommunicationException : Exception
{
    public string DeviceId { get; set; }
    public string Action { get; set; }

    public DeviceCommunicationException(string deviceId, string action, string message)
        : base(message)
    {
        DeviceId = deviceId;
        Action = action;
    }
}

// Usage
private async Task<bool> SendCommandToDeviceWithRetry(string deviceId, string action, int retries = 3)
{
    for (int i = 0; i < retries; i++)
    {
        try
        {
            return await SendCommandToDevice(deviceId, action);
        }
        catch (Exception ex) when (i < retries - 1)
        {
            _logger.LogWarning($"Attempt {i + 1} failed, retrying...");
            await Task.Delay(1000); // Wait 1 second before retry
        }
    }
    
    throw new DeviceCommunicationException(deviceId, action, $"Failed after {retries} retries");
}
```

## Performance Optimization

### Connection Pooling

```csharp
// In Program.cs
builder.Services.AddHttpClient()
    .ConfigureHttpClient(client =>
    {
        client.DefaultRequestHeaders.Connection.Add("Keep-Alive");
        client.Timeout = TimeSpan.FromSeconds(10);
    });
```

### Caching Device Configurations

```csharp
private readonly IMemoryCache _cache;

private DeviceConfig? GetCachedDevice(string deviceId)
{
    if (_cache.TryGetValue($"device_{deviceId}", out DeviceConfig? device))
    {
        return device;
    }

    device = _deviceConfigService.GetDeviceById(deviceId);
    if (device != null)
    {
        _cache.Set($"device_{deviceId}", device, TimeSpan.FromMinutes(5));
    }

    return device;
}
```

---

**Next**: See [Database Migration Guide](./DEVICE_IP_DATABASE_MIGRATION.md) for persistent storage setup.
