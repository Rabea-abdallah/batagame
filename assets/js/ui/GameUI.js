import { eventBus } from '../core/EventSystem.js';
import { EVENTS, COLORS, CARD_TYPES, GAME_PHASES, TURN_TIMEOUT, PLAY_RULES_SUMMARY_AR } from '../core/Constants.js';
import { Card } from '../game/Card.js';
import { GameRules } from '../game/GameRules.js';
import { CardRenderer } from './CardRenderer.js';
import { CardAnimation, getAnimMs } from './CardAnimation.js';
import { ParticleEffects } from './ParticleEffects.js';
import { Notification } from './Notification.js';
import { soundManager } from '../utils/SoundManager.js';
import { formatTime } from '../utils/helpers.js';

export class GameUI {
  constructor() {
    this._container = document.getElementById('app');
    this._particles = new ParticleEffects(document.body);
    this._playerId = null;
    this._isHost = false;
    this._isAIMode = false;
    this._gameState = null;
    this._timerInterval = null;
    this._animationsEnabled = true;
    this._unsubscribers = [];
    this._lastTurnWasMine = false;
    this._dealt = false;
    this._dealComplete = false;
    this._dealingInProgress = false;
    this._revealHandAfterDeal = false;
    this._timeoutSentForTurn = null;
    this._lastHandIds = new Set();
    this._lastDiscardCardId = null;
    this._lastEventId = 0;
    this._pendingLocalPlay = null;
    this._suppressDiscardAnim = false;
    this._prevOpponentCounts = {};
    this._uiSnapshot = null;
    this._drawPileKey = null;
    this._lastDiscardHistoryKey = null;
    this._lastHintText = '';
    this._lastPlayKey = '';
    this._lastTimerTurnStart = null;
    this._lastCountdownSecond = -1;
    this._drawAnimatingIds = new Set();
    this._localPlayInFlight = null;
    this._render();
  }

  show(playerId, isHost, gameState, isAIMode = false) {
    this._cleanup();
    this._dealt = false;
    this._dealComplete = false;
    this._dealingInProgress = false;
    this._revealHandAfterDeal = false;
    this._timeoutSentForTurn = null;
    this._lastHandIds = new Set();
    this._lastDiscardCardId = null;
    this._lastEventId = 0;
    this._pendingLocalPlay = null;
    this._suppressDiscardAnim = false;
    this._prevOpponentCounts = {};
    this._uiSnapshot = null;
    this._drawPileKey = null;
    this._lastDiscardHistoryKey = null;
    this._lastHintText = '';
    this._lastPlayKey = '';
    this._lastTimerTurnStart = null;
    this._lastCountdownSecond = -1;
    this._drawAnimatingIds = new Set();
    this._localPlayInFlight = null;
    this._playerId = playerId;
    this._isHost = isHost;
    this._isAIMode = isAIMode;
    this._gameState = gameState;
    this._render();
    this._setupListeners();
    this._syncUI({ runDeal: true });
    soundManager.playGameStart();
  }

