import { TUNING } from './tuning.js';

const PRI = { idle: 0, wander: 1, sit: 2, window: 2, cursor: 3, hover: 4, click: 5 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const rndR = (r) => rnd(r[0], r[1]);
const ABORT = Symbol('mascot-abort');

export class Brain {
  constructor({ stage, bubble, world, motion, voice, config, reducedMotion = false, touch = false }) {
    this.m = stage;
    this.bubble = bubble;
    this.w = world;
    this.motion = motion;
    this.voice = voice;
    this.cfg = config || {};
    this.reduced = reducedMotion;
    this.touch = touch;

    this.dead = false;
    this.gen = 0;
    this.priority = 0;
    this.label = 'boot';
    this.state = 'boot';
    this.target = '';

    this.cursor = world.cursor;
    this.lastInput = performance.now();
    this.startedAt = performance.now();
    this.followTarget = null;
    this.following = false;
    this.settled = false;
    this.followSide = 0;
    this.zoneSeen = new Map();
    this.lastKind = '';
    this.boredAt = 0;
    this.standing = 'floor';
    this.sittingOn = null;
    this.onWatch = null;
    this.watchCooldown = 0;
    this.windowSig = '';
    this.hoverLock = { id: null, at: 0 };
    this.clicks = [];
    this.nextChatter = performance.now() + rndR(TUNING.wander.chatterEvery);
    this.nextWander = performance.now() + rndR([TUNING.wander.minMs, TUNING.wander.maxMs]);
    this.lastWanderIcon = null;
    this.fps = 0;

    if (motion) {
      motion.onRideLost = () => this.fallOffLostSurface();
      motion.onBump = () => this.w.markDirty();
      motion.onStumble = () => this.stumble('drag');
    }
  }

  get now() {
    return performance.now();
  }

  get surfaceId() {
    return this.motion.standingSurfaceId || this.standing || 'floor';
  }

  canRun(priority) {
    if (this.dead) return false;
    if (priority < this.priority) return false;
    if (this.motion?.airborne && priority < PRI.click) return false;
    return true;
  }

  run(priority, label, fn) {
    if (!this.canRun(priority)) return null;
    const gen = ++this.gen;
    this.priority = priority;
    this.label = label;
    this.state = label;
    const session = {
      gen,
      check: () => {
        if (gen !== this.gen) throw ABORT;
      },
    };
    const done = (async () => {
      try {
        await fn(session);
        return true;
      } catch (err) {
        if (err !== ABORT) console.error('[mascot]', label, err);
        return false;
      } finally {
        if (gen === this.gen) {
          this.priority = 0;
          this.label = 'idle';
          this.state = 'idle';
        }
      }
    })();
    return done;
  }

  pause(ms, s) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const tick = () => {
        if (this.dead) return;
        try {
          s.check();
        } catch (e) {
          reject(e);
          return;
        }
        if (performance.now() - t0 >= ms) return resolve();
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  say(text, title = '') {
    if (text) this.bubble.say(text, { title });
  }

  sayAbout(kind, id) {
    const { title, text } = this.voice.about(kind, id);
    if (text) this.bubble.say(text, { title });
  }

  setState(state, target = '') {
    this.state = state;
    this.target = target;
  }

  setStanding(surfaceId) {
    if (!surfaceId) return;
    this.standing = surfaceId;
    this.motion.standingSurfaceId = surfaceId;
    const s = this.w.surfaceById(surfaceId);
    if (s) {
      this.m.standingY = s.y;
      this.m.groundY = s.y;
      if (!this.m.sitting) this.m.root.position.y = s.y;
    }
  }

  standUp() {
    this.motion.unride();
    this.stopWatchComments();
    const surf = this.sittingOn ? this.w.surfaceById(this.sittingOn) : null;
    this.sittingOn = null;
    const targetY = surf ? surf.y : (this.m.standingY || (this.m.root.position.y + this.m.sitLift));
    this.m.standOn(targetY);
    this.m.play('idle', { loop: true, fade: 0.25 });
  }

  async goTo(spot, s, { run = false, fly = false, allowPartial = true, sneak = false } = {}) {
    if (!spot) return false;
    if (this.m.sitting) this.standUp();

    spot = { ...spot, x: this.w.clampX(spot.x) };
    const targetSurf = this.w.surfaceById(spot.surfaceId);
    const targetY = targetSurf ? targetSurf.y : (spot.y ?? this.m.y);
    const dx = spot.x - this.m.x;
    const dy = targetY - this.m.y;
    const dist = Math.hypot(dx, dy);

    if (spot.surfaceId === this.surfaceId && Math.abs(dx) < 3 && Math.abs(dy) < 3) return true;

    const cfg = TUNING.flight || {};
    const flyDist = cfg.distanceThreshold || 240;
    const elevated = dy > 50 || dy < -180;
    const isIconTarget = spot.surfaceId?.startsWith('icon:') || targetSurf?.kind === 'icon';
    const far = dist > flyDist;
    const shouldFly = fly || isIconTarget || (elevated && dist > 100) || (far && this.wantsFlight(dist));

    const planted = this.w.surfaceById(this.surfaceId);
    const trapped = planted && this.w.bodyBlocked(this.m.x, this.m.y);
    if (trapped) {
      const target = this.w.surfaceById(spot.surfaceId);
      if (target) {
        const run = this.w.runAt(target, spot.x);
        const tx = run ? clamp(spot.x, run[0], run[1]) : spot.x;
        const stepType = (target.y - this.m.y > this.w.jumpUp || dist > 260) ? 'fly' : 'hop';
        const r0 = await this.motion.play([{ type: stepType, x: this.w.clampX(tx), y: target.y, surfaceId: target.id }]);
        if (r0 === 'replaced' || r0 === 'stopped') return false;
        this.setStanding(target.id);
        return true;
      }
    }

    const from = { surfaceId: this.surfaceId, x: this.m.x, y: this.m.y };
    let plan = this.w.plan(from, { surfaceId: spot.surfaceId, x: spot.x, y: targetY }, { allowPartial, preferFly: shouldFly });
    if (!plan || !plan.steps.length) {
      const fallback = this.nearestSpot(spot, from);
      if (!fallback || !fallback.steps.length) {
        plan = {
          ok: true,
          steps: [{ type: 'fly', x: spot.x, y: targetY, surfaceId: spot.surfaceId }]
        };
      } else {
        plan = fallback;
      }
    }
    if (run) {
      for (const st of plan.steps) if (st.type === 'walk') st.run = true;
    }
    if (sneak) {
      for (const st of plan.steps) if (st.type === 'walk') st.sneak = true;
    }
    const isFlight = plan.steps.some((st) => st.type === 'fly');
    this.setState(isFlight ? 'flight' : 'travel', `${spot.surfaceId}@${Math.round(spot.x)}`);
    const res = await this.motion.play(plan.steps, { standingSurfaceId: this.surfaceId });
    if (this.m.currentClip === 'sneak' || this.m.currentClip === 'walk' || this.m.currentClip === 'run') {
      this.m.play('idle', { loop: true, fade: 0.25 });
    }

    if (res === 'replaced' || res === 'stopped') {
      s.check();
      return false;
    }
    const last = plan.steps[plan.steps.length - 1];
    if (last) this.setStanding(last.surfaceId);
    if (res === 'blocked') {

      this.w.markDirty();
      this.w.refresh(true);
      s.check();
      const again = this.w.plan({ surfaceId: this.surfaceId, x: this.m.x, y: this.m.y }, { surfaceId: spot.surfaceId, x: spot.x, y: targetY }, { allowPartial: true });
      const steps2 = again?.steps?.length ? again.steps : [{ type: 'fly', x: spot.x, y: targetY, surfaceId: spot.surfaceId }];
      const res2 = await this.motion.play(steps2);
      if (res2 === 'replaced' || res2 === 'stopped') return false;
      this.setStanding(steps2[steps2.length - 1].surfaceId);
    }
    if (!plan.ok) return false;
    return true;
  }

  wantsFlight(dist) {
    const cfg = TUNING.flight || {};
    if (dist > (cfg.groundRunMax || 900)) return Math.random() < (cfg.farFlyChance ?? 0.7);
    return Math.random() < (cfg.flyChance ?? 0.3);
  }

  nearestSpot(spot, from) {
    const p = this.w.plan(from || { surfaceId: this.surfaceId, x: this.m.x }, { surfaceId: spot.surfaceId, x: spot.x }, { allowPartial: true });
    if (!p || !p.steps.length) return null;
    return p;
  }

  iconSpot(id) {
    const icon = this.w.icons.find((i) => i.id === id);
    if (!icon) return null;
    const top = this.w.surfaceById(`icon:${id}`);
    if (top && top.canSit) {
      return { surfaceId: top.id, x: clamp(icon.cx, top.xMin + 10, top.xMax - 10), y: top.y, kind: 'on-top' };
    }

    const belowIcon = this.w.icons.find(
      (other) => other.id !== id && Math.abs(other.cx - icon.cx) < 60 && other.top > icon.top
    );
    if (belowIcon) {
      const belowSurf = this.w.surfaceById(`icon:${belowIcon.id}`);
      if (belowSurf && belowSurf.canSit) {
        return {
          surfaceId: belowSurf.id,
          x: clamp(icon.cx, belowSurf.xMin + 10, belowSurf.xMax - 10),
          y: belowSurf.y,
          kind: 'below',
        };
      }
    }
    const floor = this.w.surfaceById('floor');
    const r = floor ? this.w.runAt(floor, icon.cx) : null;
    if (!r) return null;
    return { surfaceId: 'floor', x: clamp(icon.cx, r[0], r[1]), y: floor.y, kind: 'below' };
  }

  cursorSpot() {
    const c = this.cursor;
    const cwx = c.x;
    const cwy = this.w.H - c.yCss;
    if (TUNING.follow.hopToSurface) {
      const surf = this.w.surfaceForPoint(c.x, c.yCss);
      if (surf && surf.canSit && surf.id !== this.surfaceId) {
        return { surfaceId: surf.id, x: clamp(cwx, surf.xMin + 14, surf.xMax - 14) };
      }
    }

    if (cwy > this.w.floorY + 140) {
      let closest = null;
      let minD = Infinity;
      for (const s of this.w.surfaces) {
        if (s.id === 'floor') continue;
        const d = Math.hypot(clamp(cwx, s.xMin, s.xMax) - cwx, s.y - cwy);
        if (d < minD && d < 240) {
          minD = d;
          closest = s;
        }
      }
      if (closest) {
        return { surfaceId: closest.id, x: clamp(cwx, closest.xMin + 14, closest.xMax - 14) };
      }
    }
    const here = this.w.surfaceById(this.surfaceId);
    if (!here) return null;

    const away = Math.abs(cwx - this.m.x);
    if (here.kind !== 'floor' && away > 200 && cwy < this.w.floorY + 120) {
      const floor = this.w.surfaceById('floor');
      const rf = floor ? this.w.runAt(floor, cwx) : null;
      if (rf) {
        const side = cwx >= this.m.x ? 1 : -1;
        return { surfaceId: 'floor', x: clamp(cwx - side * TUNING.follow.stopDistance, rf[0], rf[1]) };
      }
    }
    const r = this.w.runAt(here, cwx);
    if (!r) return null;

    const gap = cwx - this.m.x;
    const want = gap >= 0 ? -1 : 1;
    if (!this.followSide || (want !== this.followSide && Math.abs(gap) > TUNING.follow.resumeDistance)) this.followSide = want;
    const x = clamp(cwx + this.followSide * TUNING.follow.stopDistance, r[0], r[1]);
    void cwy;
    return { surfaceId: here.id, x };
  }

  onPointerMove(x, yCss) {
    if (this.dead) return;
    const now = this.now;
    this.cursor = { x, yCss, at: now, inside: true };
    this.w.cursor = this.cursor;
    this.lastInput = now;
    this.boredAt = 0;
    if (this.sittingOn === 'floor') this.wakeUp();
  }

  onPointerLeave() {
    this.cursor.inside = false;
  }

  onIconClick(id) {
    if (this.dead || !id) return;
    this.lastInput = this.now;
    const now = this.now;
    this.clicks = this.clicks.filter((t) => now - t < TUNING.reaction.annoyMs);
    this.clicks.push(now);
    const annoyed = this.clicks.length >= TUNING.reaction.annoyClicks;
    const sittingHere = this.sittingOn === `icon:${id}`;
    const icon = this.w.icons.find((i) => i.id === id);

    this.run(PRI.click, 'click', async (s) => {
      if (icon) this.m.facePoint(icon.cx, this.w.H - icon.cy);
      if (sittingHere) {

        this.motion.extraLean = 0.12;
        this.motion.extraSquash = 0.94;
        this.say(this.voice.pick(this.cfg.voice?.poked, 'poked'), icon?.name || '');
        await this.pause(420, s);
        return;
      }
      if (annoyed) {
        this.clicks = [];
        await this.m.play(this.clipOr(['shrug', 'bonus_punch']), { loop: true, fade: 0.25 });
        this.say(this.voice.pick(this.cfg.voice?.annoyed, 'annoyed'), '');
        await this.pause(1800, s);
        await this.m.toIdle(0.35);
        return;
      }
      const clip = this.clipOr(['nod', 'gesture', 'point', 'clap']);
      await this.m.play(clip, { fade: 0.2, loop: true });
      this.say(this.voice.pick(this.cfg.voice?.clicked, 'clicked'), icon?.name || '');
      await this.pause(clip === 'gesture' || clip === 'clap' ? 1800 : 900, s);
      if (!this.m.sitting) await this.m.toIdle(0.35);
    });
  }

  onIconHover(id) {
    if (this.dead || !id) return;
    this.lastInput = this.now;
    const now = this.now;
    if (this.hoverLock.id === id && now - this.hoverLock.at < (TUNING.reaction?.hoverQuipMs || 800)) return;
    this.hoverLock = { id, at: now };
    const icon = this.w.icons.find((i) => i.id === id);
    if (!icon) return;

    this.run(PRI.hover, 'hover', async (s) => {

      this.m.facePoint(icon.cx, this.w.H - icon.cy);
      this.sayAbout('icon', id);
      await this.m.play(this.voice.pick(this.cfg.talkClips || ['talk_1', 'talk_2', 'gesture'], 'talk'), { loop: true, fade: 0.22 });

      const spot = this.iconSpot(id);
      if (spot && (spot.surfaceId !== this.surfaceId || Math.abs(spot.x - this.m.x) > 35)) {
        await this.goTo(spot, s, { fly: spot.surfaceId?.startsWith('icon:') });
      }
      s.check();
      this.m.facePoint(icon.cx, this.w.H - icon.cy);

      const top = this.w.surfaceById(spot?.surfaceId);
      if (top && top.canSit && top.kind === 'icon') {
        this.m.setSitting(top.y);
        this.sittingOn = top.id;
        this.setState('sitting', top.id);
      } else {
        await this.m.play(this.voice.pick(this.cfg.talkClips || ['talk_1', 'talk_2', 'gesture'], 'talk'), { loop: true, fade: 0.22 });
      }

      await this.pause(2400, s);
      if (this.sittingOn) {
        if (this.m.currentClip !== 'sit_idle') this.m.play('sit_idle', { loop: true, fade: 0.3 });
      } else {
        await this.m.toIdle(0.35);
      }
    });
  }

  onCharacterClick() {
    if (this.dead) return;
    this.lastInput = this.now;
    this.run(PRI.click, 'dance', async (s) => {
      const clip = this.m.actions.bonus_dance ? 'bonus_dance' : this.clipOr(['victory', 'clap']);
      await this.m.play(clip, { loop: true, fade: 0.25 });
      this.say(this.voice.pick(this.cfg.voice?.dance, 'dance'), '');
      await this.pause(3000, s);
      if (!this.m.sitting) await this.m.toIdle(0.35);
    });
  }

  onCharacterHover() {
    if (this.dead || this.m.sitting || this.priority >= PRI.hover) return;
    if (this.now - (this.lastHoverWave || 0) < 12000) return;
    this.lastHoverWave = this.now;
    this.run(PRI.hover, 'wave', async (s) => {
      this.m.facePoint(this.cursor.x, this.w.H - this.cursor.yCss);
      await this.m.play('wave', { loop: true, fade: 0.25 });
      await this.pause(1800, s);
      await this.m.toIdle(0.35);
    });
  }

  onTabReturn() {
    if (this.dead || this.m.sitting || this.priority >= PRI.hover) return;
    this.run(PRI.hover, 'return-wave', async (s) => {
      await this.m.play('wave', { loop: true, fade: 0.25 });
      this.say(this.voice.pick(this.cfg.voice?.greeting || this.cfg.voice?.intro, 'return'), '');
      await this.pause(2000, s);
      await this.m.toIdle(0.35);
    });
  }

  onStumble() {
    this.stumble('scroll');
  }

  stumble(reason) {
    if (this.dead || this.reduced) return;
    const now = this.now;
    if (now - (this.lastStumble || 0) < TUNING.reaction.stumbleMs) return;
    this.lastStumble = now;
    this.motion.extraLean = rnd(-0.18, 0.18);
    this.motion.extraSquash = 0.94;
    if (Math.random() < 0.5) this.say(this.voice.pick(this.cfg.voice?.stumble, 'stumble'), '');
    void reason;
  }

  onWindowOpened(id) {
    if (this.dead) return;
    const surface = this.w.surfaceById(`win:${id}`);
    this.run(PRI.window, 'window-open', async (s) => {
      await this.m.play(this.clipOr(['surprised', 'clap', 'victory']), { fade: 0.15, loop: true });
      this.sayAbout('window', id);
      await this.pause(700, s);
      if (surface) {
        await this.goTo({ surfaceId: surface.id, x: clamp(this.m.x, surface.xMin + 40, surface.xMax - 40) }, s, { run: true });
        s.check();
        await this.sitOnSurface(surface.id, s);
      } else {

        await this.m.play('look_around', { loop: true, fade: 0.3 });
        await this.pause(1400, s);
        await this.m.toIdle(0.35);
      }
    });
  }

  onWindowClosed(id) {
    if (this.dead) return;
    const wasHere = this.sittingOn === `win:${id}` || this.surfaceId === `win:${id}`;
    this.run(PRI.window, 'window-close', async (s) => {
      if (wasHere) {
        this.motion.unride();
        this.stopWatchComments();
        const floor = this.w.surfaceById('floor');
        this.m.sitting = false;
        if (floor) {
          const dropY = this.m.y - floor.y;
          const stepType = dropY > 260 ? 'fly' : 'drop';
          await this.motion.play([{ type: stepType, x: this.w.clampX(this.m.x), y: floor.y, surfaceId: 'floor' }]);
          this.setStanding('floor');
        }
        this.sittingOn = null;
      }
      await this.m.play('look_down', { loop: true, fade: 0.3 });
      this.say(this.voice.pick(this.cfg.voice?.closed, 'closed'), '');
      await this.pause(1500, s);
      await this.m.toIdle(0.35);
    });
  }

  async sitOnSurface(surfaceId, s, win = null) {
    const surf = this.w.surfaceById(surfaceId);
    if (!surf) return false;
    if (!surf.canSit) {
      await this.m.play('look_around', { loop: true, fade: 0.3 });
      await this.pause(1400, s);
      await this.m.toIdle(0.35);
      return false;
    }
    this.setStanding(surfaceId);
    this.m.setSitting(surf.y);
    this.sittingOn = surfaceId;
    this.setState('sit', surfaceId);
    if (surf.kind === 'window') {
      const cx = (surf.xMin + surf.xMax) / 2;
      this.motion.ride(surf, this.m.x - cx, this.m.root.position.y - surf.y);
    }
    if (win) {
      this.onWatch = win.id;
      this.startWatchComments(win.id);
    }
    return true;
  }

  startWatchComments(winId) {
    this.stopWatchComments();
    const tick = () => {
      this.commentTimer = setTimeout(() => {
        if (this.dead) return;
        if (!this.w.windows.some((w) => w.id === winId)) return;
        this.sayAbout('window', winId);
        tick();
      }, rndR(TUNING.window.commentMs));
    };
    tick();
  }

  stopWatchComments() {
    clearTimeout(this.commentTimer);
    this.commentTimer = null;
    this.onWatch = null;
  }

  fallOffLostSurface() {
    this.standUp();
    const floor = this.w.surfaceById('floor');
    if (!floor) return;
    this.motion.play([{ type: 'drop', x: this.w.clampX(this.m.x), y: floor.y, surfaceId: 'floor' }]);
    this.setStanding('floor');
  }

  wakeUp() {
    this.run(PRI.click, 'wake', async (s) => {
      this.standUp();
      await this.m.play('stretch', { loop: true, fade: 0.35 });
      this.say(this.voice.pick(this.cfg.voice?.wake, 'wake'), '');
      await this.pause(1600, s);
      await this.m.toIdle(0.4);
    });
  }

  async monitor() {
    while (!this.dead) {
      await this.sleep(150);
      if (this.dead) break;
      try {
        this.w.refresh();
        this.checkWindows();
        this.checkStanding();
        this.markVisited();
        this.maybeNap();
        this.decide();
      } catch (err) {
        console.error('[mascot] monitor', err);
      }
    }
  }

  checkWindows() {
    const ids = this.w.windows.map((w) => w.id).join(',');
    if (ids === this.windowSig) return;
    const prev = this.windowSig ? this.windowSig.split(',') : [];
    const next = ids ? ids.split(',') : [];
    this.windowSig = ids;
    const opened = next.find((i) => !prev.includes(i));
    const closed = prev.find((i) => !next.includes(i));
    if (opened) this.onWindowOpened(opened);
    else if (closed) this.onWindowClosed(closed);
  }

  checkStanding() {
    if (this.surfaceId === 'login') return;
    const id = this.surfaceId;
    const surf = this.w.surfaceById(id);
    if (surf) {
      if (!this.m.sitting && !this.motion.busy) {
        this.m.standingY = surf.y;
        this.m.groundY = surf.y;
        this.m.root.position.y = surf.y;
      }
      return;
    }
    if (this.motion.isRiding) return;
    const floor = this.w.surfaceById('floor');
    if (!floor) return;
    this.m.sitting = false;
    this.sittingOn = null;
    this.motion.play([{ type: 'drop', x: this.w.clampX(this.m.x), y: floor.y, surfaceId: 'floor' }]);
    this.setStanding('floor');
  }

  maybeNap() {
    if (this.reduced || this.touch) return;
    if (this.sittingOn || this.motion.busy) return;
    if (this.now - this.lastInput < TUNING.nap.afterMs) return;
    if (this.priority > PRI.sit) return;
    const floor = this.w.surfaceById('floor');
    if (!floor) return;
    this.lastInput = this.now;
    this.run(PRI.sit, 'nap', async (s) => {
      const r = this.w.runAt(floor, this.m.x);
      const x = r ? clamp(this.m.x, r[0], r[1]) : this.m.x;
      await this.goTo({ surfaceId: 'floor', x }, s);
      await this.m.play('stretch', { loop: true, fade: 0.4 });
      this.say(this.voice.pick(this.cfg.voice?.yawn, 'yawn'), '');
      await this.pause(1700, s);
      this.m.setSitting(floor.y);
      this.sittingOn = 'floor';
      await this.pause(rnd(9000, 18000), s);
    });
  }

  decide() {
    if (!document.body.classList.contains('logged-in')) {
      this.decideLogin();
      return;
    }
    if (this.motion.airborne) return;

    const cursorAge = this.now - (this.cursor.at || 0);
    if (this.w.windows.length && this.now > this.watchCooldown && cursorAge > 1200) {
      const win = this.w.windows[this.w.windows.length - 1];
      if (this.onWatch !== win.id && this.sittingOn !== `win:${win.id}`) {
        this.watchWindow(win);
        return;
      }
    }

    if (this.pursueCursor()) return;

    if (this.sittingOn && this.sittingOn.startsWith('icon:') && (this.now - this.lastInput > 8000)) {
      if (this.canRun(PRI.wander)) {
        this.stepDownFromIcon();
        return;
      }
    }

    if (!this.sittingOn && this.now > this.nextWander) {
      this.nextWander = this.now + rndR([TUNING.wander.minMs, TUNING.wander.maxMs]);
      if (this.explore()) return;
    }

    if (this.now > this.nextChatter && !this.sittingOn) {
      this.nextChatter = this.now + rndR(TUNING.wander.chatterEvery);
      this.chatter();
    }
  }

  pursueCursor() {
    if (this.reduced || this.touch) return false;
    const c = this.cursor;
    if (!c.inside) {
      this.settled = false;
      this.followSide = 0;
      return false;
    }
    const age = this.now - c.at;
    if (age > TUNING.follow.forgetMs) {
      this.settled = false;
      this.followSide = 0;
      this.following = false;
      return false;
    }
    const spot = this.cursorSpot();
    if (!spot) return false;
    const targetSurf = this.w.surfaceById(spot.surfaceId);
    const targetY = targetSurf ? targetSurf.y : this.m.y;
    const dy = Math.abs(targetY - this.m.y);
    const dx = Math.abs(spot.x - this.m.x);
    const dist = Math.hypot(dx, dy);
    const same = spot.surfaceId === this.surfaceId;
    if (!same) this.followSide = 0;

    const gapNow = Math.abs(c.x - this.m.x);
    const limit = this.settled ? TUNING.follow.resumeDistance : TUNING.follow.stopDistance;
    if (same && dy < 30 && (gapNow <= limit || dx <= TUNING.follow.arriveSlack)) {
      if (!this.settled) this.motion.easeStop();
      this.settled = true;
      this.motion.faceTo(c.x, this.w.H - c.yCss);
      this.following = true;
      if (!this.motion.busy) {
        this.setState('watching-cursor');
        if (this.m.currentClip === 'sneak' || this.m.currentClip === 'walk' || this.m.currentClip === 'run') {
          this.m.play('idle', { loop: true, fade: 0.25 });
        } else if (this.m.currentClip === 'idle' && Math.random() < 0.28) {
          this.m.play(this.clipOr(['think', 'look_around']), { loop: true, fade: 0.3 });
        }
      }
      return true;
    }
    this.settled = false;

    if (this.following && this.followTarget) {
      const sameSurface = this.followTarget.surfaceId === spot.surfaceId;
      if (sameSurface && Math.abs(this.followTarget.x - spot.x) < TUNING.follow.replanDistance) return true;

      if (sameSurface && this.motion.retargetWalk(spot.x, spot.surfaceId)) {
        this.followTarget = spot;
        return true;
      }
    }
    this.following = true;
    this.followTarget = spot;
    const job = this.run(PRI.cursor, 'follow', async (s) => {
      await this.goTo(spot, s, { run: dist > 320, sneak: dist < 140 && Math.random() < 0.65, fly: dy > this.w.jumpUp });
      s.check();
      this.motion.faceTo(c.x, this.w.H - c.yCss);
      this.setState('with-cursor');
    });
    if (!job) {
      this.followTarget = null;
      return false;
    }
    job.then(() => {
      this.followTarget = null;
    });
    return true;
  }

  bored() {
    if (this.reduced) return;
    if (this.now - this.boredAt < 6000) return;
    this.boredAt = this.now;
    this.run(PRI.idle, 'bored', async (s) => {
      await this.m.play('shrug', { loop: true, fade: 0.35 });
      this.say(this.voice.pick(this.cfg.voice?.bored, 'bored'), '');
      await this.pause(2100, s);
      await this.m.toIdle(0.4);
    });
  }

  watchWindow(win) {
    const surfaceId = `win:${win.id}`;
    if (!this.canRun(PRI.sit)) return;
    const job = this.run(PRI.sit, 'watch-window', async (s) => {
      const surf = this.w.surfaceById(surfaceId);
      if (!surf) return;
      if (this.sittingOn !== surfaceId) {
        await this.goTo({ surfaceId, x: clamp(this.m.x, surf.xMin + 40, surf.xMax - 40) }, s, { run: true });
        s.check();
      }
      const live = this.w.surfaceById(surfaceId);
      if (!live) return;
      await this.sitOnSurface(surfaceId, s, win);
      this.sayAbout('window', win.id);
    });
    if (!job) return;
    job.then(() => {
      this.watchCooldown = this.now + 7000;
    });
  }

  sitOnIcon(icon) {
    this.run(PRI.wander, 'sit-icon', async (s) => {
      const spot = this.iconSpot(icon.id);
      if (!spot) return;
      const sneak = Math.random() < 0.35;
      await this.goTo(spot, s, { fly: spot.surfaceId?.startsWith('icon:'), sneak });
      s.check();
      const surf = this.w.surfaceById(spot.surfaceId);
      if (!surf) return;
      if (!surf.canSit || surf.kind !== 'icon' || spot.kind === 'below') {
        this.m.facePoint(icon.cx, this.w.H - icon.cy);
        await this.m.play(this.clipOr(['look_around', 'think', 'point', 'wave']), { loop: true, fade: 0.3 });
        this.sayAbout('icon', icon.id);
        await this.pause(2400, s);
        await this.m.toIdle(0.35);
        return;
      }
      this.m.facePoint(icon.cx, this.w.H - icon.cy);
      this.m.setSitting(surf.y);
      this.sittingOn = surf.id;
      this.setState('sitting', surf.id);
      this.sayAbout('icon', icon.id);
      await this.pause(rnd(TUNING.sit.minMs, TUNING.sit.maxMs), s);

      await this.m.play(Math.random() < 0.5 ? 'look_around' : 'look_down', { loop: true, fade: 0.4 });
      await this.pause(1400, s);
      if (surf.canStand) {
        this.standUp();
        await this.pause(350, s);
      } else {
        this.sittingOn = null;
        this.m.sitting = false;
        this.m.sitLift = 0;
      }
      const floor = this.w.surfaceById('floor');
      const r = floor ? this.w.runAt(floor, this.m.x) : null;
      if (floor && r) {
        const dropY = this.m.y - floor.y;
        const stepType = dropY > 260 ? 'fly' : 'drop';
        await this.motion.play([{ type: stepType, x: clamp(this.m.x, r[0], r[1]), y: floor.y, surfaceId: 'floor' }]);
        this.setStanding('floor');
      }
      this.nextWander = this.now + rndR([TUNING.wander.minMs, TUNING.wander.maxMs]);
    });
  }

  wanderTo(icon) {
    this.run(PRI.wander, 'wander', async (s) => {
      const spot = this.iconSpot(icon.id);
      if (!spot) return;
      const sneak = Math.random() < 0.35;
      await this.goTo(spot, s, { fly: spot.surfaceId?.startsWith('icon:'), sneak });
      s.check();
      this.m.facePoint(icon.cx, this.w.H - icon.cy);
      await this.m.play(this.clipOr(['look_around', 'think', 'wave', 'nod']), { loop: true, fade: 0.3 });
      await this.pause(rnd(1600, 2800), s);
      if (Math.random() < 0.45) {
        this.sayAbout('icon', icon.id);
        await this.m.play(this.clipOr(['point', 'gesture', 'talk_1']), { loop: true, fade: 0.3 });
        await this.pause(2200, s);
      }
      await this.m.toIdle(0.4);
      this.nextWander = this.now + rndR([TUNING.wander.minMs, TUNING.wander.maxMs]);
    });
  }

  cellOf(x, feetY) {
    const cols = TUNING.wander.zoneCols;
    const rows = TUNING.wander.zoneRows;
    const col = clamp(Math.floor(x / (this.w.W / cols)), 0, cols - 1);
    const row = clamp(Math.floor((this.w.H - feetY) / (this.w.H / rows)), 0, rows - 1);
    return row * cols + col;
  }

  markVisited() {
    if (this.m.sitting && !this.sittingOn) return;
    this.zoneSeen.set(this.cellOf(this.m.x, this.m.y), this.now);
  }

  pickZoneSpot() {
    const cols = TUNING.wander.zoneCols;
    const cands = [];
    for (const s of this.w.surfaces) {
      for (const [a, b] of this.w.segments(s)) {
        if (b - a < 24) continue;
        const n = Math.max(1, Math.round((b - a) / (this.w.W / cols)));
        for (let i = 0; i < n; i++) {
          const x = a + ((i + 0.5) / n) * (b - a);
          if (s.id === this.surfaceId && Math.abs(x - this.m.x) < 140) continue;
          const cell = this.cellOf(x, s.y);
          cands.push({ s, x, cell, age: this.now - (this.zoneSeen.get(cell) || 0) + Math.random() * 4000 });
        }
      }
    }
    if (!cands.length) return null;
    cands.sort((p, q) => q.age - p.age);
    return cands[0];
  }

  clipOr(names, fallback = 'idle') {
    const have = names.filter((n) => this.m.actions[n]);
    return have.length ? have[Math.floor(Math.random() * have.length)] : fallback;
  }

  explore() {
    const mix = { ...TUNING.wander.mix };
    if (this.lastKind) mix[this.lastKind] = 0;
    if (!this.w.icons.length) {
      mix.sit = 0;
      mix.icon = 0;
    }
    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    if (total <= 0) return false;
    let roll = Math.random() * total;
    let kind = 'zone';
    for (const [k, wgt] of Object.entries(mix)) {
      roll -= wgt;
      if (roll <= 0) {
        kind = k;
        break;
      }
    }
    const order = [kind, 'zone', 'play', 'edge'];
    for (const k of order) {
      if (this.startActivity(k)) {
        this.lastKind = k;
        return true;
      }
    }
    return false;
  }

  startActivity(kind) {
    if (kind === 'sit' || kind === 'icon') {
      const icon = this.w.pickIcon(this.lastWanderIcon);
      if (!icon) return false;
      this.lastWanderIcon = icon.id;
      if (kind === 'sit') this.sitOnIcon(icon);
      else this.wanderTo(icon);
      return true;
    }
    if (kind === 'zone') return this.visitZone();
    if (kind === 'edge') return this.patrolEdge();
    if (kind === 'play') return this.playAbout();
    return false;
  }

  visitZone() {
    const c = this.pickZoneSpot();
    if (!c) return false;
    const job = this.run(PRI.wander, 'explore', async (s) => {
      await this.goTo({ surfaceId: c.s.id, x: c.x }, s, { run: Math.random() < 0.5 });
      s.check();
      this.zoneSeen.set(c.cell, this.now);
      if (c.s.kind === 'window' && c.s.canSit) {
        await this.sitOnSurface(c.s.id, s);
        this.sayAbout('window', c.s.refId);
        await this.pause(rnd(TUNING.sit.minMs, TUNING.sit.maxMs), s);
        await this.stepDown(s);
      } else {
        this.m.facePoint(this.w.W / 2, this.m.y + 60);
        await this.m.play(this.clipOr(['look_around', 'think', 'stretch', 'nod', 'wave', 'victory', 'clap']), { loop: true, fade: 0.3 });
        if (Math.random() < 0.4) this.say(this.voice.category('idle'), '');
        await this.pause(rnd(1800, 3400), s);
        await this.m.toIdle(0.4);
      }
      this.nextWander = this.now + rndR([TUNING.wander.minMs, TUNING.wander.maxMs]);
    });
    return Boolean(job);
  }

  patrolEdge() {
    const floor = this.w.surfaceById('floor');
    const runs = floor ? this.w.segments(floor) : [];
    if (!runs.length) return false;
    const left = this.m.x > this.w.W / 2 ? Math.random() < 0.7 : Math.random() < 0.3;
    const x = left ? runs[0][0] : runs[runs.length - 1][1];
    if (Math.abs(x - this.m.x) < 160) return false;
    const job = this.run(PRI.wander, 'patrol-edge', async (s) => {
      await this.goTo({ surfaceId: 'floor', x }, s, { run: true });
      s.check();
      this.m.facePoint(left ? -200 : this.w.W + 200, this.m.y + 40);
      await this.m.play(this.clipOr(['look_around', 'think', 'point', 'wave']), { loop: true, fade: 0.3 });
      this.say(this.voice.category('edge'), '');
      await this.pause(rnd(2200, 3600), s);
      await this.m.toIdle(0.4);
      this.zoneSeen.set(this.cellOf(this.m.x, this.m.y), this.now);
    });
    return Boolean(job);
  }

  playAbout() {
    const floor = this.w.surfaceById('floor');
    if (!floor || this.surfaceId !== 'floor') return false;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const r = this.w.runAt(floor, this.m.x);
    if (!r) return false;
    const far = this.w.clampX(clamp(this.m.x + dir * rnd(260, 560), r[0], r[1]));
    if (Math.abs(far - this.m.x) < 120) return false;
    const home = this.m.x;
    const job = this.run(PRI.wander, 'play', async (s) => {
      await this.goTo({ surfaceId: 'floor', x: far }, s, { run: true, fly: false });
      s.check();
      if (this.m.actions.happy_jump) {
        await this.motion.play([{ type: 'hop', x: this.m.x, y: floor.y, surfaceId: 'floor' }]);
        s.check();
      }
      await this.goTo({ surfaceId: 'floor', x: this.w.clampX(home) }, s, { run: true, fly: false });
      s.check();
      await this.m.play(this.clipOr(['bonus_punch', 'victory', 'clap', 'stretch']), { loop: true, fade: 0.25 });
      await this.pause(1800, s);
      await this.m.toIdle(0.3);
    });
    return Boolean(job);
  }

  async stepDown(s) {
    await this.m.play(this.clipOr(['look_around', 'look_down']), { loop: true, fade: 0.4 });
    await this.pause(1400, s);
    this.standUp();
    const floor = this.w.surfaceById('floor');
    const r = floor ? this.w.runAt(floor, this.m.x) : null;
    if (floor && r) {
      const dropY = this.m.y - floor.y;
      const stepType = dropY > 260 ? 'fly' : 'drop';
      await this.motion.play([{ type: stepType, x: clamp(this.m.x, r[0], r[1]), y: floor.y, surfaceId: 'floor' }]);
      this.setStanding('floor');
    }
  }

  stepDownFromIcon() {
    this.run(PRI.wander, 'step-down', async (s) => {
      await this.m.play(this.clipOr(['look_around', 'look_down']), { loop: true, fade: 0.4 });
      await this.pause(1200, s);
      this.standUp();
      const floor = this.w.surfaceById('floor');
      const r = floor ? this.w.runAt(floor, this.m.x) : null;
      if (floor && r) {
        const dropY = this.m.y - floor.y;
        const stepType = dropY > 260 ? 'fly' : 'drop';
        await this.motion.play([{ type: stepType, x: clamp(this.m.x, r[0], r[1]), y: floor.y, surfaceId: 'floor' }]);
        this.setStanding('floor');
      }
      this.nextWander = this.now + rndR([TUNING.wander.minMs, TUNING.wander.maxMs]);
    });
  }

  chatter() {
    this.run(PRI.idle, 'chatter', async (s) => {
      const clip = this.voice.pick(this.cfg.idleClips || ['look_around', 'think', 'stretch', 'nod', 'shrug', 'clap', 'victory', 'wave'], 'idleclip');
      await this.m.play(clip, { loop: true, fade: 0.4 });
      this.say(this.voice.category('idle'), '');
      await this.pause(2600, s);
      await this.m.toIdle(0.4);
    });
  }

  maybeDance() {
    if (this.dead || this.reduced) return false;
    if (this.now - (this.danceAt || 0) < 18000) return false;
    if (Math.random() > 0.4) return false;
    this.danceAt = this.now;
    this.run(PRI.click, 'special', async (s) => {
      const clip = this.m.actions.bonus_dance ? 'bonus_dance' : this.clipOr(['victory', 'clap']);
      await this.m.play(clip, { loop: true, fade: 0.3 });
      this.say(this.voice.pick(this.cfg.voice?.dance, 'dance'), '');
      await this.pause(3000, s);
      await this.m.toIdle(0.4);
    });
    return true;
  }

  decideLogin() {
    if (this.motion.airborne || this.busy) return;
    const now = this.now;
    if (now < (this.nextLoginQuip || 0)) return;
    this.nextLoginQuip = now + rnd(9000, 15000);

    const loginPrompts = [
      "Click 'Sign in' right there to enter!",
      "I'm ready when you are! Hit Sign in.",
      "Go ahead, click Sign in to unlock the desktop.",
      "The desktop is right behind that button!"
    ];
    this.run(PRI.idle, 'login-idle', async (s) => {
      const clip = this.clipOr(['point', 'wave', 'nod', 'gesture']);
      await this.m.play(clip, { loop: true, fade: 0.25 });
      this.say(this.voice.fill(loginPrompts[Math.floor(Math.random() * loginPrompts.length)]), '');
      await this.pause(2000, s);
      if (!document.body.classList.contains('logged-in')) await this.m.toIdle(0.35);
    });
  }

  onLoginBtnHover() {
    if (this.dead || document.body.classList.contains('logged-in')) return;
    this.run(PRI.hover, 'login-btn-hover', async (s) => {
      await this.m.play(this.clipOr(['happy_jump', 'nod', 'clap']), { loop: true, fade: 0.2 });
      this.say("Yes, that button! Click it!", '');
      await this.pause(1400, s);
      if (!document.body.classList.contains('logged-in')) await this.m.toIdle(0.3);
    });
  }

  onLogin() {
    if (this.dead) return;
    this.stopWatchComments();
    this.run(PRI.click, 'login-success', async (s) => {
      const floor = this.w.surfaceById('floor') || { y: 48, id: 'floor' };
      const targetX = clamp(this.w.W * 0.5, 120, this.w.W - 120);
      await this.motion.play([{ type: 'fly', x: targetX, y: floor.y, surfaceId: 'floor' }]);
      this.setStanding('floor');
      this.m.faceOrigin();
      await this.m.play('wave', { loop: true, fade: 0.2 });
      this.say(this.voice.pick(this.cfg.voice?.greeting, 'greeting'), this.voice.v.speaker || '');
      await this.pause(1900, s);
      await this.m.play('talk_1', { loop: true, fade: 0.3 });
      this.say(this.voice.pick(this.cfg.voice?.intro, 'intro'), '');
      await this.pause(2600, s);
      await this.m.toIdle(0.4);
      this.nextWander = this.now + rndR([TUNING.wander.minMs, TUNING.wander.maxMs]);
    });
  }

  async start() {
    if (this.started) return;
    this.started = true;
    this.startedAt = this.now;
    this.lastInput = this.now;

    const onLoginScreen = !document.body.classList.contains('logged-in') && !document.getElementById('login-screen')?.classList.contains('hidden');

    if (onLoginScreen) {
      const isMobile = this.w.W <= 650;
      const profile = document.querySelector('.login-profile');
      const rect = profile?.getBoundingClientRect?.();
      let x0 = isMobile ? this.w.W * 0.5 : (rect ? rect.right + 65 : this.w.W * 0.5 + 175);
      let y0 = isMobile ? Math.max(35, this.w.H * 0.5 - 200) : (rect ? Math.max(50, this.w.H - rect.bottom + 25) : Math.max(50, this.w.H * 0.5 - 110));
      x0 = clamp(x0, 60, this.w.W - 60);
      y0 = clamp(y0, 40, this.w.H - 120);

      this.m.placeAt(x0, y0);
      this.motion.standingSurfaceId = 'login';
      this.setStanding('login');
      this.m.facePoint(this.w.W * 0.5, this.w.H * 0.5);

      this.monitor();
      await this.run(PRI.window, 'login-intro', async (s) => {
        await this.m.play('wave', { loop: true, fade: 0.2 });
        const loginGreetings = [
          "Welcome! Click 'Sign in' to unlock the desktop.",
          "Hey there! Click 'Sign in' and I'll show you around.",
          "Welcome to Warner OS! Sign in right here to get started.",
          "Go ahead, hit 'Sign in' to enter {first}'s desktop!"
        ];
        this.say(this.voice.fill(loginGreetings[Math.floor(Math.random() * loginGreetings.length)]), '');
        await this.pause(2400, s);
        await this.m.play('point', { loop: true, fade: 0.25 });
        await this.pause(1600, s);
        await this.m.toIdle(0.4);
      });
      return;
    }

    const floor = this.w.surfaceById('floor') || { y: this.m.H - 48, id: 'floor' };
    this.m.placeAt(clamp(this.w.W * 0.5, 60, this.w.W - 60), floor.y);
    this.motion.standingSurfaceId = 'floor';
    this.m.faceOrigin();

    this.monitor();
    await this.run(PRI.window, 'intro', async (s) => {
      await this.m.play('wave', { loop: true, fade: 0.2 });
      this.say(this.voice.pick(this.cfg.voice?.greeting, 'greeting'), this.voice.v.speaker || '');
      await this.pause(1900, s);
      await this.m.play('talk_1', { loop: true, fade: 0.3 });
      this.say(this.voice.pick(this.cfg.voice?.intro, 'intro'), '');
      await this.pause(2600, s);
      await this.m.toIdle(0.4);
    });
  }

  frame() {
    if (this.motion?.activeRide) this.m.groundY = this.motion.activeRide.surface.y ?? this.m.groundY;
  }

  debugState() {
    return {
      name: this.voice.v.speaker || 'mascot',
      state: this.state,
      label: this.label,
      target: this.target,
      priority: this.priority,
      surface: this.surfaceId,
      sittingOn: this.sittingOn,
      clip: this.m.currentClip,
      airborne: this.motion.airborne,
      watching: this.onWatch,
      cursor: this.cursor,
      follows: this.following,
    };
  }

  stop() {
    this.dead = true;
    this.gen++;
    this.motion?.stop('stopped');
  }
}

