/**
 * Signal state enumeration for traffic lights
 */
export enum SignalState {
  RED = 'red',
  GREEN = 'green'
}

/**
 * Barrier state enumeration for boom barriers
 */
export enum BarrierState {
  OPEN = 'open',
  CLOSED = 'closed'
}

/**
 * Interface for signal component data
 */
export interface Signal {
  id: string;
  name: string;
  state: SignalState;
  blinking?: boolean;
}

/**
 * Interface for barrier component data
 */
export interface Barrier {
  id: string;
  name: string;
  state: BarrierState;
  position?: number; // 0-100 for animation progress
}

/**
 * Interface for LED display configuration
 */
export interface LedDisplay {
  message: string;
  color: string;
  visible: boolean;
}

/**
 * Interface for PA system status
 */
export interface PaSystem {
  active: boolean;
  message: string;
}

/**
 * Interface for ANPR camera data
 */
export interface AnprCamera {
  id: string;
  name: string;
  active: boolean;
  detectedPlate: string;
  confidence: number;
  lastDetection: Date | null;
}

/**
 * Enum for weighbridge status
 */
export enum WeighbridgeStatus {
  WAITING = 'waiting',
  WEIGHING = 'weighing',
  COMPLETE = 'complete'
}

/**
 * Vehicle processing status for the weighbridge workflow
 */
export enum VehicleStatus {
  IDLE = 'idle',
  ARRIVED = 'arrived',
  VALIDATED = 'validated',
  INVALID = 'invalid',
  POSITIONING = 'positioning',
  READY = 'ready',
  WEIGHING = 'weighing',
  EXITED = 'exited'
}

/**
 * Input mode for vehicle validation
 */
export enum InputMode {
  ANPR = 'anpr'
}

/**
 * Interface for weighbridge data
 */
export interface Weighbridge {
  id: string;
  name: string;
  active: boolean;
  weight: number; // in kg
  status: WeighbridgeStatus;
  vehicleDetected: boolean;
}

/**
 * Main SCADA system data interface
 */
export interface ScadaData {
  entrySignal: Signal;
  exitSignal: Signal;
  entryBarrier: Barrier;
  exitBarrier: Barrier;
  ledDisplay: LedDisplay;
  paSystem: PaSystem;
  overviewCameraActive: boolean;
  entryAnprCamera: AnprCamera;
  exitAnprCamera: AnprCamera;
  weighbridge: Weighbridge;
}
