import { eventBus } from './core/EventSystem.js';
import { EVENTS, GAME_PHASES, CARD_TYPES, TURN_TIMEOUT, getPlayRules } from './core/Constants.js';
import { HomeUI } from './ui/HomeUI.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { GameUI } from './ui/GameUI.js';
import { RoomManager } from './network/RoomManager.js';
import { Heartbeat } from './network/Heartbeat.js';
import { GameState } from './game/GameState.js';
import { GameRules } from './game/GameRules.js';
import { BotAI } from './game/BotAI.js';
import { SessionManager } from './storage/SessionManager.js';
import { LocalStorage } from './storage/LocalStorage.js';
import { soundManager } from './utils/SoundManager.js';
import { Notification } from './ui/Notification.js';

class App {
  constructor() {
    this.homeUI = null;
    this.lobbyUI = null;
    this.gameUI = null;
    this.roomManager = null;
    this.heartbeat = null;
    this.gameState = null;
    this.isAIMode = false;
    this.aiPlayers = [];
    this.aiBotCount = 3;
    this.devPenaltyTestMode = false;
    this._aiTimer = null;
    this._turnTimeoutTimer = null;
    this._handledTurnTimeoutKeys = new Set();
    this._isRunning = false;

    this._init();
  }

  async _init() {
    soundManager.init();
    await SessionManager.init();
    this._setupNavigation();
    this._setupGameEvents();
    this._setupNetworkEvents();
    this.homeUI = new HomeUI();
    this._isRunning = true;
  }

  _setupNavigation() {
    eventBus.on('navigate:create-room', async (data) => {
      try {
        this._cleanup();
        this.roomManager = new RoomManager();
        const result = await this.roomManager.createRoom(data.playerName);
        this.roomManager.setRules(getPlayRules());
        LocalStorage.setRules(getPlayRules());
        this.heartbeat = new Heartbeat(this.roomManager.peerConnection);
        if (!this.lobbyUI) this.lobbyUI = new LobbyUI();
        this.lobbyUI.show(result.roomCode, true, result.playerId);
        this.heartbeat.start((peerId) => this._onPlayerDisconnect(peerId));
      } catch (err) {
        console.error('[App] Create room error:', err);
        Notification.error(err.message === 'ROOM_EXISTS'
          ? 'Room code already in use. Try again.'
          : 'Failed to create room. Check your connection.');
      }
    });

    eventBus.on('navigate:join-room', async (data) => {
      try {
        this._cleanup();
        this.roomManager = new RoomManager();
        const result = await this.roomManager.joinRoom(data.roomCode, data.playerName);
        this.heartbeat = new Heartbeat(this.roomManager.peerConnection);
        if (!this.lobbyUI) this.lobbyUI = new LobbyUI();
        this.lobbyUI.show(result.roomCode, false, result.playerId);
        this.roomManager.requestPlayerList();
      } catch (err) {
        console.error('[App] Join room error:', err);
        Notification.error('Failed to join room. Check the code and try again.');
      }
    });

    eventBus.on('navigate:ai-game', async (data) => {
      this._cleanup();
      this.isAIMode = true;
      this.devPenaltyTestMode = !!data.devPenaltyTest;
      if (this.gameState) this.gameState.destroy();
      this.gameState = new GameState();
      this.gameState.init('player_ai_main', data.playerName);
      this.gameState.setRules(getPlayRules());
      this.aiBotCount = Math.max(1, Math.min(9, parseInt(data.botCount, 10) || 3));

      for (let i = 1; i <= this.aiBotCount; i++) {
        const name = `Bot ${i}`;
        const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        this.gameState.addPlayer(botId, name);
        this.aiPlayers.push({ id: botId, name, difficulty: 'medium' });
      }

      this.gameState.players.forEach(p => p.isReady = true);
      this._startGame();
      this._showGame();
      if (this.devPenaltyTestMode) {
        Notification.info(
          'وضع اختبار DEV: 10 أوراق (+2، تحويل، توقيف) لكل لاعب وبوت. لا يظهر إلا على localhost.',
          8000
        );
      }
    });

    eventBus.on('navigate:game', () => this._showGame());

    eventBus.on('navigate:home', () => {
      this._cleanup();
      this.homeUI = new HomeUI();
    });

    eventBus.on('room:leave-request', () => {
      this._cleanup();
      this.homeUI = new HomeUI();
    });

    eventBus.on('navigate:reconnect', async (data) => {
      const session = SessionManager.getSession();
      if (session && session.roomCode) {
        eventBus.emit('navigate:join-room', { roomCode: session.roomCode, playerName: data.playerName });
      } else {
        Notification.error('No saved session found.');
      }
    });
  }

