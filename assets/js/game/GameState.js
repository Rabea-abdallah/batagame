import { GAME_PHASES, INITIAL_CARDS, CARD_TYPES, getPlayRules, UNO_CALL_WINDOW } from '../core/Constants.js';
import { applyDevPenaltyTestDeal, DEV_PENALTY_TEST_CARDS } from './DevPenaltyTestSetup.js';
import { Card } from './Card.js';
import { Deck } from './Deck.js';
import { GameRules } from './GameRules.js';
import { Validator } from '../core/Validator.js';

export class GameState {
  constructor() {
    this.reset();
  }

  destroy() {
  }

  reset() {
    this.phase = GAME_PHASES.WAITING;
    this.players = [];
    this.currentPlayerIndex = 0;
    this.direction = 1;
    this.deck = null;
    this.currentCard = null;
    this.selectedColor = null;
    this.winner = null;
    this.loser = null;
    this.finishedPlayers = new Set();
    this.finishOrder = [];
    this.unoCalled = {};
    this.turnStartTime = 0;
    this.lastEventId = 0;
    this.gameId = null;
    this.playerHands = {};
    this.mustDraw = false;
    this.pendingDrawCount = 0;
    this.penaltyStackCardType = null;
    this.skipAfterDraw = false;
    this.processedEvents = new Set();
    this.rules = getPlayRules();
    this.pendingChallenge = null;
    this.unoRisk = null;
    this.scoring = {};
    this.roundScores = {};
    this.matchWinner = null;
    this.lastAction = null;
    this.devPenaltyTest = false;
  }

  _recordAction(action) {
    this.lastEventId += 1;
    this.lastAction = action;
  }

  setRules(rules = {}) {
    this.rules = getPlayRules(rules);
  }

  getRules() {
    return getPlayRules(this.rules);
  }

  init(playerId, playerName) {
    this.gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.players = [{ id: playerId, name: playerName, cards: [], isHost: true, isReady: false, connected: true }];
    this.playerHands[playerId] = [];
    return this;
  }

