import { eventBus } from '../core/EventSystem.js';
import { EVENTS } from '../core/Constants.js';
import { SessionManager } from '../storage/SessionManager.js';
import { LocalStorage } from '../storage/LocalStorage.js';
import { Notification } from './Notification.js';
import { soundManager } from '../utils/SoundManager.js';
import { isDevEnvironment } from '../dev/isDevEnvironment.js';

export class HomeUI {
  constructor() {
    this._container = document.getElementById('app');
    this._playerName = SessionManager.getPlayerName();
    this._devPenaltyMode = false;
    this._init();
  }

  _init() {
    this._render();
    this._bindEvents();
    this._checkReconnect();
  }

  _render() {
    const lastRoom = LocalStorage.getLastRoom();
    const settings = LocalStorage.getSettings();

    this._container.innerHTML = `
      <div class="home">
        <div class="home__header">
          <div class="home__logo">
            <span class="home__logo-icon">🦆</span>
            <h1 class="home__logo-title">بطّة أونو</h1>
            <p class="home__logo-subtitle">Batta UNO</p>
          </div>
        </div>

        <div class="home__content">
          <div class="home__card home__card--create" id="btn-create">
            <div class="home__card-icon">🏠</div>
            <h2>Create Room</h2>
            <p>Start a new game and invite friends</p>
          </div>

          <div class="home__card home__card--join" id="btn-join">
            <div class="home__card-icon">🚪</div>
            <h2>Join Room</h2>
            <p>Enter a room code to join</p>
          </div>

          <div class="home__card home__card--ai" id="btn-ai">
            <div class="home__card-icon">🤖</div>
            <h2>Practice vs AI</h2>
            <p>Play against computer players</p>
          </div>

          ${isDevEnvironment() ? `
          <div class="home__card home__card--dev" id="btn-dev-penalty">
            <div class="home__card-icon">🧪</div>
            <h2>اختبار قواعد (DEV)</h2>
            <p>10 أوراق: +2، تحويل، توقيف — للبوت واللاعب</p>
          </div>
          ` : ''}

          <div class="home__card home__card--settings" id="btn-settings">
            <div class="home__card-icon">⚙️</div>
            <h2>Settings</h2>
            <p>Customize your experience</p>
          </div>

          <div class="home__card home__card--help" id="btn-help">
            <div class="home__card-icon">❓</div>
            <h2>How to Play</h2>
            <p>Quick guide to UNO rules</p>
          </div>
        </div>

        <div class="home__footer">
          <div class="home__player-name">
            <label for="player-name-input">Your Name:</label>
            <input type="text" id="player-name-input" value="${this._escapeHtml(this._playerName)}" maxlength="20" placeholder="Enter your name...">
          </div>
          <div class="home__cards-setting">
            <label>Cards per player:</label>
            <button class="btn btn--icon btn--small" id="btn-home-cards-minus">−</button>
            <strong id="home-cards-count">${settings.initialCards || 7}</strong>
            <button class="btn btn--icon btn--small" id="btn-home-cards-plus">+</button>
          </div>
        </div>

        ${lastRoom ? `
        <div class="home__reconnect" id="reconnect-bar">
          <span>Reconnect to last room: <strong>${lastRoom}</strong></span>
          <button class="btn btn--small" id="btn-reconnect">Reconnect</button>
        </div>
        ` : ''}
      </div>

      <!-- AI Setup Modal -->
      <div class="modal" id="ai-setup-modal">
        <div class="modal__content">
          <h2>Practice vs AI</h2>
          <p class="modal__hint">اختر عدد البوتات قبل بدء اللعبة. كلما زاد العدد أصبحت الطاولة أصعب وأكثر ازدحامًا.</p>
          <div class="home__bot-setting">
            <label>Number of Bots:</label>
            <button class="btn btn--icon btn--small" id="btn-ai-bots-minus">−</button>
            <strong id="ai-bots-count">${settings.aiBotCount || 3}</strong>
            <button class="btn btn--icon btn--small" id="btn-ai-bots-plus">+</button>
          </div>
          <div class="modal__actions">
            <button class="btn btn--primary" id="btn-ai-start">Start Game</button>
            <button class="btn btn--secondary modal-close">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Join Room Modal -->
      <div class="modal" id="join-modal">
        <div class="modal__content">
          <h2>Join Room</h2>
          <input type="text" id="room-code-input" placeholder="Enter Room Code" maxlength="6" class="input input--large input--center" style="text-transform:uppercase;letter-spacing:4px;font-weight:bold;">
          <div class="modal__actions">
            <button class="btn btn--primary" id="btn-join-submit">Join</button>
            <button class="btn btn--secondary modal-close">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Settings Modal -->
      <div class="modal" id="settings-modal">
        <div class="modal__content">
          <h2>Settings</h2>
          <div class="settings-group">
            <label class="settings-row">
              <span>Sound Effects</span>
              <input type="checkbox" ${settings.soundEnabled ? 'checked' : ''} id="setting-sound">
            </label>
            <label class="settings-row">
              <span>Animations</span>
              <input type="checkbox" ${settings.animationsEnabled !== false ? 'checked' : ''} id="setting-animations">
            </label>
            <label class="settings-row">
              <span>Volume: <span id="volume-value">${Math.round(LocalStorage.getVolume() * 100)}%</span></span>
              <input type="range" min="0" max="100" value="${Math.round(LocalStorage.getVolume() * 100)}" id="setting-volume">
            </label>
            <label class="settings-row">
              <span>Starting Cards: <span id="initial-cards-value">${settings.initialCards || 7}</span></span>
              <input type="range" min="3" max="15" value="${settings.initialCards || 7}" id="setting-initial-cards">
            </label>
          </div>
          <div class="modal__actions">
            <button class="btn btn--secondary modal-close">Close</button>
          </div>
        </div>
      </div>

      <!-- Help Modal -->
      <div class="modal" id="home-help-modal">
        <div class="modal__content modal__content--rules">
          <h2>📖 كيف تلعب بطّة أونو؟</h2>
          <div class="rules-body">
            <h3>🎯 الهدف</h3>
            <p>تخلص من كل أوراقك قبل اللاعبين الآخرين. آخر لاعب يتبقى معه أوراق يخسر.</p>

            <h3>🃏 طريقة اللعب</h3>
            <p>في دورك، اختر ورقة من يدك تطابق <strong>اللون</strong> أو <strong>الرقم</strong> أو <strong>النوع</strong> (سكيب، عكس، +2) لآخر ورقة في كومة الطرد.</p>
            <p>إذا ما عندك ورقة مناسبة، اسحب ورقة من كومة السحب. إذا كانت الورقة المسحوبة مناسبة، تقدر تلعبها فوراً.</p>

            <h3>⭐ البطاقات الخاصة</h3>
            <ul>
              <li><strong>⏭️ سكيب (Skip)</strong> — يلغي دور اللاعب التالي.</li>
              <li><strong>🔄 عكس (Reverse)</strong> — يعكس اتجاه اللعب.</li>
              <li><strong>➕2 سحب 2</strong> — اللاعب التالي يسحب ورقتين ويلغى دوره. +2 تتكدس على +2.</li>
              <li><strong>⭐ وايلد (Wild)</strong> — اختر أي لون تلعب به.</li>
              <li><strong>➕4 وايلد سحب 4 (أبو 4)</strong> — يُلعب في أي وقت. يغيّر اللون واللاعب التالي يسحب 4. يمكن كوّم أبو 4 فوق أبو 4.</li>
            </ul>

            <h3>📦 التكديس (+2 / +4)</h3>
            <ul>
              <li><strong>عقوبة غير مسحوبة:</strong> أبو 4 دائماً؛ +2 فوق +2 بأي لون؛ +2 فوق أبو 4 بنفس لون الـ Wild؛ توقيف وتحويل بنفس لون الكومة.</li>
              <li><strong>بعد سحب العقوبة:</strong> أبو 4 أو Wild أو ورقة بنفس اللون؛ +2 فوق +2 بأي لون.</li>
              <li>أبو 4 يُلعب في أي وقت ويمكن كوّمه فوق أبو 4 سابق.</li>
            </ul>

            <h3>🏁 نهاية اللعبة</h3>
            <p>اللعبة لا تنتهي عند أول لاعب يفرغ يده. تستمر حتى يبقى <strong>لاعب واحد</strong> بأوراق — وهو الخاسر.</p>

            <h3>🦆 نداء UNO</h3>
            <p>لما يبقى عندك ورقة وحدة، اضغط زر <strong>UNO</strong> قبل ما تلعب آخر ورقة عشان تنبه الجميع. إذا نسيته، تسحب ورقتين جزاء.</p>

            <h3>⚙️ الإعدادات</h3>
            <p>من شاشة الإعدادات تقدر تتحكم في <strong>الصوت</strong>، <strong>الأنيميشن</strong>، و<strong>عدد أوراق البداية</strong> (من 3 إلى 15).</p>
          </div>
          <button class="btn btn--primary" id="btn-help-close">فهمت ✅</button>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    document.getElementById('btn-create')?.addEventListener('click', () => this._onCreateRoom());
    document.getElementById('btn-join')?.addEventListener('click', () => this._onJoinClick());
    document.getElementById('btn-ai')?.addEventListener('click', () => this._onPlayAI(false));
    document.getElementById('btn-dev-penalty')?.addEventListener('click', () => this._onPlayAI(true));
    document.getElementById('btn-settings')?.addEventListener('click', () => this._onSettingsClick());
    document.getElementById('btn-help')?.addEventListener('click', () => this._onHelpClick());
    document.getElementById('btn-help-close')?.addEventListener('click', () => this._closeModals());
    document.getElementById('btn-ai-start')?.addEventListener('click', () => this._onAIStart());
    document.getElementById('btn-ai-bots-plus')?.addEventListener('click', () => this._adjustAIBots(1));
    document.getElementById('btn-ai-bots-minus')?.addEventListener('click', () => this._adjustAIBots(-1));
    document.getElementById('btn-join-submit')?.addEventListener('click', () => this._onJoinSubmit());
    document.getElementById('btn-reconnect')?.addEventListener('click', () => this._onReconnect());
    document.getElementById('btn-home-cards-plus')?.addEventListener('click', () => this._adjustHomeCards(1));
    document.getElementById('btn-home-cards-minus')?.addEventListener('click', () => this._adjustHomeCards(-1));

    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this._closeModals());
    });

    const nameInput = document.getElementById('player-name-input');
    nameInput?.addEventListener('change', () => {
      const name = nameInput.value.trim();
      if (name) {
        this._playerName = name;
        SessionManager.savePlayerName(name);
      }
    });

    document.getElementById('setting-sound')?.addEventListener('change', (e) => {
      soundManager.setEnabled(e.target.checked);
    });

    document.getElementById('setting-animations')?.addEventListener('change', (e) => {
      const settings = LocalStorage.getSettings();
      settings.animationsEnabled = e.target.checked;
      LocalStorage.setSettings(settings);
    });

    document.getElementById('setting-volume')?.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value) / 100;
      soundManager.setVolume(vol);
      document.getElementById('volume-value').textContent = `${e.target.value}%`;
    });

    document.getElementById('setting-initial-cards')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('initial-cards-value').textContent = val;
      const settings = LocalStorage.getSettings();
      settings.initialCards = val;
      LocalStorage.setSettings(settings);
    });

    const roomInput = document.getElementById('room-code-input');
    roomInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._onJoinSubmit();
    });

    nameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nameInput.blur();
    });
  }

  _onCreateRoom() {
    const name = this._getPlayerName();
    if (!name) return Notification.warning('Please enter your name');

    soundManager.playButtonClick();
    eventBus.emit('navigate:create-room', { playerName: name });
  }

  _onJoinClick() {
    soundManager.playButtonClick();
    document.getElementById('join-modal')?.classList.add('modal--visible');
    setTimeout(() => document.getElementById('room-code-input')?.focus(), 100);
  }

  _onJoinSubmit() {
    const name = this._getPlayerName();
    if (!name) return Notification.warning('Please enter your name');

    const code = document.getElementById('room-code-input')?.value?.trim().toUpperCase();
    if (!code || code.length < 4) return Notification.error('Please enter a valid room code');

    soundManager.playButtonClick();
    this._closeModals();
    eventBus.emit('navigate:join-room', { roomCode: code, playerName: name });
  }

  _onPlayAI(devPenaltyTest = false) {
    const name = this._getPlayerName();
    if (!name) return Notification.warning('Please enter your name');

    this._devPenaltyMode = devPenaltyTest;
    soundManager.playButtonClick();
    const modal = document.getElementById('ai-setup-modal');
    const title = modal?.querySelector('h2');
    const hint = modal?.querySelector('.modal__hint');
    if (title) {
      title.textContent = devPenaltyTest ? 'اختبار قواعد العقوبات (DEV)' : 'Practice vs AI';
    }
    if (hint) {
      hint.textContent = devPenaltyTest
        ? 'كل لاعب وبوت: أبو 4 + Wild + 8 أوراق (+2/تحويل/توقيف) — لاختبار العقوبات والألوان.'
        : 'اختر عدد البوتات قبل بدء اللعبة. كلما زاد العدد أصبحت الطاولة أصعب وأكثر ازدحامًا.';
    }
    modal?.classList.add('modal--visible');
  }

  _onAIStart() {
    const name = this._getPlayerName();
    if (!name) return Notification.warning('Please enter your name');

    const botCount = LocalStorage.getSettings().aiBotCount || 3;
    soundManager.playButtonClick();
    this._closeModals();
    eventBus.emit('navigate:ai-game', {
      playerName: name,
      botCount,
      devPenaltyTest: this._devPenaltyMode
    });
    this._devPenaltyMode = false;
  }

  _onSettingsClick() {
    soundManager.playButtonClick();
    document.getElementById('settings-modal')?.classList.add('modal--visible');
  }

  _onHelpClick() {
    soundManager.playButtonClick();
    document.getElementById('home-help-modal')?.classList.add('modal--visible');
  }

  _onReconnect() {
    const name = this._getPlayerName();
    if (!name) return;
    soundManager.playButtonClick();
    eventBus.emit('navigate:reconnect', { playerName: name });
  }

  _checkReconnect() {
    SessionManager.hasReconnectSession().then(has => {
      if (has) {
        const lastRoom = LocalStorage.getLastRoom();
        if (lastRoom) {
          Notification.info(`You have a saved session. Reconnect to room ${lastRoom}?`, 5000);
        }
      }
    });
  }

  _getPlayerName() {
    return document.getElementById('player-name-input')?.value?.trim() || this._playerName;
  }

  _adjustHomeCards(delta) {
    const settings = LocalStorage.getSettings();
    const current = settings.initialCards || 7;
    const next = Math.max(3, Math.min(15, current + delta));
    settings.initialCards = next;
    LocalStorage.setSettings(settings);
    const el = document.getElementById('home-cards-count');
    if (el) el.textContent = next;
  }

  _adjustAIBots(delta) {
    const settings = LocalStorage.getSettings();
    const current = settings.aiBotCount || 3;
    const next = Math.max(1, Math.min(9, current + delta));
    settings.aiBotCount = next;
    LocalStorage.setSettings(settings);
    const el = document.getElementById('ai-bots-count');
    if (el) el.textContent = next;
  }

  _closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('modal--visible'));
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
