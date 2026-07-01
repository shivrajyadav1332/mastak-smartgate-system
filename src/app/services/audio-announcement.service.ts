import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AudioAnnouncementEvent =
  | 'VehicleDetected'
  | 'TruckMisaligned'
  | 'TruckAligned'
  | 'WeightCaptured'
  | 'ExitApproved';

export type AudioPlaybackStatus = 'idle' | 'loading' | 'playing' | 'stopped' | 'error';

export interface AudioAnnouncementDefinition {
  event: AudioAnnouncementEvent;
  label: string;
  message: string;
  fileName: string;
}

export interface AudioAnnouncementState {
  currentAnnouncement: string;
  lastAnnouncementTime: Date | null;
  playbackStatus: AudioPlaybackStatus;
  event: AudioAnnouncementEvent | null;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AudioAnnouncementService {
  private readonly audioBasePath = 'assets/audio';
  private readonly announcements: Record<AudioAnnouncementEvent, AudioAnnouncementDefinition> = {
    VehicleDetected: {
      event: 'VehicleDetected',
      label: 'Vehicle Detected',
      message: 'Welcome. Please proceed to the weighbridge.',
      fileName: 'welcome.mp3'
    },
    TruckMisaligned: {
      event: 'TruckMisaligned',
      label: 'Truck Misaligned',
      message: 'Please align your vehicle properly on the weighbridge.',
      fileName: 'align-vehicle.mp3'
    },
    TruckAligned: {
      event: 'TruckAligned',
      label: 'Truck Aligned',
      message: 'Vehicle alignment successful.',
      fileName: 'vehicle-aligned.mp3'
    },
    WeightCaptured: {
      event: 'WeightCaptured',
      label: 'Weight Captured',
      message: 'Weight recorded successfully.',
      fileName: 'weight-recorded.mp3'
    },
    ExitApproved: {
      event: 'ExitApproved',
      label: 'Exit Approved',
      message: 'Exit approved. Please proceed to the exit gate.',
      fileName: 'exit-approved.mp3'
    }
  };

  private currentAudio: HTMLAudioElement | null = null;
  private lastEvent: AudioAnnouncementEvent | null = null;
  private lastEventAt = 0;
  private readonly statusSubject = new BehaviorSubject<AudioAnnouncementState>({
    currentAnnouncement: 'No announcement',
    lastAnnouncementTime: null,
    playbackStatus: 'idle',
    event: null
  });

  readonly status$ = this.statusSubject.asObservable();

  preloadAudio(): void {
    Object.values(this.announcements).forEach((announcement) => {
      const audio = new Audio(this.getAudioUrl(announcement.fileName));
      audio.preload = 'auto';
      audio.load();
    });
  }

  async announce(event: AudioAnnouncementEvent): Promise<void> {
    const announcement = this.announcements[event];
    if (!announcement) {
      console.warn('[AudioAnnouncement] Unknown event', event);
      return;
    }

    if (this.isDuplicateEvent(event)) {
      console.debug('[AudioAnnouncement] Duplicate event suppressed', event);
      return;
    }

    this.lastEvent = event;
    this.lastEventAt = Date.now();
    this.stop();
    this.updateStatus(announcement, 'loading');

    const audio = new Audio(this.getAudioUrl(announcement.fileName));
    audio.preload = 'auto';
    this.currentAudio = audio;

    audio.onended = () => {
      if (this.currentAudio === audio) {
        this.currentAudio = null;
        this.updateStatus(announcement, 'idle');
      }
    };

    audio.onerror = () => {
      const error = `Unable to load ${announcement.fileName}`;
      console.warn('[AudioAnnouncement]', error);
      if (this.currentAudio === audio) {
        this.currentAudio = null;
      }
      this.updateStatus(announcement, 'error', error);
      this.speakFallback(announcement);
    };

    try {
      await audio.play();
      this.updateStatus(announcement, 'playing');
      console.debug('[AudioAnnouncement] Playing', announcement.event, announcement.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Playback failed';
      console.warn('[AudioAnnouncement] Playback failed', announcement.event, error);
      this.updateStatus(announcement, 'error', message);
      this.speakFallback(announcement);
    }
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
      this.statusSubject.next({
        ...this.statusSubject.getValue(),
        playbackStatus: 'stopped'
      });
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  getAnnouncement(event: AudioAnnouncementEvent): AudioAnnouncementDefinition {
    return this.announcements[event];
  }

  private getAudioUrl(fileName: string): string {
    return `${this.audioBasePath}/${fileName}`;
  }

  private isDuplicateEvent(event: AudioAnnouncementEvent): boolean {
    return this.lastEvent === event && Date.now() - this.lastEventAt < 1200;
  }

  private updateStatus(
    announcement: AudioAnnouncementDefinition,
    playbackStatus: AudioPlaybackStatus,
    error?: string
  ): void {
    this.statusSubject.next({
      currentAnnouncement: announcement.message,
      lastAnnouncementTime: new Date(),
      playbackStatus,
      event: announcement.event,
      error
    });
  }

  private speakFallback(announcement: AudioAnnouncementDefinition): void {
    if (!('speechSynthesis' in window)) return;

    try {
      const utterance = new SpeechSynthesisUtterance(announcement.message);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.onstart = () => this.updateStatus(announcement, 'playing');
      utterance.onend = () => this.updateStatus(announcement, 'idle');
      utterance.onerror = (event) => {
        this.updateStatus(announcement, 'error', event.error || 'Speech fallback failed');
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech fallback failed';
      console.warn('[AudioAnnouncement] Speech fallback failed', error);
      this.updateStatus(announcement, 'error', message);
    }
  }
}
