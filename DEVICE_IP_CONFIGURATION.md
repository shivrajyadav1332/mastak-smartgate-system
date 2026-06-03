# Hardware Device IP Address Configuration System

## Overview

This system provides a centralized platform for managing and monitoring IP addresses for all hardware components in the Smart Gate system:

- 🎥 **ANPR Camera** - Automatic Number Plate Recognition
- 🚪 **Boom Barrier** - Entry and Exit barriers
- 📺 **LED Message Display** - Dynamic message boards
- ⚖️ **Weigh Bridge** - Weighing scale system
- 🚦 **Traffic Signals** - Entry and Exit signals

## Architecture

### Backend (.NET)

#### Models (`Models/DeviceConfig.cs`)
- `DeviceConfig`: Core device configuration model
- `DeviceConnectivityStatus`: Device connectivity status and health information
- `DeviceConfigRequest`: Request model for creating/updating devices

#### Services (`Services/DeviceConfigurationService.cs`)
- Manages device configurations in memory (can be extended to database)
- Provides CRUD operations for devices
- Implements connectivity testing with HTTP/TCP
- Offers device statistics and lookups

#### Controllers (`Controllers/DeviceConfigController.cs`)
RESTful API endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/devices` | Get all devices |
| `GET` | `/api/devices/{deviceId}` | Get specific device |
| `GET` | `/api/devices/type/{deviceType}` | Get devices by type |
| `POST` | `/api/devices` | Create new device |
| `PUT` | `/api/devices/{deviceId}` | Update device |
| `PATCH` | `/api/devices/{deviceId}/ip` | Update IP address only |
| `DELETE` | `/api/devices/{deviceId}` | Delete device |
| `POST` | `/api/devices/{deviceId}/test` | Test device connectivity |
| `POST` | `/api/devices/test/all` | Test all devices |
| `GET` | `/api/devices/status/active` | Get active devices status |
| `GET` | `/api/devices/stats` | Get device statistics |
| `GET` | `/api/devices/lookup/{ipAddress}` | Lookup device by IP |

### Frontend (Angular)

#### Services (`services/device-config.service.ts`)
- HTTP client for device configuration API
- Observable-based state management
- RxJS subscriptions for real-time updates

#### Components

##### Device Configuration Component
- **Location**: `components/device-config/`
- **Features**:
  - View all devices in a grid layout
  - Filter by device type or search by name/IP
  - Create new device configurations
  - Edit existing configurations
  - Delete devices
  - Test individual device connectivity
  - Real-time updates via Observables

##### Device Monitor Component
- **Location**: `components/device-monitor/`
- **Features**:
  - Real-time connectivity status dashboard
  - System uptime percentage
  - Auto-refresh capability (30-second intervals)
  - Status table with response times
  - Health indicators (Good/Warning/Critical)

## Configuration

### Default Devices

The system initializes with 8 default devices:

```json
{
  "anpr_001": "ANPR Camera - Entry (192.168.1.100:8080)",
  "barrier_entry": "Boom Barrier - Entry (192.168.1.101:502)",
  "barrier_exit": "Boom Barrier - Exit (192.168.1.102:502)",
  "led_entry": "LED Display - Entry (192.168.1.103:8081)",
  "led_exit": "LED Display - Exit (192.168.1.104:8081)",
  "weigh_bridge": "Weighbridge Scale (192.168.1.105:502)",
  "signal_entry": "Traffic Signal - Entry (192.168.1.106:502)",
  "signal_exit": "Traffic Signal - Exit (192.168.1.107:502)"
}
```

### appsettings.json

All device configurations are stored in `appsettings.json`:

```json
{
  "DeviceConfiguration": {
    "AutoTestInterval": 60000,
    "Devices": [
      {
        "DeviceId": "anpr_001",
        "DeviceName": "ANPR Camera - Entry",
        "DeviceType": "ANPR",
        "IpAddress": "192.168.1.100",
        "Port": 8080,
        "Protocol": "HTTP",
        "IsActive": true,
        "Description": "..."
      }
    ]
  }
}
```

## Usage

### Backend API Examples

#### Get All Devices
```bash
GET /api/devices
```

Response:
```json
{
  "success": true,
  "data": [...],
  "count": 8
}
```

#### Create a Device
```bash
POST /api/devices
Content-Type: application/json

{
  "deviceName": "New ANPR Camera",
  "deviceType": "ANPR",
  "ipAddress": "192.168.1.200",
  "port": 8080,
  "protocol": "HTTP",
  "isActive": true,
  "description": "Additional ANPR camera at exit"
}
```

#### Update Device IP Address
```bash
PATCH /api/devices/anpr_001/ip
Content-Type: application/json

{
  "ipAddress": "192.168.1.110",
  "port": 8080
}
```

#### Test Device Connectivity
```bash
POST /api/devices/anpr_001/test

Response:
{
  "success": true,
  "data": {
    "deviceId": "anpr_001",
    "status": "ONLINE",
    "responseTime": 45,
    "checkedAt": "2024-06-01T10:30:00Z"
  }
}
```

### Frontend Components

#### In Your App Routes

Add the components to your routing:

```typescript
import { DeviceConfigComponent } from './components/device-config/device-config.component';
import { DeviceMonitorComponent } from './components/device-monitor/device-monitor.component';

