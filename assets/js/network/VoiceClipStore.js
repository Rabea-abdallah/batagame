/** In-memory voice clips per player (max 3 each). No cloud storage. */
import { VOICE_MAX_CLIPS_PER_PLAYER } from '../core/Constants.js';
import { makeBlobUrlFromClip, normalizeAudioMimeType } from './VoiceAudio.js';

export { VOICE_MAX_CLIPS_PER_PLAYER };

export class VoiceClipStore {
  constructor() {
    /** @type {Map<string, object[]>} */
    this._byPlayer = new Map();
  }

  /**
   * @param {string} playerId
   * @param {{ id: string, mimeType: string, durationMs: number, createdAt: number, audioBase64: string }} clip
   * @returns {{ clip: object, removed: object|null }}
   */
  addClip(playerId, clip) {
    if (!playerId || !clip?.id || !clip.audioBase64) {
      return { clip: null, removed: null };
    }

    const list = this._byPlayer.get(playerId) || [];
    const existingIdx = list.findIndex(c => c.id === clip.id);
    if (existingIdx !== -1) {
      const prev = list[existingIdx];
      if (prev.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      const merged = this._hydrate(clip);
      list[existingIdx] = merged;
      this._byPlayer.set(playerId, list);
      return { clip: merged, removed: null };
    }

    const hydrated = this._hydrate(clip);
    list.push(hydrated);
    list.sort((a, b) => a.createdAt - b.createdAt);

    let removed = null;
    while (list.length > VOICE_MAX_CLIPS_PER_PLAYER) {
      removed = list.shift();
      if (removed?.blobUrl) URL.revokeObjectURL(removed.blobUrl);
    }

    this._byPlayer.set(playerId, list);
    return { clip: hydrated, removed };
  }

  getClips(playerId) {
    return [...(this._byPlayer.get(playerId) || [])];
  }

  getClip(playerId, clipId) {
    return this.getClips(playerId).find(c => c.id === clipId) || null;
  }

  getAllForSync() {
    const out = [];
    for (const [playerId, clips] of this._byPlayer) {
      for (const clip of clips) {
        out.push({
          playerId,
          id: clip.id,
          mimeType: normalizeAudioMimeType(clip.mimeType),
          durationMs: clip.durationMs,
          createdAt: clip.createdAt,
          audioBase64: clip.audioBase64
        });
      }
    }
    return out;
  }

  applyFullSync(items = []) {
    this.destroy();
    for (const item of items) {
      if (!item?.playerId) continue;
      this.addClip(item.playerId, item);
    }
  }

  removePlayer(playerId) {
    const list = this._byPlayer.get(playerId);
    if (!list) return;
    list.forEach(c => { if (c.blobUrl) URL.revokeObjectURL(c.blobUrl); });
    this._byPlayer.delete(playerId);
  }

  destroy() {
    for (const list of this._byPlayer.values()) {
      list.forEach(c => { if (c.blobUrl) URL.revokeObjectURL(c.blobUrl); });
    }
    this._byPlayer.clear();
  }

  _hydrate(clip) {
    const mimeType = normalizeAudioMimeType(clip.mimeType);
    const blobUrl = makeBlobUrlFromClip({ ...clip, mimeType });
    return {
      id: clip.id,
      mimeType,
      durationMs: clip.durationMs || 0,
      createdAt: clip.createdAt || Date.now(),
      audioBase64: clip.audioBase64,
      blobUrl
    };
  }
}
