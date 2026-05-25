import { LocalStorage } from './LocalStorage.js';
import { IndexedDB } from './IndexedDB.js';

export class SessionManager {
  static async init() {
    const name = LocalStorage.getPlayerName();
    const lastRoom = LocalStorage.getLastRoom();
    const settings = LocalStorage.getSettings();
    return { name, lastRoom, settings };
  }

  static saveSession(sessionData) {
    LocalStorage.set('last_session', {
      ...sessionData,
      savedAt: Date.now()
    });
    if (sessionData.roomCode) {
      LocalStorage.setLastRoom(sessionData.roomCode);
    }
    IndexedDB.saveSession(sessionData);
  }

  static getSession() {
    return LocalStorage.get('last_session', null);
  }

  static clearSession() {
    LocalStorage.remove('last_session');
    LocalStorage.remove('last_room');
  }

  static savePlayerName(name) {
    LocalStorage.setPlayerName(name);
  }

  static getPlayerName() {
    return LocalStorage.getPlayerName() || `Player_${Math.random().toString(36).substr(2, 4)}`;
  }

  static saveSettings(settings) {
    LocalStorage.setSettings(settings);
  }

  static getSettings() {
    return LocalStorage.getSettings();
  }

  static getLastRoom() {
    return LocalStorage.getLastRoom();
  }

  static async hasReconnectSession() {
    const session = this.getSession();
    if (!session || !session.roomCode) return false;

    const indexedSession = await IndexedDB.getSession();
    return indexedSession !== null;
  }

  static async getReconnectData() {
    const session = this.getSession();
    const indexedSession = await IndexedDB.getSession();
    return { session, indexedSession };
  }

  static clearAll() {
    this.clearSession();
    LocalStorage.clear();
  }
}
