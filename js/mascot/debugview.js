
export class DebugView {
  constructor({ stage, world, motion, brain }) {
    this.m = stage;
    this.w = world;
    this.motion = motion;
    this.brain = brain;
    this.on = false;

    const c = document.createElement('canvas');
    c.id = 'mascot-debug-view';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.text = document.createElement('div');
    this.text.id = 'mascot-debug-text';
    document.body.appendChild(this.text);
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toggle(force) {
    this.on = force === undefined ? !this.on : Boolean(force);
    this.canvas.style.display = this.on ? 'block' : 'none';
    this.text.style.display = this.on ? 'block' : 'none';
    if (this.on) this.draw();
  }

  draw() {
    if (!this.on) return;
    const ctx = this.ctx;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const world = this.w;
    const css = (y) => H - y;
    ctx.clearRect(0, 0, W, H);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,0,200,0.85)';
    ctx.fillStyle = 'rgba(255,0,200,0.06)';
    for (const win of world.windows) {
      ctx.fillRect(win.left, win.top, win.w, win.h);
      ctx.strokeRect(win.left + 0.5, win.top + 0.5, win.w - 1, win.h - 1);
      ctx.fillStyle = 'rgba(255,0,200,0.9)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`win:${win.id}`, win.left + 6, win.top + 14);
      ctx.fillStyle = 'rgba(255,0,200,0.06)';
    }

    for (const ic of world.icons) {
      const surf = world.surfaceById(`icon:${ic.id}`);
      ctx.strokeStyle = surf ? 'rgba(80,220,255,0.9)' : 'rgba(120,120,120,0.8)';
      ctx.fillStyle = surf ? 'rgba(80,220,255,0.08)' : 'rgba(120,120,120,0.06)';
      ctx.fillRect(ic.left, ic.top, ic.w, ic.h);
      ctx.strokeRect(ic.left + 0.5, ic.top + 0.5, ic.w - 1, ic.h - 1);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(`${ic.id}${surf?.canSit ? ' •sit' : surf ? '' : ' •unreachable'}`, ic.left, ic.top - 3);
    }

    for (const s of world.surfaces) {
      const y = css(s.y);
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [a, b] of world.segments(s)) {
        ctx.strokeStyle = s.id === world.surfaces[0].id ? 'rgba(90,255,150,0.9)' : 'rgba(90,255,150,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a, y);
        ctx.lineTo(b, y);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      if (s.canSit) {
        ctx.fillStyle = 'rgba(90,255,150,0.5)';
        ctx.fillRect(s.xMin, y - 1.5, 6, 3);
      }
    }

    const hw = world.hw;
    const feet = this.m.root.position.y;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeRect(this.m.x - hw, css(feet + this.m.charPx), hw * 2, this.m.charPx);
    ctx.strokeStyle = 'rgba(255,220,80,0.9)';
    ctx.strokeRect(this.m.x - hw, css(feet + world.bodyH), hw * 2, world.bodyH);

    if (this.motion.step) {
      const st = this.motion.step;
      if (st.type === 'fly') {
        ctx.strokeStyle = 'rgba(80,210,255,0.9)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        const steps = 30;
        for (let i = 0; i <= steps; i++) {
          const p = i / steps;
          const pos = this.motion.flyPos(st, p);
          if (i === 0) ctx.moveTo(pos.x, css(pos.y));
          else ctx.lineTo(pos.x, css(pos.y));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(this.m.x, css(feet));
        ctx.lineTo(st.x, css(st.y));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(st.x, css(st.y), 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    const c = world.cursor;
    if (c.inside) {
      ctx.strokeStyle = 'rgba(255,180,60,0.9)';
      ctx.beginPath();
      ctx.arc(c.x, c.yCss, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x - 14, c.yCss);
      ctx.lineTo(c.x + 14, c.yCss);
      ctx.moveTo(c.x, c.yCss - 14);
      ctx.lineTo(c.x, c.yCss + 14);
      ctx.stroke();
    }

    const d = this.brain.debugState();
    const lines = [
      `${d.name}   state: ${d.state}${d.target ? ` → ${d.target}` : ''}`,
      `standing: ${d.surface}   sitting: ${d.sittingOn || '–'}   clip: ${d.clip}`,
      `priority: ${d.priority}   watching: ${d.watching || '–'}   follows: ${d.follows ? 'yes' : 'no'}`,
      `feet: ${Math.round(this.m.x)}, ${Math.round(feet)}   hw: ${Math.round(hw)}   band: ${Math.round(world.bodyH)}`,
      `surfaces: ${world.surfaces.length}   icons: ${world.icons.length}   windows: ${world.windows.length}`,
      `cursor: ${c.inside ? `${Math.round(c.x)}, ${Math.round(c.yCss)} (${Math.round(performance.now() - c.at)}ms)` : 'outside'}`,
    ];
    this.text.innerHTML = lines
      .map((l, i) => `<div${i === 0 ? ' class="head"' : ''}>${l.replace(/</g, '&lt;')}</div>`)
      .join('');
  }
}

