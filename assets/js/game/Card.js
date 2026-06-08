import { COLORS, CARD_TYPES } from '../core/Constants.js';

let globalCardId = 0;

export class Card {
  constructor(type, color = null, value = null) {
    this.id = ++globalCardId;
    this.type = type;
    this.color = color;
    this.value = value;
    this.isWild = type === CARD_TYPES.WILD || type === CARD_TYPES.WILD_DRAW_FOUR;
  }

  get displayName() {
    if (this.type === CARD_TYPES.NUMBER) {
      const emoji = COLORS[this.color.toUpperCase()]?.symbol || '';
      return `${emoji} ${this.value}`;
    }
    const emoji = this.color ? COLORS[this.color.toUpperCase()]?.symbol || '' : '⭐';
    const names = {
      [CARD_TYPES.SKIP]: '⊘ Skip',
      [CARD_TYPES.REVERSE]: '⟳ Reverse',
      [CARD_TYPES.DRAW_TWO]: '+2 Draw',
      [CARD_TYPES.WILD]: '⭐ Wild',
      [CARD_TYPES.WILD_DRAW_FOUR]: '+4 Wild'
    };
    return `${emoji} ${names[this.type] || this.type}`;
  }

  get score() {
    const values = { skip: 20, reverse: 20, draw2: 20, wild: 50, wild4: 50 };
    return this.type === CARD_TYPES.NUMBER ? this.value : (values[this.type] || 0);
  }

  get colorHex() {
    if (!this.color) return '#2C3E50';
    return COLORS[this.color.toUpperCase()]?.hex || '#2C3E50';
  }

  matches(card, selectedColor = null) {
    if (!card) return false;
    if (this.isWild) return true;

    const effectiveColor = card.isWild ? selectedColor : card.color;
    if (this.color === effectiveColor) return true;
    if (this.type !== CARD_TYPES.NUMBER && this.type === card.type) return true;
    if (this.type === CARD_TYPES.NUMBER && card.type === CARD_TYPES.NUMBER && this.value === card.value) return true;

    return false;
  }

  serialize() {
    return { id: this.id, type: this.type, color: this.color, value: this.value };
  }

  static deserialize(data) {
    const card = new Card(data.type, data.color, data.value);
    card.id = data.id;
    if (data.id > globalCardId) globalCardId = data.id;
    return card;
  }
}
