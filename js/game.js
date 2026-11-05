(() => {
  'use strict';

  /* ---------- Geometria planszy ---------- */

  const W = 960;
  const H = 640;

  const COLS = 12;
  const MARGIN = 38;
  const GAP = 4;
  const BRICK_W = (W - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
  const BRICK_H = 26;
  const BRICK_TOP = 96;
  const ROW_GAP = 6;

  const PADDLE_Y = H - 58;
  const PADDLE_H = 16;
  const PADDLE_W = 150;
  const PADDLE_WIDE = 225;
  const PADDLE_SPEED = 820;
  const MAX_PADDLE_VX = 900;

  const BALL_R = 8;
  const MAX_BOUNCE = Math.PI / 3;
  const MIN_BALL_VY = 0.45;

  const STEP = 1 / 120;
  const MAX_SUBSTEP = 4;

  const POWERUP_CHANCE = 0.24;
  const POWERUP_FALL = 150;
  const POWERUP_W = 42;
  const POWERUP_H = 20;
  const MAX_POWERUPS = 3;

  const EXPAND_TIME = 15;
  const SLOW_TIME = 10;
  const SLOW_FACTOR = 0.7;

  const STORAGE_KEY = 'arkanoid.highscore';
  const MUTE_KEY = 'arkanoid.muted';
  const MASTER_VOLUME = 0.45;

  const LEVELS = Array.isArray(window.ARKANOID_LEVELS) ? window.ARKANOID_LEVELS : [];

  const POWERUPS = {
    expand: { letter: 'W', color: '#22d3ee', label: 'SZERSZA PALETKA' },
    multi: { letter: 'M', color: '#fbbf24', label: 'MULTI-BALL' },
    slow: { letter: 'S', color: '#a78bfa', label: 'WOLNIEJSZA PIŁKA' },
  };

  /* ---------- Pomocnicze ---------- */

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const formatNumber = (value) => value.toLocaleString('pl-PL');

  function roundRectPath(context, x, y, width, height, radius) {
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, radius);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  /* ---------- Elementy strony ---------- */

  const canvas = document.getElementById('game');
  const context = canvas.getContext('2d');

  const ui = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    level: document.getElementById('level'),
    lives: document.getElementById('lives'),
    effects: document.getElementById('effects'),
    overlay: document.getElementById('overlay'),
    hint: document.getElementById('hint'),
    sound: document.getElementById('sound'),
  };

  if (!canvas || !context || !ui.overlay) return;

  /* ---------- Dźwięk (Web Audio) ---------- */

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = this.loadMuted();
      this.lastPlayed = Object.create(null);
    }

    loadMuted() {
      try {
        return window.localStorage.getItem(MUTE_KEY) === '1';
      } catch (error) {
        return false;
      }
    }

    saveMuted() {
      try {
        window.localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
      } catch (error) {
        /* brak dostępu do localStorage nie blokuje gry */
      }
    }

    ensure() {
      if (this.ctx) return true;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;

      try {
        this.ctx = new AudioContextClass();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
        this.master.connect(this.ctx.destination);
      } catch (error) {
        this.ctx = null;
        this.master = null;
        return false;
      }

      return true;
    }

    unlock() {
      if (!this.ensure()) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    setMuted(muted) {
      this.muted = muted;
      this.saveMuted();

      if (!this.master || !this.ctx) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, now, 0.02);
    }

    toggle() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    blip({ freq, to = freq, duration = 0.1, type = 'triangle', volume = 0.15, delay = 0 }) {
      if (!this.ctx || !this.master) return;

      const start = this.ctx.currentTime + delay;
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, start);
      if (to !== freq) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    }

    play(name, variant = 0) {
      if (this.muted) return;
      if (!this.ensure()) return;
      this.unlock();

      const now = performance.now();
      const limits = { paddle: 40, wall: 55, brick: 28, steel: 60 };
      const limit = limits[name] || 0;
      if (limit > 0 && this.lastPlayed[name] && now - this.lastPlayed[name] < limit) return;
      if (limit > 0) this.lastPlayed[name] = now;

      switch (name) {
        case 'launch':
          this.blip({ freq: 220, to: 660, duration: 0.16, volume: 0.16 });
          break;
        case 'paddle':
          this.blip({ freq: 300, to: 480, duration: 0.08, type: 'square', volume: 0.1 });
          break;
        case 'wall':
          this.blip({ freq: 180, to: 150, duration: 0.05, type: 'sine', volume: 0.07 });
          break;
        case 'brick': {
          const freq = 420 + variant * 55;
          this.blip({ freq, to: freq * 1.35, duration: 0.07, type: 'square', volume: 0.08 });
          break;
        }
        case 'steel':
          this.blip({ freq: 1180, to: 900, duration: 0.06, type: 'square', volume: 0.06 });
          this.blip({ freq: 1720, to: 1400, duration: 0.05, volume: 0.04, delay: 0.015 });
          break;
        case 'powerup':
          [523.25, 659.25, 783.99].forEach((freq, index) => {
            this.blip({ freq, duration: 0.1, volume: 0.14, delay: index * 0.07 });
          });
          break;
        case 'life':
          this.blip({ freq: 320, to: 110, duration: 0.5, type: 'sawtooth', volume: 0.12 });
          break;
        case 'clear':
          [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
            this.blip({ freq, duration: 0.14, volume: 0.13, delay: index * 0.09 });
          });
          break;
        case 'gameover':
          [392, 311.13, 233.08, 155.56].forEach((freq, index) => {
            this.blip({ freq, duration: 0.22, type: 'sawtooth', volume: 0.1, delay: index * 0.12 });
          });
          break;
        case 'win':
          [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, index) => {
            this.blip({ freq, duration: 0.18, volume: 0.12, delay: index * 0.1 });
          });
          break;
        default:
          break;
      }
    }
  }

  /* ---------- Gra ---------- */

  class Game {
    constructor() {
      this.canvas = canvas;
      this.ctx = context;
      this.dpr = 1;

      this.state = 'menu';
      this.pauseReturn = 'playing';

      this.score = 0;
      this.lives = 3;
      this.levelIndex = 0;
      this.best = this.loadBest();
      this.audio = new SoundEngine();

      this.bricks = [];
      this.balls = [];
      this.powerups = [];
      this.effects = { expand: 0, slow: 0 };

      this.paddle = {
        x: (W - PADDLE_W) / 2,
        y: PADDLE_Y,
        w: PADDLE_W,
        h: PADDLE_H,
        vx: 0,
        targetX: null,
        usePointer: false,
      };

      this.keys = { left: false, right: false };
      this.pointer = { dragging: false, startX: 0, startPaddleX: 0 };

      this.acc = 0;
      this.time = 0;
      this.lastTime = performance.now();
      this.hudTimer = 0;
      this.toastText = '';
      this.toastTime = 0;
      this._chipsHtml = '';

      this.bindInput();
      this.loadLevel(0);
      this.state = 'menu';
      this.showMenu();
      this.updateHud();
      this.syncSound();
      this.resize();

      requestAnimationFrame((now) => this.loop(now));
    }

    /* ---------- Pętla ---------- */

    loop(now) {
      const delta = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.time += delta;

      if (this.toastTime > 0) {
        this.toastTime = Math.max(0, this.toastTime - delta);
      }

      if (this.state === 'playing' || this.state === 'ready') {
        this.acc += delta;
        let guard = 0;
        while (this.acc >= STEP && guard < 12) {
          this.update(STEP);
          this.acc -= STEP;
          guard += 1;
        }
        if (guard >= 12) this.acc = 0;
      } else {
        this.acc = 0;
      }

      this.render();
      requestAnimationFrame((next) => this.loop(next));
    }

    update(dt) {
      if (this.state !== 'playing' && this.state !== 'ready') return;

      this.updatePaddle(dt);
      this.updateBricks(dt);

      if (this.state === 'ready') {
        this.glueBall();
        return;
      }

      this.updateEffects(dt);
      this.updateBalls(dt);

      if (this.state !== 'playing') return;

      this.updatePowerups(dt);

      if (this.effects.expand > 0 || this.effects.slow > 0) {
        this.hudTimer += dt;
        if (this.hudTimer >= 0.1) {
          this.hudTimer = 0;
          this.syncChips();
        }
      }

      this.checkLevelClear();
    }

    /* ---------- Wejście ---------- */

    bindInput() {
      window.addEventListener('keydown', (event) => this.onKeyDown(event));
      window.addEventListener('keyup', (event) => this.onKeyUp(event));

      canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
      canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
      canvas.addEventListener('pointercancel', (event) => this.onPointerUp(event));

      ui.overlay.addEventListener('click', (event) => this.onOverlayClick(event));

      if (ui.sound) {
        ui.sound.addEventListener('click', (event) => {
          this.toggleSound();
          if (event.detail > 0) ui.sound.blur();
        });
      }

      window.addEventListener('resize', () => this.resize());

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.autoPause();
      });
      window.addEventListener('blur', () => this.autoPause());
    }

    onKeyDown(event) {
      this.audio.unlock();

      const focusedButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
      if (focusedButton && (event.code === 'Space' || event.code === 'Enter')) return;

      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.keys.left = true;
          this.useKeyboardControl();
          event.preventDefault();
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.keys.right = true;
          this.useKeyboardControl();
          event.preventDefault();
          break;
        case 'Space':
        case 'ArrowUp':
          event.preventDefault();
          this.handlePrimary();
          break;
        case 'KeyM':
          event.preventDefault();
          this.toggleSound();
          break;
        case 'KeyP':
        case 'Escape':
          event.preventDefault();
          this.togglePause();
          break;
        case 'Enter':
          event.preventDefault();
          this.handlePrimary();
          break;
        default:
          break;
      }
    }

    onKeyUp(event) {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.keys.left = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.keys.right = false;
          break;
        default:
          break;
      }
    }

    onPointerDown(event) {
      this.audio.unlock();

      const point = this.toLogical(event);

      if (event.pointerType === 'touch') {
        this.pointer.dragging = true;
        this.pointer.startX = point.x;
        this.pointer.startPaddleX = this.paddle.x + this.paddle.w / 2;
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (error) {
          /* przeglądarka może odmówić przechwycenia wskaźnika */
        }
      } else {
        this.paddle.usePointer = true;
        this.paddle.targetX = point.x;
      }

      if (this.state === 'ready') this.launch();
      event.preventDefault();
    }

    onPointerMove(event) {
      const point = this.toLogical(event);

      if (event.pointerType === 'touch') {
        if (!this.pointer.dragging) return;
        this.paddle.usePointer = true;
        this.paddle.targetX = this.pointer.startPaddleX + (point.x - this.pointer.startX);
        event.preventDefault();
        return;
      }

      this.paddle.usePointer = true;
      this.paddle.targetX = point.x;
    }

    onPointerUp() {
      this.pointer.dragging = false;
    }

    onOverlayClick(event) {
      const button = event.target.closest('button[data-action]');
      if (!button) return;

      switch (button.dataset.action) {
        case 'start':
        case 'restart':
          this.startGame();
          break;
        case 'resume':
          this.resume();
          break;
        case 'next':
          this.nextLevel();
          break;
        default:
          break;
      }
    }

    toLogical(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp(((event.clientX - rect.left) / rect.width) * W, 0, W),
        y: clamp(((event.clientY - rect.top) / rect.height) * H, 0, H),
      };
    }

    useKeyboardControl() {
      this.paddle.usePointer = false;
      this.paddle.targetX = null;
    }

    handlePrimary() {
      switch (this.state) {
        case 'ready':
          this.launch();
          break;
        case 'menu':
        case 'gameOver':
        case 'won':
          this.startGame();
          break;
        case 'levelClear':
          this.nextLevel();
          break;
        case 'paused':
          this.resume();
          break;
        default:
          break;
      }
    }

    /* ---------- Sterowanie paletką ---------- */

    updatePaddle(dt) {
      const paddle = this.paddle;
      const previousX = paddle.x;

      if (paddle.usePointer && paddle.targetX !== null) {
        const desired = clamp(paddle.targetX - paddle.w / 2, 0, W - paddle.w);
        const smoothing = 1 - Math.exp(-dt * 30);
        paddle.x += (desired - paddle.x) * smoothing;
      } else {
        let direction = 0;
        if (this.keys.left) direction -= 1;
        if (this.keys.right) direction += 1;
        paddle.x += direction * PADDLE_SPEED * dt;
      }

      paddle.x = clamp(paddle.x, 0, W - paddle.w);
      paddle.vx = clamp((paddle.x - previousX) / dt, -MAX_PADDLE_VX, MAX_PADDLE_VX);
    }

    glueBall() {
      for (const ball of this.balls) {
        if (!ball.glued) continue;
        ball.x = this.paddle.x + this.paddle.w / 2;
        ball.y = this.paddle.y - ball.r - 1;
      }
    }

    setPaddleWidth(width) {
      const center = this.paddle.x + this.paddle.w / 2;
      this.paddle.w = width;
      this.paddle.x = clamp(center - width / 2, 0, W - width);
    }

    /* ---------- Piłki ---------- */

    ballSpeed() {
      const level = LEVELS[this.levelIndex];
      const base = level && level.speed ? level.speed : 420;
      return this.effects.slow > 0 ? base * SLOW_FACTOR : base;
    }

    launch() {
      if (this.state !== 'ready' || this.balls.length === 0) return;

      const ball = this.balls[0];
      const angle = -Math.PI / 2 + rand(-0.33, 0.33);
      const speed = this.ballSpeed();

      ball.glued = false;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;

      this.state = 'playing';
      this.acc = 0;
      this.hideHint();
      this.audio.play('launch');
    }

    updateBalls(dt) {
      for (let index = this.balls.length - 1; index >= 0; index -= 1) {
        const ball = this.balls[index];
        const speed = Math.hypot(ball.vx, ball.vy);
        const steps = Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
        const subDt = dt / steps;

        for (let step = 0; step < steps && !ball.dead; step += 1) {
          this.stepBall(ball, subDt);
        }

        if (ball.dead) {
          this.balls.splice(index, 1);
          continue;
        }

        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 12) ball.trail.shift();
      }

      if (this.balls.length === 0 && this.state === 'playing') {
        this.loseLife();
      }
    }

    stepBall(ball, dt) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.x - ball.r < 0) {
        ball.x = ball.r;
        ball.vx = Math.abs(ball.vx);
        this.audio.play('wall');
      }
      if (ball.x + ball.r > W) {
        ball.x = W - ball.r;
        ball.vx = -Math.abs(ball.vx);
        this.audio.play('wall');
      }
      if (ball.y - ball.r < 0) {
        ball.y = ball.r;
        ball.vy = Math.abs(ball.vy);
        this.audio.play('wall');
      }

      this.collidePaddle(ball);

      for (const brick of this.bricks) {
        if (brick.dead) continue;
        if (this.collideBrick(ball, brick)) {
          this.hitBrick(brick);
          break;
        }
      }

      if (ball.y - ball.r > H) ball.dead = true;
    }

    collidePaddle(ball) {
      if (ball.vy <= 0) return;

      const paddle = this.paddle;
      const closestX = clamp(ball.x, paddle.x, paddle.x + paddle.w);
      const closestY = clamp(ball.y, paddle.y, paddle.y + paddle.h);
      const deltaX = ball.x - closestX;
      const deltaY = ball.y - closestY;

      if (deltaX * deltaX + deltaY * deltaY > ball.r * ball.r) return;

      const relative = clamp((ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
      const speed = Math.hypot(ball.vx, ball.vy);
      const angle = relative * MAX_BOUNCE;

      let vx = Math.sin(angle) * speed + paddle.vx * 0.16;
      let vy = -Math.cos(angle) * speed;

      const minVertical = speed * MIN_BALL_VY;
      if (Math.abs(vy) < minVertical) vy = -minVertical;

      const magnitude = Math.hypot(vx, vy) || 1;
      const correction = speed / magnitude;

      ball.vx = vx * correction;
      ball.vy = vy * correction;
      ball.y = paddle.y - ball.r - 0.5;
      this.audio.play('paddle');
    }

    collideBrick(ball, brick) {
      const closestX = clamp(ball.x, brick.x, brick.x + brick.w);
      const closestY = clamp(ball.y, brick.y, brick.y + brick.h);
      const deltaX = ball.x - closestX;
      const deltaY = ball.y - closestY;

      if (deltaX * deltaX + deltaY * deltaY > ball.r * ball.r) return false;

      const centerX = brick.x + brick.w / 2;
      const centerY = brick.y + brick.h / 2;
      const overlapX = brick.w / 2 + ball.r - Math.abs(ball.x - centerX);
      const overlapY = brick.h / 2 + ball.r - Math.abs(ball.y - centerY);

      if (overlapX <= 0 || overlapY <= 0) return false;

      if (overlapX < overlapY) {
        if (ball.x < centerX) {
          ball.x = brick.x - ball.r;
          ball.vx = -Math.abs(ball.vx);
        } else {
          ball.x = brick.x + brick.w + ball.r;
          ball.vx = Math.abs(ball.vx);
        }
      } else if (ball.y < centerY) {
        ball.y = brick.y - ball.r;
        ball.vy = -Math.abs(ball.vy);
      } else {
        ball.y = brick.y + brick.h + ball.r;
        ball.vy = Math.abs(ball.vy);
      }

      return true;
    }

    hitBrick(brick) {
      if (brick.steel) {
        brick.flash = 0.12;
        this.audio.play('steel');
        return;
      }

      brick.hp -= 1;
      brick.flash = 0.14;
      this.audio.play('brick', Math.round((brick.y - BRICK_TOP) / (BRICK_H + ROW_GAP)));

      if (brick.hp > 0) return;

      brick.dead = true;
      this.addScore(brick.points);

      if (Math.random() < POWERUP_CHANCE && this.powerups.length < MAX_POWERUPS) {
        this.dropPowerup(brick);
      }
    }

    splitBalls() {
      const sources = this.balls.slice();

      for (const ball of sources) {
        const speed = Math.hypot(ball.vx, ball.vy);
        const baseAngle = Math.atan2(ball.vy, ball.vx);

        for (const offset of [-0.42, 0.42]) {
          if (this.balls.length >= 8) return;

          const angle = baseAngle + offset;
          this.balls.push({
            x: ball.x,
            y: ball.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r: BALL_R,
            trail: [],
            glued: false,
            dead: false,
          });
        }
      }
    }

    scaleBallSpeed(factor) {
      for (const ball of this.balls) {
        ball.vx *= factor;
        ball.vy *= factor;
      }
    }

    /* ---------- Klocki ---------- */

    loadLevel(index) {
      this.levelIndex = clamp(index, 0, Math.max(0, LEVELS.length - 1));
      const level = LEVELS[this.levelIndex];

      this.bricks = [];
      this.balls = [];
      this.powerups = [];
      this.effects = { expand: 0, slow: 0 };
      this.toastText = '';
      this.toastTime = 0;
      this.hudTimer = 0;
      this._chipsHtml = '';

      this.paddle.w = PADDLE_W;
      this.paddle.x = (W - PADDLE_W) / 2;
      this.paddle.vx = 0;
      this.paddle.usePointer = false;
      this.paddle.targetX = null;

      if (level) {
        level.rows.forEach((row, rowIndex) => {
          for (let column = 0; column < COLS; column += 1) {
            const symbol = row[column] || '.';
            if (symbol === '.') continue;

            const steel = symbol === '@';
            const sturdy = symbol === '=';

            this.bricks.push({
              x: MARGIN + column * (BRICK_W + GAP),
              y: BRICK_TOP + rowIndex * (BRICK_H + ROW_GAP),
              w: BRICK_W,
              h: BRICK_H,
              color: steel
                ? '#64748b'
                : level.palette[rowIndex % level.palette.length],
              hp: steel ? Infinity : sturdy ? 2 : 1,
              points: steel ? 0 : sturdy ? 20 : 10,
              steel,
              flash: 0,
              dead: false,
            });
          }
        });
      }

      this.resetBall();
      this.updateHud();
    }

    resetBall() {
      this.balls = [
        {
          x: this.paddle.x + this.paddle.w / 2,
          y: this.paddle.y - BALL_R - 1,
          vx: 0,
          vy: 0,
          r: BALL_R,
          trail: [],
          glued: true,
          dead: false,
        },
      ];
    }

    updateBricks(dt) {
      for (const brick of this.bricks) {
        if (brick.flash > 0) brick.flash = Math.max(0, brick.flash - dt);
      }
    }

    checkLevelClear() {
      const remaining = this.bricks.some((brick) => !brick.dead && !brick.steel);
      if (!remaining) this.clearLevel();
    }

    clearLevel() {
      const bonus = this.lives * 100;
      this.addScore(bonus);
      this.saveBest();
      this.hideHint();

      const isLast = this.levelIndex >= LEVELS.length - 1;
      if (isLast) {
        this.state = 'won';
        this.showOverlay(this.wonCard());
        this.audio.play('win');
      } else {
        this.state = 'levelClear';
        this.showOverlay(this.levelClearCard(bonus));
        this.audio.play('clear');
      }
    }

    nextLevel() {
      if (this.state !== 'levelClear') return;
      this.loadLevel(this.levelIndex + 1);
      this.state = 'ready';
      this.hideOverlay();
      this.showHint();
      this.acc = 0;
    }

    /* ---------- Power-upy ---------- */

    dropPowerup(brick) {
      const roll = Math.random();
      const type = roll < 0.4 ? 'expand' : roll < 0.65 ? 'multi' : 'slow';

      this.powerups.push({
        x: brick.x + brick.w / 2,
        y: brick.y + brick.h / 2,
        w: POWERUP_W,
        h: POWERUP_H,
        type,
        vy: POWERUP_FALL,
      });
    }

    updatePowerups(dt) {
      const paddle = this.paddle;

      for (let index = this.powerups.length - 1; index >= 0; index -= 1) {
        const powerup = this.powerups[index];
        powerup.y += powerup.vy * dt;

        const caught =
          powerup.x + powerup.w / 2 > paddle.x &&
          powerup.x - powerup.w / 2 < paddle.x + paddle.w &&
          powerup.y + powerup.h / 2 > paddle.y &&
          powerup.y - powerup.h / 2 < paddle.y + paddle.h;

        if (caught) {
          this.applyPowerup(powerup.type);
          this.powerups.splice(index, 1);
          continue;
        }

        if (powerup.y - powerup.h / 2 > H) this.powerups.splice(index, 1);
      }
    }

    applyPowerup(type) {
      const meta = POWERUPS[type];
      if (!meta) return;

      if (type === 'expand') {
        this.effects.expand = EXPAND_TIME;
        this.setPaddleWidth(PADDLE_WIDE);
      } else if (type === 'slow') {
        if (this.effects.slow <= 0) this.scaleBallSpeed(SLOW_FACTOR);
        this.effects.slow = SLOW_TIME;
      } else if (type === 'multi') {
        this.splitBalls();
      }

      this.toast(meta.label);
      this.syncChips();
      this.audio.play('powerup');
    }

    updateEffects(dt) {
      if (this.effects.expand > 0) {
        this.effects.expand -= dt;
        if (this.effects.expand <= 0) {
          this.effects.expand = 0;
          this.setPaddleWidth(PADDLE_W);
          this.syncChips();
        }
      }

      if (this.effects.slow > 0) {
        this.effects.slow -= dt;
        if (this.effects.slow <= 0) {
          this.effects.slow = 0;
          this.scaleBallSpeed(1 / SLOW_FACTOR);
          this.syncChips();
        }
      }
    }

    /* ---------- Życia i wynik ---------- */

    loseLife() {
      this.balls = [];
      this.lives -= 1;

      if (this.lives <= 0) {
        this.gameOver();
        return;
      }

      this.audio.play('life');

      this.effects = { expand: 0, slow: 0 };
      this.powerups = [];
      this.paddle.w = PADDLE_W;
      this.paddle.x = clamp(this.paddle.x, 0, W - PADDLE_W);
      this.resetBall();
      this.state = 'ready';

      this.updateHud();
      this.syncChips();
      this.showHint();
    }

    gameOver() {
      this.state = 'gameOver';
      this.balls = [];
      this.powerups = [];
      this.effects = { expand: 0, slow: 0 };
      this.setPaddleWidth(PADDLE_W);
      this.saveBest();
      this.hideHint();
      this.updateHud();
      this.syncChips();
      this.showOverlay(this.gameOverCard());
      this.audio.play('gameover');
    }

    startGame() {
      this.score = 0;
      this.lives = 3;
      this.effects = { expand: 0, slow: 0 };
      this.powerups = [];
      this.toastText = '';
      this.toastTime = 0;
      this.hideOverlay();
      this.loadLevel(0);
      this.state = 'ready';
      this.acc = 0;
      this.lastTime = performance.now();
      this.showHint();
      this.updateHud();
    }

    addScore(points) {
      this.score += points;
      if (this.score > this.best) {
        this.best = this.score;
        this.saveBest();
      }
      this.updateHud();
    }

    loadBest() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const value = Number.parseInt(raw || '0', 10);
        return Number.isFinite(value) && value > 0 ? value : 0;
      } catch (error) {
        return 0;
      }
    }

    saveBest() {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(this.best));
      } catch (error) {
        /* zapis może być zablokowany, gra działa dalej */
      }
    }

    /* ---------- Pauza ---------- */

    togglePause() {
      if (this.state === 'playing' || this.state === 'ready') {
        this.pauseReturn = this.state;
        this.state = 'paused';
        this.hideHint();
        this.showOverlay(this.pauseCard());
      } else if (this.state === 'paused') {
        this.resume();
      }
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = this.pauseReturn;
      this.acc = 0;
      this.lastTime = performance.now();
      this.hideOverlay();
      if (this.state === 'ready') this.showHint();
    }

    autoPause() {
      if (this.state === 'playing' || this.state === 'ready') this.togglePause();
    }

    /* ---------- Toast ---------- */

    toast(text) {
      this.toastText = text;
      this.toastTime = 1.6;
    }

    /* ---------- Interfejs ---------- */

    updateHud() {
      if (ui.score) ui.score.textContent = formatNumber(this.score);
      if (ui.best) ui.best.textContent = formatNumber(this.best);
      if (ui.level) ui.level.textContent = `${this.levelIndex + 1} / ${LEVELS.length}`;

      if (ui.lives) {
        const hearts = [0, 1, 2]
          .map(
            (index) =>
              `<span class="heart${index < this.lives ? '' : ' heart--empty'}">♥</span>`,
          )
          .join('');
        ui.lives.innerHTML = hearts;
      }

      this.syncChips();
    }

    syncChips() {
      if (!ui.effects) return;

      const chips = [];
      if (this.effects.expand > 0) {
        chips.push(
          `<span class="chip">Szersza paletka · ${Math.ceil(this.effects.expand)} s</span>`,
        );
      }
      if (this.effects.slow > 0) {
        chips.push(
          `<span class="chip chip--slow">Wolna piłka · ${Math.ceil(this.effects.slow)} s</span>`,
        );
      }

      const html = chips.join('');
      if (html === this._chipsHtml) return;

      this._chipsHtml = html;
      ui.effects.innerHTML = html;
    }

    toggleSound() {
      this.audio.unlock();
      const muted = this.audio.toggle();
      this.syncSound();
      if (!muted) this.audio.play('powerup');
    }

    syncSound() {
      if (!ui.sound) return;
      const muted = this.audio.muted;
      ui.sound.textContent = muted ? 'Dźwięk: wył.' : 'Dźwięk: wł.';
      ui.sound.setAttribute('aria-pressed', String(!muted));
      ui.sound.setAttribute(
        'aria-label',
        muted ? 'Włącz dźwięk (klawisz M)' : 'Wycisz dźwięk (klawisz M)',
      );
    }

    showHint() {
      if (ui.hint) ui.hint.hidden = false;
    }

    hideHint() {
      if (ui.hint) ui.hint.hidden = true;
    }

    showOverlay(html) {
      ui.overlay.innerHTML = html;
      ui.overlay.classList.add('is-visible');

      const button = ui.overlay.querySelector('button');
      if (button) {
        try {
          button.focus({ preventScroll: true });
        } catch (error) {
          button.focus();
        }
      }
    }

    hideOverlay() {
      ui.overlay.classList.remove('is-visible');
      ui.overlay.innerHTML = '';
    }

    showMenu() {
      this.showOverlay(`
        <div class="card">
          <p class="eyebrow">klasyk arcade</p>
          <h1 class="title">ARKANOID</h1>
          <p class="lede">Zbij wszystkie klocki, łap kapsuły z power-upami i nie pozwól piłce spaść.</p>
          <button class="btn" data-action="start">Zagraj</button>
          <ul class="controls">
            <li><kbd>←</kbd> <kbd>→</kbd> lub <kbd>A</kbd> <kbd>D</kbd> — ruch paletki</li>
            <li>mysz lub przeciąganie palcem — sterowanie paletką</li>
            <li><kbd>Space</kbd> / klik — wystrzał piłki</li>
            <li><kbd>P</kbd> / <kbd>Esc</kbd> — pauza</li>
          </ul>
          <p class="record">Rekord: <strong>${formatNumber(this.best)}</strong></p>
        </div>
      `);
    }

    pauseCard() {
      return `
        <div class="card">
          <p class="eyebrow">przerwa</p>
          <h2 class="title title--sm">PAUZA</h2>
          <p class="lede">Gra zatrzymana. Wróć, kiedy będziesz gotowy.</p>
          <button class="btn" data-action="resume">Wróć do gry</button>
          <p class="record"><kbd>P</kbd> wznawia grę</p>
        </div>
      `;
    }

    levelClearCard(bonus) {
      return `
        <div class="card">
          <p class="eyebrow">poziom ${this.levelIndex + 1} z ${LEVELS.length}</p>
          <h2 class="title title--sm">Poziom ukończony</h2>
          <p class="scoreline">Bonus za życia: <strong>+${formatNumber(bonus)}</strong></p>
          <p class="scoreline">Wynik: <strong>${formatNumber(this.score)}</strong></p>
          <button class="btn" data-action="next">Następny poziom</button>
        </div>
      `;
    }

    gameOverCard() {
      return `
        <div class="card">
          <p class="eyebrow">wszystkie życia stracone</p>
          <h2 class="title title--sm">Koniec gry</h2>
          <p class="scoreline">Wynik: <strong>${formatNumber(this.score)}</strong></p>
          <p class="scoreline">Rekord: <strong>${formatNumber(this.best)}</strong></p>
          <button class="btn" data-action="restart">Zagraj ponownie</button>
        </div>
      `;
    }

    wonCard() {
      return `
        <div class="card">
          <p class="eyebrow">wszystkie poziomy zbite</p>
          <h2 class="title title--sm">Zwycięstwo</h2>
          <p class="lede">Przeszedłeś całą grę. Piłka posłusznie wracała na paletkę.</p>
          <p class="scoreline">Wynik: <strong>${formatNumber(this.score)}</strong></p>
          <p class="scoreline">Rekord: <strong>${formatNumber(this.best)}</strong></p>
          <button class="btn" data-action="restart">Zagraj jeszcze raz</button>
        </div>
      `;
    }

    /* ---------- Rysowanie ---------- */

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(W * dpr);
      const height = Math.round(H * dpr);

      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.dpr = dpr;
    }

    render() {
      this.resize();

      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      this.drawBackground(ctx);
      this.drawBricks(ctx);
      this.drawPowerups(ctx);
      this.drawPaddle(ctx);
      this.drawBalls(ctx);
      this.drawToast(ctx);
    }

    drawBackground(ctx) {
      const backdrop = ctx.createLinearGradient(0, 0, 0, H);
      backdrop.addColorStop(0, '#070b1a');
      backdrop.addColorStop(0.55, '#0a1024');
      backdrop.addColorStop(1, '#0c1430');
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(120, 160, 255, 0.055)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 40; x < W; x += 40) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, H);
      }
      for (let y = 40; y < H; y += 40) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(W, y + 0.5);
      }
      ctx.stroke();

      const wall = ctx.createLinearGradient(0, 0, 0, H);
      wall.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
      wall.addColorStop(1, 'rgba(129, 140, 248, 0.12)');
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, 4, H);
      ctx.fillRect(W - 4, 0, 4, H);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.fillRect(0, 0, W, 3);
    }

    drawBricks(ctx) {
      for (const brick of this.bricks) {
        if (brick.dead) continue;

        const flashing = brick.flash > 0;
        const radius = 7;

        roundRectPath(ctx, brick.x, brick.y, brick.w, brick.h, radius);
        ctx.fillStyle = flashing ? '#f8fbff' : brick.color;
        ctx.fill();

        const shine = ctx.createLinearGradient(0, brick.y, 0, brick.y + brick.h);
        shine.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        shine.addColorStop(0.45, 'rgba(255, 255, 255, 0.06)');
        shine.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = shine;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (brick.steel) {
          ctx.save();
          roundRectPath(ctx, brick.x, brick.y, brick.w, brick.h, radius);
          ctx.clip();
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let x = brick.x - brick.h; x < brick.x + brick.w + brick.h; x += 9) {
            ctx.moveTo(x, brick.y + brick.h);
            ctx.lineTo(x + brick.h, brick.y);
          }
          ctx.stroke();
          ctx.restore();
        } else if (brick.hp > 1) {
          roundRectPath(ctx, brick.x + 4.5, brick.y + 4.5, brick.w - 9, brick.h - 9, 4);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    drawPaddle(ctx) {
      const paddle = this.paddle;

      ctx.save();
      ctx.shadowColor = 'rgba(34, 211, 238, 0.85)';
      ctx.shadowBlur = 24;

      const gradient = ctx.createLinearGradient(0, paddle.y, 0, paddle.y + paddle.h);
      gradient.addColorStop(0, '#a5f3fc');
      gradient.addColorStop(0.45, '#22d3ee');
      gradient.addColorStop(1, '#4f46e5');
      ctx.fillStyle = gradient;
      roundRectPath(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 8);
      ctx.fill();
      ctx.restore();

      roundRectPath(ctx, paddle.x + 5, paddle.y + 3.5, Math.max(0, paddle.w - 10), 3.5, 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fill();
    }

    drawBalls(ctx) {
      for (const ball of this.balls) {
        for (let index = 0; index < ball.trail.length; index += 1) {
          const point = ball.trail[index];
          const ratio = (index + 1) / ball.trail.length;
          ctx.fillStyle = `rgba(125, 211, 252, ${ratio * 0.28})`;
          ctx.beginPath();
          ctx.arc(point.x, point.y, ball.r * (0.3 + ratio * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.save();
        ctx.shadowColor = 'rgba(125, 211, 252, 0.95)';
        ctx.shadowBlur = 18;

        const gradient = ctx.createRadialGradient(
          ball.x - 2,
          ball.y - 3,
          1,
          ball.x,
          ball.y,
          ball.r,
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.6, '#e0f2fe');
        gradient.addColorStop(1, '#7dd3fc');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    drawPowerups(ctx) {
      for (const powerup of this.powerups) {
        const meta = POWERUPS[powerup.type];
        if (!meta) continue;

        const pulse = 0.7 + Math.sin(this.time * 6 + powerup.x * 0.05) * 0.3;
        const x = powerup.x - powerup.w / 2;
        const y = powerup.y - powerup.h / 2;

        ctx.save();
        ctx.shadowColor = meta.color;
        ctx.shadowBlur = 18 * pulse;

        const gradient = ctx.createLinearGradient(0, y, 0, y + powerup.h);
        gradient.addColorStop(0, '#0b1224');
        gradient.addColorStop(1, '#1e293b');

        ctx.fillStyle = gradient;
        roundRectPath(ctx, x, y, powerup.w, powerup.h, powerup.h / 2);
        ctx.fill();
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = meta.color;
        ctx.font = '700 12px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.letter, powerup.x, powerup.y + 1);
        ctx.restore();
      }
    }

    drawToast(ctx) {
      if (this.toastTime <= 0) return;

      ctx.save();
      ctx.globalAlpha = Math.min(1, this.toastTime / 0.4);
      ctx.font = '700 20px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#a5f3fc';
      ctx.shadowColor = 'rgba(34, 211, 238, 0.75)';
      ctx.shadowBlur = 18;
      ctx.fillText(this.toastText, W / 2, H - 118);
      ctx.restore();
    }
  }

  const game = new Game();

  // Uchwyt diagnostyczny: pozwala podejrzeć i przetestować stan gry z konsoli.
  window.arkanoid = game;
})();
