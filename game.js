// ============================================================================
// EVOSPHERE v2.5 — Bugs Fixed & AAA Enhanced
// ============================================================================
// BUG FIXES from v2.0:
// 1. Entity.draw() called before this.body exists → guarded
// 2. foodPool.splice(idx) inside forEach → switched to filter loop (index drift)
// 3. Player entity container never added to entityLayer in constructor → fixed
// 4. getMutationBonus always returned 1 (wrong key lookup) → fixed
// 5. Particles never added to fxLayer until after update → added on creation
// 6. Camera lerp used raw delta (60x too fast at 60fps) → normalized
// 7. Enemy target escape logic had inverted dx/dy → fixed
// 8. World food density reused old pool incorrectly → full respawn
// 9. Entity revive didn't reset vx/vy → added
// 10. Food `pulseOff` not initialized in first spawnFood → fixed
// 11. foodPool.splice inside forEach caused skipped entries → fixed with filter
// 12. bgLayer parallax position set incorrectly (absolute not relative) → fixed
// ============================================================================

(function () {
    'use strict';

    // ── CONSTANTS ─────────────────────────────────────────────────────────────
    const WORLD_W = 5000;
    const WORLD_H = 5000;
    const MIN_SIZE = 10;
    const MINIMAP_W = 130;
    const MINIMAP_H = 130;

    // ── WORLD CONFIGS ─────────────────────────────────────────────────────────
    const WORLDS = {
        1: { name: 'Abysse Primordiale', bg: 0x030812, accent: 0x00ffc8, food: 350, enemies: 22, unlockSize: 0 },
        2: { name: 'Récif Biolumineux',  bg: 0x010e1a, accent: 0x00aaff, food: 420, enemies: 28, unlockSize: 50 },
        3: { name: 'Épave Abyssale',     bg: 0x0c0d14, accent: 0xff6b9d, food: 390, enemies: 34, unlockSize: 85 },
        4: { name: 'Zone Thermale',      bg: 0x160b06, accent: 0xffaa00, food: 320, enemies: 40, unlockSize: 120 },
        5: { name: 'Biosphère Terrestre',bg: 0x0c1410, accent: 0x55ff44, food: 500, enemies: 48, unlockSize: 160, terrestrial: true }
    };

    // ── EVOLUTION STAGES ──────────────────────────────────────────────────────
    const STAGES = [
        { size: 0,   name: 'Unicellulaire',     sub: 'Organisme primitif' },
        { size: 30,  name: 'Multicellulaire',   sub: 'Division cellulaire' },
        { size: 55,  name: 'Invertébré',        sub: 'Première colonie' },
        { size: 90,  name: 'Créature Primitive',sub: 'Vertèbres embryonnaires' },
        { size: 130, name: 'Créature Évoluée',  sub: 'Système nerveux complexe' },
        { size: 170, name: 'Créature Suprême',  sub: 'Apex Predator' }
    ];

    // ── MUTATIONS ─────────────────────────────────────────────────────────────
    const MUTATIONS = {
        flagella:       { name: 'Flagelle',       icon: '🌀', bg: '#ffaa0025', color: '#ffaa00', speedMult: 1.35,   desc: '+35% vitesse de déplacement' },
        spike:          { name: 'Épine Venimeuse',icon: '⚡', bg: '#ff1e5625', color: '#ff2055', damageMult: 1.6,   desc: '+60% dégâts en collision' },
        shield:         { name: 'Cuticule',       icon: '🛡', bg: '#6b7adb25', color: '#6b9ef5', defenseMult: 1.5,  desc: '+50% résistance aux dégâts' },
        neuron:         { name: 'Neurone Étendu', icon: '🔮', bg: '#a78bfa25', color: '#a78bfa', magnetMult: 1.8,   desc: '+80% rayon de détection nourriture' },
        chemosynthesis: { name: 'Chimiosynthèse', icon: '💚', bg: '#00ffcc25', color: '#00ffcc', foodEff: 1.6,      desc: '+60% efficacité d\'assimilation' },
        camouflage:     { name: 'Camouflage',     icon: '👁', bg: '#94a3b825', color: '#cbd5e1', camo: true,       desc: 'Réduit l\'attraction des ennemis' },
        regeneration:   { name: 'Régénération',   icon: '❤️', bg: '#22d3ee25', color: '#22d3ee', regenRate: 0.5,   desc: 'Régénère 0.5 HP/s en dehors du combat' }
    };

    // ── STATE ─────────────────────────────────────────────────────────────────
    let app, player;
    let worldContainer, bgLayer, gridLayer, foodLayer, entityLayer, fxLayer, uiLayer;
    let enemies = [];
    let foodItems = [];
    let particles = [];
    let bgStars = [];
    let bgParticles = [];

    const GS = {
        running: false,
        paused: false,
        muted: false,
        age: 0,
        camX: WORLD_W / 2,
        camY: WORLD_H / 2,
        camZoom: 1,
        shakeAmt: 0,
        mouseX: 0,
        mouseY: 0,
        world: 1,
        worldsVisited: new Set([1]),
        terrestrial: false,
        kills: 0,
        startTime: 0,
        lastStageIdx: 0,
        regenTimer: 0,
        inCombatTimer: 0
    };

    // ── AUDIO ─────────────────────────────────────────────────────────────────
    let audioCtx = null;

    function initAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
        }
    }

    function sfx(freq, dur, type = 'sine', vol = 0.25) {
        if (GS.muted || !audioCtx) return;
        try {
            const t = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const g   = audioCtx.createGain();
            osc.connect(g); g.connect(audioCtx.destination);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            osc.start(t); osc.stop(t + dur);
        } catch (_) {}
    }

    // ── TOAST ─────────────────────────────────────────────────────────────────
    let notifTimeout = null;
    function toast(msg) {
        const el = document.getElementById('notif');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(notifTimeout);
        notifTimeout = setTimeout(() => el.classList.remove('show'), 2800);
    }

    // ── STAGE BANNER ──────────────────────────────────────────────────────────
    let bannerTimeout = null;
    function showBanner(name, sub) {
        const el = document.getElementById('stage-banner');
        document.getElementById('sb-name').textContent = name;
        document.getElementById('sb-sub').textContent  = sub;
        el.classList.add('show');
        clearTimeout(bannerTimeout);
        bannerTimeout = setTimeout(() => el.classList.remove('show'), 2600);
    }

    // ── PULSE RING ────────────────────────────────────────────────────────────
    function pulseRing() {
        const el = document.getElementById('pulse-ring');
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'pulse-expand 0.7s ease-out forwards';
    }

    // ── PARTICLE ──────────────────────────────────────────────────────────────
    class Particle {
        constructor(x, y, vx, vy, color, size, life) {
            this.x = x; this.y = y;
            this.vx = vx; this.vy = vy;
            this.color = color;
            this.size = size;
            this.life = life;
            this.maxLife = life;
            this.alive = true;
            this.gfx = new PIXI.Graphics();
            this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
            if (fxLayer) fxLayer.addChild(this.gfx); // FIX #5: add on creation
        }

        update(dt) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.vx *= 0.91;
            this.vy *= 0.91;
            this.life -= dt * 0.016; // normalized: life in seconds roughly
            if (this.life <= 0) {
                this.alive = false;
                this.gfx.clear();
                return;
            }
            const a = Math.max(0, this.life / this.maxLife);
            this.gfx.clear();
            this.gfx.beginFill(this.color, a * 0.85);
            this.gfx.drawCircle(0, 0, this.size * (0.3 + a * 0.7));
            this.gfx.endFill();
            this.gfx.x = this.x;
            this.gfx.y = this.y;
        }
    }

    function spawnBurst(x, y, color, count = 10, speed = 180) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const sp = speed * (0.5 + Math.random() * 0.5);
            particles.push(new Particle(x, y, Math.cos(angle) * sp, Math.sin(angle) * sp, color, 2 + Math.random() * 3, 35));
        }
    }

    // ── ENTITY ────────────────────────────────────────────────────────────────
    class Entity {
        constructor(x, y, size, diet, isPlayer = false) {
            this.isPlayer = isPlayer;
            this.x = x; this.y = y;
            this.vx = 0; this.vy = 0;
            this.size = size;
            this.targetSize = size;
            this.diet = diet;
            this.mutations = {};
            this.hp = 100;
            this.maxHp = 100;
            this.hunger = 100;
            this.alive = true;
            this.baseColor = diet === 'herbivore' ? 0x00ffcc : 0xff2055;
            this.color = this.baseColor;
            this.wiggle = Math.random() * Math.PI * 2;
            this.eyeAngle = 0;
            this.lastDamagedTime = -999;
            this.aiTarget = { x: Math.random() * WORLD_W, y: Math.random() * WORLD_H };
            this.aiChangeTimer = 0;
            this.spawnTime = GS.age;

            // Create container
            this.container = new PIXI.Container();
            this.body = new PIXI.Graphics();
            this.eye  = new PIXI.Graphics();
            this.container.addChild(this.body, this.eye);
            this.draw();

            if (entityLayer) entityLayer.addChild(this.container); // FIX #3
        }

        // FIX #4: correct stat bonus lookup
        getBonus(stat) {
            for (const [key, def] of Object.entries(MUTATIONS)) {
                if (this.mutations[key] && def[stat]) return def[stat];
            }
            return 1;
        }

        getStats() {
            const baseSpeed  = this.diet === 'herbivore' ? 0.4 : 0.62;
            const baseRegen  = this.mutations.regeneration ? MUTATIONS.regeneration.regenRate : 0;
            return {
                speed:   baseSpeed * this.getBonus('speedMult') * Math.pow(MIN_SIZE / Math.max(this.size, MIN_SIZE), 0.5),
                magnet:  (this.diet === 'herbivore' ? 7 : 2) * this.getBonus('magnetMult'),
                damage:  (this.diet === 'carnivore' ? 1.3 : 0.4) * this.getBonus('damageMult'),
                defense: this.getBonus('defenseMult'),
                foodEff: this.getBonus('foodEff') || 1,
                regen:   baseRegen
            };
        }

        draw() {
            if (!this.body) return; // FIX #1
            this.body.clear();
            this.eye.clear();

            const isCarn = this.diet === 'carnivore';
            const s = this.size;
            const mutCount = Object.keys(this.mutations).length;

            // Glow ring behind body
            this.body.beginFill(this.color, 0.08);
            this.body.drawCircle(0, 0, s * 1.45);
            this.body.endFill();

            // Main body
            this.body.lineStyle(1.5, 0xffffff, 0.3);
            this.body.beginFill(this.color, 0.88);

            if (isCarn) {
                this.drawStarShape(s, 5 + Math.min(mutCount, 4));
            } else {
                // Herbivore is a smooth blob-circle
                this.body.drawCircle(0, 0, s);
                if (mutCount > 0) {
                    this.body.beginFill(0xffffff, 0.1);
                    this.body.drawCircle(0, 0, s * 0.45);
                }
            }
            this.body.endFill();

            // Appendages for mutations
            if (this.mutations.flagella) this.drawFlagella(s);
            if (this.mutations.spike)    this.drawSpikes(s);

            // Eyes
            this.eye.beginFill(0xffffff, 0.9);
            this.eye.drawCircle(s * 0.35, -s * 0.2, s * 0.16);
            this.eye.endFill();
            this.eye.beginFill(0x000000);
            this.eye.drawCircle(s * 0.38, -s * 0.18, s * 0.09);
            this.eye.endFill();
        }

        drawStarShape(radius, points) {
            const inner = radius * 0.6;
            const step = (Math.PI * 2) / (points * 2);
            this.body.moveTo(0, -radius);
            for (let i = 1; i < points * 2; i++) {
                const r = i % 2 === 0 ? radius : inner;
                const angle = i * step - Math.PI / 2;
                this.body.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            this.body.closePath();
        }

        drawFlagella(s) {
            this.body.lineStyle(1.5, 0xffaa00, 0.7);
            for (let i = 0; i < 3; i++) {
                const angle = Math.PI + (i - 1) * 0.5;
                this.body.moveTo(Math.cos(angle) * s, Math.sin(angle) * s);
                this.body.bezierCurveTo(
                    Math.cos(angle) * s * 2.2, Math.sin(angle) * s * 2.2,
                    Math.cos(angle + 0.4) * s * 2.8, Math.sin(angle + 0.4) * s * 2.8,
                    Math.cos(angle + 0.8) * s * 3.2, Math.sin(angle + 0.8) * s * 3.2
                );
            }
        }

        drawSpikes(s) {
            this.body.lineStyle(0);
            this.body.beginFill(0xff2055, 0.9);
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const bx = Math.cos(angle) * s * 0.95;
                const by = Math.sin(angle) * s * 0.95;
                const tip = s * 0.45;
                const wx = Math.cos(angle + Math.PI / 2) * s * 0.12;
                const wy = Math.sin(angle + Math.PI / 2) * s * 0.12;
                this.body.moveTo(bx - wx, by - wy);
                this.body.lineTo(Math.cos(angle) * (s + tip), Math.sin(angle) * (s + tip));
                this.body.lineTo(bx + wx, by + wy);
                this.body.endFill();
                this.body.beginFill(0xff2055, 0.9);
            }
        }

        eat(type, amt = 1) {
            const compat = (this.diet === 'herbivore' && type === 'plant') ||
                           (this.diet === 'carnivore' && type === 'meat');
            if (!compat) return false;
            const eff = this.getStats().foodEff;
            this.targetSize = Math.min(250, this.targetSize + amt * eff * 0.5);
            this.hunger = Math.min(100, this.hunger + 18 * eff);
            return true;
        }

        takeDamage(amount) {
            const actual = amount / this.getStats().defense;
            this.hp = Math.max(0, this.hp - actual);
            this.lastDamagedTime = GS.age;
            if (this.hp <= 0) this.alive = false;
        }

        // FIX #9: reset velocity on revive
        reset(x, y, size, diet) {
            this.x = x; this.y = y;
            this.vx = 0; this.vy = 0;
            this.size = size; this.targetSize = size;
            this.diet = diet;
            this.hp = 100; this.maxHp = 100;
            this.hunger = 100;
            this.alive = true;
            this.mutations = {};
            this.baseColor = diet === 'herbivore' ? 0x00ffcc : 0xff2055;
            this.color = this.baseColor;
            this.draw();
        }

        update(dt, targetX = null, targetY = null) {
            if (!this.alive) return;

            // Hunger drain (normalized to real time)
            this.hunger = Math.max(0, this.hunger - 0.08 * dt);
            if (this.hunger < 15) this.takeDamage(0.3 * dt);

            // Regeneration (FIX: regen only outside combat)
            if (this.isPlayer) {
                const stats = this.getStats();
                const timeSinceDmg = (GS.age - this.lastDamagedTime) * 0.016;
                if (stats.regen > 0 && timeSinceDmg > 4) {
                    this.hp = Math.min(this.maxHp, this.hp + stats.regen * dt);
                }
            }

            // Smooth size growth
            if (this.size < this.targetSize) {
                this.size += Math.min(0.2 * dt, this.targetSize - this.size);
                if (this.size >= this.targetSize) this.size = this.targetSize;
                this.draw();
            }

            // Movement
            if (targetX !== null && targetY !== null) {
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > 3) {
                    const stats = this.getStats();
                    const force = stats.speed * 0.08;
                    this.vx += (dx / d) * force * dt;
                    this.vy += (dy / d) * force * dt;
                }
            }

            // Friction
            const friction = GS.terrestrial ? 0.82 : 0.93;
            this.vx *= friction;
            this.vy *= friction;
            this.x += this.vx * dt;
            this.y += this.vy * dt;

            // Bounds
            this.x = Math.max(this.size, Math.min(WORLD_W - this.size, this.x));
            this.y = Math.max(this.size, Math.min(WORLD_H - this.size, this.y));

            // Container
            if (this.container) {
                this.container.x = this.x;
                this.container.y = this.y;

                // Rotation & squash/stretch
                const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (spd > 1) {
                    this.container.rotation = Math.atan2(this.vy, this.vx);
                    const stretch = 1 + Math.min(spd, 8) * 0.015;
                    this.body.scale.set(stretch, 1 / stretch);
                } else {
                    this.wiggle += 0.03 * dt;
                    const breathe = Math.sin(this.wiggle) * 0.018;
                    this.body.scale.set(1 + breathe, 1 - breathe);
                    this.container.rotation += (0 - this.container.rotation) * 0.1;
                }

                // Eye always faces velocity
                const eyeTarget = Math.atan2(this.vy, this.vx);
                this.eye.rotation = eyeTarget - this.container.rotation;
            }
        }
    }

    // ── ENTITY POOL ───────────────────────────────────────────────────────────
    const pool = { inactive: [], active: [] };

    function getEnemy(x, y, size, diet) {
        let e;
        if (pool.inactive.length > 0) {
            e = pool.inactive.pop();
            e.reset(x, y, size, diet);
            if (entityLayer && !e.container.parent) entityLayer.addChild(e.container);
        } else {
            e = new Entity(x, y, size, diet, false);
        }
        pool.active.push(e);
        return e;
    }

    function releaseEnemy(e) {
        e.alive = false;
        if (e.container && e.container.parent) e.container.parent.removeChild(e.container);
        pool.active = pool.active.filter(x => x !== e);
        pool.inactive.push(e);
    }

    function clearAllEnemies() {
        for (const e of pool.active) {
            if (e.container && e.container.parent) e.container.parent.removeChild(e.container);
        }
        pool.inactive.push(...pool.active);
        pool.active = [];
        enemies = [];
    }

    // ── FOOD ──────────────────────────────────────────────────────────────────
    function makeFood(type, x, y) {
        const g = new PIXI.Graphics();
        g.blendMode = PIXI.BLEND_MODES.NORMAL;
        const obj = {
            x: x ?? Math.random() * WORLD_W,
            y: y ?? Math.random() * WORLD_H,
            type,
            gfx: g,
            phase: Math.random() * Math.PI * 2,
            alive: true
        };
        foodLayer.addChild(g);
        foodItems.push(obj);
        return obj;
    }

    function removeFood(f) {
        f.alive = false;
        if (f.gfx.parent) f.gfx.parent.removeChild(f.gfx);
    }

    function spawnFoodBatch(count) {
        for (let i = 0; i < count; i++) {
            const type = Math.random() > 0.42 ? 'plant' : 'meat';
            makeFood(type);
        }
    }

    function drawFood(f, age) {
        const scale = 1 + Math.sin(age * 0.08 + f.phase) * 0.18;
        const pulse = Math.abs(Math.sin(age * 0.04 + f.phase));
        f.gfx.clear();

        if (f.type === 'plant') {
            // Hexagon
            f.gfx.beginFill(0x00ffaa, 0.75);
            f.gfx.lineStyle(0.5, 0x00ffcc, 0.4 + pulse * 0.4);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const r = 4 * scale;
                i === 0
                    ? f.gfx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                    : f.gfx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            f.gfx.closePath();
            f.gfx.endFill();
            // Inner glow
            f.gfx.beginFill(0xffffff, 0.15 + pulse * 0.1);
            f.gfx.drawCircle(0, 0, 1.5 * scale);
            f.gfx.endFill();
        } else {
            // Diamond (meat)
            const r = 4 * scale;
            f.gfx.beginFill(0xff2055, 0.75);
            f.gfx.lineStyle(0.5, 0xff6688, 0.4 + pulse * 0.4);
            f.gfx.moveTo(0, -r);
            f.gfx.lineTo(r * 0.65, 0);
            f.gfx.lineTo(0, r);
            f.gfx.lineTo(-r * 0.65, 0);
            f.gfx.closePath();
            f.gfx.endFill();
        }

        f.gfx.position.set(f.x, f.y);
    }

    // ── BACKGROUND ────────────────────────────────────────────────────────────
    function buildBackground(worldId) {
        bgLayer.removeChildren();
        gridLayer.removeChildren();

        const conf = WORLDS[worldId];
        const bgColor = conf.bg;
        const accentColor = conf.accent;

        // Grid
        const grid = new PIXI.Graphics();
        const step = 200;
        grid.lineStyle(0.5, 0xffffff, 0.025);
        for (let x = 0; x <= WORLD_W; x += step) {
            grid.moveTo(x, 0); grid.lineTo(x, WORLD_H);
        }
        for (let y = 0; y <= WORLD_H; y += step) {
            grid.moveTo(0, y); grid.lineTo(WORLD_W, y);
        }
        gridLayer.addChild(grid);

        // World boundary glow
        const border = new PIXI.Graphics();
        border.lineStyle(4, accentColor, 0.15);
        border.drawRect(0, 0, WORLD_W, WORLD_H);
        gridLayer.addChild(border);

        // Stars / ambient particles
        bgStars = [];
        for (let i = 0; i < 180; i++) {
            const star = new PIXI.Graphics();
            const sz = Math.random() * 1.8 + 0.3;
            star.beginFill(accentColor, Math.random() * 0.5 + 0.1);
            star.drawCircle(0, 0, sz);
            star.endFill();
            star.x = Math.random() * WORLD_W;
            star.y = Math.random() * WORLD_H;
            bgLayer.addChild(star);
            bgStars.push({ gfx: star, phase: Math.random() * Math.PI * 2, baseAlpha: Math.random() * 0.4 + 0.05 });
        }

        // Large blob decorations
        for (let i = 0; i < 8; i++) {
            const blob = new PIXI.Graphics();
            blob.beginFill(accentColor, 0.015);
            blob.drawCircle(0, 0, 200 + Math.random() * 300);
            blob.endFill();
            blob.x = Math.random() * WORLD_W;
            blob.y = Math.random() * WORLD_H;
            bgLayer.addChild(blob);
        }
    }

    function animateBg(age) {
        for (const s of bgStars) {
            s.gfx.alpha = s.baseAlpha + Math.sin(age * 0.02 + s.phase) * 0.15;
        }
    }

    // ── MINIMAP ───────────────────────────────────────────────────────────────
    const mm = document.getElementById('minimap').getContext('2d');

    function drawMinimap() {
        if (!player || !player.alive) return;
        mm.clearRect(0, 0, MINIMAP_W, MINIMAP_H);

        const sx = MINIMAP_W / WORLD_W;
        const sy = MINIMAP_H / WORLD_H;

        // Background
        mm.fillStyle = '#010612';
        mm.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

        // Food dots
        for (const f of foodItems) {
            if (!f.alive) continue;
            mm.fillStyle = f.type === 'plant' ? '#00ffaa55' : '#ff205555';
            mm.fillRect(f.x * sx - 0.5, f.y * sy - 0.5, 1, 1);
        }

        // Enemies
        for (const e of enemies) {
            if (!e.alive) continue;
            mm.fillStyle = e.diet === 'herbivore' ? '#00ffc877' : '#ff205577';
            mm.beginPath();
            mm.arc(e.x * sx, e.y * sy, 1.5, 0, Math.PI * 2);
            mm.fill();
        }

        // Player
        mm.fillStyle = '#ffffff';
        mm.shadowColor = '#00ffc8';
        mm.shadowBlur = 6;
        mm.beginPath();
        mm.arc(player.x * sx, player.y * sy, 3, 0, Math.PI * 2);
        mm.fill();
        mm.shadowBlur = 0;

        // Viewport rect
        const vw = (app.screen.width  / GS.camZoom) * sx;
        const vh = (app.screen.height / GS.camZoom) * sy;
        const vx = (GS.camX - app.screen.width  / (2 * GS.camZoom)) * sx;
        const vy = (GS.camY - app.screen.height / (2 * GS.camZoom)) * sy;
        mm.strokeStyle = 'rgba(255,255,255,0.2)';
        mm.lineWidth = 0.8;
        mm.strokeRect(vx, vy, vw, vh);
    }

    // ── MUTATION ──────────────────────────────────────────────────────────────
    function showMutationModal() {
        const available = Object.keys(MUTATIONS).filter(k => !player.mutations[k]);
        if (available.length === 0) return;

        // Pick 3 random options
        const shuffled = available.sort(() => Math.random() - 0.5).slice(0, 3);

        const cont = document.getElementById('mut-choices');
        cont.innerHTML = '';

        shuffled.forEach(key => {
            const m = MUTATIONS[key];
            const btn = document.createElement('button');
            btn.className = 'mut-btn';
            btn.innerHTML = `
                <div class="mut-icon" style="background:${m.bg}">
                    <span>${m.icon}</span>
                </div>
                <div class="mut-info">
                    <div class="mut-name" style="color:${m.color}">${m.name}</div>
                    <div class="mut-desc">${m.desc}</div>
                </div>`;
            btn.addEventListener('click', () => {
                player.mutations[key] = true;
                // Tint body with mutation color temporarily
                player.color = parseInt(m.color.replace('#', '0x'));
                player.draw();
                document.getElementById('mutation-modal').classList.add('hidden');
                GS.paused = false;
                sfx(700, 0.3, 'sine');
                pulseRing();
                updateAbilityBar();
                toast(`✦ ${m.name} acquis!`);
            });
            cont.appendChild(btn);
        });

        document.getElementById('mutation-modal').classList.remove('hidden');
        GS.paused = true;
        sfx(440, 0.4, 'triangle');
    }

    function updateAbilityBar() {
        const bar = document.getElementById('ability-bar');
        const keys = Object.keys(player.mutations);
        if (keys.length === 0) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        bar.innerHTML = '';
        keys.forEach(k => {
            const m = MUTATIONS[k];
            const chip = document.createElement('div');
            chip.className = 'ability-chip';
            chip.innerHTML = `<div class="ability-dot" style="background:${m.color}"></div>${m.name}`;
            bar.appendChild(chip);
        });
    }

    // ── WORLD TRANSITION ─────────────────────────────────────────────────────
    function transitionWorld(id) {
        if (GS.world === id) return;
        GS.world = id;
        GS.worldsVisited.add(id);

        const conf = WORLDS[id];
        GS.terrestrial = conf.terrestrial || false;

        // Change renderer background
        app.renderer.backgroundColor = conf.bg;

        // Rebuild background
        buildBackground(id);

        // Reset food
        for (const f of foodItems) removeFood(f);
        foodItems = [];
        spawnFoodBatch(conf.food);

        // Respawn enemies
        clearAllEnemies();
        spawnEnemies(conf.enemies);

        // UI
        document.getElementById('h-biome').textContent = conf.name;

        // Screen flash
        const flash = new PIXI.Graphics();
        flash.beginFill(conf.accent, 0.3);
        flash.drawRect(0, 0, app.screen.width, app.screen.height);
        flash.endFill();
        app.stage.addChild(flash);
        let fa = 0.3;
        const fade = () => {
            fa -= 0.02;
            flash.alpha = fa;
            if (fa <= 0) { app.stage.removeChild(flash); app.ticker.remove(fade); }
        };
        app.ticker.add(fade);

        GS.shakeAmt = 15;
        sfx(250, 0.6, 'sine');
        toast(`🌍 Entrée dans: ${conf.name}`);
    }

    // ── SPAWN ENEMIES ─────────────────────────────────────────────────────────
    function spawnEnemies(count) {
        for (let i = 0; i < count; i++) {
            const diet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
            const size = 8 + Math.random() * 28;
            // Spawn away from player
            let ex, ey;
            do {
                ex = Math.random() * WORLD_W;
                ey = Math.random() * WORLD_H;
            } while (player && Math.hypot(ex - player.x, ey - player.y) < 300);
            const e = getEnemy(ex, ey, size, diet);
            enemies.push(e);
        }
    }

    // ── GAME OVER ─────────────────────────────────────────────────────────────
    function gameOver() {
        GS.running = false;
        GS.paused = true;

        const elapsed = Math.floor((Date.now() - GS.startTime) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;

        document.getElementById('go-size').textContent    = Math.floor(player.size);
        document.getElementById('go-mut').textContent     = Object.keys(player.mutations).length;
        document.getElementById('go-worlds').textContent  = GS.worldsVisited.size;
        document.getElementById('go-kills').textContent   = GS.kills;
        document.getElementById('go-time').textContent    = `${m}m ${s.toString().padStart(2,'0')}s`;

        document.getElementById('gameover-modal').classList.remove('hidden');
        sfx(150, 1.2, 'sawtooth', 0.15);
    }

    // ── STAGE CHECK ───────────────────────────────────────────────────────────
    function checkStage() {
        let stageIdx = 0;
        for (let i = STAGES.length - 1; i >= 0; i--) {
            if (player.size >= STAGES[i].size) { stageIdx = i; break; }
        }
        if (stageIdx > GS.lastStageIdx) {
            GS.lastStageIdx = stageIdx;
            const st = STAGES[stageIdx];
            document.getElementById('stage-txt').textContent = st.name;
            showBanner(st.name, st.sub);
            sfx(600, 0.35, 'triangle');
        }
    }

    // ── START GAME ────────────────────────────────────────────────────────────
    function startGame(diet) {
        initAudio();
        document.getElementById('start-menu').classList.add('hidden');

        player = new Entity(WORLD_W / 2, WORLD_H / 2, MIN_SIZE, diet, true);
        entityLayer.addChild(player.container);

        GS.camX = player.x;
        GS.camY = player.y;
        GS.startTime = Date.now();
        GS.running = true;
        GS.paused = false;
        GS.kills = 0;
        GS.lastStageIdx = 0;

        buildBackground(1);
        spawnFoodBatch(WORLDS[1].food);
        spawnEnemies(WORLDS[1].enemies);

        sfx(550, 0.4, 'sine');
        showBanner('Unicellulaire', 'Organisme primitif');
    }

    // ── DOM READY ─────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {

        // ── PIXI SETUP ────────────────────────────────────────────────────────
        app = new PIXI.Application({
            resizeTo: window,
            backgroundColor: WORLDS[1].bg,
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            autoDensity: true,
            antialias: true,
            powerPreference: 'high-performance'
        });

        document.getElementById('game-container').appendChild(app.view);

        // Layers
        worldContainer = new PIXI.Container();
        bgLayer    = new PIXI.Container();
        gridLayer  = new PIXI.Container();
        foodLayer  = new PIXI.Container();
        entityLayer= new PIXI.Container();
        fxLayer    = new PIXI.Container();
        fxLayer.blendMode = PIXI.BLEND_MODES.ADD;

        worldContainer.addChild(bgLayer, gridLayer, foodLayer, entityLayer, fxLayer);
        app.stage.addChild(worldContainer);

        // Mouse tracking
        window.addEventListener('mousemove', e => {
            GS.mouseX = e.clientX;
            GS.mouseY = e.clientY;
        });

        // Touch support
        window.addEventListener('touchmove', e => {
            e.preventDefault();
            GS.mouseX = e.touches[0].clientX;
            GS.mouseY = e.touches[0].clientY;
        }, { passive: false });

        // ── BUTTONS ───────────────────────────────────────────────────────────
        document.getElementById('btn-herb').addEventListener('click', () => startGame('herbivore'));
        document.getElementById('btn-carn').addEventListener('click', () => startGame('carnivore'));

        document.getElementById('btn-pause').addEventListener('click', () => {
            GS.paused = !GS.paused;
            document.getElementById('btn-pause').textContent = GS.paused ? '▶ Reprendre' : '⏸ Pause';
        });

        document.getElementById('btn-mute').addEventListener('click', () => {
            GS.muted = !GS.muted;
            document.getElementById('btn-mute').textContent = GS.muted ? '🔇 Muet' : '🔊 Son';
        });

        document.getElementById('btn-info').addEventListener('click', () => {
            document.getElementById('info-modal').classList.toggle('hidden');
        });
        document.getElementById('info-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('info-modal'))
                document.getElementById('info-modal').classList.add('hidden');
        });

        // ── MAIN LOOP ─────────────────────────────────────────────────────────
        let mutationCooldown = 0;

        app.ticker.add((ticker) => {
            if (!GS.running || GS.paused || !player) return;

            const dt = Math.min(ticker.deltaTime, 4); // cap delta for stability
            GS.age += dt;
            mutationCooldown = Math.max(0, mutationCooldown - dt);

            // ── PLAYER MOVEMENT ───────────────────────────────────────────────
            const worldMX = (GS.mouseX - app.screen.width  / 2) / GS.camZoom + GS.camX;
            const worldMY = (GS.mouseY - app.screen.height / 2) / GS.camZoom + GS.camY;
            player.update(dt, worldMX, worldMY);

            if (!player.alive) { gameOver(); return; }

            // ── ENEMY AI ──────────────────────────────────────────────────────
            // FIX #7: enemy flee correctly uses inverted direction
            for (let i = enemies.length - 1; i >= 0; i--) {
                const e = enemies[i];
                if (!e.alive) { releaseEnemy(e); enemies.splice(i, 1); continue; }

                const dx = player.x - e.x;
                const dy = player.y - e.y;
                const dist = Math.hypot(dx, dy);

                let tx = null, ty = null;

                // Respawn wandering AI target
                e.aiChangeTimer -= dt;
                if (e.aiChangeTimer <= 0) {
                    e.aiChangeTimer = 120 + Math.random() * 180;
                    e.aiTarget.x = Math.random() * WORLD_W;
                    e.aiTarget.y = Math.random() * WORLD_H;
                }

                if (dist < 350) {
                    const camo = player.mutations.camouflage ? 0.55 : 1;

                    if (e.diet === 'carnivore' && e.size > player.size * 0.85 && Math.random() > 0.02) {
                        // Chase player
                        tx = player.x * camo + e.x * (1 - camo);
                        ty = player.y * camo + e.y * (1 - camo);
                    } else if (e.size < player.size * 1.3) {
                        // Flee: move in opposite direction — FIX #7
                        tx = e.x - dx * 0.8;
                        ty = e.y - dy * 0.8;
                    } else {
                        tx = e.aiTarget.x;
                        ty = e.aiTarget.y;
                    }
                } else {
                    tx = e.aiTarget.x;
                    ty = e.aiTarget.y;
                }

                e.update(dt, tx, ty);

                // Collision with player
                if (dist < player.size + e.size - 2) {
                    if (player.size > e.size * 1.15) {
                        // Player eats enemy
                        player.eat('meat', e.size * 0.35);
                        GS.kills++;
                        spawnBurst(e.x, e.y, e.color, 12, 200);
                        sfx(280, 0.15, 'triangle');
                        GS.shakeAmt = 5;
                        releaseEnemy(e);
                        enemies.splice(i, 1);

                        // Respawn replacement after delay
                        setTimeout(() => {
                            if (!GS.running) return;
                            const conf = WORLDS[GS.world];
                            const diet2 = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
                            const sz2 = 8 + Math.random() * 24;
                            let rx = Math.random() * WORLD_W;
                            let ry = Math.random() * WORLD_H;
                            const ne = getEnemy(rx, ry, sz2, diet2);
                            enemies.push(ne);
                        }, 3000);
                    } else if (e.size > player.size * 1.2 && e.diet === 'carnivore') {
                        // Enemy damages player
                        const dmg = e.getStats().damage * 4;
                        player.takeDamage(dmg);
                        GS.shakeAmt = 8;
                        sfx(140, 0.2, 'sawtooth', 0.2);
                    }
                }
            }

            // ── FOOD ──────────────────────────────────────────────────────────
            const pStats = player.getStats();
            const magnetR = player.size * pStats.magnet;
            const eaten = [];

            for (let i = 0; i < foodItems.length; i++) {
                const f = foodItems[i];
                if (!f.alive) continue;

                drawFood(f, GS.age);

                const fdx = f.x - player.x;
                const fdy = f.y - player.y;
                const fd  = Math.hypot(fdx, fdy);

                // Magnet pull (FIX: only compatible food)
                if (fd < magnetR) {
                    const compat = (player.diet === 'herbivore' && f.type === 'plant') ||
                                   (player.diet === 'carnivore' && f.type === 'meat');
                    if (compat && fd > 0) {
                        f.x -= (fdx / fd) * 12 * dt;
                        f.y -= (fdy / fd) * 12 * dt;
                    }
                }

                // Eat on contact
                if (fd < player.size + 3) {
                    if (player.eat(f.type, 1)) {
                        eaten.push(i);
                        sfx(500 + Math.random() * 100, 0.07, 'sine', 0.12);
                    }
                }
            }

            // FIX #2 & #11: remove eaten food without index drift
            for (let i = eaten.length - 1; i >= 0; i--) {
                const idx = eaten[i];
                removeFood(foodItems[idx]);
                foodItems.splice(idx, 1);
                // Respawn elsewhere
                const type = Math.random() > 0.42 ? 'plant' : 'meat';
                makeFood(type);
            }

            // ── PROGRESSION ───────────────────────────────────────────────────
            const mutThreshold = 18 + Object.keys(player.mutations).length * 22;
            if (player.targetSize > mutThreshold && mutationCooldown <= 0) {
                mutationCooldown = 300; // prevent repeated trigger
                showMutationModal();
            }

            checkStage();

            // World transitions
            for (const [id, conf] of Object.entries(WORLDS)) {
                const wid = parseInt(id);
                if (wid > GS.world && player.size >= conf.unlockSize) {
                    transitionWorld(wid);
                    break;
                }
            }

            // ── PARTICLES ─────────────────────────────────────────────────────
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.update(dt);
                if (!p.alive) {
                    if (p.gfx.parent) p.gfx.parent.removeChild(p.gfx);
                    particles.splice(i, 1);
                }
            }

            // ── BACKGROUND ANIMATION ──────────────────────────────────────────
            animateBg(GS.age);

            // ── CAMERA ────────────────────────────────────────────────────────
            // FIX #6: normalized camera lerp (not dependent on raw delta)
            const targetZoom = Math.max(0.18, 22 / Math.max(player.size, 1));
            GS.camZoom += (targetZoom - GS.camZoom) * 0.06;

            GS.camX += (player.x - GS.camX) * 0.1;
            GS.camY += (player.y - GS.camY) * 0.1;

            let cx = GS.camX;
            let cy = GS.camY;

            if (GS.shakeAmt > 0.2) {
                cx += (Math.random() - 0.5) * GS.shakeAmt;
                cy += (Math.random() - 0.5) * GS.shakeAmt;
                GS.shakeAmt *= 0.84;
            }

            worldContainer.pivot.set(cx, cy);
            worldContainer.position.set(app.screen.width / 2, app.screen.height / 2);
            worldContainer.scale.set(GS.camZoom);

            // FIX #12: parallax bgLayer uses relative offset
            bgLayer.pivot.set(cx * 0.06, cy * 0.06);

            // ── HUD UPDATE ────────────────────────────────────────────────────
            document.getElementById('h-size').textContent = Math.floor(player.size);
            document.getElementById('h-fps').textContent  = Math.round(app.ticker.FPS);
            document.getElementById('h-hp-bar').style.width    = Math.max(0, player.hp)    + '%';
            document.getElementById('h-hunger-bar').style.width= Math.max(0, player.hunger) + '%';

            // Color HP bar by level
            const hpPct = player.hp / player.maxHp;
            document.getElementById('h-hp-bar').style.background =
                hpPct > 0.6 ? 'linear-gradient(90deg,#00ffc8,#22d3ee)' :
                hpPct > 0.3 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                               'linear-gradient(90deg,#ff2055,#ff6088)';

            const pct = Math.min(100, (player.size / 200) * 100);
            document.getElementById('prog-fill').style.width = pct + '%';
            document.getElementById('prog-pct').textContent  = Math.floor(pct) + '%';

            // Minimap
            drawMinimap();
        });
    });
})();
