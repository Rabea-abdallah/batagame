import { COLORS, CARD_TYPES, MAX_PLAYERS, MIN_PLAYERS } from './Constants.js';

export class Validator {
  static isValidCard(card) {
    if (!card || typeof card !== 'object') return false;
    if (!card.id || !card.type) return false;
    if (card.type === CARD_TYPES.NUMBER) {
      if (typeof card.value !== 'number' || card.value < 0 || card.value > 9) return false;
      if (!card.color || !COLORS[card.color.toUpperCase()]) return false;
    }
    if ([CARD_TYPES.SKIP, CARD_TYPES.REVERSE, CARD_TYPES.DRAW_TWO].includes(card.type)) {
      if (!card.color || !COLORS[card.color.toUpperCase()]) return false;
    }
    if ([CARD_TYPES.WILD, CARD_TYPES.WILD_DRAW_FOUR].includes(card.type)) {
      if (card.color) return false;
    }
    return true;
  }

  static isValidMove(card, currentCard, selectedColor = null) {
    if (!card || !currentCard) return false;

    const isWild = card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR;
    const isCurrentWild = currentCard.type === CARD_TYPES.WILD || currentCard.type === CARD_TYPES.WILD_DRAW_FOUR;

    if (isWild) return true;

    const effectiveColor = isCurrentWild ? selectedColor : currentCard.color;

    if (card.color === effectiveColor) return true;
    if (card.type === currentCard.type && card.type !== CARD_TYPES.NUMBER) return true;
    if (card.type === CARD_TYPES.NUMBER && currentCard.type === CARD_TYPES.NUMBER && card.value === currentCard.value) return true;

    return false;
  }

  static isValidPlayerCount(count) {
    return Number.isInteger(count) && count >= MIN_PLAYERS && count <= MAX_PLAYERS;
  }

  static isValidPlayerName(name) {
    return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 20;
  }

  static isValidRoomCode(code) {
    return typeof code === 'string' && /^[A-Z0-9]{4,6}$/i.test(code);
  }

  static isValidColor(color) {
    return color && COLORS[color.toUpperCase()] !== undefined;
  }

  static checkDuplicateEvent(eventId, processedEvents) {
    if (processedEvents.has(eventId)) return true;
    processedEvents.add(eventId);
    setTimeout(() => processedEvents.delete(eventId), 5000);
    return false;
  }

  static validateGameState(state) {
    if (!state || typeof state !== 'object') return false;
    if (!Array.isArray(state.players) || state.players.length < 1) return false;
    if (!state.currentCard) return false;
    return true;
  }

  static generateEventId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
