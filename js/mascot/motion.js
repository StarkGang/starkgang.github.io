import { TUNING } from './tuning.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const GRAVITY = 2600;

export class Motion {
  constructor({ stage, world }) {
    this.m = stage;
    this.w = world;
    this.queue = [];
    this.step = null;
    this.speed = 0;
    this.dir = 0;
    this.targetFacing = 0;
    this.phase = 0;
    this.lean = 0;
    this.pitch = 0;
    this.squash = 1;
    this.sway = 0;
    this.extraLean = 0;
    this.extraSquash = 1;
    this._ride = null;
    this.rideSpeed = 0;
    this.onLand = null;
    this.onBump = null;
    this.onRideLost = null;
    this.onStumble = null;
    this._res = null;
    this._safetyAt = 0;
    this._carry = 0;
  }

  get busy() {
    return Boolean(this.step || this.queue.length);
  }

  get airborne() {
    return this.step?.type === 'hop' || this.step?.type === 'drop' || this.step?.type === 'fly';
  }

  get x() {
    return this.m.root.position.x;
  }

  get y() {
    return this.m.root.position.y;
  }

  get surfaceId() {
    return this.step?.surfaceId || this._ride?.surface?.id || this.standingSurfaceId || 'floor';
  }

  get activeRide() {
    return this._ride;
  }

  get isRiding() {
    return Boolean(this._ride);
  }

  play(steps, { standingSurfaceId = null } = {}) {

    if (this.step && this.airborne && this.step.phase === 'air') {
      const old = this._res;
      this._res = null;
      if (old) old('replaced');
      this.queue = (steps || []).map((s) => ({ ...s }));
      return new Promise((resolve) => {
        this._res = resolve;
      });
    }

    this._carry = this.step?.type === 'walk' ? this.speed : 0;
    this.stop('replaced');
    if (standingSurfaceId) this.standingSurfaceId = standingSurfaceId;
    this.queue = (steps || []).map((s) => ({ ...s }));
    return new Promise((resolve) => {
      this._res = resolve;
      this._advance();
    });
  }

  walkTo(x, y, surfaceId) {
    return this.play([{ type: 'walk', x, y, surfaceId }]);
  }

  flyTo(x, y, surfaceId) {
    if (y === undefined || y === null) {
      const surf = this.w.surfaceById(surfaceId);
      y = surf ? surf.y : this.y;
    }
    return this.play([{ type: 'fly', x, y, surfaceId }]);
  }

  retargetWalk(x, surfaceId) {
    const s = this.step;
    if (!s || s.type !== 'walk' || this.queue.length) return false;
    if (surfaceId && s.surfaceId !== surfaceId) return false;
    s.x = x;
    return true;
  }

  easeStop() {
    const s = this.step;
    if (!s || s.type !== 'walk' || this.queue.length) return false;
    const brake = TUNING.speed.brake || TUNING.speed.decel;
    s.x = this.w.clampX(this.x + this.dir * (this.speed * this.speed) / (2 * brake));
    return true;
  }

  faceTo(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    this.targetFacing = clamp(Math.atan2(dx, Math.abs(dy) * 0.7 + 40), -1.25, 1.25);
  }

  stop(reason = 'stopped') {
    if (this.step && (this.step.type === 'hop' || this.step.type === 'fly') && this.step.phase === 'air') return;
    this.queue = [];
    this.step = null;
    this.speed = 0;
    this.pitch = 0;
    const r = this._res;
    this._res = null;
    if (r) r(reason);
    if (reason !== 'replaced') this.m.play('idle', { loop: true, fade: 0.25 });
  }

  ride(surface, offsetX = 0, lift = 0) {
    this._ride = { surface, offsetX, lift };
    this.rideSpeed = 0;
  }

  unride() {
    this._ride = null;
  }

