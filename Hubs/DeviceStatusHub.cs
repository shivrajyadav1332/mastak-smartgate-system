using Microsoft.AspNetCore.SignalR;
using System.Threading;

namespace WeighbridgeMockAPIReplica.Hubs
{
    public class DeviceStatusHub : Hub
    {
        // Thread-safe counter of connected clients for diagnostics
        private static int _connectionCount = 0;

        public static int ConnectionCount => _connectionCount;

        public override Task OnConnectedAsync()
        {
            Interlocked.Increment(ref _connectionCount);
            return base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception? exception)
        {
            Interlocked.Decrement(ref _connectionCount);
            return base.OnDisconnectedAsync(exception);
        }
    }
}