  _setupGameEvents() {
    eventBus.on('player:ready-toggle', (data) => {
      if (this.roomManager) this.roomManager.setReady(data.isReady);
    });

    eventBus.on('player:request-start', () => {
      if (this.roomManager) this.roomManager.requestStart();
    });

    eventBus.on('game:host-start', () => {
      if (this.roomManager && this.roomManager.peerConnection.isHost) this._startGame();
    });

    eventBus.on('card:play', (data) => {
      if (this.isAIMode) {
        this._handleAIPlay(data);
      } else if (this.roomManager) {
        this.roomManager.peerConnection.sendEvent(EVENTS.CARD_PLAYED, {
          playerId: this.roomManager.playerId,
          cardId: data.cardId,
          selectedColor: data.selectedColor
        });
        if (this.roomManager.peerConnection.isHost) this._hostPlayCard(data);
      }
    });

    eventBus.on('card:draw', (data) => {
      if (this.isAIMode) {
        this._handleAIDraw(data);
      } else if (this.roomManager) {
        this.roomManager.peerConnection.sendEvent(EVENTS.CARD_DRAWN, {
          playerId: this.roomManager.playerId
        });
        if (this.roomManager.peerConnection.isHost) this._hostDrawCard(data);
      }
    });

    eventBus.on('turn:timeout', (data) => {
      if (this.isAIMode) return;
      if (this.roomManager) {
        this.roomManager.peerConnection.sendEvent(EVENTS.TURN_TIMEOUT, {
          playerId: this.roomManager.playerId,
          turnStartTime: data?.turnStartTime
        });
        if (this.roomManager.peerConnection.isHost) {
          this._hostTurnTimeout({
            playerId: this.roomManager.playerId,
            turnStartTime: data?.turnStartTime
          });
        }
      }
    });

    eventBus.on('uno:call', (data) => {
      if (this.isAIMode) {
        this.gameState.callUno(data.playerId);
        this._updateGameUI();
      } else if (this.roomManager) {
        this.roomManager.peerConnection.sendEvent(EVENTS.UNO_CALLED, {
          playerId: data.playerId
        });
        if (this.roomManager.peerConnection.isHost && this.gameState.callUno(data.playerId).success) {
          this._broadcastState();
        }
      }
    });

    eventBus.on(EVENTS.GAME_OVER, (data) => {
      this._showWinScreen(data);
    });

    eventBus.on('game:play-again', () => {
      if (this.isAIMode) {
        this._restartAIGame();
      } else if (this.roomManager?.peerConnection?.isHost) {
        this._restartMultiplayerGame();
      } else if (this.roomManager) {
        this.roomManager.peerConnection.sendEvent(EVENTS.GAME_RESTART_REQUEST, {
          playerId: this.roomManager.playerId
        });
        Notification.info('Waiting for host to restart the game...');
      }
    });

    eventBus.on('deal:complete', () => this._onDealComplete());
  }

