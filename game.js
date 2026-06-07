// ============================================================================
// EVOSPHERE v3.1 — ALL BUGS FIXED + AAA VISUALS
// ============================================================================
(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════════
    // CONSTANTES
    // ══════════════════════════════════════════════════════════════════════
    const WORLD_W  = 5000;
    const WORLD_H  = 5000;
    const MIN_SIZE = 10;
    const MAX_SIZE = 260;
    const MM_W = 148, MM_H = 148;

    const WORLDS = {
        1: { name:'Abysse Primordiale',  bg:0x030812, accent:0x00ffc8, food:280, enemies:18, unlockSize:0,   enemySizeRange:[6,22]  },
        2: { name:'Récif Biolumineux',   bg:0x010e1a, accent:0x00aaff, food:340, enemies:26, unlockSize:48,  enemySizeRange:[8,30]  },
        3: { name:'Épave Abyssale',      bg:0x0c0d14, accent:0xff6b9d, food:310, enemies:33, unlockSize:82,  enemySizeRange:[10,38] },
        4: { name:'Zone Thermale',       bg:0x160b06, accent:0xffaa00, food:260, enemies:42, unlockSize:118, enemySizeRange:[12,45] },
        5: { name:'Biosphère Terrestre', bg:0x0a1208, accent:0x55ff44, food:420, enemies:52, unlockSize:158, enemySizeRange:[14,52], terrestrial:true }
    };

    const STAGES = [
        { size:0,   name:'Unicellulaire',      sub:'Organisme primitif'       },
        { size:28,  name:'Multicellulaire',    sub:'Division cellulaire'      },
        { size:52,  name:'Invertébré',         sub:'Première colonie'         },
        { size:88,  name:'Créature Primitive', sub:'Vertèbres embryonnaires'  },
        { size:128, name:'Créature Évoluée',   sub:'Système nerveux complexe' },
        { size:168, name:'Apex Predator',      sub:'Maître de l\'évolution'   },
        { size:220, name:'ÊTRE SUPRÊME',       sub:'L\'évolution accomplie'   }
    ];

    const MUTATIONS = {
        flagella:       { name:'Flagelle',         icon:'🌀', color:'#ffaa00', speedMult:1.4,  desc:'+40% vitesse de déplacement'  },
        spike:          { name:'Épine Venimeuse',  icon:'⚡', color:'#ff2055', damageMult:1.7, desc:'+70% dégâts en combat'        },
        shield:         { name:'Cuticule',         icon:'🛡', color:'#6b9ef5', defenseMult:1.6,desc:'+60% résistance aux dégâts'   },
        neuron:         { name:'Neurone Étendu',   icon:'🔮', color:'#a78bfa', magnetMult:2.0, desc:'+100% rayon de détection'     },
        chemosynthesis: { name:'Chimiosynthèse',   icon:'💚', color:'#00ffcc', foodEff:1.7,    desc:'+70% assimilation nutriments' },
        camouflage:     { name:'Camouflage',       icon:'👁', color:'#cbd5e1', camo:true,      desc:'Réduit l\'aggro ennemis -60%' },
        regeneration:   { name:'Régénération',     icon:'❤️', color:'#22d3ee', regenRate:0.6,  desc:'Régénère PV hors combat'      },
        toxin:          { name:'Toxine Mortelle',  icon:'☣️', color:'#7eff00', poisonDmg:0.8,  desc:'Empoisonne les ennemis proches'},
        sonar:          { name:'Sonar Biologique', icon:'📡', color:'#00d4ff', sonar:true,     desc:'Révèle et ralentit les ennemis'}
    };

    // ══════════════════════════════════════════════════════════════════════
    // ÉTAT GLOBAL
    // ══════════════════════════════════════════════════════════════════════
    let app, worldContainer, bgLayer, gridLayer, foodLayer, entityLayer, fxLayer;
    let player   = null;
    let enemies  = [];
    let foodItems = [];
    let particles = [];
    let bgStars  = [];

    // Pool d'entités
    const pool = { inactive: [], active: [] };

    const GS = {
        running: false, paused: false, muted: false,
        age: 0,
        camX: WORLD_W / 2, camY: WORLD_H / 2,
        camZoom: 1, targetZoom: 1,
        shakeAmt: 0,
        mouseX: 0, mouseY: 0,
        world: 1, worldsVisited: new Set([1]),
        terrestrial: false,
        kills: 0, score: 0, startTime: 0,
        lastStageIdx: 0,
        mutCooldown: 0,
        totalFoodEaten: 0,
        lastKillTime: 0,
        comboKills: 0,
        foodRespawnTimer: 0,
        dietChosen: null
    };

    // ══════════════════════════════════════════════════════════════════════
    // CURSEUR CUSTOM
    // ══════════════════════════════════════════════════════════════════════
    const cursorEl = document.getElementById('custom-cursor');
    window.addEventListener('mousemove', e => {
        GS.mouseX = e.clientX;
        GS.mouseY = e.clientY;
        if (cursorEl) { cursorEl.style.left = e.clientX + 'px'; cursorEl.style.top = e.clientY + 'px'; }
    });

    // ══════════════════════════════════════════════════════════════════════
    // AUDIO
    // ══════════════════════════════════════════════════════════════════════
    let audioCtx = null;
    let ambientGain = null;

    function initAudio() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            startAmbient();
        } catch (_) {}
    }

    function startAmbient() {
        if (!audioCtx || GS.muted) return;
        try {
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            ambientGain = audioCtx.createGain();
            osc1.connect(ambientGain);
            osc2.connect(ambientGain);
            ambientGain.connect(audioCtx.destination);
            osc1.type = 'sine';
            osc1.frequency.value = 55;
            osc2.type = 'sine';
            osc2.frequency.value = 82.4;
            ambientGain.gain.value = 0.018;
            osc1.start(); osc2.start();
        } catch (_) {}
    }

    function sfx(freq, dur, type = 'sine', vol = 0.18, sweep = 0.4) {
        if (GS.muted || !audioCtx) return;
        try {
            const t = audioCtx.currentTime;
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.connect(g); g.connect(audioCtx.destination);
            o.type = type;
            o.frequency.setValueAtTime(freq, t);
            o.frequency.exponentialRampToValueAtTime(Math.max(1, freq * sweep), t + dur);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.start(t); o.stop(t + dur + 0.01);
        } catch (_) {}
    }

    function sfxEat()   { sfx(550 + Math.random() * 120, 0.07, 'sine', 0.08, 0.65); }
    function sfxKill()  { sfx(320, 0.14, 'triangle', 0.16, 0.28); sfx(200, 0.2, 'sawtooth', 0.07, 0.18); }
    function sfxHurt()  { sfx(140, 0.2, 'sawtooth', 0.2, 0.14); }
    function sfxLevel() { sfx(550, 0.12, 'sine', 0.15, 1.1); setTimeout(() => sfx(770, 0.18, 'sine', 0.11, 1.05), 100); }
    function sfxMut()   { sfx(440, 0.12, 'triangle', 0.13); setTimeout(() => sfx(660, 0.22, 'sine', 0.1, 1.2), 80); }
    function sfxWorld() { sfx(200, 0.5, 'sine', 0.13, 0.55); setTimeout(() => sfx(320, 0.35, 'triangle', 0.07, 0.65), 120); }
    function sfxDie()   { sfx(130, 1.4, 'sawtooth', 0.16, 0.1); }

    // ══════════════════════════════════════════════════════════════════════
    // UI HELPERS
    // ══════════════════════════════════════════════════════════════════════
    let toastTimer = null;
    function toast(msg, color = '#fbbf24') {
        const el = document.getElementById('notif');
        if (!el) return;
        el.textContent = msg;
        el.style.background = color;
        el.style.color = (color === '#fbbf24' || color === '#f59e0b') ? '#000' : '#fff';
        el.style.boxShadow = `0 4px 30px ${color}55`;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
    }

    let bannerTimer = null;
    function showBanner(name, sub) {
        const el = document.getElementById('stage-banner');
        if (!el) return;
        document.getElementById('sb-name').textContent = name;
        document.getElementById('sb-sub').textContent  = sub;
        el.classList.add('show');
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => el.classList.remove('show'), 3200);
    }

    function pulseRing(color = '#00ffc8') {
        const el = document.getElementById('pulse-ring');
        if (!el) return;
        el.style.borderColor = color;
        el.style.boxShadow   = `0 0 30px ${color}88`;
        el.style.animation   = 'none';
        void el.offsetWidth;
        el.style.animation = 'pulse-expand 0.8s ease-out forwards';
    }

    function addKillFeed(msg) {
        const feed = document.getElementById('killfeed');
        if (!feed) return;
        const entry = document.createElement('div');
        entry.className = 'kill-entry';
        entry.textContent = msg;
        feed.appendChild(entry);
        setTimeout(() => { if (entry.parentNode) entry.parentNode.removeChild(entry); }, 2300);
    }

    function spawnDmgText(screenX, screenY, text, color = '#ff2055') {
        const el = document.createElement('div');
        el.className = 'dmg-text';
        el.textContent = text;
        el.style.color = color;
        el.style.left  = screenX + 'px';
        el.style.top   = screenY + 'px';
        document.body.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
    }

    function spawnScorePop(screenX, screenY, text) {
        const el = document.createElement('div');
        el.className = 'score-pop';
        el.textContent = text;
        el.style.left = screenX + 'px';
        el.style.top  = (screenY - 24) + 'px';
        document.body.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1500);
    }

    // Convertit coordonnées monde → écran
    function worldToScreen(wx, wy) {
        if (!app) return { x: 0, y: 0 };
        return {
            x: (wx - GS.camX) * GS.camZoom + app.screen.width  / 2,
            y: (wy - GS.camY) * GS.camZoom + app.screen.height / 2
        };
    }

    // ══════════════════════════════════════════════════════════════════════
    // PARTICULES
    // ══════════════════════════════════════════════════════════════════════
    class Particle {
        constructor(x, y, vx, vy, color, size, life) {
            this.x = x; this.y = y;
            this.vx = vx; this.vy = vy;
            this.color = color; this.size = size;
            this.life = life; this.maxLife = life;
            this.alive = true;
            this.gfx = new PIXI.Graphics();
            this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
            fxLayer.addChild(this.gfx);
        }
        update(dt) {
            this.x  += this.vx * dt * 0.016;
            this.y  += this.vy * dt * 0.016;
            this.vx *= 0.88; this.vy *= 0.88;
            this.life -= dt;
            if (this.life <= 0) { this.alive = false; this.gfx.clear(); return; }
            const a = Math.max(0, this.life / this.maxLife);
            this.gfx.clear();
            this.gfx.beginFill(this.color, a * 0.85);
            this.gfx.drawCircle(0, 0, this.size * (0.15 + a * 0.85));
            this.gfx.endFill();
            this.gfx.x = this.x; this.gfx.y = this.y;
        }
        destroy() {
            this.alive = false;
            if (this.gfx.parent) this.gfx.parent.removeChild(this.gfx);
            this.gfx.destroy();
        }
    }

    function spawnBurst(x, y, color, count = 14, speed = 200) {
        for (let i = 0; i < count; i++) {
            const a  = (i / count) * Math.PI * 2 + Math.random() * 0.3;
            const sp = speed * (0.35 + Math.random() * 0.65);
            particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
                color, 2.2 + Math.random() * 3.8, 30 + Math.random() * 25));
        }
    }

    function spawnTrail(x, y, color, count = 3) {
        for (let i = 0; i < count; i++) {
            const a  = Math.random() * Math.PI * 2;
            const sp = 15 + Math.random() * 35;
            particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
                color, 0.8 + Math.random() * 1.8, 10 + Math.random() * 8));
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ENTITÉ
    // ══════════════════════════════════════════════════════════════════════
    class Entity {
        constructor(x, y, size, diet, isPlayer = false) {
            this.isPlayer = isPlayer;
            this.x = x; this.y = y;
            this.vx = 0; this.vy = 0;
            this.size = size; this.targetSize = size;
            this.diet = diet;
            this.mutations = {};
            this.hp = 100; this.maxHp = 100;
            this.hunger = 100;
            this.alive = true;
            this.poisoned = false; this.poisonTimer = 0; this._poisonDmg = 0.3;
            this.color = diet === 'herbivore' ? 0x00ffcc : 0xff2055;
            this.wiggle = Math.random() * Math.PI * 2;
            this.lastDamagedAge = -99999;
            this.aiTarget = { x: Math.random() * WORLD_W, y: Math.random() * WORLD_H };
            this.aiTimer = 0;
            this.drawTick = 0;

            this.container = new PIXI.Container();
            this.glowGfx   = new PIXI.Graphics();
            this.body      = new PIXI.Graphics();
            this.eyeGfx    = new PIXI.Graphics();
            this.container.addChild(this.glowGfx, this.body, this.eyeGfx);
            this.draw();
        }

        getBonus(stat) {
            for (const [key, def] of Object.entries(MUTATIONS)) {
                if (this.mutations[key] && def[stat]) return def[stat];
            }
            return 1;
        }

        getStats() {
            const base = this.diet === 'herbivore' ? 0.44 : 0.68;
            const sf   = Math.sqrt(MIN_SIZE / Math.max(this.size, MIN_SIZE));
            return {
                speed:   base * this.getBonus('speedMult') * sf,
                magnet:  (this.diet === 'herbivore' ? 8.5 : 2.8) * this.getBonus('magnetMult'),
                damage:  (this.diet === 'carnivore' ? 1.5 : 0.5) * this.getBonus('damageMult'),
                defense: this.getBonus('defenseMult'),
                foodEff: this.getBonus('foodEff') || 1,
                regen:   this.mutations.regeneration ? MUTATIONS.regeneration.regenRate : 0,
                poison:  this.mutations.toxin ? MUTATIONS.toxin.poisonDmg : 0
            };
        }

        draw() {
            if (!this.body) return;
            this.body.clear();
            this.eyeGfx.clear();
            this.glowGfx.clear();

            const s  = this.size;
            const mc = Object.keys(this.mutations).length;
            const c  = this.color;

            // Glow externe
            this.glowGfx.beginFill(c, 0.04);
            this.glowGfx.drawCircle(0, 0, s * 2.4);
            this.glowGfx.endFill();
            this.glowGfx.beginFill(c, 0.08);
            this.glowGfx.drawCircle(0, 0, s * 1.65);
            this.glowGfx.endFill();

            // Corps
            this.body.lineStyle(mc > 0 ? 1.4 : 0.8, 0xffffff, 0.18);
            this.body.beginFill(c, 0.93);

            if (this.diet === 'carnivore') {
                this._drawStar(s, 5 + Math.min(mc, 4));
            } else {
                this.body.drawCircle(0, 0, s);
                if (mc > 0) {
                    this.body.beginFill(0xffffff, 0.07);
                    this.body.drawCircle(0, 0, s * 0.42);
                }
            }
            this.body.endFill();

            // Reflet principal
            this.body.beginFill(0xffffff, 0.18);
            this.body.drawEllipse(-s * 0.22, -s * 0.28, s * 0.28, s * 0.16);
            this.body.endFill();

            // Effets de mutations
            this._drawMutationEffects(s, mc);

            // Œil
            this._drawEye(s);
        }

        _drawMutationEffects(s, mc) {
            if (this.mutations.flagella) {
                this.body.lineStyle(1.6, 0xffaa00, 0.72);
                for (let i = 0; i < 4; i++) {
                    const ang = Math.PI * 0.75 + (i - 1.5) * 0.52;
                    const len = s * (2.4 + Math.sin(GS.age * 0.04 + i * 1.2) * 0.45);
                    this.body.moveTo(Math.cos(ang) * s * 0.82, Math.sin(ang) * s * 0.82);
                    this.body.bezierCurveTo(
                        Math.cos(ang) * len * 0.38, Math.sin(ang) * len * 0.38 + s * 0.28,
                        Math.cos(ang) * len * 0.75, Math.sin(ang) * len * 0.75 - s * 0.2,
                        Math.cos(ang) * len, Math.sin(ang) * len
                    );
                }
                this.body.lineStyle(0);
            }
            if (this.mutations.spike) {
                for (let i = 0; i < 8; i++) {
                    const ang = (i / 8) * Math.PI * 2;
                    this.body.beginFill(0xff2055, 0.95);
                    this.body.moveTo(Math.cos(ang + 0.11) * s * 0.9, Math.sin(ang + 0.11) * s * 0.9);
                    this.body.lineTo(Math.cos(ang) * s * 1.72, Math.sin(ang) * s * 1.72);
                    this.body.lineTo(Math.cos(ang - 0.11) * s * 0.9, Math.sin(ang - 0.11) * s * 0.9);
                    this.body.endFill();
                }
            }
            if (this.mutations.shield) {
                this.body.lineStyle(1.4, 0x6b9ef5, 0.45);
                this.body.beginFill(0x6b9ef5, 0.05);
                this.body.drawCircle(0, 0, s * 1.22);
                this.body.endFill();
                this.body.lineStyle(0);
            }
            if (this.mutations.toxin) {
                for (let i = 0; i < 5; i++) {
                    const ang = (i / 5) * Math.PI * 2;
                    this.body.beginFill(0x7eff00, 0.88);
                    this.body.drawCircle(Math.cos(ang) * s * 1.08, Math.sin(ang) * s * 1.08, s * 0.11);
                    this.body.endFill();
                }
            }
            if (this.mutations.camouflage) {
                this.body.alpha = this.isPlayer ? 0.5 : 0.35;
            } else {
                this.body.alpha = 1;
            }
        }

        _drawEye(s) {
            const ex = s * 0.34, ey = -s * 0.18;
            this.eyeGfx.beginFill(0xffffff, 0.96);
            this.eyeGfx.drawCircle(ex, ey, s * 0.19);
            this.eyeGfx.endFill();
            this.eyeGfx.beginFill(this.diet === 'herbivore' ? 0x00aa66 : 0xcc1133, 0.92);
            this.eyeGfx.drawCircle(ex + s * 0.04, ey + s * 0.02, s * 0.12);
            this.eyeGfx.endFill();
            this.eyeGfx.beginFill(0x000000, 1);
            this.eyeGfx.drawCircle(ex + s * 0.05, ey + s * 0.025, s * 0.07);
            this.eyeGfx.endFill();
            this.eyeGfx.beginFill(0xffffff, 0.85);
            this.eyeGfx.drawCircle(ex + s * 0.02, ey - s * 0.05, s * 0.036);
            this.eyeGfx.endFill();
        }

        _drawStar(r, pts) {
            const inner = r * 0.52;
            const step  = (Math.PI * 2) / (pts * 2);
            this.body.moveTo(0, -r);
            for (let i = 1; i < pts * 2; i++) {
                const rad = i % 2 === 0 ? r : inner;
                const a   = i * step - Math.PI / 2;
                this.body.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
            }
            this.body.closePath();
        }

        eat(type, amt = 1) {
            const ok = (this.diet === 'herbivore' && type === 'plant') ||
                       (this.diet === 'carnivore' && type === 'meat');
            if (!ok) return false;
            const eff = this.getStats().foodEff;
            this.targetSize = Math.min(MAX_SIZE, this.targetSize + amt * eff * 0.55);
            this.hunger = Math.min(100, this.hunger + 22 * eff);
            return true;
        }

        eatEnemy(enemySize) {
            const eff = this.getStats().foodEff;
            this.targetSize = Math.min(MAX_SIZE, this.targetSize + enemySize * 0.28 * eff);
            this.hunger = Math.min(100, this.hunger + 32 * eff);
        }

        takeDamage(amt) {
            const dmg = Math.max(0.05, amt / this.getStats().defense);
            this.hp = Math.max(0, this.hp - dmg);
            this.lastDamagedAge = GS.age;
            if (this.hp <= 0) this.alive = false;
            return dmg;
        }

        poison(dmgPerFrame) {
            this.poisoned    = true;
            this.poisonTimer = 180;
            this._poisonDmg  = dmgPerFrame;
        }

        reset(x, y, size, diet) {
            this.x = x; this.y = y;
            this.vx = 0; this.vy = 0;
            this.size = size; this.targetSize = size;
            this.diet = diet; this.mutations = {};
            this.hp = 100; this.maxHp = 100; this.hunger = 100;
            this.alive = true;
            this.poisoned = false; this.poisonTimer = 0;
            this.lastDamagedAge = -99999;
            this.aiTimer = 0;
            this.color = diet === 'herbivore' ? 0x00ffcc : 0xff2055;
            if (this.body) this.body.alpha = 1;
            this.draw();
        }

        update(dt, tx = null, ty = null) {
            if (!this.alive) return;

            // Faim
            this.hunger = Math.max(0, this.hunger - 0.065 * dt);
            if (this.hunger < 10) this.takeDamage(0.18 * dt);

            // Poison
            if (this.poisoned) {
                this.poisonTimer -= dt;
                this.takeDamage(this._poisonDmg * dt);
                if (this.poisonTimer <= 0) { this.poisoned = false; if (this.body) this.body.tint = 0xffffff; }
                else if (this.body) this.body.tint = (Math.sin(GS.age * 0.28) > 0) ? 0x7eff00 : 0xffffff;
            } else {
                if (this.body) this.body.tint = 0xffffff;
            }

            // Régénération (joueur hors combat)
            if (this.isPlayer) {
                const st = this.getStats();
                const timeSinceDmg = (GS.age - this.lastDamagedAge) * 0.016;
                if (st.regen > 0 && timeSinceDmg > 4) {
                    this.hp = Math.min(this.maxHp, this.hp + st.regen * dt);
                }
            }

            // Croissance lissée
            if (this.size < this.targetSize) {
                const delta = Math.min(0.2 * dt, this.targetSize - this.size);
                this.size += delta;
                this.drawTick += delta;
                if (this.drawTick > 0.6) { this.drawTick = 0; this.draw(); }
            }

            // Mouvement
            if (tx !== null && ty !== null) {
                const dx = tx - this.x, dy = ty - this.y;
                const d  = Math.sqrt(dx * dx + dy * dy);
                if (d > 2) {
                    const sp = this.getStats().speed * 0.088;
                    this.vx += (dx / d) * sp * dt;
                    this.vy += (dy / d) * sp * dt;
                }
            }

            // Friction
            const fr = GS.terrestrial ? 0.78 : 0.90;
            this.vx *= fr; this.vy *= fr;
            this.x  += this.vx * dt;
            this.y  += this.vy * dt;

            // Limites du monde
            this.x = Math.max(this.size + 4, Math.min(WORLD_W - this.size - 4, this.x));
            this.y = Math.max(this.size + 4, Math.min(WORLD_H - this.size - 4, this.y));

            // Render
            if (this.container) {
                this.container.x = this.x;
                this.container.y = this.y;

                const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (spd > 1.5) {
                    this.container.rotation = Math.atan2(this.vy, this.vx);
                    const stretch = 1 + Math.min(spd, 14) * 0.009;
                    this.body.scale.set(stretch, 1 / stretch);
                } else {
                    this.wiggle += 0.022 * dt;
                    const b = Math.sin(this.wiggle) * 0.013;
                    this.body.scale.set(1 + b, 1 - b);
                    this.container.rotation *= 0.88;
                }

                if (this.isPlayer) {
                    this.container.alpha = 0.65 + (this.hp / this.maxHp) * 0.35;
                }
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // POOL D'ENTITÉS
    // ══════════════════════════════════════════════════════════════════════
    function getEnemy(x, y, size, diet) {
        let e;
        if (pool.inactive.length > 0) {
            e = pool.inactive.pop();
            e.reset(x, y, size, diet);
        } else {
            e = new Entity(x, y, size, diet, false);
        }
        if (!e.container.parent) entityLayer.addChild(e.container);
        pool.active.push(e);
        return e;
    }

    function releaseEnemy(e) {
        // Évite double-release
        const idxA = pool.active.indexOf(e);
        if (idxA !== -1) pool.active.splice(idxA, 1);

        const idxI = pool.inactive.indexOf(e);
        if (idxI === -1) {
            e.alive = false;
            if (e.container.parent) e.container.parent.removeChild(e.container);
            pool.inactive.push(e);
        }
    }

    function clearAllEnemies() {
        for (const e of [...pool.active]) {
            if (e.container.parent) e.container.parent.removeChild(e.container);
            pool.inactive.push(e);
        }
        pool.active = [];
        enemies = [];
    }

    // ══════════════════════════════════════════════════════════════════════
    // NOURRITURE
    // ══════════════════════════════════════════════════════════════════════
    const foodGfxPool = [];

    function getFoodGfx() { return foodGfxPool.pop() || new PIXI.Graphics(); }
    function releaseFoodGfx(gfx) {
        gfx.clear();
        if (gfx.parent) gfx.parent.removeChild(gfx);
        foodGfxPool.push(gfx);
    }

    function makeFood(type, x, y) {
        const g = getFoodGfx();
        foodLayer.addChild(g);
        const f = {
            x: x !== undefined ? x : Math.random() * (WORLD_W - 200) + 100,
            y: y !== undefined ? y : Math.random() * (WORLD_H - 200) + 100,
            type, gfx: g,
            phase: Math.random() * Math.PI * 2,
            alive: true, age: 0
        };
        drawFoodItem(f, 0);
        return f;
    }

    function removeFood(f) {
        f.alive = false;
        releaseFoodGfx(f.gfx);
    }

    function spawnFoodBatch(n) {
        for (let i = 0; i < n; i++) {
            foodItems.push(makeFood(Math.random() > 0.45 ? 'plant' : 'meat'));
        }
    }

    function drawFoodItem(f, age) {
        const sc = 1 + Math.sin(age * 0.055 + f.phase) * 0.2;
        const p  = Math.sin(age * 0.038 + f.phase) * 0.5 + 0.5;
        f.gfx.clear();

        if (f.type === 'plant') {
            const r = 4.8 * sc;
            f.gfx.lineStyle(0.7, 0x00ffcc, 0.45 + p * 0.38);
            f.gfx.beginFill(0x00ffaa, 0.84);
            f.gfx.moveTo(r, 0);
            for (let i = 1; i <= 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                f.gfx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            f.gfx.closePath(); f.gfx.endFill();
            f.gfx.beginFill(0xffffff, 0.2 + p * 0.1);
            f.gfx.drawCircle(0, 0, 1.6 * sc); f.gfx.endFill();
        } else {
            const r = 4.8 * sc;
            f.gfx.lineStyle(0.7, 0xff6688, 0.45 + p * 0.38);
            f.gfx.beginFill(0xff2055, 0.84);
            f.gfx.moveTo(0, -r);
            f.gfx.lineTo(r * 0.62, 0);
            f.gfx.lineTo(0, r);
            f.gfx.lineTo(-r * 0.62, 0);
            f.gfx.closePath(); f.gfx.endFill();
            f.gfx.beginFill(0xffffff, 0.16 + p * 0.08);
            f.gfx.drawCircle(-0.8, -1.4, 1.1); f.gfx.endFill();
        }
        f.gfx.x = f.x; f.gfx.y = f.y;
    }

    function isVisible(x, y, margin = 70) {
        if (!app) return true;
        const hw = (app.screen.width  / 2) / GS.camZoom;
        const hh = (app.screen.height / 2) / GS.camZoom;
        return Math.abs(x - GS.camX) < hw + margin &&
               Math.abs(y - GS.camY) < hh + margin;
    }

    // ══════════════════════════════════════════════════════════════════════
    // BACKGROUND
    // ══════════════════════════════════════════════════════════════════════
    function buildBackground(wid) {
        bgLayer.removeChildren();
        gridLayer.removeChildren();
        bgStars = [];
        const conf = WORLDS[wid];

        // Grille
        const g = new PIXI.Graphics();
        g.lineStyle(0.35, 0xffffff, 0.018);
        for (let x = 0; x <= WORLD_W; x += 200) { g.moveTo(x, 0); g.lineTo(x, WORLD_H); }
        for (let y = 0; y <= WORLD_H; y += 200) { g.moveTo(0, y); g.lineTo(WORLD_W, y); }
        gridLayer.addChild(g);

        // Bordure + coins
        const b = new PIXI.Graphics();
        b.lineStyle(4, conf.accent, 0.18);
        b.drawRect(0, 0, WORLD_W, WORLD_H);
        b.lineStyle(2.5, conf.accent, 0.48);
        [[0,0],[WORLD_W,0],[0,WORLD_H],[WORLD_W,WORLD_H]].forEach(([cx, cy]) => {
            const sx = cx === 0 ? 1 : -1, sy = cy === 0 ? 1 : -1;
            b.moveTo(cx + sx * 90, cy); b.lineTo(cx, cy); b.lineTo(cx, cy + sy * 90);
        });
        gridLayer.addChild(b);

        // Étoiles / particules ambiantes
        for (let i = 0; i < 220; i++) {
            const s = new PIXI.Graphics();
            const sz = Math.random() * 2.4 + 0.25;
            s.beginFill(conf.accent, Math.random() * 0.45 + 0.06);
            s.drawCircle(0, 0, sz); s.endFill();
            s.x = Math.random() * WORLD_W;
            s.y = Math.random() * WORLD_H;
            bgLayer.addChild(s);
            bgStars.push({ gfx: s, phase: Math.random() * Math.PI * 2, base: Math.random() * 0.35 + 0.06 });
        }

        // Blobs colorés
        for (let i = 0; i < 12; i++) {
            const blob = new PIXI.Graphics();
            blob.beginFill(conf.accent, 0.01);
            blob.drawEllipse(0, 0, 280 + Math.random() * 380, 200 + Math.random() * 280);
            blob.endFill();
            blob.x = Math.random() * WORLD_W;
            blob.y = Math.random() * WORLD_H;
            blob.rotation = Math.random() * Math.PI;
            bgLayer.addChild(blob);
        }

        // Biome terrestre : lignes de terrain
        if (wid === 5) {
            for (let i = 0; i < 18; i++) {
                const line = new PIXI.Graphics();
                line.lineStyle(70 + Math.random() * 120, 0x1a3a18, 0.025);
                const y = Math.random() * WORLD_H;
                line.moveTo(0, y); line.lineTo(WORLD_W, y);
                bgLayer.addChild(line);
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // MINIMAP
    // ══════════════════════════════════════════════════════════════════════
    const mmCanvas = document.getElementById('minimap-canvas');
    const mm = mmCanvas ? mmCanvas.getContext('2d') : null;

    function drawMinimap() {
        if (!mm || !player || !player.alive || !app) return;
        const sx = MM_W / WORLD_W;
        const sy = MM_H / WORLD_H;

        mm.clearRect(0, 0, MM_W, MM_H);
        mm.fillStyle = '#010612';
        mm.fillRect(0, 0, MM_W, MM_H);

        // Grille légère
        mm.strokeStyle = 'rgba(0,255,200,0.055)';
        mm.lineWidth = 0.5;
        for (let x = 0; x < MM_W; x += MM_W / 5) { mm.beginPath(); mm.moveTo(x,0); mm.lineTo(x,MM_H); mm.stroke(); }
        for (let y = 0; y < MM_H; y += MM_H / 5) { mm.beginPath(); mm.moveTo(0,y); mm.lineTo(MM_W,y); mm.stroke(); }

        // Nourriture
        for (const f of foodItems) {
            if (!f.alive) continue;
            mm.fillStyle = f.type === 'plant' ? 'rgba(0,255,170,0.32)' : 'rgba(255,32,85,0.32)';
            mm.fillRect(f.x * sx - 0.5, f.y * sy - 0.5, 1, 1);
        }

        // Ennemis
        for (const e of enemies) {
            if (!e.alive) continue;
            const danger = e.size > player.size * 0.85;
            mm.fillStyle = danger ? 'rgba(255,32,85,0.8)' : 'rgba(0,255,200,0.5)';
            mm.beginPath();
            mm.arc(e.x * sx, e.y * sy, Math.max(1.2, e.size * sx * 3.5), 0, Math.PI * 2);
            mm.fill();
        }

        // Viewport
        const vw = (app.screen.width  / GS.camZoom) * sx;
        const vh = (app.screen.height / GS.camZoom) * sy;
        const vx = (GS.camX - app.screen.width  / (2 * GS.camZoom)) * sx;
        const vy = (GS.camY - app.screen.height / (2 * GS.camZoom)) * sy;
        mm.strokeStyle = 'rgba(255,255,255,0.14)';
        mm.lineWidth = 0.7;
        mm.strokeRect(vx, vy, vw, vh);

        // Joueur
        mm.shadowColor = '#00ffc8'; mm.shadowBlur = 10;
        mm.fillStyle = '#ffffff';
        mm.beginPath();
        mm.arc(player.x * sx, player.y * sy, 3.8, 0, Math.PI * 2);
        mm.fill();
        mm.shadowBlur = 0;
    }

    // ══════════════════════════════════════════════════════════════════════
    // MUTATIONS
    // ══════════════════════════════════════════════════════════════════════
    function showMutationModal() {
        const avail = Object.keys(MUTATIONS).filter(k => !player.mutations[k]);
        if (avail.length === 0) { GS.mutCooldown = 400; return; }

        const opts = avail.sort(() => Math.random() - 0.5).slice(0, 3);
        const cont = document.getElementById('mut-choices');
        if (!cont) return;
        cont.innerHTML = '';

        opts.forEach(key => {
            const m   = MUTATIONS[key];
            const btn = document.createElement('button');
            btn.className = 'mut-btn';
            btn.innerHTML = `
                <div class="mut-icon" style="background:${m.color}14;border:1px solid ${m.color}35">${m.icon}</div>
                <div class="mut-info">
                    <div class="mut-name" style="color:${m.color}">${m.name}</div>
                    <div class="mut-desc">${m.desc}</div>
                </div>`;
            btn.addEventListener('click', () => {
                player.mutations[key] = true;
                player.draw();
                document.getElementById('mutation-modal').classList.add('hidden');
                // Ne pas afficher pause-overlay pour la mutation
                GS.paused = false;
                GS.mutCooldown = 360;
                sfxMut();
                pulseRing(m.color);
                updateAbilityBar();
                toast(`✦ ${m.name} acquis !`, m.color);
            });
            cont.appendChild(btn);
        });

        document.getElementById('mutation-modal').classList.remove('hidden');
        GS.paused = true;
    }

    function updateAbilityBar() {
        const bar = document.getElementById('ability-bar');
        if (!bar) return;
        const keys = Object.keys(player.mutations);
        if (keys.length === 0) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        bar.innerHTML = '<div class="ability-title">◈ MUTATIONS ACTIVES</div>';
        keys.forEach(k => {
            const m = MUTATIONS[k];
            const chip = document.createElement('div');
            chip.className = 'ability-chip';
            chip.innerHTML = `<div class="ability-dot" style="background:${m.color};box-shadow:0 0 6px ${m.color}"></div>${m.icon} ${m.name}`;
            bar.appendChild(chip);
        });
    }

    // ══════════════════════════════════════════════════════════════════════
    // SPAWN ENNEMIS
    // ══════════════════════════════════════════════════════════════════════
    function spawnEnemies(count) {
        const conf = WORLDS[GS.world];
        const [minS, maxS] = conf.enemySizeRange;
        for (let i = 0; i < count; i++) {
            const diet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
            const size = minS + Math.random() * (maxS - minS);
            let ex, ey;
            do {
                ex = Math.random() * WORLD_W;
                ey = Math.random() * WORLD_H;
            } while (player && Math.hypot(ex - player.x, ey - player.y) < 380);
            const e = getEnemy(ex, ey, size, diet);
            enemies.push(e);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // TRANSITION MONDE
    // ══════════════════════════════════════════════════════════════════════
    function transitionWorld(id) {
        if (GS.world === id) return;
        GS.world = id;
        GS.worldsVisited.add(id);
        const conf = WORLDS[id];
        GS.terrestrial = conf.terrestrial || false;

        // FIX: Pixi 7 utilise app.renderer.background.color (plus backgroundColor)
        app.renderer.background.color = conf.bg;

        buildBackground(id);

        // Reset nourriture
        for (const f of foodItems) removeFood(f);
        foodItems = [];
        spawnFoodBatch(conf.food);

        // Reset ennemis
        clearAllEnemies();
        spawnEnemies(conf.enemies);

        const biomeEl = document.getElementById('h-biome');
        if (biomeEl) biomeEl.textContent = conf.name;

        GS.shakeAmt = 22;
        sfxWorld();
        toast(`🌍 Biome découvert : ${conf.name}`, '#22d3ee');
        showBanner(conf.name, '◈ NOUVEAU BIOME ◈');

        // Flash de transition
        const fl = document.getElementById('biome-flash');
        if (fl) {
            const hex = conf.accent.toString(16).padStart(6, '0');
            fl.style.background = `#${hex}`;
            fl.style.opacity = '0.28';
            fl.style.transition = 'none';
            setTimeout(() => {
                fl.style.transition = 'opacity 1.2s ease-out';
                fl.style.opacity = '0';
            }, 50);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // GAME OVER
    // ══════════════════════════════════════════════════════════════════════
    function gameOver() {
        GS.running = false; GS.paused = true;
        sfxDie();

        const elapsed = Math.floor((Date.now() - GS.startTime) / 1000);
        const mm_  = Math.floor(elapsed / 60);
        const ss   = elapsed % 60;
        const score = Math.floor(
            player.size * 10 +
            GS.kills * 55 +
            GS.worldsVisited.size * 220 +
            Object.keys(player.mutations).length * 120 +
            elapsed * 2
        );

        const el = (id) => document.getElementById(id);
        if (el('go-size'))   el('go-size').textContent   = Math.floor(player.size);
        if (el('go-mut'))    el('go-mut').textContent    = Object.keys(player.mutations).length;
        if (el('go-worlds')) el('go-worlds').textContent = GS.worldsVisited.size + ' / 5';
        if (el('go-kills'))  el('go-kills').textContent  = GS.kills;
        if (el('go-time'))   el('go-time').textContent   = `${mm_}m ${ss.toString().padStart(2,'0')}s`;
        if (el('go-score'))  el('go-score').textContent  = score.toLocaleString();

        setTimeout(() => {
            const modal = document.getElementById('gameover-modal');
            if (modal) modal.classList.remove('hidden');
        }, 700);
    }

    // ══════════════════════════════════════════════════════════════════════
    // STAGE CHECK
    // ══════════════════════════════════════════════════════════════════════
    function checkStage() {
        let idx = 0;
        for (let i = STAGES.length - 1; i >= 0; i--) {
            if (player.size >= STAGES[i].size) { idx = i; break; }
        }
        if (idx > GS.lastStageIdx) {
            GS.lastStageIdx = idx;
            const s = STAGES[idx];
            const el = document.getElementById('stage-txt');
            if (el) el.textContent = s.name;
            showBanner(s.name, s.sub);
            sfxLevel();
            pulseRing('#a78bfa');
        }
        const nextIdx = Math.min(idx + 1, STAGES.length - 1);
        const el = document.getElementById('next-hint');
        if (el) {
            if (nextIdx > idx) {
                const diff = STAGES[nextIdx].size - player.size;
                el.textContent = diff > 0 ? `↑ ${STAGES[nextIdx].name} dans ${Math.ceil(diff)} taille` : '';
            } else {
                el.textContent = '◈ Stade maximum atteint';
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // HUD UPDATE
    // ══════════════════════════════════════════════════════════════════════
    function updateHUD() {
        const el = (id) => document.getElementById(id);
        if (el('h-size'))  el('h-size').textContent  = Math.floor(player.size);
        if (el('h-kills')) el('h-kills').textContent = GS.kills;

        const hp = player.hp / player.maxHp;
        const hpBar = el('h-hp-bar');
        if (hpBar) {
            hpBar.style.width      = Math.max(0, player.hp) + '%';
            hpBar.style.background =
                hp > 0.65 ? 'linear-gradient(90deg,#00ffc8,#22d3ee)' :
                hp > 0.32 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                            'linear-gradient(90deg,#ff2055,#ff6088)';
        }
        const hungerBar = el('h-hunger-bar');
        if (hungerBar) hungerBar.style.width = Math.max(0, player.hunger) + '%';

        const pct = Math.min(100, (player.size / MAX_SIZE) * 100);
        const pf  = el('prog-fill');
        const pp  = el('prog-pct');
        if (pf) pf.style.width = pct + '%';
        if (pp) pp.textContent = Math.floor(pct) + '%';
    }

    // ══════════════════════════════════════════════════════════════════════
    // IA ENNEMIS — helpers
    // ══════════════════════════════════════════════════════════════════════
    function computeAITarget(e) {
        const edx = player.x - e.x;
        const edy = player.y - e.y;
        const ed  = Math.hypot(edx, edy);
        const camoFactor    = player.mutations.camouflage ? 0.42 : 1;
        const detectionRange = (e.mutations && e.mutations.sonar ? 560 : 400) * camoFactor;

        if (ed < detectionRange) {
            if (e.diet === 'carnivore' && e.size > player.size * 0.82) {
                return { x: player.x, y: player.y };           // chasse
            }
            if (e.size < player.size * 1.18) {
                return { x: e.x - edx * 1.25, y: e.y - edy * 1.25 }; // fuite
            }
        }

        // Herbivore cherche plante proche
        if (e.diet === 'herbivore') {
            let closestDist = 220, best = null;
            for (const f of foodItems) {
                if (!f.alive || f.type !== 'plant') continue;
                const fd = Math.hypot(f.x - e.x, f.y - e.y);
                if (fd < closestDist) { closestDist = fd; best = f; }
            }
            if (best) return { x: best.x, y: best.y };
        }

        return e.aiTarget; // cible aléatoire
    }

    // ══════════════════════════════════════════════════════════════════════
    // BOUCLE PRINCIPALE
    // ══════════════════════════════════════════════════════════════════════
    function mainLoop(ticker) {
        if (!GS.running || GS.paused || !player) return;

        const dt = Math.min(ticker.deltaTime, 4.5);
        GS.age += dt;
        GS.mutCooldown = Math.max(0, GS.mutCooldown - dt);

        // ── JOUEUR ──────────────────────────────────────────────────────
        const wx = (GS.mouseX - app.screen.width  / 2) / GS.camZoom + GS.camX;
        const wy = (GS.mouseY - app.screen.height / 2) / GS.camZoom + GS.camY;
        player.update(dt, wx, wy);

        // Trail carnivore
        if (player.diet === 'carnivore' && GS.age % 4 < dt) {
            spawnTrail(player.x, player.y, player.color, 2);
        }

        if (!player.alive) { gameOver(); return; }

        // ── ENNEMIS ─────────────────────────────────────────────────────
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e || !e.alive) {
                if (e) releaseEnemy(e);
                enemies.splice(i, 1);
                continue;
            }

            // IA : recompute target périodiquement
            e.aiTimer -= dt;
            if (e.aiTimer <= 0) {
                e.aiTimer = 90 + Math.random() * 140;
                e.aiTarget.x = Math.random() * WORLD_W;
                e.aiTarget.y = Math.random() * WORLD_H;
            }
            const { x: tx, y: ty } = computeAITarget(e);
            e.update(dt, tx, ty);

            // Ennemis herbivores mangent les plantes
            if (e.diet === 'herbivore') {
                for (let fi = foodItems.length - 1; fi >= 0; fi--) {
                    const f = foodItems[fi];
                    if (!f.alive || f.type !== 'plant') continue;
                    if (Math.hypot(f.x - e.x, f.y - e.y) < e.size + 5) {
                        removeFood(f); foodItems.splice(fi, 1);
                        e.hunger = Math.min(100, e.hunger + 15);
                        break;
                    }
                }
            }

            // Empoisonnement par toxine joueur
            if (player.mutations.toxin) {
                const toxRange = player.size * 2.6;
                const ed2 = Math.hypot(player.x - e.x, player.y - e.y);
                if (ed2 < toxRange && !e.poisoned) e.poison(player.getStats().poison);
            }

            // Sonar : ralentit les ennemis proches
            if (player.mutations.sonar) {
                const sonarR = 300;
                const ed3 = Math.hypot(player.x - e.x, player.y - e.y);
                if (ed3 < sonarR) { e.vx *= 0.97; e.vy *= 0.97; }
            }

            // ── COLLISION joueur ↔ ennemi ──
            const cdx = player.x - e.x, cdy = player.y - e.y;
            const cd  = Math.sqrt(cdx * cdx + cdy * cdy);

            if (cd < player.size + e.size - 4) {
                if (player.size > e.size * 1.15) {
                    // Joueur mange l'ennemi
                    player.eatEnemy(e.size);
                    GS.kills++;
                    const pts = Math.floor(e.size * 16 + 35);
                    GS.score += pts;

                    // Combo
                    const now = GS.age;
                    if (now - GS.lastKillTime < 110) {
                        GS.comboKills++;
                        if (GS.comboKills >= 3) {
                            toast(`🔥 COMBO ×${GS.comboKills} !`, '#ff2055');
                            GS.score += GS.comboKills * 28;
                        }
                    } else {
                        GS.comboKills = 1;
                    }
                    GS.lastKillTime = now;

                    addKillFeed(player.diet === 'carnivore'
                        ? `🦷 +${Math.floor(e.size)} dévoré`
                        : `⚡ +${Math.floor(e.size)} absorbé`);

                    spawnBurst(e.x, e.y, e.color, 16, 230);
                    sfxKill();
                    GS.shakeAmt = 7;

                    // Score popup à l'écran
                    const sc2 = worldToScreen(e.x, e.y);
                    spawnScorePop(sc2.x, sc2.y, `+${pts}`);

                    releaseEnemy(e);
                    enemies.splice(i, 1);

                    // Respawn différé
                    setTimeout(() => {
                        if (!GS.running) return;
                        const conf2 = WORLDS[GS.world];
                        const [minS2, maxS2] = conf2.enemySizeRange;
                        let rx2, ry2;
                        do { rx2 = Math.random() * WORLD_W; ry2 = Math.random() * WORLD_H; }
                        while (player && Math.hypot(rx2 - player.x, ry2 - player.y) < 340);
                        enemies.push(getEnemy(rx2, ry2, minS2 + Math.random() * (maxS2 - minS2), Math.random() > 0.5 ? 'herbivore' : 'carnivore'));
                    }, 3500 + Math.random() * 2000);

                } else if (e.size > player.size * 1.18 && e.diet === 'carnivore') {
                    // Ennemi attaque
                    const dmg   = e.getStats().damage * 3.8;
                    const taken = player.takeDamage(dmg);
                    GS.shakeAmt = 11;
                    sfxHurt();
                    const sc3 = worldToScreen(player.x, player.y);
                    spawnDmgText(sc3.x, sc3.y - 20, `-${Math.floor(taken)} PV`, '#ff2055');
                }
            }
        }

        // ── NOURRITURE ──────────────────────────────────────────────────
        const pSt  = player.getStats();
        const magR = player.size * pSt.magnet;
        const eatR = player.size + 5;
        const toEat = [];

        for (let i = 0; i < foodItems.length; i++) {
            const f = foodItems[i];
            if (!f.alive) continue;
            f.age += dt;

            const fdx = f.x - player.x, fdy = f.y - player.y;
            const fd  = Math.sqrt(fdx * fdx + fdy * fdy);

            if (isVisible(f.x, f.y)) drawFoodItem(f, f.age);

            const compatible = (player.diet === 'herbivore' && f.type === 'plant') ||
                               (player.diet === 'carnivore' && f.type === 'meat');

            // Aimantation
            if (compatible && fd < magR && fd > 0) {
                const force = 16 * (1 - fd / magR);
                f.x -= (fdx / fd) * force * dt;
                f.y -= (fdy / fd) * force * dt;
            }

            // Absorption
            if (fd < eatR) {
                if (player.eat(f.type, 1)) {
                    toEat.push(i);
                    sfxEat();
                    GS.totalFoodEaten++;
                    spawnBurst(f.x, f.y, f.type === 'plant' ? 0x00ffaa : 0xff2055, 5, 85);
                }
            }
        }

        // Supprimer nourriture mangée (ordre inverse pour garder indices valides)
        for (let i = toEat.length - 1; i >= 0; i--) {
            const idx = toEat[i];
            removeFood(foodItems[idx]);
            foodItems.splice(idx, 1);
        }

        // Respawn périodique
        GS.foodRespawnTimer += dt;
        if (GS.foodRespawnTimer > 55) {
            GS.foodRespawnTimer = 0;
            const target  = WORLDS[GS.world].food;
            const missing = target - foodItems.length;
            if (missing > 0) {
                const batch = Math.min(missing, 10);
                for (let i = 0; i < batch; i++) {
                    foodItems.push(makeFood(Math.random() > 0.45 ? 'plant' : 'meat'));
                }
            }
        }

        // ── MUTATION TRIGGER ────────────────────────────────────────────
        const mutThresh = 16 + Object.keys(player.mutations).length * 22;
        if (player.targetSize > mutThresh && GS.mutCooldown <= 0) {
            GS.mutCooldown = 360;
            sfxMut();
            showMutationModal();
        }

        // ── STAGES / PROGRESSION ────────────────────────────────────────
        checkStage();
        for (let id = 2; id <= 5; id++) {
            if (id > GS.world && player.size >= WORLDS[id].unlockSize) {
                transitionWorld(id); break;
            }
        }

        // ── PARTICULES ───────────────────────────────────────────────────
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.update(dt);
            if (!p.alive) { p.destroy(); particles.splice(i, 1); }
        }

        // ── ANIMATION BG STARS ───────────────────────────────────────────
        for (const s of bgStars) {
            s.gfx.alpha = s.base + Math.sin(GS.age * 0.016 + s.phase) * 0.14;
        }

        // ── CAMÉRA ──────────────────────────────────────────────────────
        const targetZoom = Math.max(0.26, Math.min(1.55, 22 / Math.max(player.size, 1)));
        GS.camZoom += (targetZoom - GS.camZoom) * 0.05;
        GS.camX    += (player.x - GS.camX) * 0.09;
        GS.camY    += (player.y - GS.camY) * 0.09;

        let cx = GS.camX, cy = GS.camY;
        if (GS.shakeAmt > 0.25) {
            cx += (Math.random() - 0.5) * GS.shakeAmt;
            cy += (Math.random() - 0.5) * GS.shakeAmt;
            GS.shakeAmt *= 0.82;
        }

        worldContainer.pivot.set(cx, cy);
        worldContainer.position.set(app.screen.width / 2, app.screen.height / 2);
        worldContainer.scale.set(GS.camZoom);

        // Parallaxe bg subtile
        bgLayer.pivot.set((cx - WORLD_W / 2) * 0.035, (cy - WORLD_H / 2) * 0.035);

        // ── HUD ─────────────────────────────────────────────────────────
        updateHUD();
        drawMinimap();
    }

    // ══════════════════════════════════════════════════════════════════════
    // INITIALISATION
    // ══════════════════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', () => {

        // ── PIXI APPLICATION ────────────────────────────────────────────
        app = new PIXI.Application({
            resizeTo: window,
            background: WORLDS[1].bg,         // FIX: Pixi 7 utilise 'background' pas 'backgroundColor'
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            autoDensity: true,
            antialias: true,
            powerPreference: 'high-performance'
        });

        const gc = document.getElementById('game-container');
        gc.appendChild(app.view);
        app.view.style.position = 'absolute';
        app.view.style.inset    = '0';

        // ── LAYERS ──────────────────────────────────────────────────────
        worldContainer = new PIXI.Container();
        bgLayer        = new PIXI.Container();
        gridLayer      = new PIXI.Container();
        foodLayer      = new PIXI.Container();
        entityLayer    = new PIXI.Container();
        fxLayer        = new PIXI.Container();

        worldContainer.addChild(bgLayer, gridLayer, foodLayer, entityLayer, fxLayer);
        app.stage.addChild(worldContainer);

        // ── INPUT ────────────────────────────────────────────────────────
        window.addEventListener('touchmove', e => {
            e.preventDefault();
            GS.mouseX = e.touches[0].clientX;
            GS.mouseY = e.touches[0].clientY;
        }, { passive: false });
        window.addEventListener('touchstart', e => {
            GS.mouseX = e.touches[0].clientX;
            GS.mouseY = e.touches[0].clientY;
        });

        // ── BOUTONS HUD ──────────────────────────────────────────────────
        const btnPause = document.getElementById('btn-pause');
        if (btnPause) btnPause.addEventListener('click', () => {
            if (!GS.running) return;
            // Ne pas pauser si mutation modal est ouvert
            if (!document.getElementById('mutation-modal').classList.contains('hidden')) return;
            GS.paused = !GS.paused;
            btnPause.textContent = GS.paused ? '▶ Reprendre' : '⏸ Pause';
            const po = document.getElementById('pause-overlay');
            if (po) po.classList.toggle('show', GS.paused);
        });

        const btnMute = document.getElementById('btn-mute');
        if (btnMute) btnMute.addEventListener('click', () => {
            GS.muted = !GS.muted;
            btnMute.textContent = GS.muted ? '🔇 Muet' : '🔊 Son';
            if (ambientGain) {
                ambientGain.gain.setTargetAtTime(GS.muted ? 0 : 0.018, audioCtx.currentTime, 0.1);
            }
        });

        const btnInfo = document.getElementById('btn-info');
        if (btnInfo) btnInfo.addEventListener('click', () => {
            const im = document.getElementById('info-modal');
            if (im) im.classList.toggle('hidden');
        });
        const closeInfo = document.getElementById('close-info-btn');
        if (closeInfo) closeInfo.addEventListener('click', () => {
            const im = document.getElementById('info-modal');
            if (im) im.classList.add('hidden');
        });
        const infoModal = document.getElementById('info-modal');
        if (infoModal) infoModal.addEventListener('click', e => {
            if (e.target === infoModal) infoModal.classList.add('hidden');
        });

        // ── START GAME ───────────────────────────────────────────────────
        function startGame(diet) {
            initAudio();
            const sm = document.getElementById('start-menu');
            if (sm) sm.classList.add('hidden');

            // Reset état
            GS.running = false; GS.paused = false;
            GS.age = 0; GS.kills = 0; GS.score = 0;
            GS.lastStageIdx = 0; GS.mutCooldown = 0;
            GS.world = 1; GS.worldsVisited = new Set([1]);
            GS.terrestrial = false; GS.shakeAmt = 0;
            GS.totalFoodEaten = 0; GS.comboKills = 0; GS.foodRespawnTimer = 0;
            GS.dietChosen = diet;

            // Nettoyage
            for (const f of foodItems) removeFood(f); foodItems = [];
            clearAllEnemies();
            for (const p of particles) p.destroy(); particles = [];

            // Build monde
            // FIX: utilise app.renderer.background.color (Pixi 7)
            app.renderer.background.color = WORLDS[1].bg;
            buildBackground(1);
            spawnFoodBatch(WORLDS[1].food);

            // Joueur
            player = new Entity(WORLD_W / 2, WORLD_H / 2, MIN_SIZE, diet, true);
            entityLayer.addChild(player.container);

            GS.camX = player.x; GS.camY = player.y; GS.camZoom = 1;
            GS.startTime = Date.now();

            const hb = document.getElementById('h-biome');
            if (hb) hb.textContent = WORLDS[1].name;
            const ab = document.getElementById('ability-bar');
            if (ab) { ab.style.display = 'none'; ab.innerHTML = ''; }
            const st = document.getElementById('stage-txt');
            if (st) st.textContent = 'Unicellulaire';
            const po = document.getElementById('pause-overlay');
            if (po) po.classList.remove('show');

            spawnEnemies(WORLDS[1].enemies);
            GS.running = true;

            sfxLevel();
            showBanner('Unicellulaire', 'Organisme primitif');

            // Lance la boucle (évite double ajout)
            app.ticker.remove(mainLoop);
            app.ticker.add(mainLoop);
        }

        const btnHerb = document.getElementById('btn-herb');
        const btnCarn = document.getElementById('btn-carn');
        if (btnHerb) btnHerb.addEventListener('click', () => startGame('herbivore'));
        if (btnCarn) btnCarn.addEventListener('click', () => startGame('carnivore'));

        // ── RESIZE ──────────────────────────────────────────────────────
        window.addEventListener('resize', () => { if (app) app.resize(); });
    });

})();
