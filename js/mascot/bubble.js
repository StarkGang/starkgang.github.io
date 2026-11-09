import { TUNING } from './tuning.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Bubble {
  constructor({ mascot, reducedMotion = false }) {
    this.m = mascot;
    this.reduced = reducedMotion;
    this.el = document.createElement('div');
    this.el.className = 'mascot-bubble';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML =
      '<div class="mascot-bubble-title"></div><div class="mascot-bubble-text"></div><i class="mascot-bubble-arrow"></i>';
    document.body.appendChild(this.el);
    this.titleEl = this.el.querySelector('.mascot-bubble-title');
    this.textEl = this.el.querySelector('.mascot-bubble-text');
    this.arrow = this.el.querySelector('.mascot-bubble-arrow');
    this.visible = false;
    this.typeTimer = null;
    this.hideTimer = null;
    this.text = '';
  }

  say(text, { title = '', hold = 0 } = {}) {
    if (!text) return;
    clearTimeout(this.hideTimer);
    clearInterval(this.typeTimer);
    this.text = text;
    this.titleEl.textContent = title || '';
    this.titleEl.style.display = title ? 'block' : 'none';
    this.el.classList.toggle('has-title', Boolean(title));
    this.el.classList.add('visible');
    this.el.classList.remove('hidden');
    this.visible = true;

    if (this.reduced) {
      this.textEl.textContent = text;
    } else {
      this.textEl.textContent = '';
      let i = 0;
      this.typeTimer = setInterval(() => {
        i += 2;
        this.textEl.textContent = text.slice(0, i);
        if (i >= text.length) clearInterval(this.typeTimer);
      }, 22);
    }

    const read = Math.max(2800, 1100 + text.length * 48) + hold;
    this.hideTimer = setTimeout(() => this.hide(), read);
    this.update();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    clearInterval(this.typeTimer);
    this.el.classList.remove('visible');
    this.el.classList.add('hidden');
  }

  update() {
    if (!this.visible) return;
    const anchor = this.m.headCss();
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const m = TUNING.bubble.margin;
    const left = clamp(anchor.x - w / 2, m, Math.max(m, W - w - m));
    let below = false;
    let top = anchor.y - h - TUNING.bubble.gap;
    if (top < m) {
      top = anchor.y + 34;
      below = true;
    }
    top = clamp(top, m, Math.max(m, H - h - m));
    this.el.classList.toggle('below', below);
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
    const arrowX = clamp(anchor.x - left, 16, Math.max(16, w - 16));
    this.arrow.style.left = `${Math.round(arrowX)}px`;
  }
}

