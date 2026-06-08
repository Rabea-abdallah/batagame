import { GameRules } from './GameRules.js';
import { CARD_TYPES } from '../core/Constants.js';

export class BotAI {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty;
    this.thinkingTime = { easy: 2500, medium: 2500, hard: 2500 };
  }

  chooseCard(hand, currentCard, selectedColor, rules = null) {
    const playable = GameRules.getPlayableCards(hand, currentCard, selectedColor, rules);
    if (playable.length === 0) return null;

    switch (this.difficulty) {
      case 'easy':
        return this._chooseEasy(playable, hand);
      case 'hard':
        return this._chooseHard(playable, hand, currentCard, selectedColor, rules);
      default:
        return this._chooseMedium(playable, hand);
    }
  }

  chooseColor(hand) {
    const colorCount = {};
    for (const card of hand) {
      if (card.color) {
        colorCount[card.color] = (colorCount[card.color] || 0) + 1;
      }
    }
    let bestColor = 'red';
    let maxCount = 0;
    for (const [color, count] of Object.entries(colorCount)) {
      if (count > maxCount) {
        maxCount = count;
        bestColor = color;
      }
    }
    return bestColor;
  }

  shouldCallUno(hand) {
    return hand.length <= 1;
  }

  getThinkingTime() {
    return this.thinkingTime[this.difficulty] + Math.random() * 500;
  }

  chooseStackCard(hand, currentCard, rules = null) {
    return this.choosePenaltyPlay(hand, currentCard, null, rules);
  }

  choosePenaltyPlay(hand, currentCard, selectedColor = null, rules = null, penaltyStackType = null) {
    if (!currentCard) return null;
    const options = GameRules.getPlayableCards(
      hand, currentCard, selectedColor, rules, true, penaltyStackType
    );
    if (options.length === 0) return null;

    const stackRef = GameRules.getPenaltyStackReference(currentCard, penaltyStackType);
    const stackable = options.filter(c =>
      penaltyStackType
        ? GameRules.canStackPenaltyDraw(c, penaltyStackType, currentCard, selectedColor, rules)
        : GameRules.canStackDraw(c, stackRef, rules)
    );
    if (stackable.length > 0) {
      const wild4 = stackable.filter(c => c.type === CARD_TYPES.WILD_DRAW_FOUR);
      if (wild4.length > 0) return wild4[0];
      const draw2 = stackable.filter(c => c.type === CARD_TYPES.DRAW_TWO);
      if (draw2.length > 0) return draw2[0];
      return stackable[0];
    }

    // Prefer drawing the accumulated penalty; avoid random skip/reverse that cancel the stack chain.
    return null;
  }

  _chooseEasy(playable, hand) {
    const nonWild = playable.filter(c => !c.isWild);
    if (nonWild.length > 0) {
      return nonWild[Math.floor(Math.random() * nonWild.length)];
    }
    return playable[Math.floor(Math.random() * playable.length)];
  }

  _chooseMedium(playable, hand) {
    const sorted = [...playable].sort((a, b) => {
      if (a.isWild && !b.isWild) return 1;
      if (!a.isWild && b.isWild) return -1;
      if (a.type !== CARD_TYPES.NUMBER && b.type === CARD_TYPES.NUMBER) return -1;
      if (a.type === CARD_TYPES.NUMBER && b.type !== CARD_TYPES.NUMBER) return 1;
      return b.value - a.value;
    });
    return sorted[0];
  }

  _chooseHard(playable, hand, currentCard, selectedColor, rules = null) {
    const safePlayable = playable.filter(card =>
      card.type !== CARD_TYPES.WILD_DRAW_FOUR ||
      GameRules.canPlayWildDrawFour(hand, currentCard, selectedColor, rules)
    );
    if (safePlayable.length > 0) playable = safePlayable;

    if (hand.length <= 2) {
      const numberCards = playable.filter(c => c.type === CARD_TYPES.NUMBER && c.value <= 3);
      if (numberCards.length > 0) return numberCards[0];
    }

    const sorted = [...playable].sort((a, b) => {
      const aScore = a.isWild ? 30 : (10 - (a.value || 0));
      const bScore = b.isWild ? 30 : (10 - (b.value || 0));
      return bScore - aScore;
    });

    return sorted[0];
  }
}
