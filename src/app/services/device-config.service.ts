import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

export interface DeviceConfig {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  ipAddress: string;
  port: number;
  protocol: string;
  isActive: boolean;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DeviceConnectivityStatus {
  deviceId: string;
  deviceName: string;
  isReachable: boolean;
  status: string;
  errorMessage?: string;
  checkedAt: Date;
  responseTime: number;
}

@Injectable({
  providedIn: 'root'
})
export class DeviceConfigService {
  private apiUrl = '/api/devices';
  private devicesSubject = new BehaviorSubject<DeviceConfig[]>([]);
  public devices$ = this.devicesSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadAllDevices();
  }

  /**
   * Load all device configurations
   */
  loadAllDevices(): void {
    this.getAllDevices().subscribe(
      response => {
        if (response.success) {
          this.devicesSubject.next(response.data);
        }
      },
      error => console.error('Failed to load devices', error)
    );
  }

  /**
   * Get all devices
   */
  getAllDevices(): Observable<any> {
    return this.http.get<any>(this.apiUrl);
  }

  /**
   * Get device by ID
   */
  getDeviceById(deviceId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${deviceId}`);
  }

  /**
   * Get devices by type
   */
  getDevicesByType(deviceType: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/type/${deviceType}`);
  }

  /**
   * Create new device
   */
  createDevice(device: Partial<DeviceConfig>): Observable<any> {
    return this.http.post<any>(this.apiUrl, device);
  }

  /**
   * Update device configuration
   */
  updateDevice(deviceId: string, device: Partial<DeviceConfig>): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${deviceId}`, device);
  }

  /**
   * Update only IP address
   */
  updateDeviceIp(deviceId: string, ipAddress: string, port?: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${deviceId}/ip`, { ipAddress, port });
  }

  /**
   * Delete device
   */
  deleteDevice(deviceId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${deviceId}`);
  }

  /**
   * Test connectivity to a device
   */
  testDeviceConnectivity(deviceId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${deviceId}/test`, {});
  }

  /**
   * Test all devices
   */
  testAllDevices(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/test/all`, {});
  }

  /**
   * Get active devices status
   */
  getActiveDevicesStatus(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/status/active`);
  }

  /**
   * Get device statistics
   */
  getDeviceStatistics(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats`);
  }

  /**
   * Lookup device by IP address
   */
  getDeviceByIp(ipAddress: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/lookup/${ipAddress}`);
  }
}
