import { CARD_TYPES, COLORS, getPlayRules } from '../core/Constants.js';

const DEFAULT_RULES = getPlayRules();

export class GameRules {
  static hasDrawTwo(hand = []) {
    return hand.some(card => card.type === CARD_TYPES.DRAW_TWO);
  }

  static canPlayCard(card, currentCard, selectedColor, hand = [], rules = DEFAULT_RULES) {
    rules = getPlayRules(rules);
    if (!card || !currentCard) return false;

    if (this.canPlayOnWildStack(card, currentCard, selectedColor, rules)) return true;

    const isWild = card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR;
    const isCurrentWild = currentCard.type === CARD_TYPES.WILD || currentCard.type === CARD_TYPES.WILD_DRAW_FOUR;

    if (card.type === CARD_TYPES.WILD_DRAW_FOUR) {
      if (this.canStackDraw(card, currentCard, rules)) return true;
      return this.canPlayWildDrawFour(hand, currentCard, selectedColor, rules) ||
        rules.allowChallengeWildDrawFour;
    }

    if (isWild) return true;

    const effectiveColor = isCurrentWild ? selectedColor : currentCard.color;

    if (card.color === effectiveColor) return true;

    if (card.type !== CARD_TYPES.NUMBER && card.type === currentCard.type) return true;

    if (card.type === CARD_TYPES.NUMBER && currentCard.type === CARD_TYPES.NUMBER && card.value === currentCard.value) {
      return true;
    }

    return false;
  }

  /** Reference card type for +2/+4 stacking while a penalty pile is active. */
  static getPenaltyStackReference(currentCard, penaltyStackType = null) {
    if (penaltyStackType) {
      return { type: penaltyStackType };
    }
    return currentCard;
  }

  /** During undrawn penalty: +4 anytime; +2 on +2 any color; skip/reverse match pile color. */
  static canPlayDuringPenalty(card, currentCard, selectedColor, hand = [], rules = DEFAULT_RULES, penaltyStackType = null) {
    rules = getPlayRules(rules);
    if (!card || !currentCard) return false;

    const stackType = penaltyStackType ||
      (currentCard.type === CARD_TYPES.DRAW_TWO ? CARD_TYPES.DRAW_TWO :
        currentCard.type === CARD_TYPES.WILD_DRAW_FOUR ? CARD_TYPES.WILD_DRAW_FOUR :
          null);
    if (!stackType) return false;

    if (this.canStackPenaltyDraw(card, stackType, currentCard, selectedColor, rules)) return true;

    const effectiveColor = this.getPenaltyEffectiveColor(currentCard, selectedColor, stackType);
    if (!effectiveColor || card.color !== effectiveColor) return false;

    if (rules.allowSkipCancelPenalty && card.type === CARD_TYPES.SKIP) return true;
    if (rules.allowReverseRedirectPenalty && card.type === CARD_TYPES.REVERSE) return true;

    return false;
  }

  /** Effective color for skip/reverse on a penalty pile (+4 uses wild color, +2 uses pile color). */
  static getPenaltyEffectiveColor(currentCard, selectedColor, penaltyStackType = null) {
    if (penaltyStackType === CARD_TYPES.WILD_DRAW_FOUR) {
      return selectedColor;
    }
    return this.getEffectiveColor(currentCard, selectedColor);
  }

  /** On top of Wild +4 after draw: only another +4 ignores wild color; skip/reverse need matching color. */
  static canPlayOnWildStack(card, currentCard, selectedColor, rules = DEFAULT_RULES) {
    rules = getPlayRules(rules);
    if (!rules.allowWildDrawFourStacking || !currentCard || currentCard.type !== CARD_TYPES.WILD_DRAW_FOUR) {
      return false;
    }
    if (card.type === CARD_TYPES.WILD_DRAW_FOUR) return true;
    if (card.type === CARD_TYPES.SKIP || card.type === CARD_TYPES.REVERSE) {
      return !!selectedColor && card.color === selectedColor;
    }
    return false;
  }

  static hasPlayableCard(hand, currentCard, selectedColor, rules = DEFAULT_RULES, mustDraw = false, penaltyStackType = null) {
    if (mustDraw) {
      return hand.some(card => this.canPlayDuringPenalty(card, currentCard, selectedColor, hand, rules, penaltyStackType));
    }
    return hand.some(card => this.canPlayCard(card, currentCard, selectedColor, hand, rules));
  }

  static getPlayableCards(hand, currentCard, selectedColor, rules = DEFAULT_RULES, mustDraw = false, penaltyStackType = null) {
    if (mustDraw) {
      return hand.filter(card => this.canPlayDuringPenalty(card, currentCard, selectedColor, hand, rules, penaltyStackType));
    }
    return hand.filter(card => this.canPlayCard(card, currentCard, selectedColor, hand, rules));
  }

  static getEffectiveColor(currentCard, selectedColor) {
    if (!currentCard) return null;
    const isCurrentWild = currentCard.type === CARD_TYPES.WILD || currentCard.type === CARD_TYPES.WILD_DRAW_FOUR;
    return isCurrentWild ? selectedColor : currentCard.color;
  }

