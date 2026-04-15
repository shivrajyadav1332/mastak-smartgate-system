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

  addVehicle(plate: string) {
    // VehicleDto expects `PlateNumber` (PascalCase)
    return this.http.post<any>(this.apiUrl, { PlateNumber: plate });
  }

  // Check a plate via backend validation endpoint
  checkVehicle(plate: string) {
    return this.http.get<any>(`${this.apiUrl}/check/${plate}`);
  }

  // Allowed plates management (GET/POST)
  getAllowedPlates() {
    return this.http.get<string[]>(`${this.apiUrl}/allowed`);
  }

  setAllowedPlates(plates: string[]) {
    return this.http.post<string[]>(`${this.apiUrl}/allowed`, plates);
  }

  // GET all vehicles (in-memory) from backend
  getVehicles() {
    return this.http.get<any[]>(this.apiUrl);
  }

  getLogs() {
    return this.http.get<any[]>(this.apiUrl + '/logs');
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

  private apiUrl = 'http://localhost:5001/api/vehicle';
  private hubConnection: signalR.HubConnection | null = null;

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

    // Try to connect to backend SignalR hub for real-time events
    this.initSignalR();
  }

  // Trigger a vehicle check event
  triggerVehicleCheck(plate: string) {
    try { this.vehicleTrigger.next(plate); } catch (e) { }
  }

  private initSignalR() {
    try {
      this.hubConnection = new signalR.HubConnectionBuilder()
        .withUrl('http://localhost:5001/hub/vehicle')
        .withAutomaticReconnect()
        .build();

      this.hubConnection.on('VehicleAdded', (payload: any) => {
        try {
          const plate = payload?.plateNumber || payload?.plate || payload?.PlateNumber;
          if (plate) {
            // start a processing cycle in the frontend driven by the received plate
            this.simulateSingleVehicleCycle(plate);
            // also add to local logs so UI shows it immediately
            this.addLog({ plate: plate, status: payload.status || 'processed', time: payload.time || new Date(), weight: payload.weight ?? null });
          }
        } catch (e) { console.warn('VehicleAdded handler', e); }
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
  openEntryBarrier(cycleSeq?: number): void {
    // Prevent opening if exit barrier is open
    if (this.exitBarrier().state === BarrierState.OPEN) {
      this.updateLedMessage('Cannot open entry: Exit barrier is open');
      return;
    }

    this.entryBarrierState.next(BarrierState.OPEN);
    this.animateBarrier('entry', true, cycleSeq);
  }

  /**
   * Close entry barrier with animation
   */
  closeEntryBarrier(cycleSeq?: number): void {
    this.entryBarrierState.next(BarrierState.CLOSED);
    this.animateBarrier('entry', false, cycleSeq);
  }

  /**
   * Open exit barrier with animation
   */
  openExitBarrier(cycleSeq?: number): void {
    // Prevent opening if entry barrier is open
    if (this.entryBarrier().state === BarrierState.OPEN) {
      this.updateLedMessage('Cannot open exit: Entry barrier is open');
      return;
    }

    this.exitBarrierState.next(BarrierState.OPEN);
    this.animateBarrier('exit', true, cycleSeq);
  }

  /**
   * Close exit barrier with animation
   */
  closeExitBarrier(cycleSeq?: number): void {
    this.exitBarrierState.next(BarrierState.CLOSED);
    this.animateBarrier('exit', false, cycleSeq);
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
   * Simulate vehicle detection on exit
   */
  simulateExitVehicleDetection(): void {
    if (!this.exitAnprCamera().active) return;

    const plates = [
      'WXY-4321', 'ZAB-8765', 'CDE-2109', 'FGH-6543',
      'IJK-0987', 'LMN-5432', 'OPQ-9876', 'RST-3210'
    ];
    const randomPlate = plates[Math.floor(Math.random() * plates.length)];
    const randomConfidence = Math.floor(Math.random() * 30) + 70; // 70-100%

    this.exitAnprCamera.update(c => ({
      ...c,
      detectedPlate: randomPlate,
      confidence: randomConfidence,
      lastDetection: new Date()
    }));
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
      }
    });
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

      // Exit sequence: open exit and allow exiting animation (handled by CSS)
      await sleep(1000);
      this.setExitSignal(SignalState.GREEN);
      this.openExitBarrier();

      // Trigger exit animation by setting status to EXITED and wait for it to complete
      this.vehicleStatus.set(VehicleStatus.EXITED);
      await sleep(2400);

      // Keep exit open briefly to allow truck to clear
      await sleep(300);
      this.closeExitBarrier();
      this.setExitSignal(SignalState.RED);

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
