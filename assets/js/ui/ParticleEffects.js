import { COLORS } from '../core/Constants.js';

export class ParticleEffects {
  constructor(container) {
    this._container = container;
    this._particles = [];
    this._animationId = null;
  }

  celebrate(winnerName = 'Winner!') {
    this._spawnConfetti(100);
    this._spawnText(winnerName);
    this._animate();
  }

  _spawnConfetti(count) {
    const colors = Object.values(COLORS).map(c => c.hex);
    for (let i = 0; i < count; i++) {
      const particle = {
        x: Math.random() * window.innerWidth,
        y: -20,
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * 4 + 2,
        size: Math.random() * 10 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
        life: 1,
        decay: 0.005 + Math.random() * 0.01,
        shape: Math.random() > 0.5 ? 'rect' : 'circle'
      };
      this._particles.push(particle);
    }
  }

  _spawnText(text) {
    const el = document.createElement('div');
    el.className = 'particle-text';
    el.textContent = text;
    el.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0);
      font-size: 4rem;
      font-weight: 900;
      color: #F1C40F;
      text-shadow: 0 0 20px rgba(241,196,15,0.8), 0 4px 8px rgba(0,0,0,0.5);
      z-index: 10000;
      pointer-events: none;
      transition: transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      font-family: 'Segoe UI', system-ui, sans-serif;
      text-align: center;
    `;
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    setTimeout(() => {
      el.style.transform = 'translate(-50%, -50%) scale(0)';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 3000);
  }

  _animate() {
    this._particles = this._particles.filter(p => p.life > 0);

    if (this._particles.length === 0) {
      this._cleanup();
      return;
    }

    for (const p of this._particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.rotation += p.rotationSpeed;
      p.life -= p.decay;
      p.opacity = p.life;
    }

    this._draw();
    this._animationId = requestAnimationFrame(() => this._animate());
  }

  _draw() {
    const existing = this._container.querySelector('.particles-canvas');
    if (!existing) {
      const canvas = document.createElement('canvas');
      canvas.className = 'particles-canvas';
      canvas.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 9999;
      `;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      document.body.appendChild(canvas);
      this._canvas = canvas;
      this._ctx = canvas.getContext('2d');
    }

    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    for (const p of this._particles) {
      this._ctx.save();
      this._ctx.translate(p.x, p.y);
      this._ctx.rotate((p.rotation * Math.PI) / 180);
      this._ctx.globalAlpha = p.opacity;
      this._ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        this._ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        this._ctx.beginPath();
        this._ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        this._ctx.fill();
      }

      this._ctx.restore();
    }
  }

  _cleanup() {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
    if (this._canvas) {
      this._canvas.remove();
      this._canvas = null;
      this._ctx = null;
    }
    this._particles = [];
  }
}
