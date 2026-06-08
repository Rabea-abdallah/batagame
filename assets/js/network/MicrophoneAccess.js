/** Microphone access — multi-device fallback + user-gesture capture. */
import {
  getRecordingAudioConstraints,
  isLikelySilentInputDevice,
  waitForActiveAudioTracks
} from './VoiceAudio.js';

export function ensureMediaDevices() {
  if (typeof navigator === 'undefined') return false;

  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {};
  }

  if (!navigator.mediaDevices.getUserMedia) {
    const legacy = navigator.getUserMedia
      || navigator.webkitGetUserMedia
      || navigator.mozGetUserMedia;
    if (!legacy) return false;

    navigator.mediaDevices.getUserMedia = (constraints) => new Promise((resolve, reject) => {
      legacy.call(navigator, constraints, resolve, reject);
    });
  }

  if (!navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
  }

  return typeof navigator.mediaDevices.getUserMedia === 'function';
}

export function isLocalhostUrl() {
  const host = (location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function canUseMicrophoneHere() {
  if (window.isSecureContext) return true;
  return isLocalhostUrl();
}

export async function getMicPermissionState() {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const result = await navigator.permissions.query({ name: 'microphone' });
    return result?.state || 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

export function hasRecordingApi() {
  ensureMediaDevices();
  return !!(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
}

async function tryGetStream(getUserMedia, constraints) {
  const stream = await getUserMedia(constraints);
  const tracks = stream.getAudioTracks();
  if (!tracks.length) {
    stream.getTracks().forEach(t => t.stop());
    throw new Error('NO_AUDIO_TRACK');
  }
  tracks.forEach(t => { t.enabled = true; });
  return stream;
}

/** Open stream and confirm Windows is actually sending audio samples. */
async function tryGetActiveStream(getUserMedia, constraints, waitMs = 3500) {
  const stream = await tryGetStream(getUserMedia, constraints);
  try {
    await waitForActiveAudioTracks(stream, waitMs);
    return stream;
  } catch (err) {
    stream.getTracks().forEach(t => t.stop());
    throw err;
  }
}

async function listAudioInputs(getUserMedia) {
  let devices = await navigator.mediaDevices.enumerateDevices();
  let inputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);

  if (!inputs.length || inputs.every(d => !d.label)) {
    try {
      const warm = await tryGetStream(getUserMedia, { audio: true });
      warm.getTracks().forEach(t => t.stop());
    } catch (_) { /* may fail — still try enumerate */ }
    devices = await navigator.mediaDevices.enumerateDevices();
    inputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
  }

  return inputs;
}

/**
 * Try several constraints and physical input devices.
 * Call beginMicrophoneCapture() on click so the first attempt runs under user gesture.
 */
export async function requestMicrophoneStreamWithFallbacks() {
  if (!ensureMediaDevices()) {
    throw new Error('NO_MIC');
  }

  if (!canUseMicrophoneHere()) {
    const e = new Error('INSECURE_CONTEXT');
    e.name = 'SecurityError';
    throw e;
  }

  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const basicAttempts = [
    getRecordingAudioConstraints(),
    { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } },
    { audio: true }
  ];

  let lastErr = null;
  let triedMuted = false;

  for (const constraints of basicAttempts) {
    try {
      return await tryGetActiveStream(getUserMedia, constraints);
    } catch (err) {
      lastErr = err;
      if (err?.message === 'TRACK_MUTED') triedMuted = true;
    }
  }

  try {
    const inputs = await listAudioInputs(getUserMedia);
    const realInputs = inputs.filter(d => !isLikelySilentInputDevice(d));
    const ordered = [
      ...realInputs.filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications'),
      ...realInputs.filter(d => d.deviceId === 'default' || d.deviceId === 'communications'),
      ...inputs.filter(d => isLikelySilentInputDevice(d))
    ];

    for (const device of ordered) {
      const deviceAttempts = [
        getRecordingAudioConstraints(device.deviceId),
        { audio: { deviceId: { ideal: device.deviceId } } },
        { audio: { deviceId: { exact: device.deviceId } } }
      ];

      for (const constraints of deviceAttempts) {
        try {
          return await tryGetActiveStream(getUserMedia, constraints);
        } catch (err) {
          lastErr = err;
          if (err?.message === 'TRACK_MUTED') {
            triedMuted = true;
            console.warn('[MicrophoneAccess] muted device skipped:', device.label || device.deviceId);
          }
        }
      }
    }
  } catch (err) {
    lastErr = err;
  }

  if (triedMuted) {
    const err = new Error('ALL_TRACKS_MUTED');
    err.cause = lastErr;
    throw err;
  }

  throw lastErr || new Error('NO_MIC');
}

/** Start mic request synchronously inside click handler (keeps user gesture). */
export function beginMicrophoneCapture() {
  return { promise: requestMicrophoneStreamWithFallbacks() };
}

export async function describeMicrophoneError(err) {
  const perm = await getMicPermissionState();
  const host = location.host || 'localhost';
  const port = location.port || '8080';

  console.warn('[MicrophoneAccess]', {
    error: err?.name,
    message: err?.message,
    permission: perm,
    secure: window.isSecureContext,
    host: location.href
  });

  if (!canUseMicrophoneHere()) {
    return `المتصفح لا يسمح بالميكروفون على ${host}. افتح http://localhost:${port} من نفس الجهاز.`;
  }

  if (err?.message === 'INSECURE_CONTEXT' || err?.name === 'SecurityError') {
    return `المتصفح لا يسمح بالميكروفون على ${host}. استخدم http://localhost:${port}`;
  }

  if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
    if (perm === 'granted') {
      return [
        'Chrome يسمح للموقع لكن Windows يمنع الوصول الفعلي:',
        '1) Win+I → الخصوصية → الميكروفون → فعّل «السماح للتطبيقات»',
        '2) فعّل «السماح للتطبيقات المكتبية» (Chrome)',
        '3) إعدادات الصوت → الإدخال → اختر الميكروفون الافتراضي',
        '4) 🔒 localhost → إعادة تعيين الإذن → السماح من جديد'
      ].join(' ');
    }
    if (perm === 'denied') {
      return 'الميكروفون محظور. 🔒 → إعدادات الموقع → الميكروفون → السماح → Ctrl+Shift+R';
    }
    return 'اضغط «السماح» في نافذة الميكروفون عند ظهورها.';
  }

  if (err?.name === 'NotFoundError' || err?.message === 'NO_MIC' || err?.message === 'NO_AUDIO_TRACK') {
    return 'لم يُعثر على ميكروفون. وصّله أو اختره كجهاز إدخال افتراضي في Windows.';
  }

  if (err?.name === 'NotReadableError') {
    return 'الميكروفون مشغول (Discord/Zoom/…). أغلق البرامج التي تستخدمه ثم حاول مجدداً.';
  }

  if (err?.message === 'TRACK_MUTED' || err?.message === 'ALL_TRACKS_MUTED') {
    return [
      'الميكروفون متصل لكن Windows لا يرسل صوتاً (Realtek muted).',
      '① Win+I → الخصوصية → الميكروفون → فعّل «تطبيقات سطح المكتب»',
      '② إعدادات الصوت → الإدخال → Microphone Array → ارفع المستوى وتحدّث',
      '③ إذا لم يتحرك المؤشر: أغلق Discord/Zoom ثم Ctrl+Shift+R'
    ].join('\n');
  }

  if (err?.message === 'TRACK_ENDED') {
    return 'انقطع اتصال الميكروفون أثناء التحضير. أعد المحاولة.';
  }

  if (err?.name === 'OverconstrainedError') {
    return 'الميكروفون المتصل غير متوافق. غيّر جهاز الإدخال من شريط الصوت في Windows.';
  }

  if (err?.message === 'RECORDER_UNSUPPORTED') {
    return 'التسجيل غير مدعوم. حدّث Chrome أو Edge.';
  }

  return `تعذّر التسجيل${err?.name ? ` (${err.name})` : ''}. راجع Console (F12).`;
}

/** @deprecated use beginMicrophoneCapture + startWithStream */
export async function requestMicrophoneStream() {
  return requestMicrophoneStreamWithFallbacks();
}
