import { Card } from '../game/Card.js';
import { CardRenderer } from './CardRenderer.js';

const EASE_OUT = 'cubic-bezier(0.22, 0.85, 0.28, 1)';

function center(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

/** Read duration from CSS custom property (e.g. --anim-card-fly). */
export function getAnimMs(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  if (raw.endsWith('ms')) return parseFloat(raw) || fallback;
  if (raw.endsWith('s')) return (parseFloat(raw) || 0) * 1000;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function getAnimLift(fallback = 36) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--anim-card-lift').trim();
  if (!raw) return fallback;
  if (raw.endsWith('px')) return parseFloat(raw) || fallback;
  return parseFloat(raw) || fallback;
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/** iOS / mobile browser: align fixed layer with visible viewport. */
function getFlightLayerOffset() {
  const vv = window.visualViewport;
  if (!vv) return { x: 0, y: 0 };
  return { x: vv.offsetLeft || 0, y: vv.offsetTop || 0 };
}

function normalizeRect(rect) {
  const o = getFlightLayerOffset();
  return {
    left: rect.left - o.x,
    top: rect.top - o.y,
    width: rect.width,
    height: rect.height,
    right: rect.right - o.x,
    bottom: rect.bottom - o.y
  };
}

function getDiscardTargetRect(discardEl) {
  if (!discardEl) return null;
  const card = discardEl.querySelector('.card--face-up, .card');
  return (card || discardEl).getBoundingClientRect();
}

export class CardAnimation {
  static _queue = Promise.resolve();

  static enqueue(task) {
    const run = async () => {
      try {
        await task();
      } catch (_) {
        /* ignore */
      }
    };
    const next = this._queue.then(run);
    this._queue = next;
    return next;
  }

  static _getLayer() {
    let layer = document.getElementById('card-flight-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'card-flight-layer';
      layer.className = 'card-flight-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    return layer;
  }

  static pulseDeck() {
    const deck = document.getElementById('draw-pile');
    if (!deck) return;
    deck.classList.remove('draw-pile--pulse');
    void deck.offsetWidth;
    deck.classList.add('draw-pile--pulse');
    const ms = getAnimMs('--anim-card-draw', 880) * 0.5;
    setTimeout(() => deck.classList.remove('draw-pile--pulse'), ms);
  }

  static snapToDiscard(element, discardEl) {
    const toRect = getDiscardTargetRect(discardEl);
    const layer = this._getLayer();
    const layerBox = layer.getBoundingClientRect();
    element.style.left = `${toRect.left - layerBox.left}px`;
    element.style.top = `${toRect.top - layerBox.top}px`;
    element.style.width = `${toRect.width}px`;
    element.style.height = `${toRect.height}px`;
    element.style.transform = 'none';
    element.style.opacity = '1';
  }

  static mountOnDiscard(element, discardEl) {
    if (!element || !discardEl) {
      element?.remove();
      return;
    }

    const existing = discardEl.querySelector('.card:not(.card--flying-landed)');
    const flyId = element.dataset?.cardId;
    if (existing && flyId && String(existing.dataset?.cardId) === String(flyId)) {
      element.remove();
      return;
    }
    if (existing) existing.classList.add('card--under-fly');

    element.classList.remove('card--flying-play', 'card--flying-draw');
    element.classList.add('card--flying-landed', 'card--silent');
    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = '0';
    element.style.right = '0';
    element.style.bottom = '0';
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.margin = '0';
    element.style.transform = 'none';
    element.style.opacity = '1';
    element.style.zIndex = '2';
    element.style.boxShadow = 'var(--shadow-card)';

    discardEl.appendChild(element);
  }

  static pulseDiscard() {
    const discard = document.getElementById('discard-active');
    if (!discard) return;
    discard.classList.remove('discard-active--land');
    void discard.offsetWidth;
    discard.classList.add('discard-active--land');
    const ms = getAnimMs('--anim-card-discard-enter', 400) * 1.1;
    setTimeout(() => discard.classList.remove('discard-active--land'), ms);
  }

  static fly(element, fromRect, toRect, options = {}) {
    if (!element || !fromRect || !toRect) {
      element?.remove();
      return Promise.resolve();
    }

    if (prefersReducedMotion()) {
      element.remove();
      return Promise.resolve();
    }

    const from = normalizeRect(fromRect);
    const to = normalizeRect(toRect);

    const duration = options.duration ?? getAnimMs('--anim-card-fly', 920);
    const w = options.width ?? Math.max(from.width, 32);
    const h = options.height ?? Math.max(from.height, 44);
    const fromC = center(from);
    const toC = center(to);
    const lift = options.lift ?? getAnimLift(36);
    const rotateStart = options.rotateStart ?? 0;
    const rotateEnd = options.rotateEnd ?? 8;
    const scaleEnd = options.scaleEnd ?? 0.9;
    const fadeEnd = options.fadeEnd ?? false;

    element.classList.add(options.flyingClass || 'card--flying');
    element.style.position = 'absolute';
    element.style.left = `${fromC.x - w / 2}px`;
    element.style.top = `${fromC.y - h / 2}px`;
    element.style.width = `${w}px`;
    element.style.height = `${h}px`;
    element.style.margin = '0';
    element.style.pointerEvents = 'none';
    element.style.touchAction = 'none';
    element.style.webkitTouchCallout = 'none';
    element.style.userSelect = 'none';
    element.style.willChange = 'transform, opacity';
    element.style.boxShadow = options.shadow ?? '0 14px 40px rgba(0,0,0,0.55)';
    element.style.transform = 'translateZ(0)';

    const layer = this._getLayer();
    const z = getComputedStyle(document.documentElement).getPropertyValue('--z-card-flying').trim() || '10050';
    layer.style.zIndex = z;
    layer.appendChild(element);

    const dx = toC.x - fromC.x;
    const dy = toC.y - fromC.y;

    if (typeof element.animate === 'function') {
      const anim = element.animate([
        {
          transform: `translate3d(0, 0, 0) rotate(${rotateStart}deg) scale(1)`,
          opacity: 1
        },
        {
          transform: `translate3d(${dx * 0.48}px, ${dy * 0.48 - lift}px, 0) rotate(${(rotateStart + rotateEnd) / 2}deg) scale(1.05)`,
          opacity: 1,
          offset: 0.52
        },
        {
          transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${rotateEnd}deg) scale(${scaleEnd})`,
          opacity: fadeEnd ? 0.15 : 1
        }
      ], { duration, easing: EASE_OUT, fill: 'forwards' });

      return anim.finished
        .catch(() => {})
        .then(() => this._finishFly(element, options));
    }

    return new Promise(resolve => {
      requestAnimationFrame(() => {
        element.style.transition = `transform ${duration}ms ${EASE_OUT}${fadeEnd ? `, opacity ${duration - 100}ms ease-out` : ''}`;
        element.style.transform = `translate3d(${dx}px, ${dy - lift * 0.35}px, 0) rotate(${rotateEnd}deg) scale(${scaleEnd})`;
        if (fadeEnd) element.style.opacity = '0.12';
        setTimeout(() => {
          this._finishFly(element, options);
          resolve();
        }, duration + 50);
      });
    });
  }

  static _finishFly(element, options) {
    if (options.landOnDiscard) {
      this.snapToDiscard(element, options.landOnDiscard);
      this.mountOnDiscard(element, options.landOnDiscard);
    } else {
      element.remove();
    }
    if (options.pulseDiscard) this.pulseDiscard();
  }

  static _placeInLayer(element, rect) {
    const norm = normalizeRect(rect);
    const c = center(norm);
    const w = norm.width;
    const h = norm.height;
    element.style.position = 'absolute';
    element.style.left = `${c.x - w / 2}px`;
    element.style.top = `${c.y - h / 2}px`;
    element.style.width = `${w}px`;
    element.style.height = `${h}px`;
    element.style.margin = '0';
    element.style.pointerEvents = 'none';
    element.style.touchAction = 'none';
    element.style.zIndex = '1';
    element.style.transformStyle = 'preserve-3d';
    element.style.transform = 'rotateY(0deg)';
    element.style.opacity = '1';
  }

  /**
   * Private draw: reveal face at deck (local player only), flip to back, fly to hand.
   */
  static drawToHandPrivate(cardData, toRect) {
    const deck = document.getElementById('draw-pile');
    if (!deck || !toRect || !cardData) {
      return this.fromDeckToRect(toRect, { scaleEnd: 1, fadeEnd: false });
    }

    if (prefersReducedMotion()) {
      return this.fromDeckToRect(toRect, { scaleEnd: 1, fadeEnd: false });
    }

    this.pulseDeck();
    const fromRect = deck.getBoundingClientRect();
    const card = Card.deserialize ? Card.deserialize(cardData) : cardData;
    const flipper = CardRenderer.renderDrawFlipper(card);

    const revealMs = getAnimMs('--anim-card-draw-reveal', 820);
    const flipMs = getAnimMs('--anim-card-draw-flip', 420);

    this._placeInLayer(flipper, fromRect);
    const layer = this._getLayer();
    layer.appendChild(flipper);

    return new Promise(resolve => {
      setTimeout(() => {
        flipper.classList.remove('card-flipper--revealing');
        flipper.classList.add('card-flipper--face-down');
        setTimeout(() => {
          const flyFrom = flipper.getBoundingClientRect();
          const backFly = CardRenderer.renderBack();
          backFly.classList.remove('card--deck');
          backFly.classList.add('card--flying-draw');
          flipper.remove();
          this._placeInLayer(backFly, flyFrom);
          layer.appendChild(backFly);
          this.fly(backFly, flyFrom, toRect, {
            duration: getAnimMs('--anim-card-draw', 880),
            fadeEnd: false,
            scaleEnd: 1,
            rotateEnd: 2,
            flyingClass: 'card--flying-draw',
            width: toRect.width,
            height: toRect.height,
            pulseDiscard: false
          }).then(resolve);
        }, flipMs);
      }, revealMs);
    });
  }

  static fromDeckToRect(toRect, options = {}) {
    const deck = document.getElementById('draw-pile');
    if (!deck || !toRect) return Promise.resolve();
    this.pulseDeck();
    const fromRect = deck.getBoundingClientRect();
    const card = CardRenderer.renderBack();
    card.classList.add('card--flying-draw');
    return this.fly(card, fromRect, toRect, {
      duration: options.duration ?? getAnimMs('--anim-card-draw', 880),
      rotateEnd: options.rotateEnd ?? 4,
      scaleEnd: options.scaleEnd ?? 0.92,
      flyingClass: 'card--flying-draw',
      width: options.width ?? toRect.width,
      height: options.height ?? toRect.height,
      ...options
    });
  }

  static fromElementToRect(element, fromRect, toRect, options = {}) {
    const clone = element.cloneNode(true);
    clone.classList.remove('card--playable', 'card--pending-draw', 'card--playing-out');
    return this.fly(clone, fromRect, toRect, {
      duration: options.duration ?? getAnimMs('--anim-card-play', 940),
      flyingClass: 'card--flying-play',
      pulseDiscard: options.pulseDiscard ?? true,
      fadeEnd: false,
      scaleEnd: 1,
      rotateEnd: options.rotateEnd ?? 4,
      width: options.width ?? fromRect.width,
      height: options.height ?? fromRect.height,
      ...options
    });
  }

  static playCardToDiscard(cardElement, fromRect) {
    const discard = document.getElementById('discard-active');
    if (!discard) {
      cardElement?.remove?.();
      return Promise.resolve();
    }
    const toRect = getDiscardTargetRect(discard);
    return this.fromElementToRect(cardElement, fromRect, toRect, {
      landOnDiscard: discard,
      rotateEnd: 4,
      scaleEnd: 1,
      width: toRect.width,
      height: toRect.height
    });
  }

  static opponentPlayToDiscard(playerId, cardData) {
    const opponent = document.querySelector(`.opponent[data-player-id="${playerId}"]`);
    const discard = document.getElementById('discard-active');
    if (!opponent || !discard) return Promise.resolve();

    const fromRect = opponent.getBoundingClientRect();
    const toRect = getDiscardTargetRect(discard);
    let flying;
    if (cardData) {
      const card = Card.deserialize ? Card.deserialize(cardData) : cardData;
      flying = CardRenderer.render(card, true, false);
    } else {
      flying = CardRenderer.renderBack();
    }
    flying.classList.add('card--flying-play');
    return this.fly(flying, fromRect, toRect, {
      duration: getAnimMs('--anim-card-play', 940),
      rotateEnd: -4,
      scaleEnd: 1,
      fadeEnd: false,
      pulseDiscard: true,
      flyingClass: 'card--flying-play',
      landOnDiscard: discard,
      width: toRect.width,
      height: toRect.height
    });
  }

  static opponentDrawFromDeck(playerId, count = 1) {
    const opponent = document.querySelector(`.opponent[data-player-id="${playerId}"]`);
    if (!opponent) return Promise.resolve();

    const toRect = opponent.getBoundingClientRect();
    const tasks = [];
    const n = Math.min(Math.max(count, 1), 4);
    const stagger = getAnimMs('--anim-card-stagger', 150);

    for (let i = 0; i < n; i++) {
      tasks.push(
        new Promise(resolve => {
          setTimeout(() => {
            this.fromDeckToRect(toRect, {
              scaleEnd: 0.55,
              rotateEnd: 2 + i * 2
            }).then(resolve);
          }, i * stagger);
        })
      );
    }
    return Promise.all(tasks).then(() => {});
  }

  static dealBurst(fromRect, toRect, index = 0, isMe = false) {
    const card = CardRenderer.renderBack();
    const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-width')) || 70;
    const h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-height')) || 100;
    return this.fly(card, fromRect, toRect, {
      duration: getAnimMs('--anim-card-deal', 520),
      lift: getAnimLift(24),
      scaleEnd: isMe ? 0.9 : 0.58,
      rotateEnd: (index % 2 === 0 ? 1 : -1) * 4,
      width: w,
      height: h
    });
  }
}

/** Keep flying cards aligned when mobile browser chrome / orientation changes. */
if (typeof window !== 'undefined') {
  const reflow = () => {
    const layer = document.getElementById('card-flight-layer');
    if (!layer) return;
    const o = getFlightLayerOffset();
    layer.style.transform = `translate(${o.x}px, ${o.y}px)`;
  };
  window.visualViewport?.addEventListener('resize', reflow);
  window.visualViewport?.addEventListener('scroll', reflow);
  window.addEventListener('orientationchange', reflow);
  window.addEventListener('resize', reflow);
}
