import { Component } from '@angular/core';
import { ScadaDashboardComponent } from './components/scada-dashboard/scada-dashboard.component';

@Component({
  selector: 'app-root',
  imports: [ScadaDashboardComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
