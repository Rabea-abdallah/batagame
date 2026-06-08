import { VOICE_MAX_DURATION_MS, VOICE_MIN_DURATION_MS } from '../core/Constants.js';
import {
  canUseMicrophoneHere,
  hasRecordingApi,
  requestMicrophoneStreamWithFallbacks
} from './MicrophoneAccess.js';
import { normalizeAudioMimeType, measureStreamLevel } from './VoiceAudio.js';

const RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus'
];

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('READ_FAILED'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

function createMediaRecorder(stream) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('RECORDER_UNSUPPORTED');
  }

  let lastError = null;
  for (const mimeType of RECORDER_MIME_TYPES) {
    if (mimeType && !MediaRecorder.isTypeSupported(mimeType)) continue;
    try {
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
      if (recorder) return recorder;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  throw new Error('RECORDER_UNSUPPORTED');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class VoiceRecorder {
  constructor() {
    this._mediaRecorder = null;
    this._chunks = [];
    this._stream = null;
    this._selectedMimeType = '';
    this._startedAt = 0;
    this._stopTimer = null;
    this._stopResolve = null;
    this._recorderError = null;
    this.isRecording = false;
  }

  static isSupported() {
    return hasRecordingApi() && canUseMicrophoneHere();
  }

  async start() {
    if (this.isRecording) return;
    const stream = await requestMicrophoneStreamWithFallbacks();
    return this.startWithStream(stream);
  }

  async startWithStream(stream) {
    if (this.isRecording) return;

    let ownedStream = stream;
    try {
      const audioTracks = ownedStream.getAudioTracks();
      if (!audioTracks.length) {
        ownedStream.getTracks().forEach(t => t.stop());
        throw new Error('NO_AUDIO_TRACK');
      }
      audioTracks.forEach(t => { t.enabled = true; });

      this._inputLevel = 0;

      const recorder = createMediaRecorder(ownedStream);
      this._stream = ownedStream;
      this._selectedMimeType = recorder.mimeType || '';
      this._mediaRecorder = recorder;
      this._chunks = [];
      this._recorderError = null;

      this._mediaRecorder.ondataavailable = (e) => {
        if (e.data?.size > 0) this._chunks.push(e.data);
      };

      this._mediaRecorder.onerror = (e) => {
        this._recorderError = e?.error || new Error('RECORDER_ERROR');
      };

      this._mediaRecorder.onstop = async () => {
        const resolve = this._stopResolve;
        this._stopResolve = null;
        const mimeType = normalizeAudioMimeType(
          this._selectedMimeType || this._mediaRecorder?.mimeType || 'audio/webm'
        );

        if (this._recorderError) {
          this._cleanupStream();
          resolve?.({ success: false, reason: this._recorderError.message || 'recorder_error' });
          return;
        }

        try {
          const blob = new Blob(this._chunks, { type: mimeType });
          this._chunks = [];
          this._cleanupStream();
          if (!blob.size) {
            resolve?.({ success: false, reason: 'empty' });
            return;
          }
          if (blob.size < 400) {
            resolve?.({ success: false, reason: 'too_small' });
            return;
          }
          const audioBase64 = await blobToBase64(blob);
          resolve?.({
            success: true,
            audioBase64,
            mimeType: blob.type || mimeType,
            durationMs: Math.max(0, Date.now() - this._startedAt),
            inputLevel: this._inputLevel || 0,
            lowInput: (this._inputLevel || 0) < 0.008
          });
        } catch (err) {
          this._cleanupStream();
          resolve?.({ success: false, reason: err.message || 'encode_failed' });
        }
      };

      this._startedAt = Date.now();
      this._mediaRecorder.start(250);
      this.isRecording = true;

      measureStreamLevel(ownedStream, 400).then((level) => {
        this._inputLevel = Math.max(this._inputLevel || 0, level);
      }).catch(() => { /* ignore */ });

      this._stopTimer = setTimeout(() => {
        if (this.isRecording) this.stop();
      }, VOICE_MAX_DURATION_MS);
    } catch (err) {
      if (ownedStream) ownedStream.getTracks().forEach(t => t.stop());
      this._stream = null;
      this._mediaRecorder = null;
      this.isRecording = false;
      throw err;
    }
  }

  async stop() {
    if (!this.isRecording || !this._mediaRecorder) {
      return { success: false, reason: 'not_recording' };
    }

    const elapsed = Date.now() - this._startedAt;
    if (elapsed < VOICE_MIN_DURATION_MS) {
      await wait(VOICE_MIN_DURATION_MS - elapsed);
    }

    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }

    return new Promise((resolve) => {
      this._stopResolve = resolve;
      this.isRecording = false;

      try {
        const recorder = this._mediaRecorder;
        if (!recorder || recorder.state === 'inactive') {
          this._cleanupStream();
          resolve({ success: false, reason: 'inactive' });
          return;
        }

        if (typeof recorder.requestData === 'function') {
          recorder.requestData();
        }

        recorder.stop();
      } catch (err) {
        this._cleanupStream();
        resolve({ success: false, reason: err.message || 'stop_failed' });
      }
    });
  }

  cancel() {
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }
    this._stopResolve = null;
    this.isRecording = false;
    this._chunks = [];
    this._recorderError = null;
    try {
      if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
        this._mediaRecorder.stop();
      }
    } catch (_) { /* ignore */ }
    this._mediaRecorder = null;
    this._cleanupStream();
  }

  _cleanupStream() {
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
  }
}