  _setupNetworkEvents() {
    eventBus.on(EVENTS.CARD_PLAYED, (data) => {
      if (this.roomManager?.peerConnection?.isHost && data._fromPeer) {
        this._hostPlayCard(data);
      }
    });

    eventBus.on(EVENTS.CARD_DRAWN, (data) => {
      if (this.roomManager?.peerConnection?.isHost && data._fromPeer) {
        this._hostDrawCard(data);
      }
    });

    eventBus.on(EVENTS.PLAYER_LEFT, (data) => {
      if (this.roomManager?.playerId === data.id) {
        Notification.warning('انتهى وقتك وتم إخراجك من الغرفة.');
        this._cleanup();
        eventBus.emit('navigate:home');
        return;
      }
      if (this.roomManager?.players) {
        this.roomManager.players.delete(data.id);
      }
      if (this.roomManager?.peerConnection?.isHost && data._fromPeer) {
        this._onPlayerDisconnect(data.id);
      } else if (this.gameState && !this.roomManager?.peerConnection?.isHost) {
        this._updateGameUI();
      }
    });

    eventBus.on(EVENTS.ROOM_LEFT, (data) => {
      if (this.roomManager && data._fromPeer && !this.roomManager.peerConnection.isHost) {
        Notification.warning('Host left the room.');
        eventBus.emit('navigate:home');
      }
    });

    eventBus.on(EVENTS.TURN_TIMEOUT, (data) => {
      if (this.roomManager?.peerConnection?.isHost && data._fromPeer) {
        this._hostTurnTimeout(data);
      }
    });

    eventBus.on(EVENTS.GAME_RESTART_REQUEST, (data) => {
      if (this.roomManager?.peerConnection?.isHost && data._fromPeer) {
        this._restartMultiplayerGame();
      }
    });

    eventBus.on(EVENTS.UNO_CALLED, (data) => {
      if (this.roomManager?.peerConnection?.isHost && data._fromPeer) {
        if (this.gameState.callUno(data.playerId).success) {
          this.roomManager.peerConnection.broadcast(EVENTS.UNO_CALLED, {
            playerId: data.playerId,
            playerName: this._getPlayerName(data.playerId)
          });
          this._broadcastState();
        }
      }
    });

    eventBus.on(EVENTS.STATE_SYNC, (data) => {
      if (!this.gameState && !this.isAIMode) {
        this.gameState = GameState.deserialize(data);
      } else if (this.gameState) {
        this.gameState._applySync(data);
      }

      if (!this.gameState) return;

      if (this.roomManager) {
        this.roomManager.gameState = this.gameState;
      }

      if (!this.gameUI) {
        this._showGame();
      } else {
        const playerId = this.roomManager?.playerId || 'unknown';
        this.gameUI.updateGameState(this.gameState.getPublicState(playerId));
      }
    });

    eventBus.on(EVENTS.GAME_OVER, (data) => {
      if (this.roomManager && data._fromPeer) {
        this._showWinScreen(data);
      }
    });
  }

  _startGame() {
    const settings = LocalStorage.getSettings();
    const initialCards = settings.initialCards || 7;

    const previousScoring = this.gameState?.scoring ? { ...this.gameState.scoring } : {};

    const playRules = getPlayRules();

    if (!this.isAIMode && this.roomManager) {
      if (this.gameState) this.gameState.destroy();
      this.gameState = new GameState();
      this.gameState.setRules(playRules);
      this.gameState.scoring = previousScoring;
      this.gameState.gameId = `game_${Date.now()}`;
      const players = this.roomManager.getPlayerList();
      for (const p of players) {
        this.gameState.players.push({
          id: p.id, name: p.name, cards: [],
          isHost: p.isHost, isReady: true, connected: true
        });
        this.gameState.playerHands[p.id] = [];
      }
    }

    if (this.isAIMode) {
      this.gameState.setRules(playRules);
    }

    const startOptions = this.isAIMode && this.devPenaltyTestMode
      ? { devPenaltyTest: true }
      : {};
    const started = this.gameState.start(initialCards, this.gameState.getRules(), startOptions);
    if (!started) {
      Notification.warning('Need at least 2 ready players to start.');
      return;
    }

    if (!this.isAIMode && this.roomManager) {
      this.roomManager.gameState = this.gameState;
      this._broadcastState();
      this.roomManager.peerConnection.broadcast(EVENTS.GAME_START, {});
    }

    eventBus.emit(EVENTS.GAME_START, {});
  }

  _showGame() {
    const playerId = this.isAIMode ? 'player_ai_main' : (this.roomManager?.playerId || 'unknown');
    const isHost = this.isAIMode ? true : (this.roomManager?.peerConnection?.isHost || false);

    if (!this.gameState) {
      if (!this._retryCount) this._retryCount = 0;
      this._retryCount++;
      if (this._retryCount % 6 === 0) {
        Notification.info('Requesting game state from host...');
        this.roomManager?.requestStateSync();
      }
      if (this._retryCount > 60) {
        Notification.error('Failed to load game. Returning to menu.');
        setTimeout(() => eventBus.emit('navigate:home'), 2000);
        return;
      }
      setTimeout(() => this._showGame(), 500);
      return;
    }
    this._retryCount = 0;

    if (this.lobbyUI) {
      this.lobbyUI._cleanup();
      this.lobbyUI = null;
    }

    if (!this.gameUI) this.gameUI = new GameUI();
    this.gameUI.show(playerId, isHost, this.gameState.getPublicState(playerId), this.isAIMode);

    if (!this.isAIMode && this.roomManager?.peerConnection?.isHost) {
      this.roomManager.syncEngine.startPeriodicSync(this.gameState);
      this._startTurnTimeoutWatchdog();
    }
  }

