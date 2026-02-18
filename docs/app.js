// File: /docs/app.js
(() => {
  "use strict";

  const Storage = {
    drawingKey: "playerDrawingPNG",
    settingsKey: "settings",
    defaults: {
      bgm: true,
      se: true,
      difficulty: "normal",
      duration: 90,
    },
    getDrawing() {
      try {
        return localStorage.getItem(this.drawingKey) || "";
      } catch {
        return "";
      }
    },
    setDrawing(base64PNG) {
      try {
        localStorage.setItem(this.drawingKey, base64PNG);
      } catch {}
    },
    getSettings() {
      try {
        const raw = localStorage.getItem(this.settingsKey);
        if (!raw) return { ...this.defaults };
        const parsed = JSON.parse(raw);
        return {
          bgm: !!parsed.bgm,
          se: !!parsed.se,
          difficulty: ["easy", "normal", "hard"].includes(parsed.difficulty)
            ? parsed.difficulty
            : "normal",
          duration: [60, 90, 120].includes(Number(parsed.duration))
            ? Number(parsed.duration)
            : 90,
        };
      } catch {
        return { ...this.defaults };
      }
    },
    setSettings(settings) {
      try {
        localStorage.setItem(this.settingsKey, JSON.stringify(settings));
      } catch {}
    },
    getBestScore(difficulty) {
      try {
        const v = Number(localStorage.getItem(`bestScore_${difficulty}`));
        return Number.isFinite(v) ? v : 0;
      } catch {
        return 0;
      }
    },
    setBestScore(difficulty, score) {
      try {
        localStorage.setItem(`bestScore_${difficulty}`, String(score));
      } catch {}
    },
  };

  const AudioEngine = {
    ctx: null,
    bgmNodes: [],
    bgmOn: true,
    seOn: true,
    ensureContext() {
      if (!this.ctx)
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    },
    unlock() {
      this.ensureContext();
    },
    setConfig({ bgm, se }) {
      this.bgmOn = !!bgm;
      this.seOn = !!se;
      if (!this.bgmOn) this.stopBgm();
    },
    tone(freq, duration = 0.08, type = "sine", gain = 0.08, t0 = 0) {
      if (!this.seOn) return;
      this.ensureContext();
      const now = this.ctx.currentTime + t0;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      amp.gain.value = 0.0001;
      amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    },
    playSE(name) {
      if (!this.seOn) return;
      if (name === "coin") {
        this.tone(680, 0.09, "square", 0.06, 0);
        this.tone(980, 0.07, "triangle", 0.05, 0.03);
      } else if (name === "jump") {
        this.tone(320, 0.06, "triangle", 0.05, 0);
      } else if (name === "hit") {
        this.tone(180, 0.12, "sawtooth", 0.07, 0);
      } else if (name === "best") {
        this.tone(520, 0.09, "sine", 0.08, 0);
        this.tone(700, 0.09, "sine", 0.08, 0.08);
        this.tone(900, 0.12, "sine", 0.08, 0.16);
      }
    },
    startBgm() {
      if (!this.bgmOn || this.bgmNodes.length) return;
      this.ensureContext();
      const now = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.03;
      gain.connect(this.ctx.destination);

      const o1 = this.ctx.createOscillator();
      o1.type = "triangle";
      o1.frequency.value = 174;
      o1.connect(gain);
      o1.start(now);

      const o2 = this.ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = 261.6;
      o2.detune.value = -5;
      o2.connect(gain);
      o2.start(now);

      this.bgmNodes = [o1, o2, gain];
    },
    stopBgm() {
      if (!this.bgmNodes.length) return;
      const [o1, o2, gain] = this.bgmNodes;
      try {
        gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          this.ctx.currentTime + 0.1,
        );
        o1.stop(this.ctx.currentTime + 0.12);
        o2.stop(this.ctx.currentTime + 0.12);
      } catch {}
      this.bgmNodes = [];
    },
  };

  const DrawPad = {
    canvas: null,
    ctx: null,
    dpr: Math.max(1, window.devicePixelRatio || 1),
    pointerId: null,
    drawing: false,
    lastX: 0,
    lastY: 0,
    brushSize: 8,
    color: "#2b2d42",
    eraser: false,
    history: [],
    maxUndo: 20,
    init(canvas) {
      this.canvas = canvas;
      this.ctx = this.canvas.getContext("2d", {
        alpha: true,
        desynchronized: true,
      });
      this.resize();
      this.clear(false);
      this.installEvents();
      window.addEventListener("resize", () => this.resize());
    },
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const size = Math.floor(Math.min(rect.width || 640, 760));
      const px = Math.max(300, size);
      this.canvas.style.height = `${px}px`;
      this.canvas.style.width = `${px}px`;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      this.dpr = dpr;
      const newW = Math.floor(px * dpr);
      const newH = Math.floor(px * dpr);

      if (this.canvas.width === newW && this.canvas.height === newH) return;
      const prev = document.createElement("canvas");
      prev.width = this.canvas.width;
      prev.height = this.canvas.height;
      prev.getContext("2d").drawImage(this.canvas, 0, 0);

      this.canvas.width = newW;
      this.canvas.height = newH;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, newW, newH);
      this.pushSnapshot();
    },
    installEvents() {
      const c = this.canvas;
      c.style.touchAction = "none";

      c.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          c.setPointerCapture(e.pointerId);
          this.pointerId = e.pointerId;
          this.drawing = true;
          const p = this.getPos(e);
          this.lastX = p.x;
          this.lastY = p.y;
          this.strokePoint(p.x, p.y, true);
        },
        { passive: false },
      );

      c.addEventListener(
        "pointermove",
        (e) => {
          if (!this.drawing || e.pointerId !== this.pointerId) return;
          e.preventDefault();
          const p = this.getPos(e);
          this.strokeLine(this.lastX, this.lastY, p.x, p.y);
          this.lastX = p.x;
          this.lastY = p.y;
        },
        { passive: false },
      );

      const end = (e) => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.drawing = false;
        this.pointerId = null;
        this.pushSnapshot();
      };
      c.addEventListener("pointerup", end, { passive: false });
      c.addEventListener("pointercancel", end, { passive: false });
      c.addEventListener(
        "pointerleave",
        () => {
          if (this.drawing) this.pushSnapshot();
          this.drawing = false;
          this.pointerId = null;
        },
        { passive: false },
      );
    },
    getPos(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * this.canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * this.canvas.height,
      };
    },
    strokePoint(x, y, dot = false) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = this.eraser
        ? "destination-out"
        : "source-over";
      ctx.strokeStyle = this.color;
      ctx.fillStyle = this.color;
      ctx.lineWidth = this.brushSize * this.dpr;
      if (dot) {
        ctx.beginPath();
        ctx.arc(x, y, ctx.lineWidth * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
    strokeLine(x1, y1, x2, y2) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = this.eraser
        ? "destination-out"
        : "source-over";
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.brushSize * this.dpr;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    },
    pushSnapshot() {
      try {
        const snap = this.ctx.getImageData(
          0,
          0,
          this.canvas.width,
          this.canvas.height,
        );
        this.history.push(snap);
        const max = this.maxUndo + 1;
        if (this.history.length > max) this.history.shift();
      } catch {}
    },
    undo() {
      if (this.history.length <= 1) return;
      this.history.pop();
      const prev = this.history[this.history.length - 1];
      this.ctx.putImageData(prev, 0, 0);
    },
    clear(saveHistory = true) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (saveHistory) this.pushSnapshot();
      else {
        this.history = [];
        this.pushSnapshot();
      }
    },
    setBrushSize(size) {
      this.brushSize = Number(size) || 8;
    },
    setColor(color) {
      this.color = color || "#2b2d42";
      this.eraser = false;
    },
    setEraser(on) {
      this.eraser = !!on;
    },
    isBlank() {
      const img = this.ctx.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height,
      ).data;
      for (let i = 3; i < img.length; i += 4) {
        if (img[i] > 8) return false;
      }
      return true;
    },
    exportNormalized96() {
      if (this.isBlank()) return "";
      const src = this.canvas;
      const ctx = this.ctx;
      const data = ctx.getImageData(0, 0, src.width, src.height).data;
      let minX = src.width,
        minY = src.height,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < src.height; y++) {
        for (let x = 0; x < src.width; x++) {
          const a = data[(y * src.width + x) * 4 + 3];
          if (a > 10) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX || maxY < minY) return "";

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const dst = document.createElement("canvas");
      dst.width = 96;
      dst.height = 96;
      const dctx = dst.getContext("2d");
      dctx.clearRect(0, 0, 96, 96);

      const fit = 78;
      const scale = Math.min(fit / cropW, fit / cropH);
      const dw = Math.max(1, Math.floor(cropW * scale));
      const dh = Math.max(1, Math.floor(cropH * scale));
      const dx = Math.floor((96 - dw) / 2);
      const dy = Math.floor((96 - dh) / 2);

      dctx.drawImage(src, minX, minY, cropW, cropH, dx, dy, dw, dh);
      return dst.toDataURL("image/png");
    },
    loadFromPNG(pngDataUrl) {
      if (!pngDataUrl) return;
      const img = new Image();
      img.onload = () => {
        this.clear(false);
        const s = Math.min(this.canvas.width, this.canvas.height);
        const size = Math.floor(s * 0.62);
        const x = Math.floor((this.canvas.width - size) * 0.5);
        const y = Math.floor((this.canvas.height - size) * 0.5);
        this.ctx.drawImage(img, x, y, size, size);
        this.pushSnapshot();
      };
      img.src = pngDataUrl;
    },
  };

  const Game = {
    canvas: null,
    ctx: null,
    dpr: Math.max(1, window.devicePixelRatio || 1),
    running: false,
    rafId: 0,
    lastTs: 0,
    frameBudget: [],
    fixed30fps: false,
    playerImg: null,

    score: 0,
    coinsCollected: 0,
    streak: 0,
    misses: 0,
    remaining: 90,
    settings: null,

    worldSpeed: 240,
    coinInterval: [0.6, 1.2],
    obstacleInterval: [1.1, 1.9],
    nextCoinIn: 0.8,
    nextObstacleIn: 1.4,

    player: null,
    coins: [],
    obstacles: [],
    starsOffset: 0,
    hillsOffset: 0,
    groundOffset: 0,
    groundPattern: null,

    coinSprite: null,
    coinSpriteReady: false,
    coinFrameCount: 8,
    coinFrameW: 32,
    coinFrameH: 32,
    coinFramesVertical: false,

    input: { left: false, right: false, jumpQueued: false },

    onTick: null,
    onFinish: null,

    init(canvas, onTick, onFinish) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
      });
      this.onTick = onTick;
      this.onFinish = onFinish;
      this.resize();
      this.loadCoinSprite();
      window.addEventListener("resize", () => this.resize());
    },
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      this.dpr = dpr;
      const w = Math.max(320, Math.floor(rect.width * dpr));
      const h = Math.max(180, Math.floor(rect.height * dpr));
      this.canvas.width = w;
      this.canvas.height = h;
      this.makeGroundPattern();
    },
    loadCoinSprite() {
      const img = new Image();
      img.onload = () => {
        this.coinSprite = img;
        this.coinSpriteReady = true;
        if (img.width % this.coinFrameCount === 0) {
          this.coinFramesVertical = false;
          this.coinFrameW = Math.floor(img.width / this.coinFrameCount);
          this.coinFrameH = img.height;
        } else if (img.height % this.coinFrameCount === 0) {
          this.coinFramesVertical = true;
          this.coinFrameW = img.width;
          this.coinFrameH = Math.floor(img.height / this.coinFrameCount);
        } else {
          this.coinFramesVertical = false;
          this.coinFrameW = Math.max(
            1,
            Math.floor(img.width / this.coinFrameCount),
          );
          this.coinFrameH = img.height;
        }
      };
      img.onerror = () => {
        this.coinSprite = null;
        this.coinSpriteReady = false;
      };
      img.src = "./assets/coin_spin_8f_48.png";
    },
    makeGroundPattern() {
      const p = document.createElement("canvas");
      p.width = 80;
      p.height = 44;
      const pctx = p.getContext("2d");
      pctx.fillStyle = "#9ecb6e";
      pctx.fillRect(0, 0, p.width, p.height);
      pctx.fillStyle = "#8abb57";
      for (let i = 0; i < p.width; i += 16) {
        pctx.fillRect(i, 0, 8, p.height);
      }
      pctx.strokeStyle = "#7ea94f";
      pctx.lineWidth = 2;
      pctx.beginPath();
      pctx.moveTo(0, 8);
      pctx.lineTo(p.width, 8);
      pctx.stroke();
      this.groundPattern = this.ctx.createPattern(p, "repeat");
    },
    configureDifficulty(level) {
      if (level === "easy") {
        this.worldSpeed = 200;
        this.coinInterval = [0.8, 1.2];
        this.obstacleInterval = [1.8, 2.6];
      } else if (level === "hard") {
        this.worldSpeed = 300;
        this.coinInterval = [0.5, 0.9];
        this.obstacleInterval = [0.9, 1.4];
      } else {
        this.worldSpeed = 240;
        this.coinInterval = [0.6, 1.1];
        this.obstacleInterval = [1.2, 1.9];
      }
    },
    rand(min, max) {
      return min + Math.random() * (max - min);
    },
    start(settings, playerPng) {
      this.settings = settings;
      this.configureDifficulty(settings.difficulty);
      this.score = 0;
      this.coinsCollected = 0;
      this.streak = 0;
      this.misses = 0;
      this.remaining = settings.duration;
      this.coins = [];
      this.obstacles = [];
      this.nextCoinIn = this.rand(this.coinInterval[0], this.coinInterval[1]);
      this.nextObstacleIn = this.rand(
        this.obstacleInterval[0],
        this.obstacleInterval[1],
      );
      this.starsOffset = 0;
      this.hillsOffset = 0;
      this.groundOffset = 0;
      this.fixed30fps = false;
      this.frameBudget = [];
      this.player = {
        x: 130,
        y: 0,
        w: 62,
        h: 62,
        vy: 0,
        onGround: true,
        invUntil: 0,
      };
      this.player.y = this.groundY() - this.player.h;
      this.loadPlayerImage(playerPng);

      this.running = true;
      this.lastTs = performance.now();
      this.loop(this.lastTs);
    },
    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    },
    loadPlayerImage(dataUrl) {
      this.playerImg = null;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        this.playerImg = img;
      };
      img.src = dataUrl;
    },
    setInput(name, on) {
      this.input[name] = on;
    },
    queueJump() {
      this.input.jumpQueued = true;
    },
    loop(ts) {
      if (!this.running) return;
      let dt = (ts - this.lastTs) / 1000;
      this.lastTs = ts;
      if (dt > 0.1) dt = 0.1;

      this.frameBudget.push(dt);
      if (this.frameBudget.length > 45) this.frameBudget.shift();
      const avg =
        this.frameBudget.reduce((a, b) => a + b, 0) / this.frameBudget.length;
      if (avg > 0.038) this.fixed30fps = true;

      const step = this.fixed30fps ? 1 / 30 : dt;
      this.update(step, ts / 1000);
      this.draw(ts / 1000);

      this.rafId = requestAnimationFrame((t) => this.loop(t));
    },
    groundY() {
      return this.canvas.height - Math.floor(this.canvas.height * 0.18);
    },
    spawnCoin() {
      const gy = this.groundY();
      const y = gy - this.rand(95 * this.dpr, 220 * this.dpr);
      this.coins.push({
        x: this.canvas.width + 30 * this.dpr,
        y,
        r: 15 * this.dpr,
        animSeed: Math.random() * 10, // 個体差（同時に出ても同じコマにならない）
      });
    },
    spawnObstacle() {
      const gy = this.groundY();
      const type = Math.random() < 0.55 ? "box" : "spike";
      if (type === "box") {
        const size = 38 * this.dpr;
        this.obstacles.push({
          type,
          x: this.canvas.width + size,
          y: gy - size,
          w: size,
          h: size,
        });
      } else {
        const w = 42 * this.dpr;
        const h = 34 * this.dpr;
        this.obstacles.push({
          type,
          x: this.canvas.width + w,
          y: gy - h,
          w,
          h,
        });
      }
    },
    playerRect() {
      return {
        x: this.player.x + 7 * this.dpr,
        y: this.player.y + 5 * this.dpr,
        w: this.player.w - 14 * this.dpr,
        h: this.player.h - 8 * this.dpr,
      };
    },
    intersects(a, b) {
      return (
        a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
      );
    },
    circleRectHit(c, r) {
      const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
      const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
      const dx = c.x - cx;
      const dy = c.y - cy;
      return dx * dx + dy * dy <= c.r * c.r;
    },
    takeMiss(now) {
      if (now < this.player.invUntil) return;
      this.misses += 1;
      this.streak = 0;
      this.player.invUntil = now + 1.0;
      AudioEngine.playSE("hit");
      if (this.misses >= 3) {
        this.finish();
      }
    },
    finish() {
      this.stop();
      if (this.onFinish) {
        this.onFinish({
          score: this.score,
          coins: this.coinsCollected,
          difficulty: this.settings.difficulty,
        });
      }
    },
    update(dt, now) {
      if (!this.running) return;
      this.remaining -= dt;
      if (this.remaining <= 0) {
        this.remaining = 0;
        this.finish();
        return;
      }

      const gy = this.groundY();
      const p = this.player;

      const move = 280 * this.dpr;
      if (this.input.left) p.x -= move * dt;
      if (this.input.right) p.x += move * dt;
      p.x = Math.max(20 * this.dpr, Math.min(p.x, this.canvas.width * 0.52));

      if (this.input.jumpQueued && p.onGround) {
        p.vy = -620 * this.dpr;
        p.onGround = false;
        AudioEngine.playSE("jump");
      }
      this.input.jumpQueued = false;

      p.vy += 1800 * this.dpr * dt;
      p.y += p.vy * dt;
      if (p.y + p.h >= gy) {
        p.y = gy - p.h;
        p.vy = 0;
        p.onGround = true;
      }

      const speed = this.worldSpeed * this.dpr;
      this.starsOffset += speed * 0.15 * dt;
      this.hillsOffset += speed * 0.35 * dt;
      this.groundOffset += speed * dt;

      this.nextCoinIn -= dt;
      if (this.nextCoinIn <= 0) {
        this.spawnCoin();
        this.nextCoinIn = this.rand(this.coinInterval[0], this.coinInterval[1]);
      }

      this.nextObstacleIn -= dt;
      if (this.nextObstacleIn <= 0) {
        this.spawnObstacle();
        this.nextObstacleIn = this.rand(
          this.obstacleInterval[0],
          this.obstacleInterval[1],
        );
      }

      for (const c of this.coins) c.x -= speed * dt;
      for (const o of this.obstacles) o.x -= speed * dt;

      const pr = this.playerRect();

      for (let i = this.coins.length - 1; i >= 0; i--) {
        const c = this.coins[i];
        if (this.circleRectHit(c, pr)) {
          this.coins.splice(i, 1);
          this.score += 10;
          this.coinsCollected += 1;
          this.streak += 1;
          if (this.streak > 0 && this.streak % 5 === 0) {
            this.score += 50;
          }
          AudioEngine.playSE("coin");
          continue;
        }
        if (c.x + c.r < -20) this.coins.splice(i, 1);
      }

      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const o = this.obstacles[i];
        const hitRect = { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 };
        if (this.intersects(pr, hitRect)) this.takeMiss(now);
        if (o.x + o.w < -40) this.obstacles.splice(i, 1);
      }

      if (this.onTick) {
        this.onTick({
          score: this.score,
          remaining: this.remaining,
        });
      }
    },
    drawBackground() {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#bdeaf8");
      sky.addColorStop(1, "#f1fbff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(255,255,255,0.6)";
      const starGap = 70 * this.dpr;
      for (let x = -starGap; x < w + starGap; x += starGap) {
        const dx = x - (this.starsOffset % starGap);
        ctx.beginPath();
        ctx.arc(dx, 38 * this.dpr, 3 * this.dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#c7e8a6";
      const hillW = 220 * this.dpr;
      for (let x = -hillW; x < w + hillW; x += hillW * 0.7) {
        const dx = x - (this.hillsOffset % hillW);
        ctx.beginPath();
        ctx.ellipse(dx, h * 0.78, hillW * 0.5, h * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const gy = this.groundY();
      ctx.save();
      ctx.translate(-(this.groundOffset % (80 * this.dpr)), 0);
      ctx.fillStyle = this.groundPattern || "#9ecb6e";
      ctx.fillRect(0, gy, w + 160 * this.dpr, h - gy);
      ctx.restore();
    },
    drawCoins(now) {
      const ctx = this.ctx;

      // スプライトが使えるならスプライト描画
      if (this.coinSpriteReady && this.coinSprite) {
        const img = this.coinSprite;

        // 1周の速さ（秒）: 小さいほど速い
        const cycleSec = 0.6;

        for (const c of this.coins) {
          // 個体差付きでフレーム決定
          const t = (now + c.animSeed) / cycleSec;
          const frame = Math.floor((t % 1) * this.coinFrameCount);

          // スプライト切り出し位置
          const sx = this.coinFramesVertical ? 0 : frame * this.coinFrameW;
          const sy = this.coinFramesVertical ? frame * this.coinFrameH : 0;
          const sw = this.coinFrameW;
          const sh = this.coinFrameH;

          // 描画サイズ（r基準で良い感じに）
          const size = Math.max(24 * this.dpr, c.r * 1.5); // 2.0-2.8あたり
          const dx = c.x - size / 2;
          const dy = c.y - size / 2;

          // ほんのりグロー（任意：効く）
          ctx.save();
          ctx.shadowBlur = 10 * this.dpr;
          ctx.shadowColor = "rgba(255, 200, 40, 0.55)";
          ctx.drawImage(img, sx, sy, sw, sh, dx, dy, size, size);
          ctx.restore();
        }
        return;
      }

      // フォールバック（現行の円コイン）
      for (const c of this.coins) {
        const grad = ctx.createRadialGradient(
          c.x - c.r * 0.3,
          c.y - c.r * 0.3,
          c.r * 0.2,
          c.x,
          c.y,
          c.r,
        );
        grad.addColorStop(0, "#fff7b1");
        grad.addColorStop(1, "#ffb700");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(160,100,0,0.6)";
        ctx.lineWidth = 2 * this.dpr;
        ctx.stroke();
      }
    },
    drawObstacles() {
      const ctx = this.ctx;
      for (const o of this.obstacles) {
        if (o.type === "box") {
          ctx.fillStyle = "#be874f";
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = "#8a5b2a";
          ctx.lineWidth = 3 * this.dpr;
          ctx.strokeRect(o.x, o.y, o.w, o.h);
        } else {
          ctx.fillStyle = "#777";
          ctx.beginPath();
          ctx.moveTo(o.x, o.y + o.h);
          ctx.lineTo(o.x + o.w * 0.5, o.y);
          ctx.lineTo(o.x + o.w, o.y + o.h);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#555";
          ctx.lineWidth = 2 * this.dpr;
          ctx.stroke();
        }
      }
    },
    drawPlayer(now) {
      const ctx = this.ctx;
      const p = this.player;
      const blink = now < p.invUntil && Math.floor(now * 12) % 2 === 0;
      if (blink) return;

      if (this.playerImg) {
        ctx.drawImage(this.playerImg, p.x, p.y, p.w, p.h);
      } else {
        ctx.fillStyle = "#ef476f";
        ctx.beginPath();
        ctx.roundRect(p.x, p.y, p.w, p.h, 12 * this.dpr);
        ctx.fill();
      }

      if (now < p.invUntil) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 3 * this.dpr;
        ctx.beginPath();
        ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    draw(now) {
      this.drawBackground();
      this.drawCoins(now);
      this.drawObstacles();
      this.drawPlayer(now);
    },
  };

  const UI = {
    screens: {},
    els: {},
    settings: Storage.getSettings(),

    init() {
      this.cache();
      this.bindGlobal();
      this.bindScreenButtons();
      DrawPad.init(this.els.drawCanvas);
      Game.init(
        this.els.gameCanvas,
        (tick) => this.updateHud(tick),
        (result) => this.showResult(result),
      );
      // ctx.imageSmoothingEnabled = false; //ドット絵感を出すなら
      this.applySettingsToForm();
      this.refreshPreviews();
      AudioEngine.setConfig(this.settings);

      const drawing = Storage.getDrawing();
      if (!drawing) {
        this.openScreen("draw");
        this.els.drawGuide.textContent =
          "はじめて あそぶには、まずキャラを かいてね！";
      } else {
        this.openScreen("title");
      }
    },
    cache() {
      this.screens = {
        title: document.getElementById("screen-title"),
        draw: document.getElementById("screen-draw"),
        ready: document.getElementById("screen-ready"),
        game: document.getElementById("screen-game"),
        result: document.getElementById("screen-result"),
        settings: document.getElementById("screen-settings"),
      };

      this.els = {
        drawCanvas: document.getElementById("draw-canvas"),
        gameCanvas: document.getElementById("game-canvas"),
        drawGuide: document.getElementById("draw-guide"),
        titlePreview: document.getElementById("title-preview"),
        readyPreview: document.getElementById("ready-preview"),
        titlePreviewLabel: document.getElementById("title-preview-label"),
        hudScore: document.getElementById("hud-score"),
        hudTime: document.getElementById("hud-time"),
        resultScore: document.getElementById("result-score"),
        resultCoins: document.getElementById("result-coins"),
        resultBest: document.getElementById("result-best"),
        resultBadge: document.getElementById("result-best-badge"),
        resultCard: document.getElementById("result-card"),
        setBgm: document.getElementById("set-bgm"),
        setSe: document.getElementById("set-se"),
        setDifficulty: document.getElementById("set-difficulty"),
        setDuration: document.getElementById("set-duration"),
      };
    },
    bindGlobal() {
      const unlock = () => AudioEngine.unlock();
      window.addEventListener("pointerdown", unlock, { once: true });

      const stopDefaultTouch = (e) => e.preventDefault();
      [
        this.els.drawCanvas,
        this.els.gameCanvas,
        document.getElementById("controls"),
      ].forEach((el) => {
        el.addEventListener("touchstart", stopDefaultTouch, { passive: false });
        el.addEventListener("touchmove", stopDefaultTouch, { passive: false });
      });
    },
    bindScreenButtons() {
      document.getElementById("btn-play").addEventListener("click", () => {
        const drawing = Storage.getDrawing();
        if (!drawing) {
          this.openScreen("draw");
          this.els.drawGuide.textContent = "キャラを かいてから あそぼう！";
          return;
        }
        this.openReady();
      });

      document.getElementById("btn-go-draw").addEventListener("click", () => {
        this.openScreen("draw");
      });

      document
        .getElementById("btn-go-settings")
        .addEventListener("click", () => {
          this.openScreen("settings");
        });

      document
        .getElementById("btn-back-title-from-draw")
        .addEventListener("click", () => {
          this.openScreen("title");
        });

      document
        .getElementById("btn-start-game")
        .addEventListener("click", () => {
          this.startGame();
        });

      document
        .getElementById("btn-back-draw-from-ready")
        .addEventListener("click", () => {
          this.openScreen("draw");
        });

      document.getElementById("btn-retry").addEventListener("click", () => {
        this.startGame();
      });

      document
        .getElementById("btn-result-draw")
        .addEventListener("click", () => {
          this.openScreen("draw");
        });

      document
        .getElementById("btn-result-title")
        .addEventListener("click", () => {
          this.openScreen("title");
        });

      document
        .getElementById("btn-settings-back")
        .addEventListener("click", () => {
          this.openScreen("title");
        });

      document
        .getElementById("btn-clear-draw")
        .addEventListener("click", () => DrawPad.clear(true));
      document
        .getElementById("btn-undo-draw")
        .addEventListener("click", () => DrawPad.undo());

      document.getElementById("btn-save-draw").addEventListener("click", () => {
        const png = DrawPad.exportNormalized96();
        if (!png) {
          this.els.drawGuide.textContent = "なにか かいてから ほぞんしてね";
          return;
        }
        Storage.setDrawing(png);
        this.refreshPreviews();
        this.els.drawGuide.textContent = "ほぞんしたよ！";
        this.openReady();
      });

      document.querySelectorAll(".size-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document
            .querySelectorAll(".size-btn")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          DrawPad.setBrushSize(btn.dataset.size);
        });
      });

      document.querySelectorAll(".color-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document
            .querySelectorAll(".color-btn")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          DrawPad.setColor(btn.dataset.color);
          document.getElementById("btn-eraser").textContent = "けしゴム OFF";
        });
      });

      const eraserBtn = document.getElementById("btn-eraser");
      eraserBtn.addEventListener("click", () => {
        const on = !DrawPad.eraser;
        DrawPad.setEraser(on);
        eraserBtn.textContent = on ? "けしゴム ON" : "けしゴム OFF";
      });

      const setField = (k, v) => {
        this.settings[k] = v;
        Storage.setSettings(this.settings);
        AudioEngine.setConfig(this.settings);
      };

      this.els.setBgm.addEventListener("change", () => {
        setField("bgm", this.els.setBgm.checked);
      });
      this.els.setSe.addEventListener("change", () => {
        setField("se", this.els.setSe.checked);
      });
      this.els.setDifficulty.addEventListener("change", () => {
        setField("difficulty", this.els.setDifficulty.value);
      });
      this.els.setDuration.addEventListener("change", () => {
        setField("duration", Number(this.els.setDuration.value));
      });

      this.bindControls();
    },
    bindControls() {
      const bindHold = (id, key) => {
        const el = document.getElementById(id);
        el.addEventListener(
          "pointerdown",
          (e) => {
            e.preventDefault();
            AudioEngine.unlock();
            Game.setInput(key, true);
          },
          { passive: false },
        );
        const off = (e) => {
          e.preventDefault();
          Game.setInput(key, false);
        };
        el.addEventListener("pointerup", off, { passive: false });
        el.addEventListener("pointercancel", off, { passive: false });
        el.addEventListener("pointerleave", off, { passive: false });
      };

      bindHold("ctrl-left", "left");
      bindHold("ctrl-right", "right");

      const jump = document.getElementById("ctrl-jump");
      jump.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          AudioEngine.unlock();
          Game.queueJump();
        },
        { passive: false },
      );
      jump.addEventListener("pointerup", (e) => e.preventDefault(), {
        passive: false,
      });
      jump.addEventListener("pointercancel", (e) => e.preventDefault(), {
        passive: false,
      });
    },
    applySettingsToForm() {
      this.els.setBgm.checked = this.settings.bgm;
      this.els.setSe.checked = this.settings.se;
      this.els.setDifficulty.value = this.settings.difficulty;
      this.els.setDuration.value = String(this.settings.duration);
    },
    openScreen(name) {
      Object.values(this.screens).forEach((s) => s.classList.add("hidden"));
      this.screens[name].classList.remove("hidden");

      if (name === "game") {
        if (this.settings.bgm) AudioEngine.startBgm();
      } else {
        AudioEngine.stopBgm();
      }
    },
    refreshPreviews() {
      const png = Storage.getDrawing();
      const has = !!png;
      this.els.titlePreview.style.display = has ? "block" : "none";
      this.els.readyPreview.style.display = has ? "block" : "none";
      this.els.titlePreviewLabel.textContent = has
        ? "このキャラであそべるよ"
        : "まだキャラがありません";
      if (has) {
        this.els.titlePreview.src = png;
        this.els.readyPreview.src = png;
      }
    },
    openReady() {
      const png = Storage.getDrawing();
      if (!png) {
        this.openScreen("draw");
        this.els.drawGuide.textContent = "キャラを かいてから あそぼう！";
        return;
      }
      this.refreshPreviews();
      this.openScreen("ready");
    },
    startGame() {
      const png = Storage.getDrawing();
      if (!png) {
        this.openScreen("draw");
        this.els.drawGuide.textContent = "キャラがないよ。かいて ほぞんしてね";
        return;
      }
      this.settings = Storage.getSettings();
      this.applySettingsToForm();
      AudioEngine.setConfig(this.settings);

      this.els.hudScore.textContent = "0";
      this.els.hudTime.textContent = this.settings.duration.toFixed(1);

      this.openScreen("game");
      Game.start(this.settings, png);
    },
    updateHud({ score, remaining }) {
      this.els.hudScore.textContent = String(score);
      this.els.hudTime.textContent = remaining.toFixed(1);
    },
    sparkles() {
      const card = this.els.resultCard;
      const rect = card.getBoundingClientRect();
      for (let i = 0; i < 22; i++) {
        const s = document.createElement("span");
        s.className = "spark";
        const x = (Math.random() - 0.5) * rect.width * 0.6;
        const y = (Math.random() - 0.5) * rect.height * 0.6;
        s.style.left = `${rect.width * 0.5}px`;
        s.style.top = `${rect.height * 0.5}px`;
        s.style.setProperty("--x", `${x}px`);
        s.style.setProperty("--y", `${y}px`);
        s.style.background = ["#ffe066", "#ff9f1c", "#7bdff2", "#b2f7ef"][
          i % 4
        ];
        card.appendChild(s);
        setTimeout(() => s.remove(), 760);
      }
    },
    showResult({ score, coins, difficulty }) {
      const best = Storage.getBestScore(difficulty);
      let newBest = false;
      if (score > best) {
        Storage.setBestScore(difficulty, score);
        newBest = true;
      }

      this.els.resultScore.textContent = String(score);
      this.els.resultCoins.textContent = String(coins);
      this.els.resultBest.textContent = String(Math.max(score, best));
      this.els.resultBadge.classList.toggle("hidden", !newBest);

      this.openScreen("result");

      if (newBest) {
        this.sparkles();
        AudioEngine.playSE("best");
      }
    },
  };

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
      return this;
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    UI.init();
  });
})();
