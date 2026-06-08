export class Scoring {
  constructor() {
    this._scores = new Map();
    this._rounds = [];
  }

  initPlayers(playerIds) {
    for (const id of playerIds) {
      this._scores.set(id, 0);
    }
  }

  addRound(roundScores) {
    this._rounds.push({ ...roundScores });
    for (const [playerId, score] of Object.entries(roundScores)) {
      const current = this._scores.get(playerId) || 0;
      this._scores.set(playerId, current + score);
    }
  }

  getScore(playerId) {
    return this._scores.get(playerId) || 0;
  }

  getAllScores() {
    const result = {};
    for (const [id, score] of this._scores) {
      result[id] = score;
    }
    return result;
  }

  getLeader() {
    let leader = null;
    let maxScore = -1;
    for (const [id, score] of this._scores) {
      if (score > maxScore) {
        maxScore = score;
        leader = id;
      }
    }
    return leader;
  }

  getRanking() {
    return [...this._scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => ({ id, score }));
  }

  serialize() {
    return {
      scores: [...this._scores.entries()].map(([k, v]) => [k, v]),
      rounds: this._rounds
    };
  }

  static deserialize(data) {
    const scoring = new Scoring();
    scoring._scores = new Map(data.scores);
    scoring._rounds = data.rounds;
    return scoring;
  }
}