  _render() {
    this._container.innerHTML = `
      <div class="game">
        <div class="game__dev-banner" id="game-dev-banner" hidden aria-live="polite">
          🧪 وضع اختبار DEV — 10 أوراق (+2 / تحويل / توقيف)
        </div>
        <div class="game__header">
          <div class="game__info">
            <button class="btn btn--icon" id="btn-game-menu">⚙️</button>
            <div class="game__turn-indicator" id="turn-indicator">
              <span class="game__direction-arrow" id="direction-arrow">→</span>
              <span id="turn-name">Waiting...</span>
            </div>
            <div class="game__timer" id="game-timer">--:--</div>
            <button class="btn btn--icon" id="btn-rules" title="قواعد اللعبة">❓</button>
          </div>
        </div>

        <div class="game__board">
          <div class="game__opponent-top" id="opponent-top"></div>

          <div class="game__opponent-left" id="opponent-left"></div>

          <div class="game__center">
            <div class="game__deck-area">
              <div class="game__draw-pile" id="draw-pile"></div>
              <div class="game__discard-pile">
                <div class="game__discard-active" id="discard-active"></div>
                <div class="active-color-indicator" id="discard-color-indicator" hidden aria-live="polite"></div>
              </div>
            </div>
            <div class="game__discard-row" id="discard-row"></div>
          </div>

          <div class="game__opponent-right" id="opponent-right"></div>

          <div class="game__hint" id="game-hint"></div>

          <div class="game__actions">
            <span class="game__turn-label" id="turn-label"></span>
            <button class="btn btn--uno ${this._isMyUnoTurn() ? '' : 'btn--disabled'}" id="btn-uno">🦆 UNO!</button>
          </div>

          <div class="game__hand" id="player-hand"></div>

        <div class="game__color-picker"></div>
      </div>

      <!-- Menu Modal -->
      <div class="modal" id="game-menu-modal">
        <div class="modal__content">
          <h2>Game Menu</h2>
          <div class="modal__actions" style="flex-direction:column;gap:8px;">
            <button class="btn btn--secondary" id="btn-leave-game">Leave Game</button>
            <button class="btn btn--secondary" id="btn-resume-game">Resume</button>
          </div>
        </div>
      </div>

      <!-- Rules Modal -->
      <div class="modal" id="rules-modal">
        <div class="modal__content modal__content--rules">
          <h2>📖 شرح لعبة البطّة UNO</h2>
          <div class="rules-body">
            <p id="active-rules-summary"></p>
            <h3>🎯 الهدف</h3>
            <p>حاول تتخلص من كل أوراقك قبل باقي اللاعبين. إذا خلصت أوراقك تنتهي الجولة، وتحصل على نقاط حسب الأوراق المتبقية مع الآخرين.</p>

            <h3>🕹️ ماذا أفعل في دوري؟</h3>
            <ol>
              <li>انظر إلى الورقة الموجودة في الوسط.</li>
              <li>العب ورقة من يدك تطابق اللون، أو الرقم، أو نوع الورقة.</li>
              <li>إذا ما عندك ورقة مناسبة، اضغط على كومة السحب.</li>
              <li>إذا سحبت ورقة ولم يتغير الدور، فهذا يعني أن الورقة المسحوبة قابلة للعب ويمكنك لعبها.</li>
            </ol>

            <h3>🃏 الورق العادي</h3>
            <p>الأوراق من 0 إلى 9. تقدر تلعبها إذا كان لونها مثل لون الورقة في الوسط، أو رقمها مثل الرقم الموجود في الوسط.</p>

            <h3>⭐ الأوراق الخاصة</h3>
            <ul>
              <li><strong>Skip</strong> — يتخطى دور اللاعب التالي.</li>
              <li><strong>Reverse</strong> — يعكس اتجاه اللعب. إذا كان اللعب بين شخصين، يعمل مثل Skip.</li>
              <li><strong>+2</strong> — اللاعب التالي يسحب ورقتين ويفقد دوره.</li>
              <li><strong>Wild</strong> — تقدر تلعبها في أي وقت وتختار اللون التالي.</li>
              <li><strong>Wild +4 (أبو 4)</strong> — تُلعب في أي وقت بغض النظر عن الورقة في الساحة. تغيّر اللون واللاعب التالي يسحب 4. بعد سحب عقوبة أبو 4 يمكن كوّم أبو 4 فوقها.</li>
            </ul>

            <h3>🎨 اختيار اللون</h3>
            <p>عند لعب Wild أو Wild +4 ستظهر لك ألوان. اختر اللون الذي يساعدك، وغالبًا الأفضل تختار اللون الأكثر وجودًا في يدك.</p>

            <h3>📦 التكديس (+2 / +4)</h3>
            <ul>
              <li><strong>عقوبة غير مسحوبة:</strong> أبو 4 دائماً؛ +2 فوق +2 بأي لون؛ +2 فوق أبو 4 بنفس لون الـ Wild؛ توقيف وتحويل بنفس لون الكومة.</li>
              <li><strong>بعد سحب العقوبة:</strong> أبو 4 أو Wild أو أي ورقة بنفس اللون؛ +2 فوق +2 بأي لون.</li>
              <li>أبو 4 يُلعب في أي وقت ويمكن كوّمه فوق أبو 4 سابق بغض النظر عن اللون.</li>
              <li>فوق أبو 4: توقيف وتحويل يلزمان نفس اللون المختار من الـ Wild.</li>
              <li><strong>توقيف بنفس اللون</strong> على كومة عقوبة غير مسحوبة: يلغي كل التكعيبات المتراكمة.</li>
              <li><strong>تحويل بنفس اللون</strong> على كومة عقوبة غير مسحوبة: يعكس الاتجاه ويُلزم اللاعب التالي بسحب المتراكم.</li>
            </ul>

            <h3>🦆 نداء UNO</h3>
            <p>عندما تبقى معك ورقة واحدة، اضغط زر UNO بسرعة. إذا نسيت النداء قد تسحب ورقتين كعقوبة حسب قواعد الروم.</p>

            <h3>⏱️ المؤقت</h3>
            <p>لكل لاعب وقت محدد في دوره. إذا انتهى الوقت في الروم يُخرج اللاعب وتستمر اللعبة مع الباقين.</p>

            <h3>🏁 نهاية اللعبة</h3>
            <p>اللعبة لا تنتهي عند أول لاعب يفرغ يده. يستمر اللعب حتى يبقى <strong>لاعب واحد</strong> بأوراق — وهو الخاسر. من ينهي أوراقه أولاً يُصنَّف في المركز الأول، والخاسر في الأسفل.</p>

            <h3>🏆 النقاط</h3>
            <p>الفائز بالجولة يحصل على نقاط الأوراق المتبقية مع اللاعبين الآخرين. تستمر الجولات حتى يصل لاعب إلى هدف النقاط المحدد في الروم.</p>

            <h3>💡 نصائح سريعة</h3>
            <ul>
              <li>احتفظ بورق Wild للحظات الصعبة.</li>
              <li>حاول تغيير اللون إلى اللون الأكثر في يدك.</li>
              <li>انتبه لعدد أوراق الخصوم، خصوصًا إذا بقيت معهم ورقة واحدة.</li>
            </ul>
          </div>
          <button class="btn btn--primary modal-close" id="btn-rules-close">فهمت، لنلعب</button>
        </div>
      </div>

      <!-- Win Screen -->
      <div class="modal" id="win-modal">
        <div class="modal__content modal__content--win">
          <h1 class="win-title">🏆 Winner! 🏆</h1>
          <h2 class="win-player" id="winner-name">---</h2>
          <div class="win-scores" id="win-scores"></div>
          <button class="btn btn--primary btn--large" id="btn-play-again">Play Again</button>
          <button class="btn btn--secondary" id="btn-back-home">Back to Menu</button>
        </div>
      </div>

    `;

    this._bindEvents();
  }

