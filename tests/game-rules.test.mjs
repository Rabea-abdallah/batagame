import test from 'node:test';
import assert from 'node:assert/strict';

import { Deck } from '../assets/js/game/Deck.js';
import { GameState } from '../assets/js/game/GameState.js';
import { GameRules } from '../assets/js/game/GameRules.js';
import { Card } from '../assets/js/game/Card.js';
import { CARD_TYPES, DEFAULT_RULES, RULE_PROFILES, GAME_PHASES } from '../assets/js/core/Constants.js';
import { DEV_PENALTY_TEST_CARDS } from '../assets/js/game/DevPenaltyTestSetup.js';

function createStartedGame(playerCount = 2, rules = DEFAULT_RULES) {
  const state = new GameState();
  state.setRules(rules);
  for (let i = 1; i <= playerCount; i++) {
    const id = `p${i}`;
    state.players.push({
      id,
      name: `Player ${i}`,
      cards: [],
      isHost: i === 1,
      isReady: true,
      connected: true
    });
    state.playerHands[id] = [];
  }
  assert.equal(state.start(7, rules), true);
  assert.equal(state.beginPlaying(), true);
  return state;
}

test('UNO deck contains 108 cards', () => {
  const deck = new Deck().build();
  assert.equal(deck.remaining, 108);
});

test('house rules allow wild +4 at any time regardless of field card', () => {
  const hand = [
    new Card(CARD_TYPES.NUMBER, 'red', 5),
    new Card(CARD_TYPES.WILD_DRAW_FOUR)
  ];
  const currentCard = new Card(CARD_TYPES.NUMBER, 'red', 2);

  assert.equal(GameRules.canPlayCard(hand[1], currentCard, null, hand, DEFAULT_RULES), true);
});

test('after drawing wild +4 penalty next player can stack another +4', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 0;
  state.currentCard = new Card(CARD_TYPES.NUMBER, 'red', 5);
  state.players[0].cards = [
    new Card(CARD_TYPES.WILD_DRAW_FOUR),
    new Card(CARD_TYPES.NUMBER, 'red', 8)
  ];
  state.players[1].cards = [
    new Card(CARD_TYPES.NUMBER, 'red', 3),
    new Card(CARD_TYPES.NUMBER, 'blue', 4)
  ];
  state.players[2].cards = [
    new Card(CARD_TYPES.WILD_DRAW_FOUR),
    new Card(CARD_TYPES.NUMBER, 'green', 1)
  ];

  const penalty = state.playCard('p1', state.players[0].cards[0].id, 'blue');
  assert.equal(penalty.action, 'penalty');

  const draw = state.drawCard('p2');
  assert.equal(draw.action, 'draw_and_skip');
  assert.equal(state.currentCard.type, CARD_TYPES.WILD_DRAW_FOUR);
  assert.equal(state.players[state.currentPlayerIndex].id, 'p3');

  const stack = state.playCard('p3', state.players[2].cards[0].id, 'yellow');
  assert.equal(stack.success, true);
  assert.equal(stack.action, 'penalty');
  assert.equal(state.pendingDrawCount, 4);
});

test('official-style saved rules normalize to house wild +4 behavior', () => {
  const officialStyle = {
    ...DEFAULT_RULES,
    profile: RULE_PROFILES.OFFICIAL,
    allowWildDrawFourStacking: false,
    enforceWildDrawFour: true
  };
  const hand = [
    new Card(CARD_TYPES.NUMBER, 'red', 5),
    new Card(CARD_TYPES.WILD_DRAW_FOUR)
  ];
  const currentCard = new Card(CARD_TYPES.NUMBER, 'red', 2);

  assert.equal(GameRules.canPlayWildDrawFour(hand, currentCard, null, officialStyle), true);
});

test('player with draw two may stack wild four on wild four regardless of color', () => {
  const hand = [new Card(CARD_TYPES.DRAW_TWO, 'blue'), new Card(CARD_TYPES.WILD_DRAW_FOUR)];
  const currentCard = new Card(CARD_TYPES.WILD_DRAW_FOUR);

  assert.equal(GameRules.canStackDraw(hand[1], currentCard, DEFAULT_RULES), true);
  assert.equal(GameRules.canPlayWildDrawFour(hand, currentCard, 'red', DEFAULT_RULES), true);
});

