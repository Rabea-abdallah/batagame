import { getPlayRules } from '../core/Constants.js';

const PREFIX = 'batta_uno_';

export class LocalStorage {
  static set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(PREFIX + key, serialized);
      return true;
    } catch (e) {
      console.warn('[LocalStorage] Failed to set:', key, e);
      return false;
    }
  }

  static get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(PREFIX + key);
      if (item === null) return defaultValue;
      return JSON.parse(item);
    } catch (e) {
      console.warn('[LocalStorage] Failed to get:', key, e);
      return defaultValue;
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      return true;
    } catch (e) {
      return false;
    }
  }

  static exists(key) {
    return localStorage.getItem(PREFIX + key) !== null;
  }

  static clear() {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
      for (const key of keys) {
        localStorage.removeItem(key);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  static getAll() {
    const result = {};
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
      for (const key of keys) {
        const cleanKey = key.slice(PREFIX.length);
        result[cleanKey] = JSON.parse(localStorage.getItem(key));
      }
    } catch (e) {
      console.warn('[LocalStorage] Failed to get all:', e);
    }
    return result;
  }

  static getPlayerName() {
    return this.get('player_name', '');
  }

  static setPlayerName(name) {
    return this.set('player_name', name);
  }

  static getSettings() {
    return this.get('settings', {
      soundEnabled: true,
      musicEnabled: false,
      animationsEnabled: true,
      language: 'ar',
      theme: 'default',
      initialCards: 7,
      aiBotCount: 3,
      rules: getPlayRules()
    });
  }

  static setSettings(settings) {
    return this.set('settings', settings);
  }

  static getRules() {
    const settings = this.getSettings();
    return getPlayRules(settings.rules || {});
  }

  static setRules(rules) {
    const settings = this.getSettings();
    settings.rules = getPlayRules(rules);
    return this.setSettings(settings);
  }

  static getLastRoom() {
    return this.get('last_room', null);
  }

  static setLastRoom(roomCode) {
    return this.set('last_room', roomCode);
  }

  static getVolume() {
    return this.get('volume', 0.7);
  }

  static setVolume(vol) {
    return this.set('volume', Math.max(0, Math.min(1, vol)));
  }
}
