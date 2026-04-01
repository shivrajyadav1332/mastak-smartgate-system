import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeighbridgeStatus } from '../../models/scada.models';

@Component({
  selector: 'app-weighbridge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './weighbridge.component.html',
  styleUrl: './weighbridge.component.css'
})
export class WeighbridgeComponent {
  @Input() active: boolean = false;
  @Input() weight: number = 0;
  @Input() status: WeighbridgeStatus = WeighbridgeStatus.WAITING;
  @Input() vehicleDetected: boolean = false;

  readonly WeighbridgeStatus = WeighbridgeStatus;

  getStatusText(): string {
    switch (this.status) {
      case WeighbridgeStatus.WAITING:
        return 'Waiting for vehicle';
      case WeighbridgeStatus.WEIGHING:
        return 'Weighing in progress';
      case WeighbridgeStatus.COMPLETE:
        return 'Weighing complete';
      default:
        return '';
    }
  }

  getStatusColor(): string {
    switch (this.status) {
      case WeighbridgeStatus.WAITING:
        return '#ffff00';
      case WeighbridgeStatus.WEIGHING:
        return '#ff8800';
      case WeighbridgeStatus.COMPLETE:
        return '#00ff00';
      default:
        return '#ffffff';
    }
  }

  formatWeight(): string {
    return this.weight.toLocaleString('en-US');
  }
}
