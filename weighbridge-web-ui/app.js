// Minimal client for Weighbridge Mock API + SignalR
const API_BASE = 'http://localhost:5001';
const HUB_URL = API_BASE + '/deviceStatusHub';

function log(msg) {
  const el = document.getElementById('logs');
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.innerText = line + '\n' + el.innerText;
}

function updateState(s) {
  if (!s) return;
  document.getElementById('plateDisplay').innerText = s.currentTruckPlate ?? '—';
  document.getElementById('entrySignal').innerText = s.entrySignal ?? '—';
  document.getElementById('exitSignal').innerText = s.exitSignal ?? '—';
  document.getElementById('entryBarrier').innerText = s.entryBarrier ?? '—';
  document.getElementById('exitBarrier').innerText = s.exitBarrier ?? '—';
  document.getElementById('weight').innerText = s.currentWeight ?? '—';
  document.getElementById('mode').innerText = s.mode ?? '—';
}

async function fetchStatus() {
  try {
    const resp = await fetch(API_BASE + '/api/system/status');
    if (!resp.ok) throw new Error('status fetch failed: ' + resp.status);
    const json = await resp.json();
    updateState(json);
    log('Fetched initial system status');
  } catch (e) {
    log('Error fetching status: ' + e.message);
  }
}

async function sendArrival(plate) {
  try {
    const url = `${API_BASE}/api/vehicle/arrive/${encodeURIComponent(plate)}`;
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) throw new Error(resp.status + ' ' + resp.statusText);
    const json = await resp.json();
    updateState(json);
    log('Arrival triggered: ' + plate);
  } catch (e) {
    log('Arrival error: ' + e.message);
  }
}

// SignalR connection
const connection = new signalR.HubConnectionBuilder()
  .withUrl(HUB_URL)
  .configureLogging(signalR.LogLevel.Information)
  .build();

connection.on('SystemStateChanged', state => {
  updateState(state);
  log('SystemStateChanged received');
});
connection.on('EntrySignalChanged', v => { document.getElementById('entrySignal').innerText = v; log('EntrySignalChanged: '+v); });
connection.on('ExitSignalChanged', v => { document.getElementById('exitSignal').innerText = v; log('ExitSignalChanged: '+v); });
connection.on('EntryBarrierChanged', v => { document.getElementById('entryBarrier').innerText = v; log('EntryBarrierChanged: '+v); });
connection.on('ExitBarrierChanged', v => { document.getElementById('exitBarrier').innerText = v; log('ExitBarrierChanged: '+v); });
connection.on('LogMessage', v => { log('Server: ' + v); });

connection.start()
  .then(() => {
    log('Connected to SignalR hub');
    fetchStatus();
  })
  .catch(err => log('SignalR connect error: ' + err.toString()));

// Bind UI
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('arriveBtn').addEventListener('click', () => {
    const plate = document.getElementById('plate').value || 'TEST-0001';
    sendArrival(plate);
  });
});
