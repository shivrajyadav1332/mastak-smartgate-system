import { Routes } from '@angular/router';
import { ScadaDashboardComponent } from './components/scada-dashboard/scada-dashboard.component';

export const routes: Routes = [
  { path: '', component: ScadaDashboardComponent },
  { path: '**', redirectTo: '' }
];
