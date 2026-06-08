import { eventBus } from '../core/EventSystem.js';
import { EVENTS, PLAY_RULES_SUMMARY_AR, getPlayRules } from '../core/Constants.js';
import { LocalStorage } from '../storage/LocalStorage.js';
import { Notification } from './Notification.js';
import { soundManager } from '../utils/SoundManager.js';
import { copyToClipboard } from '../utils/helpers.js';

export class LobbyUI {
  constructor() {
    this._container = document.getElementById('app');
    this._roomCode = null;
    this._isHost = false;
    this._playerId = null;
    this._players = [];
    this._unsubscribers = [];
    this._render();
  }

  show(roomCode, isHost, playerId) {
    this._roomCode = roomCode;
    this._isHost = isHost;
    this._playerId = playerId;
    this._render();
    this._bindEvents();
    this._setupListeners();
    if (this._isHost) this._syncRoomRules();
    // Add local player if not already in the list
    const name = LocalStorage.getPlayerName() || 'You';
    if (!this._players.find(p => p.id === playerId)) {
      this._players.push({ id: playerId, name, isHost, isReady: false, connected: true });
      this._updatePlayerList();
    }
  }

  _render() {
    this._container.innerHTML = `
      <div class="lobby">
        <div class="lobby__header">
          <h1 class="lobby__title">Game Lobby</h1>
          <div class="lobby__room-code">
            <span class="lobby__code-label">Room Code:</span>
            <span class="lobby__code-value" id="room-code-display">${this._roomCode || '------'}</span>
            <button class="btn btn--icon" id="btn-copy-code" title="Copy room code">
              📋
            </button>
          </div>
        </div>

        <div class="lobby__content">
          <div class="lobby__players">
            <h2 class="lobby__section-title">
              Players (<span id="player-count">0</span>/10)
            </h2>
            <div class="lobby__players-list" id="players-list">
              <div class="lobby__empty">Waiting for players to join...</div>
            </div>
          </div>

          <div class="lobby__actions">
            <div class="lobby__ready-section">
              <label class="lobby__ready-toggle">
                <input type="checkbox" id="ready-checkbox">
                <span class="lobby__ready-label">Ready</span>
              </label>
            </div>

            <button class="btn btn--primary btn--large" id="btn-start-game" disabled>
              Start Game
            </button>

            <button class="btn btn--secondary" id="btn-leave-lobby">
              Leave Room
            </button>
          </div>
        </div>

          <div class="lobby__share">
            <p>Share this code with friends:</p>
            <div class="lobby__share-code" id="share-code">${this._roomCode || '------'}</div>
          </div>
          <div class="lobby__info" id="lobby-info">
            <span>Cards per player: <strong id="lobby-cards-count">${LocalStorage.getSettings().initialCards || 7}</strong></span>
            ${this._isHost ? `
              <button class="btn btn--icon btn--small" id="btn-cards-minus">−</button>
              <button class="btn btn--icon btn--small" id="btn-cards-plus">+</button>
              <span class="lobby__rules-note">${PLAY_RULES_SUMMARY_AR}</span>
            ` : ''}
          </div>
      </div>
    `;

    this._updatePlayerList();
  }

  _bindEvents() {
    document.getElementById('btn-copy-code')?.addEventListener('click', () => this._onCopyCode());
    document.getElementById('btn-start-game')?.addEventListener('click', () => this._onStartGame());
    document.getElementById('btn-leave-lobby')?.addEventListener('click', () => this._onLeave());
    document.getElementById('ready-checkbox')?.addEventListener('change', (e) => {
      soundManager.playButtonClick();
      const isReady = e.target.checked;
      // Update local player's ready status immediately
      const me = this._players.find(p => p.id === this._playerId);
      if (me) me.isReady = isReady;
      this._updatePlayerList();
      eventBus.emit('player:ready-toggle', { isReady });
    });
    document.getElementById('btn-cards-plus')?.addEventListener('click', () => this._adjustCards(1));
    document.getElementById('btn-cards-minus')?.addEventListener('click', () => this._adjustCards(-1));
  }