  _advance() {
    if (!this.queue.length) {
      this.step = null;
      this.speed = 0;
      this.pitch = 0;
      const r = this._res;
      this._res = null;
      if (this.m.currentClip === 'walk' || this.m.currentClip === 'run' || this.m.currentClip === 'sneak' || this.m.currentClip === 'happy_jump' || this.m.currentClip === 'fly') {
        this.m.play('idle', { loop: true, fade: 0.3 });
      }
      if (r) r('done');
      return;
    }
    const s = this.queue.shift();
    if (s.y === undefined || s.y === null || Number.isNaN(s.y)) {
      const surf = this.w.surfaceById(s.surfaceId);
      s.y = surf ? surf.y : this.y;
    }
    if (s.x === undefined || s.x === null || Number.isNaN(s.x)) {
      s.x = this.x;
    }
    this.step = s;
    if (s.type === 'walk') {
      this.m.root.position.y = s.y;
      const nd = Math.sign(s.x - this.x) || 1;
      this.speed = this._carry > 0 && nd === this.dir ? this._carry : 0;
      this._carry = 0;
      this.pitch = 0;
      this.dir = nd;
      this._walkClip(s);
      return;
    }
    if (s.type === 'fly') {
      this._startFly(s);
      return;
    }
    s.phase = 'crouch';
    s.t = 0;
    s.x0 = this.x;
    s.y0 = this.y;
    const up = s.y - s.y0;
    s.crouch = s.type === 'hop' && up > 4 ? TUNING.jump.crouchMs / 1000 : 0;
    s.h = s.type === 'drop' ? 0 : Math.max(22, up * 0.55 + 20);
    s.air = s.type === 'drop' ? 0 : clamp(2 * Math.sqrt((2 * s.h) / GRAVITY), 0.3, 0.9);
    this.speed = 0;
    this.pitch = 0;
    if (s.type === 'hop') this._jumpClip(s.air);
  }

  _startFly(s) {
    s.phase = 'air';
    s.t = 0;
    s.flaring = false;
    s.x0 = this.x;
    s.y0 = this.y;
    const dx = s.x - s.x0;
    const dy = s.y - s.y0;
    const dist = Math.hypot(dx, dy);

    const cfg = TUNING.flight || {};
    const flySpeed = cfg.speed || 440;
    const maxDur = cfg.maxDuration || 2.85;

    const minDur = Math.min(cfg.minDuration || 0.7, 0.4 + dist / 900);
    s.duration = clamp(dist / flySpeed, minDur, maxDur);

    const isClimb = dy > 30;
    const isDescent = dy < -30;
    const baseArc = clamp(dist * (cfg.climbArc || 0.22), Math.min(cfg.minArc || 50, dist * 0.4), cfg.maxArc || 190);
    const wanted = isClimb ? baseArc * 0.7 : isDescent ? baseArc * 0.85 : baseArc;

    s.ceil = this.w.ceilingY ?? Infinity;
    s.arcH = Math.max(0, Math.min(wanted, s.ceil - Math.max(s.y0, s.y) - 6));

    this.speed = dist / s.duration;
    this.dir = Math.sign(dx) || 1;

    const natural = (this.m.speeds.fly || 9.06) * this.m.pxPerMeter;
    const timeScale = clamp(natural > 0 ? (this.speed * 1.5) / natural : 1.0, 0.85, 1.35);
    this.m.play('fly', { loop: true, fade: 0.22, timeScale });

    this.targetFacing = clamp(this.dir * 1.35, -1.45, 1.45);
    this.m.facing = this.targetFacing;
    if (this.m.root) this.m.root.rotation.y = this.m.facing;
    this.pitch = 0;
    this.lean = 0;
    this.squash = 1.04;
  }

  _walkClip(s) {
    const dist = Math.abs(s.x - this.x);
    const run = s.run || dist > 520;
    const sneak = Boolean(s.sneak);
    const clip = sneak ? 'sneak' : (run ? 'run' : 'walk');
    const speed = s.speed || (sneak ? TUNING.speed.sneak : (run ? TUNING.speed.run : TUNING.speed.walk));
    s.speed = speed;
    const natural = (this.m.speeds[clip] || (sneak ? 1.6 : (run ? 3.9 : 2))) * this.m.pxPerMeter;
    s.baseScale = clamp(speed / natural, 0.4, 2.2);
    this.m.play(clip, { loop: true, fade: 0.22, timeScale: s.baseScale });
  }

  _jumpClip(air) {
    const dur = this.m.clipDuration('happy_jump') || 1;
    this.m.play('happy_jump', { fade: 0.14, timeScale: clamp(dur / (air + 0.12), 0.6, 2.4) });
  }

  update(dt) {
    if (this._ride && !this.step) this._updateRide(dt);
    if (this.step) {
      if (this.step.type === 'walk') this._updateWalk(dt);
      else if (this.step.type === 'fly') this._updateFly(dt);
      else this._updateAir(dt);
    }

    this.sway *= Math.pow(0.0001, dt);
    this.extraLean *= Math.pow(0.002, dt);
    this.extraSquash += (1 - this.extraSquash) * Math.min(1, dt * 7);
    this.m.applyPose?.({
      lean: this.lean + this.sway + (this.extraLean || 0),
      squash: this.squash * (this.extraSquash || 1),
      pitch: this.pitch || 0,
    });
    this.squash += (1 - this.squash) * Math.min(1, dt * 9);
    this.lean *= Math.pow(0.02, dt);
    this.pitch *= Math.pow(0.04, dt);

    const f = this.m.facing ?? 0;
    let d = (this.targetFacing - f) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.m.facing = f + d * Math.min(1, dt * TUNING.speed.turnRate);
    if (this.m.root) this.m.root.rotation.y = this.m.facing;
  }