test('skip and reverse on wild +4 require wild selected color even with draw two in hand', () => {
  const top = new Card(CARD_TYPES.WILD_DRAW_FOUR);
  const hand = [
    new Card(CARD_TYPES.DRAW_TWO, 'blue'),
    new Card(CARD_TYPES.REVERSE, 'blue'),
    new Card(CARD_TYPES.REVERSE, 'red'),
    new Card(CARD_TYPES.SKIP, 'blue'),
    new Card(CARD_TYPES.SKIP, 'red')
  ];

  assert.equal(GameRules.canPlayCard(hand[1], top, 'red', hand, DEFAULT_RULES), false);
  assert.equal(GameRules.canPlayCard(hand[2], top, 'red', hand, DEFAULT_RULES), true);
  assert.equal(GameRules.canPlayCard(hand[3], top, 'red', hand, DEFAULT_RULES), false);
  assert.equal(GameRules.canPlayCard(hand[4], top, 'red', hand, DEFAULT_RULES), true);

  assert.equal(
    GameRules.canPlayDuringPenalty(hand[1], top, 'red', hand, DEFAULT_RULES, CARD_TYPES.WILD_DRAW_FOUR),
    false
  );
  assert.equal(
    GameRules.canPlayDuringPenalty(hand[2], top, 'red', hand, DEFAULT_RULES, CARD_TYPES.WILD_DRAW_FOUR),
    true
  );
});

test('skip cancel on +4 stack uses wild color not pile top after redirect', () => {
  const top = new Card(CARD_TYPES.REVERSE, 'yellow');
  const redSkip = new Card(CARD_TYPES.SKIP, 'red');
  const yellowSkip = new Card(CARD_TYPES.SKIP, 'yellow');

  assert.equal(
    GameRules.skipCancelsPenalty(redSkip, top, 'red', DEFAULT_RULES, CARD_TYPES.WILD_DRAW_FOUR),
    true
  );
  assert.equal(
    GameRules.skipCancelsPenalty(yellowSkip, top, 'red', DEFAULT_RULES, CARD_TYPES.WILD_DRAW_FOUR),
    false
  );
  assert.equal(
    GameRules.reverseRedirectsPenalty(
      new Card(CARD_TYPES.REVERSE, 'red'), top, 'red', DEFAULT_RULES, CARD_TYPES.WILD_DRAW_FOUR
    ),
    true
  );
  assert.equal(
    GameRules.reverseRedirectsPenalty(
      new Card(CARD_TYPES.REVERSE, 'blue'), top, 'red', DEFAULT_RULES, CARD_TYPES.WILD_DRAW_FOUR
    ),
    false
  );
});

test('same-color skip cancels pending draw penalty', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 1;
  state.currentCard = new Card(CARD_TYPES.DRAW_TWO, 'green');
  state.mustDraw = true;
  state.pendingDrawCount = 4;
  state.penaltyStackCardType = CARD_TYPES.DRAW_TWO;
  state.players[1].cards = [new Card(CARD_TYPES.SKIP, 'green')];

  const result = state.playCard('p2', state.players[1].cards[0].id);

  assert.equal(result.success, true);
  assert.equal(state.mustDraw, false);
  assert.equal(state.pendingDrawCount, 0);
});

test('same-color reverse passes stacked draw to next player after direction flip', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 1;
  state.direction = 1;
  state.currentCard = new Card(CARD_TYPES.DRAW_TWO, 'yellow');
  state.mustDraw = true;
  state.pendingDrawCount = 6;
  state.penaltyStackCardType = CARD_TYPES.DRAW_TWO;
  state.players[0].cards = [];
  state.players[1].cards = [
    new Card(CARD_TYPES.REVERSE, 'yellow'),
    new Card(CARD_TYPES.NUMBER, 'blue', 5)
  ];
  const before = state.players[0].cards.length;

  const result = state.playCard('p2', state.players[1].cards[0].id);

  assert.equal(result.success, true);
  assert.equal(state.direction, -1);
  assert.equal(state.players[state.currentPlayerIndex].id, 'p1');
  assert.equal(state.mustDraw, true);
  assert.equal(state.pendingDrawCount, 6);
  assert.equal(state.players[0].cards.length, before);

  const drawResult = state.drawCard('p1');
  assert.equal(drawResult.success, true);
  assert.equal(state.players[0].cards.length, before + 6);
});

