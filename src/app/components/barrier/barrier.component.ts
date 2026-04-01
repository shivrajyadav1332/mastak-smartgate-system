import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BarrierState } from '../../models/scada.models';

@Component({
  selector: 'app-barrier',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './barrier.component.html',
  styleUrl: './barrier.component.css'
})
export class BarrierComponent {
  @Input() state: BarrierState = BarrierState.CLOSED;
  @Input() position: number | undefined = 0;
  @Input() label: string = '';

  readonly BarrierState = BarrierState;
}