  _updateWalk(dt) {
    const s = this.step;
    s.x = this.w.clampX ? this.w.clampX(s.x) : s.x;
    const dx = s.x - this.x;
    const dist = Math.abs(dx);
    if (dist < 1.2) {
      this.m.root.position.x = s.x;
      this._endStep('arrived');
      return;
    }
    const want = Math.sign(dx);
    if (want !== this.dir) {

      this.speed = Math.max(0, this.speed - TUNING.speed.decel * dt);
      this.m.root.position.x += this.dir * this.speed * dt;
      this.lean = -this.dir * TUNING.speed.lean * (s.speed ? this.speed / s.speed : 0);
      this._syncStride(s);
      if (this.speed > 12) return;
      this.speed = 0;
      this.dir = want;
    }

    const brake = TUNING.speed.brake || TUNING.speed.decel;
    const cap = Math.min(s.speed, Math.sqrt(Math.max(0, 2 * brake * dist)));
    this.speed = Math.min(s.speed, this.speed + TUNING.speed.accel * dt);
    this.speed = Math.min(this.speed, Math.max(cap, 8));
    const move = Math.min(this.speed * dt, dist);
    const e = this.w.edge ?? 0;
    this.m.root.position.x = clamp(this.x + this.dir * move, e, Math.max(e, (this.w.W || 1e9) - e));
    this.targetFacing = clamp(Math.atan2(this.dir * 60, 60), -1.25, 1.25);
    const ratio = s.speed ? this.speed / s.speed : 0;
    this.lean = -this.dir * TUNING.speed.lean * ratio;
    this.phase += move / Math.max(1, s.speed * 0.55);
    this._syncStride(s);

    const now = performance.now();
    if (dist > 18 && now - this._safetyAt > 120) {
      this._safetyAt = now;
      const ahead = this.x + this.dir * 8;
      const inside = this.w.bodyBlocked(this.x, this.y);
      if (!inside && this.w.bodyBlocked(ahead, this.y)) {
        this.onBump?.(s);
        this._endStep('blocked');
      }
    }
  }

  _syncStride(s) {
    const a = this.m.currentAction;
    const clip = this.m.currentClip;
    if (!a || !s.baseScale || (clip !== 'walk' && clip !== 'run' && clip !== 'sneak')) return;
    a.timeScale = s.baseScale * clamp(s.speed ? this.speed / s.speed : 0, 0.35, 1);
  }

  _updateAir(dt) {
    const s = this.step;
    s.t += dt;
    if (s.crouch && s.phase === 'crouch') {
      this.squash = 1 - TUNING.jump.squash * 0.8 * (s.t / s.crouch);
      if (s.t >= s.crouch) {
        s.phase = 'air';
        s.t = 0;
        this.squash = 1;
      }
      return;
    }
    if (s.phase === 'crouch') {
      s.phase = 'air';
      s.t = 0;
    }
    if (s.type === 'drop') {
      s.t += dt;
      const dist = Math.max(1, s.y0 - s.y);
      const fall = Math.min(dist, 0.5 * GRAVITY * s.t * s.t);
      this.m.root.position.y = Math.max(s.y, s.y0 - fall);
      this.m.root.position.x = s.x0 + (s.x - s.x0) * Math.min(1, s.t * 1.6);
      if (this.m.root.position.y <= s.y + 0.5) {
        this.m.root.position.y = s.y;
        this._land(s, 'drop');
      }
      return;
    }
    const p = Math.min(1, s.t / s.air);
    this.m.root.position.x = s.x0 + (s.x - s.x0) * p;
    const arc = 4 * s.h * p * (1 - p);
    const top = Math.max(this.w.ceilingY ?? Infinity, s.y, s.y0);
    this.m.root.position.y = Math.min(top, s.y0 + (s.y - s.y0) * p + arc);
    this.targetFacing = clamp(Math.atan2((s.x - s.x0) * 0.5, 90), -1.25, 1.25);
    if (p >= 1) {
      this.m.root.position.x = s.x;
      this.m.root.position.y = s.y;
      this._land(s, 'hop');
    }
  }

