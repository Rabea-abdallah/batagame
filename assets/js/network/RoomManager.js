import { eventBus } from '../core/EventSystem.js';
import { Validator } from '../core/Validator.js';
import { EVENTS, MAX_PLAYERS, MIN_PLAYERS, getPlayRules } from '../core/Constants.js';
import { PeerConnection } from './PeerConnection.js';
import { SyncEngine } from './SyncEngine.js';
import { SessionManager } from '../storage/SessionManager.js';

export class RoomManager {
  constructor() {
    this.peerConnection = new PeerConnection();
    this.syncEngine = new SyncEngine(this.peerConnection);
    this.roomCode = null;
    this.players = new Map();
    this.playerId = null;
    this.playerName = null;
    this.gameState = null;
    this.rules = getPlayRules();
    this._unsubscribers = [];

    this._setupListeners();
  }

  _setupListeners() {
    this._unsubscribers = [
      eventBus.on(EVENTS.PLAYER_JOINED, (data) => {
        if (this.peerConnection.isHost) {
          if (this.players.size >= MAX_PLAYERS) {
            this.peerConnection.sendTo(data.id, {
              type: 'event',
              event: 'room:full',
              payload: {}
            });
            return;
          }
        }
      }),

      eventBus.on(EVENTS.PLAYER_LEFT, (data) => {
        const player = this.players.get(data.id);
        if (player) {
          this.players.delete(data.id);
          this._broadcastPlayerList();
        }
      }),

      eventBus.on(EVENTS.PLAYER_READY, (data) => {
        if (this.peerConnection.isHost) {
          const player = this.players.get(data.playerId);
          if (player) {
            player.isReady = data.isReady;
            this._broadcastPlayerList();
          }
        }
      }),

      eventBus.on('player:list', (data) => {
        if (!data?.players) return;
        if (data.rules) this.rules = getPlayRules(data.rules);
        this.players.clear();
        for (const player of data.players) {
          this.players.set(player.id, {
            id: player.id,
            name: player.name,
            isHost: player.isHost,
            isReady: player.isReady,
            connected: player.connected
          });
        }
      }),

      eventBus.on('game:start-request', (data) => {
        if (this.peerConnection.isHost) {
          eventBus.emit('game:host-start');
        }
      }),

      eventBus.on('handshake:received', (data) => {
        const existing = this.players.get(data.peerId);
        if (!existing) {
          this.players.set(data.peerId, {
            id: data.peerId,
            name: data.playerName,
            isHost: false,
            isReady: false,
            connected: true
          });
          this._broadcastPlayerList();
        }
      }),

      eventBus.on('request:player-list', (data) => {
        if (this.peerConnection.isHost) {
          this._broadcastPlayerList();
        }
      }),

      eventBus.on('request:state-sync', (data) => {
        if (this.peerConnection.isHost && this.gameState) {
          this.peerConnection.sendStateSyncTo(data._fromPeer, this.gameState.serialize());
        }
      }),

      eventBus.on(EVENTS.RULES_UPDATED, (data) => {
        if (this.peerConnection.isHost) {
          this.setRules(data.rules || data);
        }
      })
    ];
  }

  async createRoom(playerName) {
    this.playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.playerName = playerName;
    this.roomCode = this._generateRoomCode();

    await this.peerConnection.createHost(this.roomCode, this.playerId, playerName);

    this.players.set(this.playerId, {
      id: this.playerId,
      name: playerName,
      isHost: true,
      isReady: false,
      connected: true
    });

    SessionManager.saveSession({
      playerId: this.playerId,
      playerName: playerName,
      roomCode: this.roomCode,
      isHost: true
    });

    eventBus.emit(EVENTS.ROOM_CREATED, {
      roomCode: this.roomCode,
      playerId: this.playerId
    });

    return { roomCode: this.roomCode, playerId: this.playerId };
  }

