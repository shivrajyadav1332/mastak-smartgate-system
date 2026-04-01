import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SignalState } from '../../models/scada.models';

@Component({
  selector: 'app-signal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './signal.component.html',
  styleUrl: './signal.component.css'
})
export class SignalComponent {
  @Input() state: SignalState = SignalState.RED;
  @Input() blinking: boolean | undefined = false;
  @Input() label: string = '';

  readonly SignalState = SignalState;
}