  _onDealComplete() {
    if (!this.gameState) return;

    if (this.gameState.phase === GAME_PHASES.STARTING) {
      const canBegin = this.isAIMode || this.roomManager?.peerConnection?.isHost;
      if (canBegin) {
        this.gameState.beginPlaying();
        if (!this.isAIMode) this._broadcastState();
      }
    }

    this._updateGameUI();

    if (this.isAIMode && this.gameState.phase === GAME_PHASES.PLAYING) {
      this._startAILoop();
    }
  }

  _hostPlayCard(data) {
    const result = this.gameState.playCard(data.playerId, data.cardId, data.selectedColor);

    if (result.success) {
      const eventPayload = {
        playerId: data.playerId,
        cardId: data.cardId,
        selectedColor: data.selectedColor,
        nextPlayer: result.nextPlayer,
        action: result.action
      };

      if (result.action === 'penalty' || result.action === 'stack') {
        eventPayload.drawCount = result.drawCount;
        soundManager.playDrawTwo();
      } else if (result.card?.type === CARD_TYPES.SKIP) {
        soundManager.playSkip();
      } else if (result.card?.type === CARD_TYPES.REVERSE) {
        soundManager.playReverse();
      } else if (result.card?.type === CARD_TYPES.WILD || result.card?.type === CARD_TYPES.WILD_DRAW_FOUR) {
        soundManager.playWild();
      }

      this.roomManager.peerConnection.broadcast(EVENTS.CARD_PLAYED, eventPayload);

      if (result.action === 'game_over') {
        const winData = this._buildWinData(data.playerId);
        this.roomManager.peerConnection.broadcast(EVENTS.GAME_OVER, winData);
      }

      this._broadcastState();
    } else {
      const targetPeer = data._fromPeer || data.playerId;
      if (this.roomManager.peerConnection.isConnectedTo(targetPeer)) {
        this.roomManager.peerConnection.sendTo(targetPeer, {
          type: 'event', event: EVENTS.INVALID_MOVE,
          payload: { reason: result.reason }
        });
      }
    }
  }

  _hostDrawCard(data) {
    const result = this.gameState.drawCard(data.playerId);
    if (result.success) {
      this.roomManager.peerConnection.broadcast(EVENTS.CARD_DRAWN, {
        playerId: data.playerId,
        action: result.action
      });
      this._broadcastState();
    }
  }

  _hostTurnTimeout(data) {
    if (!this.gameState || !this.roomManager?.peerConnection?.isHost) return;

    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== data.playerId) return;
    if (data.turnStartTime && data.turnStartTime !== this.gameState.turnStartTime) return;

    const timeoutKey = `${this.gameState.gameId}:${currentPlayer.id}:${this.gameState.turnStartTime}`;
    if (this._handledTurnTimeoutKeys.has(timeoutKey)) return;
    this._handledTurnTimeoutKeys.add(timeoutKey);
    if (this._handledTurnTimeoutKeys.size > 40) {
      const oldest = this._handledTurnTimeoutKeys.values().next().value;
      this._handledTurnTimeoutKeys.delete(oldest);
    }

    const result = this.gameState.ejectPlayerForTimeout(data.playerId);
    if (!result.success) return;

    this.roomManager.players.delete(data.playerId);
    this.roomManager.peerConnection.closePeer(data.playerId);

    this.roomManager.peerConnection.broadcast(EVENTS.PLAYER_LEFT, {
      id: data.playerId,
      reason: 'turn_timeout'
    });

    this.roomManager.peerConnection.broadcast(EVENTS.TURN_TIMEOUT, {
      playerId: data.playerId,
      action: result.action,
      nextPlayer: result.nextPlayer,
      ejected: true
    });

    if (result.gameOver) {
      eventBus.emit(EVENTS.GAME_OVER, this._buildWinData(result.winnerId));
    }

