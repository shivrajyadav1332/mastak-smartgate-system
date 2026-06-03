# Quick Start Guide - Device IP Configuration

## 🚀 Getting Started

### Step 1: Run the Application

```bash
# Terminal 1: Start backend (.NET)
cd FullStackSample
dotnet run

# Terminal 2: Start frontend (Angular)
npm start
```

### Step 2: Access Device Configuration UI

Navigate to these URLs in your browser:

- **Device Configuration Manager**: `http://localhost:4200/devices/config`
- **Device Monitor Dashboard**: `http://localhost:4200/devices/monitor`

### Step 3: View Default Devices

You'll see 8 pre-configured devices:

```
📷 ANPR Camera - Entry
🚪 Boom Barrier - Entry / Exit (2 barriers)
📺 LED Display - Entry / Exit (2 displays)
⚖️ Weighbridge Scale
🚦 Traffic Signals - Entry / Exit (2 signals)
```

## 📝 Common Tasks

### Change a Device IP Address

1. Open **Device Configuration** page
2. Click "✏️ Edit" on any device card
3. Update the IP address field
4. Click "Update Device"
5. Click "🔗 Test" to verify connectivity

### Add a New Device

1. Click "➕ Add New Device"
2. Fill in the form:
   - Device Name: e.g., "ANPR Camera - Exit"
   - Device Type: Select from dropdown
   - IP Address: e.g., "192.168.1.150"
   - Port: Default port depends on device type
   - Protocol: Select appropriate protocol
   - Description: (optional)
3. Click "Create Device"

### Test Device Connectivity

**Option 1: Individual Device**
1. Go to **Device Configuration**
2. Find the device
3. Click "🔗 Test" button
4. Check the status popup

**Option 2: All Devices**
1. Go to **Device Monitor**
2. Click "🔄 Refresh Now"
3. View status table

### Monitor System Health

1. Open **Device Monitor** page
2. View the stats dashboard:
   - Total Devices
   - Online devices
   - Offline devices
   - System Uptime %
3. Enable "Auto-refresh every 30 seconds" for continuous monitoring

### Filter Devices

1. On **Device Configuration** page
2. Use "Filter by Type" dropdown
3. Or type in search box (searches by name/IP)

## 🔌 API Quick Reference

### Check All Devices Status

```bash
curl http://localhost:5001/api/devices
```

### Get Specific Device

```bash
curl http://localhost:5001/api/devices/anpr_001
```

### Update IP Address

```bash
curl -X PATCH http://localhost:5001/api/devices/anpr_001/ip \
  -H "Content-Type: application/json" \
  -d '{"ipAddress": "192.168.1.110", "port": 8080}'
```

### Test Connectivity

```bash
curl -X POST http://localhost:5001/api/devices/anpr_001/test
```

### Get System Statistics

```bash
curl http://localhost:5001/api/devices/stats
```

## 🎯 Default IP Mapping

| Device | ID | IP Address | Port | Protocol |
|--------|----|----|------|----------|
| ANPR Camera | anpr_001 | 192.168.1.100 | 8080 | HTTP |
| Barrier Entry | barrier_entry | 192.168.1.101 | 502 | MODBUS |
| Barrier Exit | barrier_exit | 192.168.1.102 | 502 | MODBUS |
| LED Entry | led_entry | 192.168.1.103 | 8081 | HTTP |
| LED Exit | led_exit | 192.168.1.104 | 8081 | HTTP |
| Weighbridge | weigh_bridge | 192.168.1.105 | 502 | MODBUS |
| Signal Entry | signal_entry | 192.168.1.106 | 502 | MODBUS |
| Signal Exit | signal_exit | 192.168.1.107 | 502 | MODBUS |

## ⚙️ Configuration Files

### Backend (`FullStackSample/appsettings.json`)
```json
{
  "DeviceConfiguration": {
    "Devices": [
      {
        "DeviceId": "anpr_001",
        "DeviceName": "ANPR Camera - Entry",
        "IpAddress": "192.168.1.100",
        "Port": 8080
      }
    ]
  }
}
```

### Frontend Routes (`src/app/app.routes.ts`)
```typescript
{
  path: 'devices/config',
  component: DeviceConfigComponent
},
{
  path: 'devices/monitor',
  component: DeviceMonitorComponent
}
```

## 🐛 Troubleshooting

### Device shows "OFFLINE"
- Verify device IP is correct and reachable
- Check if device is powered on
- Ping the device from command line: `ping 192.168.1.100`
- Check firewall settings

### Can't access UI components
- Ensure Angular app is running: `npm start`
- Check URL: `http://localhost:4200`
- Clear browser cache: Press Ctrl+Shift+Delete

### API returns 404
- Verify backend is running on port 5001
- Check API endpoint paths
- Ensure controllers are properly mapped

### Changes not persisting
- Current implementation uses in-memory storage
- Changes reset when backend restarts
- To persist: Migrate to database (SQL Server/SQLite)

## 📚 File Structure

```
FullStackSample/
├── Models/
│   └── DeviceConfig.cs          # Device models
├── Services/
│   └── DeviceConfigurationService.cs  # Device management logic
├── Controllers/
│   └── DeviceConfigController.cs       # REST API endpoints
└── appsettings.json                    # Configuration

src/app/
├── services/
│   └── device-config.service.ts        # HTTP client service
├── components/
│   ├── device-config/                  # Device configuration UI
│   │   ├── device-config.component.ts
│   │   ├── device-config.component.html
│   │   └── device-config.component.css
│   └── device-monitor/                 # Monitoring dashboard
│       ├── device-monitor.component.ts
│       ├── device-monitor.component.html
│       └── device-monitor.component.css
```

## 🔒 Security Notes

1. Currently no authentication required
2. Add JWT/API key authentication for production
3. Validate all IP addresses
4. Use HTTPS in production
5. Implement rate limiting for test endpoints

## 📈 Next Steps

1. Integrate with your existing DeviceService
2. Add database persistence
3. Implement authentication
4. Add audit logging
5. Create device command interface
6. Set up alerts/notifications
7. Add scheduling for auto-tests

---

**For detailed documentation**, see [DEVICE_IP_CONFIGURATION.md](./DEVICE_IP_CONFIGURATION.md)
