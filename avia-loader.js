// AviaFly loader, drawn in ONE canvas (no HTML elements): sky, sun, drifting clouds, an endless seamless sea,
// the logo, the progress bar with the plane, tips, the PLAY button. Shown from the very first byte (index.html).
// The engine reports through window.__aviaLoader:
//   progress(p 0..100)  - from PreloaderScene.update
//   done(go)            - loading finished; go() opens the game. PLAY reacts to pointerup / touchend (phones: the
//                         engine prevents touch defaults, so a 'click' may never come). The tap unlocks the sound.
(function () {
  const C = document.getElementById('avia-loader');
  if (!C) return;
  const g = C.getContext('2d');
  const O = window.__OPTIONS__ || {};
  const LNG = String(O.locale || 'en').slice(0, 2), RU = LNG === 'ru', ES = LNG === 'es';
  const R = 'html/LocalAviaGame/';
  const lg = new URLSearchParams(location.search).get('logo');
  const img = (src) => { const i = new Image(); i.src = src; return i; };
  const I = {
    logo: img(R + 'loader/logo_' + (/^[abc]$/.test(lg || '') ? lg : 'a') + '.webp'),
    plane: img(R + 'loader/plane.webp'),
    sea: img(R + 'assets/avia/sea_near_avia0001.png'),
    cloud: img(R + 'assets/avia/cloud_a_avia0001.png'),
  };
  const ok = (i) => i.complete && i.naturalWidth > 0;
  const TIPS = ES
    ? ['Atrapa monedas: cada una impulsa el avión hacia arriba', 'El escudo te salva de un misil', 'El anillo ×5 hace un rizo',
      'Portal: tres misiles, elige hacia dónde esquivar', 'Solo ganas si aterrizas en el portaaviones']
    : RU
    ? ['Лови монеты — каждая подкидывает самолёт вверх', 'Щит спасает от одной ракеты', 'Кольцо ×5 — мёртвая петля',
      'Портал: три ракеты, выбирай куда увернуться', 'Выигрыш твой, только если сел на авианосец']
    : ['Catch coins — each one throws the plane up', 'A shield saves you from one rocket', 'The ×5 ring makes a dead loop',
      'Portal: three rockets, choose where to dodge', 'You win only if you land on the carrier'];
  const PLAY = ES ? 'JUGAR' : RU ? 'ИГРАТЬ' : 'PLAY';
  let fontOk = false;
  try { new FontFace('aviaL', 'url(' + R + 'assets/fonts/obelix_sLbZgIId.woff2)').load().then((f) => { document.fonts.add(f); fontOk = true; }); } catch (e) {}
  const F = (px) => `${px}px ${fontOk ? 'aviaL' : "'Trebuchet MS', sans-serif"}`;

  let W = 0, H = 0, dpr = 1, u = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    C.width = Math.round(W * dpr); C.height = Math.round(H * dpr);
    u = W > H ? Math.min(W / 100, H * 1.8 / 100) : Math.min(W * 1.9 / 100, H / 100);
  }
  resize();
  addEventListener('resize', resize);

  const needs = [];   // [check() -> 0..1]: parts that must be ready before PLAY
  let eng = 0, engDone = null;
  let shown = 0, target = 0, real = 0, go = null, ready = 0, out = 0, t0 = performance.now(), last = t0;
  let tipI = (Math.random() * TIPS.length) | 0, tipT = 0, btn = null, switching = false, switchFrames = 0, switchAt = 0, press = 0;
  const clouds = [0, 1, 2].map((i) => ({ x: Math.random(), y: [0.12, 0.3, 0.56][i], s: [0.26, 0.18, 0.22][i], v: [0.012, 0.016, 0.009][i], a: [0.9, 0.7, 0.8][i] }));
  let seaX = 0;

  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const text = (s, x, y, px, fill, stroke, lw) => {
    g.font = F(px); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.strokeText(s, x, y); }
    g.fillStyle = fill; g.fillText(s, x, y);
  };

  function frame(now) {
    if (out >= 1) { C.remove(); return; }
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    if (!real) target = Math.min(12, t * 3);   // the engine code itself is still downloading: creep slowly
    else {
      // engine loading = 50 %, the game's own parts (atlases, sounds, 3D portal, art) = the other 50 %
      let n = 0; for (const f of needs) { try { n += Math.max(0, Math.min(1, +f() || 0)); } catch (e) {} }
      const parts = needs.length ? n / needs.length : 1;
      target = Math.max(target, Math.min(engDone ? 100 : 99, eng * 0.5 + parts * 50));
      if (engDone && parts >= 1 && !go) { go = engDone; target = 100; }
    }
    const gap = target - shown;
    if (gap > 0) shown += Math.min(gap, Math.max(gap * dt * 2.2, dt * 6), dt * 38);   // smooth: 6..38 % per second
    if (target < 100 && shown >= target - 1) shown += dt * 5 * Math.max(0, 1 - shown / 96);   // waiting for a big part: keeps moving, slowing near the end
    if (go && target >= 100 && shown > 99.6) shown = 100;
    if (shown === 100 && go) ready = Math.min(1, ready + dt * 2.2);
    if (switching) {
      // the game scene is starting under the loader: wait until it exists and has drawn ~12 frames, then fade
      const gm = window.__aviaGame;
      // ...and the engine's own scene fader is over (it would show a dark screen under our dissolve)
      if (gm && gm.data && gm.data.game && !gm.currentFader && !gm._isWaitingToHideFader) switchFrames++;
      if (switchFrames > 8 || now - switchAt > 5000) { switching = false; out = 0.001; }
      press = Math.min(1, press + dt * 6);
    }
    if (out > 0) out = Math.min(1, out + dt / 0.85);
    const oe = out * out * (3 - 2 * out);   // eased dissolve
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, C.width, C.height);   // translucent while dissolving: clear every frame
    // dissolve with a gentle zoom into the sky
    const zk = 1 + oe * 0.08;
    g.setTransform(dpr * zk, 0, 0, dpr * zk, (W * dpr * (1 - zk)) / 2, (H * dpr * (1 - zk)) / 2);
    g.globalAlpha = 1 - oe;

    // ---- sky + sun
    const horizon = H * 0.795;
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0d1d55'); sky.addColorStop(0.42, '#1b3c98'); sky.addColorStop(0.69, '#3f6fd8'); sky.addColorStop(0.9, '#f2a07a'); sky.addColorStop(1, '#ffcf86');
    g.fillStyle = sky; g.fillRect(0, 0, W, horizon + 2);
    const sr = 22 * u, sun = g.createRadialGradient(W / 2, horizon, 0, W / 2, horizon, sr);
    sun.addColorStop(0, 'rgba(255,240,180,.95)'); sun.addColorStop(0.35, 'rgba(255,200,110,.55)'); sun.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = sun; g.fillRect(W / 2 - sr, horizon - sr, sr * 2, sr * 2);
    // ---- clouds
    if (ok(I.cloud)) for (const c of clouds) {
      c.x -= c.v * dt;
      const cw = c.s * Math.max(W, H * 1.2), ch = cw * (I.cloud.naturalHeight / I.cloud.naturalWidth);
      if (c.x * W + cw < 0) c.x = 1 + Math.random() * 0.3;
      g.globalAlpha = (1 - oe) * c.a; g.drawImage(I.cloud, c.x * W, c.y * H, cw, ch);
    }
    g.globalAlpha = 1 - oe;
    // ---- sea: two OPAQUE layers of the game's wave tile (far one smaller and slower behind the near one), endless:
    // the offset is taken modulo the tile width, so the waves never jump; no translucent bands
    g.fillStyle = '#082a7a'; g.fillRect(0, horizon, W, H - horizon);
    seaX += dt;
    if (ok(I.sea)) {
      const seaH = H - horizon, ar = I.sea.naturalWidth / I.sea.naturalHeight;
      for (const [sp, y0, lh] of [[18, horizon - seaH * 0.06, seaH * 0.62], [42, horizon + seaH * 0.28, seaH * 0.78]]) {
        const tw = Math.round(lh * ar), off = Math.round(((seaX * sp * u * 0.35) % tw + tw) % tw);
        for (let x = -off; x < W; x += tw) g.drawImage(I.sea, x, Math.round(y0), tw + 1, Math.ceil(lh));
      }
    }
    g.globalAlpha = 1 - oe;
    // ---- logo + brand
    const cx = W / 2, top = H * (W > H ? 0.07 : 0.16);
    let y = top;
    if (ok(I.logo)) {
      const lw = Math.min(W * 0.84, 50 * u), lh = lw * (I.logo.naturalHeight / I.logo.naturalWidth), bob = Math.sin(t * 2) * 1.1 * u;
      g.save(); g.translate(cx, y + lh / 2 + bob); g.rotate(Math.sin(t * 2) * -0.015);
      g.shadowColor = 'rgba(0,10,50,.45)'; g.shadowBlur = 1.6 * u; g.shadowOffsetY = 1 * u;
      g.drawImage(I.logo, -lw / 2, -lh / 2, lw, lh); g.restore();
      y += lh;
    } else y += 25 * u;
    g.font = `800 ${1.9 * u}px 'Trebuchet MS', Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText('M Y S T A K E', cx, y + 0.8 * u);
    y += 6 * u;

    // ---- progress (fades out when ready) / PLAY button (fades in)
    const pa = 1 - ready;
    if (pa > 0.01) {
      g.globalAlpha = (1 - oe) * pa;
      const bw = Math.min(W * 0.8, 58 * u), bh = 4.2 * u, bx = cx - bw / 2, by = y + 2 * u;
      rr(bx, by, bw, bh, bh / 2); const tg = g.createLinearGradient(0, by, 0, by + bh); tg.addColorStop(0, '#0b1a4c'); tg.addColorStop(1, '#13296e');
      g.fillStyle = tg; g.fill(); g.lineWidth = 0.35 * u; g.strokeStyle = '#3f6fe0'; g.stroke();
      const p = Math.max(0, Math.min(100, shown)) / 100, fw = Math.max(bh, bw * p);
      g.save(); rr(bx, by, fw, bh, bh / 2); g.clip();
      const fg = g.createLinearGradient(0, by, 0, by + bh); fg.addColorStop(0, '#ffe36a'); fg.addColorStop(0.6, '#ffb21c'); fg.addColorStop(1, '#f08a0c');
      g.fillStyle = fg; g.fillRect(bx, by, fw, bh);
      g.fillStyle = 'rgba(255,255,255,.22)';
      const st = 2.4 * u, so = (t * 3.4 * u) % st;
      for (let x = bx - bh + so - st; x < bx + fw; x += st) { g.beginPath(); g.moveTo(x, by + bh); g.lineTo(x + st / 2, by + bh); g.lineTo(x + st / 2 + bh, by); g.lineTo(x + bh, by); g.fill(); }
      g.restore();
      if (ok(I.plane)) {
        const pw = 11 * u, ph = pw * (I.plane.naturalHeight / I.plane.naturalWidth);
        g.save(); g.translate(bx + bw * p, by + bh / 2 - 0.6 * u + Math.sin(t * 7) * 0.4 * u); g.rotate(-0.07);
        g.drawImage(I.plane, -pw * 0.48, -ph * 0.62, pw, ph); g.restore();
      }
      text(Math.floor(p * 100) + '%', cx, by + bh + 3.6 * u, 3.2 * u, '#fff', '#0b1d4f', 0.5 * u);
      tipT += dt;
      if (tipT > 3.2) { tipT = 0; tipI++; }
      const ta = Math.min(1, tipT / 0.35, (3.2 - tipT) / 0.35);
      g.globalAlpha = (1 - oe) * pa * Math.max(0, ta) * 0.92;
      text(TIPS[tipI % TIPS.length].toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), cx, by + bh + 7.8 * u, Math.min(1.9 * u, W / 30), '#e4ecff', '#0b1d4f', 0.35 * u);
      g.globalAlpha = 1 - oe;
    }
    if (ready > 0) {
      const s = (0.85 + 0.15 * ready) * (1 + 0.05 * Math.sin(t * 5.2) * (1 - press)) * (1 - 0.08 * Math.sin(Math.min(1, press) * Math.PI)), bw2 = 30 * u * s, bh2 = 8.4 * u * s, bx2 = cx - bw2 / 2, by2 = y + 3 * u;
      g.globalAlpha = (1 - oe) * ready;
      g.fillStyle = '#b86400'; rr(bx2, by2 + 0.7 * u, bw2, bh2, bh2 / 2); g.fill();
      const bg2 = g.createLinearGradient(0, by2, 0, by2 + bh2); bg2.addColorStop(0, '#ffe066'); bg2.addColorStop(1, '#ffab12');
      g.fillStyle = bg2; rr(bx2, by2, bw2, bh2, bh2 / 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.28)'; rr(bx2 + bh2 * 0.3, by2 + bh2 * 0.1, bw2 - bh2 * 0.6, bh2 * 0.36, bh2 * 0.18); g.fill();
      text(PLAY, cx, by2 + bh2 / 2 + 0.2 * u, 4.2 * u * s, '#fff', '#8a4a00', 0.6 * u);
      btn = { x: bx2 - 2 * u, y: by2 - 2 * u, w: bw2 + 4 * u, h: bh2 + 4 * u };
      g.globalAlpha = 1 - oe;
    }
  }
  requestAnimationFrame(frame);

  window.__aviaLoader = {
    progress(p) { real = 1; eng = Math.max(eng, p); },
    done(fn) { real = 1; eng = 100; engDone = fn; },
    need(fn) { needs.push(fn); },
    get ready() { return !!go && ready >= 1; },
  };
  // PLAY: pointerup / touchend on the canvas (both, whichever comes; once)
  function tap(e) {
    if (!go || ready < 0.5 || out > 0 || switching) return;
    const pt = e.changedTouches ? e.changedTouches[0] : e;
    const r = C.getBoundingClientRect(), x = pt.clientX - r.left, y = pt.clientY - r.top;
    if (!btn || x < btn.x || x > btn.x + btn.w || y < btn.y || y > btn.y + btn.h) return;
    const f = go; go = null;
    switching = true; switchAt = performance.now();
    f();
  }
  C.addEventListener('pointerup', tap);
  C.addEventListener('touchend', tap, { passive: true });
  window.__aviaLoaderPct = () => shown; // tests
  window.__aviaLoaderDbg = () => ({ eng, engDone: !!engDone, needs: needs.map((f) => { try { return +f(); } catch (e) { return 'err:' + e.message; } }) });
  window.__aviaLoaderBtn = () => btn && go && ready >= 1 ? [btn.x + btn.w / 2, btn.y + btn.h / 2] : null; // tests
})();