    Notification.info(`${this._getPlayerName(data.playerId)} انتهى وقته وتم إخراجه من الغرفة.`);
    this._broadcastState();
  }

  _startTurnTimeoutWatchdog() {
    if (this._turnTimeoutTimer) return;

    this._turnTimeoutTimer = setInterval(() => {
      if (!this.roomManager?.peerConnection?.isHost || !this.gameState) return;
      if (this.gameState.phase !== GAME_PHASES.PLAYING || !this.gameState.turnStartTime) return;

      const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
      if (!currentPlayer) return;

      const elapsed = Date.now() - this.gameState.turnStartTime;
      if (elapsed < TURN_TIMEOUT) return;

      this._hostTurnTimeout({
        playerId: currentPlayer.id,
        turnStartTime: this.gameState.turnStartTime
      });
    }, 1000);
  }

  _stopTurnTimeoutWatchdog() {
    if (this._turnTimeoutTimer) {
      clearInterval(this._turnTimeoutTimer);
      this._turnTimeoutTimer = null;
    }
    this._handledTurnTimeoutKeys.clear();
  }

  _handleAIPlay(data) {
    const result = this.gameState.playCard(data.playerId, data.cardId, data.selectedColor);
    if (result.success) {
      this._updateGameUI();
      if (result.action === 'game_over') {
        eventBus.emit(EVENTS.GAME_OVER, this._buildWinData(data.playerId));
      } else {
        this._startAILoop();
      }
    }
  }

  _handleAIDraw(data) {
    this.gameState.drawCard(data.playerId);
    this._updateGameUI();
    this._startAILoop();
  }

  _startAILoop() {
    this._stopAILoop();

    const AI_TURN_DELAY = 1500;

    const processAI = () => {
      if (!this.gameState || this.gameState.phase !== GAME_PHASES.PLAYING) return;

      const i = this.gameState.currentPlayerIndex;
      const currentPlayer = this.gameState.players[i];
      if (!currentPlayer || currentPlayer.id === 'player_ai_main') return;

      const ai = this.aiPlayers.find(a => a.id === currentPlayer.id);
      if (!ai) return;

      const bot = new BotAI(ai.difficulty);
      const thinkingTime = bot.getThinkingTime();

      this._aiTimer = setTimeout(async () => {
        if (this.gameState.phase !== GAME_PHASES.PLAYING) return;

        if (bot.shouldCallUno(currentPlayer.cards)) {
          this.gameState.callUno(currentPlayer.id);
        }

        if (this.gameState.mustDraw) {
          const stackCard = bot.choosePenaltyPlay(
            currentPlayer.cards,
            this.gameState.currentCard,
            this.gameState.selectedColor,
            this.gameState.getRules(),
            this.gameState.penaltyStackCardType
          );
          if (stackCard) {
            if (this.gameUI) {
              await this.gameUI.animateAIPlay(currentPlayer.id, stackCard.serialize?.() ?? stackCard);
            }
            let color = stackCard.isWild ? bot.chooseColor(currentPlayer.cards) : null;
            if (stackCard.isWild && !color) color = this.gameState.selectedColor;
            const result = this.gameState.playCard(currentPlayer.id, stackCard.id, color);
            if (!result.success) {
              this.gameState.drawCard(currentPlayer.id);
              this._updateGameUI();
              if (this.gameState.phase === GAME_PHASES.PLAYING) {
                this._aiTimer = setTimeout(processAI, AI_TURN_DELAY);
              }
              return;
            }
            this._updateGameUI();
            if (this.gameState.phase === GAME_PHASES.PLAYING) {
              this._aiTimer = setTimeout(processAI, AI_TURN_DELAY);
            }
            return;
          }
          if (this.gameUI) await this.gameUI.animateAIDraw(currentPlayer.id);
          this.gameState.drawCard(currentPlayer.id);
          this._updateGameUI();
          if (this.gameState.phase === GAME_PHASES.PLAYING) {
            this._aiTimer = setTimeout(processAI, AI_TURN_DELAY);
          }
          return;
        }

        const card = bot.chooseCard(
          currentPlayer.cards,
          this.gameState.currentCard,
          this.gameState.selectedColor,
          this.gameState.getRules()
        );

        if (card) {
          if (this.gameUI) {
            await this.gameUI.animateAIPlay(currentPlayer.id, card.serialize?.() ?? card);
          }
          const color = card.isWild ? bot.chooseColor(currentPlayer.cards) : null;
          const result = this.gameState.playCard(currentPlayer.id, card.id, color);
          this._updateGameUI();

          if (this.gameState.phase === GAME_PHASES.FINISHED) {
            eventBus.emit(EVENTS.GAME_OVER, this._buildWinData(currentPlayer.id));
            return;
          }
          if (result.action === 'player_finished') {
            this._aiTimer = setTimeout(processAI, AI_TURN_DELAY);
            return;
          }
        } else {
          if (this.gameUI) await this.gameUI.animateAIDraw(currentPlayer.id);
          this.gameState.drawCard(currentPlayer.id);
          this._updateGameUI();
        }

        if (this.gameState.phase === GAME_PHASES.PLAYING) {
          this._aiTimer = setTimeout(processAI, AI_TURN_DELAY);
        }
      }, thinkingTime);
    };

    processAI();
  }

  _stopAILoop() {
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }
  }

  _restartAIGame() {
    this._stopAILoop();
    if (this.gameState) this.gameState.destroy();
    this.gameState = new GameState();
    this.gameState.init('player_ai_main', 'Player');
    this.aiPlayers = [];
    for (let i = 1; i <= this.aiBotCount; i++) {
      const name = `Bot ${i}`;
      const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      this.gameState.addPlayer(botId, name);
      this.aiPlayers.push({ id: botId, name, difficulty: 'medium' });
    }
    this.gameState.players.forEach(p => p.isReady = true);
    this._startGame();
    this._showGame();
  }

  _restartMultiplayerGame() {
    if (!this.roomManager?.peerConnection?.isHost) return;

    if (this.gameUI) {
      this.gameUI._cleanup();
      this.gameUI = null;
    }

    this._startGame();
    this._showGame();
  }

  _buildWinData(fallbackWinnerId = null) {
    const gs = this.gameState;
    const rankings = gs?.getRankings?.() || [];
    const scores = gs?.roundScores && Object.keys(gs.roundScores).length
      ? { ...gs.roundScores }
      : Object.fromEntries(rankings.map((id, i) => [id, rankings.length - i]));
    const winnerId = rankings[0] || fallbackWinnerId;
    return {
      winnerId,
      loserId: gs?.loser || rankings[rankings.length - 1] || null,
      winnerName: winnerId ? this._getPlayerName(winnerId) : 'Player',
      rankings,
      scores
    };
  }

  _calculateScores() {
    return this._buildWinData().scores;
  }

  _showWinScreen(data) {
    if (this.gameUI) {
      this.gameUI.showWin(data);
    }
  }

  _broadcastState() {
    if (this.roomManager) {
      this.roomManager.peerConnection.sendStateSync(this.gameState.serialize());
    }
    this._updateGameUI();
  }

  _updateGameUI() {
    if (!this.gameUI || !this.gameState) return;
    const pid = this.isAIMode ? 'player_ai_main' : (this.roomManager?.playerId);
    this.gameUI.updateGameState(this.gameState.getPublicState(pid));
  }

  _getPlayerName(playerId) {
    return this.gameState?.players.find(p => p.id === playerId)?.name || 'Unknown';
  }

  _onPlayerDisconnect(peerId) {
    if (!this.gameState) return;
    if (!this.gameState.players.some(p => p.id === peerId)) return;
    this.gameState.removePlayer(peerId);
    this.roomManager?.players?.delete(peerId);
    if (this.gameState.players.length < 2 && this.gameState.phase === GAME_PHASES.PLAYING) {
      const remaining = this.gameState.players[0];
      if (remaining) {
        this.gameState._finalizeGame(remaining.id);
        eventBus.emit(EVENTS.GAME_OVER, this._buildWinData());
      }
    }
    this._broadcastState();
  }

  _cleanup() {
    this._stopAILoop();
    this._stopTurnTimeoutWatchdog();
    if (this.heartbeat) { this.heartbeat.stop(); this.heartbeat = null; }
    if (this.roomManager) { this.roomManager.destroy(); this.roomManager = null; }
    if (this.gameUI) { this.gameUI._cleanup(); this.gameUI = null; }
    if (this.lobbyUI) { this.lobbyUI._cleanup(); this.lobbyUI = null; }
    if (this.gameState) { this.gameState.destroy(); this.gameState = null; }
    this.isAIMode = false;
    this.aiPlayers = [];
    this.aiBotCount = 3;
    this.devPenaltyTestMode = false;
  }
}

const app = new App();
