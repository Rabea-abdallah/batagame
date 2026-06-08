/** Normalize mime for Blob + Audio playback on Windows/Chrome. */
export function normalizeAudioMimeType(mimeType) {
  const m = (mimeType || '').toLowerCase();
  if (!m) return 'audio/webm';
  if (m.includes('webm')) return 'audio/webm';
  if (m.includes('ogg')) return 'audio/ogg';
  if (m.includes('mp4') || m.includes('m4a')) return 'audio/mp4';
  return m.split(';')[0] || 'audio/webm';
}

export function base64ToAudioBlob(audioBase64, mimeType) {
  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: normalizeAudioMimeType(mimeType) });
}

export function makeBlobUrlFromClip(clip) {
  const blob = base64ToAudioBlob(clip.audioBase64, clip.mimeType);
  return URL.createObjectURL(blob);
}

/** Skip virtual / loopback inputs that often record silence. */
export function isLikelySilentInputDevice(device) {
  const label = (device?.label || '').toLowerCase();
  return /stereo mix|what u hear|loopback|virtual|cable output|wave out|primary sound capture|monitor/i.test(label);
}

/**
 * Wait until audio tracks deliver data (track.muted === false).
 * muted=true means the browser receives no samples — recordings will be silent.
 */
export async function waitForActiveAudioTracks(stream, timeoutMs = 2500) {
  const tracks = stream?.getAudioTracks?.() || [];
  if (!tracks.length) {
    const err = new Error('NO_AUDIO_TRACK');
    throw err;
  }

  const pending = tracks.filter(t => t.muted);
  if (!pending.length) return tracks;

  await new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pending.forEach(t => {
        t.removeEventListener('unmute', onUnmute);
        t.removeEventListener('ended', onEnded);
      });
      if (err) reject(err);
      else resolve();
    };

    const onUnmute = () => {
      if (tracks.every(t => !t.muted)) finish();
    };
    const onEnded = () => finish(new Error('TRACK_ENDED'));

    pending.forEach(t => {
      t.addEventListener('unmute', onUnmute);
      t.addEventListener('ended', onEnded);
    });

    const timer = setTimeout(() => {
      const stillMuted = tracks.filter(t => t.muted).map(t => t.label || 'microphone');
      const err = new Error('TRACK_MUTED');
      err.mutedLabels = stillMuted;
      finish(err);
    }, timeoutMs);
  });

  return tracks;
}

/** Constraints tuned for audible recordings (less aggressive DSP). */
export function getRecordingAudioConstraints(deviceId = null) {
  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: true,
    channelCount: 1
  };
  if (deviceId) {
    audio.deviceId = { ideal: deviceId };
  }
  return { audio };
}

export async function measureStreamLevel(stream, sampleMs = 400) {
  if (!stream?.getAudioTracks?.().length) return 0;
  let ctx = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    await new Promise(r => setTimeout(r, sampleMs));
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  } catch (_) {
    return 0;
  } finally {
    if (ctx) {
      try { await ctx.close(); } catch (_) { /* ignore */ }
    }
  }
}

export async function playAudioBlob(blob, { signal } = {}) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') await ctx.resume();

  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  if (signal?.aborted) {
    await ctx.close().catch(() => {});
    return;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  return new Promise((resolve, reject) => {
    const finish = () => {
      ctx.close().catch(() => {});
      resolve();
    };
    const onAbort = () => {
      try { source.stop(); } catch (_) { /* ignore */ }
      finish();
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    source.onended = finish;
    try {
      source.start(0);
    } catch (err) {
      ctx.close().catch(() => {});
      reject(err);
    }
  });
}

export async function playClipAudio(clip, { signal } = {}) {
  const blob = base64ToAudioBlob(clip.audioBase64, clip.mimeType);
  try {
    await playAudioBlob(blob, { signal });
    return;
  } catch (webAudioErr) {
    if (signal?.aborted) return;
    console.warn('[VoiceAudio] WebAudio playback failed, trying HTMLAudio:', webAudioErr);
  }

  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio();
    audio.volume = 1;
    audio.preload = 'auto';
    audio.src = url;

    if (signal) {
      if (signal.aborted) return;
      signal.addEventListener('abort', () => {
        try { audio.pause(); } catch (_) { /* ignore */ }
      }, { once: true });
    }

    await new Promise((resolve, reject) => {
      audio.onended = resolve;
      audio.onerror = () => reject(new Error('AUDIO_PLAY_FAILED'));
      audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
