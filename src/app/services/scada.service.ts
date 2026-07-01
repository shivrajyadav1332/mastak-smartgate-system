import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, timer, Subject } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';
import {
  ScadaData,
  SignalState,
  BarrierState,
  Signal,
  Barrier,
  AnprCamera,
  Weighbridge,
  WeighbridgeStatus
} from '../models/scada.models';
import { VehicleStatus } from '../models/scada.models';
import { InputMode } from '../models/scada.models';
// SignalR client
import * as signalR from '@microsoft/signalr';

@Injectable({
  providedIn: 'root'
})
export class ScadaService {
  // Private state using BehaviorSubject for reactive streams
  private entrySignalState = new BehaviorSubject<SignalState>(SignalState.RED);
  private exitSignalState = new BehaviorSubject<SignalState>(SignalState.RED);
  private entryBarrierState = new BehaviorSubject<BarrierState>(BarrierState.CLOSED);
  private exitBarrierState = new BehaviorSubject<BarrierState>(BarrierState.CLOSED);
  private ledMessage = new BehaviorSubject<string>('No LED message');
  private paActive = new BehaviorSubject<boolean>(false);
  private paMessage = new BehaviorSubject<string>('No PA Announcement');

  // Angular signals for modern reactivity
  entrySignal = signal<Signal>({
    id: 'entry-signal',
    name: 'Entry Signal',
    state: SignalState.RED,
    blinking: false
  });

  exitSignal = signal<Signal>({
    id: 'exit-signal',
    name: 'Exit Signal',
    state: SignalState.RED,
    blinking: false
  });

  entryBarrier = signal<Barrier>({
    id: 'entry-barrier',
    name: 'Entry Boom Barrier',
    state: BarrierState.CLOSED,
    position: 0
  });

  exitBarrier = signal<Barrier>({
    id: 'exit-barrier',
    name: 'Exit Boom Barrier',
    state: BarrierState.CLOSED,
    position: 0
  });

  ledDisplay = computed(() => ({
    message: this.ledMessage.getValue(),
    color: '#00ff00',
    visible: true
  }));

  paSystem = computed(() => ({
    active: this.paActive.getValue(),
    message: this.paMessage.getValue()
  }));

  overviewCameraActive = signal(true);

  entryAnprCamera = signal<AnprCamera>({
    id: 'entry-anpr',
    name: 'Entry ANPR Camera',
    active: false,
    detectedPlate: '',
    confidence: 0,
    lastDetection: null
  });

  exitAnprCamera = signal<AnprCamera>({
    id: 'exit-anpr',
    name: 'Exit ANPR Camera',
    active: false,
    detectedPlate: '',
    confidence: 0,
    lastDetection: null
  });

  weighbridge = signal<Weighbridge>({
    id: 'weighbridge-1',
    name: 'Truck Weighbridge',
    active: false,
    weight: 0,
    status: WeighbridgeStatus.WAITING,
    vehicleDetected: false
  });

  // New SCADA signals for SQLite database properties
  currentDriverName = signal<string>('');
  currentCustomerName = signal<string>('');
  currentMaterialName = signal<string>('');
  currentDestination = signal<string>('');
  currentPurchaseOrder = signal<string>('');
  grossWeight = signal<number>(0);
  tareWeight = signal<number>(0);
  netWeight = signal<number>(0);
  currentProcessStep = signal<string>('Idle');
  systemStatus = signal<string>('System Online');
  liveCameraImage = signal<string>('');
  anprCameraStatus = signal<string>('Ready');

  // (No service-driven truck position in manual mode)

  // Vehicle processing state
  vehicleStatus = signal<VehicleStatus>(VehicleStatus.IDLE);

  // Activity log of processed vehicles
  private vehicleLogs = new BehaviorSubject<Array<any>>([]);

  // Current input mode (ANPR only)
  mode = signal<InputMode>(InputMode.ANPR);

  // Alert message for UI
  private alertMessage = new BehaviorSubject<string>('');

  getAlertMessage(): BehaviorSubject<string> {
    return this.alertMessage;
  }
  // Base API URL for backend (dev-server proxy handles forwarding)
  private readonly baseApi = '/api';

  // Legacy helper that UI may use to push an internal log (keeps BehaviorSubject semantics)
  // Keep existing allowed-plates and vehicles helpers for backward compatibility
  addVehicle(plate: string) {
    return this.http.post<any>(`${this.baseApi}/vehicle/arrive/${encodeURIComponent(plate)}`, {});
  }

  // Check a plate via new POST /api/vehicle/check
  checkVehicle(plate: string) {
    return this.http.post<any>(`${this.baseApi}/vehicle/check`, { plateNumber: plate });
  }

  // Weigh In via POST /api/vehicle/in
  weighIn(plate: string, weight: number) {
    return this.http.post<any>(`${this.baseApi}/vehicle/in`, { plateNumber: plate, grossWeight: weight });
  }

  // Weigh Out via POST /api/vehicle/out
  weighOut(plate: string, weight: number) {
    return this.http.post<any>(`${this.baseApi}/vehicle/out`, { plateNumber: plate, tareWeight: weight });
  }

  // Print slip via POST /api/print/slip
  printSlip(txId: number) {
    return this.http.post<any>(`${this.baseApi}/print/slip`, { transactionId: txId });
  }

  // Manual barrier actions
  openBarrier(barrier: string = 'entry') {
    return this.http.post<any>(`${this.baseApi}/barrier/open`, { barrier });
  }

  closeBarrier(barrier: string = 'entry') {
    return this.http.post<any>(`${this.baseApi}/barrier/close`, { barrier });
  }

  // Manual signal actions
  setSignalRed(signal: string = 'entry') {
    return this.http.post<any>(`${this.baseApi}/signal/red`, { signal });
  }

  setSignalGreen(signal: string = 'entry') {
    return this.http.post<any>(`${this.baseApi}/signal/green`, { signal });
  }

  // Camera capture simulation
  captureCamera() {
    return this.http.post<any>(`${this.baseApi}/camera/capture`, {});
  }

  // Allowed plates management (GET/POST)
  getAllowedPlates() {
    return this.http.get<string[]>(`${this.baseApi}/system/allowed-plates`);
  }

  setAllowedPlates(plates: string[]) {
    return this.http.post(`${this.baseApi}/system/allowed-plates`, plates);
  }

  // GET all vehicles (in-memory) from backend
  getVehicles() {
    return this.http.get<any[]>(`${this.baseApi}/vehicle`);
  }

  // New canonical API methods requested by task
  vehicleArrive(plate: string) {
    return this.http.post<any>(`${this.baseApi}/vehicle/arrive/${encodeURIComponent(plate)}`, {});
  }

  // Process vehicle via weighbridge API
  processVehicle(data: any) {
    // If the data payload indicates check, invoke checking directly
    if (data && data.plateNumber) {
      return this.checkVehicle(data.plateNumber);
    }
    return this.http.post<any>(`${this.apiUrl}/process`, data);
  }