export const routes: Routes = [
  {
    path: 'devices/config',
    component: DeviceConfigComponent
  },
  {
    path: 'devices/monitor',
    component: DeviceMonitorComponent
  }
];
```

#### In Your Navigation

```html
<nav>
  <a routerLink="/devices/config">Device Configuration</a>
  <a routerLink="/devices/monitor">Device Monitor</a>
</nav>
```

## Device Types

### ANPR (Automatic Number Plate Recognition)
- **Protocol**: HTTP
- **Default Port**: 8080
- **Used For**: Vehicle entry/exit plate recognition

### BOOM_BARRIER
- **Protocol**: MODBUS
- **Default Port**: 502
- **Used For**: Entry and Exit barriers control

### LED_MESSAGE
- **Protocol**: HTTP
- **Default Port**: 8081
- **Used For**: Dynamic message display boards

### WEIGH_BRIDGE
- **Protocol**: MODBUS
- **Default Port**: 502
- **Used For**: Vehicle weight measurement

### SIGNAL
- **Protocol**: MODBUS
- **Default Port**: 502
- **Used For**: Traffic signal control (RED/GREEN)

## Protocols Supported

- **HTTP**: Standard web HTTP protocol
- **HTTPS**: Secure HTTP protocol
- **TCP**: Raw TCP socket communication
- **MODBUS**: Industrial automation protocol (common for factory equipment)

## Features

### 1. Device Management
- Add new devices
- Update existing configurations
- Delete devices
- Bulk enable/disable

### 2. Connectivity Testing
- Test individual device connectivity
- Test all devices simultaneously
- Response time measurement
- Error reporting

### 3. Monitoring Dashboard
- Real-time status display
- System uptime calculation
- Auto-refresh functionality
- Visual status indicators

### 4. Configuration Options
- IP Address
- Port Number
- Protocol Selection
- Active/Inactive Status
- Device Description

### 5. Search & Filter
- Filter by device type
- Search by device name
- Search by IP address
- Real-time filtering

## Integration Points

### With DeviceService
The `DeviceConfigurationService` can be integrated with existing `DeviceService`:

```csharp
public class DeviceService
{
    private readonly DeviceConfigurationService _configService;
    
    public DeviceService(DeviceConfigurationService configService)
    {
        _configService = configService;
    }
    
    public async Task SendCommandToDevice(string deviceId, string command)
    {
        var device = _configService.GetDeviceById(deviceId);
        if (device != null && device.IsActive)
        {
            // Send command using device's IP configuration
            await SendToIp(device.IpAddress, device.Port, command);
        }
    }
}
```

### With SignalR Hubs
Real-time device status updates:

```csharp
public async Task BroadcastDeviceStatus(DeviceConnectivityStatus status)
{
    await _hub.Clients.All.SendAsync("DeviceStatusChanged", status);
}
```

## Best Practices

1. **IP Address Format**: Always use valid IP addresses (e.g., 192.168.1.100)
2. **Port Numbers**: Use standard ports for your protocol
3. **Active Status**: Disable devices before removing them
4. **Testing**: Always test connectivity after changing IP
5. **Documentation**: Keep device descriptions updated
6. **Auto-Refresh**: Enable on the monitor dashboard for production
7. **Error Handling**: Check error messages during connectivity tests

## Troubleshooting

### Device Showing as OFFLINE
1. Verify IP address is correct
2. Check network connectivity
3. Ensure port is not blocked by firewall
4. Restart the device

### Port Already in Use
- Change the port number
- Check if another service is using the same port

### Connectivity Timeout
- Increase timeout value (currently 5 seconds)
- Check network latency
- Verify device is powered on

### API Not Responding
- Check if backend service is running
- Verify CORS settings
- Check browser console for errors

## Performance Considerations

- **In-Memory Storage**: Current implementation uses in-memory storage. For production, migrate to database
- **Connectivity Testing**: Runs sequentially; consider async implementation
- **Auto-Refresh**: 30-second interval; adjust based on your needs
- **HTTP Client**: Uses timeout of 5 seconds per device

## Future Enhancements

1. **Database Persistence**: Store configurations in SQL/NoSQL database
2. **Audit Trail**: Log all configuration changes
3. **Device Grouping**: Organize devices by area/zone
4. **Health Alerts**: Email/SMS notifications for device failures
5. **Scheduled Tasks**: Automatic connectivity checks
6. **API Key Management**: Secure device authentication
7. **Configuration Backup**: Export/import configurations
8. **Device Analytics**: Usage statistics and trends
9. **Multi-Tenant Support**: Manage multiple gate systems
10. **Mobile App**: Native mobile app for monitoring

## Support

For issues or questions:
1. Check the error messages in browser console
2. Review API responses
3. Test connectivity using the Test button
4. Check device status on the monitor dashboard
5. Review application logs

---

**Version**: 1.0  
**Last Updated**: June 1, 2026  
**Status**: Production Ready
