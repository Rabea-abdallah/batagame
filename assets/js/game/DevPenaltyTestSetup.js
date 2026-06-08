import { CARD_TYPES } from '../core/Constants.js';
import { Card } from './Card.js';
import { Deck } from './Deck.js';

/** Cards per player in dev penalty-test bot games. */
export const DEV_PENALTY_TEST_CARDS = 10;

const COLORS = ['red', 'blue', 'green', 'yellow'];
const ACTION_CYCLE = [CARD_TYPES.DRAW_TWO, CARD_TYPES.SKIP, CARD_TYPES.REVERSE];

function buildHandSpecs(playerIndex, count) {
  const specs = [
    { type: CARD_TYPES.WILD_DRAW_FOUR },
    { type: CARD_TYPES.WILD }
  ];
  const actionCount = Math.max(0, count - specs.length);
  for (let i = 0; i < actionCount; i++) {
    specs.push({
      type: ACTION_CYCLE[i % ACTION_CYCLE.length],
      color: COLORS[(playerIndex + i) % 4]
    });
  }
  return specs;
}

function takeWild4(deck) {
  return takeFromDeck(deck, CARD_TYPES.WILD_DRAW_FOUR) || new Card(CARD_TYPES.WILD_DRAW_FOUR);
}

function takeWild(deck) {
  return takeFromDeck(deck, CARD_TYPES.WILD) || new Card(CARD_TYPES.WILD);
}

function takeFromDeck(deck, type, color = null) {
  const idx = deck._cards.findIndex(c =>
    c.type === type && (color == null || c.color === color)
  );
  if (idx === -1) return null;
  return deck._cards.splice(idx, 1)[0];
}

/** Dev-only: clone action cards when the physical deck runs out (many bots × 10 hands). */
function takeActionForDev(deck, type, color) {
  return takeFromDeck(deck, type, color)
    || takeFromDeck(deck, type)
    || new Card(type, color || COLORS[0]);
}

function takeNumberCard(deck, color, value) {
  const idx = deck._cards.findIndex(c =>
    c.type === CARD_TYPES.NUMBER && c.color === color && c.value === value
  );
  if (idx === -1) return null;
  return deck._cards.splice(idx, 1)[0];
}

/**
 * Deal fixed test hands: Wild +4, Wild, then +2 / Skip / Reverse (DEV_PENALTY_TEST_CARDS each).
 * Used in dev bot games to exercise penalty stacking and wild rules.
 */
export function applyDevPenaltyTestDeal(gameState, cardsPerPlayer = DEV_PENALTY_TEST_CARDS) {
  gameState.deck = new Deck().build().shuffle();

  gameState.players.forEach((player, index) => {
    const hand = [];
    const specs = buildHandSpecs(index, cardsPerPlayer);

    for (const spec of specs) {
      if (spec.type === CARD_TYPES.WILD_DRAW_FOUR) {
        hand.push(takeWild4(gameState.deck));
      } else if (spec.type === CARD_TYPES.WILD) {
        hand.push(takeWild(gameState.deck));
      } else {
        hand.push(takeActionForDev(gameState.deck, spec.type, spec.color));
      }
    }

    while (hand.length < cardsPerPlayer) {
      const type = ACTION_CYCLE[hand.length % ACTION_CYCLE.length];
      hand.push(takeActionForDev(gameState.deck, type, COLORS[hand.length % 4]));
    }

    player.cards = hand;
    gameState.playerHands[player.id] = hand.map(c => c.serialize());
  });

  let firstCard = takeNumberCard(gameState.deck, 'red', 5)
    || takeNumberCard(gameState.deck, 'blue', 3);

  if (!firstCard) {
    let safety = 0;
    while (safety < 120) {
      const c = gameState.deck.drawOne();
      if (!c) break;
      if (!c.isWild && c.type !== CARD_TYPES.WILD_DRAW_FOUR) {
        firstCard = c;
        break;
      }
      gameState.deck.discard(c);
      gameState.deck._cards.unshift(c);
      safety++;
    }
  }

  gameState.currentCard = firstCard;
  if (firstCard) gameState.deck.discard(firstCard);
  gameState.selectedColor = null;

  return { cardsPerPlayer, firstCardId: firstCard?.id ?? null };
}