  getSystemStatus() {
    return this.http.get<any>(`${this.baseApi}/system/state`);
  }

  getDashboardStatus() {
    return this.http.get<any>(`${this.baseApi}/dashboard/status`);
  }

  getLatestTransaction() {
    return this.http.get<any>(`${this.baseApi}/transaction/latest`);
  }

  setSystemState(state: any) {
    return this.http.post<any>(`${this.baseApi}/system/state`, state);
  }

  getLogs() {
    return this.http.get<any[]>(`${this.baseApi}/vehicle/logs`);
  }

  // Simulated assignment database (portal data)
  private assignments: Record<string, { consignment: string; customer: string }> = {
    'ABC-1234': { consignment: 'CN-1001', customer: 'Acme Corp' },
    'XYZ-5678': { consignment: 'CN-1002', customer: 'Beta Ltd' },
    'DEF-9012': { consignment: 'CN-1003', customer: 'Gamma LLC' }
  };

  // Subscription handle for automatic mode
  // Holds the timeout id for the next auto cycle.
  private autoModeSub: any = null;
  private autoModeActive = false;
  private autoModeIntervalMs = 10000;
  private autoModeJitterMs = 500; // jitter +/- ms around base interval
  // Probability (0..1) that an assigned vehicle will be rejected to exercise the
  // 'rejected' flow. Increase for more rejections during demos.
  private rejectionProbability = 0.25;
  // External data integration handles
  private pollingId: any = null;
  private websocket: WebSocket | null = null;

  // Used to ignore scheduled timers/animations from a previous cycle.
  private cycleId = 0;
  // Internal processing flag to allow continuous processing without relying on VehicleStatus.IDLE
  private isProcessing = false;
  // Continuous mode: when enabled, do not set VehicleStatus.IDLE between cycles
  private continuousMode = false;

  private apiUrl = '/api/vehicle';
  public hubConnection: signalR.HubConnection | null = null;

  // Auto-close timeout handle for exit barrier (ms)
  private exitAutoCloseTimeout: any = null;
  // Configurable delay for auto-closing exit barrier (milliseconds)
  private exitAutoCloseMs = 30000;
  exitAutoCloseTimer = signal<number>(0);

  // Flag set when backend opens exit barrier and we are expecting a vehicle to pass
  private awaitingExitPass = false;
  // When true, backend SignalR events own exit barrier state (avoid local overrides)
  private backendExitSequenceActive = false;

  // Vehicle trigger event observable for other components to subscribe
  private vehicleTrigger = new Subject<string>();
  vehicleTrigger$ = this.vehicleTrigger.asObservable();


