Simple Full-Stack Sample (ASP.NET Core Web API + Static HTML)

Run:

1. Open a terminal in the repository root.
2. Start the API (it listens on http://localhost:5001):

```powershell
dotnet run --project FullStackSample\FullStackSample.csproj
```

3. Open the frontend in your browser:

http://localhost:5001/index.html

Notes:
- The API has a `User` model (Id, Name) and a `UserController` at `api/user`.
- CORS is enabled to allow any origin, method, and header.
- The frontend uses `fetch` to POST, GET, PUT, and DELETE vehicles from `http://localhost:5001/api/vehicle`.

SCADA integration:

Add this snippet into your SCADA dashboard JavaScript to auto-refresh recent logs and trigger a lightweight arrival simulation:

```js
function loadRecentLogs() {
	fetch('http://localhost:5001/api/vehicle')
		.then(res => res.json())
		.then(data => {
			const logContainer = document.getElementById('recentLogs');
			if (!logContainer) return;
			logContainer.innerHTML = '';
			data.slice().reverse().forEach(v => {
				logContainer.innerHTML += `<div>${new Date(v.entryTime).toLocaleString()} - ${v.plateNumber}</div>`;
			});
			// optional: trigger simulation for the latest vehicle
			if (data.length > 0) {
				const latest = data[data.length - 1];
				simulateVehicleArrival && simulateVehicleArrival(latest.plateNumber);
			}
		});
}

setInterval(loadRecentLogs, 2000);
```

This calls the Vehicle API and updates an element with id `recentLogs`. It also calls `simulateVehicleArrival(plate)` if available in the SCADA page to trigger animations or barrier logic.
