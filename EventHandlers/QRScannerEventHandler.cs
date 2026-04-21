using System.Threading.Tasks;

namespace WeighbridgeMockAPIReplica.EventHandlers
{
    public class QRScanEvent
    {
        public string QRCode { get; set; } = "MOCK-QR";
    }

    public class QRScannerEventHandler
    {
        public QRScanEvent GenerateMockQRScan()
        {
            return new QRScanEvent { QRCode = "MOCK-QR-123" };
        }

        public Task RaiseQRScanEventAsync(QRScanEvent e)
        {
            // minimal stub
            return Task.CompletedTask;
        }
    }
}