  async joinRoom(roomCode, playerName) {
    if (!Validator.isValidRoomCode(roomCode)) {
      throw new Error('INVALID_ROOM_CODE');
    }

    this.playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.playerName = playerName;
    this.roomCode = roomCode.toUpperCase();

    await this.peerConnection.joinRoom(this.roomCode, this.playerId, playerName);

    this.players.set(this.playerId, {
      id: this.playerId,
      name: playerName,
      isHost: false,
      isReady: false,
      connected: true
    });

    SessionManager.saveSession({
      playerId: this.playerId,
      playerName: playerName,
      roomCode: this.roomCode,
      isHost: false
    });

    eventBus.emit(EVENTS.ROOM_JOINED, {
      roomCode: this.roomCode,
      playerId: this.playerId
    });

    return { roomCode: this.roomCode, playerId: this.playerId };
  }

  setReady(isReady) {
    const player = this.players.get(this.playerId);
    if (player) {
      player.isReady = isReady;
      this.peerConnection.sendEvent(EVENTS.PLAYER_READY, {
        playerId: this.playerId,
        isReady
      });
      // Only host broadcasts the full player list (non-host has incomplete data)
      if (this.peerConnection?.isHost) {
        this._broadcastPlayerList();
      }
    }
  }

  _broadcastPlayerList() {
    const playerList = [...this.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isReady: p.isReady,
      connected: p.connected
    }));

    this.peerConnection.broadcast('player:list', { players: playerList, rules: this.rules });
    // Also emit locally so the host's own LobbyUI updates
    if (this.peerConnection?.isHost) {
      eventBus.emit('player:list', { players: playerList, rules: this.rules });
    }
  }

  setRules(rules = {}) {
    this.rules = getPlayRules(rules);
    this._broadcastPlayerList();
  }

  getRules() {
    return getPlayRules(this.rules);
  }

  getPlayerList() {
    return [...this.players.values()];
  }

  getPlayerCount() {
    return this.players.size;
  }

  requestStart() {
    this.peerConnection.sendEvent('game:start-request', {});
  }

  requestPlayerList() {
    this.peerConnection.sendEvent('request:player-list', {});
  }

  requestStateSync() {
    this.peerConnection.sendEvent('request:state-sync', {});
  }

  canStartGame() {
    return this.getPlayerCount() >= MIN_PLAYERS && [...this.players.values()].every(p => p.isReady);
  }

  _generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async handleHostMigration() {
    const connectedPlayers = [...this.players.values()].filter(p => p.connected && p.id !== this.playerId);
    if (connectedPlayers.length === 0) return;

    const sorted = connectedPlayers.sort((a, b) => a.id.localeCompare(b.id));
    const newHost = sorted[0];

    if (newHost.id === this.playerId) {
      await this._becomeHost();
    }
  }

  async _becomeHost() {
    this.peerConnection.destroy();

    const newRoomCode = this.roomCode;
    await this.peerConnection.createHost(newRoomCode, this.playerId, this.playerName);

    const player = this.players.get(this.playerId);
    if (player) player.isHost = true;

    eventBus.emit(EVENTS.HOST_MIGRATED, {
      newHostId: this.playerId,
      roomCode: newRoomCode
    });
  }

  leaveRoom() {
    this._notifyLeavingRoom();
    this.syncEngine.destroy();
    this.peerConnection.destroy();
    this.players.clear();
    this.roomCode = null;
    this.gameState = null;
    this.rules = getPlayRules();
    SessionManager.clearSession();
    this._removeListeners();
  }

  _notifyLeavingRoom() {
    if (!this.peerConnection || !this.playerId) return;

    try {
      if (this.peerConnection.isHost) {
        this.peerConnection.broadcast(EVENTS.ROOM_LEFT, {
          playerId: this.playerId,
          reason: 'host_left'
        });
      } else {
        this.peerConnection.sendEvent(EVENTS.PLAYER_LEFT, {
          id: this.playerId,
          reason: 'player_left'
        });
      }
    } catch (err) {
      console.warn('[RoomManager] Failed to notify room leave:', err);
    }
  }

  _removeListeners() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers = [];
  }

  destroy() {
    this.leaveRoom();
  }
}
