import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from '../header/header.component';
import { SignalComponent } from '../signal/signal.component';
import { BarrierComponent } from '../barrier/barrier.component';
import { WeighbridgeComponent } from '../weighbridge/weighbridge.component';
import { ScadaService } from '../../services/scada.service';
import { SignalState, BarrierState, WeighbridgeStatus, VehicleStatus } from '../../models/scada.models';

@Component({
  selector: 'app-scada-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, SignalComponent, BarrierComponent, WeighbridgeComponent],
  templateUrl: './scada-dashboard.component.html',
  styleUrl: './scada-dashboard.component.css'
})
export class ScadaDashboardComponent implements OnInit, OnDestroy {
  readonly SignalState = SignalState;
  readonly BarrierState = BarrierState;
  readonly WeighbridgeStatus = WeighbridgeStatus;
  readonly VehicleStatus = VehicleStatus;

  intervalId: any;
  pollIntervalId: any;
  logs: any[] = [];
  entryBarrierOpen = false;
  entrySignal = 'RED';
  currentTruck = '';
  weight = 0;
  displayedWeight = 0;
  plateNumber = '';
  currentPlate = '';
  truckPosition = 0; // 0 = start, 50 = center, 100 = exit
  barrierEntry = 'CLOSED';
  barrierExit = 'CLOSED';
  ledMessage = '';
  paMessage = '';
  vehicleStatusText = '';
  filterStatus: 'all' | 'processed' | 'rejected' | 'accepted' = 'all';
  filterTerm = '';

  private logsSub: any;
  private vehicleTriggerSub: any;
  private animFrame: any = null;
  private weightAnimFrame: any = null;
  private lastVehicleStatus: any = null;
  lastProcessedId = 0;
  private checkIntervalId: any;
  private isProcessingVehicle = false;
  // Allowed plates editor
  allowedPlatesText = '';
  allowedPlatesMessage = '';

  constructor(protected scadaService: ScadaService) {}

