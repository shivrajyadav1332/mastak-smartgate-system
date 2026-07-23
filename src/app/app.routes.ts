import { Routes } from '@angular/router';
import { ScadaDashboardComponent } from './components/scada-dashboard/scada-dashboard.component';
import { DeviceConfigComponent } from './components/device-config/device-config.component';
import { DeviceMonitorComponent } from './components/device-monitor/device-monitor.component';

export const routes: Routes = [
  { path: '', component: ScadaDashboardComponent },
  { path: 'devices/config', component: DeviceConfigComponent },
  { path: 'devices/monitor', component: DeviceMonitorComponent },
  { path: '**', redirectTo: '' }
];