test('house rules can allow draw stacking', () => {
  const houseRules = {
    ...DEFAULT_RULES,
    profile: RULE_PROFILES.HOUSE,
    allowStacking: true,
    allowDrawTwoStacking: true
  };

  assert.equal(
    GameRules.canStackDraw(
      new Card(CARD_TYPES.DRAW_TWO, 'blue'),
      new Card(CARD_TYPES.DRAW_TWO, 'red'),
      houseRules
    ),
    true
  );
});

test('official-style saved rules still allow draw penalty stacking', () => {
  const officialStyle = {
    ...DEFAULT_RULES,
    profile: RULE_PROFILES.OFFICIAL,
    allowStacking: false,
    allowDrawTwoStacking: false,
    allowWildDrawFourStacking: false
  };

  assert.equal(
    GameRules.canStackDraw(
      new Card(CARD_TYPES.DRAW_TWO, 'blue'),
      new Card(CARD_TYPES.DRAW_TWO, 'red'),
      officialStyle
    ),
    true
  );
});

test('+2 stack chain accumulates draw count until a player draws', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 0;
  state.currentCard = new Card(CARD_TYPES.NUMBER, 'red', 5);
  state.players[0].cards = [
    new Card(CARD_TYPES.DRAW_TWO, 'red'),
    new Card(CARD_TYPES.NUMBER, 'red', 1)
  ];
  state.players[1].cards = [
    new Card(CARD_TYPES.DRAW_TWO, 'blue'),
    new Card(CARD_TYPES.NUMBER, 'blue', 2)
  ];
  state.players[2].cards = [
    new Card(CARD_TYPES.NUMBER, 'green', 1),
    new Card(CARD_TYPES.NUMBER, 'green', 2)
  ];

  const first = state.playCard('p1', state.players[0].cards[0].id);
  assert.equal(first.action, 'penalty');
  assert.equal(state.pendingDrawCount, 2);
  assert.equal(state.mustDraw, true);

  const stack = state.playCard('p2', state.players[1].cards[0].id);
  assert.equal(stack.action, 'stack');
  assert.equal(state.pendingDrawCount, 4);
  assert.equal(state.players[state.currentPlayerIndex].id, 'p3');

  const before = state.players[2].cards.length;
  const draw = state.drawCard('p3');
  assert.equal(draw.action, 'draw_and_skip');
  assert.equal(state.players[2].cards.length, before + 4);
  assert.equal(state.pendingDrawCount, 0);
  assert.equal(state.mustDraw, false);
});

test('wild +4 stack chain accumulates to eight cards drawn', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 0;
  state.currentCard = new Card(CARD_TYPES.NUMBER, 'red', 5);
  state.players[0].cards = [
    new Card(CARD_TYPES.WILD_DRAW_FOUR),
    new Card(CARD_TYPES.NUMBER, 'blue', 1)
  ];
  state.players[1].cards = [
    new Card(CARD_TYPES.WILD_DRAW_FOUR),
    new Card(CARD_TYPES.NUMBER, 'green', 2)
  ];
  state.players[2].cards = [
    new Card(CARD_TYPES.NUMBER, 'yellow', 3),
    new Card(CARD_TYPES.NUMBER, 'yellow', 4)
  ];

  const first = state.playCard('p1', state.players[0].cards[0].id, 'green');
  assert.equal(first.action, 'penalty');
  assert.equal(state.pendingDrawCount, 4);

  const stack = state.playCard('p2', state.players[1].cards[0].id, 'blue');
  assert.equal(stack.action, 'stack');
  assert.equal(state.pendingDrawCount, 8);

  const before = state.players[2].cards.length;
  const draw = state.drawCard('p3');
  assert.equal(draw.action, 'draw_and_skip');
  assert.equal(state.players[2].cards.length, before + 8);
});

