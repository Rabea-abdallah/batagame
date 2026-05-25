import { eventBus } from '../core/EventSystem.js';
import { EVENTS, PEERJS_OPTIONS, HEARTBEAT_INTERVAL } from '../core/Constants.js';
import { Validator } from '../core/Validator.js';

export class PeerConnection {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.isHost = false;
    this.myId = null;
    this.myName = null;
    this.roomCode = null;
    this._pendingMessages = [];
    this._isConnected = false;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this.processedEvents = new Set();
  }

  async createHost(roomCode, playerId, playerName) {
    this.roomCode = roomCode;
    this.myId = playerId;
    this.myName = playerName;
    this.isHost = true;

    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(roomCode, PEERJS_OPTIONS);

        this.peer.on('open', (id) => {
          this._isConnected = true;
          this._setupHostListeners();
          resolve(id);
        });

        this.peer.on('error', (err) => {
          console.error('[PeerConnection] Host error:', err);
          if (err.type === 'unavailable-id') {
            reject(new Error('ROOM_EXISTS'));
          } else {
            reject(err);
          }
        });

        setTimeout(() => {
          if (!this._isConnected) reject(new Error('TIMEOUT'));
        }, 10000);
      } catch (err) {
        reject(err);
      }
    });
  }

  async joinRoom(roomCode, playerId, playerName) {
    this.roomCode = roomCode;
    this.myId = playerId;
    this.myName = playerName;
    this.isHost = false;

    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(playerId, PEERJS_OPTIONS);

        this.peer.on('open', () => {
          this._isConnected = true;
          const conn = this.peer.connect(roomCode, {
            reliable: true,
            serialization: 'json'
          });

          conn.on('open', () => {
            this.connections.set(roomCode, conn);
            this._setupConnectionListeners(conn);
            this._sendHandshake(conn);
            resolve(roomCode);
          });

          conn.on('error', (err) => {
            console.error('[PeerConnection] Connection error:', err);
            reject(err);
          });

          this._setupPeerListeners();
        });

        this.peer.on('error', (err) => {
          console.error('[PeerConnection] Join error:', err);
          reject(err);
        });

        setTimeout(() => {
          if (!this._isConnected) reject(new Error('TIMEOUT'));
        }, 10000);
      } catch (err) {
        reject(err);
      }
    });
  }

  _setupHostListeners() {
    this.peer.on('connection', (conn) => {
      this.connections.set(conn.peer, conn);
      this._setupConnectionListeners(conn);

      conn.on('open', () => {
        eventBus.emit(EVENTS.PLAYER_JOINED, { id: conn.peer });
      });
    });

    this.peer.on('disconnected', () => {
      this._handleDisconnect();
    });

    this.peer.on('close', () => {
      this._handleDisconnect();
    });
  }

  _setupPeerListeners() {
    this.peer.on('disconnected', () => {
      this._handleDisconnect();
    });

    this.peer.on('close', () => {
      this._handleDisconnect();
    });

    this.peer.on('connection', (conn) => {
      this.connections.set(conn.peer, conn);
      this._setupConnectionListeners(conn);
    });
  }

  _setupConnectionListeners(conn) {
    conn.on('data', (data) => {
      this._handleMessage(conn.peer, data);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      eventBus.emit(EVENTS.PLAYER_LEFT, { id: conn.peer });
    });

    conn.on('error', (err) => {
      console.error(`[PeerConnection] Connection error with ${conn.peer}:`, err);
    });
  }

  _sendHandshake(conn) {
    conn.send(this._createMessage('handshake', {
      playerId: this.myId,
      playerName: this.myName
    }));
  }

  _handleMessage(fromPeer, data) {
    try {
      if (!data || !data.type) return;
      if (Validator.checkDuplicateEvent(data.eventId, this.processedEvents)) return;

      switch (data.type) {
        case 'handshake':
          this._handleHandshake(fromPeer, data);
          break;
        case 'event':
          eventBus.emit(data.event, { ...data.payload, _fromPeer: fromPeer, _eventId: data.eventId });
          break;
        case 'state_sync':
          eventBus.emit(EVENTS.STATE_SYNC, data.state);
          break;
        case 'heartbeat':
          this._handleHeartbeat(fromPeer, data);
          break;
      case 'heartbeat_ack':
        this._handleHeartbeatAck(fromPeer, data);
        break;
      case 'handshake_ack':
        break;
      default:
        console.warn('[PeerConnection] Unknown message type:', data.type);
      }
    } catch (e) {
      console.error('[PeerConnection] Error handling message:', e, data);
    }
  }

  _handleHandshake(fromPeer, data) {
    eventBus.emit('handshake:received', {
      peerId: fromPeer,
      playerId: data.playerId,
      playerName: data.playerName
    });
    if (this.isHost) {
      this.sendTo(fromPeer, this._createMessage('handshake_ack', {
        playerId: this.myId,
        playerName: this.myName
      }));
    }
  }

  broadcast(event, payload = {}, excludePeer = null) {
    const message = this._createMessage('event', { event, payload });
    for (const [peerId, conn] of this.connections) {
      if (peerId !== excludePeer && conn.open) {
        try {
          conn.send(message);
        } catch (e) {
          console.warn(`[PeerConnection] Failed to send to ${peerId}:`, e);
        }
      }
    }
  }

  sendTo(peerId, data) {
    try {
      const conn = this.connections.get(peerId);
      if (conn && conn.open) {
        conn.send(data);
        return true;
      }
      const hostConn = this.connections.get(this.roomCode);
      if (hostConn && hostConn.open) {
        hostConn.send(data);
        return true;
      }
    } catch (e) {
      console.warn('[PeerConnection] sendTo error:', e);
    }
    return false;
  }

  sendEvent(event, payload = {}) {
    if (this.isHost) {
      this.broadcast(event, payload);
    } else {
      this.sendTo(this.roomCode, this._createMessage('event', { event, payload }));
    }
  }

  sendStateSync(state) {
    const message = this._createMessage('state_sync', { state });
    for (const [, conn] of this.connections) {
      if (conn.open) {
        conn.send(message);
      }
    }
  }

  sendStateSyncTo(peerId, state) {
    this.sendTo(peerId, this._createMessage('state_sync', { state }));
  }

  _createMessage(type, payload) {
    return {
      type,
      eventId: Validator.generateEventId(),
      timestamp: Date.now(),
      senderId: this.myId,
      ...payload
    };
  }

  _handleHeartbeat(fromPeer, data) {
    this.sendTo(fromPeer, {
      type: 'heartbeat_ack',
      timestamp: data.timestamp,
      serverTime: Date.now()
    });
  }

  _handleHeartbeatAck(fromPeer, data) {
    const latency = Date.now() - data.timestamp;
    eventBus.emit(EVENTS.LATENCY_UPDATE, { peerId: fromPeer, latency });
  }

  startHeartbeat() {
    this._heartbeatInterval = setInterval(() => {
      if (!this._isConnected) return;
      if (this.isHost) {
        for (const [, conn] of this.connections) {
          if (conn.open) {
            conn.send(this._createMessage('heartbeat', { timestamp: Date.now() }));
          }
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  _handleDisconnect() {
    this._isConnected = false;
    if (this._reconnectAttempts < this._maxReconnectAttempts) {
      this._reconnectAttempts++;
      this.peer.reconnect();
    } else {
      this.destroy();
    }
  }

  getConnectedPeers() {
    return [...this.connections.keys()];
  }

  isConnectedTo(peerId) {
    const conn = this.connections.get(peerId);
    return conn && conn.open;
  }

  closePeer(peerId) {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    try {
      conn.close();
    } catch (_) {
      /* ignore */
    }
    this.connections.delete(peerId);
  }

  destroy() {
    this.stopHeartbeat();
    for (const [, conn] of this.connections) {
      conn.close();
    }
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this._isConnected = false;
    this.isHost = false;
  }
}