  flyPos(s, p) {

    const ease = p * p * p * (p * (p * 6 - 15) + 10);
    const curX = s.x0 + (s.x - s.x0) * ease;
    const arcY = Math.sin(Math.PI * Math.pow(p, 0.88)) * (s.arcH || 0);
    const windTurbulence = Math.sin(p * Math.PI * 4) * 3.0 * (4 * p * (1 - p));
    const curY = s.y0 + (s.y - s.y0) * ease + arcY + windTurbulence;
    const e = this.w.edge ?? 0;
    const minX = Math.min(e, s.x0, s.x);
    const maxX = Math.max((this.w.W || 1e9) - e, s.x0, s.x);
    const topY = Math.max(s.ceil ?? Infinity, s.y, s.y0);
    return {
      x: clamp(curX, minX, maxX),
      y: clamp(curY, 0, topY),
    };
  }

  _updateFly(dt) {
    const s = this.step;
    s.t += dt;
    const p = Math.min(1, s.t / s.duration);
    const pos = this.flyPos(s, p);
    this.m.root.position.x = pos.x;
    this.m.root.position.y = pos.y;

    const groundEase = Math.min(1, Math.max(0, (p - 0.25) / 0.65));
    const smoothGround = groundEase * groundEase * (3 - 2 * groundEase);
    this.m.groundY = s.y0 + (s.y - s.y0) * smoothGround;

    const deltaP = 0.02;
    const pPrev = Math.max(0, p - deltaP);
    const pNext = Math.min(1, p + deltaP);
    const posPrev = this.flyPos(s, pPrev);
    const posNext = this.flyPos(s, pNext);
    const tangentX = posNext.x - posPrev.x;
    const tangentY = posNext.y - posPrev.y;

    if (Math.abs(tangentX) > 0.5) {
      this.dir = Math.sign(tangentX);
    }
    this.targetFacing = clamp(this.dir * 1.35, -1.45, 1.45);

    const flarePhase = TUNING.flight?.flarePhase || 0.82;
    let flightWeight = 1;
    if (p >= flarePhase) {
      flightWeight = Math.max(0, (1 - p) / (1 - flarePhase));
      flightWeight = flightWeight * flightWeight * (3 - 2 * flightWeight);
      if (!s.flaring) {
        s.flaring = true;
        this.m.play('idle', { loop: true, fade: 0.28 });
      }
    }

    const pathAngle = Math.atan2(tangentY, Math.abs(tangentX));

    const maxPitch = TUNING.flight?.pitchMax || 0.22;
    this.pitch = -clamp(pathAngle, -maxPitch, maxPitch) * flightWeight;

    this.lean = -this.dir * (TUNING.flight?.bankMax || 0.08) * Math.sin(Math.PI * p) * flightWeight;

    if (p >= 1) {
      this.m.root.position.x = s.x;
      this.m.root.position.y = s.y;
      this.m.groundY = s.y;
      this.m.standingY = s.y;
      this.pitch = 0;
      this.lean = 0;
      this._land(s, 'fly');
    }
  }

  _land(s, kind) {
    this.squash = kind === 'fly' ? 1 - TUNING.jump.squash * 0.75 : 1 - TUNING.jump.squash;
    this.standingSurfaceId = s.surfaceId;
    if (TUNING.jump.dust) this.m.puff?.(this.x, s.y, kind === 'drop' ? 0.7 : kind === 'fly' ? 0.85 : 1);
    this.onLand?.(s, kind);
    this._endStep('arrived');
  }

  _endStep(reason) {
    const s = this.step;
    this.step = null;
    this.speed = 0;
    this.lean = 0;
    this._advance();
    void s;
    void reason;
  }

  _updateRide(dt) {
    if (!this._ride) return;
    const live = this.w.liveRect(this._ride.surface);
    if (!live) {
      this._ride = null;
      this.onRideLost?.();
      return;
    }
    const cx = (live.xMin + live.xMax) / 2;
    const want = this.w.clampX(clamp(cx + this._ride.offsetX, live.xMin - 30, live.xMax + 30));
    const dx = want - this.m.root.position.x;
    this.m.root.position.x = want;
    this.m.root.position.y = live.y + this._ride.lift;
    this._ride.surface = { ...this._ride.surface, ...live };
    this.rideSpeed = Math.abs(dx) / Math.max(dt, 0.001);
    if (Math.abs(dx) > 0.6) {
      this.sway = clamp(-dx * 0.012, -TUNING.window.swayMax, TUNING.window.swayMax);
      if (this.rideSpeed > TUNING.window.stumbleSpeed) this.onStumble?.('drag');
    }
  }
}