  _setupListeners() {
    this._unsubscribers.push(
      eventBus.on(EVENTS.PLAYER_JOINED, (data) => {
        this._addPlayer(data.id, data.name || 'Unknown');
        soundManager.playJoin();
        Notification.info(`${data.name || 'A player'} joined the room`);
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.PLAYER_LEFT, (data) => {
        this._removePlayer(data.id);
        soundManager.playLeave();
        Notification.info(`A player left the room`);
      })
    );

    this._unsubscribers.push(
      eventBus.on('player:list', (data) => {
        this._players = data.players || [];
        if (data.rules) LocalStorage.setRules(data.rules);
        this._updatePlayerList();
        this._updateStartButton();
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.PLAYER_READY, (data) => {
        this._updatePlayerReady(data.playerId, data.isReady);
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.GAME_START, () => {
        this._cleanup();
        eventBus.emit('navigate:game', { roomCode: this._roomCode });
      })
    );

    this._unsubscribers.push(
      eventBus.on('room:full', () => {
        Notification.warning('Room is full!');
      })
    );
  }

  _addPlayer(id, name) {
    if (!this._players.find(p => p.id === id)) {
      this._players.push({ id, name, isHost: false, isReady: false, connected: true });
      this._updatePlayerList();
    }
  }

  _removePlayer(id) {
    this._players = this._players.filter(p => p.id !== id);
    this._updatePlayerList();
  }

  _updatePlayerReady(playerId, isReady) {
    const player = this._players.find(p => p.id === playerId);
    if (player) {
      player.isReady = isReady;
      this._updatePlayerList();
    }
  }

  _updatePlayerList() {
    const list = document.getElementById('players-list');
    const count = document.getElementById('player-count');
    if (!list) return;

    if (count) count.textContent = this._players.length;

    if (this._players.length === 0) {
      list.innerHTML = '<div class="lobby__empty">Waiting for players to join...</div>';
      return;
    }

    list.innerHTML = this._players.map(p => `
      <div class="lobby__player ${p.id === this._playerId ? 'lobby__player--me' : ''} ${!p.connected ? 'lobby__player--disconnected' : ''}">
        <div class="lobby__player-info">
          <span class="lobby__player-avatar">${p.isHost ? '👑' : '👤'}</span>
          <span class="lobby__player-name">${p.name} ${p.id === this._playerId ? '(You)' : ''}</span>
          ${p.isHost ? '<span class="lobby__player-badge">Host</span>' : ''}
        </div>
        <div class="lobby__player-status">
          ${p.isReady
            ? '<span class="lobby__status lobby__status--ready">✓ Ready</span>'
            : '<span class="lobby__status lobby__status--not-ready">○ Not Ready</span>'
          }
        </div>
      </div>
    `).join('');

    this._updateStartButton();
  }

  _updateStartButton() {
    const btn = document.getElementById('btn-start-game');
    if (!btn) return;

    const allReadyStrict = this._players.length >= 2 && this._players.every(p => p.isReady);
    btn.disabled = !allReadyStrict;
  }

  _onCopyCode() {
    copyToClipboard(this._roomCode);
    Notification.success('Room code copied!');
  }

  _onStartGame() {
    soundManager.playButtonClick();
    if (this._isHost) {
      eventBus.emit('game:host-start');
    } else {
      eventBus.emit('player:request-start');
    }
  }

  _adjustCards(delta) {
    const settings = LocalStorage.getSettings();
    const current = settings.initialCards || 7;
    const next = Math.max(3, Math.min(15, current + delta));
    settings.initialCards = next;
    LocalStorage.setSettings(settings);
    const el = document.getElementById('lobby-cards-count');
    if (el) el.textContent = next;
  }

  _syncRoomRules() {
    const rules = getPlayRules();
    LocalStorage.setRules(rules);
    eventBus.emit(EVENTS.RULES_UPDATED, { rules });
  }

  _onLeave() {
    const btn = document.getElementById('btn-leave-lobby');
    if (btn) btn.disabled = true;
    eventBus.emit('room:leave-request');
  }

  _cleanup() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers = [];
  }
}
