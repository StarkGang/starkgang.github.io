import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { measureSkinned } from './measure.js';
import { TUNING } from './tuning.js';

export const ABORT = Symbol('mascot-abort');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const shortestAngle = (from, to) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class Mascot {
  constructor(config = {}) {
    this.config = config;
    this.registry = config.clips || {};
    this.speeds = config.speeds || {};
    this.actions = {};
    this.clipNames = new Map();
    this.currentAction = null;
    this.currentClip = null;
    this._resolveCurrent = null;
    this._loadPromise = null;
    this.facing = 0;
    this.targetFacing = 0;
    this.charPx = 300;
    this.pxPerMeter = 160;
    this.hud = null;
    this.paused = false;
    this.pose = { lean: 0, squash: 1, pitch: 0 };
    this.sitting = false;
    this.sitLift = 0;
    this.standingY = 48;
    this.groundY = 48;
  }

  async init(host = document.getElementById('desktop')) {
    this.host = host;
    const isMobile = window.innerWidth <= 600 || window.matchMedia('(pointer: coarse)').matches;
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !isMobile,
      powerPreference: 'high-performance',
    });
    renderer.setClearAlpha(0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    this.renderer = renderer;

    const canvas = renderer.domElement;
    canvas.id = 'mascot-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    this.canvas = canvas;

    this.layer = document.createElement('div');
    this.layer.id = 'mascot-layer';
    this.layer.appendChild(canvas);
    host.appendChild(this.layer);

    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 3000);
    this.scene.add(this.camera);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8d93a1, 2.1);
    this.scene.add(hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 2.4);
    this.key.position.set(-0.7, 1.3, 2.0);
    this.scene.add(this.key);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.85);
    fill.position.set(1.4, 0.5, 1.6);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(0.4, 1.4, -1.2);
    this.scene.add(rim);

    this.root = new THREE.Group();
    this.root.name = 'mascot-root';
    this.scene.add(this.root);

    await this._loadModel();
    this._buildShadow();
    this._buildPuffs();
    this.resize();
    this._loop = this._loop.bind(this);
    this._clock = new THREE.Clock();
    this._raf = requestAnimationFrame(this._loop);
    return this;
  }

  async _loadModel() {
    const loader = new GLTFLoader();
    const url = this.config.model || 'assets/mascot/mascot.glb';
    const t0 = performance.now();
    const gltf = await loader.loadAsync(url);
    this.loadMs = Math.round(performance.now() - t0);
    this.gltf = gltf;

    const model = gltf.scene;
    model.name = 'mascot-model';
    this.model = model;

    const box = this._measure(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    this.modelHeight = size.y || 1.84;
    this.modelBounds = { min: box.min.clone(), max: box.max.clone() };
    if (this.config.debug) console.info('[mascot] model size', size.toArray().map((v) => +v.toFixed(3)));

    model.position.set(0, 0, 0);
    const holder = new THREE.Group();
    holder.add(model);
    holder.position.y = 0;
    holder.position.x = -(box.min.x + box.max.x) / 2;
    this.holder = holder;
    this.root.add(holder);

    model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.castShadow = false;
        o.receiveShadow = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          m.side = THREE.FrontSide;
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          m.metalness = Math.min(m.metalness ?? 0, 0.25);
          m.roughness = clamp(m.roughness ?? 0.75, 0.45, 1);
          m.envMapIntensity = 1;
          m.needsUpdate = true;
        }
        o.material = mats.length === 1 ? mats[0] : mats;
      }
      if (o.isSkinnedMesh) {
        o.skeleton.pose();
        this.skin = o;
      }
      if (o.isBone && /Head$/i.test(o.name)) this.headBone = o;
      if (o.isBone && /Hips/i.test(o.name)) this.hipsBone = o;
    });

    this.mixer = new THREE.AnimationMixer(model);
    this.animByName = new Map(gltf.animations.map((a) => [a.name, a]));

    for (const anim of gltf.animations) {
      this._sanitizeTracks(anim);
    }

    for (const [logical, entry] of Object.entries(this.registry)) {
      const def = typeof entry === 'string' ? { clip: entry } : entry;
      if (!def) continue;
      if (def.url) {
        this._loadExternalClip(logical, def);
        continue;
      }
      const anim = this.animByName.get(def.clip);
      if (!anim) {
        console.warn(`[mascot] clip "${def.clip}" for "${logical}" not found in ${url}`);
        continue;
      }
      this._register(logical, anim, def);
    }

    for (const anim of gltf.animations) {
      if (!this.clipNames.has(anim.name) && !this.actions[anim.name]) {
        this.actions[anim.name] = this.mixer.clipAction(anim);
      }
    }

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.currentAction && this._resolveCurrent) {
        const r = this._resolveCurrent;
        this._resolveCurrent = null;
        r('done');
      }
    });

    if (this.actions.idle) this.play('idle', { fade: 0 });
    return gltf;
  }

  _sanitizeTracks(anim) {
    if (!anim?.tracks) return;
    for (const track of anim.tracks) {
      if (!/hips\.position$/i.test(track.name)) continue;
      const count = track.times?.length || 0;
      if (count < 2) continue;
      const t0 = track.times[0];
      const tDur = track.times[count - 1] - t0;
      for (let axis = 0; axis < 3; axis++) {
        const v0 = track.values[axis];
        const vEnd = track.values[(count - 1) * 3 + axis];
        const delta = vEnd - v0;
        if (Math.abs(delta) > 5) {
          for (let i = 0; i < count; i++) {
            const progress = tDur > 0 ? (track.times[i] - t0) / tDur : i / (count - 1);
            track.values[i * 3 + axis] -= delta * progress;
          }
        }
      }
    }
  }

  _register(logical, anim, def = {}) {
    this._sanitizeTracks(anim);
    const action = this.mixer.clipAction(anim);
    action.enabled = true;
    action.setEffectiveWeight(1);
    if (def.trimLoop) {

      anim.duration = Math.max(0.2, anim.duration - 1 / 30);
    }
    this.actions[logical] = action;
    this.clipNames.set(logical, anim.name);
  }

  async _loadExternalClip(logical, def) {
    try {
      const gltf = await new GLTFLoader().loadAsync(def.url);
      const anim = gltf.animations.find((a) => !def.clip || a.name === def.clip) || gltf.animations[0];
      if (!anim) return;
      this._register(logical, anim, def);
    } catch (err) {
      console.warn('[mascot] extra clip failed to load', logical, err);
    }
  }

  _measure(model) {
    model.updateWorldMatrix(true, true);
    model.traverse((o) => {
      if (o.isSkinnedMesh) o.skeleton.update();
    });
    return measureSkinned(model);
  }

  _buildShadow() {
    const c = document.createElement('canvas');    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    this.shadow = new THREE.Mesh(geo, mat);
    this.shadow.renderOrder = -1;
    this.shadow.scale.set(this.charPx * 0.42, this.charPx * 0.1, 1);
    this.scene.add(this.shadow);
  }

  _buildPuffs() {
    const tex = this.shadow.material.map;
    this._puffs = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this._puffs.push({ mesh, live: null });
    }
  }

  puff(x, y, power = 1) {
    if (!this._puffs) return;
    for (const dir of [-1, 1]) {
      const p = this._puffs.find((q) => !q.live);
      if (!p) return;
      p.live = { t: 0, x, y, power, dir };
    }
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    const isMobile = this.W <= 600 || window.matchMedia('(pointer: coarse)').matches;
    const maxDpr = isMobile ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(this.W, this.H, false);
    this.camera.left = -this.W / 2;
    this.camera.right = this.W / 2;
    this.camera.bottom = -this.H / 2;
    this.camera.top = this.H / 2;
    this.camera.position.set(this.W / 2, this.H / 2, 1000);
    this.camera.lookAt(this.W / 2, this.H / 2, 0);
    this.camera.updateProjectionMatrix();

    const prevPx = this.charPx;
    if (isMobile) {

      this.charPx = clamp(Math.round(this.W * 0.22), 80, 110);
    } else {
      this.charPx = clamp(Math.round(this.H * TUNING.scale.heightRatio), TUNING.scale.minPx, TUNING.scale.maxPx);
    }
    this.pxPerMeter = this.charPx / (this.modelHeight || 1.84);
    this.root.scale.setScalar(this.pxPerMeter);

    const taskbar = document.getElementById('taskbar');
    this.taskbarCss = taskbar ? taskbar.offsetHeight : (isMobile ? 56 : 48);
    this.seatY = this.taskbarCss;
    this.homeY = this.seatY + 4;

    if (this.root) {
      const halfW = this.charPx * TUNING.body.halfWidthRatio + 4;
      this.root.position.x = clamp(this.root.position.x, halfW, this.W - halfW);
      if (this.sitting) this.root.position.y = clamp(this.standingY - this.sitLift, 0, this.H);
    }
    void prevPx;
    if (this.shadow) {
      this.shadow.scale.set(this.charPx * 0.42, this.charPx * 0.1, 1);
    }
  }

  play(name, { fade = 0.3, loop, timeScale = 1, restart = false, force = false } = {}) {
    const action = this.actions[name];
    if (!action) {
      console.warn('[mascot] no clip registered as', name);
      return Promise.resolve('missing');
    }
    if (this.currentAction === action && !restart && !force) {
      return this._resolveCurrent ? this._currentPromise : Promise.resolve('loop');
    }
    if (this._resolveCurrent) {
      const r = this._resolveCurrent;
      this._resolveCurrent = null;
      r('replaced');
    }

    const prev = this.currentAction;
    const doLoop = loop === undefined ? false : loop;
    action.reset();
    action.setLoop(doLoop ? THREE.LoopRepeat : THREE.LoopOnce, doLoop ? Infinity : 1);
    action.clampWhenFinished = !doLoop;
    action.timeScale = timeScale;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    if (prev && prev !== action) {
      action.crossFadeFrom(prev, fade, true);
    } else if (!prev) {
      action.fadeIn(fade);
    }
    this.currentAction = action;
    this.currentClip = name;
    this.currentLoop = doLoop;

    if (doLoop) return Promise.resolve('loop');
    const p = new Promise((res) => {
      this._resolveCurrent = res;
    });
    this._currentPromise = p;
    return p;
  }

  async toIdle(fade = 0.3) {
    return this.play('idle', { loop: true, fade });
  }

  clipDuration(name) {
    const a = this.actions[name];
    return a ? a.getClip().duration : 0;
  }

  wait(ms, check) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        try {
          if (check) check();
        } catch (e) {
          resolve('aborted');
          return;
        }
        if (performance.now() - t0 >= ms) {
          resolve('ok');
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  get position() {
    return this.root.position;
  }

  get x() {
    return this.root.position.x;
  }

  get y() {
    return this.root.position.y;
  }

  applyPose({ lean = 0, squash = 1, pitch = 0 } = {}) {
    this.pose.lean = lean;
    this.pose.squash = squash;
    this.pose.pitch = pitch;
  }

  stopMovement(reason = 'stopped') {
    if (this.motion) this.motion.stop(reason);
  }

  placeAt(x, y) {
    const halfW = this.charPx * TUNING.body.halfWidthRatio + 4;
    this.root.position.x = clamp(x, halfW, Math.max(halfW, this.W - halfW));
    this.root.position.y = Math.max(0, y);
    this.standingY = y;
    this.groundY = y;
  }

  faceOrigin() {
    this.targetFacing = 0;
  }

  facePoint(x, y) {
    const dx = x - this.root.position.x;
    const dy = y - this.root.position.y;
    this.targetFacing = clamp(Math.atan2(dx, Math.abs(dy) * 0.7 + 40), -1.25, 1.25);
  }

  setSitting(surfaceY) {
    this.standingY = surfaceY;
    this.play('sit_idle', { loop: true, fade: 0.3 });
    if (this.root) this.root.updateMatrixWorld(true);
    const expectedHip = this.charPx * 0.82;
    const curHip = this.hipsBone ? (this.pelvisWorldY() - this.root.position.y) : expectedHip;
    const hip = (curHip > 20 && curHip < this.charPx * 1.5) ? curHip : expectedHip;
    this.sitLift = Math.max(0, hip - this.charPx * 0.02);
    this.sitting = true;
    const maxSitY = this.H - Math.max(20, this.charPx * 0.42 + 4);
    const clampedY = Math.min(surfaceY, maxSitY);
    this.root.position.y = clampedY - this.sitLift;
    this.groundY = surfaceY;
  }

  standOn(surfaceY) {
    this.sitting = false;
    this.sitLift = 0;
    this.standingY = surfaceY;
    this.groundY = surfaceY;
    const maxStandY = this.H - Math.max(40, this.charPx * 0.98 + 4);
    this.root.position.y = Math.min(surfaceY, maxStandY);
    if (this.currentClip === 'sit_idle') {
      this.play('idle', { loop: true, fade: 0.25 });
    }
  }

  pelvisWorldY() {
    if (!this.hipsBone) return this.root.position.y + this.charPx * 0.5;
    const v = new THREE.Vector3();
    this.hipsBone.getWorldPosition(v);
    return v.y;
  }

  headWorld() {
    if (!this.headBone) {
      return new THREE.Vector3(this.root.position.x, this.root.position.y + this.charPx * 0.92, 0);
    }
    const v = new THREE.Vector3();
    this.headBone.getWorldPosition(v);
    return v;
  }

  headCss() {
    const v = this.headWorld();
    return { x: v.x, y: this.H - v.y - this.charPx * 0.06 };
  }

  bodyCssRect() {
    const x = this.root.position.x;
    const feet = this.sitting ? this.root.position.y + this.sitLift : this.root.position.y;
    const h = this.charPx * (this.sitting ? 0.65 : 0.95);
    const w = this.charPx * 0.44;
    return {
      left: x - w / 2,
      right: x + w / 2,
      top: this.H - feet - h,
      bottom: this.H - feet,
    };
  }

  update(dt) {
    if (this.mixer) this.mixer.update(dt);

    const sq = Math.min(1.35, Math.max(0.6, this.pose.squash || 1));
    if (this.holder) {
      this.holder.rotation.z = this.pose.lean || 0;
      this.holder.rotation.x = this.pose.pitch || 0;
      const s = 1 / Math.sqrt(sq);
      this.holder.scale.set(s, sq, s);
    }

    if (this.shadow) {
      const air = Math.max(0, this.root.position.y - this.groundY);
      const drop = Math.min(1, air / (this.charPx * 1.2));
      const s = (this.sitting ? 0.8 : 1) * (1 - drop * 0.45);
      this.shadow.position.set(this.root.position.x, this.groundY + 2, -6);
      this.shadow.scale.set(this.charPx * 0.42 * s, this.charPx * 0.1 * s, 1);
      if (this.shadow.material) this.shadow.material.opacity = 0.85 * (1 - drop * 0.6);
    }

    if (this._puffs) {
      for (const p of this._puffs) {
        if (!p.live) continue;
        p.live.t += dt;
        const k = p.live.t / 0.55;
        if (k >= 1) {
          p.live = null;
          p.mesh.visible = false;
          continue;
        }
        const size = this.charPx * (0.16 + k * 0.5) * p.live.power;
        p.mesh.visible = true;
        p.mesh.scale.set(size, size * 0.45, 1);
        p.mesh.position.set(p.live.x + p.live.dir * size * k * 0.6, p.live.y + 3 + k * this.charPx * 0.06, -5);
        p.mesh.material.opacity = 0.42 * (1 - k);
      }
    }
  }

  _loop() {
    if (this.paused) {
      this._raf = null;
      return;
    }
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this._clock.getDelta());
    if (this.onFrame) this.onFrame(dt);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.hud) this.hud(dt);
  }

  setPaused(p) {
    this.paused = p;
    if (p) {
      if (this._raf) {
        cancelAnimationFrame(this._raf);
        this._raf = null;
      }
    } else {
      this._clock.getDelta();
      if (!this._raf) {
        this._loop();
      }
    }
  }
}

