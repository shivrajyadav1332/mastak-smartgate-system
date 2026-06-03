import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeviceConfigService, DeviceConfig } from '../../services/device-config.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-device-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './device-config.component.html',
  styleUrls: ['./device-config.component.css']
})
export class DeviceConfigComponent implements OnInit, OnDestroy {
  devices: DeviceConfig[] = [];
  filteredDevices: DeviceConfig[] = [];
  loading = false;
  error: string | null = null;
  selectedDeviceType = 'ALL';
  searchQuery = '';

  // Modal control
  showModal = false;
  isEditMode = false;
  selectedDevice: Partial<DeviceConfig> = {};

  deviceTypes = ['ANPR', 'BOOM_BARRIER', 'LED_MESSAGE', 'WEIGH_BRIDGE', 'SIGNAL'];

  private destroy$ = new Subject<void>();

  constructor(private deviceConfigService: DeviceConfigService) {}

  ngOnInit(): void {
    this.loadDevices();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDevices(): void {
    this.loading = true;
    this.error = null;
    this.deviceConfigService.getAllDevices()
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        response => {
          if (response.success) {
            this.devices = response.data;
            this.filterDevices();
          } else {
            this.error = 'Failed to load devices';
          }
          this.loading = false;
        },
        err => {
          this.error = 'Error loading devices: ' + err.message;
          this.loading = false;
        }
      );
  }

  filterDevices(): void {
    this.filteredDevices = this.devices.filter(device => {
      const matchesType = this.selectedDeviceType === 'ALL' || device.deviceType === this.selectedDeviceType;
      const matchesSearch = device.deviceName.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                           device.ipAddress.includes(this.searchQuery);
      return matchesType && matchesSearch;
    });
  }

  onDeviceTypeChange(): void {
    this.filterDevices();
  }

  onSearch(): void {
    this.filterDevices();
  }

  openAddModal(): void {
    this.isEditMode = false;
    this.selectedDevice = {
      deviceName: '',
      deviceType: this.deviceTypes[0],
      ipAddress: '',
      port: 80,
      protocol: 'HTTP',
      isActive: true,
      description: ''
    };
    this.showModal = true;
  }

  openEditModal(device: DeviceConfig): void {
    this.isEditMode = true;
    this.selectedDevice = { ...device };
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedDevice = {};
  }

  saveDevice(): void {
    if (!this.selectedDevice.deviceName || !this.selectedDevice.ipAddress) {
      this.error = 'Please fill in all required fields';
      return;
    }

    this.loading = true;
    const request = {
      deviceName: this.selectedDevice.deviceName,
      deviceType: this.selectedDevice.deviceType,
      ipAddress: this.selectedDevice.ipAddress,
      port: this.selectedDevice.port || 80,
      protocol: this.selectedDevice.protocol || 'HTTP',
      isActive: this.selectedDevice.isActive !== false,
      description: this.selectedDevice.description
    };

    if (this.isEditMode && this.selectedDevice.deviceId) {
      this.deviceConfigService.updateDevice(this.selectedDevice.deviceId, request)
        .pipe(takeUntil(this.destroy$))
        .subscribe(
          response => {
            if (response.success) {
              this.loadDevices();
              this.closeModal();
              this.error = null;
            }
            this.loading = false;
          },
          err => {
            this.error = 'Error saving device: ' + err.message;
            this.loading = false;
          }
        );
    } else {
      this.deviceConfigService.createDevice(request)
        .pipe(takeUntil(this.destroy$))
        .subscribe(
          response => {
            if (response.success) {
              this.loadDevices();
              this.closeModal();
              this.error = null;
            }
            this.loading = false;
          },
          err => {
            this.error = 'Error creating device: ' + err.message;
            this.loading = false;
          }
        );
    }
  }

  deleteDevice(device: DeviceConfig): void {
    if (!confirm(`Delete device "${device.deviceName}"?`)) {
      return;
    }

    this.loading = true;
    this.deviceConfigService.deleteDevice(device.deviceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        response => {
          if (response.success) {
            this.loadDevices();
            this.error = null;
          }
          this.loading = false;
        },
        err => {
          this.error = 'Error deleting device: ' + err.message;
          this.loading = false;
        }
      );
  }

  testConnectivity(device: DeviceConfig): void {
    const originalStatus = device;
    this.deviceConfigService.testDeviceConnectivity(device.deviceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        response => {
          if (response.success) {
            const status = response.data;
            alert(`Device: ${status.deviceName}\nStatus: ${status.status}\nResponse Time: ${status.responseTime}ms`);
          }
        },
        err => {
          alert('Error testing device: ' + err.message);
        }
      );
  }

  getStatusClass(device: DeviceConfig): string {
    return device.isActive ? 'status-active' : 'status-inactive';
  }

  getTypeIcon(deviceType: string): string {
    const icons: { [key: string]: string } = {
      'ANPR': '📷',
      'BOOM_BARRIER': '🚪',
      'LED_MESSAGE': '📺',
      'WEIGH_BRIDGE': '⚖️',
      'SIGNAL': '🚦'
    };
    return icons[deviceType] || '🔧';
  }
}
