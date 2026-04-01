import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-anpr-camera',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './anpr-camera.component.html',
  styleUrl: './anpr-camera.component.css'
})
export class AnprCameraComponent {
  @Input() active: boolean = false;
  @Input() detectedPlate: string = '';
  @Input() confidence: number = 0;
  @Input() label: string = '';

  getConfidenceColor(): string {
    if (this.confidence >= 90) return '#00ff00';
    if (this.confidence >= 70) return '#ffff00';
    return '#ff4444';
  }

  getConfidenceWidth(): string {
    return `${Math.min(100, Math.max(0, this.confidence))}%`;
  }
}
