import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeviceConfigService, DeviceConnectivityStatus } from '../../services/device-config.service';
import { Subject, interval } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-device-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './device-monitor.component.html',
  styleUrls: ['./device-monitor.component.css']
})
export class DeviceMonitorComponent implements OnInit, OnDestroy {
  statuses: DeviceConnectivityStatus[] = [];
  loading = false;
  error: string | null = null;
  autoRefresh = true;
  lastRefreshed: Date | null = null;

  stats = {
    total: 0,
    online: 0,
    offline: 0,
    uptime: '100%'
  };

  private destroy$ = new Subject<void>();
  private autoRefreshInterval = 30000; // 30 seconds

  constructor(private deviceConfigService: DeviceConfigService) {}

  ngOnInit(): void {
    this.loadStatuses();
    this.setupAutoRefresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupAutoRefresh(): void {
    if (this.autoRefresh) {
      interval(this.autoRefreshInterval)
        .pipe(
          switchMap(() => this.deviceConfigService.getActiveDevicesStatus()),
          takeUntil(this.destroy$)
        )
        .subscribe(
          response => {
            if (response.success) {
              this.statuses = response.data;
              this.updateStats();
              this.lastRefreshed = new Date();
            }
          },
          err => console.error('Auto-refresh error:', err)
        );
    }
  }

  loadStatuses(): void {
    this.loading = true;
    this.error = null;
    this.deviceConfigService.getActiveDevicesStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        response => {
          if (response.success) {
            this.statuses = response.data;
            this.updateStats();
            this.lastRefreshed = new Date();
          } else {
            this.error = 'Failed to load device statuses';
          }
          this.loading = false;
        },
        err => {
          this.error = 'Error loading device statuses: ' + err.message;
          this.loading = false;
        }
      );
  }

  private updateStats(): void {
    this.stats.total = this.statuses.length;
    this.stats.online = this.statuses.filter(s => s.status === 'ONLINE').length;
    this.stats.offline = this.statuses.filter(s => s.status === 'OFFLINE').length;
    
    if (this.stats.total > 0) {
      this.stats.uptime = Math.round((this.stats.online / this.stats.total) * 100) + '%';
    }
  }

  refreshNow(): void {
    this.loadStatuses();
  }

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    if (this.autoRefresh) {
      this.setupAutoRefresh();
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'ONLINE':
        return '✅';
      case 'OFFLINE':
        return '❌';
      default:
        return '❓';
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'ONLINE':
        return 'status-online';
      case 'OFFLINE':
        return 'status-offline';
      default:
        return 'status-unknown';
    }
  }

  getHealthClass(): string {
    const percentage = parseInt(this.stats.uptime);
    if (percentage >= 90) return 'health-good';
    if (percentage >= 70) return 'health-warning';
    return 'health-critical';
  }
}
