import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from '../header/header.component';
import { SignalComponent } from '../signal/signal.component';
import { BarrierComponent } from '../barrier/barrier.component';
import { WeighbridgeComponent } from '../weighbridge/weighbridge.component';
import { ScadaService } from '../../services/scada.service';
import {
  AudioAnnouncementEvent,
  AudioAnnouncementService,
  AudioAnnouncementState
} from '../../services/audio-announcement.service';
import { SignalState, BarrierState, WeighbridgeStatus, VehicleStatus, VehicleState } from '../../models/scada.models';

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

  private readonly truckMotionDurations = {
    approach: 2600,
    barrierWait: 1200,
    enter: 3200,
    weighHold: 900,
    exit: 3600,
    reset: 2200
  };

  intervalId: any;
  pollIntervalId: any;
  entryCloseTimeout: any;
  exitCloseTimeout: any;
  logs: any[] = [];
  entryBarrierOpen = false;
  entrySignal = 'RED';
  exitSignal = 'RED';
  currentTruck = '';
  weight = 0;
  currentWeight = 0;
  displayedWeight = 0;
  plateNumber = '';
  manualWeight = 1500;
  currentPlate = '';
  currentTruckPlate = '';
  transactionNumber = '';
  approvalStatus = '';
  entryTime = '';
  exitTime = '';
  operatorMessage = '';
  truckPosition = 0; // 0 = start, 50 = center, 100 = exit
  barrierEntry = BarrierState.CLOSED;
  barrierExit = BarrierState.CLOSED;
  ledMessage = '';
  paMessage = '';
  vehicleStatusText = '';
  audioAnnouncementStatus: AudioAnnouncementState = {
    currentAnnouncement: 'No announcement',
    lastAnnouncementTime: null,
    playbackStatus: 'idle',
    event: null
  };
  filterStatus: 'all' | 'processed' | 'rejected' | 'accepted' = 'all';
  filterTerm = '';

  private logsSub: any;
  private vehicleTriggerSub: any;
  private audioStatusSub: any;
  private animFrame: any = null;
  private weightAnimFrame: any = null;
  private lastVehicleStatus: any = null;
  private lastWeighbridgeStatus: WeighbridgeStatus | null = null;
  private lastWeightCaptured = 0;
  private registeredAudioSignalRHandlers: Array<{ eventName: string; handler: (...args: any[]) => void }> = [];
  private exitDriveOffPending = false;
  private lastExitBarrierWasOpen = false;
  lastProcessedId = 0;
  private checkIntervalId: any;
  private isProcessingVehicle = false;
  // Allowed plates editor
  allowedPlatesText = '';
  allowedPlatesMessage = '';
  exitAutoCloseSeconds = 30;
  exitAutoCloseMessage = '';
  cameraImageFailed = false;

  get displayVehicleNumber(): string {
    return this.currentTruckPlate || this.currentPlate || '';
  }

  get primaryWeightDisplay(): string {
    const gross = this.scadaService.grossWeight();
    const live = this.displayedWeight || this.weight || 0;
    const value = gross > 0 ? gross : live;
    return value > 0 ? value.toFixed(1) : '0.0';
  }

  get currentTruckCount(): number {
    return this.displayVehicleNumber ? 1 : 0;
  }

  formatWeight(value: number | undefined | null): string {
    if (value === undefined || value === null) {
      return '0.0';
    }
    if (value === 0) {
      return '0.0';
    }
    if (value % 1 === 0) {
      return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get displayGrossWeight(): string {
    return this.formatWeight(this.scadaService.grossWeight());
  }

  get displayTareWeight(): string {
    return this.formatWeight(this.scadaService.tareWeight());
  }

  get displayNetWeight(): string {
    const gross = this.scadaService.grossWeight() || 0;
    const tare = this.scadaService.tareWeight() || 0;
    const net = (gross > 0 && tare > 0) ? (gross - tare) : 0;
    return this.formatWeight(net);
  }


  get weighbridgeStatusMessage(): string {
    const step = (this.scadaService.currentProcessStep() || '').toLowerCase();
    const wbStatus = this.scadaService.weighbridge().status;
    if (step.includes('in completed') || wbStatus === WeighbridgeStatus.COMPLETE) return 'Weighing complete';
    if (step.includes('weighing') || wbStatus === WeighbridgeStatus.WEIGHING) return 'Weighing in progress...';
    if (step.includes('not registered') || step.includes('reject')) return 'Vehicle rejected';
    if (step.includes('verified') || step.includes('proceed')) return 'Proceed to weighbridge';
    if (step.includes('transaction completed')) return 'Transaction completed';
    return this.scadaService.weighbridge().vehicleDetected ? 'Vehicle on scale' : 'Weighbridge idle';
  }

  constructor(
    protected scadaService: ScadaService,
    private audioAnnouncementService: AudioAnnouncementService
  ) {}

  ngOnInit(): void {
    try {
      const ms = this.scadaService.getExitAutoCloseMs();
      this.exitAutoCloseSeconds = Math.round((ms || 0) / 1000);
    } catch (e) {}
    // Subscribe to logs (BehaviorSubject) for immediate updates
    this.logsSub = this.scadaService.getVehicleLogs().subscribe((list: any[]) => {
      this.logs = list || [];
    });

    this.audioAnnouncementService.preloadAudio();
    this.audioStatusSub = this.audioAnnouncementService.status$.subscribe((status) => {
      this.audioAnnouncementStatus = status;
    });

    // Poll the service state at a short interval to update UI bindings from the centralized state machine
    this.intervalId = setInterval(() => this.syncFromService(), 300);

    // Initial load of backend system status and logs
    this.loadSystemStatus();
    this.loadDashboardStatus();
    this.loadLogs();
    // Use checkNewVehicle to both refresh and trigger processing
    this.checkIntervalId = setInterval(() => this.checkNewVehicle(), 2000);
    // Poll the latest single-vehicle control endpoint every 2 seconds
    this.pollIntervalId = setInterval(() => {
      this.loadControl();
      this.loadDashboardStatus();
    }, 2000);

    // Listen for external triggers (vehicle input component)
    this.vehicleTriggerSub = this.scadaService.vehicleTrigger$.subscribe((plate: string) => {
      try { this.checkVehicleAndUpdate(plate); } catch (e) { }
    });

    // load allowed plates into editor
    this.loadAllowedPlates();
    // Subscribe to backend-controlled state updates (preferred canonical event)
    try {
      if ((this.scadaService as any).hubConnection) {
        this.registerAudioSignalRHandlers();
      }
    } catch (e) { }
  }

  isExitAutoCloseValid(): boolean {
    const sec = Number(this.exitAutoCloseSeconds);
    if (isNaN(sec) || !isFinite(sec)) return false;
    return sec >= 0 && sec <= 600; // 0..600 seconds allowed
  }

  onExitAutoCloseInput(): void {
    this.exitAutoCloseMessage = '';
  }

  setExitAutoCloseSeconds(): void {
    const sec = Number(this.exitAutoCloseSeconds);
    if (!this.isExitAutoCloseValid()) {
      this.exitAutoCloseMessage = 'Enter a number 0–600 (seconds).';
      return;
    }

    try {
      this.scadaService.setExitAutoCloseMs(Math.max(0, Math.floor(sec * 1000)));
      this.exitAutoCloseMessage = 'Saved';
      setTimeout(() => this.exitAutoCloseMessage = '', 2000);
    } catch (e) {
      this.exitAutoCloseMessage = 'Save failed';
    }
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.logsSub) this.logsSub.unsubscribe?.();
    if (this.pollIntervalId) clearInterval(this.pollIntervalId);
    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
    if (this.vehicleTriggerSub) this.vehicleTriggerSub.unsubscribe?.();
    if (this.audioStatusSub) this.audioStatusSub.unsubscribe?.();
    if (this.entryCloseTimeout) clearTimeout(this.entryCloseTimeout);
    if (this.exitCloseTimeout) clearTimeout(this.exitCloseTimeout);
    this.unregisterAudioSignalRHandlers();
    this.audioAnnouncementService.stop();
  }

  private syncFromService(): void {
    try {
      const vs = this.scadaService.vehicleStatus();
      // When vehicle status changes, animate the truck to the target position
      if (vs !== this.lastVehicleStatus) {
        this.handleVehicleStatusAnnouncement(vs);
        if (vs === VehicleStatus.ARRIVED) this.animateTruckTo(18, this.truckMotionDurations.approach);
        else if (vs === VehicleStatus.VALIDATED) this.animateTruckTo(18, this.truckMotionDurations.barrierWait);
        else if (vs === VehicleStatus.POSITIONING) this.animateTruckTo(50, this.truckMotionDurations.enter);
        else if (vs === VehicleStatus.READY || vs === VehicleStatus.WEIGHING) this.animateTruckTo(50, this.truckMotionDurations.weighHold);
        else if (vs === VehicleStatus.LEAVING_SCALE) this.animateTruckTo(75, 1800);
        else if (vs === VehicleStatus.EXITED) this.animateTruckTo(100, 1800);
        else this.animateTruckTo(0, this.truckMotionDurations.reset);
        this.lastVehicleStatus = vs;
      }

      const eb = this.scadaService.entryBarrier();
      const xb = this.scadaService.exitBarrier();
      this.barrierEntry = eb.state;
      this.barrierExit = xb.state;

      const es = this.scadaService.entrySignal();
      const xs = this.scadaService.exitSignal();
      this.entrySignal = es.state === SignalState.GREEN ? 'GREEN' : 'RED';
      this.exitSignal = xs.state === SignalState.GREEN ? 'GREEN' : 'RED';

      const wb = this.scadaService.weighbridge();
      // animate displayed weight toward service weight
      this.animateWeightTo(wb.weight || 0);
      this.handleWeighbridgeAnnouncement(wb.status, wb.weight || 0);

      const led = this.scadaService.ledDisplay();
      this.ledMessage = led?.message || '';

      const pa = this.scadaService.paSystem();
      this.paMessage = pa?.message || '';

      this.currentTruckPlate = this.scadaService.currentTruckPlate() || '';
      this.transactionNumber = this.scadaService.transactionNumber() || '';
      this.approvalStatus = this.scadaService.approvalStatus() || '';
      this.entryTime = this.scadaService.entryTime() || '';
      this.exitTime = this.scadaService.exitTime() || '';
      this.operatorMessage = this.scadaService.operatorMessage() || this.scadaService.currentProcessStep() || '';

      this.vehicleStatusText = vs;
      this.handlePostWeighExitDriveOff();
    } catch (e) {
      // ignore transient read errors
    }
  }

  private handlePostWeighExitDriveOff(): void {
    const exitOpen = this.barrierExit === BarrierState.OPEN;
    const step = (this.scadaService.currentProcessStep() || '').toLowerCase();
    const postWeigh = step.includes('in completed') || step.includes('proceed to exit') || step.includes('exit barrier') || step.includes('exiting weighbridge');

    if (exitOpen && (this.scadaService as any).backendExitSequenceActive && !this.lastExitBarrierWasOpen && postWeigh && !this.exitDriveOffPending) {
      this.exitDriveOffPending = true;
      this.scadaService.currentProcessStep.set('Exit barrier open. Truck exiting weighbridge...');
      this.animateTruckTo(100, 1800);
      setTimeout(() => {
        this.scadaService.notifyVehiclePassed();
        this.vehicleStatusText = VehicleStatus.EXITED;
        setTimeout(() => {
          this.animateTruckTo(0, this.truckMotionDurations.reset);
          this.exitDriveOffPending = false;
        }, 1800);
      }, 1800);
    }

    if (!exitOpen) {
      this.exitDriveOffPending = false;
    }

    this.lastExitBarrierWasOpen = exitOpen;
  }

  private announce(event: AudioAnnouncementEvent): void {
    this.audioAnnouncementService.announce(event).catch((error) => {
      console.warn('Audio announcement failed', event, error);
    });
  }

  private handleVehicleStatusAnnouncement(status: VehicleStatus): void {
    switch (status) {
      case VehicleStatus.ARRIVED:
        this.announce('VehicleDetected');
        break;
      case VehicleStatus.POSITIONING:
        this.announce('TruckMisaligned');
        break;
      case VehicleStatus.READY:
        this.announce('TruckAligned');
        break;
      case VehicleStatus.EXITED:
        this.announce('ExitApproved');
        break;
      case VehicleStatus.INVALID:
        this.announce('VehicleRejected');
        break;
    }
  }

  private handleWeighbridgeAnnouncement(status: WeighbridgeStatus, weight: number): void {
    if (status === WeighbridgeStatus.COMPLETE && weight > 0) {
      const weightChanged = Math.abs(weight - this.lastWeightCaptured) > 0.1;
      if (this.lastWeighbridgeStatus !== WeighbridgeStatus.COMPLETE || weightChanged) {
        this.lastWeightCaptured = weight;
        this.announce('WeightCaptured');
      }
    }

    this.lastWeighbridgeStatus = status;
  }

  private registerAudioSignalRHandlers(): void {
    const hubConnection = (this.scadaService as any).hubConnection;
    if (!hubConnection) return;

    const eventMap: Record<AudioAnnouncementEvent, AudioAnnouncementEvent> = {
      VehicleDetected: 'VehicleDetected',
      TruckMisaligned: 'TruckMisaligned',
      TruckAligned: 'TruckAligned',
      WeightCaptured: 'WeightCaptured',
      ExitApproved: 'ExitApproved',
      VehicleRejected: 'VehicleRejected'
    };

    Object.keys(eventMap).forEach((signalREvent) => {
      const event = eventMap[signalREvent as AudioAnnouncementEvent];
      const handler = () => this.announce(event);
      hubConnection.on(signalREvent, handler);
      this.registeredAudioSignalRHandlers.push({ eventName: signalREvent, handler });
    });

    const deviceEventHandler = (payload: any) => this.handleDeviceEventAnnouncement(payload);
    hubConnection.on('DeviceEvent', deviceEventHandler);
    this.registeredAudioSignalRHandlers.push({ eventName: 'DeviceEvent', handler: deviceEventHandler });

    const onScaleChangedHandler = (onScale: any) => {
      if (onScale) {
        this.announce('TruckMisaligned');
      } else {
        this.announce('TruckAligned');
      }
    };
    hubConnection.on('OnScaleChanged', onScaleChangedHandler);
    this.registeredAudioSignalRHandlers.push({ eventName: 'OnScaleChanged', handler: onScaleChangedHandler });
  }

  private unregisterAudioSignalRHandlers(): void {
    const hubConnection = (this.scadaService as any).hubConnection;
    if (!hubConnection) return;

    this.registeredAudioSignalRHandlers.forEach(({ eventName, handler }) => hubConnection.off(eventName, handler));
    this.registeredAudioSignalRHandlers = [];
  }

  private handleDeviceEventAnnouncement(payload: any): void {
    const eventName = (payload?.event || payload?.eventName || payload?.['@event'] || '').toString().toUpperCase();

    if (eventName === 'VEHICLE_ENTRY') this.announce('VehicleDetected');
    if (eventName === 'WEIGHING') this.announce('TruckMisaligned');
    if (eventName === 'WEIGH_COMPLETE') this.announce('WeightCaptured');
    if (eventName === 'EXIT_OPEN') this.announce('ExitApproved');
  }

  private animateTruckTo(targetPercent: number, duration = 2200) {
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
  onCameraImageError(event: Event): void {
    this.cameraImageFailed = true;
    const img = event.target as HTMLImageElement;
    if (img) img.style.display = 'none';
  }

  resetEntryGate(): void {
    this.entrySignal = 'RED';
    this.barrierEntry = BarrierState.CLOSED;
    this.scadaService.closeBarrier('entry').subscribe();
    this.scadaService.setSignalRed('entry').subscribe();
  }

  loadDashboardStatus(): void {
    this.scadaService.getDashboardStatus().subscribe({
      next: (data: any) => this.applyDashboardPayload(data),
      error: () => {}
    });
  }

  private applyDashboardPayload(data: any): void {
    if (!data) return;
    
    // Update the service signals and state variables to maintain a single source of truth
    const es = (data.entrySignal || '').toString().toUpperCase();
    const xs = (data.exitSignal || '').toString().toUpperCase();
    this.scadaService.entrySignal.set({ id: 'entry-signal', name: 'Entry Signal', state: es === 'GREEN' ? SignalState.GREEN : SignalState.RED });
    this.scadaService.exitSignal.set({ id: 'exit-signal', name: 'Exit Signal', state: xs === 'GREEN' ? SignalState.GREEN : SignalState.RED });

    const eb = (data.entryBoomBarrier || data.entryBarrier || '').toString().toUpperCase();
    const xb = (data.exitBoomBarrier || data.exitBarrier || '').toString().toUpperCase();
    this.scadaService.entryBarrier.set({ id: 'entry-barrier', name: 'Entry Barrier', state: eb === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED });
    this.scadaService.exitBarrier.set({ id: 'exit-barrier', name: 'Exit Barrier', state: xb === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED });

    this.scadaService.truckOnScale = !!data.onScale;
    this.scadaService.currentTruckPlate.set(data.vehicleNumber || data.currentTruckPlate || '');
    this.scadaService.transactionNumber.set(data.transactionNumber || '');
    this.scadaService.approvalStatus.set(data.approvalStatus || '');
    this.scadaService.entryTime.set(data.entryTime || '');
    this.scadaService.exitTime.set(data.exitTime || '');
    this.scadaService.operatorMessage.set(data.operatorMessage || data.currentProcessStep || '');
    
    const w = data.grossWeight ?? data.currentWeight ?? 0;
    this.scadaService.weighbridge.update(s => ({ ...s, weight: w, vehicleDetected: !!data.onScale }));
    if (data.grossWeight !== undefined) this.scadaService.grossWeight.set(data.grossWeight || 0);
    if (data.tareWeight !== undefined) this.scadaService.tareWeight.set(data.tareWeight || 0);
    if (data.netWeight !== undefined) this.scadaService.netWeight.set(data.netWeight || 0);

    // Update central state machine stage
    const stage = (data.stage || '').toUpperCase();
    if (stage === 'ARRIVED') {
      this.scadaService.vehicleValidated = true;
      this.scadaService.weightStable = false;
      this.scadaService.readyForExit = false;
      this.scadaService.currentVehicleState = VehicleState.ENTRY_GRANTED;
    } else if (stage === 'ENTRY') {
      this.scadaService.vehicleValidated = true;
      this.scadaService.weightStable = false;
      this.scadaService.readyForExit = false;
      this.scadaService.currentVehicleState = VehicleState.ENTERING;
    } else if (stage === 'WEIGHING') {
      this.scadaService.vehicleValidated = true;
      this.scadaService.weightStable = false;
      this.scadaService.readyForExit = false;
      this.scadaService.currentVehicleState = data.onScale ? VehicleState.WEIGHING : VehicleState.ON_SCALE;
    } else if (stage === 'WEIGHT_CALCULATED' || stage === 'WEIGH_COMPLETED') {
      this.scadaService.vehicleValidated = true;
      this.scadaService.weightStable = true;
      this.scadaService.readyForExit = false;
      this.scadaService.currentVehicleState = VehicleState.WEIGHT_COMPLETE;
    } else if (stage === 'EXIT' || stage === 'EXIT_IN_PROGRESS') {
      this.scadaService.vehicleValidated = true;
      this.scadaService.weightStable = true;
      this.scadaService.readyForExit = true;
      this.scadaService.currentVehicleState = !data.onScale ? VehicleState.EXITING : VehicleState.READY_FOR_EXIT;
    } else if (stage === 'INVALID') {
      this.scadaService.vehicleValidated = false;
      this.scadaService.currentVehicleState = VehicleState.REJECTED;
    } else if (stage === 'IDLE') {
      this.scadaService.vehicleValidated = false;
      this.scadaService.weightStable = false;
      this.scadaService.readyForExit = false;
      this.scadaService.currentVehicleState = VehicleState.IDLE;
    }

    this.scadaService.updateSystemState(w, data.ledMessage);
  }

  // UI actions delegate to backend REST APIs
  toggleEntrySignal(): void {
    const next = this.entrySignal === 'GREEN' ? 'red' : 'green';
    next === 'green' ? this.scadaService.setSignalGreen('entry').subscribe() : this.scadaService.setSignalRed('entry').subscribe();
  }

  toggleExitSignal(): void {
    const next = this.exitSignal === 'GREEN' ? 'red' : 'green';
    next === 'green' ? this.scadaService.setSignalGreen('exit').subscribe() : this.scadaService.setSignalRed('exit').subscribe();
  }

  toggleEntryBarrier(): void {
    const isClosed = this.barrierEntry === BarrierState.CLOSED;
    isClosed ? this.scadaService.openBarrier('entry').subscribe() : this.scadaService.closeBarrier('entry').subscribe();
  }

  toggleExitBarrier(): void {
    const isClosed = this.barrierExit === BarrierState.CLOSED;
    isClosed ? this.scadaService.openBarrier('exit').subscribe() : this.scadaService.closeBarrier('exit').subscribe();
  }

  togglePaSystem(): void {
    const active = this.scadaService.paSystem().active;
    this.scadaService.togglePaSystem(!active, !active ? 'PA System Active - Testing' : 'No PA Announcement');
  }

  triggerEntryDetection(): void {
    if (this.plateNumber) {
      this.submitPlate();
    } else {
      const samples = ['ABC-1234', 'XYZ-9999', 'DEF-9012'];
      this.plateNumber = samples[Math.floor(Math.random() * samples.length)];
      this.submitPlate();
    }
  }

  triggerExitDetection(): void {
    const currentPlate = this.currentTruckPlate || 'ABC-1234';
    this.plateNumber = currentPlate;
    this.manualWeight = 9500; // tare weight
    this.submitPlate();
  }

  toggleWeighbridge(): void {
    this.scadaService.toggleWeighbridge();
  }

  // Submit a specific plate for Weighbridge IN or OUT flow
  submitPlate(): void {
    if (!this.plateNumber) return;

    const plate = this.plateNumber.trim().toUpperCase();
    const weight = this.manualWeight || 25000;
    this.announce('VehicleDetected');

    // Determine if vehicle is already weighed in (check if current process step contains IN COMPLETED)
    const isWeighbridgeOut = this.scadaService.currentProcessStep().includes('IN COMPLETED') || 
                             this.scadaService.currentProcessStep().includes('Gross');

    if (isWeighbridgeOut) {
      // ➡️ WEIGHBRIDGE OUT FLOW
      this.scadaService.weighOut(plate, weight).subscribe({
        next: (res: any) => {
          this.loadLogs();
          this.loadSystemStatus();
          this.loadDashboardStatus();
        },
        error: (err: any) => {
          console.error("Weigh Out failed", err);
        }
      });
    } else {
      // ➡️ WEIGHBRIDGE IN FLOW
      this.scadaService.checkVehicle(plate).subscribe({
        next: (res: any) => {
          if (res.success) {
            this.currentTruckPlate = res.vehicleNumber || plate;
            this.currentPlate = this.currentTruckPlate;
            // Animate truck onto the weighbridge platform
            this.animateTruckTo(50, this.truckMotionDurations.enter);
            setTimeout(() => {
              // Call weighIn once truck stops on scale
              this.scadaService.weighIn(plate, weight).subscribe({
                next: () => {
                  this.scadaService.currentProcessStep.set('Gross Weight Captured. Status: IN COMPLETED.');
                  this.loadLogs();
                  this.loadSystemStatus();
                  this.loadDashboardStatus();
                },
                error: (err) => console.error("Weigh In failed", err)
              });
            }, 2500);
          } else {
            this.entrySignal = 'RED';
            this.barrierEntry = BarrierState.CLOSED;
          }
          this.loadLogs();
          this.loadSystemStatus();
        },
        error: (err: any) => {
          console.error("Check vehicle failed", err);
          this.entrySignal = 'RED';
          this.barrierEntry = BarrierState.CLOSED;
        }
      });
    }

    this.plateNumber = '';
  }

  // Automated end-to-end Weighbridge IN & OUT workflow simulation
  simulateVehicle(): void {
    const samples = ['ABC-1234', 'XYZ-9999', 'DEF-9012'];
    const plate = samples[Math.floor(Math.random() * samples.length)];
    this.runFullSmartGateSimulation(plate);
  }

  async runFullSmartGateSimulation(plate: string) {
    try {
      this.announce('VehicleDetected');
      this.scadaService.anprCameraStatus.set('Capturing entry plate...');
      await new Promise(r => setTimeout(r, 1200));

      this.scadaService.checkVehicle(plate).subscribe(async (resCheck: any) => {
        if (!resCheck.success) {
          console.warn("Unregistered vehicle:", resCheck.message);
          return;
        }

        // Move truck from gate to weighbridge (Step 5)
        this.animateTruckTo(50, this.truckMotionDurations.enter);
        await new Promise(r => setTimeout(r, 3600));

        // Capture Gross Weight (Step 6)
        const grossWeight = Math.floor(24000 + Math.random() * 6000);
        this.scadaService.weighIn(plate, grossWeight).subscribe(async () => {
          this.scadaService.currentProcessStep.set('Gross Weight Captured. Status: IN COMPLETED.');
          // Wait for exit barrier to open, truck to drive off, and barrier to close
          await new Promise(r => setTimeout(r, 8000));
          this.loadDashboardStatus();
          this.loadSystemStatus();
        });
      });
    } catch (e) {
      console.error("Simulation flow error", e);
    }
  }

  // Apply a preset system state to the backend and refresh UI
  applySampleState(): void {
    const payload = {
      entrySignal: 'RED',
      exitSignal: 'GREEN',
      entryBarrier: BarrierState.CLOSED,
      exitBarrier: BarrierState.OPEN,
      currentTruckPlate: 'ABC-1234',
      currentWeight: 32000,
      mode: 'ANPR',
      ledMessage: 'PROCEED TO EXIT'
    };

    this.scadaService.setSystemState(payload).subscribe({
      next: () => {
        this.loadSystemStatus();
        this.loadControl();
        this.loadLogs();
        this.announce('ExitApproved');
      },
      error: (err: any) => { console.warn('applySampleState failed', err); }
    });
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

  loadSystemStatus(): void {
    this.scadaService.getSystemStatus().subscribe({
      next: (s: any) => {
        try {
          if (!s) return;
          const es = s.entrySignal || 'RED';
          const xs = s.exitSignal || 'RED';
          this.scadaService.entrySignal.set({ id: 'entry-signal', name: 'Entry Signal', state: es === 'GREEN' ? SignalState.GREEN : SignalState.RED });
          this.scadaService.exitSignal.set({ id: 'exit-signal', name: 'Exit Signal', state: xs === 'GREEN' ? SignalState.GREEN : SignalState.RED });

          const eb = s.entryBarrier || BarrierState.CLOSED;
          const xb = s.exitBarrier || BarrierState.CLOSED;
          this.scadaService.entryBarrier.set({ id: 'entry-barrier', name: 'Entry Barrier', state: eb === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED });
          this.scadaService.exitBarrier.set({ id: 'exit-barrier', name: 'Exit Barrier', state: xb === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED });

          this.scadaService.currentTruckPlate.set(s.currentTruckPlate || '');
          this.scadaService.transactionNumber.set(s.transactionNumber || '');
          this.scadaService.approvalStatus.set(s.approvalStatus || '');
          this.scadaService.entryTime.set(s.entryTime || '');
          this.scadaService.exitTime.set(s.exitTime || '');
          this.scadaService.operatorMessage.set(s.operatorMessage || s.currentProcessStep || '');

          this.scadaService.weighbridge.update(w => ({ ...w, weight: s.currentWeight || 0, vehicleDetected: !!s.onScale }));
          if (s.grossWeight !== undefined) this.scadaService.grossWeight.set(s.grossWeight || 0);
          if (s.tareWeight !== undefined) this.scadaService.tareWeight.set(s.tareWeight || 0);
          if (s.netWeight !== undefined) this.scadaService.netWeight.set(s.netWeight || 0);
          
          this.scadaService.updateSystemState(s.currentWeight || 0, s.ledMessage);
        } catch (e) {
          console.warn('loadSystemStatus parse error', e);
        }
      },
      error: (err: any) => { console.warn('getSystemStatus failed', err); }
    });
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
    this.scadaService.getLogs().subscribe({
      next: (data: any[]) => {
        this.logs = data || [];
        if (this.logs && this.logs.length > 0) {
          // backend returns most recent first
          const recent = this.logs[0];
          this.currentPlate = recent.plate || recent.plateNumber || recent.name || '';
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
    try {
      // UI no longer performs timing/sequencing — backend controls the exit flow and sends
      // `ReceiveSystemStatus` events. Here we only update minimal local state to reflect
      // arrival; animations are driven by SignalR payloads.
      this.vehicleStatusText = vehicle.status;
      this.currentPlate = vehicle.plateNumber || vehicle.plate || '';
      // leave isProcessingVehicle true until backend resets state (optional)
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

  simulateAlignmentCheck(): void {
    this.announce('TruckMisaligned');
    setTimeout(() => this.announce('TruckAligned'), 1800);
  }

  // Polling-based control loader: queries latest vehicle and updates UI
  loadControl(): void {
    this.scadaService.getSystemStatus().subscribe({
      next: (data: any) => {
        try {
          if (!data) return;
          const es = data.entrySignal || 'RED';
          const xs = data.exitSignal || 'RED';
          this.scadaService.entrySignal.set({ id: 'entry-signal', name: 'Entry Signal', state: es === 'GREEN' ? SignalState.GREEN : SignalState.RED });
          this.scadaService.exitSignal.set({ id: 'exit-signal', name: 'Exit Signal', state: xs === 'GREEN' ? SignalState.GREEN : SignalState.RED });

          const eb = data.entryBarrier || BarrierState.CLOSED;
          const xb = data.exitBarrier || BarrierState.CLOSED;
          this.scadaService.entryBarrier.set({ id: 'entry-barrier', name: 'Entry Barrier', state: eb === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED });
          this.scadaService.exitBarrier.set({ id: 'exit-barrier', name: 'Exit Barrier', state: xb === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED });

          this.scadaService.weighbridge.update(w => ({ ...w, weight: data.currentWeight || 0, vehicleDetected: !!data.onScale }));
          this.scadaService.currentTruckPlate.set(data.currentTruckPlate || '');
          if (data.grossWeight !== undefined) this.scadaService.grossWeight.set(data.grossWeight || 0);
          if (data.tareWeight !== undefined) this.scadaService.tareWeight.set(data.tareWeight || 0);
          if (data.netWeight !== undefined) this.scadaService.netWeight.set(data.netWeight || 0);
          
          this.scadaService.updateSystemState(data.currentWeight || 0, data.ledMessage);
        } catch (e) { console.warn('loadControl parse error', e); }
      },
      error: (err: any) => { console.warn('loadControl error', err); }
    });
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
  moveTruck(): void { this.animateTruckTo(100, this.truckMotionDurations.exit); }

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