  addPlayer(playerId, playerName) {
    if (this.players.find(p => p.id === playerId)) return false;
    this.players.push({ id: playerId, name: playerName, cards: [], isHost: false, isReady: false, connected: true });
    this.playerHands[playerId] = [];
    return true;
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1) return false;
    const wasCurrent = idx === this.currentPlayerIndex;
    this.players.splice(idx, 1);
    delete this.playerHands[playerId];
    delete this.unoCalled[playerId];
    if (this.players.length > 0) {
      if (wasCurrent) {
        this.currentPlayerIndex = idx % this.players.length;
      } else if (idx < this.currentPlayerIndex) {
        this.currentPlayerIndex -= 1;
      }
    }
    return true;
  }

  /** Room turn timer expired: remove player and pass turn (no draw penalty). */
  ejectPlayerForTimeout(playerId) {
    if (this.phase !== GAME_PHASES.PLAYING) {
      return { success: false, reason: 'game_not_playing' };
    }

    const current = this.players[this.currentPlayerIndex];
    if (!current || current.id !== playerId) {
      return { success: false, reason: 'not_your_turn' };
    }

    const removedIndex = this.currentPlayerIndex;
    this.players.splice(removedIndex, 1);
    delete this.playerHands[playerId];
    delete this.unoCalled[playerId];
    this.pendingChallenge = null;
    this.mustDraw = false;
    this.pendingDrawCount = 0;
    this.penaltyStackCardType = null;
    this.skipAfterDraw = false;

    if (this.players.length === 0) {
      this.phase = GAME_PHASES.FINISHED;
      return { success: true, action: 'player_ejected', ejectedPlayerId: playerId, gameOver: true };
    }

    if (this.players.length === 1) {
      this._finalizeGame(this.players[0].id);
      return {
        success: true,
        action: 'player_ejected',
        ejectedPlayerId: playerId,
        winnerId: this.finishOrder[0] || null,
        loserId: this.loser,
        rankings: this.getRankings(),
        gameOver: true
      };
    }

    this.currentPlayerIndex = removedIndex % this.players.length;
    this.turnStartTime = Date.now();
    this.lastEventId = (this.lastEventId || 0) + 1;
    this._recordAction({ type: 'player_ejected', playerId, reason: 'turn_timeout' });

    return {
      success: true,
      action: 'player_ejected',
      ejectedPlayerId: playerId,
      nextPlayer: this.players[this.currentPlayerIndex]?.id
    };
  }

  setReady(playerId, ready) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;
    player.isReady = ready;
    return true;
  }

  canStart() {
    return this.players.length >= 2 && this.players.every(p => p.isReady);
  }

  start(initialCardCount = INITIAL_CARDS, rules = null, options = {}) {
    if (!this.canStart()) return false;
    if (rules) this.setRules(rules);

    this.phase = GAME_PHASES.STARTING;
    this.devPenaltyTest = !!options.devPenaltyTest;

    if (this.devPenaltyTest) {
      applyDevPenaltyTestDeal(this, DEV_PENALTY_TEST_CARDS);
    } else {
      this.deck = new Deck().build().shuffle();

      for (const player of this.players) {
        const drawn = this.deck.draw(initialCardCount);
        player.cards = drawn;
        this.playerHands[player.id] = drawn.map(c => c.serialize());
      }

      let firstCard = this.deck.drawOne();
      while (firstCard && (firstCard.isWild || firstCard.type === CARD_TYPES.WILD_DRAW_FOUR)) {
        this.deck.discard(firstCard);
        this.deck._cards.unshift(firstCard);
        firstCard = this.deck.drawOne();
      }

      this.currentCard = firstCard;
      this.deck.discard(firstCard);
    }

    this.selectedColor = null;

    this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
    this.direction = 1;
    this.phase = GAME_PHASES.STARTING;
    this.turnStartTime = 0;
    this.winner = null;
    this.loser = null;
    this.finishedPlayers = new Set();
    this.finishOrder = [];
    this.unoCalled = {};
    this.pendingChallenge = null;
    this.unoRisk = null;
    this.roundScores = {};
    this.matchWinner = null;
    this.mustDraw = false;
    this.pendingDrawCount = 0;
    this.penaltyStackCardType = null;
    this.skipAfterDraw = false;
    this.lastEventId = 0;
    this.lastAction = null;

    if (this.rules.initialActionCardEffect && !this.devPenaltyTest) {
      this._applyInitialCardEffect();
    }

    return true;
  }

  beginPlaying() {
    if (this.phase !== GAME_PHASES.STARTING) return false;
    this.phase = GAME_PHASES.PLAYING;
    this.turnStartTime = Date.now();
    this.lastEventId = (this.lastEventId || 0) + 1;
    return true;
  }

  _getNextActiveIndex(fromIndex) {
    let next = GameRules.calculateNextPlayer(fromIndex, this.direction, this.players.length);
    let safety = 0;
    while (this.finishedPlayers.has(this.players[next]?.id) && safety < this.players.length) {
      next = GameRules.calculateNextPlayer(next, this.direction, this.players.length);
      safety++;
    }
    return safety >= this.players.length ? -1 : next;
  }

  _checkGameEnd() {
    const active = this.players.filter(p => !this.finishedPlayers.has(p.id));
    if (active.length <= 1) {
      this._finalizeGame(active[0]?.id || null);
      return true;
    }
    return false;
  }

  getRankings() {
    const rankings = [...this.finishOrder];
    if (this.loser && !rankings.includes(this.loser)) {
      rankings.push(this.loser);
    }
    return rankings;
  }

  _markPlayerFinished(playerId) {
    if (this.finishedPlayers.has(playerId)) return;
    this.finishedPlayers.add(playerId);
    this.finishOrder.push(playerId);
    delete this.unoCalled[playerId];
    if (this.unoRisk?.playerId === playerId) this.unoRisk = null;
  }

  _finalizeGame(loserId) {
    this.phase = GAME_PHASES.FINISHED;
    this.loser = loserId || null;
    this.winner = [...this.finishOrder];
    this.mustDraw = false;
    this.pendingDrawCount = 0;
    this.penaltyStackCardType = null;
    this.skipAfterDraw = false;
    this.pendingChallenge = null;
    this.unoRisk = null;

    const rankings = this.getRankings();
    this.roundScores = {};
    rankings.forEach((id, index) => {
      this.roundScores[id] = this.players.length - index;
    });
  }

  _returnPlayResult(result, playerFinished, playerId) {
    if (this._checkGameEnd()) {
      return {
        ...result,
        success: true,
        action: 'game_over',
        winnerId: this.finishOrder[0] || null,
        loserId: this.loser,
        rankings: this.getRankings(),
        roundScores: { ...this.roundScores }
      };
    }
    if (playerFinished) {
      return { ...result, action: 'player_finished', finishedPlayerId: playerId };
    }
    return result;
  }

  _applyInitialCardEffect() {
    if (!this.currentCard || this.players.length === 0) return;

    const firstPlayer = this.players[this.currentPlayerIndex];
    if (!firstPlayer) return;

    if (this.currentCard.type === CARD_TYPES.SKIP) {
      this.currentPlayerIndex = this._getNextActiveIndex(this.currentPlayerIndex);
      this.lastAction = { type: 'initial_skip', skippedPlayerId: firstPlayer.id };
      return;
    }

    if (this.currentCard.type === CARD_TYPES.REVERSE) {
      this.direction = GameRules.getDirectionAfterReverse(this.direction, this.players.length, this.rules);
      if (this.players.length === 2 && this.rules.reverseSkipsInTwoPlayer) {
        this.currentPlayerIndex = this._getNextActiveIndex(this.currentPlayerIndex);
      }
      this.lastAction = { type: 'initial_reverse', skippedPlayerId: this.players.length === 2 ? firstPlayer.id : null };
      return;
    }

    if (this.currentCard.type === CARD_TYPES.DRAW_TWO) {
      const drawn = this.deck.draw(2);
      firstPlayer.cards.push(...drawn);
      this.currentPlayerIndex = this._getNextActiveIndex(this.currentPlayerIndex);
      this.lastAction = { type: 'initial_draw_two', playerId: firstPlayer.id, drawCount: drawn.length };
    }
  }

  _canStackDraw(card) {
    return GameRules.canStackDraw(card, this.currentCard, this.rules);
  }

  playCard(playerId, cardId, selectedColor = null) {
    if (this.phase !== GAME_PHASES.PLAYING) return { success: false, reason: 'game_not_playing' };
    this._applyExpiredUnoPenalty();

    const player = this.players[this.currentPlayerIndex];
    if (!player || player.id !== playerId) return { success: false, reason: 'not_your_turn' };
    if (this.finishedPlayers.has(playerId)) return { success: false, reason: 'player_finished' };

    const card = player.cards.find(c => c.id === cardId);
    if (!card) return { success: false, reason: 'card_not_found' };

    if (this.mustDraw) {
      if (!GameRules.canPlayDuringPenalty(
        card, this.currentCard, this.selectedColor, player.cards, this.rules, this.penaltyStackCardType
      )) {
        return { success: false, reason: 'must_draw_first' };
      }
    } else if (!GameRules.canPlayCard(card, this.currentCard, this.selectedColor, player.cards, this.rules)) {
      return { success: false, reason: 'invalid_move' };
    }

    if (card.isWild && !selectedColor) {
      const penaltyStackRef = GameRules.getPenaltyStackReference(this.currentCard, this.penaltyStackCardType);
      const freeWild4 = card.type === CARD_TYPES.WILD_DRAW_FOUR && !this.rules.enforceWildDrawFour;
      const stackingPenalty = this.mustDraw && (
        GameRules.canStackPenaltyDraw(
          card, this.penaltyStackCardType, this.currentCard, this.selectedColor, this.rules
        ) ||
        GameRules.canStackDraw(card, penaltyStackRef, this.rules)
      );
      const canKeepColor = freeWild4 || stackingPenalty || (
        GameRules.canStackDraw(card, this.currentCard, this.rules) ||
        GameRules.canPlayOnWildStack(card, this.currentCard, this.selectedColor, this.rules)
      );
      if (canKeepColor) {
        selectedColor = this.selectedColor || player.cards.find(c => c.color)?.color || 'red';
      } else {
        return { success: false, reason: 'color_required' };
      }
    }
    if (card.isWild && !Validator.isValidColor(selectedColor)) return { success: false, reason: 'invalid_color' };

    const handBeforePlay = player.cards.map(c => c.serialize());
    const pileTopBeforePlay = this.currentCard;
    const pileColorBeforePlay = this.selectedColor;
    const previousColor = GameRules.getEffectiveColor(pileTopBeforePlay, pileColorBeforePlay);
    const illegalWildDrawFour = card.type === CARD_TYPES.WILD_DRAW_FOUR &&
      !this.mustDraw &&
      !GameRules.canPlayWildDrawFour(player.cards, pileTopBeforePlay, pileColorBeforePlay, this.rules);

    const idx = player.cards.indexOf(card);
    player.cards.splice(idx, 1);

    this.currentCard = card;
    this.deck.discard(card);

    if (card.isWild) {
      this.selectedColor = selectedColor;
    } else {
      this.selectedColor = null;
    }

    const playerFinished = player.cards.length === 0;
    if (playerFinished) {
      this._markPlayerFinished(playerId);
    } else {
      this._updateUnoRisk(playerId);
    }

    const hadPenalty = this.mustDraw && this.pendingDrawCount > 0;
    const skipCancels = hadPenalty && GameRules.skipCancelsPenalty(
      card, pileTopBeforePlay, pileColorBeforePlay, this.rules, this.penaltyStackCardType
    );
    const reverseRedirects = hadPenalty && GameRules.reverseRedirectsPenalty(
      card, pileTopBeforePlay, pileColorBeforePlay, this.rules, this.penaltyStackCardType
    );

    if (card.type === CARD_TYPES.REVERSE) {
      this.direction = GameRules.getDirectionAfterReverse(this.direction, this.players.length, this.rules);
    }

    let nextIndex = this._getNextActiveIndex(this.currentPlayerIndex);

    if (skipCancels) {
      this.mustDraw = false;
      this.pendingDrawCount = 0;
      this.penaltyStackCardType = null;
      this.skipAfterDraw = false;
    } else if (reverseRedirects) {
      this.mustDraw = true;
      this.skipAfterDraw = true;
    }

    if (card.type === CARD_TYPES.SKIP ||
        (card.type === CARD_TYPES.REVERSE && this.players.length === 2 && this.rules.reverseSkipsInTwoPlayer)) {
      nextIndex = this._getNextActiveIndex(nextIndex);
    }

    const drawCount = skipCancels || reverseRedirects ? 0 : GameRules.getDrawCount(card);

    if (drawCount > 0) {
      this.penaltyStackCardType = card.type;
      if (this.mustDraw) {
        this.pendingDrawCount += drawCount;
        this.currentPlayerIndex = nextIndex;
        this.turnStartTime = Date.now();
        this._setPendingChallenge(card, playerId, nextIndex, previousColor, handBeforePlay, illegalWildDrawFour);
        this._recordAction({ type: 'play', playerId, card: card.serialize() });
        return this._returnPlayResult({
          success: true,
          action: 'stack',
          card,
          nextPlayer: this.players[nextIndex]?.id,
          drawCount: this.pendingDrawCount
        }, playerFinished, playerId);
      } else {
        this.mustDraw = true;
        this.pendingDrawCount = drawCount;
        this.skipAfterDraw = true;
        this.currentPlayerIndex = nextIndex;
        this.turnStartTime = Date.now();
        this._setPendingChallenge(card, playerId, nextIndex, previousColor, handBeforePlay, illegalWildDrawFour);
        this._recordAction({ type: 'play', playerId, card: card.serialize() });
        return this._returnPlayResult({
          success: true,
          action: 'penalty',
          card,
          nextPlayer: this.players[nextIndex]?.id,
          drawCount
        }, playerFinished, playerId);
      }
    }

    this.currentPlayerIndex = nextIndex;
    this.turnStartTime = Date.now();

    if (!reverseRedirects) {
      this.mustDraw = false;
      this.pendingDrawCount = 0;
      this.penaltyStackCardType = null;
      this.skipAfterDraw = false;
    }
    this.pendingChallenge = null;

    const action = reverseRedirects ? 'penalty_redirect' : 'play';
    this._recordAction({ type: 'play', playerId, card: card.serialize() });
    return this._returnPlayResult({
      success: true,
      action,
      card,
      nextPlayer: this.players[nextIndex]?.id,
      drawCount: reverseRedirects ? this.pendingDrawCount : undefined
    }, playerFinished, playerId);
  }

  drawCard(playerId, options = {}) {
    if (this.phase !== GAME_PHASES.PLAYING) return { success: false, reason: 'game_not_playing' };
    this._applyExpiredUnoPenalty();

    const player = this.players[this.currentPlayerIndex];
    if (!player || player.id !== playerId) return { success: false, reason: 'not_your_turn' };

    let drawnCards = [];
    const forcePass = options.forcePass === true;

    if (this.mustDraw && this.pendingDrawCount > 0) {
      drawnCards = this.deck.draw(this.pendingDrawCount);
      player.cards.push(...drawnCards);
      this.mustDraw = false;
      this.pendingDrawCount = 0;
      this.penaltyStackCardType = null;

      if (this.skipAfterDraw || forcePass) {
        this.skipAfterDraw = false;
        return this._advanceAfterDraw(forcePass ? 'timeout' : 'draw_and_skip', drawnCards);
      }
      if (drawnCards.length) {
        this._recordAction({ type: 'draw', playerId, count: drawnCards.length });
      }
    } else {
      const card = this.deck.drawOne();
      if (card) {
        drawnCards.push(card);
        player.cards.push(card);
      }
    }

    if (forcePass) {
      this.pendingChallenge = null;
      return this._advanceAfterDraw('timeout', drawnCards);
    }

    const hasPlayable = GameRules.getPlayableCards(
      player.cards,
      this.currentCard,
      this.selectedColor,
      this.rules,
      false
    );
    if (!hasPlayable.length) {
      this.pendingChallenge = null;
      return this._advanceAfterDraw('draw_and_pass', drawnCards);
    }

    this.pendingChallenge = null;
    if (drawnCards.length) {
      this._recordAction({ type: 'draw', playerId, count: drawnCards.length });
    }
    return { success: true, action: 'draw', cards: drawnCards };
  }

  timeoutTurn(playerId) {
    if (this.phase !== GAME_PHASES.PLAYING) return { success: false, reason: 'game_not_playing' };
    this._applyExpiredUnoPenalty();

    const player = this.players[this.currentPlayerIndex];
    if (!player || player.id !== playerId) return { success: false, reason: 'not_your_turn' };

    let drawnCards = [];
    if (this.mustDraw && this.pendingDrawCount > 0) {
      drawnCards = this.deck.draw(this.pendingDrawCount);
      player.cards.push(...drawnCards);
    }

    return this._advanceAfterDraw('timeout', drawnCards);
  }

  _advanceAfterDraw(action, cards = []) {
    const drawer = this.players[this.currentPlayerIndex];
    if (drawer && cards.length) {
      this._recordAction({ type: 'draw', playerId: drawer.id, count: cards.length });
    }

    const nextIndex = this._getNextActiveIndex(this.currentPlayerIndex);
    if (nextIndex === -1) {
      this._checkGameEnd();
      return {
        success: true,
        action: 'game_over',
        cards,
        winnerId: this.finishOrder[0] || null,
        loserId: this.loser,
        rankings: this.getRankings(),
        roundScores: { ...this.roundScores }
      };
    }

    this.currentPlayerIndex = nextIndex;
    this.turnStartTime = Date.now();
    this.mustDraw = false;
    this.pendingDrawCount = 0;
    this.penaltyStackCardType = null;
    this.skipAfterDraw = false;
    this.pendingChallenge = null;
    return { success: true, action, cards, nextPlayer: this.players[nextIndex]?.id };
  }

  _setPendingChallenge(card, offenderId, nextIndex, previousColor, handBeforePlay, wasIllegal) {
    if (card.type !== CARD_TYPES.WILD_DRAW_FOUR || !this.rules.allowChallengeWildDrawFour) {
      this.pendingChallenge = null;
      return;
    }

    this.pendingChallenge = {
      offenderId,
      challengerId: this.players[nextIndex]?.id || null,
      previousColor,
      offenderHand: handBeforePlay,
      wasIllegal,
      drawCount: this.pendingDrawCount || 4,
      resolved: false
    };
  }

  challengeWildDrawFour(challengerId) {
    if (!this.pendingChallenge || this.pendingChallenge.resolved) {
      return { success: false, reason: 'no_challenge_available' };
    }
    if (this.pendingChallenge.challengerId !== challengerId) {
      return { success: false, reason: 'not_challenger' };
    }

    const challenge = this.pendingChallenge;
    const offender = this.players.find(p => p.id === challenge.offenderId);
    const challenger = this.players.find(p => p.id === challengerId);
    if (!offender || !challenger) return { success: false, reason: 'player_not_found' };

    if (challenge.wasIllegal) {
      const penaltyCards = this.deck.draw(4);
      offender.cards.push(...penaltyCards);
      this.mustDraw = false;
      this.pendingDrawCount = 0;
      this.skipAfterDraw = false;
      this.currentPlayerIndex = this.players.findIndex(p => p.id === challengerId);
      this.turnStartTime = Date.now();
      this.pendingChallenge = null;
      return { success: true, action: 'challenge_success', penalizedPlayerId: offender.id, drawCount: penaltyCards.length };
    }

    const penaltyCards = this.deck.draw((challenge.drawCount || 4) + 2);
    challenger.cards.push(...penaltyCards);
    this.mustDraw = false;
    this.pendingDrawCount = 0;
    this.penaltyStackCardType = null;
    this.skipAfterDraw = false;
    const challengerIndex = this.players.findIndex(p => p.id === challengerId);
    this.currentPlayerIndex = this._getNextActiveIndex(challengerIndex);
    this.turnStartTime = Date.now();
    this.pendingChallenge = null;
    return { success: true, action: 'challenge_failed', penalizedPlayerId: challenger.id, drawCount: penaltyCards.length };
  }

  _updateUnoRisk(playerId) {
    if (!this.rules.unoPenaltyEnabled) return;
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.cards.length !== 1) {
      if (this.unoRisk?.playerId === playerId) this.unoRisk = null;
      return;
    }

    if (!this.unoCalled[playerId]) {
      this.unoRisk = {
        playerId,
        deadline: Date.now() + UNO_CALL_WINDOW,
        penalized: false
      };
    }
  }

  _applyExpiredUnoPenalty(now = Date.now()) {
    if (!this.rules.unoPenaltyEnabled || !this.unoRisk || this.unoRisk.penalized) return null;
    if (now < this.unoRisk.deadline) return null;

    const player = this.players.find(p => p.id === this.unoRisk.playerId);
    if (!player || player.cards.length !== 1 || this.unoCalled[player.id]) {
      this.unoRisk = null;
      return null;
    }

    const penaltyCards = this.deck.draw(2);
    player.cards.push(...penaltyCards);
    const result = { playerId: player.id, drawCount: penaltyCards.length };
    this.unoRisk = null;
    return result;
  }

  callUno(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false };
    if (player.cards.length !== 1 && player.cards.length !== 2) return { success: false };
    this.unoCalled[playerId] = true;
    if (this.unoRisk?.playerId === playerId) this.unoRisk = null;
    return { success: true };
  }

  forgotUno(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;
    if (player.cards.length === 1 && !this.unoCalled[playerId]) {
      const penaltyCards = this.deck.draw(2);
      player.cards.push(...penaltyCards);
      if (this.unoRisk?.playerId === playerId) this.unoRisk = null;
      return true;
    }
    return false;
  }

  _finishRound(winnerId) {
    this._markPlayerFinished(winnerId);
    this._checkGameEnd();
  }

  getPublicState(playerId = null) {
    const discards = this.deck?._discardPile || [];
    const recentDiscards = discards.slice(-30).map(c => c.serialize());
    return {
      gameId: this.gameId,
      phase: this.phase,
      currentPlayerIndex: this.currentPlayerIndex,
      direction: this.direction,
      currentCard: this.currentCard?.serialize() || null,
      selectedColor: this.selectedColor,
      winner: this.winner,
      loser: this.loser,
      finishedPlayers: [...this.finishedPlayers],
      finishOrder: [...this.finishOrder],
      recentDiscards,
      turnStartTime: this.turnStartTime,
      lastEventId: this.lastEventId,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isReady: p.isReady,
        connected: p.connected,
        cardCount: p.cards.length,
        finished: this.finishedPlayers.has(p.id),
        ...(p.id === playerId ? { cards: p.cards.map(c => c.serialize()) } : {})
      })),
      deckCount: this.deck?.remaining || 0,
      discardCount: this.deck?._discardPile?.length || 0,
      mustDraw: this.mustDraw,
      pendingDrawCount: this.pendingDrawCount,
      penaltyStackCardType: this.penaltyStackCardType,
      skipAfterDraw: this.skipAfterDraw,
      rules: this.getRules(),
      pendingChallenge: this.pendingChallenge ? {
        challengerId: this.pendingChallenge.challengerId,
        drawCount: this.pendingChallenge.drawCount
      } : null,
      unoRisk: this.unoRisk ? { playerId: this.unoRisk.playerId, deadline: this.unoRisk.deadline } : null,
      scoring: { ...this.scoring },
      roundScores: { ...this.roundScores },
      matchWinner: this.matchWinner,
      lastAction: this.lastAction,
      devPenaltyTest: !!this.devPenaltyTest
    };
  }

  serialize() {
    const discards = this.deck?._discardPile || [];
    const recentDiscards = discards.slice(-30).map(c => c.serialize());
    return {
      gameId: this.gameId,
      phase: this.phase,
      players: this.players.map(p => ({
        ...p,
        cards: p.cards.map(c => c.serialize()),
        cardCount: p.cards.length
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      direction: this.direction,
      deck: this.deck?.serialize() || null,
      currentCard: this.currentCard?.serialize() || null,
      selectedColor: this.selectedColor,
      winner: this.winner,
      loser: this.loser,
      finishedPlayers: [...this.finishedPlayers],
      finishOrder: [...this.finishOrder],
      unoCalled: { ...this.unoCalled },
      recentDiscards,
      turnStartTime: this.turnStartTime,
      lastEventId: this.lastEventId,
      mustDraw: this.mustDraw,
      pendingDrawCount: this.pendingDrawCount,
      penaltyStackCardType: this.penaltyStackCardType,
      skipAfterDraw: this.skipAfterDraw,
      deckCount: this.deck?.remaining || 0,
      rules: this.getRules(),
      pendingChallenge: this.pendingChallenge,
      unoRisk: this.unoRisk,
      scoring: { ...this.scoring },
      roundScores: { ...this.roundScores },
      matchWinner: this.matchWinner,
      lastAction: this.lastAction
    };
  }

  static deserialize(data) {
    const state = new GameState();
    state.gameId = data.gameId;
    state.phase = data.phase;
    state.players = data.players.map(p => ({
      ...p,
      cards: p.cards.map(c => Card.deserialize ? Card.deserialize(c) : c)
    }));
    state.currentPlayerIndex = data.currentPlayerIndex;
    state.direction = data.direction;
    state.deck = data.deck ? Deck.deserialize(data.deck) : null;
    state.currentCard = data.currentCard ? Card.deserialize(data.currentCard) : null;
    state.selectedColor = data.selectedColor;
    state.winner = data.winner;
    state.loser = data.loser || null;
    state.finishedPlayers = new Set(data.finishedPlayers || []);
    state.finishOrder = data.finishOrder || [];
    state.unoCalled = data.unoCalled || {};
    state.turnStartTime = data.turnStartTime;
    state.lastEventId = data.lastEventId;
    state.mustDraw = data.mustDraw || false;
    state.pendingDrawCount = data.pendingDrawCount || 0;
    state.penaltyStackCardType = data.penaltyStackCardType || null;
    state.skipAfterDraw = data.skipAfterDraw || false;
    state.rules = getPlayRules(data.rules || {});
    state.pendingChallenge = data.pendingChallenge || null;
    state.unoRisk = data.unoRisk || null;
    state.scoring = data.scoring || {};
    state.roundScores = data.roundScores || {};
    state.matchWinner = data.matchWinner || null;
    state.lastAction = data.lastAction || null;
    return state;
  }

  _applySync(data) {
    const newState = GameState.deserialize(data);
    this.phase = newState.phase;
    this.players = newState.players;
    this.currentPlayerIndex = newState.currentPlayerIndex;
    this.direction = newState.direction;
    this.deck = newState.deck;
    this.currentCard = newState.currentCard;
    this.selectedColor = newState.selectedColor;
    this.winner = newState.winner;
    this.loser = newState.loser;
    this.finishedPlayers = newState.finishedPlayers;
    this.finishOrder = newState.finishOrder;
    this.unoCalled = newState.unoCalled;
    this.turnStartTime = newState.turnStartTime;
    this.lastEventId = newState.lastEventId;
    this.mustDraw = newState.mustDraw;
    this.pendingDrawCount = newState.pendingDrawCount;
    this.penaltyStackCardType = newState.penaltyStackCardType;
    this.skipAfterDraw = newState.skipAfterDraw;
    this.rules = newState.rules;
    this.pendingChallenge = newState.pendingChallenge;
    this.unoRisk = newState.unoRisk;
    this.scoring = newState.scoring;
    this.roundScores = newState.roundScores;
    this.matchWinner = newState.matchWinner;
    this.lastAction = newState.lastAction;
  }
}
