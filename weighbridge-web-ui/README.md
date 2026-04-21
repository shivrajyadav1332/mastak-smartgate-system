# Weighbridge Mock UI (minimal)

This folder contains a minimal static UI used to exercise the Weighbridge Mock API and SignalR hub.

How to use:

- Open weighbridge-web-ui/index.html in your browser (Chrome/Edge). The page will connect to http://localhost:5001/deviceStatusHub and call /api/system/status on load.
- Trigger a demo arrival by entering a plate and clicking Trigger Arrival (sends POST /api/vehicle/arrive/{plate}).

If you prefer a local static server (recommended for CORS), run one from this folder, for example:

python -m http.server 8080
