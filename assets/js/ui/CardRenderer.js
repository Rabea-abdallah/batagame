import { CARD_TYPES } from '../core/Constants.js';

export class CardRenderer {
  static render(card, faceUp = true, small = false) {
    const div = document.createElement('div');
    div.className = `card ${faceUp ? 'card--face-up' : 'card--face-down'} ${small ? 'card--small' : ''}`;
    div.dataset.cardId = card.id;

    if (!faceUp) {
      div.innerHTML = '<div class="card__back"><span class="card__back-icon">🦆</span></div>';
      return div;
    }

    if (card.type === CARD_TYPES.WILD) {
      return CardRenderer._renderWildColorCard(div, small);
    }

    const isWildDrawFour = card.type === CARD_TYPES.WILD_DRAW_FOUR;
    const colorClass = isWildDrawFour ? 'wild' : card.color;
    div.classList.add(`card--${colorClass}`);

    let symbol = '';
    let label = '';
    let suit = '';
    switch (card.type) {
      case CARD_TYPES.NUMBER:
        symbol = card.value;
        label = card.value;
        break;
      case CARD_TYPES.SKIP:
        symbol = '⊘';
        label = 'Skip';
        break;
      case CARD_TYPES.REVERSE:
        symbol = '⟳';
        label = 'Reverse';
        break;
      case CARD_TYPES.DRAW_TWO:
        symbol = '+2';
        label = 'Draw 2';
        suit = '💣';
        break;
      case CARD_TYPES.WILD:
        symbol = '⭐';
        label = 'Wild';
        suit = '⭐';
        break;
      case CARD_TYPES.WILD_DRAW_FOUR:
        symbol = '+4';
        label = 'Wild +4';
        suit = '💣';
        break;
    }

    const cornerSuit = suit || (isWildDrawFour ? '⭐' : '');

    div.innerHTML = `
      <div class="card__corner card__corner--top">
        <span class="card__corner-label">${symbol}</span>
        <span class="card__corner-suit">${cornerSuit}</span>
      </div>
      <div class="card__center">
        <span class="card__center-symbol">${symbol}</span>
        <span class="card__center-suit">${suit}</span>
      </div>
      <div class="card__corner card__corner--bottom">
        <span class="card__corner-label">${symbol}</span>
        <span class="card__corner-suit">${cornerSuit}</span>
      </div>
    `;

    return div;
  }

  /** Wild: four color squares (classic UNO color-change card). */
  static _renderWildColorCard(div, small = false) {
    div.classList.add('card--wild', 'card--wild-colors');
    const label = small ? 'W' : 'Wild';
    div.innerHTML = `
      <div class="card__corner card__corner--top">
        <span class="card__corner-label">${label}</span>
      </div>
      <div class="card__center card__center--wild-colors" aria-hidden="true">
        <div class="card__wild-grid">
          <span class="card__wild-swatch card__wild-swatch--red" title="red"></span>
          <span class="card__wild-swatch card__wild-swatch--blue" title="blue"></span>
          <span class="card__wild-swatch card__wild-swatch--green" title="green"></span>
          <span class="card__wild-swatch card__wild-swatch--yellow" title="yellow"></span>
        </div>
      </div>
      <div class="card__corner card__corner--bottom">
        <span class="card__corner-label">${label}</span>
      </div>
    `;
    return div;
  }

  /** Face + back wrapper for private draw reveal then flip. */
  static renderDrawFlipper(card) {
    const wrap = document.createElement('div');
    wrap.className = 'card-flipper card-flipper--revealing';
    const front = this.render(card, true, false);
    const back = this.renderBack();
    back.classList.remove('card--deck');
    front.classList.add('card-flipper__face', 'card-flipper__front');
    back.classList.add('card-flipper__face', 'card-flipper__back');
    wrap.dataset.cardId = card.id;
    wrap.appendChild(front);
    wrap.appendChild(back);
    return wrap;
  }

  static renderBack() {
    const div = document.createElement('div');
    div.className = 'card card--face-down card--deck';
    div.innerHTML = '<div class="card__back"><span class="card__back-icon">🦆</span><span class="card__back-text">UNO</span></div>';
    return div;
  }

  static renderStackedBacks(count = 3) {
    const container = document.createElement('div');
    container.className = 'card-stack';
    for (let i = count - 1; i >= 0; i--) {
      const card = this.renderBack();
      card.style.position = 'absolute';
      card.style.top = `${i * 3}px`;
      card.style.left = `${i * 2}px`;
      card.style.zIndex = i;
      container.appendChild(card);
    }
    container.style.position = 'relative';
    container.style.width = 'var(--card-width)';
    container.style.height = `calc(var(--card-height) + ${(count - 1) * 3}px)`;
    return container;
  }

