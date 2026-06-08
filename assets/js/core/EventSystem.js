export class EventSystem {
  constructor() {
    this._listeners = new Map();
    this._onceListeners = new Map();
    this._idCounter = 0;
  }

  on(event, callback, context = null) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Map());
    }
    const id = ++this._idCounter;
    this._listeners.get(event).set(id, { callback, context });
    return () => this.off(event, id);
  }

  once(event, callback, context = null) {
    if (!this._onceListeners.has(event)) {
      this._onceListeners.set(event, new Map());
    }
    const id = ++this._idCounter;
    this._onceListeners.get(event).set(id, { callback, context });
    return () => this.off(event, id);
  }

  off(event, id) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(id);
    }
    if (this._onceListeners.has(event)) {
      this._onceListeners.get(event).delete(id);
    }
  }

  emit(event, data = null) {
    if (this._listeners.has(event)) {
      const listenerMap = this._listeners.get(event);
      const listeners = [...listenerMap.entries()];
      for (const [id, { callback, context }] of listeners) {
        if (!listenerMap.has(id)) continue;
        try {
          callback.call(context, data);
        } catch (e) {
          console.error(`[EventSystem] Error in listener for ${event}:`, e);
        }
      }
    }
    if (this._onceListeners.has(event)) {
      const onceMap = this._onceListeners.get(event);
      const onceListeners = [...onceMap.entries()];
      for (const [id, { callback, context }] of onceListeners) {
        if (!onceMap.has(id)) continue;
        try {
          callback.call(context, data);
        } catch (e) {
          console.error(`[EventSystem] Error in once-listener for ${event}:`, e);
        }
        onceMap.delete(id);
      }
    }
  }

  removeAll(event = null) {
    if (event) {
      this._listeners.delete(event);
      this._onceListeners.delete(event);
    } else {
      this._listeners.clear();
      this._onceListeners.clear();
    }
  }

  listenerCount(event) {
    return (this._listeners.get(event)?.size || 0) + (this._onceListeners.get(event)?.size || 0);
  }
}

export const eventBus = new EventSystem();