test('penalty stack type allows +2 stack after reverse redirect', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 0;
  state.direction = -1;
  state.currentCard = new Card(CARD_TYPES.REVERSE, 'yellow');
  state.mustDraw = true;
  state.pendingDrawCount = 4;
  state.penaltyStackCardType = CARD_TYPES.DRAW_TWO;
  state.players[0].cards = [
    new Card(CARD_TYPES.DRAW_TWO, 'yellow'),
    new Card(CARD_TYPES.NUMBER, 'red', 2)
  ];

  assert.equal(
    GameRules.canPlayDuringPenalty(
      state.players[0].cards[0],
      state.currentCard,
      null,
      state.players[0].cards,
      DEFAULT_RULES,
      CARD_TYPES.DRAW_TWO
    ),
    true
  );

  const stack = state.playCard('p1', state.players[0].cards[0].id);
  assert.equal(stack.action, 'stack');
  assert.equal(state.pendingDrawCount, 6);
});

test('+2 can stack on +2 penalty regardless of color while undrawn', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 1;
  state.currentCard = new Card(CARD_TYPES.DRAW_TWO, 'red');
  state.mustDraw = true;
  state.pendingDrawCount = 2;
  state.penaltyStackCardType = CARD_TYPES.DRAW_TWO;
  state.players[1].cards = [
    new Card(CARD_TYPES.DRAW_TWO, 'blue'),
    new Card(CARD_TYPES.NUMBER, 'green', 3)
  ];

  const stack = state.playCard('p2', state.players[1].cards[0].id);
  assert.equal(stack.success, true);
  assert.equal(stack.action, 'stack');
  assert.equal(state.pendingDrawCount, 4);
});

test('during wild +4 penalty +4 always stacks but +2 needs wild color', () => {
  const top = new Card(CARD_TYPES.WILD_DRAW_FOUR);
  const handWithDrawTwo = [
    new Card(CARD_TYPES.DRAW_TWO, 'blue'),
    new Card(CARD_TYPES.DRAW_TWO, 'red'),
    new Card(CARD_TYPES.WILD_DRAW_FOUR)
  ];

  assert.equal(
    GameRules.canPlayDuringPenalty(
      handWithDrawTwo[0], top, 'red', handWithDrawTwo, DEFAULT_RULES, CARD_TYPES.WILD_DRAW_FOUR
    ),
    false
  );
  assert.equal(
    GameRules.canPlayDuringPenalty(
      handWithDrawTwo[1], top, 'red', handWithDrawTwo, DEFAULT_RULES, CARD_TYPES.WILD_DRAW_FOUR
    ),
    true
  );
  assert.equal(
    GameRules.canPlayDuringPenalty(
      handWithDrawTwo[2], top, 'red', handWithDrawTwo, DEFAULT_RULES, CARD_TYPES.WILD_DRAW_FOUR
    ),
    true
  );
});

test('+2 can stack on +4 penalty pile only with matching wild color', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 1;
  state.currentCard = new Card(CARD_TYPES.WILD_DRAW_FOUR);
  state.selectedColor = 'green';
  state.mustDraw = true;
  state.pendingDrawCount = 4;
  state.penaltyStackCardType = CARD_TYPES.WILD_DRAW_FOUR;
  state.players[1].cards = [
    new Card(CARD_TYPES.DRAW_TWO, 'blue'),
    new Card(CARD_TYPES.DRAW_TWO, 'green'),
    new Card(CARD_TYPES.NUMBER, 'yellow', 5)
  ];

  const wrongColor = state.playCard('p2', state.players[1].cards[0].id);
  assert.equal(wrongColor.success, false);

  const stack = state.playCard('p2', state.players[1].cards[1].id);
  assert.equal(stack.success, true);
  assert.equal(stack.action, 'stack');
  assert.equal(state.pendingDrawCount, 6);
  assert.equal(state.penaltyStackCardType, CARD_TYPES.DRAW_TWO);
});

