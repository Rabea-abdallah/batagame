export class Notification {
  static show(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `notification notification--${type}`;
    el.innerHTML = `
      <div class="notification__icon">${this._getIcon(type)}</div>
      <div class="notification__message">${message}</div>
      <button class="notification__close">&times;</button>
    `;

    el.querySelector('.notification__close').addEventListener('click', () => {
      this._remove(el);
    });

    container.appendChild(el);

    requestAnimationFrame(() => {
      el.classList.add('notification--visible');
    });

    if (duration > 0) {
      setTimeout(() => this._remove(el), duration);
    }

    return el;
  }

  static success(message, duration = 3000) {
    return this.show(message, 'success', duration);
  }

  static error(message, duration = 4000) {
    return this.show(message, 'error', duration);
  }

  static warning(message, duration = 3500) {
    return this.show(message, 'warning', duration);
  }

  static info(message, duration = 3000) {
    return this.show(message, 'info', duration);
  }

  static _getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || 'ℹ';
  }

  static _remove(el) {
    el.classList.remove('notification--visible');
    el.classList.add('notification--hiding');
    setTimeout(() => el.remove(), 300);
  }
}
