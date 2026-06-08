import { eventBus } from '../core/EventSystem.js';
import { EVENTS, HEARTBEAT_INTERVAL, RECONNECT_TIMEOUT } from '../core/Constants.js';

export class Heartbeat {
  constructor(peerConnection) {
    this._peerConnection = peerConnection;
    this._interval = null;
    this._latencies = new Map();
    this._lastHeartbeat = new Map();
    this._connectedPeers = new Set();
    this._isRunning = false;
    this._onDisconnect = null;
  }

  start(onDisconnect = null) {
    if (this._isRunning) return;
    this._isRunning = true;
    this._onDisconnect = onDisconnect;

    this._interval = setInterval(() => {
      this._tick();
    }, HEARTBEAT_INTERVAL);
  }

  stop() {
    this._isRunning = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._latencies.clear();
    this._lastHeartbeat.clear();
    this._connectedPeers.clear();
  }

  _tick() {
    const now = Date.now();
    const connectedPeers = this._peerConnection.getConnectedPeers();

    for (const peerId of connectedPeers) {
      this._lastHeartbeat.set(peerId, now);
      this._connectedPeers.add(peerId);
    }

    for (const [peerId, lastTime] of this._lastHeartbeat) {
      if (now - lastTime > RECONNECT_TIMEOUT) {
        this._connectedPeers.delete(peerId);
        this._lastHeartbeat.delete(peerId);
        if (this._onDisconnect) {
          this._onDisconnect(peerId);
        }
        eventBus.emit(EVENTS.PLAYER_LEFT, { id: peerId, reason: 'timeout' });
      }
    }
  }

  getLatency(peerId) {
    return this._latencies.get(peerId) || 0;
  }

  getAverageLatency() {
    if (this._latencies.size === 0) return 0;
    let total = 0;
    for (const latency of this._latencies.values()) {
      total += latency;
    }
    return total / this._latencies.size;
  }

  isPeerConnected(peerId) {
    return this._connectedPeers.has(peerId);
  }

  getConnectedCount() {
    return this._connectedPeers.size;
  }

  updateLatency(peerId, latency) {
    this._latencies.set(peerId, latency);
    this._lastHeartbeat.set(peerId, Date.now());
    this._connectedPeers.add(peerId);
  }
}