  static canPlayWildDrawFour(hand, currentCard, selectedColor, rules = DEFAULT_RULES) {
    rules = getPlayRules(rules);

    if (!rules.enforceWildDrawFour) return true;

    if (rules.allowWildDrawFourStacking && currentCard?.type === CARD_TYPES.WILD_DRAW_FOUR) {
      return true;
    }
    const effectiveColor = this.getEffectiveColor(currentCard, selectedColor);
    if (!effectiveColor) return true;
    return !hand.some(card =>
      card.type !== CARD_TYPES.WILD &&
      card.type !== CARD_TYPES.WILD_DRAW_FOUR &&
      card.color === effectiveColor
    );
  }

  /** Undrawn penalty stack: +4 anytime; +2 on +2 any color; +2 on +4 matches wild color. */
  static canStackPenaltyDraw(card, penaltyStackType, currentCard, selectedColor, rules = DEFAULT_RULES) {
    rules = getPlayRules(rules);
    if (!rules.allowStacking || !card || !penaltyStackType || !currentCard) return false;
    if (penaltyStackType !== CARD_TYPES.DRAW_TWO && penaltyStackType !== CARD_TYPES.WILD_DRAW_FOUR) {
      return false;
    }
    if (card.type === CARD_TYPES.WILD_DRAW_FOUR) return rules.allowWildDrawFourStacking;
    if (card.type === CARD_TYPES.DRAW_TWO) {
      if (!rules.allowDrawTwoStacking) return false;
      if (penaltyStackType === CARD_TYPES.DRAW_TWO) return true;
      const effectiveColor = this.getPenaltyEffectiveColor(currentCard, selectedColor, penaltyStackType);
      return !!effectiveColor && card.color === effectiveColor;
    }
    return false;
  }

  static canStackDraw(card, currentCard, rules = DEFAULT_RULES) {
    rules = getPlayRules(rules);
    if (!rules.allowStacking || !card || !currentCard) return false;
    if (currentCard.type === CARD_TYPES.DRAW_TWO) {
      return rules.allowDrawTwoStacking && card.type === CARD_TYPES.DRAW_TWO;
    }
    if (currentCard.type === CARD_TYPES.WILD_DRAW_FOUR) {
      return rules.allowWildDrawFourStacking && card.type === CARD_TYPES.WILD_DRAW_FOUR;
    }
    return false;
  }

  static skipCancelsPenalty(card, currentCard, selectedColor, rules = DEFAULT_RULES, penaltyStackType = null) {
    rules = getPlayRules(rules);
    if (!rules.allowSkipCancelPenalty || !card || card.type !== CARD_TYPES.SKIP) return false;
    const effectiveColor = this.getPenaltyEffectiveColor(currentCard, selectedColor, penaltyStackType);
    return !!effectiveColor && card.color === effectiveColor;
  }

  static reverseRedirectsPenalty(card, currentCard, selectedColor, rules = DEFAULT_RULES, penaltyStackType = null) {
    rules = getPlayRules(rules);
    if (!rules.allowReverseRedirectPenalty || !card || card.type !== CARD_TYPES.REVERSE) return false;
    const effectiveColor = this.getPenaltyEffectiveColor(currentCard, selectedColor, penaltyStackType);
    return !!effectiveColor && card.color === effectiveColor;
  }

  static getPreviousPlayerIndex(currentIndex, direction, playerCount) {
    return (currentIndex - direction + playerCount) % playerCount;
  }

  static calculateNextPlayer(currentIndex, direction, playerCount) {
    return (currentIndex + direction + playerCount) % playerCount;
  }

  static getDirectionAfterReverse(currentDirection, playerCount, rules = DEFAULT_RULES) {
    rules = getPlayRules(rules);
    if (playerCount === 2 && rules.reverseSkipsInTwoPlayer) return currentDirection;
    return currentDirection * -1;
  }

  static shouldSkipNext(card) {
    return card.type === CARD_TYPES.SKIP || card.type === CARD_TYPES.DRAW_TWO || card.type === CARD_TYPES.WILD_DRAW_FOUR;
  }

  static getDrawCount(card) {
    if (card.type === CARD_TYPES.DRAW_TWO) return 2;
    if (card.type === CARD_TYPES.WILD_DRAW_FOUR) return 4;
    return 0;
  }

  static canChallenge(previousCard, currentCard) {
    return previousCard && currentCard && previousCard.type === CARD_TYPES.WILD_DRAW_FOUR;
  }

  static isValidChallenge(previousPlayerHand) {
    return previousPlayerHand.some(card =>
      card.type !== CARD_TYPES.WILD && card.type !== CARD_TYPES.WILD_DRAW_FOUR
    );
  }

  static calculateScore(hand) {
    return hand.reduce((total, card) => total + card.score, 0);
  }

  static getValidColors() {
    return Object.keys(COLORS).map(k => k.toLowerCase());
  }
}
