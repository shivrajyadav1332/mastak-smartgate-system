using System.Threading.Tasks;

namespace WeighbridgeMockAPIReplica.EventHandlers
{
    public class AnprEvent
    {
        public EventInfo EventInfo { get; set; } = new EventInfo();
    }

    public class EventInfo
    {
        public string Text { get; set; } = "MOCK-PLATE";
    }

    public class AnprEventHandler
    {
        public AnprEvent GenerateMockAnprEvent()
        {
            return new AnprEvent { EventInfo = new EventInfo { Text = "MOCK-123" } };
        }

        public Task RaiseAnprEventAsync(AnprEvent e)
        {
            // minimal stub: in real project this would broadcast to SignalR or persist
            return Task.CompletedTask;
        }
    }
}
