export const COLORS = {
  RED: { name: 'red', hex: '#E74C3C', symbol: '🔴' },
  BLUE: { name: 'blue', hex: '#3498DB', symbol: '🔵' },
  GREEN: { name: 'green', hex: '#2ECC71', symbol: '🟢' },
  YELLOW: { name: 'yellow', hex: '#F1C40F', symbol: '🟡' }
};

export const CARD_TYPES = {
  NUMBER: 'number',
  SKIP: 'skip',
  REVERSE: 'reverse',
  DRAW_TWO: 'draw2',
  WILD: 'wild',
  WILD_DRAW_FOUR: 'wild4'
};

export const GAME_PHASES = {
  WAITING: 'waiting',
  STARTING: 'starting',
  PLAYING: 'playing',
  FINISHED: 'finished'
};

export const RULE_PROFILES = {
  OFFICIAL: 'official',
  HOUSE: 'house'
};

/** Canonical rules: room, bots, and DEV test all use the same set. */
export const PLAY_RULES = {
  profile: RULE_PROFILES.HOUSE,
  allowStacking: true,
  allowDrawTwoStacking: true,
  allowWildDrawFourStacking: true,
  enforceWildDrawFour: false,
  allowChallengeWildDrawFour: false,
  allowSkipCancelPenalty: true,
  allowReverseRedirectPenalty: true,
  reverseSkipsInTwoPlayer: true,
  initialActionCardEffect: true,
  unoPenaltyEnabled: true,
  targetScore: 500
};

export const DEFAULT_RULES = { ...PLAY_RULES };

/** Merge saved prefs but always keep gameplay flags from PLAY_RULES. */
export function normalizePlayRules(rules = {}) {
  return {
    ...PLAY_RULES,
    targetScore: Number.isFinite(rules.targetScore) ? rules.targetScore : PLAY_RULES.targetScore
  };
}

/** Canonical rules for bot, room, and dev test — same gameplay everywhere. */
export function getPlayRules(prefs = {}) {
  return normalizePlayRules(prefs);
}

/** Short Arabic summary shown in lobby and in-game rules modal. */
export const PLAY_RULES_SUMMARY_AR =
  'قواعد موحّدة: تكديس +2/+4، أبو 4 في أي وقت، توقيف/تحويل يلغيان العقوبة، إقصاء حتى لاعب واحد، هدف 500 نقطة';

export const EVENTS = {
  // Room events
  ROOM_CREATED: 'room:created',
  ROOM_JOINED: 'room:joined',
  ROOM_LEFT: 'room:left',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  PLAYER_READY: 'player:ready',

  // Game events
  GAME_START: 'game:start',
  GAME_RESTART_REQUEST: 'game:restart-request',
  GAME_OVER: 'game:over',
  TURN_CHANGE: 'turn:change',
  TURN_TIMEOUT: 'turn:timeout',
  DIRECTION_CHANGE: 'direction:change',
  CARD_PLAYED: 'card:played',
  CARD_DRAWN: 'card:drawn',
  COLOR_SELECTED: 'color:selected',
  RULES_UPDATED: 'rules:updated',
  WILD_DRAW_FOUR_CHALLENGE: 'wild4:challenge',
  UNO_PENALTY: 'uno:penalty',
  UNO_CALLED: 'uno:called',
  UNO_FORGOT: 'uno:forgot',
  DECK_SHUFFLED: 'deck:shuffled',

  // Network events
  STATE_SYNC: 'state:sync',
  HOST_MIGRATED: 'host:migrated',
  HEARTBEAT: 'heartbeat',
  RECONNECT: 'reconnect',
  LATENCY_UPDATE: 'latency:update',

  // UI events
  SHOW_NOTIFICATION: 'ui:notification',
  CARD_ANIMATION: 'ui:card:animation',
  PARTICLE_EFFECT: 'ui:particles',
  SOUND_PLAY: 'ui:sound',

  // Anti-cheat
  CHEAT_DETECTED: 'cheat:detected',
  INVALID_MOVE: 'move:invalid',

  // Chat
  CHAT_MESSAGE: 'chat:message'
};

export const INITIAL_CARDS = 7;
export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;
export const TURN_TIMEOUT = 60000;
export const HEARTBEAT_INTERVAL = 3000;
export const RECONNECT_TIMEOUT = 15000;
export const UNO_CALL_WINDOW = 3000;

export const CARD_VALUES = {
  skip: 20,
  reverse: 20,
  draw2: 20,
  wild: 50,
  wild4: 50
};

export const PEERJS_OPTIONS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  }
};
