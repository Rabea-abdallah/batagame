const DB_NAME = 'BattaUNO';
const DB_VERSION = 1;

export class IndexedDB {
  static async _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('game_sessions')) {
          db.createObjectStore('game_sessions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('player_profiles')) {
          const store = db.createObjectStore('player_profiles', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('game_history')) {
          const store = db.createObjectStore('game_history', { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  static async save(storeName, data) {
    try {
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(data);

        request.onsuccess = () => {
          tx.commit();
          resolve(true);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (e) {
      console.warn('[IndexedDB] Save error:', e);
      return false;
    }
  }

  static async get(storeName, key) {
    try {
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (e) {
      console.warn('[IndexedDB] Get error:', e);
      return null;
    }
  }

  static async getAll(storeName) {
    try {
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (e) {
      console.warn('[IndexedDB] GetAll error:', e);
      return [];
    }
  }

  static async delete(storeName, key) {
    try {
      const db = await this._openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
          tx.commit();
          resolve(true);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (e) {
      console.warn('[IndexedDB] Delete error:', e);
      return false;
    }
  }

  static async saveSession(sessionData) {
    return this.save('game_sessions', {
      id: sessionData.playerId || 'current_session',
      ...sessionData,
      savedAt: Date.now()
    });
  }

  static async getSession() {
    return this.get('game_sessions', 'current_session');
  }

  static async saveGameHistory(gameData) {
    return this.save('game_history', {
      ...gameData,
      timestamp: Date.now()
    });
  }

  static async getGameHistory(limit = 20) {
    const all = await this.getAll('game_history');
    return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  static async cacheAsset(key, data) {
    return this.save('cache', { key, data, cachedAt: Date.now() });
  }

  static async getCachedAsset(key) {
    const result = await this.get('cache', key);
    return result ? result.data : null;
  }
}
