import { eventBus } from '../core/EventSystem.js';
import { EVENTS } from '../core/Constants.js';

export class SyncEngine {
  constructor(peerConnection) {
    this._peerConnection = peerConnection;
    this._lastSyncTime = 0;
    this._syncInterval = 5000;
    this._pendingEvents = [];
    this._lastProcessedEventId = 0;
    this._eventQueue = [];
    this._sequenceNumber = 0;
    this._unsubscribers = [];
    this._gameState = null;

    this._setupListeners();
  }

  _setupListeners() {
    this._unsubscribers = [
      eventBus.on(EVENTS.CARD_PLAYED, (data) => this._onEvent(data)),
      eventBus.on(EVENTS.CARD_DRAWN, (data) => this._onEvent(data)),
      eventBus.on(EVENTS.TURN_CHANGE, (data) => this._onEvent(data)),
      eventBus.on(EVENTS.UNO_CALLED, (data) => this._onEvent(data)),
      eventBus.on(EVENTS.UNO_FORGOT, (data) => this._onEvent(data)),
      eventBus.on(EVENTS.COLOR_SELECTED, (data) => this._onEvent(data))
    ];
  }

  _onEvent(data) {
    if (this._peerConnection.isHost) {
      this._broadcastEvent(data);
    }
  }

  sendEvent(eventName, payload) {
    const seqNum = ++this._sequenceNumber;
    const eventData = {
      event: eventName,
      payload: {
        ...payload,
        _seq: seqNum,
        _timestamp: Date.now(),
        _senderId: this._peerConnection.myId
      }
    };

    this._peerConnection.sendEvent(eventName, eventData.payload);
    this._pendingEvents.push(eventData);
    this._cleanupPending();
  }

  requestFullSync(targetPeerId = null) {
    const gameState = this._gameState || this._peerConnection.gameState;
    if (this._peerConnection.isHost && gameState) {
      const state = gameState.serialize();
      if (targetPeerId) {
        this._peerConnection.sendStateSyncTo(targetPeerId, state);
      } else {
        this._peerConnection.sendStateSync(state);
      }
    }
  }

  startPeriodicSync(gameState) {
    this._gameState = gameState;
    if (this._syncTimer) return;
    this._syncTimer = setInterval(() => {
      if (this._gameState && this._gameState.phase === 'playing' && this._peerConnection.isHost) {
        this.requestFullSync();
      }
    }, this._syncInterval);
  }

  stopPeriodicSync() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
  }

  applyDeltaUpdate(state, delta) {
    if (!delta || !delta.type) return state;

    switch (delta.type) {
      case 'play_card':
        state.currentCard = delta.card;
        state.currentPlayerIndex = delta.nextPlayerIndex;
        state.direction = delta.direction;
        state.selectedColor = delta.selectedColor;
        break;
      case 'draw_card':
        break;
      case 'turn_change':
        state.currentPlayerIndex = delta.playerIndex;
        state.direction = delta.direction;
        break;
      case 'uno_call':
        state.unoCalled[delta.playerId] = true;
        break;
    }

    return state;
  }

  _broadcastEvent(data) {
    this._peerConnection.broadcast('game:event', {
      ...data,
      _seq: ++this._sequenceNumber
    });
  }

  _cleanupPending() {
    const now = Date.now();
    this._pendingEvents = this._pendingEvents.filter(e =>
      now - e.payload._timestamp < 10000
    );
  }

  destroy() {
    this.stopPeriodicSync();
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers = [];
    this._gameState = null;
    this._pendingEvents = [];
    this._eventQueue = [];
  }
}