  _bindEvents() {
    document.getElementById('btn-uno')?.addEventListener('click', () => {
      soundManager.playUno();
      eventBus.emit('uno:call', { playerId: this._playerId });
    });

    document.getElementById('btn-game-menu')?.addEventListener('click', () => {
      document.getElementById('game-menu-modal')?.classList.add('modal--visible');
    });

    document.getElementById('btn-rules')?.addEventListener('click', () => {
      document.getElementById('rules-modal')?.classList.add('modal--visible');
    });

    document.getElementById('btn-rules-close')?.addEventListener('click', () => {
      document.getElementById('rules-modal')?.classList.remove('modal--visible');
    });

    document.getElementById('btn-leave-game')?.addEventListener('click', () => {
      document.getElementById('game-menu-modal')?.classList.remove('modal--visible');
      eventBus.emit('navigate:home');
    });

    document.getElementById('btn-resume-game')?.addEventListener('click', () => {
      document.getElementById('game-menu-modal')?.classList.remove('modal--visible');
      if (this._isAIMode) {
        eventBus.emit('game:play-again');
      }
    });

    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      document.getElementById('win-modal')?.classList.remove('modal--visible');
      eventBus.emit('game:play-again');
    });

    document.getElementById('btn-back-home')?.addEventListener('click', () => {
      document.getElementById('win-modal')?.classList.remove('modal--visible');
      eventBus.emit('navigate:home');
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('modal--visible')));
    });

    const drawPile = document.getElementById('draw-pile');
    drawPile?.addEventListener('click', () => {
      if (!this._canInteract()) return;
      if (this._isMyTurn()) {
        CardAnimation.pulseDeck();
        eventBus.emit('card:draw', { playerId: this._playerId });
      }
    });
  }

  _setupListeners() {
    this._unsubscribers.push(
      eventBus.on(EVENTS.CARD_PLAYED, (data) => {
        soundManager.playCardPlay();
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.CARD_DRAWN, (data) => {
        soundManager.playCardDraw();
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.TURN_CHANGE, () => {
        this._syncUI();
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.GAME_OVER, (data) => {
        this.showWin(data);
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.UNO_CALLED, (data) => {
        Notification.info(`${data.playerName} called UNO!`);
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.UNO_FORGOT, (data) => {
        Notification.warning(`${data.playerName} forgot UNO! +2 cards`);
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.INVALID_MOVE, (data) => {
        Notification.warning(`Invalid move: ${data?.reason || 'not allowed'}`);
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.COLOR_SELECTED, () => {
        this._syncUI();
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.DIRECTION_CHANGE, () => {
        soundManager.playReverse();
        this._syncUI();
      })
    );

    this._unsubscribers.push(
      eventBus.on(EVENTS.CHEAT_DETECTED, (data) => {
        Notification.error(`Cheat detected: ${data.reason}`);
      })
    );

    this._unsubscribers.push(
      eventBus.on('game:update', (data) => {
        this._gameState = data;
        this._syncUI();
      })
    );

    this._unsubscribers.push(
      eventBus.on('ui:card:animation', (data) => {
        // handle card animations
      })
    );
  }

  updateGameState(state) {
    const prev = this._gameState;
    if (state?.phase === GAME_PHASES.PLAYING) {
      document.getElementById('win-modal')?.classList.remove('modal--visible');
    }
    this._gameState = state;
    this._syncUI();
    this._dispatchActionAnimations(prev, state);
  }

  _syncUI(options = {}) {
    if (!this._gameState) return;
    const prevSnap = this._uiSnapshot;
    const nextSnap = this._computeSnapshot(this._gameState);
    const flags = this._diffSnapshots(prevSnap, nextSnap);
    this._applyPatch(flags, options);
    this._uiSnapshot = nextSnap;
  }

  _computeSnapshot(state) {
    if (!state) return null;
    const me = state.players?.find(p => p.id === this._playerId);
    const opponents = this._getOpponentOrder(state).map(p => ({
      id: p.id,
      cardCount: p.cardCount,
      connected: p.connected !== false,
      finished: !!p.finished,
      name: p.name,
      uno: !!state.unoCalled?.[p.id]
    }));
    const recent = state.recentDiscards || [];
    return {
      phase: state.phase,
      currentPlayerIndex: state.currentPlayerIndex,
      direction: state.direction,
      deckCount: state.deckCount ?? 0,
      mustDraw: !!state.mustDraw,
      pendingDrawCount: state.pendingDrawCount ?? 0,
      currentCardId: state.currentCard?.id ?? null,
      selectedColor: state.selectedColor ?? null,
      recentDiscardIds: recent.map(c => c.id).join(','),
      handIds: (me?.cards || []).map(c => c.id).join(','),
      handCount: me?.cards?.length ?? 0,
      turnStartTime: state.turnStartTime ?? 0,
      opponentsKey: JSON.stringify(opponents),
      opponentSlotKey: opponents.map(o => o.id).join(','),
      rulesKey: JSON.stringify(state.rules || {}),
      playKey: [
        state.currentPlayerIndex,
        state.currentCard?.id,
        state.selectedColor,
        state.mustDraw,
        state.pendingDrawCount
      ].join('|')
    };
  }

  _diffSnapshots(prev, next) {
    if (!prev || !next) return { all: true };
    return {
      all: false,
      players: prev.opponentsKey !== next.opponentsKey ||
        prev.opponentSlotKey !== next.opponentSlotKey ||
        prev.currentPlayerIndex !== next.currentPlayerIndex,
      hand: prev.handIds !== next.handIds || prev.playKey !== next.playKey,
      handPlayableOnly: prev.handIds === next.handIds && prev.playKey !== next.playKey,
      table: prev.deckCount !== next.deckCount ||
        prev.mustDraw !== next.mustDraw ||
        prev.pendingDrawCount !== next.pendingDrawCount ||
        prev.currentCardId !== next.currentCardId ||
        prev.selectedColor !== next.selectedColor ||
        prev.recentDiscardIds !== next.recentDiscardIds,
      tableColorOnly: prev.currentCardId === next.currentCardId &&
        prev.selectedColor !== next.selectedColor &&
        prev.recentDiscardIds === next.recentDiscardIds &&
        prev.deckCount === next.deckCount &&
        prev.mustDraw === next.mustDraw &&
        prev.pendingDrawCount === next.pendingDrawCount,
      turn: prev.currentPlayerIndex !== next.currentPlayerIndex,
      hint: prev.playKey !== next.playKey ||
        prev.handCount !== next.handCount ||
        prev.currentPlayerIndex !== next.currentPlayerIndex,
      direction: prev.direction !== next.direction,
      uno: prev.handCount !== next.handCount,
      rules: prev.rulesKey !== next.rulesKey,
      timer: prev.turnStartTime !== next.turnStartTime,
      phase: prev.phase !== next.phase
    };
  }

  _updateDevBanner() {
    const el = document.getElementById('game-dev-banner');
    if (!el) return;
    el.hidden = !this._gameState?.devPenaltyTest;
  }

  _applyPatch(flags, options = {}) {
    this._updateDevBanner();
    if (flags.all) {
      this._updatePlayers();
      this._updateHand();
      this._updateTable();
      this._updateTurn();
      this._updateTimer();
      this._updateDirection();
      this._updateUnoButton();
      this._updateRulesSummary();
      this._updateHint();
      if (options.runDeal && !this._dealt) {
        this._dealt = true;
        this._startDealAnimation();
      }
      return;
    }

    if (flags.players) this._updatePlayers();
    if (flags.hand) this._updateHand();
    else if (flags.handPlayableOnly) this._updateHandPlayable();
    if (flags.table) this._updateTable();
    else if (flags.tableColorOnly) this._patchDiscardColorOnly();
    if (flags.turn) this._updateTurn();
    if (flags.timer) this._updateTimer();
    if (flags.direction) this._updateDirection();
    if (flags.uno) this._updateUnoButton();
    if (flags.rules) this._updateRulesSummary();
    if (flags.hint) this._updateHint();

    if (options.runDeal && !this._dealt) {
      this._dealt = true;
      this._startDealAnimation();
    }
  }

  _getOpponentOrder(state = this._gameState) {
    const players = state?.players || [];
    const myId = this._playerId;
    const myIndex = players.findIndex(p => p.id === myId);
    if (myIndex === -1) return [];
    const direction = state.direction || 1;
    const order = [];
    let idx = myIndex;
    for (let i = 0; i < players.length; i++) {
      idx = (idx + direction + players.length) % players.length;
      const p = players[idx];
      if (p && p.id !== myId) {
        order.push(p);
        if (order.length >= players.length - 1) break;
      }
    }
    return order;
  }

  _dispatchActionAnimations(prev, next) {
    if (!prev || !next?.lastAction || !next.lastEventId) return;
    if (next.lastEventId === this._lastEventId) return;

    this._lastEventId = next.lastEventId;
    const action = next.lastAction;

    if (this._isAIMode && action.playerId !== this._playerId) {
      return;
    }

    if (action.type?.startsWith?.('initial_')) {
      return;
    }

    if (action.type === 'play') {
      if (action.playerId === this._playerId) {
        return;
      }
      this._suppressDiscardAnim = true;
      CardAnimation.enqueue(() => CardAnimation.opponentPlayToDiscard(action.playerId, action.card));
      return;
    }

    if (action.type === 'draw' && action.playerId !== this._playerId) {
      CardAnimation.enqueue(() => CardAnimation.opponentDrawFromDeck(action.playerId, action.count || 1));
    }
  }

  _updateAll() {
    this._syncUI({ runDeal: true });
  }

  _patchOpponentCardsRow(row, visibleCount) {
    const n = Math.min(Math.max(visibleCount, 0), 3);
    const cur = row.children.length;
    if (cur === n) return;
    if (cur < n) {
      for (let i = cur; i < n; i++) {
        const card = document.createElement('div');
        card.className = 'card card--face-down card--opponent card--silent';
        row.appendChild(card);
      }
    } else {
      while (row.children.length > n) row.lastChild.remove();
    }
  }

  _patchOpponentInfo(info, p, isCurrent) {
    if (!info) return;
    let avatar = info.querySelector('.opponent__avatar');
    if (!avatar) {
      avatar = document.createElement('span');
      avatar.className = 'opponent__avatar';
      info.prepend(avatar);
    }
    const avatarText = isCurrent ? '🟢' : '🔴';
    if (avatar.textContent !== avatarText) avatar.textContent = avatarText;

    let nameEl = info.querySelector('.opponent__name');
    if (!nameEl) {
      nameEl = document.createElement('span');
      nameEl.className = 'opponent__name';
      info.appendChild(nameEl);
    }
    if (nameEl.textContent !== p.name) nameEl.textContent = p.name;

    let countEl = info.querySelector('.opponent__cards');
    if (!countEl) {
      countEl = document.createElement('span');
      countEl.className = 'opponent__cards';
      info.appendChild(countEl);
    }
    const countText = p.finished ? '✅ انتهى' : String(p.cardCount);
    if (countEl.textContent !== countText) countEl.textContent = countText;

    const showUno = !!this._gameState.unoCalled?.[p.id];
    let unoEl = info.querySelector('.opponent__uno');
    if (showUno && !unoEl) {
      unoEl = document.createElement('span');
      unoEl.className = 'opponent__uno';
      unoEl.textContent = 'UNO!';
      info.appendChild(unoEl);
    } else if (!showUno && unoEl) {
      unoEl.remove();
    }
  }

  _updatePlayers() {
    const topArea = document.getElementById('opponent-top');
    const leftArea = document.getElementById('opponent-left');
    const rightArea = document.getElementById('opponent-right');
    if (!topArea || !leftArea || !rightArea || !this._gameState?.players) return;

    const opponentOrder = this._getOpponentOrder();
    if (!opponentOrder.length) return;

    const activeIds = new Set(opponentOrder.map(p => p.id));
    document.querySelectorAll('.opponent[data-player-id]').forEach(el => {
      if (!activeIds.has(el.dataset.playerId)) el.remove();
    });

    const areaBySlot = [leftArea, topArea, rightArea, topArea];

    opponentOrder.forEach((p, i) => {
      const isCurrent = this._isCurrentPlayer(p.id);
      let el = document.querySelector(`.opponent[data-player-id="${p.id}"]`);

      if (!el) {
        el = document.createElement('div');
        el.dataset.playerId = p.id;
        el.innerHTML = '<div class="opponent__info"></div><div class="opponent__cards-row"></div>';
      }

      const nextClass = `opponent ${!p.connected ? 'opponent--disconnected' : ''} ${p.finished ? 'opponent--finished' : ''} ${isCurrent ? 'opponent--current' : ''}`;
      if (el.className !== nextClass) el.className = nextClass;

      const prevCount = this._prevOpponentCounts[p.id];
      if (prevCount !== undefined && p.cardCount > prevCount) {
        el.classList.add('opponent--cards-gained');
        setTimeout(() => el.classList.remove('opponent--cards-gained'), getAnimMs('--anim-card-reveal', 380) * 1.2);
      }

      this._patchOpponentInfo(el.querySelector('.opponent__info'), p, isCurrent);

      const row = el.querySelector('.opponent__cards-row');
      const visibleCount = this._dealComplete ? p.cardCount : 0;
      if (row) this._patchOpponentCardsRow(row, visibleCount);

      const targetArea = areaBySlot[Math.min(i, areaBySlot.length - 1)];
      if (targetArea && el.parentElement !== targetArea) {
        targetArea.appendChild(el);
      }
    });

    this._prevOpponentCounts = Object.fromEntries(opponentOrder.map(p => [p.id, p.cardCount]));
  }

  _updateHand() {
    const hand = document.getElementById('player-hand');
    if (!hand || !this._gameState?.players) return;

    const me = this._gameState.players.find(p => p.id === this._playerId);
    if (!me || !me.cards) return;

    if (!this._dealComplete) {
      hand.replaceChildren();
      hand.classList.remove('hand--my-turn');
      hand.classList.add('hand--awaiting-deal');
      this._handCardData = me.cards.map(c => ({
        id: c.id,
        isWild: c.type === CARD_TYPES.WILD || c.type === CARD_TYPES.WILD_DRAW_FOUR
      }));
      this._lastHandIds = new Set();
      return;
    }

    hand.classList.remove('hand--awaiting-deal');
    hand.classList.toggle('hand--my-turn', this._isMyTurn());

    const currentCard = this._gameState.currentCard;
    const selectedColor = this._gameState.selectedColor;

    this._handCardData = me.cards.map(c => ({ id: c.id, isWild: c.type === CARD_TYPES.WILD || c.type === CARD_TYPES.WILD_DRAW_FOUR }));

    const nextIds = new Set(me.cards.map(c => String(c.id)));
    const newDrawQueue = [];

    [...hand.querySelectorAll('.card[data-card-id]')].forEach(cardEl => {
      const id = cardEl.dataset.cardId;
      if (!nextIds.has(id) && !this._drawAnimatingIds.has(id)) {
        cardEl.classList.add('card--leaving-hand');
        setTimeout(() => cardEl.remove(), getAnimMs('--anim-card-leave', 320));
      }
    });

    me.cards.forEach((card, index) => {
      const cardId = String(card.id);

      if (this._drawAnimatingIds.has(cardId)) {
        return;
      }

      let cardEl = hand.querySelector(`.card[data-card-id="${cardId}"]`);
      if (cardEl) {
        cardEl.classList.add('card--silent');
        const ref = this._findHandInsertBefore(hand, me.cards, index);
        if (cardEl !== ref && cardEl.parentElement === hand) {
          hand.insertBefore(cardEl, ref);
        }
        return;
      }

      const isNewDraw = !this._lastHandIds.has(cardId) && this._lastHandIds.size > 0;
      if (isNewDraw) {
        newDrawQueue.push({ card, index });
        return;
      }

      cardEl = CardRenderer.render(card, true, false);
      cardEl.dataset.cardId = card.id;
      cardEl.classList.add('card--silent');
      if (this._revealHandAfterDeal) {
        cardEl.classList.add('card--deal-reveal');
        cardEl.style.animationDelay = `${index * 55}ms`;
      }
      hand.insertBefore(cardEl, this._findHandInsertBefore(hand, me.cards, index));
    });

    if (this._revealHandAfterDeal) {
      this._revealHandAfterDeal = false;
    }

    const stagger = getAnimMs('--anim-card-stagger', 150);
    newDrawQueue.forEach(({ card, index }, i) => {
      const cardId = String(card.id);
      if (this._drawAnimatingIds.has(cardId)) return;
      this._drawAnimatingIds.add(cardId);
      this._lastHandIds.add(cardId);
      setTimeout(() => this._flyDrawToHand(card, hand, index), i * stagger);
    });

    const domIds = [...hand.querySelectorAll('.card[data-card-id]')].map(el => el.dataset.cardId);
    this._lastHandIds = new Set([...domIds, ...this._drawAnimatingIds]);
    this._updateHandPlayable();

    if (!this._handClickHandler) {
      this._handClickHandler = (e) => {
        if (!this._canInteract()) return;
        const cardEl = e.target.closest('.card');
        if (!cardEl) return;
        const cardId = parseInt(cardEl.dataset.cardId);
        if (!cardId) return;
        const cardData = this._handCardData?.find(c => c.id === cardId);
        if (!cardData) return;
        if (!this._isMyTurn()) return;

        const myCards = this._gameState?.players?.find(p => p.id === this._playerId)?.cards;
        const card = myCards?.find(c => c.id === cardId);
        if (!card) return;

        const cc = this._gameState?.currentCard;
        const sc = this._gameState?.selectedColor;
        if (!this._canPlayCard(card, cc, sc)) return;

        const fromRect = cardEl.getBoundingClientRect();
        const cardClone = cardEl.cloneNode(true);
        cardEl.classList.add('card--playing-out');
        this._pendingLocalPlay = card.id;
        this._localPlayInFlight = card.id;
        this._suppressDiscardAnim = true;
        cardClone.dataset.cardId = card.id;

        const playWithAnimation = () => {
          CardAnimation.playCardToDiscard(cardClone, fromRect)
            .finally(() => this._finalizeLocalPlayToDiscard());
        };

        if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
          this._showColorPicker((color) => {
            eventBus.emit('card:play', { playerId: this._playerId, cardId: card.id, selectedColor: color });
            playWithAnimation();
          });
        } else {
          eventBus.emit('card:play', { playerId: this._playerId, cardId: card.id, selectedColor: null });
          playWithAnimation();
        }
      };
      hand.addEventListener('click', this._handClickHandler);
    }
  }

  _updateHandPlayable() {
    const hand = document.getElementById('player-hand');
    if (!hand || !this._gameState?.players) return;

    const me = this._gameState.players.find(p => p.id === this._playerId);
    if (!me?.cards) return;

    const currentCard = this._gameState.currentCard;
    const selectedColor = this._gameState.selectedColor;
    const playKey = [
      this._isMyTurn(),
      currentCard?.id,
      selectedColor,
      this._gameState.mustDraw,
      this._gameState.pendingDrawCount
    ].join('|');
    if (this._lastPlayKey === playKey) return;
    this._lastPlayKey = playKey;

    const myTurn = this._isMyTurn();
    me.cards.forEach(card => {
      if (this._drawAnimatingIds.has(String(card.id))) return;
      const cardEl = hand.querySelector(`.card[data-card-id="${card.id}"]`);
      if (!cardEl) return;
      const isPlayable = myTurn && this._canPlayCard(card, currentCard, selectedColor);
      cardEl.classList.toggle('card--playable', isPlayable);
    });
  }

  animateAIDraw(playerId) {
    return CardAnimation.opponentDrawFromDeck(playerId, 1);
  }

  animateAIPlay(playerId, cardData = null) {
    this._suppressDiscardAnim = true;
    return CardAnimation.opponentPlayToDiscard(playerId, cardData);
  }

  _findHandInsertBefore(hand, cards, slotIndex) {
    for (let i = slotIndex + 1; i < cards.length; i++) {
      const next = hand.querySelector(`.card[data-card-id="${cards[i].id}"]`);
      if (next) return next;
    }
    return null;
  }

  _getHandSlotRect(hand, slotIndex, totalCount) {
    const handRect = hand.getBoundingClientRect();
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-width')) || 70;
    const cardH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-height')) || 100;
    const gap = parseFloat(getComputedStyle(hand).columnGap || getComputedStyle(hand).gap) || 4;
    const count = Math.max(totalCount, 1);
    const rowWidth = count * cardW + Math.max(0, count - 1) * gap;
    const startX = handRect.left + Math.max(0, (handRect.width - rowWidth) / 2);
    const left = startX + slotIndex * (cardW + gap);
    return {
      left,
      top: handRect.bottom - cardH,
      width: cardW,
      height: cardH
    };
  }

  _commitCardToHand(hand, card, slotIndex) {
    const me = this._gameState?.players?.find(p => p.id === this._playerId);
    if (!me?.cards || hand.querySelector(`.card[data-card-id="${card.id}"]`)) return;

    const cardEl = CardRenderer.render(card, true, false);
    cardEl.dataset.cardId = card.id;
    cardEl.classList.add('card--silent');
    hand.insertBefore(cardEl, this._findHandInsertBefore(hand, me.cards, slotIndex));

    requestAnimationFrame(() => {
      cardEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    });
  }

  _flyDrawToHand(card, hand, slotIndex) {
    const cardId = String(card.id);
    const me = this._gameState?.players?.find(p => p.id === this._playerId);
    const total = me?.cards?.length || 0;

    const finish = () => {
      this._drawAnimatingIds.delete(cardId);
      this._commitCardToHand(hand, card, slotIndex);
      const domIds = [...hand.querySelectorAll('.card[data-card-id]')].map(el => el.dataset.cardId);
      this._lastHandIds = new Set(domIds);
      this._updateHandPlayable();
    };

    requestAnimationFrame(() => {
      const targetRect = this._getHandSlotRect(hand, slotIndex, total);
      CardAnimation.drawToHandPrivate(card, targetRect).then(finish).catch(finish);
    });
  }

  _startDealAnimation() {
    this._dealComplete = false;
    this._dealingInProgress = true;
    document.querySelector('.game')?.classList.add('game--dealing');
    this._setHintText('🃏 جاري توزيع الأوراق...');

    this._animateDeal()
      .catch(() => {})
      .finally(() => this._finishDealAnimation());
  }

  _animateDeal() {
    if (!this._gameState) return Promise.resolve();

    const deckEl = document.getElementById('draw-pile');
    if (!deckEl) return Promise.resolve();

    const players = this._gameState.players || [];
    if (!players.length) return Promise.resolve();

    const deckRect = deckEl.getBoundingClientRect();
    const dealMs = getAnimMs('--anim-card-deal', 520);
    const stagger = getAnimMs('--anim-card-stagger', 150);
    const cardH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-height')) || 100;
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-width')) || 70;

    const jobs = [];
    let delay = 0;

    for (const player of players) {
      const cardCount = player.cardCount || 0;
      const isMe = player.id === this._playerId;
      const targetEl = isMe
        ? document.getElementById('player-hand')
        : document.querySelector(`.opponent[data-player-id="${player.id}"]`) || document.querySelector('.opponent');

      if (!targetEl) {
        delay += cardCount * stagger + dealMs * 0.4;
        continue;
      }

      for (let i = 0; i < cardCount; i++) {
        const delay_i = delay;
        const index = i;
        jobs.push(new Promise(resolve => {
          setTimeout(() => {
            const rect = targetEl.getBoundingClientRect();
            const tx = isMe ? rect.left + 12 + (index * Math.min(cardW * 0.55, 44)) : rect.left + rect.width / 2;
            const ty = rect.top + rect.height / 2;
            const toRect = {
              left: tx - cardW / 2,
              top: ty - cardH / 2,
              width: cardW,
              height: cardH
            };
            CardAnimation.dealBurst(deckRect, toRect, index, isMe).then(resolve).catch(resolve);
          }, delay_i);
        }));
        delay += stagger;
      }
      delay += dealMs * 0.4;
    }

    if (!jobs.length) return Promise.resolve();
    return Promise.all(jobs);
  }

  _finishDealAnimation() {
    this._dealingInProgress = false;
    this._dealComplete = true;
    this._revealHandAfterDeal = true;
    document.querySelector('.game')?.classList.remove('game--dealing');

    this._updatePlayers();
    this._updateHand();
    this._updateHandPlayable();
    this._updateTurn();
    this._updateHint();
    this._updateTimer();

    eventBus.emit('deal:complete');
  }

  _updateDrawPile() {
    const drawPile = document.getElementById('draw-pile');
    if (!drawPile) return;

    const deckCount = this._gameState?.deckCount || 0;
    const isEmpty = deckCount === 0;
    const stackCount = isEmpty ? 0 : Math.min(3, Math.max(1, Math.floor(deckCount / 10)));
    const mustDraw = !!(this._gameState?.mustDraw && this._gameState?.pendingDrawCount > 0);
    const pending = this._gameState?.pendingDrawCount || 0;
    const key = `${isEmpty}|${deckCount}|${stackCount}|${mustDraw}|${pending}`;
    if (this._drawPileKey === key) return;
    this._drawPileKey = key;

    drawPile.replaceChildren();
    if (isEmpty) {
      drawPile.appendChild(CardRenderer.renderEmpty());
    } else {
      drawPile.appendChild(CardRenderer.renderStackedBacks(stackCount));
      if (mustDraw) {
        const badge = document.createElement('div');
        badge.className = 'draw-pile__badge';
        badge.textContent = `💣 +${pending}`;
        drawPile.appendChild(badge);
      }
    }
    drawPile.classList.toggle('draw-pile--empty', isEmpty);
  }

  _patchDiscardColorOnly() {
    const discardActive = document.getElementById('discard-active');
    if (!discardActive) return;
    const recent = this._gameState?.recentDiscards || [];
    const cards = recent.map(c => Card.deserialize ? Card.deserialize(c) : c);
    const currentCard = cards.length > 0
      ? cards[cards.length - 1]
      : (this._gameState?.currentCard
        ? (Card.deserialize ? Card.deserialize(this._gameState.currentCard) : this._gameState.currentCard)
        : null);
    if (currentCard) this._updateDiscardColorIndicator(currentCard);
  }

  _resolveActivePlayColor(currentCard) {
    if (!currentCard) return null;
    const isWild = currentCard.type === CARD_TYPES.WILD || currentCard.type === CARD_TYPES.WILD_DRAW_FOUR;
    if (isWild) {
      return this._gameState?.selectedColor || null;
    }
    return currentCard.color || this._gameState?.selectedColor || null;
  }

  _updateDiscardColorIndicator(currentCard) {
    const indicator = document.getElementById('discard-color-indicator');
    if (!indicator) return;

    const activeColor = this._resolveActivePlayColor(currentCard);
    if (!activeColor) {
      indicator.hidden = true;
      indicator.removeAttribute('data-color');
      indicator.textContent = '';
      return;
    }

    const colorMap = { red: '#E74C3C', blue: '#3498DB', green: '#2ECC71', yellow: '#F1C40F' };
    const hex = colorMap[activeColor] || '#666';

    if (indicator.dataset.color === activeColor && !indicator.hidden) {
      return;
    }

    indicator.hidden = false;
    indicator.dataset.color = activeColor;
    indicator.innerHTML = `<span class="active-color-dot" style="background:${hex}"></span> ${activeColor}`;
  }

  _deserializeCard(data) {
    if (!data) return null;
    return Card.deserialize ? Card.deserialize(data) : data;
  }

  /** Top discard card in normal flow (face up) + active color for wilds. */
  _setDiscardTopCard(discardActive, currentCard, { animate = false } = {}) {
    if (!discardActive || !currentCard) return;

    discardActive.querySelectorAll(
      '.card--flying-landed, .card--under-fly, .card[data-card-id], .active-color-indicator'
    ).forEach(el => el.remove());

    const cardEl = CardRenderer.render(currentCard, true, false);
    cardEl.classList.add('card--silent');
    if (animate && !this._suppressDiscardAnim) {
      cardEl.classList.add('discard-card--enter');
    }

    discardActive.appendChild(cardEl);

    this._lastDiscardCardId = String(currentCard.id);
    this._suppressDiscardAnim = false;
    this._updateDiscardColorIndicator(currentCard);
  }

  _finalizeLocalPlayToDiscard() {
    this._localPlayInFlight = null;
    this._pendingLocalPlay = null;

    const discardActive = document.getElementById('discard-active');
    if (!discardActive) return;

    const currentCard = this._deserializeCard(this._gameState?.currentCard);
    if (currentCard) {
      this._setDiscardTopCard(discardActive, currentCard, { animate: false });
      return;
    }

    const recent = this._gameState?.recentDiscards || [];
    const cards = recent.map(c => this._deserializeCard(c));
    this._lastDiscardCardId = null;
    this._suppressDiscardAnim = true;
    this._updateDiscardActive(cards);
  }

  _updateDiscardActive(cards) {
    const discardActive = document.getElementById('discard-active');
    if (!discardActive) return;

    const currentCard = cards.length > 0
      ? cards[cards.length - 1]
      : (this._gameState?.currentCard
        ? (Card.deserialize ? Card.deserialize(this._gameState.currentCard) : this._gameState.currentCard)
        : null);
    const currentCardId = currentCard?.id ? String(currentCard.id) : null;

    if (
      this._localPlayInFlight != null &&
      currentCardId === String(this._localPlayInFlight)
    ) {
      if (currentCard) this._updateDiscardColorIndicator(currentCard);
      return;
    }

    if (currentCard && this._lastDiscardCardId !== currentCardId) {
      this._setDiscardTopCard(discardActive, currentCard, {
        animate: !this._suppressDiscardAnim
      });
    } else if (!currentCard) {
      if (discardActive.childElementCount > 0) discardActive.replaceChildren();
      this._lastDiscardCardId = null;
      this._updateDiscardColorIndicator(null);
    } else if (currentCard) {
      this._updateDiscardColorIndicator(currentCard);
    }
  }

  _updateDiscardRow(cards) {
    const discardRow = document.getElementById('discard-row');
    if (!discardRow) return;

    const historyKey = cards.length > 1 ? cards.slice(0, -1).map(c => c.id).join(',') : '';
    if (this._lastDiscardHistoryKey === historyKey) return;
    this._lastDiscardHistoryKey = historyKey;

    discardRow.replaceChildren();
    if (cards.length > 1) {
      discardRow.appendChild(CardRenderer.renderDiscardRow(cards.slice(0, -1)));
      requestAnimationFrame(() => {
        discardRow.scrollLeft = discardRow.scrollWidth;
      });
    }
  }

  _updateTable() {
    this._updateDrawPile();
    const recent = this._gameState?.recentDiscards || [];
    const cards = recent.map(c => Card.deserialize ? Card.deserialize(c) : c);
    this._updateDiscardActive(cards);
    this._updateDiscardRow(cards);
  }

  _updateTurn() {
    const turnName = document.getElementById('turn-name');
    if (!turnName || !this._gameState?.players) return;

    const currentPlayer = this._gameState.players[this._gameState.currentPlayerIndex];
    if (currentPlayer) {
      const isMyTurn = currentPlayer.id === this._playerId;
      const turnText = isMyTurn ? 'Your Turn!' : `${currentPlayer.name}'s Turn`;
      if (turnName.textContent !== turnText) turnName.textContent = turnText;
      turnName.classList.toggle('turn-name--my-turn', isMyTurn);
      const turnLabel = document.getElementById('turn-label');
      if (turnLabel) {
        const labelText = isMyTurn ? 'Your Turn!' : '';
        if (turnLabel.textContent !== labelText) turnLabel.textContent = labelText;
        turnLabel.classList.toggle('turn-label--active', isMyTurn);
      }
      if (isMyTurn && !this._lastTurnWasMine) {
        soundManager.playTurnChange();
      }
      this._lastTurnWasMine = isMyTurn;
    }
  }

  _updateHint() {
    if (this._dealingInProgress || !this._dealComplete) {
      this._setHintText('🃏 جاري توزيع الأوراق...');
      return;
    }
    const hint = document.getElementById('game-hint');
    if (!hint || !this._gameState) return;

    if (this._gameState.phase !== 'playing') {
      this._setHintText('');
      return;
    }

    const currentPlayer = this._gameState.players[this._gameState.currentPlayerIndex];
    if (!currentPlayer) return;

    const isMyTurn = currentPlayer.id === this._playerId;

    if (!isMyTurn) {
      this._setHintText('⏳ انتظر دورك');
      return;
    }

    const me = this._gameState.players.find(p => p.id === this._playerId);
    const currentCard = this._gameState.currentCard;

    if (this._gameState.mustDraw) {
      const rules = this._gameState.rules;
      const pending = this._gameState.pendingDrawCount;
      const stackRef = GameRules.getPenaltyStackReference(
        currentCard,
        this._gameState.penaltyStackCardType
      );
      const penaltyStackType = this._gameState.penaltyStackCardType;
      const canStack = me?.cards?.some(c =>
        penaltyStackType
          ? GameRules.canStackPenaltyDraw(
            c, penaltyStackType, currentCard, this._gameState.selectedColor, rules
          )
          : stackRef && GameRules.canStackDraw(c, stackRef, rules)
      );
      const canSkipCancel = me?.cards?.some(c =>
        currentCard && GameRules.skipCancelsPenalty(
          c, currentCard, this._gameState.selectedColor, rules, penaltyStackType
        )
      );
      const canReverseRedirect = me?.cards?.some(c =>
        currentCard && GameRules.reverseRedirectsPenalty(
          c, currentCard, this._gameState.selectedColor, rules, penaltyStackType
        )
      );
      if (canStack && (canSkipCancel || canReverseRedirect)) {
        this._setHintText(`🎯 كوّم +${pending} أو ألغِ/حوّل بنفس اللون أو اسحب ${pending}`);
      } else if (canStack) {
        this._setHintText(`🎯 كوّم +${pending} فوق التكعيبة أو اسحب ${pending}`);
      } else if (canSkipCancel) {
        this._setHintText(`⏭️ توقيف بنفس اللون يلغي +${pending} أو اسحب`);
      } else if (canReverseRedirect) {
        this._setHintText(`🔄 تحويل بنفس اللون يحوّل +${pending} للاعب التالي بعد الانعكاس أو كوّم/اسحب`);
      } else {
        this._setHintText(`🎯 اسحب ${pending} ورقات`);
      }
      return;
    }

    if (me?.cardCount === 1) {
      this._setHintText('🃏 اختر بطاقة للعب أو اسحب من الكومة');
      return;
    }

    const hasPlayable = me?.cards?.some(c => this._canPlayCard(c, this._gameState.currentCard, this._gameState.selectedColor));
    this._setHintText(hasPlayable ? '🃏 اختر بطاقة للعب أو اسحب من الكومة' : '🎯 اسحب ورقة من الكومة');
  }

  _setHintText(text) {
    if (this._lastHintText === text) return;
    this._lastHintText = text;
    const hint = document.getElementById('game-hint');
    if (hint) hint.textContent = text;
  }

  _updateTimer() {
    if (this._isAIMode) {
      const timerEl = document.getElementById('game-timer');
      if (timerEl) timerEl.style.display = 'none';
      return;
    }

    const timerEl = document.getElementById('game-timer');
    if (!timerEl) return;

    const turnStart = this._gameState?.turnStartTime ?? 0;
    if (this._timerInterval && this._lastTimerTurnStart === turnStart) return;
    if (this._timerInterval) clearInterval(this._timerInterval);
    this._lastTimerTurnStart = turnStart;
    this._lastCountdownSecond = -1;
    if (turnStart) {
      this._timeoutSentForTurn = null;
    }

    const update = () => {
      if (!this._dealComplete || !this._gameState?.turnStartTime || this._gameState.phase !== GAME_PHASES.PLAYING) {
        timerEl.textContent = '--:--';
        timerEl.classList.remove('game__timer--warning');
        return;
      }

      const turnStartTime = this._gameState.turnStartTime;
      const elapsed = Date.now() - turnStartTime;
      const remaining = Math.max(0, TURN_TIMEOUT - elapsed);
      const secs = Math.ceil(remaining / 1000);
      timerEl.textContent = formatTime(remaining);

      if (secs <= 10 && secs > 0) {
        timerEl.classList.add('game__timer--warning');
        if (this._lastCountdownSecond !== secs) {
          this._lastCountdownSecond = secs;
          soundManager.playCountdown();
        }
      } else {
        timerEl.classList.remove('game__timer--warning');
        this._lastCountdownSecond = -1;
      }

      if (remaining <= 0) {
        timerEl.textContent = '00:00';
        const turnKey = `${turnStartTime}`;
        if (this._isMyTurn() && this._timeoutSentForTurn !== turnKey) {
          this._timeoutSentForTurn = turnKey;
          eventBus.emit('turn:timeout', {
            playerId: this._playerId,
            turnStartTime
          });
        }
      }
    };

    update();
    this._timerInterval = setInterval(update, 1000);
  }

  _updateDirection() {
    const arrow = document.getElementById('direction-arrow');
    if (!arrow) return;
    const sym = this._gameState?.direction === 1 ? '→' : '←';
    if (arrow.textContent !== sym) arrow.textContent = sym;
  }

  _updateUnoButton() {
    const btn = document.getElementById('btn-uno');
    if (!btn || !this._gameState?.players) return;

    const me = this._gameState.players.find(p => p.id === this._playerId);
    const disabled = !me || me.cardCount !== 1;
    btn.classList.toggle('btn--disabled', disabled);
  }

  _updateRulesSummary() {
    const el = document.getElementById('active-rules-summary');
    if (!el) return;
    const rules = this._gameState?.getRules?.() || this._gameState?.rules || {};
    const text = `${PLAY_RULES_SUMMARY_AR} — الهدف ${rules.targetScore || 500} نقطة`;
    if (el.textContent !== text) el.textContent = text;
  }

  _showColorPicker(onSelect) {
    const container = document.getElementById('color-picker-container');
    if (!container) return;
    const picker = CardRenderer.renderColorPicker(onSelect);
    container.appendChild(picker);
  }

  showWin(data) {
    const modal = document.getElementById('win-modal');
    const nameEl = document.getElementById('winner-name');
    const scoresEl = document.getElementById('win-scores');


    const getName = (id) => {
      const p = this._gameState?.players?.find(p => p.id === id);
      return p ? p.name : (id === this._playerId ? 'You' : id);
    };

    const titleEl = modal?.querySelector('.win-title');
    const rankings = data.rankings?.length
      ? data.rankings
      : Object.entries(data.scores || {})
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
    const winnerId = data.winnerId || rankings[0];
    const loserId = data.loserId || rankings[rankings.length - 1];

    if (titleEl) titleEl.textContent = '🏆 انتهت اللعبة! 🏆';
    if (nameEl) nameEl.textContent = `${getName(winnerId)} — المركز الأول`;

    if (scoresEl && rankings.length) {
      scoresEl.innerHTML = rankings.map((id, i) => {
        const isFirst = i === 0;
        const isLoser = id === loserId;
        let suffix = '';
        if (isFirst) suffix = ' — 🥇 الأول';
        else if (isLoser) suffix = ' — ❌ الخاسر';
        return `
          <div class="score-row ${isFirst ? 'score-row--winner' : ''} ${isLoser ? 'score-row--loser' : ''}">
            <span>${i + 1}. ${getName(id)}${suffix}</span>
          </div>
        `;
      }).join('');
    }

    if (modal) modal.classList.add('modal--visible');

    if (winnerId === this._playerId) {
      soundManager.playWin();
      this._particles.celebrate('You Win! 🎉');
    } else if (loserId === this._playerId) {
      soundManager.playLose();
      this._particles.celebrate('You Lost!');
    } else {
      soundManager.playWin();
      this._particles.celebrate(`${getName(winnerId)} Won!`);
    }
  }

  _canInteract() {
    return this._dealComplete && !this._dealingInProgress;
  }

  _isMyTurn() {
    if (!this._canInteract()) return false;
    if (this._gameState?.phase !== GAME_PHASES.PLAYING) return false;
    if (!this._gameState?.players || this._gameState?.currentPlayerIndex === undefined) return false;
    const me = this._gameState.players.find(p => p.id === this._playerId);
    if (me?.finished || this._gameState.finishedPlayers?.includes?.(this._playerId)) return false;
    const currentPlayer = this._gameState.players[this._gameState.currentPlayerIndex];
    return currentPlayer?.id === this._playerId;
  }

  _isCurrentPlayer(playerId) {
    if (!this._gameState?.players) return false;
    const currentPlayer = this._gameState.players[this._gameState.currentPlayerIndex];
    return currentPlayer?.id === playerId;
  }

  _isMyUnoTurn() {
    if (!this._gameState?.players) return false;
    const me = this._gameState.players.find(p => p.id === this._playerId);
    return me && me.cardCount === 1;
  }

  _canPlayCard(card, currentCard, selectedColor) {
    if (this._gameState?.mustDraw) {
      const me = this._gameState?.players?.find(p => p.id === this._playerId);
      return GameRules.canPlayDuringPenalty(
        card,
        currentCard,
        selectedColor,
        me?.cards || [],
        this._gameState.rules,
        this._gameState.penaltyStackCardType
      );
    }
    const me = this._gameState?.players?.find(p => p.id === this._playerId);
    return GameRules.canPlayCard(card, currentCard, selectedColor, me?.cards || [], this._gameState?.rules);
  }

  _cleanup() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers = [];
    this._handCardData = null;
    this._uiSnapshot = null;
    this._drawPileKey = null;
    this._lastDiscardHistoryKey = null;
    this._lastHintText = '';
    this._lastPlayKey = '';
    this._lastTimerTurnStart = null;
    this._lastCountdownSecond = -1;
    this._drawAnimatingIds = new Set();
    this._localPlayInFlight = null;
    this._dealComplete = false;
    this._dealingInProgress = false;
    this._revealHandAfterDeal = false;
    const hand = document.getElementById('player-hand');
    if (hand && this._handClickHandler) {
      hand.removeEventListener('click', this._handClickHandler);
      this._handClickHandler = null;
    }
  }
}
