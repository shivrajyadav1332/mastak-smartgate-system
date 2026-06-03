namespace FullStackSample.Models
{
    /// <summary>
    /// Configuration for a specific hardware device/component
    /// </summary>
    public class DeviceConfig
    {
        public string DeviceId { get; set; } = string.Empty;
        public string DeviceName { get; set; } = string.Empty;
        public string DeviceType { get; set; } = string.Empty; // ANPR, BOOM_BARRIER, LED_MESSAGE, WEIGH_BRIDGE, SIGNAL
        public string IpAddress { get; set; } = string.Empty;
        public int Port { get; set; } = 80;
        public string Protocol { get; set; } = "HTTP"; // HTTP, HTTPS, TCP, MODBUS
        public bool IsActive { get; set; } = true;
        public string? Description { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
    }

    /// <summary>
    /// Request model for creating/updating device configuration
    /// </summary>
    public class DeviceConfigRequest
    {
        public string DeviceName { get; set; } = string.Empty;
        public string DeviceType { get; set; } = string.Empty; // ANPR, BOOM_BARRIER, LED_MESSAGE, WEIGH_BRIDGE, SIGNAL
        public string IpAddress { get; set; } = string.Empty;
        public int Port { get; set; } = 80;
        public string Protocol { get; set; } = "HTTP";
        public bool IsActive { get; set; } = true;
        public string? Description { get; set; }
    }

    /// <summary>
    /// Device types enum
    /// </summary>
    public enum DeviceType
    {
        ANPR,
        BOOM_BARRIER,
        LED_MESSAGE,
        WEIGH_BRIDGE,
        SIGNAL
    }

    /// <summary>
    /// Response model for device status/connectivity test
    /// </summary>
    public class DeviceConnectivityStatus
    {
        public string DeviceId { get; set; } = string.Empty;
        public string DeviceName { get; set; } = string.Empty;
        public bool IsReachable { get; set; }
        public string Status { get; set; } = "UNKNOWN"; // ONLINE, OFFLINE, ERROR
        public string? ErrorMessage { get; set; }
        public DateTime CheckedAt { get; set; } = DateTime.UtcNow;
        public int ResponseTime { get; set; } = 0; // milliseconds
    }

    /// <summary>
    /// Device communication request model
    /// </summary>
    public class DeviceCommunicationRequest
    {
        public string DeviceId { get; set; } = string.Empty;
        public string Command { get; set; } = string.Empty;
        public Dictionary<string, object>? Parameters { get; set; }
    }

    /// <summary>
    /// Device communication response model
    /// </summary>
    public class DeviceCommunicationResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public object? Data { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}