  constructor(private http: HttpClient) {
    this.startDummyDataSimulation();
    // Enable ANPR cameras so detections and processing are visible immediately
    this.entryAnprCamera.update(c => ({ ...c, active: true }));
    this.exitAnprCamera.update(c => ({ ...c, active: true }));
    // Auto-start continuous simulation so the flow runs without manual button presses
    this.enableContinuousMode();
    // Start auto mode with a demo-friendly interval (10s base + jitter)
    this.startAutoMode(10000);
    // Load persisted logs if present
    try {
      const raw = localStorage.getItem('scada.vehicleLogs');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // restore into BehaviorSubject
          this.vehicleLogs.next(parsed.slice(0, 100));
        }
      }
    } catch (e) {
      console.warn('failed to load persisted logs', e);
    }

    // Load persisted exit auto-close delay (ms) if present
    try {
      const s = localStorage.getItem('scada.exitAutoCloseMs');
      if (s) {
        const parsed = Number(s);
        if (!isNaN(parsed)) this.exitAutoCloseMs = Math.max(0, parsed);
      }
    } catch (e) { }

    // Try to load the server-side configured exit auto-close value (best-effort)
    try {
      this.http.get<any>(`${this.baseApi}/barrier/config/exit-autoclose`).subscribe({
        next: (res: any) => {
          try {
            if (res && res.exitAutoCloseMs != null) {
              const ms = Number(res.exitAutoCloseMs) || 0;
              this.exitAutoCloseMs = Math.max(0, ms);
              try { localStorage.setItem('scada.exitAutoCloseMs', String(this.exitAutoCloseMs)); } catch (e) {}
            }
          } catch (e) { }
        },
        error: () => { /* ignore */ }
      });
    } catch (e) { }

    // Try to connect to backend SignalR hub for real-time events
    this.initSignalR();
  }

  // Trigger a vehicle check event
  triggerVehicleCheck(plate: string) {
    try { this.vehicleTrigger.next(plate); } catch (e) { }
  }

  private initSignalR() {
    try {
      // Use backend SignalR hub path exposed by the .NET API
      const hubUrl = '/hub/vehicle';
      this.hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl)
        .withAutomaticReconnect()
        .build();

      // Server will broadcast 'SystemStateChanged' and 'ReceiveSystemStatus' with the full system state
      this.hubConnection.on('SystemStateChanged', (payload: any) => {
        try {
          if (!payload) return;
          console.debug('SignalR SystemStateChanged received', payload);
          // Map signals
          const es = (payload.entrySignal || '').toString().toUpperCase();
          const xs = (payload.exitSignal || '').toString().toUpperCase();
          this.setEntrySignal(es === 'GREEN' ? SignalState.GREEN : SignalState.RED);
          this.setExitSignal(xs === 'GREEN' ? SignalState.GREEN : SignalState.RED);

          // Barriers
          const entryBarrier = (payload.entryBarrier || '').toString().toUpperCase();
          const exitBarrier = (payload.exitBarrier || '').toString().toUpperCase();
          this.entryBarrier.update(b => ({ ...b, state: entryBarrier === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED }));
          this.exitBarrier.update(b => ({ ...b, state: exitBarrier === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED }));

          // Weighbridge
          const w = Number(payload.currentWeight || 0) || 0;
          this.weighbridge.update(s => ({ ...s, weight: w, vehicleDetected: !!payload.onScale }));

          // Map onScale to weighbridge status
          if (payload.onScale) {
            this.weighbridge.update(s => ({ ...s, status: WeighbridgeStatus.WEIGHING }));
          } else if (w > 0) {
            this.weighbridge.update(s => ({ ...s, status: WeighbridgeStatus.COMPLETE }));
          } else {
            this.weighbridge.update(s => ({ ...s, status: WeighbridgeStatus.WAITING }));
          }

          // LED + current plate
          this.updateLedMessage(payload.ledMessage || '');
          if (payload.currentTruckPlate) {
            try { this.pushLog({ plate: payload.currentTruckPlate, status: 'processed', time: new Date(), weight: w }); } catch (e) {}
          }

          // Update SQLite properties
          this.currentDriverName.set(payload.currentDriverName || '');
          this.currentCustomerName.set(payload.currentCustomerName || '');
          this.currentMaterialName.set(payload.currentMaterialName || '');
          this.currentDestination.set(payload.currentDestination || '');
          this.currentPurchaseOrder.set(payload.currentPurchaseOrder || '');
          this.grossWeight.set(payload.grossWeight || 0);
          this.tareWeight.set(payload.tareWeight || 0);
          this.netWeight.set(payload.netWeight || 0);
          this.currentProcessStep.set(payload.currentProcessStep || 'Idle');
          this.systemStatus.set(payload.systemStatus || 'System Online');
          this.liveCameraImage.set(payload.liveCameraImage || '');
          this.anprCameraStatus.set(payload.anprCameraStatus || 'Ready');
        } catch (e) {
          console.warn('SystemStateChanged handler failed', e);
        }
      });

      // New canonical ReceiveSystemStatus payload handler (preferred)
      this.hubConnection.on('ReceiveSystemStatus', (payload: any) => {
        try {
          if (!payload) return;
          console.debug('SignalR ReceiveSystemStatus received', payload);
          // Map signals
          const es = (payload.entrySignal || '').toString().toUpperCase();
          const xs = (payload.exitSignal || '').toString().toUpperCase();
          this.setEntrySignal(es === 'GREEN' ? SignalState.GREEN : SignalState.RED);
          this.setExitSignal(xs === 'GREEN' ? SignalState.GREEN : SignalState.RED);

          // Barriers
          const entryBarrier = (payload.entryBarrier || '').toString().toUpperCase();
          const exitBarrier = (payload.exitBarrier || '').toString().toUpperCase();
          this.entryBarrier.update(b => ({ ...b, state: entryBarrier === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED }));
          this.exitBarrier.update(b => ({ ...b, state: exitBarrier === 'OPEN' ? BarrierState.OPEN : BarrierState.CLOSED }));

          // Weighbridge
          const w = Number(payload.currentWeight || 0) || 0;
          this.weighbridge.update(s => ({ ...s, weight: w, vehicleDetected: !!payload.onScale }));

          if (payload.onScale) {
            this.weighbridge.update(s => ({ ...s, status: WeighbridgeStatus.WEIGHING }));
          } else if (w > 0) {
            this.weighbridge.update(s => ({ ...s, status: WeighbridgeStatus.COMPLETE }));
          } else {
            this.weighbridge.update(s => ({ ...s, status: WeighbridgeStatus.WAITING }));
          }

          // LED + current plate
          this.updateLedMessage(payload.ledMessage || '');
          if (payload.currentTruckPlate) {
            try { this.pushLog({ plate: payload.currentTruckPlate, status: 'processed', time: new Date(), weight: w }); } catch (e) {}
          }

          // Update SQLite properties
          this.currentDriverName.set(payload.currentDriverName || '');
          this.currentCustomerName.set(payload.currentCustomerName || '');
          this.currentMaterialName.set(payload.currentMaterialName || '');
          this.currentDestination.set(payload.currentDestination || '');
          this.currentPurchaseOrder.set(payload.currentPurchaseOrder || '');
          this.grossWeight.set(payload.grossWeight || 0);
          this.tareWeight.set(payload.tareWeight || 0);
          this.netWeight.set(payload.netWeight || 0);
          this.currentProcessStep.set(payload.currentProcessStep || 'Idle');
          this.systemStatus.set(payload.systemStatus || 'System Online');
          this.liveCameraImage.set(payload.liveCameraImage || '');
          this.anprCameraStatus.set(payload.anprCameraStatus || 'Ready');

          // If backend indicates exit barrier is open, set awaiting flag so UI can notify pass when sensor/ANPR detects
          try {
            const exitBarrierUpper = (payload.exitBarrier || '').toString().toUpperCase();
            if (exitBarrierUpper === 'OPEN') this.awaitingExitPass = true;
          } catch (e) {}
        } catch (e) {
          console.warn('ReceiveSystemStatus handler failed', e);
        }
      });

      // Also listen for explicit signal/barrier events for reliable animations
      this.hubConnection.on('ExitSignalChanged', (val: any) => {
        try {
          console.debug('SignalR ExitSignalChanged', val);
          const xs = (val || '').toString().toUpperCase();
          this.setExitSignal(xs === 'GREEN' ? SignalState.GREEN : SignalState.RED);
        } catch (e) { console.warn('ExitSignalChanged handler', e); }
      });

      this.hubConnection.on('ExitAutoCloseTimerChanged', (val: any) => {
        const remaining = Math.max(0, Number(val) || 0);
        this.exitAutoCloseTimer.set(remaining);
      });

      this.hubConnection.on('ExitBarrierOpened', () => {
        this.backendExitSequenceActive = true;
        this.awaitingExitPass = true;
        this.applyExitBarrierState(BarrierState.OPEN);
      });

      this.hubConnection.on('ExitBarrierClosed', () => {
        this.awaitingExitPass = false;
        this.backendExitSequenceActive = false;
        this.exitAutoCloseTimer.set(0);
        this.applyExitBarrierState(BarrierState.CLOSED);
      });

      this.hubConnection.on('ExitBarrierChanged', (val: any) => {
        try {
          console.debug('SignalR ExitBarrierChanged', val);
          const b = (val || '').toString().toUpperCase();
          if (b === 'OPEN') {
            this.backendExitSequenceActive = true;
            try { this.awaitingExitPass = true; } catch (e) {}
            this.applyExitBarrierState(BarrierState.OPEN);
          } else {
            try { this.awaitingExitPass = false; } catch (e) {}
            this.backendExitSequenceActive = false;
            this.exitAutoCloseTimer.set(0);
            this.applyExitBarrierState(BarrierState.CLOSED);
          }
        } catch (e) { console.warn('ExitBarrierChanged handler', e); }
      });

      this.hubConnection.on('EntryBarrierChanged', (val: any) => {
        try { console.debug('SignalR EntryBarrierChanged', val); const b = (val || '').toString().toUpperCase(); if (b === 'OPEN') this.openEntryBarrier(); else this.closeEntryBarrier(); } catch (e) { console.warn('EntryBarrierChanged handler', e); }
      });

      this.hubConnection.on('EntrySignalChanged', (val: any) => {
        try { console.debug('SignalR EntrySignalChanged', val); const es = (val || '').toString().toUpperCase(); this.setEntrySignal(es === 'GREEN' ? SignalState.GREEN : SignalState.RED); } catch (e) { console.warn('EntrySignalChanged handler', e); }
      });

      // Keep previous VehicleAdded handler for compatibility
      this.hubConnection.on('VehicleAdded', (payload: any) => {
        try {
          const plate = payload?.plateNumber || payload?.plate || payload?.PlateNumber;
          if (plate) {
            this.addLog({ plate: plate, status: payload.status || 'processed', time: payload.time || new Date(), weight: payload.weight ?? null });
          }
        } catch (e) { console.warn('VehicleAdded handler', e); }
      });

      // New: handle concise device events emitted by backend (VEHICLE_ENTRY, WEIGHING, WEIGH_COMPLETE, EXIT_OPEN, EXIT_CLOSE)
      this.hubConnection.on('DeviceEvent', (payload: any) => {
        try {
          if (!payload) return;
          const ev = (payload.event || payload.eventName || payload['@event'] || '').toString().toUpperCase();
          console.debug('SignalR DeviceEvent received', ev, payload);

          if (ev === 'VEHICLE_ENTRY' || ev === 'WEIGHING') {
            // force exit closed while vehicle is entering/weighing
            try {
              this.setExitSignal(SignalState.RED);
              this.exitBarrierState.next(BarrierState.CLOSED);
              // animate immediate close
              this.animateBarrier('exit', false);
            } catch (e) { console.warn('DeviceEvent VEHICLE_ENTRY handler failed', e); }
          }

          if (ev === 'WEIGH_COMPLETE') {
            try { this.setExitSignal(SignalState.RED); } catch (e) { console.warn('DeviceEvent WEIGH_COMPLETE handler failed', e); }
          }

          if (ev === 'EXIT_OPEN') {
            try {
              this.backendExitSequenceActive = true;
              this.setExitSignal(SignalState.GREEN);
              this.applyExitBarrierState(BarrierState.OPEN);
            } catch (e) { console.warn('DeviceEvent EXIT_OPEN handler failed', e); }
          }

          if (ev === 'EXIT_CLOSE') {
            try {
              this.setExitSignal(SignalState.RED);
              this.exitAutoCloseTimer.set(0);
              this.backendExitSequenceActive = false;
              this.applyExitBarrierState(BarrierState.CLOSED);
            } catch (e) { console.warn('DeviceEvent EXIT_CLOSE handler failed', e); }
          }
        } catch (e) { console.warn('DeviceEvent handler failed', e); }
      });

      // Position sensor explicit event (backend broadcasts OnScaleChanged)
      this.hubConnection.on('OnScaleChanged', (val: any) => {
        try {
          const onScale = !!val;
          this.weighbridge.update(w => ({ ...w, vehicleDetected: onScale }));
          if (onScale) this.weighbridge.update(w => ({ ...w, status: WeighbridgeStatus.WEIGHING }));
          else this.weighbridge.update(w => ({ ...w, status: WeighbridgeStatus.COMPLETE }));
            // When truck leaves the scale, evaluate whether exit barrier may open
            try { if (!onScale) this.checkExitBarrier(); } catch (e) { }
        } catch (e) { console.warn('OnScaleChanged handler', e); }
      });

      // New: handle VehicleProcessed notifications from backend
      this.hubConnection.on('VehicleProcessed', (payload: any) => {
        try {
          const plate = payload?.plate || payload?.plateNumber || payload?.PlateNumber;
          const status = (payload?.status || '').toString().toUpperCase();
          const weight = payload?.weight ?? null;
          if (status === 'ACCEPTED') {
            this.addLog({ plate, status: 'ACCEPTED', time: new Date(), weight });
            // open entry barrier for accepted vehicles, then close after a short delay
            this.openEntryBarrier();
            setTimeout(() => { this.closeEntryBarrier(); }, 3000);
          } else {
            this.addLog({ plate, status: 'REJECTED', time: new Date(), weight });
            this.updateLedMessage(`REJECTED: ${payload?.reason || ''}`);
          }
        } catch (e) { console.warn('VehicleProcessed handler', e); }
      });

      this.hubConnection.start().catch((err: any) => console.warn('SignalR start failed', err));
    } catch (e) {
      console.warn('initSignalR error', e);
    }
  }

  /**
   * Start auto mode but align the first cycle to the next clock boundary for the given interval.
   * Example: intervalMs=60000 aligns cycles to minute boundaries.
   */
  startAutoModeAligned(intervalMs = 60000): void {
    if (this.autoModeActive) return;
    this.autoModeActive = true;
    this.autoModeIntervalMs = intervalMs;

    // compute ms until next boundary (e.g., next minute)
    const now = Date.now();
    const untilNext = intervalMs - (now % intervalMs);
    this.scheduleAutoNextCycle(untilNext);
  }

  /**
   * Toggle entry signal between red and green
   */
  toggleEntrySignal(): void {
    const currentState = this.entrySignalState.getValue();
    const newState = currentState === SignalState.RED ? SignalState.GREEN : SignalState.RED;
    this.entrySignalState.next(newState);
    this.entrySignal.update(s => ({ ...s, state: newState }));
  }

  /**
   * Toggle exit signal between red and green
   */
  toggleExitSignal(): void {
    const currentState = this.exitSignalState.getValue();
    const newState = currentState === SignalState.RED ? SignalState.GREEN : SignalState.RED;
    this.exitSignalState.next(newState);
    this.exitSignal.update(s => ({ ...s, state: newState }));
  }

  /**
   * Set entry signal state directly
   */
  setEntrySignal(state: SignalState): void {
    this.entrySignalState.next(state);
    this.entrySignal.update(s => ({ ...s, state }));
  }

  /**
   * Set exit signal state directly
   */
  setExitSignal(state: SignalState): void {
    this.exitSignalState.next(state);
    this.exitSignal.update(s => ({ ...s, state }));
  }

  /**
   * Open entry barrier with animation
   */
  openEntryBarrier(cycleSeq?: number): any {
    // Prevent opening if exit barrier is open
    if (this.exitBarrier().state === BarrierState.OPEN) {
      this.updateLedMessage('Cannot open entry: Exit barrier is open');
      return this.http.post<any>(`${this.baseApi}/barrier/entry/open`, {});
    }

    this.entryBarrierState.next(BarrierState.OPEN);
    this.animateBarrier('entry', true, cycleSeq);
    return this.http.post<any>(`${this.baseApi}/barrier/entry/open`, {});
  }
  
  /**
   * Close entry barrier with animation
   */
  closeEntryBarrier(cycleSeq?: number): any {
    this.entryBarrierState.next(BarrierState.CLOSED);
    this.animateBarrier('entry', false, cycleSeq);
    return this.http.post<any>(`${this.baseApi}/barrier/entry/close`, {});
  }
  openExitBarrier(cycleSeq?: number): any {
    // Prevent opening if entry barrier is open
    if (this.entryBarrier().state === BarrierState.OPEN) {
      this.updateLedMessage('Cannot open exit: Entry barrier is open');
      return this.http.post<any>(`${this.baseApi}/barrier/exit/open`, {});
    }

    this.exitBarrierState.next(BarrierState.OPEN);
    this.animateBarrier('exit', true, cycleSeq);

    return this.http.post<any>(`${this.baseApi}/barrier/exit/open`, {});
  }

  private applyExitBarrierState(state: BarrierState, cycleSeq?: number): void {
    const opening = state === BarrierState.OPEN;
    this.exitBarrierState.next(state);
    this.exitBarrier.update(b => ({ ...b, state }));
    this.animateBarrier('exit', opening, cycleSeq);
  }

  /**
   * Set the auto-close delay for the exit barrier in milliseconds.
   * Persists the value to localStorage so it survives reloads.
   */
  setExitAutoCloseMs(ms: number): void {
    this.exitAutoCloseMs = Math.max(0, Number(ms) || 0);
    // Persist locally
    try { localStorage.setItem('scada.exitAutoCloseMs', String(this.exitAutoCloseMs)); } catch (e) {}
    // Also persist to backend config endpoint (best-effort)
    try {
      this.http.post<any>(`${this.baseApi}/barrier/config/exit-autoclose`, { ms: this.exitAutoCloseMs }).subscribe({
        next: () => { },
        error: () => { }
      });
    } catch (e) { }
  }

  /**
   * Get the currently configured auto-close delay for the exit barrier (ms).
   */
  getExitAutoCloseMs(): number {
    return this.exitAutoCloseMs;
  }

  /**
   * Close exit barrier with animation
   */
  closeExitBarrier(cycleSeq?: number): any {
    // If an auto-close timer exists, clear it (we're closing now)
    try {
      if (this.exitAutoCloseTimeout) {
        clearTimeout(this.exitAutoCloseTimeout);
        this.exitAutoCloseTimeout = null;
      }
    } catch (e) { }

    this.exitBarrierState.next(BarrierState.CLOSED);
    this.animateBarrier('exit', false, cycleSeq);
    return this.http.post<any>(`${this.baseApi}/barrier/exit/close`, {});
  }

  /**
   * Animate barrier movement
   */
  private animateBarrier(type: 'entry' | 'exit', opening: boolean, cycleSeq?: number): void {
    const duration = 1000; // 1 second for full animation (faster for automated flow)
    const intervalTime = 50;
    const steps = duration / intervalTime;
    let currentStep = 0;

    const updateBarrier = type === 'entry' ? this.entryBarrier : this.exitBarrier;
    const targetState = opening ? BarrierState.OPEN : BarrierState.CLOSED;

    timer(0, intervalTime)
      .pipe(take(steps))
      .subscribe({
        next: () => {
          if (cycleSeq != null && cycleSeq !== this.cycleId) return;
          currentStep++;
          const position = opening
            ? (currentStep / steps) * 90
            : 90 - (currentStep / steps) * 90;

          updateBarrier.update(b => ({
            ...b,
            state: currentStep === steps ? targetState : b.state,
            position
          }));
        },
        complete: () => {
          if (cycleSeq != null && cycleSeq !== this.cycleId) return;
          updateBarrier.update(b => ({
            ...b,
            state: targetState,
            position: opening ? 90 : 0
          }));
        }
      });
  }

  /**
   * Update LED display message
   */
  updateLedMessage(message: string): void {
    this.ledMessage.next(message);
  }

  /**
   * Toggle PA system
   */
  togglePaSystem(active: boolean, message?: string): void {
    this.paActive.next(active);
    if (message) {
      this.paMessage.next(message);
    } else {
      this.paMessage.next(active ? 'PA System Active' : 'No PA Announcement');
    }
  }

  /**
   * Toggle entry ANPR camera
   */
  toggleEntryAnprCamera(): void {
    // While continuous mode is active keep ANPR cameras enabled
    if (this.continuousMode) return;

    const current = this.entryAnprCamera();
    this.entryAnprCamera.update(c => ({
      ...c,
      active: !c.active,
      detectedPlate: !c.active ? '' : c.detectedPlate,
      confidence: !c.active ? 0 : c.confidence
    }));
  }

  /**
   * Toggle exit ANPR camera
   */
  toggleExitAnprCamera(): void {
    // While continuous mode is active keep ANPR cameras enabled
    if (this.continuousMode) return;

    const current = this.exitAnprCamera();
    this.exitAnprCamera.update(c => ({
      ...c,
      active: !c.active,
      detectedPlate: !c.active ? '' : c.detectedPlate,
      confidence: !c.active ? 0 : c.confidence
    }));
  }

  /**
   * Simulate vehicle detection on entry
   */
  simulateEntryVehicleDetection(): void {
    if (!this.entryAnprCamera().active) return;

    const plates = [
      'ABC-1234', 'XYZ-5678', 'DEF-9012', 'GHI-3456',
      'JKL-7890', 'MNO-2345', 'PQR-6789', 'STU-0123'
    ];
    const randomPlate = plates[Math.floor(Math.random() * plates.length)];
    const randomConfidence = Math.floor(Math.random() * 30) + 70; // 70-100%

    this.entryAnprCamera.update(c => ({
      ...c,
      detectedPlate: randomPlate,
      confidence: randomConfidence,
      lastDetection: new Date()
    }));
  }

  /**
   * Notify backend that the truck has cleared the weighbridge / exit sensor.
   */
  notifyVehiclePassed(): void {
    if (!this.awaitingExitPass) return;
    this.awaitingExitPass = false;
    this.http.post<any>(`${this.baseApi}/vehicle/pass`, {}).subscribe({
      next: () => console.debug('Notified backend of vehicle pass'),
      error: (e) => console.warn('notify pass failed', e)
    });
  }

  /**
   * Simulate vehicle detection on exit
   */
  simulateExitVehicleDetection(): void {
    if (this.exitAnprCamera().active) {
      const plates = [
        'WXY-4321', 'ZAB-8765', 'CDE-2109', 'FGH-6543',
        'IJK-0987', 'LMN-5432', 'OPQ-9876', 'RST-3210'
      ];
      const randomPlate = plates[Math.floor(Math.random() * plates.length)];
      const randomConfidence = Math.floor(Math.random() * 30) + 70;

      this.exitAnprCamera.update(c => ({
        ...c,
        detectedPlate: randomPlate,
        confidence: randomConfidence,
        lastDetection: new Date()
      }));
    }

    this.notifyVehiclePassed();
  }

  /**
   * Start weighing process
   */
  startWeighing(cycleSeq?: number): void {
    this.weighbridge.update(w => ({
      ...w,
      active: true,
      status: WeighbridgeStatus.WEIGHING,
      vehicleDetected: true
    }));

    // Simulate weight stabilization
    let iterations = 0;
    const targetWeight = Math.floor(Math.random() * 25000) + 5000; // 5000-30000 kg
    
    timer(0, 200).pipe(take(15)).subscribe({
      next: () => {
        if (cycleSeq != null && cycleSeq !== this.cycleId) return;
        iterations++;
        const progress = iterations / 15;
        const currentWeight = Math.floor(targetWeight * progress);
        
        this.weighbridge.update(w => ({
          ...w,
          weight: currentWeight
        }));
      },
      complete: () => {
        if (cycleSeq != null && cycleSeq !== this.cycleId) return;
        this.weighbridge.update(w => ({
          ...w,
          status: WeighbridgeStatus.COMPLETE,
          weight: targetWeight
        }));
        // After weight stabilization, check whether exit barrier should open
        try { this.checkExitBarrier(); } catch (e) { }
      }
    });
  }

  /**
   * Evaluate conditions and open/close the exit barrier locally for demo flows.
   * Conditions to open:
   *  - weighbridge.status === COMPLETE (measurement completed)
   *  - weighbridge.vehicleDetected === false (truck moved off bridge)
   *  - weight > 0 (stable weight present)
   */
  checkExitBarrier(): void {
    try {
      // If backend is driving the exit sequence via SignalR, don't fight it locally.
      if (this.backendExitSequenceActive) return;

      const wb = this.weighbridge();
      const measurementCompleted = wb.status === WeighbridgeStatus.COMPLETE;
      const truckOnBridge = !!wb.vehicleDetected;
      const stableWeight = (wb.weight || 0) > 0 && measurementCompleted;

      if (measurementCompleted && stableWeight && !truckOnBridge) {
        // Open exit barrier and set signal green
        this.setExitSignal(SignalState.GREEN);
        this.openExitBarrier();

        // Start auto-close timer
        try {
          if (this.exitAutoCloseTimeout) { clearTimeout(this.exitAutoCloseTimeout); this.exitAutoCloseTimeout = null; }
        } catch (e) { }

        // set a countdown value (seconds) for UI
        const secs = Math.max(0, Math.floor(this.exitAutoCloseMs / 1000));
        this.exitAutoCloseTimer.set(secs);

        if (this.exitAutoCloseMs > 0) {
          // Update countdown every second
          let remaining = Math.floor(this.exitAutoCloseMs / 1000);
          this.exitAutoCloseTimeout = setInterval(() => {
            remaining = Math.max(0, remaining - 1);
            this.exitAutoCloseTimer.set(remaining);
            if (remaining <= 0) {
              try { clearInterval(this.exitAutoCloseTimeout); } catch (e) { }
              this.exitAutoCloseTimeout = null;
              this.setExitSignal(SignalState.RED);
              this.closeExitBarrier();
              this.exitAutoCloseTimer.set(0);
            }
          }, 1000);
        }
      } else {
        // Ensure exit is closed and signal is red when conditions not met
        this.setExitSignal(SignalState.RED);
        // Do not force-close here if backend currently owns state, but animate closed locally
        this.applyExitBarrierState(BarrierState.CLOSED);
      }
    } catch (e) {
      console.warn('checkExitBarrier failed', e);
    }
  }

  /**
   * Reset weighbridge
   */
  resetWeighbridge(): void {
    this.weighbridge.update(w => ({
      ...w,
      active: false,
      weight: 0,
      status: WeighbridgeStatus.WAITING,
      vehicleDetected: false
    }));
  }

  /**
   * Reset the full SCADA system state (signals, barriers, messages, vehicle).
   * Used by the UI "Reset System" button.
   */
  resetSystem(): void {
    // Invalidate any in-flight timers/animations from an older cycle.
    this.cycleId++;

    // Signals
    this.setEntrySignal(SignalState.RED);
    this.setExitSignal(SignalState.RED);

    // Barriers (immediate reset; avoid animation timers fighting with reset)
    this.entryBarrierState.next(BarrierState.CLOSED);
    this.exitBarrierState.next(BarrierState.CLOSED);
    this.entryBarrier.update(b => ({ ...b, state: BarrierState.CLOSED, position: 0 }));
    this.exitBarrier.update(b => ({ ...b, state: BarrierState.CLOSED, position: 0 }));

    // Messages
    this.updateLedMessage('No LED message');
    this.paActive.next(false);
    this.paMessage.next('No PA Announcement');
    this.alertMessage.next('');

    // Cameras
    // Keep cameras active if continuous mode is on; otherwise reset
    this.entryAnprCamera.update(c => ({
      ...c,
      active: this.continuousMode ? true : false,
      detectedPlate: '',
      confidence: 0,
      lastDetection: null
    }));
    this.exitAnprCamera.update(c => ({
      ...c,
      active: this.continuousMode ? true : false,
      detectedPlate: '',
      confidence: 0,
      lastDetection: null
    }));

    // Vehicle + mode + weighing
    this.vehicleStatus.set(VehicleStatus.IDLE);
    this.mode.set(InputMode.ANPR);
    this.resetWeighbridge();
    // Manual demo: truck stays stationary until user simulates arrival

    if (this.autoModeActive) {
      this.scheduleAutoNextCycle(this.autoModeIntervalMs);
    }
  }

  /**
   * Toggle weighbridge activation
   */
  toggleWeighbridge(): void {
    const current = this.weighbridge();
    if (current.active) {
      this.resetWeighbridge();
    } else {
      this.weighbridge.update(w => ({
        ...w,
        active: !w.active
      }));
    }
  }

  /**
   * Start dummy data simulation for realistic SCADA behavior
   */
  private startDummyDataSimulation(): void {
    // Simulate signal blinking every 3 seconds
    interval(3000).subscribe(() => {
      this.entrySignal.update(s => ({ ...s, blinking: true }));
      setTimeout(() => {
        this.entrySignal.update(s => ({ ...s, blinking: false }));
      }, 500);
    });

    // Simulate ANPR detections every 5 seconds when active
    interval(5000).subscribe(() => {
      if (this.entryAnprCamera().active && Math.random() > 0.3) {
        this.simulateEntryVehicleDetection();
      }
      if (this.exitAnprCamera().active && Math.random() > 0.3) {
        this.simulateExitVehicleDetection();
      }
    });

    // Disabled: Simulate random vehicle passage every 10 seconds
    // Uncomment the lines below to re-enable automatic vehicle simulation
    /*
    interval(10000).subscribe(() => {
      this.simulateVehiclePassage();
    });
    */
  }

  /**
   * Simulate a vehicle passing through the gate
   */
  private simulateVehiclePassage(): void {
    // Only simulate if barriers are closed
    if (this.entryBarrier().state === BarrierState.CLOSED) {
      // Change entry signal to green
      this.setEntrySignal(SignalState.GREEN);

      // Open entry barrier after 1 second
      setTimeout(() => {
        this.openEntryBarrier();

        // Close entry barrier after 3 seconds
        setTimeout(() => {
          this.closeEntryBarrier();
          this.setEntrySignal(SignalState.RED);

          // Change exit signal to green
          this.setExitSignal(SignalState.GREEN);

          // Open exit barrier after 1 second
          setTimeout(() => {
            this.openExitBarrier();

            // Close exit barrier after 3 seconds
            setTimeout(() => {
              this.closeExitBarrier();
              this.setExitSignal(SignalState.RED);
            }, 3000);
          }, 1000);
        }, 3000);
      }, 1000);
    }
  }

  /**
   * Run a full automated cycle: entry open/close -> weighing -> exit open/close -> reset
   */
  runAutomatedCycle(): void {
    // Backwards-compatible wrapper — run the full validated cycle once
    this.simulateSingleVehicleCycle();
  }

  /**
   * Start automatic mode: trigger vehicle cycles every `intervalMs` milliseconds
   */
  startAutoMode(intervalMs = 10000): void {
    if (this.autoModeActive) return;
    this.autoModeActive = true;
    this.autoModeIntervalMs = intervalMs;

    // Start immediately, then the next cycle is scheduled only after completion.
    this.scheduleAutoNextCycle(0);
  }

  enableContinuousMode(): void {
    this.continuousMode = true;
    // start processing immediately if not already
    if (!this.isProcessing) this.scheduleAutoNextCycle(0);
  }

  disableContinuousMode(): void {
    this.continuousMode = false;
  }

  isContinuousModeActive(): boolean {
    return this.continuousMode;
  }

  /**
   * Schedules the next automated vehicle cycle.
   * The next cycle will only start after the previous one sets `vehicleStatus` back to `IDLE`.
   */
  private scheduleAutoNextCycle(delayMs: number): void {
    if (!this.autoModeActive) return;

    if (this.autoModeSub) {
      clearTimeout(this.autoModeSub);
      this.autoModeSub = null;
    }

    // Apply jitter to the requested delay so cycles vary slightly.
    const jitter = Math.floor((Math.random() * 2 - 1) * this.autoModeJitterMs);
    const effectiveDelay = Math.max(0, delayMs + jitter);

    this.autoModeSub = setTimeout(() => {
      this.autoModeSub = null;
      this.simulateSingleVehicleCycle();
    }, effectiveDelay);
  }

  // Runtime control APIs
  isAutoModeActive(): boolean {
    return this.autoModeActive;
  }

  setAutoModeInterval(baseMs: number, jitterMs = 500): void {
    this.autoModeIntervalMs = baseMs;
    this.autoModeJitterMs = jitterMs;
  }

  setRejectionProbability(p: number): void {
    this.rejectionProbability = Math.max(0, Math.min(1, p));
  }

  getRejectionProbability(): number {
    return this.rejectionProbability;
  }

  // External polling (simple fetch) — updates nothing by default but demonstrates integration
  enablePolling(url: string, intervalMs = 5000): void {
    this.disablePolling();
    this.pollingId = setInterval(async () => {
      try {
        const resp = await fetch(url);
        const data = await resp.json();
        console.log('[Polling] data', data);
        // TODO: map external data to SCADA state if desired
      } catch (e) {
        console.warn('Polling error', e);
      }
    }, intervalMs);
  }

  disablePolling(): void {
    if (this.pollingId) {
      clearInterval(this.pollingId);
      this.pollingId = null;
    }
  }

  enableWebSocket(url: string): void {
    this.disableWebSocket();
    try {
      this.websocket = new WebSocket(url);
      this.websocket.onopen = () => console.log('[WS] connected');
      this.websocket.onmessage = ev => {
        try {
          const data = JSON.parse(ev.data);
          console.log('[WS] message', data);
          // TODO: map external data to SCADA state if desired
        } catch (e) {
          console.warn('WS parse error', e);
        }
      };
      this.websocket.onclose = () => console.log('[WS] closed');
      this.websocket.onerror = e => console.warn('[WS] error', e);
    } catch (e) {
      console.warn('WS init failed', e);
    }
  }

  disableWebSocket(): void {
    if (this.websocket) {
      try {
        this.websocket.close();
      } catch {}
      this.websocket = null;
    }
  }

  /**
   * Send notification to customer portal (simulated)
   */
  private notifyCustomerPortal(eventType: string, details: any): void {
    // In real app, POST to portal. Here we simulate with console and log entry.
    console.log('[Notify Portal]', eventType, details);
    this.addLog({ mode: this.mode(), event: eventType, time: new Date(), details });
  }

  private async callApiWithTimeout(url: string, body: any, timeoutMs = 2500): Promise<any> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(id);
      if (!resp.ok) throw new Error('api-error');
      return resp.json();
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  /**
   * Animate the demo truck between percentage positions using requestAnimationFrame.
   * Resolves when the target position is reached. Honors cancellation via cycleId.
   */
  // In manual mode we rely on CSS animations triggered by `vehicleStatus` classes.

  /**
   * Mock ANPR validation - simulate a backend lookup with latency.
   * Returns true for assigned vehicles most of the time, otherwise false.
   */
  async validateAnprApi(plate: string): Promise<boolean> {
    // simulate network latency
    await new Promise(res => setTimeout(res, 300 + Math.floor(Math.random() * 200)));

    // If plate is not in the assignment list, reject
    const assigned = !!this.assignments[plate];
    if (!assigned) return false;

    // For assigned vehicles, randomly reject according to `rejectionProbability`.
    return Math.random() > this.rejectionProbability;
  }


  stopAutoMode(): void {
    // Prevent stopping auto mode while continuous mode is active
    if (this.continuousMode) {
      console.warn('stopAutoMode() ignored: continuous mode is active');
      return;
    }

    this.autoModeActive = false;
    if (this.autoModeSub) clearTimeout(this.autoModeSub);
    this.autoModeSub = null;
  }

  getVehicleLogs(): BehaviorSubject<Array<any>> {
    return this.vehicleLogs;
  }


  private addLog(entry: any): void {
    const current = this.vehicleLogs.getValue();
    // Normalize log shape so UI can reliably display processed/rejected entries
    const normalized = {
      plate: entry.plate || entry.details?.plate || 'N/A',
      // Add plateNumber for templates that expect this property
      plateNumber: entry.plateNumber || entry.plate || entry.details?.plate || 'N/A',
      status: entry.status || entry.event || 'info',
      time: entry.time || new Date(),
      weight: entry.weight ?? entry.details?.weight ?? null,
      consignment: entry.consignment || entry.details?.consignment || null,
      mode: entry.mode || this.mode(),
      raw: entry
    };

    current.unshift(normalized);
    const next = current.slice(0, 100);
    this.vehicleLogs.next(next);
    // persist to localStorage for demo/demo recovery
    try {
      localStorage.setItem('scada.vehicleLogs', JSON.stringify(next));
    } catch (e) {
      console.warn('failed to persist logs', e);
    }
  }

  /**
   * Public helper for components to push a normalized log entry into the central log store.
   */
  pushLog(entry: any): void {
    try {
      this.addLog(entry);
    } catch (e) {
      console.warn('pushLog failed', e);
    }
  }

  /**
   * Simulate a single vehicle processing cycle including ANPR validation.
   * If `providedPlate` is given, the cycle will use that plate instead of
   * choosing a random one (useful for manual/testing flows).
   */
  simulateSingleVehicleCycle(providedPlate?: string): void {
    // Prevent overlapping cycles using internal processing flag
    if (this.isProcessing) return;

    const seq = ++this.cycleId;
    this.isProcessing = true;

    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

    (async () => {
      // reset messages and status
      this.updateLedMessage('VEHICLE DETECTED');
      this.vehicleStatus.set(VehicleStatus.ARRIVED);
      this.mode.set(InputMode.ANPR);
      this.alertMessage.next('');

      // Simulate ANPR read - prefer providedPlate when available
      const plates = ['ABC-1234', 'XYZ-5678', 'DEF-9012', 'GHI-3456', 'JKL-7890'];
      const plate = providedPlate ?? plates[Math.floor(Math.random() * plates.length)];
      this.entryAnprCamera.update(c => ({ ...c, detectedPlate: plate, confidence: Math.floor(70 + Math.random() * 30), lastDetection: new Date() }));

      // ANPR delay (realistic)
      await sleep(2000);

      const anprOk = await this.validateAnprApi(plate);
      if (!anprOk) {
        this.vehicleStatus.set(VehicleStatus.INVALID);
        this.updateLedMessage('INVALID VEHICLE');
        this.togglePaSystem(true, 'Access Denied');
        this.setEntrySignal(SignalState.RED);
        this.addLog({ plate, status: 'rejected', time: new Date(), weight: null, consignment: null, mode: this.mode() });
        await sleep(2500);
        this.togglePaSystem(false, 'No PA Announcement');
        this.updateLedMessage('NO LED MESSAGE');

        if (this.continuousMode) {
          // let the vehicle exit so movement continues; keep UI in non-IDLE state
          this.setExitSignal(SignalState.GREEN);
          this.openExitBarrier();
          await sleep(2000);
          this.closeExitBarrier();
          this.setExitSignal(SignalState.RED);
          this.vehicleStatus.set(VehicleStatus.ARRIVED);
          this.isProcessing = false;
          this.scheduleAutoNextCycle(this.autoModeIntervalMs);
          return;
        }

        this.vehicleStatus.set(VehicleStatus.IDLE);
        this.isProcessing = false;
        return;
      }

      const assignment = this.assignments[plate];
      if (!assignment) {
        this.vehicleStatus.set(VehicleStatus.INVALID);
        this.updateLedMessage('INVALID VEHICLE');
        this.setEntrySignal(SignalState.RED);
        this.addLog({ plate, status: 'rejected', time: new Date(), weight: null, consignment: null, mode: this.mode() });
        await sleep(2500);
        this.updateLedMessage('NO LED MESSAGE');

        if (this.continuousMode) {
          this.setExitSignal(SignalState.GREEN);
          this.openExitBarrier();
          await sleep(2000);
          this.closeExitBarrier();
          this.setExitSignal(SignalState.RED);
          this.vehicleStatus.set(VehicleStatus.ARRIVED);
          this.isProcessing = false;
          this.scheduleAutoNextCycle(this.autoModeIntervalMs);
          return;
        }

        this.vehicleStatus.set(VehicleStatus.IDLE);
        this.isProcessing = false;
        return;
      }

      // Assigned vehicle: proceed
      this.vehicleStatus.set(VehicleStatus.VALIDATED);
      this.updateLedMessage(`TRUCK ${plate} VALIDATED`);
      this.setEntrySignal(SignalState.GREEN);

      // Open entry barrier (animation 1s inside animateBarrier)
      await sleep(1000);
      this.openEntryBarrier();

      // Start the truck moving toward the weighbridge center while the barrier opens
      // Wait for barrier to open and initial movement
      await sleep(1000);

      // Begin truck movement toward center (entry barrier will close after truck crosses)
      this.setEntrySignal(SignalState.RED);
      this.vehicleStatus.set(VehicleStatus.POSITIONING);
      this.updateLedMessage('TRUCK ENTERED WB');

      // Wait for entering animation (handled by CSS) to complete
      await sleep(2500);

      // After truck has reached center, close entry barrier (it has cleared the entry)
      this.closeEntryBarrier();

      // Truck reached weighbridge center
      this.updateLedMessage('POSITION OK');
      this.vehicleStatus.set(VehicleStatus.READY);

      // Start weighing phase
      await sleep(1000);
      this.updateLedMessage('WEIGHING IN PROGRESS');
      this.vehicleStatus.set(VehicleStatus.WEIGHING);
      this.startWeighing();

      // Wait for weighing to finish (weighing sim ~3000ms)
      await sleep(3000);
      const wb = this.weighbridge();
      this.updateLedMessage(`WEIGHT: ${wb.weight} KG`);
      this.togglePaSystem(true, 'Weighing Completed, Please Proceed');

      // Exit sequence is backend-owned after weigh complete; SignalR updates barrier/signal state.
      await sleep(1000);
      try {
        // mark backend as owner of exit barrier transitions for this cycle
        this.backendExitSequenceActive = true;
        this.http.post<any>(`${this.baseApi}/weigh/complete`, { delayMs: this.exitAutoCloseMs }).subscribe({
          error: (e) => console.warn('weigh complete trigger failed', e)
        });
      } catch (e) {
        console.warn('weigh complete trigger failed', e);
      }

      // Trigger exit animation by setting status to EXITED and wait for it to complete
      this.vehicleStatus.set(VehicleStatus.EXITED);
      await sleep(2400);
      this.simulateExitVehicleDetection();

      // log success
      this.addLog({ plate, status: 'processed', time: new Date(), weight: wb.weight, consignment: assignment.consignment, mode: this.mode() });

      // Reset
      await sleep(1000);
      this.resetWeighbridge();
      this.updateLedMessage('NO LED MESSAGE');
      this.togglePaSystem(false, 'No PA Announcement');

      // If continuous mode is active, immediately schedule the next cycle
      if (this.continuousMode) {
        // keep UI in a non-IDLE state to show continuous movement
        this.vehicleStatus.set(VehicleStatus.ARRIVED);
        this.isProcessing = false;
        this.scheduleAutoNextCycle(this.autoModeIntervalMs);
        return;
      }

      // Normal (non-continuous): set to IDLE to allow manual interactions
      this.vehicleStatus.set(VehicleStatus.IDLE);
      this.isProcessing = false;
    })();

    // scheduling is handled inside the async cycle to avoid duplicate scheduling
  }

  /**
   * Get complete SCADA system state
   */
  getScadaData(): ScadaData {
    return {
      entrySignal: this.entrySignal(),
      exitSignal: this.exitSignal(),
      entryBarrier: this.entryBarrier(),
      exitBarrier: this.exitBarrier(),
      ledDisplay: this.ledDisplay(),
      paSystem: this.paSystem(),
      overviewCameraActive: this.overviewCameraActive(),
      entryAnprCamera: this.entryAnprCamera(),
      exitAnprCamera: this.exitAnprCamera(),
      weighbridge: this.weighbridge()
    };
  }
}
