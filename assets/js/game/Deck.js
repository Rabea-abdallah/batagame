import { Card } from './Card.js';
import { COLORS, CARD_TYPES } from '../core/Constants.js';

export class Deck {
  constructor() {
    this._cards = [];
    this._discardPile = [];
  }

  build() {
    this._cards = [];
    const colorKeys = Object.keys(COLORS);

    for (const colorKey of colorKeys) {
      const color = colorKey.toLowerCase();

      this._cards.push(new Card(CARD_TYPES.NUMBER, color, 0));

      for (let i = 1; i <= 9; i++) {
        this._cards.push(new Card(CARD_TYPES.NUMBER, color, i));
        this._cards.push(new Card(CARD_TYPES.NUMBER, color, i));
      }

      this._cards.push(new Card(CARD_TYPES.SKIP, color));
      this._cards.push(new Card(CARD_TYPES.SKIP, color));

      this._cards.push(new Card(CARD_TYPES.REVERSE, color));
      this._cards.push(new Card(CARD_TYPES.REVERSE, color));

      this._cards.push(new Card(CARD_TYPES.DRAW_TWO, color));
      this._cards.push(new Card(CARD_TYPES.DRAW_TWO, color));
    }

    for (let i = 0; i < 4; i++) {
      this._cards.push(new Card(CARD_TYPES.WILD));
      this._cards.push(new Card(CARD_TYPES.WILD_DRAW_FOUR));
    }

    return this;
  }

  shuffle() {
    for (let i = this._cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._cards[i], this._cards[j]] = [this._cards[j], this._cards[i]];
    }
    return this;
  }

  draw(count = 1) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (this._cards.length === 0) {
        this._recycleDiscardPile();
        if (this._cards.length === 0) break;
      }
      drawn.push(this._cards.pop());
    }
    return drawn;
  }

  drawOne() {
    if (this._cards.length === 0) {
      this._recycleDiscardPile();
    }
    return this._cards.length > 0 ? this._cards.pop() : null;
  }

  _recycleDiscardPile() {
    if (this._discardPile.length <= 1) return;

    const topCard = this._discardPile.pop();
    this._cards = [...this._discardPile];
    this._discardPile = [topCard];
    this.shuffle();
  }

  discard(card) {
    this._discardPile.push(card);
  }

  get topCard() {
    return this._discardPile[this._discardPile.length - 1] || null;
  }

  get remaining() {
    return this._cards.length;
  }

  serialize() {
    return {
      cards: this._cards.map(c => c.serialize()),
      discardPile: this._discardPile.map(c => c.serialize())
    };
  }

  static deserialize(data) {
    const deck = new Deck();
    deck._cards = data.cards.map(c => Card.deserialize(c));
    deck._discardPile = data.discardPile.map(c => Card.deserialize(c));
    return deck;
  }
}
