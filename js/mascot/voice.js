
export class Voice {
  constructor({ config }) {
    this.cfg = config || {};
    this.v = this.cfg.voice || {};
    this.owner = (window.CONFIG?.personal?.name || 'the owner').trim();
    this.short = this.owner.split(/\s+/)[0] || this.owner;
    this.last = new Map();
  }

  fill(line) {
    return String(line).replace(/\{name\}/g, this.owner).replace(/\{first\}/g, this.short);
  }

  pick(lines, key = 'misc') {
    if (!Array.isArray(lines) || !lines.length) return '';
    if (lines.length === 1) return this.fill(lines[0]);
    let i = Math.floor(Math.random() * lines.length);
    if (i === this.last.get(key)) i = (i + 1 + Math.floor(Math.random() * (lines.length - 1))) % lines.length;
    this.last.set(key, i);
    return this.fill(lines[i]);
  }

  iconLines(id) {
    const entry = (this.v.icons || {})[id];
    if (entry?.lines?.length) return entry;
    return { title: '', lines: this.v.fallback?.lines || [] };
  }

  windowLines(id) {
    const entry = (this.v.windows || {})[id];
    if (entry?.lines?.length) return entry;
    return this.iconLines(id);
  }

  category(key) {
    return this.pick(this.v[key] || [], key);
  }

  about(kind, id) {
    const entry = kind === 'window' ? this.windowLines(id) : this.iconLines(id);
    return { title: entry.title || '', text: this.pick(entry.lines, `${kind}:${id}`) };
  }
}

