import { TUNING } from './tuning.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class World {
  constructor({ stage }) {
    this.m = stage;
    this.icons = [];
    this.windows = [];
    this.surfaces = [];
    this.rev = 0;
    this.dirty = true;
    this.lastRefreshAt = 0;
    this.cursor = { x: 0, yCss: 0, at: 0, inside: false };
    this._segCache = new Map();
  }

  markDirty() {
    this.dirty = true;
  }

  refresh(force = false) {
    const now = performance.now();
    if (!force && !this.dirty && now - this.lastRefreshAt < 350) return false;
    this.lastRefreshAt = now;
    this.dirty = false;
    this.rev++;
    this._segCache.clear();

    const W = (this.W = window.innerWidth);
    const H = (this.H = window.innerHeight);
    const bar = document.getElementById('taskbar');
    this.floorY = bar ? bar.offsetHeight : 48;

    const charPx = (this.charPx = this.m.charPx || 140);
    this.hw = charPx * TUNING.body.halfWidthRatio;

    this.edge = charPx * TUNING.screen.edgeRatio + TUNING.screen.pad;
    this.bodyH = Math.min(charPx * TUNING.body.collideHeightRatio, TUNING.body.collideMaxPx);
    this.standFit = charPx * TUNING.body.headroomRatio + 4;
    this.sitFit = charPx * TUNING.body.sitHeightRatio + 6;
    this.ceilingY = this.H - this.standFit;
    this.jumpUp = charPx * TUNING.jump.upRatio;
    this.jumpReach = charPx * TUNING.jump.reachRatio;
    this.jumpDrop = charPx * TUNING.jump.reachRatio * TUNING.jump.landRatio;

    const icons = [];
    for (const el of document.querySelectorAll('.desktop-icon')) {
      const id = el.dataset.app;
      if (!id || el.offsetParent === null || el.style.display === 'none') continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w < 6 || h < 6) continue;
      const left = el.offsetLeft;
      const top = el.offsetTop;
      if (left > W || top > H) continue;
      icons.push({
        id,
        el,
        left,
        top,
        right: left + w,
        bottom: top + h,
        w,
        h,
        cx: left + w / 2,
        cy: top + h / 2,
        name: (el.querySelector('.icon-label')?.textContent || id).trim(),
      });
    }
    this.icons = icons;

    const windows = [];
    for (const el of document.querySelectorAll('.window')) {
      if (!el.classList.contains('active') || el.classList.contains('minimizing')) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w < 40 || h < 40) continue;
      const tb = el.querySelector('.window-titlebar');
      windows.push({
        id: (el.id || '').replace(/-window$/, ''),
        el,
        left: el.offsetLeft,
        top: el.offsetTop,
        right: el.offsetLeft + w,
        bottom: el.offsetTop + h,
        w,
        h,
        titleH: tb ? tb.offsetHeight : 40,
        title: (el.querySelector('.window-title')?.textContent || '').trim(),
      });
    }
    this.windows = windows;
    this.surfaces = this._buildSurfaces();
    this.byId = new Map(this.surfaces.map((s) => [s.id, s]));
    return true;
  }

  clampX(x) {
    return clamp(x, this.edge, Math.max(this.edge, this.W - this.edge));
  }

  _buildSurfaces() {
    const lo = this.edge;
    const hi = this.W - this.edge;
    const out = [
      { id: 'floor', kind: 'floor', refId: null, y: this.floorY, xMin: lo, xMax: hi, label: 'floor', canSit: true },
    ];

    for (const ic of this.icons) {
      const topY = this.H - ic.top;
      const xMin = Math.max(lo, ic.left + 4);
      const xMax = Math.min(hi, ic.right - 4);
      if (xMax - xMin < 12) continue;
      out.push({
        id: `icon:${ic.id}`,
        kind: 'icon',
        refId: ic.id,
        y: topY,
        xMin,
        xMax,
        label: ic.name,
        canSit: (this.H - topY) >= (this.charPx * 0.38),
        canStand: (this.H - topY) >= this.standFit,
      });
    }
    for (const win of this.windows) {
      const topY = this.H - win.top;
      const xMin = Math.max(lo, win.left + 10);
      const xMax = Math.min(hi, win.right - 10);
      if (xMax - xMin < 12) continue;
      out.push({
        id: `win:${win.id}`,
        kind: 'window',
        refId: win.id,
        y: topY,
        xMin,
        xMax,
        label: win.title || win.id,
        canSit: (this.H - topY) >= (this.charPx * 0.38),
        canStand: (this.H - topY) >= this.standFit,
      });
    }
    return out;
  }

  obstacles() {
    const out = [];
    for (const ic of this.icons) {
      out.push({ kind: 'icon', id: ic.id, l: ic.left, r: ic.right, b: this.H - ic.bottom, t: this.H - ic.top });
    }
    for (const w of this.windows) {

      out.push({ kind: 'window', id: w.id, l: w.left, r: w.right, b: this.floorY, t: this.H - w.top });
    }
    return out;
  }

  segments(surface) {
    const key = surface.id;
    if (this._segCache.has(key)) return this._segCache.get(key);
    let runs = [[Math.max(this.edge, surface.xMin), Math.min(this.W - this.edge, surface.xMax)]];
    const lo = surface.y;
    const hi = surface.y + this.bodyH;
    for (const o of this.obstacles()) {
      if (o.id === surface.refId) continue;
      if (!(o.b < hi && lo < o.t)) continue;
      const a = o.l - this.hw;
      const b = o.r + this.hw;
      const next = [];
      for (const [ra, rb] of runs) {
        if (b <= ra || a >= rb) {
          next.push([ra, rb]);
          continue;
        }
        if (a > ra) next.push([ra, a]);
        if (b < rb) next.push([b, rb]);
      }
      runs = next;
      if (!runs.length) break;
    }
    const out = runs.filter(([a, b]) => b - a >= 6);
    this._segCache.set(key, out);
    return out;
  }

  surfaceById(id) {
    this.refresh();
    return this.byId.get(id) || null;
  }

  runAt(surface, x) {
    const runs = this.segments(surface);
    if (!runs.length) return null;
    let best = runs[0];
    let bd = Infinity;
    for (const r of runs) {
      const d = Math.abs(clamp(x, r[0], r[1]) - x);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  clampToRun(surface, x) {
    const r = this.runAt(surface, x);
    return r ? clamp(x, r[0], r[1]) : null;
  }

  bodyBlocked(x, feetY) {
    const l = x - this.hw;
    const r = x + this.hw;
    const b = feetY;
    const t = feetY + this.bodyH;
    return this.obstacles().some((o) => o.l < r && l < o.r && o.b < t && b < o.t);
  }

  iconAt(x, yCss) {
    const H = this.H;
    for (const ic of this.icons) {
      if (x >= ic.left && x <= ic.right && yCss >= ic.top && yCss <= ic.bottom) {
        return this.surfaces.find((s) => s.id === `icon:${ic.id}`) ? ic : null;
      }
    }
    return null;
  }

  windowAt(x, yCss) {
    let best = null;
    for (const w of this.windows) {
      if (x >= w.left && x <= w.right && yCss >= w.top && yCss <= w.bottom) {
        if (!best || w.el.style.zIndex >= best.el.style.zIndex) best = w;
      }
    }
    if (!best) return null;
    return this.surfaces.find((s) => s.id === `win:${best.id}`) ? best : null;
  }

  surfaceForPoint(x, yCss) {
    const win = this.windowAt(x, yCss);
    if (win) return this.surfaces.find((s) => s.id === `win:${win.id}`);
    const icon = this.iconAt(x, yCss);
    if (icon) return this.surfaces.find((s) => s.id === `icon:${icon.id}`);
    return null;
  }

  pickIcon(avoid = null) {
    const pool = this.icons.filter((i) => i.id !== avoid);
    const use = pool.length ? pool : this.icons;
    return use.length ? use[Math.floor(Math.random() * use.length)] : null;
  }

  surfaceIdFor(kind, id) {
    return `${kind === 'window' ? 'win' : 'icon'}:${id}`;
  }

  plan(from, to, { allowPartial = false, preferFly = false } = {}) {
    this.refresh();

    const fromSurf = this.surfaceById(from.surfaceId);
    const toSurf = this.surfaceById(to.surfaceId);
    const fromY = from.y ?? (fromSurf?.y ?? this.floorY);
    const toY = to.y ?? (toSurf?.y ?? this.floorY);
    const dx = Math.abs(to.x - from.x);
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy);

    const cfg = TUNING.flight || {};
    const flyDist = cfg.distanceThreshold || 420;
    const isElevated = dy > this.jumpUp || dy < -260;
    const isFar = dist > flyDist;
    const differentSurface = from.surfaceId !== to.surfaceId;

    const buildFlyRoute = () => {
      const targetRun = toSurf ? this.runAt(toSurf, to.x) : null;
      const targetX = this.clampX(targetRun ? clamp(to.x, targetRun[0], targetRun[1]) : to.x);
      const targetFlyY = toSurf?.kind === 'icon' ? toY : Math.min(toY, this.ceilingY);
      return {
        ok: true,
        mode: 'fly',
        steps: [{
          type: 'fly',
          x: targetX,
          y: targetFlyY,
          surfaceId: to.surfaceId,
          kind: toSurf?.kind || 'point'
        }],
        end: toSurf ? { s: toSurf, a: targetX, b: targetX } : null
      };
    };

    const isIcon = toSurf?.kind === 'icon' || fromSurf?.kind === 'icon';
    if (preferFly || (differentSurface && (isElevated || isFar || isIcon))) {
      return buildFlyRoute();
    }

    const nodes = [];
    for (const s of this.surfaces) {
      for (const [a, b] of this.segments(s)) nodes.push({ key: `${s.id}@${Math.round(a)}`, s, a, b });
    }
    if (!nodes.length) return buildFlyRoute();

    const entry = (surfaceId, x) => {
      const cands = nodes.filter((n) => n.s.id === surfaceId);
      if (!cands.length) return null;
      let best = null;
      let bd = Infinity;
      for (const n of cands) {
        const d = Math.abs(clamp(x, n.a, n.b) - x);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      return best;
    };

    const start = entry(from.surfaceId, from.x);
    if (!start) return buildFlyRoute();
    const goal = entry(to.surfaceId, to.x);
    if (!goal) {
      if (!allowPartial) return buildFlyRoute();
    }

    const cost = new Map([[start.key, 0]]);
    const prev = new Map();
    const open = new Set([start]);
    const done = new Set();
    const link = (A, B) => {
      if (A === B) return null;
      const dx = Math.max(0, A.a - B.b, B.a - A.b);
      const dy = B.s.y - A.s.y;
      if (dy > 0) {
        if (dy > this.jumpUp || dx > this.jumpReach) return null;
        return dy * 1.3 + dx * 1.1 + 80;
      }
      if (dx > this.jumpDrop) return null;
      return dx + 55 + Math.min(500, -dy) * 0.25;
    };

    while (open.size) {
      let cur = null;
      let best = Infinity;
      for (const n of open) {
        const c = cost.get(n.key);
        if (c < best) {
          best = c;
          cur = n;
        }
      }
      if (!cur) break;
      open.delete(cur);
      done.add(cur);
      if (goal && cur === goal) break;
      for (const next of nodes) {
        if (done.has(next)) continue;
        const w = link(cur, next);
        if (w == null) continue;
        const nc = best + w;
        if (nc < (cost.get(next.key) ?? Infinity)) {
          cost.set(next.key, nc);
          prev.set(next.key, cur);
          open.add(next);
        }
      }
    }

    let end = goal;
    if (goal && !cost.has(goal.key)) {
      if (!allowPartial || isElevated || isFar) return buildFlyRoute();
      end = null;
    }
    if (!end) {

      return buildFlyRoute();
    }

    const path = [];
    let cur = end;
    while (cur) {
      path.unshift(cur);
      cur = prev.get(cur.key);
    }
    if (!path.length) return buildFlyRoute();

    const steps = [];
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      const next = path[i + 1];
      let want;
      if (next) {

        want = clamp(next.a <= n.a ? next.a : next.b >= n.b ? next.b : (n.a + n.b) / 2, n.a, n.b);
      } else {
        want = clamp(to.x, n.a, n.b);
      }
      const already = i === 0 && from.surfaceId === n.s.id;
      if (i === 0 && !next && Math.abs(want - from.x) < 2) continue;
      steps.push({
        type: already && Math.abs(n.s.y - from.y) < 0.5 ? 'walk' : i === 0 ? 'hop' : 'hop',
        x: want,
        y: n.s.y,
        surfaceId: n.s.id,
        kind: n.s.kind,
        runKey: n.key,
      });
    }
    if (steps.length && steps[0].type === 'hop' && from.surfaceId === path[0].s.id) {
      steps[0].type = 'walk';
      steps[0].y = path[0].s.y;
    }

    for (let i = 1; i < steps.length; i++) {
      const prevStep = steps[i - 1];
      const sameRun = prevStep.surfaceId === steps[i].surfaceId && prevStep.runKey === steps[i].runKey;
      steps[i].type = sameRun ? 'walk' : 'hop';
    }
    return { ok: Boolean(goal ? cost.has(goal.key) : true), steps, end: path[path.length - 1] };
  }

  liveRect(surface) {
    if (!surface) return null;
    if (surface.kind === 'icon') {
      const el = document.querySelector(`.desktop-icon[data-app="${surface.refId}"]`);
      if (!el || el.offsetParent === null) return null;
      const y = this.H - el.offsetTop;
      return {
        ...surface,
        xMin: Math.max(this.edge, el.offsetLeft + 4),
        xMax: Math.min(this.W - this.edge, el.offsetLeft + el.offsetWidth - 4),
        y,
        canSit: (this.H - y) >= (this.charPx * 0.38),
        canStand: (this.H - y) >= this.standFit,
      };
    }
    if (surface.kind === 'window') {
      const el = document.getElementById(`${surface.refId}-window`);
      if (!el || !el.classList.contains('active') || el.classList.contains('minimizing')) return null;
      const y = this.H - el.offsetTop;
      return {
        ...surface,
        xMin: Math.max(this.edge, el.offsetLeft + 10),
        xMax: Math.min(this.W - this.edge, el.offsetLeft + el.offsetWidth - 10),
        y,
        canSit: (this.H - y) >= (this.charPx * 0.38),
        canStand: (this.H - y) >= this.standFit,
      };
    }
    return { ...surface };
  }

  debug() {
    return {
      icons: this.icons,
      windows: this.windows,
      surfaces: this.surfaces.map((s) => ({ ...s, runs: this.segments(s) })),
      obstacles: this.obstacles(),
    };
  }
}