  ngOnInit(): void {
    // Subscribe to logs (BehaviorSubject) for immediate updates
    this.logsSub = this.scadaService.getVehicleLogs().subscribe((list: any[]) => {
      this.logs = list || [];
    });

    // Poll the service state at a short interval to update UI bindings from the centralized state machine
    this.intervalId = setInterval(() => this.syncFromService(), 300);

    // Initial load of backend vehicles and start auto-refresh every 2s
    this.loadLogs();
    // Use checkNewVehicle to both refresh and trigger processing
    this.checkIntervalId = setInterval(() => this.checkNewVehicle(), 2000);
    // Poll the latest single-vehicle control endpoint every 2 seconds
    this.pollIntervalId = setInterval(() => this.loadControl(), 2000);

    // Listen for external triggers (vehicle input component)
    this.vehicleTriggerSub = this.scadaService.vehicleTrigger$.subscribe((plate: string) => {
      try { this.checkVehicleAndUpdate(plate); } catch (e) { }
    });

    // load allowed plates into editor
    this.loadAllowedPlates();
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.logsSub) this.logsSub.unsubscribe?.();
    if (this.pollIntervalId) clearInterval(this.pollIntervalId);
    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
    if (this.vehicleTriggerSub) this.vehicleTriggerSub.unsubscribe?.();
  }

  private syncFromService(): void {
    try {
      const vs = this.scadaService.vehicleStatus();
      // When vehicle status changes, animate the truck to the target position
      if (vs !== this.lastVehicleStatus) {
        if (vs === VehicleStatus.EXITED) this.animateTruckTo(100);
        else if (vs === VehicleStatus.POSITIONING || vs === VehicleStatus.WEIGHING || vs === VehicleStatus.READY || vs === VehicleStatus.VALIDATED || vs === VehicleStatus.ARRIVED) this.animateTruckTo(50);
        else this.animateTruckTo(0);
        this.lastVehicleStatus = vs;
      }

      const eb = this.scadaService.entryBarrier();
      const xb = this.scadaService.exitBarrier();
      this.barrierEntry = eb.state;
      this.barrierExit = xb.state;

      const wb = this.scadaService.weighbridge();
      // animate displayed weight toward service weight
      this.animateWeightTo(wb.weight || 0);

      const led = this.scadaService.ledDisplay();
      this.ledMessage = led?.message || '';

      const pa = this.scadaService.paSystem();
      this.paMessage = pa?.message || '';

      this.vehicleStatusText = vs;
    } catch (e) {
      // ignore transient read errors
    }
  }

  private animateTruckTo(targetPercent: number, duration = 900) {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    const start = performance.now();
    const from = this.truckPosition;
    const diff = targetPercent - from;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeInOutQuad
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.truckPosition = Math.round((from + diff * eased) * 100) / 100;
      if (t < 1) this.animFrame = requestAnimationFrame(step);
      else this.animFrame = null;
    };

    this.animFrame = requestAnimationFrame(step);
  }

  private animateWeightTo(targetWeight: number, duration = 800) {
    if (this.weightAnimFrame) cancelAnimationFrame(this.weightAnimFrame);
    const start = performance.now();
    const from = this.displayedWeight || 0;
    const diff = targetWeight - from;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.displayedWeight = Math.round((from + diff * eased) * 10) / 10;
      if (t < 1) this.weightAnimFrame = requestAnimationFrame(step);
      else this.weightAnimFrame = null;
    };

    this.weightAnimFrame = requestAnimationFrame(step);
  }

  get filteredLogs() {
    const term = (this.filterTerm || '').trim().toLowerCase();
    return (this.logs || []).filter(l => {
      const status = (l.status || l.event || '').toString().toLowerCase();
      if (this.filterStatus !== 'all') {
        if (this.filterStatus === 'processed' && status !== 'processed' && status !== 'accepted') return false;
        if (this.filterStatus === 'rejected' && status !== 'rejected' && status !== 'invalid') return false;
        if (this.filterStatus === 'accepted' && status !== 'accepted' && status !== 'processed') return false;
      }
      if (!term) return true;
      return (l.plate || l.plateNumber || '').toString().toLowerCase().includes(term) || (l.consignment || '').toString().toLowerCase().includes(term);
    });
  }

  // UI actions simply delegate to the central service/state machine
  toggleEntrySignal(): void { this.scadaService.toggleEntrySignal(); }
  toggleExitSignal(): void { this.scadaService.toggleExitSignal(); }
  toggleEntryBarrier(): void { const s = this.scadaService.entryBarrier().state; s === BarrierState.CLOSED ? this.scadaService.openEntryBarrier() : this.scadaService.closeEntryBarrier(); }
  toggleExitBarrier(): void { const s = this.scadaService.exitBarrier().state; s === BarrierState.CLOSED ? this.scadaService.openExitBarrier() : this.scadaService.closeExitBarrier(); }
  togglePaSystem(): void { const active = this.scadaService.paSystem().active; this.scadaService.togglePaSystem(!active, !active ? 'PA System Active - Testing' : 'No PA Announcement'); }
  triggerEntryDetection(): void { this.scadaService.simulateEntryVehicleDetection(); }
  triggerExitDetection(): void { this.scadaService.simulateExitVehicleDetection(); }
  toggleWeighbridge(): void { this.scadaService.toggleWeighbridge(); }

  // Submit a specific plate to the centralized state machine. The service will run the full state flow.
  submitPlate(): void {
    if (!this.plateNumber) return;
    // inject detected plate for the camera and start a processing cycle using that plate
    try {
      this.scadaService.entryAnprCamera.update(c => ({ ...c, detectedPlate: this.plateNumber, confidence: 95, lastDetection: new Date() }));
    } catch {}
    // call backend check and update local UI state
    this.checkVehicleAndUpdate(this.plateNumber);
    this.scadaService.simulateSingleVehicleCycle(this.plateNumber);
    // Also run local simulation against hardcoded allowed plates for quick testing
    this.simulateBarrier(this.plateNumber);
    // clear input for convenience
    this.plateNumber = '';
  }

  loadAllowedPlates(): void {
    try {
      this.scadaService.getAllowedPlates().subscribe({
        next: (res: string[]) => {
          this.allowedPlatesText = (res || []).join('\n');
          this.allowedPlatesMessage = 'Loaded';
          setTimeout(() => this.allowedPlatesMessage = '', 2000);
        },
        error: () => { this.allowedPlatesMessage = 'Unable to load'; }
      });
    } catch (e) { this.allowedPlatesMessage = 'Error'; }
  }

  saveAllowedPlates(): void {
    const lines = (this.allowedPlatesText || '').split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
    this.scadaService.setAllowedPlates(lines).subscribe({
      next: (res: any) => { this.allowedPlatesMessage = 'Saved'; setTimeout(() => this.allowedPlatesMessage = '', 2000); },
      error: () => { this.allowedPlatesMessage = 'Save failed'; }
    });
  }

  checkVehicleAndUpdate(plate: string): void {
    if (!plate) return;
    this.scadaService.checkVehicle(plate).subscribe({
      next: (res: any) => {
        if (res.status === 'ACCEPTED') {
          this.entryBarrierOpen = true;
          this.entrySignal = 'GREEN';
        } else {
          this.entryBarrierOpen = false;
          this.entrySignal = 'RED';
        }

        // push log into central store for UI
        try { this.scadaService.pushLog({ plateNumber: plate, status: res.status, time: new Date(), weight: res.weight ?? null }); } catch (e) {}
      },
      error: () => {}
    });
  }

  simulateBarrier(plate: string) {

    const allowedPlates = [
      'ABC-1234',
      'XYZ-9999',
      'MH12-AB1234',
      'DL01-CD5678',
      'KA05-EF4321'
    ];

    if (allowedPlates.includes(plate)) {

      // ✅ ACCEPTED
      this.entrySignal = 'GREEN';
      this.entryBarrierOpen = true;
      this.currentTruck = plate;

      this.logs.push(`${plate} - ACCEPTED`);

      // Auto close after 3 sec
      setTimeout(() => {
        this.entryBarrierOpen = false;
      }, 3000);

    } else {

      // ❌ REJECTED
      this.entrySignal = 'RED';
      this.entryBarrierOpen = false;
      this.currentTruck = plate;

      this.logs.push(`${plate} - REJECTED`);
    }
  }

  loadLogs(): void {
    this.scadaService.getVehicles().subscribe({
      next: (data: any) => {
        this.logs = data || [];
        if (this.logs && this.logs.length > 0) {
          // backend returns most recent first
          this.currentPlate = this.logs[0].plateNumber || this.logs[0].plate || '';
        } else {
          this.currentPlate = '';
        }
      },
      error: () => { this.currentPlate = ''; }
    });
  }

  checkNewVehicle(): void {
    if (this.isProcessingVehicle) return;

    this.scadaService.getVehicles().subscribe({
      next: (data: any) => {
        this.logs = data || [];
        if (this.logs.length > 0) {
          const latest = this.logs[0];
          if (latest.id && latest.id !== this.lastProcessedId) {
            this.lastProcessedId = latest.id;
            this.processVehicle(latest);
          }
          // update currentPlate always
          this.currentPlate = latest.plateNumber || latest.plate || '';
        }
      },
      error: () => {}
    });
  }

  async processVehicle(vehicle: any): Promise<void> {
    if (!vehicle) return;
    if (this.isProcessingVehicle) return;
    this.isProcessingVehicle = true;

    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    try {
      this.vehicleStatusText = vehicle.status;
      this.currentPlate = vehicle.plateNumber || vehicle.plate || '';

      // STEP 1: indicate green and open entry barrier
      this.scadaService.setEntrySignal(SignalState.GREEN);
      await sleep(150);
      this.scadaService.openEntryBarrier();
      // wait for barrier animation to progress
      await sleep(1000);

      // STEP 2: move truck to center
      this.animateTruckTo(50, 1000);
      await sleep(1200);

      // STEP 3: close entry barrier
      this.scadaService.closeEntryBarrier();
      this.scadaService.setEntrySignal(SignalState.RED);
      await sleep(300);

      // STEP 4: start weighing (service will simulate and set weighbridge weight)
      this.scadaService.startWeighing();
      // wait for weighing to complete (service simulate takes ~3s)
      await sleep(3200);
      const wb = this.scadaService.weighbridge();

      // push a log entry for this vehicle (ensures `plateNumber` property exists)
      this.scadaService.pushLog({ plateNumber: this.currentPlate, status: vehicle.status, time: new Date(), weight: wb.weight || null });

      // STEP 5: decision: ACCEPTED -> open exit and let truck exit, else return
      if ((vehicle.status || '').toString().toUpperCase() === 'ACCEPTED') {
        this.scadaService.setExitSignal(SignalState.GREEN);
        await sleep(150);
        this.scadaService.openExitBarrier();
        await sleep(600);

        this.animateTruckTo(100, 1000);
        await sleep(1400);

        // finalize exit
        this.scadaService.closeExitBarrier();
        this.scadaService.setExitSignal(SignalState.RED);
      } else {
        // rejected: send truck back to start
        await sleep(200);
        this.animateTruckTo(0, 800);
        await sleep(900);
      }

      // cleanup: reset weighbridge and messages
      this.scadaService.resetWeighbridge();
      this.scadaService.updateLedMessage('NO LED MESSAGE');

    } catch (e) {
      console.warn('processVehicle failed', e);
    } finally {
      this.isProcessingVehicle = false;
    }
  }


  // Convenience wrappers used by template buttons
  openEntryBarrier(): void { this.scadaService.openEntryBarrier(); }
  closeEntryBarrier(): void { this.scadaService.closeEntryBarrier(); }
  openExitBarrier(): void { this.scadaService.openExitBarrier(); }
  closeExitBarrier(): void { this.scadaService.closeExitBarrier(); }
  startAutomatedCycle(): void { this.scadaService.runAutomatedCycle(); }
  resetWeighbridge(): void { this.scadaService.resetSystem(); }

  // Polling-based control loader: queries latest vehicle and updates UI
  loadControl(): void {
    fetch('http://localhost:5001/api/vehicle/latest')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then((data: any) => {
        console.log('API DATA:', data);

        // SIGNAL
        if (data.signal === 'GREEN') {
          this.setGreenSignal();
        } else {
          this.setRedSignal();
        }

        // Reset barrier element first to avoid clipped transforms
        const el = document.getElementById('entryBarrier');
        if (el) {
          el.style.transform = 'rotate(0deg)';
        }

        // Apply new state after a tiny delay so reset takes effect
        setTimeout(() => {
          if (data.barrier === 'OPEN') {
            this.openBarrier();
          } else {
            this.closeBarrier();
          }
        }, 50);

        // TRUCK
        if (data.moveTruck) {
          this.moveTruck();
        }

        // WEIGHT
        this.weight = data.weight || 0;
      })
      .catch(err => console.error(err));
  }

  // DOM-based barrier operations (direct transform on element)
  openBarrier(): void {
    const el = document.getElementById('entryBarrier');
    if (el) {
      el.style.transform = 'rotate(-90deg)';
    }
  }

  closeBarrier(): void {
    const el = document.getElementById('entryBarrier');
    if (el) {
      el.style.transform = 'rotate(0deg)';
    }
  }

  setGreenSignal(): void { this.scadaService.setEntrySignal(SignalState.GREEN); }
  setRedSignal(): void { this.scadaService.setEntrySignal(SignalState.RED); }
  moveTruck(): void { this.animateTruckTo(100); }

  // Optional integrations (kept thin wrappers)
  enablePolling(url: string) { if (url) this.scadaService.enablePolling(url); }
  disablePolling() { this.scadaService.disablePolling(); }
  enableWebSocket(url: string) { if (url) this.scadaService.enableWebSocket(url); }
  disableWebSocket() { this.scadaService.disableWebSocket(); }
  toggleContinuousMode() { this.scadaService.isContinuousModeActive() ? this.scadaService.disableContinuousMode() : this.scadaService.enableContinuousMode(); }
  getRejectionRate() { return this.scadaService.getRejectionProbability(); }
  setRejectionRate(p: number) { this.scadaService.setRejectionProbability(p); }

  // Toggle auto mode (used by template)
  toggleAutoMode(): void {
    if (this.scadaService.isAutoModeActive()) {
      this.scadaService.stopAutoMode();
    } else {
      this.scadaService.startAutoMode();
    }
  }
}
