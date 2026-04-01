import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../header/header.component';
import { SignalComponent } from '../signal/signal.component';
import { BarrierComponent } from '../barrier/barrier.component';
import { WeighbridgeComponent } from '../weighbridge/weighbridge.component';
import { ScadaService } from '../../services/scada.service';
import { SignalState, BarrierState, WeighbridgeStatus, VehicleStatus } from '../../models/scada.models';

@Component({
  selector: 'app-scada-dashboard',
  standalone: true,
  imports: [CommonModule, HeaderComponent, SignalComponent, BarrierComponent, WeighbridgeComponent],
  templateUrl: './scada-dashboard.component.html',
  styleUrl: './scada-dashboard.component.css'
})
export class ScadaDashboardComponent implements OnInit, OnDestroy {
  readonly SignalState = SignalState;
  readonly BarrierState = BarrierState;
  readonly WeighbridgeStatus = WeighbridgeStatus;
  readonly VehicleStatus = VehicleStatus;

  // Interval-based random UI updates are disabled to keep the simulation deterministic.
  intervalId: any;

  constructor(protected scadaService: ScadaService) {}

  ngOnInit(): void {
    // Intentionally empty: LED messages are controlled by ScadaService simulation workflow.
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  toggleEntrySignal(): void {
    this.scadaService.toggleEntrySignal();
  }

  toggleExitSignal(): void {
    this.scadaService.toggleExitSignal();
  }

  toggleEntryBarrier(): void {
    const currentState = this.scadaService.entryBarrier().state;
    if (currentState === BarrierState.CLOSED) {
      this.scadaService.openEntryBarrier();
    } else {
      this.scadaService.closeEntryBarrier();
    }
  }

  openEntryBarrier(): void {
    this.scadaService.openEntryBarrier();
  }

  closeEntryBarrier(): void {
    this.scadaService.closeEntryBarrier();
  }

  toggleExitBarrier(): void {
    const currentState = this.scadaService.exitBarrier().state;
    if (currentState === BarrierState.CLOSED) {
      this.scadaService.openExitBarrier();
    } else {
      this.scadaService.closeExitBarrier();
    }
  }

  openExitBarrier(): void {
    this.scadaService.openExitBarrier();
  }

  closeExitBarrier(): void {
    this.scadaService.closeExitBarrier();
  }

  updateLedDisplay(): void {
    // Kept for backward compatibility (no input UI currently wired up).
  }

  resetLedMessage(): void {
    this.scadaService.updateLedMessage('No LED message');
  }

  togglePaSystem(): void {
    const currentActive = this.scadaService.paSystem().active;
    this.scadaService.togglePaSystem(!currentActive, !currentActive ? 'PA System Active - Testing' : 'No PA Announcement');
  }

  toggleEntryAnprCamera(): void {
    this.scadaService.toggleEntryAnprCamera();
  }

  toggleExitAnprCamera(): void {
    this.scadaService.toggleExitAnprCamera();
  }

  triggerEntryDetection(): void {
    this.scadaService.simulateEntryVehicleDetection();
  }

  triggerExitDetection(): void {
    this.scadaService.simulateExitVehicleDetection();
  }

  startWeighing(): void {
    this.scadaService.startWeighing();
  }

  startAutomatedCycle(): void {
    this.scadaService.runAutomatedCycle();
  }

  startAutoMode(): void {
    this.scadaService.startAutoMode(10000);
  }

  stopAutoMode(): void {
    this.scadaService.stopAutoMode();
  }

  toggleAutoMode(): void {
    if (this.scadaService.isAutoModeActive()) {
      this.scadaService.stopAutoMode();
    } else {
      // use current interval setting
      this.scadaService.startAutoMode(this.scadaService['autoModeIntervalMs'] || 3000);
    }
  }

  toggleContinuousMode(): void {
    if (this.scadaService.isContinuousModeActive()) {
      this.scadaService.disableContinuousMode();
    } else {
      this.scadaService.enableContinuousMode();
    }
  }

  setRejectionRate(value: number): void {
    this.scadaService.setRejectionProbability(value);
  }

  getRejectionRate(): number {
    return this.scadaService.getRejectionProbability();
  }

  enablePolling(url: string): void {
    this.scadaService.enablePolling(url, 5000);
  }

  disablePolling(): void {
    this.scadaService.disablePolling();
  }

  enableWebSocket(url: string): void {
    this.scadaService.enableWebSocket(url);
  }

  disableWebSocket(): void {
    this.scadaService.disableWebSocket();
  }

  getLogs(): Array<any> {
    return this.scadaService.getVehicleLogs().getValue();
  }


  resetWeighbridge(): void {
    this.scadaService.resetSystem();
  }

  toggleWeighbridge(): void {
    this.scadaService.toggleWeighbridge();
  }
}