test('after penalty drawn wild +4 and wild and same-color cards are playable', () => {
  const top = new Card(CARD_TYPES.WILD_DRAW_FOUR);
  const hand = [
    new Card(CARD_TYPES.WILD),
    new Card(CARD_TYPES.WILD_DRAW_FOUR),
    new Card(CARD_TYPES.NUMBER, 'red', 4),
    new Card(CARD_TYPES.NUMBER, 'blue', 2)
  ];

  assert.equal(GameRules.canPlayCard(hand[0], top, 'red', hand, DEFAULT_RULES), true);
  assert.equal(GameRules.canPlayCard(hand[1], top, 'red', hand, DEFAULT_RULES), true);
  assert.equal(GameRules.canPlayCard(hand[2], top, 'red', hand, DEFAULT_RULES), true);
  assert.equal(GameRules.canPlayCard(hand[3], top, 'red', hand, DEFAULT_RULES), false);
});

test('wild +4 can stack on +2 penalty pile regardless of pile color', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 1;
  state.currentCard = new Card(CARD_TYPES.DRAW_TWO, 'red');
  state.mustDraw = true;
  state.pendingDrawCount = 2;
  state.penaltyStackCardType = CARD_TYPES.DRAW_TWO;
  state.players[1].cards = [
    new Card(CARD_TYPES.WILD_DRAW_FOUR),
    new Card(CARD_TYPES.NUMBER, 'blue', 3)
  ];

  const stack = state.playCard('p2', state.players[1].cards[0].id, 'yellow');

  assert.equal(stack.success, true);
  assert.equal(stack.action, 'stack');
  assert.equal(state.pendingDrawCount, 6);
  assert.equal(state.penaltyStackCardType, CARD_TYPES.WILD_DRAW_FOUR);
  assert.equal(state.selectedColor, 'yellow');
});

test('Reverse acts as Skip in two-player official game', () => {
  const state = createStartedGame(2);
  state.currentPlayerIndex = 0;
  state.currentCard = new Card(CARD_TYPES.NUMBER, 'red', 3);
  state.selectedColor = null;
  state.players[0].cards = [
    new Card(CARD_TYPES.REVERSE, 'red'),
    new Card(CARD_TYPES.NUMBER, 'red', 1)
  ];

  const result = state.playCard('p1', state.players[0].cards[0].id);

  assert.equal(result.success, true);
  assert.equal(state.players[state.currentPlayerIndex].id, 'p1');
});

test('initial Draw Two makes first player draw and passes turn', () => {
  const state = createStartedGame(2);
  state.currentPlayerIndex = 0;
  state.currentCard = new Card(CARD_TYPES.DRAW_TWO, 'green');
  const before = state.players[0].cards.length;

  state._applyInitialCardEffect();

  assert.equal(state.players[0].cards.length, before + 2);
  assert.equal(state.players[state.currentPlayerIndex].id, 'p2');
});

test('forced timeout draw advances turn only once for the timed-out player', () => {
  const state = createStartedGame(2);
  const timedOutPlayer = state.players[state.currentPlayerIndex].id;

  const first = state.drawCard(timedOutPlayer, { forcePass: true });
  const second = state.drawCard(timedOutPlayer, { forcePass: true });

  assert.equal(first.success, true);
  assert.equal(first.action, 'timeout');
  assert.equal(second.success, false);
  assert.equal(second.reason, 'not_your_turn');
});

test('room timeout ejects player and passes turn without drawing', () => {
  const state = createStartedGame(3);
  const timedOutPlayer = state.players[state.currentPlayerIndex].id;
  const before = state.players[state.currentPlayerIndex].cards.length;

  const result = state.ejectPlayerForTimeout(timedOutPlayer);

  assert.equal(result.success, true);
  assert.equal(result.action, 'player_ejected');
  assert.equal(state.players.find(p => p.id === timedOutPlayer), undefined);
  assert.notEqual(state.players[state.currentPlayerIndex].id, timedOutPlayer);
  assert.equal(state.players.length, 2);
  assert.ok(state.turnStartTime > 0);
  void before;
});

