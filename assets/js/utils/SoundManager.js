import { LocalStorage } from '../storage/LocalStorage.js';

export class SoundManager {
  constructor() {
    this._ctx = null;
    this._enabled = true;
    this._volume = 0.7;
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    this._enabled = LocalStorage.getSettings()?.soundEnabled !== false;
    this._volume = LocalStorage.getVolume();
    this._initialized = true;
  }

  _ensureContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    const settings = LocalStorage.getSettings();
    settings.soundEnabled = enabled;
    LocalStorage.setSettings(settings);
  }

  setVolume(vol) {
    this._volume = Math.max(0, Math.min(1, vol));
    LocalStorage.setVolume(this._volume);
  }

  _play(freq, duration, type = 'square', slide = 0) {
    if (!this._enabled) return;
    try {
      const ctx = this._ensureContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slide) {
        osc.frequency.linearRampToValueAtTime(freq + slide, ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(this._volume * 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Audio not available
    }
  }

  playCardPlay() {
    this._play(523, 0.08, 'square');
    setTimeout(() => this._play(659, 0.12, 'square'), 60);
    setTimeout(() => this._play(784, 0.18, 'square', 50), 120);
  }

  playCardDraw() {
    this._play(350, 0.1, 'triangle');
    setTimeout(() => this._play(260, 0.15, 'triangle', -80), 80);
  }

  playUno() {
    this._play(523, 0.15, 'square');
    setTimeout(() => this._play(659, 0.15, 'square'), 150);
    setTimeout(() => this._play(784, 0.3, 'square'), 300);
  }

  playWin() {
    const notes = [523, 587, 659, 698, 784, 880, 988, 1047];
    notes.forEach((note, i) => {
      setTimeout(() => this._play(note, 0.2, 'square', 50), i * 100);
    });
  }

  playLose() {
    this._play(400, 0.3, 'sawtooth', -100);
    setTimeout(() => this._play(300, 0.3, 'sawtooth', -100), 200);
    setTimeout(() => this._play(200, 0.5, 'sawtooth', -50), 400);
  }

  playButtonClick() {
    this._play(600, 0.05, 'square', 100);
  }

  playInvalidMove() {
    this._play(200, 0.2, 'square', -50);
    setTimeout(() => this._play(150, 0.3, 'square'), 150);
  }

  playTurnChange() {
    this._play(440, 0.06, 'sine');
    setTimeout(() => this._play(554, 0.06, 'sine'), 70);
    setTimeout(() => this._play(659, 0.2, 'sine', 50), 140);
  }

  playReverse() {
    this._play(400, 0.1, 'sine', -200);
    setTimeout(() => this._play(500, 0.1, 'sine', 200), 100);
  }

  playSkip() {
    this._play(300, 0.1, 'square', -100);
    setTimeout(() => this._play(200, 0.2, 'square', -50), 80);
  }

  playDrawTwo() {
    this._play(350, 0.1, 'sawtooth', 100);
    setTimeout(() => this._play(450, 0.1, 'sawtooth', 100), 100);
    setTimeout(() => this._play(550, 0.15, 'sawtooth'), 200);
  }

  playWild() {
    this._play(300, 0.1, 'triangle', 100);
    setTimeout(() => this._play(500, 0.1, 'triangle', 100), 100);
    setTimeout(() => this._play(700, 0.2, 'triangle'), 200);
  }

  playCountdown() {
    this._play(440, 0.05, 'sine');
  }

  playGameStart() {
    const notes = [262, 330, 392, 523];
    notes.forEach((note, i) => {
      setTimeout(() => this._play(note, 0.2, 'triangle'), i * 150);
    });
  }

  playJoin() {
    this._play(440, 0.1, 'sine');
    setTimeout(() => this._play(550, 0.15, 'sine'), 80);
  }

  playLeave() {
    this._play(440, 0.1, 'sine', -100);
    setTimeout(() => this._play(330, 0.15, 'sine', -100), 80);
  }

  playChat() {
    this._play(800, 0.05, 'sine');
  }
}

export const soundManager = new SoundManager();