  static renderDiscardStack(topCard, stackCount = 3) {
    const container = document.createElement('div');
    container.className = 'card-stack';
    for (let i = stackCount - 1; i >= 0; i--) {
      let cardEl;
      if (i === 0) {
        cardEl = this.render(topCard, true, false);
      } else {
        cardEl = this.renderBack();
        cardEl.classList.remove('card--deck');
        cardEl.style.opacity = '0.3';
      }
      cardEl.style.position = 'absolute';
      cardEl.style.top = `${(stackCount - 1 - i) * 3}px`;
      cardEl.style.left = `${(stackCount - 1 - i) * 2}px`;
      cardEl.style.zIndex = i;
      container.appendChild(cardEl);
    }
    container.style.position = 'relative';
    container.style.width = 'var(--card-width)';
    container.style.height = `calc(var(--card-height) + ${(stackCount - 1) * 3}px)`;
    return container;
  }

  static renderDiscardFan(cards) {
    if (!cards || !cards.length) return this.renderEmpty();
    const container = document.createElement('div');
    container.className = 'card-fan';
    const count = Math.min(cards.length, 5);
    const offsetX = 18;
    const offsetY = -4;
    const startX = (count - 1) * offsetX / 2;
    for (let i = 0; i < count; i++) {
      const card = cards[i];
      const cardEl = this.render(card, true, false);
      cardEl.style.position = 'absolute';
      cardEl.style.top = `${(count - 1 - i) * offsetY}px`;
      cardEl.style.left = `${i * offsetX - startX}px`;
      cardEl.style.zIndex = i;
      cardEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
      container.appendChild(cardEl);
    }
    container.style.position = 'relative';
    container.style.width = `calc(var(--card-width) + ${(count - 1) * offsetX}px)`;
    container.style.height = `calc(var(--card-height) + ${(count - 1) * Math.abs(offsetY)}px)`;
    return container;
  }

  static renderDiscardRow(cards) {
    if (!cards || !cards.length) return document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'discard-row';
    for (let i = 0; i < cards.length; i++) {
      const cardEl = this.render(cards[i], true, true);
      cardEl.style.flexShrink = '0';
      container.appendChild(cardEl);
    }
    return container;
  }

  static renderEmpty() {
    const div = document.createElement('div');
    div.className = 'card card--empty';
    return div;
  }

  static renderColorPicker(onSelect) {
    const container = document.createElement('div');
    container.className = 'color-picker';
    container.innerHTML = `
      <div class="color-picker__card">
        <button class="color-picker__btn color-picker__btn--red" data-color="red">🔴 أحمر</button>
        <button class="color-picker__btn color-picker__btn--blue" data-color="blue">🔵 أزرق</button>
        <button class="color-picker__btn color-picker__btn--green" data-color="green">🟢 أخضر</button>
        <button class="color-picker__btn color-picker__btn--yellow" data-color="yellow">🟡 أصفر</button>
      </div>
    `;

    container.querySelectorAll('.color-picker__btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const color = el.dataset.color;
        onSelect(color);
        container.remove();
      });
    });

    return container;
  }

  static animateCardPlay(element, targetX, targetY, duration = 300) {
    const rect = element.getBoundingClientRect();
    element.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
    element.style.transform = `translate(${targetX - rect.left}px, ${targetY - rect.top}px) scale(0.8)`;
    element.style.opacity = '0';
    setTimeout(() => {
      element.style.transition = '';
      element.style.transform = '';
      element.style.opacity = '';
    }, duration + 50);
  }

  static animateCardFly(clone, fromRect, toX, toY, duration = 650) {
    clone.style.position = 'fixed';
    clone.style.left = `${fromRect.left}px`;
    clone.style.top = `${fromRect.top}px`;
    clone.style.width = `${fromRect.width}px`;
    clone.style.height = `${fromRect.height}px`;
    clone.style.zIndex = '9999';
    clone.style.pointerEvents = 'none';
    clone.style.margin = '0';
    clone.style.transition = 'none';
    clone.style.transform = 'none';
    clone.style.transformOrigin = 'center center';
    clone.style.boxShadow = '0 12px 36px rgba(0,0,0,0.55)';
    clone.classList.add('card--flying-play');
    document.body.appendChild(clone);

    const startX = parseInt(clone.style.left);
    const startY = parseInt(clone.style.top);
    const dx = toX - startX - fromRect.width / 2;
    const dy = toY - startY - fromRect.height / 2;

    requestAnimationFrame(() => {
      clone.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.25, 1), opacity ${duration - 80}ms ease-out`;
      clone.style.transform = `translate(${dx}px, ${dy - 18}px) rotate(8deg) rotateY(180deg) scale(0.72)`;
      clone.style.opacity = '0.12';
      setTimeout(() => clone.remove(), duration + 50);
    });
  }

  static animateCardDraw(element, fromX, fromY, duration = 300) {
    element.style.transition = `transform ${duration}ms ease-out`;
    element.style.transform = `translate(${fromX}px, ${fromY}px)`;
    requestAnimationFrame(() => {
      element.style.transform = 'translate(0, 0)';
    });
    setTimeout(() => {
      element.style.transition = '';
      element.style.transform = '';
    }, duration + 50);
  }
}
