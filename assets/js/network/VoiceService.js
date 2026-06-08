import { eventBus } from '../core/EventSystem.js';
import {
  EVENTS,
  VOICE_CLIP_CHUNK_B64,
  VOICE_MAX_BYTES,
  VOICE_MAX_DURATION_MS,
  VOICE_MIN_DURATION_MS
} from '../core/Constants.js';
import { Notification } from '../ui/Notification.js';
import { VoiceClipStore } from './VoiceClipStore.js';
import { VoiceRecorder } from './VoiceRecorder.js';
import { describeMicrophoneError, beginMicrophoneCapture } from './MicrophoneAccess.js';
import { playClipAudio } from './VoiceAudio.js';

function generateClipId() {
  return `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class VoiceService {
  /**
   * @param {{ playerId: string, isHost: boolean, sendEvent: Function, sendEventTo: Function, broadcast: Function }} options
   */
  constructor(options) {
    this.playerId = options.playerId;
    this.isHost = options.isHost;
    this._sendEvent = options.sendEvent;
    this._sendEventTo = options.sendEventTo;
    this._broadcast = options.broadcast;

    this.store = new VoiceClipStore();
    this.recorder = new VoiceRecorder();
    this._playingAudio = null;
    this._playingKey = null;
    this._playAbortController = null;
    /** @type {Map<string, { parts: string[], partCount: number, meta: object }>} */
    this._pendingParts = new Map();
    this._unsubscribers = [];

    this._bindEvents();
  }

  _bindEvents() {
    this._unsubscribers.push(
      eventBus.on('voice:record-toggle', () => this.toggleRecording())
    );
    this._unsubscribers.push(
      eventBus.on('voice:play', (data) => {
        if (data?.playerId && data?.clipId) this.playClip(data.playerId, data.clipId);
      })
    );
    this._unsubscribers.push(
      eventBus.on('voice:stop-playback', () => this.stopPlayback())
    );
  }

  static isSupported() {
    return VoiceRecorder.isSupported();
  }

  isRecording() {
    return this.recorder.isRecording;
  }

  getClips(playerId) {
    return this.store.getClips(playerId);
  }

  async toggleRecording() {
    if (this.recorder.isRecording) {
      return this.finishRecording();
    }
    return this.startRecordingFromCapture(beginMicrophoneCapture());
  }

  async startRecordingFromCapture(capture) {
    try {
      this.stopPlayback();
      const stream = await capture.promise;
      await this.recorder.startWithStream(stream);
      eventBus.emit('voice:recording-state', { recording: true, maxMs: VOICE_MAX_DURATION_MS });
      Notification.info('جاري التسجيل... اضغط إيقاف عند الانتهاء', 2000);
    } catch (err) {
      console.error('[VoiceService] start recording failed:', err?.name, err?.message || err);
      const message = await describeMicrophoneError(err);
      eventBus.emit('voice:error', { message });
      eventBus.emit('voice:recording-state', { recording: false });
    }
  }

  async finishRecording() {
    return this._finishRecording();
  }

  async _finishRecording() {
    const result = await this.recorder.stop();
    eventBus.emit('voice:recording-state', { recording: false });

    if (!result?.success) {
      if (result?.reason === 'empty') {
        eventBus.emit('voice:error', {
          message: `التسجيل فارغ. انتظر ${Math.ceil(VOICE_MIN_DURATION_MS / 1000)} ثانية على الأقل ثم اضغط إيقاف.`
        });
      } else if (result?.reason === 'too_small') {
        eventBus.emit('voice:error', {
          message: 'التسجيل بدون بيانات صوتية. تحقق من الميكروفون الافتراضي في Windows.'
        });
      } else if (result?.reason && result.reason !== 'not_recording') {
        eventBus.emit('voice:error', { message: `فشل حفظ التسجيل (${result.reason}).` });
      }
      return;
    }

    const byteLength = Math.ceil((result.audioBase64.length * 3) / 4);
    if (byteLength > VOICE_MAX_BYTES) {
      eventBus.emit('voice:error', { message: 'التسجيل طويل جداً. جرّب تسجيلاً أقصر.' });
      return;
    }

    const clip = {
      id: generateClipId(),
      mimeType: result.mimeType,
      durationMs: result.durationMs,
      createdAt: Date.now(),
      audioBase64: result.audioBase64
    };

    this._applyLocalClip(this.playerId, clip);
    if (result.lowInput) {
      Notification.warning('لم يُلتقط صوت واضح. ارفع مستوى الميكروfون أو اختر جهاز إدخال آخر في Windows.', 5000);
    } else {
      Notification.success('تم حفظ التسجيل الصوتي ✓', 2500);
    }

    try {
      this._sendClipOverNetwork(clip, (event, payload) => {
        this._sendEvent(event, payload);
      });
    } catch (err) {
      console.error('[VoiceService] send clip failed:', err);
      eventBus.emit('voice:error', { message: 'حُفظ التسجيل محلياً لكن فشل إرساله للاعبين.' });
    }
  }

  _sendClipOverNetwork(clip, sendFn) {
    const base = {
      playerId: clip.playerId || this.playerId,
      id: clip.id,
      mimeType: clip.mimeType,
      durationMs: clip.durationMs,
      createdAt: clip.createdAt,
      audioBase64: clip.audioBase64
    };

    if (base.audioBase64.length <= VOICE_CLIP_CHUNK_B64) {
      sendFn(EVENTS.VOICE_CLIP, base);
      return;
    }

    const partCount = Math.ceil(base.audioBase64.length / VOICE_CLIP_CHUNK_B64);
    for (let i = 0; i < partCount; i++) {
      sendFn(EVENTS.VOICE_CLIP_PART, {
        playerId: base.playerId,
        id: base.id,
        mimeType: base.mimeType,
        durationMs: base.durationMs,
        createdAt: base.createdAt,
        partIndex: i,
        partCount,
        chunk: base.audioBase64.slice(i * VOICE_CLIP_CHUNK_B64, (i + 1) * VOICE_CLIP_CHUNK_B64)
      });
    }
  }

  _applyLocalClip(playerId, clip) {
    const { clip: saved, removed } = this.store.addClip(playerId, clip);
    eventBus.emit('voice:clips-updated', { playerId, removedId: removed?.id || null });
    return saved;
  }

  /** Route full clip or chunked part from the network. */
  handleIncomingVoice(data, options = {}) {
    if (data?.partIndex != null && data?.chunk != null) {
      this._handleIncomingPart(data, options);
      return;
    }
    this.handleIncomingClip(data, options);
  }

  _handleIncomingPart(data, options = {}) {
    if (!data?.playerId || !data?.id || data.partIndex == null || !data.chunk || !data.partCount) return;

    if (options.fromPeer && options.fromPeer !== data.playerId) return;

    const key = `${data.playerId}:${data.id}`;
    let pending = this._pendingParts.get(key);
    if (!pending) {
      pending = {
        parts: new Array(data.partCount).fill(''),
        partCount: data.partCount,
        meta: {
          playerId: data.playerId,
          id: data.id,
          mimeType: data.mimeType,
          durationMs: data.durationMs,
          createdAt: data.createdAt
        },
        received: 0
      };
      this._pendingParts.set(key, pending);
    }

    if (pending.parts[data.partIndex]) return;
    pending.parts[data.partIndex] = data.chunk;
    pending.received += 1;

    if (pending.received < pending.partCount) return;

    this._pendingParts.delete(key);
    this.handleIncomingClip({
      ...pending.meta,
      audioBase64: pending.parts.join('')
    }, options);
  }

  handleIncomingClip(data, options = {}) {
    if (!data?.playerId || !data?.id || !data?.audioBase64) return;

    if (options.fromPeer && options.fromPeer !== data.playerId) return;

    const byteLength = Math.ceil((data.audioBase64.length * 3) / 4);
    if (byteLength > VOICE_MAX_BYTES) return;

    const { removed } = this.store.addClip(data.playerId, {
      id: data.id,
      mimeType: data.mimeType,
      durationMs: data.durationMs,
      createdAt: data.createdAt || Date.now(),
      audioBase64: data.audioBase64
    });

    eventBus.emit('voice:clips-updated', { playerId: data.playerId, removedId: removed?.id || null });

    if (this.isHost && options.relay && options.fromPeer) {
      this._sendClipOverNetwork({
        playerId: data.playerId,
        id: data.id,
        mimeType: data.mimeType,
        durationMs: data.durationMs,
        createdAt: data.createdAt || Date.now(),
        audioBase64: data.audioBase64
      }, (event, payload) => {
        this._broadcast(event, payload, options.fromPeer);
      });
    }
  }

  handleFullSync(data) {
    if (!Array.isArray(data?.clips)) return;
    this.store.applyFullSync(data.clips);
    eventBus.emit('voice:clips-updated', { playerId: null, full: true });
  }

  requestSync() {
    this._sendEvent(EVENTS.VOICE_SYNC_REQUEST, { playerId: this.playerId });
  }

  sendFullSyncTo(peerId) {
    if (!this.isHost) return;
    const clips = this.store.getAllForSync();
    for (const clip of clips) {
      this._sendClipOverNetwork(clip, (event, payload) => {
        this._sendEventTo(peerId, event, payload);
      });
    }
  }

  playClip(playerId, clipId) {
    const clip = this.store.getClip(playerId, clipId);
    if (!clip?.audioBase64) return;

    if (this._playingKey === `${playerId}:${clipId}` && this._playAbortController) {
      this.stopPlayback();
      return;
    }

    this.stopPlayback();
    this._playingKey = `${playerId}:${clipId}`;
    this._playAbortController = new AbortController();
    const { signal } = this._playAbortController;
    eventBus.emit('voice:playback-state', { playerId, clipId, playing: true });

    playClipAudio(clip, { signal })
      .then(() => {
        if (!signal.aborted && this._playingKey === `${playerId}:${clipId}`) {
          this.stopPlayback();
        }
      })
      .catch((err) => {
        if (signal.aborted) return;
        console.error('[VoiceService] playback failed:', err);
        eventBus.emit('voice:error', { message: 'تعذّر تشغيل التسجيل.' });
        this.stopPlayback();
      });
  }

  stopPlayback() {
    if (this._playAbortController) {
      this._playAbortController.abort();
      this._playAbortController = null;
    }
    if (this._playingAudio) {
      try {
        this._playingAudio.pause();
        this._playingAudio.currentTime = 0;
      } catch (_) { /* ignore */ }
      this._playingAudio = null;
    }
    const prev = this._playingKey;
    this._playingKey = null;
    if (prev) {
      const [playerId, clipId] = prev.split(':');
      eventBus.emit('voice:playback-state', { playerId, clipId, playing: false });
    }
  }

  onPlayerLeft(playerId) {
    this.store.removePlayer(playerId);
    eventBus.emit('voice:clips-updated', { playerId, removed: true });
  }

  destroy() {
    this.recorder.cancel();
    this.stopPlayback();
    this.store.destroy();
    this._pendingParts.clear();
    this._unsubscribers.forEach(u => u());
    this._unsubscribers = [];
  }
}
