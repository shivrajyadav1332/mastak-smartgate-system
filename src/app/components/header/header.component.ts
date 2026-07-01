import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScadaService } from '../../services/scada.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentDate = '';
  currentTime = '';
  private timerId: any;

  constructor(protected scadaService: ScadaService) {}

  ngOnInit() {
    this.updateDateTime();
    this.timerId = setInterval(() => {
      this.updateDateTime();
    }, 1000);
  }

  ngOnDestroy() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
  }

  private updateDateTime() {
    const now = new Date();
    // Format: "April 27, 2026"
    this.currentDate = now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    // Format: "10:22:13 AM"
    this.currentTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  isOnline(): boolean {
    const status = (this.scadaService.systemStatus() || '').toLowerCase();
    return !status.includes('offline') && !status.includes('reject') && !status.includes('error');
  }
}