test('wild4 challenge stays disabled in unified play rules', () => {
  const state = createStartedGame(2, {
    ...DEFAULT_RULES,
    allowChallengeWildDrawFour: true,
    enforceWildDrawFour: true
  });
  state.currentPlayerIndex = 0;
  state.currentCard = new Card(CARD_TYPES.NUMBER, 'red', 7);
  state.selectedColor = null;
  const redCard = new Card(CARD_TYPES.NUMBER, 'red', 3);
  const wild4 = new Card(CARD_TYPES.WILD_DRAW_FOUR);
  state.players[0].cards = [redCard, wild4];

  const play = state.playCard('p1', wild4.id, 'blue');
  const challenge = state.challengeWildDrawFour('p2');

  assert.equal(play.success, true);
  assert.equal(challenge.success, false);
});

test('dev penalty test deal gives 10 action-only cards per player', () => {
  const state = new GameState();
  state.setRules(DEFAULT_RULES);
  for (let i = 1; i <= 3; i++) {
    const id = `p${i}`;
    state.players.push({
      id,
      name: `Player ${i}`,
      cards: [],
      isHost: i === 1,
      isReady: true,
      connected: true
    });
    state.playerHands[id] = [];
  }

  assert.equal(state.start(7, DEFAULT_RULES, { devPenaltyTest: true }), true);
  assert.equal(state.devPenaltyTest, true);

  for (const player of state.players) {
    assert.equal(player.cards.length, DEV_PENALTY_TEST_CARDS);
    assert.ok(player.cards.some(c => c.type === CARD_TYPES.WILD_DRAW_FOUR));
    assert.ok(player.cards.some(c => c.type === CARD_TYPES.WILD));
    for (const card of player.cards) {
      assert.ok(
        card.type === CARD_TYPES.DRAW_TWO ||
        card.type === CARD_TYPES.SKIP ||
        card.type === CARD_TYPES.REVERSE ||
        card.type === CARD_TYPES.WILD ||
        card.type === CARD_TYPES.WILD_DRAW_FOUR
      );
    }
  }

  assert.equal(state.currentCard.type, CARD_TYPES.NUMBER);
});

test('game continues when a player empties hand until one player remains', () => {
  const state = createStartedGame(3);
  state.currentPlayerIndex = 0;
  state.currentCard = new Card(CARD_TYPES.NUMBER, 'red', 5);
  state.players[0].cards = [new Card(CARD_TYPES.NUMBER, 'red', 3)];
  state.players[1].cards = [
    new Card(CARD_TYPES.NUMBER, 'blue', 2),
    new Card(CARD_TYPES.NUMBER, 'blue', 4)
  ];
  state.players[2].cards = [
    new Card(CARD_TYPES.NUMBER, 'green', 1),
    new Card(CARD_TYPES.NUMBER, 'green', 6)
  ];

  const firstFinish = state.playCard('p1', state.players[0].cards[0].id);
  assert.equal(firstFinish.success, true);
  assert.equal(firstFinish.action, 'player_finished');
  assert.equal(state.phase, GAME_PHASES.PLAYING);
  assert.deepEqual(state.finishOrder, ['p1']);
  assert.equal(state.loser, null);

  state.currentPlayerIndex = state.players.findIndex(p => p.id === 'p2');
  state.currentCard = new Card(CARD_TYPES.NUMBER, 'blue', 2);
  state.players[1].cards = [new Card(CARD_TYPES.NUMBER, 'blue', 2)];
  const secondFinish = state.playCard('p2', state.players[1].cards[0].id);
  assert.equal(secondFinish.action, 'game_over');
  assert.equal(state.phase, GAME_PHASES.FINISHED);
  assert.deepEqual(state.finishOrder, ['p1', 'p2']);
  assert.deepEqual(state.getRankings(), ['p1', 'p2', 'p3']);
  assert.equal(state.loser, 'p3');
});

test('elimination rankings place first finisher first and last player last', () => {
  const state = createStartedGame(3);
  state.finishOrder = ['p2', 'p1'];
  state._finalizeGame('p3');

  assert.deepEqual(state.getRankings(), ['p2', 'p1', 'p3']);
  assert.equal(state.loser, 'p3');
  assert.equal(state.finishOrder[0], 'p2');
});
