// ============================================================================
// EVOSPHERE v3.0 — FULL REWRITE
// Bugs corrigés, gameplay amélioré, visuels AAA, systèmes enrichis
// ============================================================================
(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════════
    // CONSTANTES
    // ══════════════════════════════════════════════════════════════════════
    const WORLD_W    = 5000;
    const WORLD_H    = 5000;
    const MIN_SIZE   = 10;
    const MAX_SIZE   = 260;
    const MM_W = 140, MM_H = 140;

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

    // Toutes les mutations avec leurs effets
    const MUTATIONS = {
        flagella:       { name:'Flagelle',        icon:'🌀', color:'#ffaa00', speedMult:1.4,  desc:'+40% vitesse de déplacement' },
        spike:          { name:'Épine Venimeuse', icon:'⚡', color:'#ff2055', damageMult:1.7, desc:'+70% dégâts en combat'       },
        shield:         { name:'Cuticule',        icon:'🛡', color:'#6b9ef5', defenseMult:1.6,desc:'+60% résistance aux dégâts'  },
        neuron:         { name:'Neurone Étendu',  icon:'🔮', color:'#a78bfa', magnetMult:2.0, desc:'+100% rayon de détection'    },
        chemosynthesis: { name:'Chimiosynthèse',  icon:'💚', color:'#00ffcc', foodEff:1.7,    desc:'+70% assimilation nutriments'},
        camouflage:     { name:'Camouflage',      icon:'👁', color:'#cbd5e1', camo:true,      desc:'Réduit l\'aggro ennemis -60%' },
        regeneration:   { name:'Régénération',    icon:'❤️', color:'#22d3ee', regenRate:0.6,  desc:'Regénère HP hors combat'     },
        toxin:          { name:'Toxine Mortelle', icon:'☣️', color:'#7eff00', poisonDmg:0.8,  desc:'Empoisonne les ennemis proches'},
        sonar:          { name:'Sonar Biologique',icon:'📡', color:'#00d4ff', sonar:true,     desc:'Révèle les ennemis cachés'   }
    };

    // ══════════════════════════════════════════════════════════════════════
    // ÉTAT GLOBAL
    // ══════════════════════════════════════════════════════════════════════
    let app, worldContainer, bgLayer, gridLayer, foodLayer, entityLayer, fxLayer;
    let player = null;
    let enemies = [];
    let foodItems = [];
    let particles = [];
    let bgStars = [];
    let dmgTexts = [];

    // Pool d'entités pour performances
    const pool = { inactive:[], active:[] };

    const GS = {
        running:false, paused:false, muted:false,
        age:0,
        camX:WORLD_W/2, camY:WORLD_H/2,
        camZoom:1, targetZoom:1,
        shakeAmt:0, shakeX:0, shakeY:0,
        mouseX:0, mouseY:0,
        world:1, worldsVisited:new Set([1]),
        terrestrial:false,
        kills:0, score:0, startTime:0,
        lastStageIdx:0,
        mutCooldown:0,
        totalFoodEaten:0,
        lastKillTime:0,
        comboKills:0,
        foodRespawnTimer:0
    };

    // ══════════════════════════════════════════════════════════════════════
    // AUDIO — Web Audio API synthétiseur
    // ══════════════════════════════════════════════════════════════════════
    let audioCtx = null;
    let ambientNode = null;

    function initAudio() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            startAmbient();
        } catch(_){}
    }

    function startAmbient() {
        if (!audioCtx || GS.muted) return;
        try {
            ambientNode = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            ambientNode.connect(g); g.connect(audioCtx.destination);
            ambientNode.type = 'sine';
            ambientNode.frequency.setValueAtTime(55, audioCtx.currentTime);
            g.gain.setValueAtTime(0.025, audioCtx.currentTime);
            ambientNode.start();
        } catch(_){}
    }

    function sfx(freq, dur, type='sine', vol=0.2, sweep=0.4) {
        if (GS.muted || !audioCtx) return;
        try {
            const t = audioCtx.currentTime;
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.connect(g); g.connect(audioCtx.destination);
            o.type = type;
            o.frequency.setValueAtTime(freq, t);
            o.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.start(t); o.stop(t + dur + 0.01);
        } catch(_){}
    }

    function sfxEat()    { sfx(600 + Math.random()*100, 0.07, 'sine', 0.1, 0.6); }
    function sfxKill()   { sfx(280, 0.18, 'triangle', 0.18, 0.3); sfx(180, 0.22, 'sawtooth', 0.08, 0.2); }
    function sfxHurt()   { sfx(140, 0.22, 'sawtooth', 0.22, 0.15); }
    function sfxLevel()  { sfx(550, 0.15, 'sine', 0.18, 1.1); sfx(770, 0.2, 'sine', 0.12, 1.05); }
    function sfxMut()    { sfx(440, 0.15, 'triangle', 0.15); sfx(660, 0.25, 'sine', 0.12, 1.2); }
    function sfxWorld()  { sfx(250, 0.6, 'sine', 0.15, 0.5); sfx(375, 0.4, 'triangle', 0.08, 0.6); }
    function sfxDie()    { sfx(150, 1.5, 'sawtooth', 0.18, 0.1); }

    // ══════════════════════════════════════════════════════════════════════
    // TOAST & UI HELPERS
    // ══════════════════════════════════════════════════════════════════════
    let toastTimer = null;
    function toast(msg, color='#fbbf24') {
        const el = document.getElementById('notif');
        if (!el) return;
        el.textContent = msg;
        el.style.background = color;
        el.style.color = color === '#fbbf24' ? '#000' : '#fff';
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
        bannerTimer = setTimeout(() => el.classList.remove('show'), 3000);
    }

    function pulseRing(color='#00ffc8') {
        const el = document.getElementById('pulse-ring');
        if (!el) return;
        el.style.borderColor = color;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'pulse-expand 0.75s ease-out forwards';
    }

    function addKillFeed(msg) {
        const feed = document.getElementById('killfeed');
        if (!feed) return;
        const entry = document.createElement('div');
        entry.className = 'kill-entry';
        entry.textContent = msg;
        feed.appendChild(entry);
        setTimeout(() => { if (entry.parentNode) entry.parentNode.removeChild(entry); }, 2100);
    }

    // Floating damage text (world space → screen space)
    function spawnDmgText(worldX, worldY, text, color='#ff2055') {
        if (!app) return;
        const sx = (worldX - GS.camX) * GS.camZoom + app.screen.width  / 2;
        const sy = (worldY - GS.camY) * GS.camZoom + app.screen.height / 2;
        const el = document.createElement('div');
        el.className = 'dmg-text';
        el.textContent = text;
        el.style.color = color;
        el.style.left = sx + 'px';
        el.style.top  = sy + 'px';
        document.body.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
    }

    // ══════════════════════════════════════════════════════════════════════
    // PARTICLES
    // ══════════════════════════════════════════════════════════════════════
    class Particle {
        constructor(x, y, vx, vy, color, size, life) {
            this.x=x; this.y=y; this.vx=vx; this.vy=vy;
            this.color=color; this.size=size;
            this.life=life; this.maxLife=life;
            this.alive=true;
            this.gfx = new PIXI.Graphics();
            this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
            fxLayer.addChild(this.gfx);
        }
        update(dt) {
            this.x += this.vx * dt * 0.016;
            this.y += this.vy * dt * 0.016;
            this.vx *= 0.90; this.vy *= 0.90;
            this.life -= dt;
            if (this.life <= 0) { this.alive=false; this.gfx.clear(); return; }
            const a = Math.max(0, this.life / this.maxLife);
            this.gfx.clear();
            this.gfx.beginFill(this.color, a * 0.8);
            this.gfx.drawCircle(0, 0, this.size * (0.2 + a * 0.8));
            this.gfx.endFill();
            this.gfx.x = this.x; this.gfx.y = this.y;
        }
        destroy() {
            this.alive = false;
            if (this.gfx.parent) this.gfx.parent.removeChild(this.gfx);
            this.gfx.destroy();
        }
    }

    function spawnBurst(x, y, color, count=12, speed=180) {
        for (let i = 0; i < count; i++) {
            const a  = (i / count) * Math.PI * 2;
            const sp = speed * (0.4 + Math.random() * 0.6);
            particles.push(new Particle(x, y, Math.cos(a)*sp, Math.sin(a)*sp,
                color, 2.5 + Math.random() * 3.5, 35 + Math.random() * 20));
        }
    }

    function spawnTrail(x, y, color, count=3) {
        for (let i = 0; i < count; i++) {
            const a  = Math.random() * Math.PI * 2;
            const sp = 20 + Math.random() * 40;
            particles.push(new Particle(x, y, Math.cos(a)*sp, Math.sin(a)*sp,
                color, 1 + Math.random() * 2, 12 + Math.random() * 10));
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ENTITÉ (Joueur + Ennemis)
    // ══════════════════════════════════════════════════════════════════════
    class Entity {
        constructor(x, y, size, diet, isPlayer=false) {
            this.isPlayer = isPlayer;
            this.x=x; this.y=y;
            this.vx=0; this.vy=0;
            this.size=size; this.targetSize=size;
            this.diet=diet;
            this.mutations={};
            this.hp=100; this.maxHp=100;
            this.hunger=100;
            this.alive=true;
            this.poisoned=false; this.poisonTimer=0;
            this.color = diet==='herbivore' ? 0x00ffcc : 0xff2055;
            this.baseColor = this.color;
            this.wiggle = Math.random() * Math.PI * 2;
            this.lastDamagedAge = -99999;
            this.aiTarget = { x: Math.random()*WORLD_W, y: Math.random()*WORLD_H };
            this.aiTimer = 0;
            this.fleeTimer = 0;
            this.eyeAngle = 0;

            this.container = new PIXI.Container();
            this.body      = new PIXI.Graphics();
            this.eye       = new PIXI.Graphics();
            this.glowGfx   = new PIXI.Graphics();
            this.container.addChild(this.glowGfx, this.body, this.eye);
            this.draw();
        }

        getBonus(stat) {
            for (const [key, def] of Object.entries(MUTATIONS)) {
                if (this.mutations[key] && def[stat]) return def[stat];
            }
            return 1;
        }

        getStats() {
            const base = this.diet === 'herbivore' ? 0.42 : 0.65;
            const sizeFactor = Math.sqrt(MIN_SIZE / Math.max(this.size, MIN_SIZE));
            return {
                speed:   base * this.getBonus('speedMult') * sizeFactor,
                magnet:  (this.diet === 'herbivore' ? 8 : 2.5) * this.getBonus('magnetMult'),
                damage:  (this.diet === 'carnivore' ? 1.4 : 0.45) * this.getBonus('damageMult'),
                defense: this.getBonus('defenseMult'),
                foodEff: this.getBonus('foodEff') || 1,
                regen:   this.mutations.regeneration ? MUTATIONS.regeneration.regenRate : 0,
                poison:  this.mutations.toxin ? MUTATIONS.toxin.poisonDmg : 0
            };
        }

        draw() {
            if (!this.body) return;
            this.body.clear();
            this.eye.clear();
            this.glowGfx.clear();

            const s  = this.size;
            const mc = Object.keys(this.mutations).length;
            const c  = this.color;

            // Halo de glow externe
            this.glowGfx.beginFill(c, 0.05);
            this.glowGfx.drawCircle(0, 0, s * 2.2);
            this.glowGfx.endFill();
            this.glowGfx.beginFill(c, 0.09);
            this.glowGfx.drawCircle(0, 0, s * 1.6);
            this.glowGfx.endFill();

            // Corps principal
            this.body.lineStyle(mc > 0 ? 1.5 : 1, 0xffffff, 0.22);
            this.body.beginFill(c, 0.92);

            if (this.diet === 'carnivore') {
                this._drawStar(s, 5 + Math.min(mc, 5));
            } else {
                // Herbivore = cercle avec détails
                this.body.drawCircle(0, 0, s);
                if (mc > 0) {
                    this.body.beginFill(0xffffff, 0.08);
                    this.body.drawCircle(0, 0, s * 0.45);
                }
            }
            this.body.endFill();

            // Reflet lumineux
            this.body.beginFill(0xffffff, 0.15);
            this.body.drawEllipse(-s * 0.25, -s * 0.3, s * 0.3, s * 0.18);
            this.body.endFill();

            // Mutations visuelles
            this._drawMutationEffects(s, mc);

            // Œil
            this._drawEye(s);
        }

        _drawMutationEffects(s, mc) {
            if (this.mutations.flagella) {
                this.body.lineStyle(1.8, 0xffaa00, 0.75);
                for (let i = 0; i < 4; i++) {
                    const ang = Math.PI * 0.75 + (i - 1.5) * 0.55;
                    const len = s * (2.5 + Math.sin(GS.age * 0.05 + i) * 0.5);
                    this.body.moveTo(Math.cos(ang) * s * 0.8, Math.sin(ang) * s * 0.8);
                    this.body.bezierCurveTo(
                        Math.cos(ang) * len * 0.4, Math.sin(ang) * len * 0.4 + s * 0.3,
                        Math.cos(ang) * len * 0.8, Math.sin(ang) * len * 0.8 - s * 0.2,
                        Math.cos(ang) * len, Math.sin(ang) * len
                    );
                }
                this.body.lineStyle(0);
            }
            if (this.mutations.spike) {
                for (let i = 0; i < 8; i++) {
                    const ang = (i / 8) * Math.PI * 2;
                    this.body.beginFill(0xff2055, 0.95);
                    this.body.moveTo(Math.cos(ang + 0.12) * s * 0.92, Math.sin(ang + 0.12) * s * 0.92);
                    this.body.lineTo(Math.cos(ang) * s * 1.7, Math.sin(ang) * s * 1.7);
                    this.body.lineTo(Math.cos(ang - 0.12) * s * 0.92, Math.sin(ang - 0.12) * s * 0.92);
                    this.body.endFill();
                }
            }
            if (this.mutations.shield) {
                this.body.lineStyle(1.5, 0x6b9ef5, 0.5);
                this.body.beginFill(0x6b9ef5, 0.06);
                this.body.drawCircle(0, 0, s * 1.2);
                this.body.endFill();
                this.body.lineStyle(0);
            }
            if (this.mutations.toxin) {
                for (let i = 0; i < 5; i++) {
                    const ang = (i / 5) * Math.PI * 2;
                    this.body.beginFill(0x7eff00, 0.85);
                    this.body.drawCircle(Math.cos(ang) * s * 1.1, Math.sin(ang) * s * 1.1, s * 0.12);
                    this.body.endFill();
                }
            }
            if (this.mutations.camouflage) {
                this.body.alpha = 0.6;
            } else {
                this.body.alpha = 1;
            }
        }

        _drawEye(s) {
            const ex = s * 0.35;
            const ey = -s * 0.2;
            // Sclérotique
            this.eye.beginFill(0xffffff, 0.95);
            this.eye.drawCircle(ex, ey, s * 0.18);
            this.eye.endFill();
            // Iris
            this.eye.beginFill(this.diet === 'herbivore' ? 0x00aa66 : 0xcc1133, 0.9);
            this.eye.drawCircle(ex + s * 0.04, ey + s * 0.02, s * 0.11);
            this.eye.endFill();
            // Pupille
            this.eye.beginFill(0x000000, 1);
            this.eye.drawCircle(ex + s * 0.05, ey + s * 0.025, s * 0.065);
            this.eye.endFill();
            // Reflet
            this.eye.beginFill(0xffffff, 0.8);
            this.eye.drawCircle(ex + s * 0.03, ey - s * 0.04, s * 0.035);
            this.eye.endFill();
        }

        _drawStar(r, pts) {
            const inner = r * 0.54;
            const step  = (Math.PI * 2) / (pts * 2);
            this.body.moveTo(0, -r);
            for (let i = 1; i < pts * 2; i++) {
                const rad = i % 2 === 0 ? r : inner;
                const a   = i * step - Math.PI / 2;
                this.body.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
            }
            this.body.closePath();
        }

        // Manger de la nourriture (retourne vrai si compatible)
        eat(type, amt=1) {
            const ok = (this.diet === 'herbivore' && type === 'plant') ||
                       (this.diet === 'carnivore' && type === 'meat');
            if (!ok) return false;
            const eff = this.getStats().foodEff;
            this.targetSize = Math.min(MAX_SIZE, this.targetSize + amt * eff * 0.55);
            this.hunger = Math.min(100, this.hunger + 20 * eff);
            return true;
        }

        // Manger la chair d'un ennemi (carnivore uniquement, toujours valide)
        eatEnemy(enemySize) {
            const eff = this.getStats().foodEff;
            this.targetSize = Math.min(MAX_SIZE, this.targetSize + enemySize * 0.3 * eff);
            this.hunger = Math.min(100, this.hunger + 30 * eff);
        }

        takeDamage(amt) {
            const dmg = Math.max(0.1, amt / this.getStats().defense);
            this.hp = Math.max(0, this.hp - dmg);
            this.lastDamagedAge = GS.age;
            if (this.hp <= 0) this.alive = false;
            return dmg;
        }

        poison(dmgPerFrame) {
            this.poisoned = true;
            this.poisonTimer = 180; // 3 secondes
            this._poisonDmg = dmgPerFrame;
        }

        reset(x, y, size, diet) {
            this.x=x; this.y=y;
            this.vx=0; this.vy=0;
            this.size=size; this.targetSize=size;
            this.diet=diet; this.mutations={};
            this.hp=100; this.maxHp=100; this.hunger=100;
            this.alive=true;
            this.poisoned=false; this.poisonTimer=0;
            this.color = diet === 'herbivore' ? 0x00ffcc : 0xff2055;
            this.baseColor = this.color;
            this.body.alpha = 1;
            this.draw();
        }

        update(dt, tx=null, ty=null) {
            if (!this.alive) return;

            // ── Faim ──
            this.hunger = Math.max(0, this.hunger - 0.07 * dt);
            if (this.hunger < 10) this.takeDamage(0.2 * dt);

            // ── Poison ──
            if (this.poisoned) {
                this.poisonTimer -= dt;
                this.takeDamage((this._poisonDmg || 0.3) * dt);
                if (this.poisonTimer <= 0) this.poisoned = false;
                // Flash vert
                this.body.tint = (Math.sin(GS.age * 0.3) > 0) ? 0x7eff00 : 0xffffff;
            } else {
                this.body.tint = 0xffffff;
            }

            // ── Régénération (joueur hors combat) ──
            if (this.isPlayer) {
                const st = this.getStats();
                const timeSinceDmg = (GS.age - this.lastDamagedAge) * 0.016;
                if (st.regen > 0 && timeSinceDmg > 4) {
                    this.hp = Math.min(this.maxHp, this.hp + st.regen * dt);
                }
            }

            // ── Croissance lissée ──
            if (this.size < this.targetSize) {
                const delta = Math.min(0.22 * dt, this.targetSize - this.size);
                this.size += delta;
                if (delta > 0.5) this.draw(); // Ne redessine que si changement notable
            }

            // ── Mouvement ──
            if (tx !== null && ty !== null) {
                const dx = tx - this.x;
                const dy = ty - this.y;
                const d  = Math.sqrt(dx * dx + dy * dy);
                if (d > 2) {
                    const sp = this.getStats().speed * 0.085;
                    this.vx += (dx / d) * sp * dt;
                    this.vy += (dy / d) * sp * dt;
                }
            }

            // ── Friction (terrestre = plus forte) ──
            const fr = GS.terrestrial ? 0.80 : 0.91;
            this.vx *= fr; this.vy *= fr;
            this.x  += this.vx * dt;
            this.y  += this.vy * dt;

            // ── Limites du monde ──
            this.x = Math.max(this.size + 4, Math.min(WORLD_W - this.size - 4, this.x));
            this.y = Math.max(this.size + 4, Math.min(WORLD_H - this.size - 4, this.y));

            // ── Render ──
            if (this.container) {
                this.container.x = this.x;
                this.container.y = this.y;

                const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (spd > 1.5) {
                    this.container.rotation = Math.atan2(this.vy, this.vx);
                    const stretch = 1 + Math.min(spd, 12) * 0.01;
                    this.body.scale.set(stretch, 1 / stretch);
                } else {
                    this.wiggle += 0.025 * dt;
                    const b = Math.sin(this.wiggle) * 0.014;
                    this.body.scale.set(1 + b, 1 - b);
                    this.container.rotation *= 0.90;
                }

                // Opacity selon HP
                if (this.isPlayer) {
                    const hpRatio = this.hp / this.maxHp;
                    this.container.alpha = 0.6 + hpRatio * 0.4;
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
        e.alive = false;
        if (e.container.parent) e.container.parent.removeChild(e.container);
        const idx = pool.active.indexOf(e);
        if (idx !== -1) pool.active.splice(idx, 1);
        pool.inactive.push(e);
    }

    function clearAllEnemies() {
        for (const e of pool.active) {
            if (e.container.parent) e.container.parent.removeChild(e.container);
        }
        pool.inactive.push(...pool.active);
        pool.active = [];
        enemies = [];
    }

    // ══════════════════════════════════════════════════════════════════════
    // NOURRITURE
    // ══════════════════════════════════════════════════════════════════════
    // Pool de graphiques réutilisables
    const foodGfxPool = [];

    function getFoodGfx() {
        return foodGfxPool.pop() || new PIXI.Graphics();
    }

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
        // Dessin initial
        drawFoodItem(f, 0);
        return f;
    }

    function removeFood(f) {
        f.alive = false;
        releaseFoodGfx(f.gfx);
    }

    function spawnFoodBatch(n) {
        for (let i = 0; i < n; i++) {
            const type = Math.random() > 0.45 ? 'plant' : 'meat';
            foodItems.push(makeFood(type));
        }
    }

    function drawFoodItem(f, age) {
        const sc = 1 + Math.sin(age * 0.06 + f.phase) * 0.22;
        const p  = (Math.sin(age * 0.04 + f.phase) * 0.5 + 0.5);
        f.gfx.clear();

        if (f.type === 'plant') {
            // Hexagone pour les plantes
            const r = 4.5 * sc;
            f.gfx.beginFill(0x00ffaa, 0.82);
            f.gfx.lineStyle(0.8, 0x00ffcc, 0.5 + p * 0.4);
            f.gfx.moveTo(r, 0);
            for (let i = 1; i <= 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                f.gfx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            f.gfx.closePath(); f.gfx.endFill();
            // Cœur brillant
            f.gfx.beginFill(0xffffff, 0.18 + p * 0.12);
            f.gfx.drawCircle(0, 0, 1.8 * sc); f.gfx.endFill();
        } else {
            // Diamant pour la viande
            const r = 4.5 * sc;
            f.gfx.beginFill(0xff2055, 0.82);
            f.gfx.lineStyle(0.8, 0xff6688, 0.5 + p * 0.4);
            f.gfx.moveTo(0, -r);
            f.gfx.lineTo(r * 0.65, 0);
            f.gfx.lineTo(0, r);
            f.gfx.lineTo(-r * 0.65, 0);
            f.gfx.closePath(); f.gfx.endFill();
            f.gfx.beginFill(0xffffff, 0.14 + p * 0.08);
            f.gfx.drawCircle(-1, -1.5, 1.2); f.gfx.endFill();
        }
        f.gfx.x = f.x; f.gfx.y = f.y;
    }

    // Frustum culling — ne rend que la nourriture visible
    function isVisible(x, y, margin=60) {
        if (!app) return true;
        const vHW = (app.screen.width  / 2) / GS.camZoom;
        const vHH = (app.screen.height / 2) / GS.camZoom;
        return Math.abs(x - GS.camX) < vHW + margin &&
               Math.abs(y - GS.camY) < vHH + margin;
    }

    // ══════════════════════════════════════════════════════════════════════
    // BACKGROUND
    // ══════════════════════════════════════════════════════════════════════
    function buildBackground(wid) {
        bgLayer.removeChildren();
        gridLayer.removeChildren();
        bgStars = [];
        const conf = WORLDS[wid];

        // ── Grille ──
        const g = new PIXI.Graphics();
        g.lineStyle(0.4, 0xffffff, 0.022);
        for (let x = 0; x <= WORLD_W; x += 180) { g.moveTo(x, 0); g.lineTo(x, WORLD_H); }
        for (let y = 0; y <= WORLD_H; y += 180) { g.moveTo(0, y); g.lineTo(WORLD_W, y); }
        gridLayer.addChild(g);

        // ── Bordure ──
        const b = new PIXI.Graphics();
        b.lineStyle(5, conf.accent, 0.22);
        b.drawRect(0, 0, WORLD_W, WORLD_H);
        // Coins décoratifs
        const corners = [[0,0],[WORLD_W,0],[0,WORLD_H],[WORLD_W,WORLD_H]];
        b.lineStyle(3, conf.accent, 0.5);
        corners.forEach(([cx, cy]) => {
            const sx = cx === 0 ? 1 : -1;
            const sy = cy === 0 ? 1 : -1;
            b.moveTo(cx + sx * 80, cy); b.lineTo(cx, cy); b.lineTo(cx, cy + sy * 80);
        });
        gridLayer.addChild(b);

        // ── Étoiles/particules ambiantes ──
        for (let i = 0; i < 200; i++) {
            const s = new PIXI.Graphics();
            const sz = Math.random() * 2.2 + 0.3;
            s.beginFill(conf.accent, Math.random() * 0.5 + 0.07);
            s.drawCircle(0, 0, sz); s.endFill();
            s.x = Math.random() * WORLD_W;
            s.y = Math.random() * WORLD_H;
            bgLayer.addChild(s);
            bgStars.push({ gfx: s, phase: Math.random() * Math.PI * 2, base: Math.random() * 0.4 + 0.05 });
        }

        // ── Blobs colorés ──
        for (let i = 0; i < 10; i++) {
            const blob = new PIXI.Graphics();
            blob.beginFill(conf.accent, 0.012);
            blob.drawEllipse(0, 0, 250 + Math.random() * 350, 180 + Math.random() * 250);
            blob.endFill();
            blob.x = Math.random() * WORLD_W;
            blob.y = Math.random() * WORLD_H;
            blob.rotation = Math.random() * Math.PI;
            bgLayer.addChild(blob);
        }

        // ── Nébuleuses spécifiques au biome ──
        if (wid === 5) {
            // Sol terrestre : lignes de terrain
            for (let i = 0; i < 15; i++) {
                const line = new PIXI.Graphics();
                line.lineStyle(60 + Math.random() * 100, 0x1a3a18, 0.03);
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
        if (!mm || !player || !player.alive) return;
        const sx = MM_W / WORLD_W;
        const sy = MM_H / WORLD_H;

        mm.clearRect(0, 0, MM_W, MM_H);
        mm.fillStyle = '#010612';
        mm.fillRect(0, 0, MM_W, MM_H);

        // Grille légère
        mm.strokeStyle = 'rgba(0,255,200,0.06)';
        mm.lineWidth = 0.5;
        for (let x = 0; x < MM_W; x += MM_W/5) { mm.beginPath(); mm.moveTo(x,0); mm.lineTo(x,MM_H); mm.stroke(); }
        for (let y = 0; y < MM_H; y += MM_H/5) { mm.beginPath(); mm.moveTo(0,y); mm.lineTo(MM_W,y); mm.stroke(); }

        // Nourriture
        for (const f of foodItems) {
            if (!f.alive) continue;
            mm.fillStyle = f.type === 'plant' ? 'rgba(0,255,170,0.35)' : 'rgba(255,32,85,0.35)';
            mm.fillRect(f.x * sx - 0.5, f.y * sy - 0.5, 1, 1);
        }

        // Ennemis
        for (const e of enemies) {
            if (!e.alive) continue;
            const isLarger = e.size > player.size * 0.85;
            mm.fillStyle = isLarger ? 'rgba(255,32,85,0.85)' : 'rgba(0,255,200,0.55)';
            mm.beginPath();
            mm.arc(e.x * sx, e.y * sy, Math.max(1, e.size * sx * 3), 0, Math.PI * 2);
            mm.fill();
        }

        // Viewport rect
        const vw = (app.screen.width  / GS.camZoom) * sx;
        const vh = (app.screen.height / GS.camZoom) * sy;
        const vx = (GS.camX - app.screen.width  / (2 * GS.camZoom)) * sx;
        const vy = (GS.camY - app.screen.height / (2 * GS.camZoom)) * sy;
        mm.strokeStyle = 'rgba(255,255,255,0.18)';
        mm.lineWidth = 0.8;
        mm.strokeRect(vx, vy, vw, vh);

        // Joueur
        mm.shadowColor = '#00ffc8'; mm.shadowBlur = 8;
        mm.fillStyle = '#ffffff';
        mm.beginPath();
        mm.arc(player.x * sx, player.y * sy, 3.5, 0, Math.PI * 2);
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
        cont.innerHTML = '';

        opts.forEach(key => {
            const m = MUTATIONS[key];
            const btn = document.createElement('button');
            btn.className = 'mut-btn';
            btn.innerHTML = `
                <div class="mut-icon" style="background:${m.color}18;border:1px solid ${m.color}40">${m.icon}</div>
                <div class="mut-info">
                    <div class="mut-name" style="color:${m.color}">${m.name}</div>
                    <div class="mut-desc">${m.desc}</div>
                </div>`;
            btn.addEventListener('click', () => {
                player.mutations[key] = true;
                player.draw();
                document.getElementById('mutation-modal').classList.add('hidden');
                document.getElementById('pause-overlay').classList.remove('show');
                GS.paused = false;
                GS.mutCooldown = 350;
                sfxMut();
                pulseRing(m.color);
                updateAbilityBar();
                toast(`✦ ${m.name} acquis !`, m.color);
            });
            cont.appendChild(btn);
        });

        document.getElementById('mutation-modal').classList.remove('hidden');
        GS.paused = true;
        sfxMut();
    }

    function updateAbilityBar() {
        const bar = document.getElementById('ability-bar');
        if (!bar) return;
        const keys = Object.keys(player.mutations);
        if (keys.length === 0) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        bar.innerHTML = '<div class="ability-title">◈ MUTATIONS</div>';
        keys.forEach(k => {
            const m = MUTATIONS[k];
            const chip = document.createElement('div');
            chip.className = 'ability-chip';
            chip.innerHTML = `<div class="ability-dot" style="background:${m.color};color:${m.color}"></div>${m.icon} ${m.name}`;
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
            } while (player && Math.hypot(ex - player.x, ey - player.y) < 350);
            const e = getEnemy(ex, ey, size, diet);
            enemies.push(e);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // TRANSITIONS DE MONDE
    // ══════════════════════════════════════════════════════════════════════
    function transitionWorld(id) {
        if (GS.world === id) return;
        GS.world = id;
        GS.worldsVisited.add(id);
        const conf = WORLDS[id];
        GS.terrestrial = conf.terrestrial || false;

        app.renderer.backgroundColor = conf.bg;
        buildBackground(id);

        // Clear food
        for (const f of foodItems) removeFood(f);
        foodItems = [];
        spawnFoodBatch(conf.food);

        // Clear & respawn enemies
        clearAllEnemies();
        spawnEnemies(conf.enemies);

        document.getElementById('h-biome').textContent = conf.name;
        GS.shakeAmt = 18;
        sfxWorld();
        toast(`🌍 Biome découvert : ${conf.name}`, '#22d3ee');
        showBanner(conf.name, '◈ NOUVEAU BIOME ◈');

        // Flash de transition
        const fl = new PIXI.Graphics();
        fl.beginFill(conf.accent, 0.3);
        fl.drawRect(-9999, -9999, 99999, 99999);
        fl.endFill();
        app.stage.addChild(fl);
        let fa = 0.3;
        const fade = () => {
            fa -= 0.016;
            fl.alpha = fa;
            if (fa <= 0) { app.stage.removeChild(fl); fl.destroy(); app.ticker.remove(fade); }
        };
        app.ticker.add(fade);
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
            GS.kills * 50 +
            GS.worldsVisited.size * 200 +
            Object.keys(player.mutations).length * 100 +
            elapsed * 2
        );

        document.getElementById('go-size').textContent   = Math.floor(player.size);
        document.getElementById('go-mut').textContent    = Object.keys(player.mutations).length;
        document.getElementById('go-worlds').textContent = GS.worldsVisited.size + ' / 5';
        document.getElementById('go-kills').textContent  = GS.kills;
        document.getElementById('go-time').textContent   = `${mm_}m ${ss.toString().padStart(2,'0')}s`;
        document.getElementById('go-score').textContent  = score.toLocaleString();

        setTimeout(() => {
            document.getElementById('gameover-modal').classList.remove('hidden');
        }, 600);
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
            document.getElementById('stage-txt').textContent = s.name;
            showBanner(s.name, s.sub);
            sfxLevel();
            pulseRing('#a78bfa');
        }
        // Indice prochain stade
        const nextIdx = Math.min(idx + 1, STAGES.length - 1);
        if (nextIdx > idx) {
            const diff = STAGES[nextIdx].size - player.size;
            document.getElementById('next-hint').textContent =
                diff > 0 ? `↑ ${STAGES[nextIdx].name} dans ${Math.ceil(diff)} taille` : '';
        } else {
            document.getElementById('next-hint').textContent = '◈ Stade maximum atteint';
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // HUD UPDATE
    // ══════════════════════════════════════════════════════════════════════
    function updateHUD() {
        document.getElementById('h-size').textContent  = Math.floor(player.size);
        document.getElementById('h-kills').textContent = GS.kills;

        const hp = player.hp / player.maxHp;
        document.getElementById('h-hp-bar').style.width = Math.max(0, player.hp) + '%';
        document.getElementById('h-hp-bar').style.background =
            hp > 0.65 ? 'linear-gradient(90deg,#00ffc8,#22d3ee)' :
            hp > 0.35 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                        'linear-gradient(90deg,#ff2055,#ff6088)';

        document.getElementById('h-hunger-bar').style.width = Math.max(0, player.hunger) + '%';

        const pct = Math.min(100, (player.size / MAX_SIZE) * 100);
        document.getElementById('prog-fill').style.width = pct + '%';
        document.getElementById('prog-pct').textContent = Math.floor(pct) + '%';
    }

    // ══════════════════════════════════════════════════════════════════════
    // BOUCLE PRINCIPALE
    // ══════════════════════════════════════════════════════════════════════
    function mainLoop(ticker) {
        if (!GS.running || GS.paused || !player) return;

        const dt = Math.min(ticker.deltaTime, 4.5);
        GS.age += dt;
        GS.mutCooldown = Math.max(0, GS.mutCooldown - dt);

        // ── JOUEUR ─────────────────────────────────────────────────────
        const wx = (GS.mouseX - app.screen.width  / 2) / GS.camZoom + GS.camX;
        const wy = (GS.mouseY - app.screen.height / 2) / GS.camZoom + GS.camY;
        player.update(dt, wx, wy);

        // Trail du joueur (carnivore uniquement)
        if (player.diet === 'carnivore' && GS.age % 4 < dt) {
            spawnTrail(player.x, player.y, player.color, 2);
        }

        if (!player.alive) { gameOver(); return; }

        // ── ENNEMIS ────────────────────────────────────────────────────
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!e.alive) { releaseEnemy(e); enemies.splice(i, 1); continue; }

            // IA améliorée
            e.aiTimer -= dt;
            if (e.aiTimer <= 0) {
                e.aiTimer = 80 + Math.random() * 150;
                e.aiTarget.x = Math.random() * WORLD_W;
                e.aiTarget.y = Math.random() * WORLD_H;
            }

            const edx = player.x - e.x;
            const edy = player.y - e.y;
            const ed  = Math.hypot(edx, edy);
            let tx = e.aiTarget.x, ty = e.aiTarget.y;

            const camoFactor = player.mutations.camouflage ? 0.45 : 1;
            const detectionRange = 380 * camoFactor;

            if (ed < detectionRange) {
                if (e.diet === 'carnivore' && e.size > player.size * 0.82) {
                    // Chasse le joueur
                    tx = player.x;
                    ty = player.y;
                } else if (e.size < player.size * 1.2) {
                    // Fuit le joueur
                    tx = e.x - edx * 1.2;
                    ty = e.y - edy * 1.2;
                }
            }

            // Les ennemis herbivores cherchent la nourriture verte
            if (e.diet === 'herbivore' && ed >= detectionRange) {
                let closestDist = Infinity, closestFood = null;
                for (const f of foodItems) {
                    if (!f.alive || f.type !== 'plant') continue;
                    const fd = Math.hypot(f.x - e.x, f.y - e.y);
                    if (fd < closestDist && fd < 200) { closestDist = fd; closestFood = f; }
                }
                if (closestFood) { tx = closestFood.x; ty = closestFood.y; }
            }

            e.update(dt, tx, ty);

            // Poison de proximité (mutation toxin du joueur)
            if (player.mutations.toxin) {
                const ps = player.getStats();
                const toxRange = player.size * 2.5;
                if (ed < toxRange && !e.poisoned) {
                    e.poison(ps.poison);
                }
            }

            // ── COLLISION JOUEUR ↔ ENNEMI ──
            if (ed < player.size + e.size - 4) {
                if (player.size > e.size * 1.15) {
                    // Joueur mange l'ennemi
                    player.eatEnemy(e.size);
                    GS.kills++;
                    GS.score += Math.floor(e.size * 15 + 30);

                    // Combo kills
                    const now = GS.age;
                    if (now - GS.lastKillTime < 120) {
                        GS.comboKills++;
                        if (GS.comboKills >= 3) {
                            toast(`🔥 COMBO x${GS.comboKills} !`, '#ff2055');
                            GS.score += GS.comboKills * 25;
                        }
                    } else {
                        GS.comboKills = 1;
                    }
                    GS.lastKillTime = now;

                    const killMsg = player.diet === 'carnivore'
                        ? `🦷 +${Math.floor(e.size)} dévoré`
                        : `⚡ +${Math.floor(e.size)} absorbé`;
                    addKillFeed(killMsg);
                    spawnBurst(e.x, e.y, e.color, 14, 220);
                    sfxKill();
                    GS.shakeAmt = 6;
                    document.getElementById('h-kills').textContent = GS.kills;
                    releaseEnemy(e); enemies.splice(i, 1);

                    // Respawn différé
                    const respawnDelay = 3000 + Math.random() * 2000;
                    setTimeout(() => {
                        if (!GS.running) return;
                        const conf = WORLDS[GS.world];
                        const [minS, maxS] = conf.enemySizeRange;
                        const diet2 = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
                        let rx, ry;
                        do { rx = Math.random() * WORLD_W; ry = Math.random() * WORLD_H; }
                        while (player && Math.hypot(rx - player.x, ry - player.y) < 300);
                        const ne = getEnemy(rx, ry, minS + Math.random() * (maxS - minS), diet2);
                        enemies.push(ne);
                    }, respawnDelay);

                } else if (e.size > player.size * 1.18 && e.diet === 'carnivore') {
                    // Ennemi attaque le joueur
                    const dmg = e.getStats().damage * 3.5;
                    const taken = player.takeDamage(dmg);
                    GS.shakeAmt = 10;
                    sfxHurt();
                    spawnDmgText(player.x, player.y, `-${Math.floor(taken)} HP`, '#ff2055');
                }
            }
        }

        // ── NOURRITURE ─────────────────────────────────────────────────
        const pSt   = player.getStats();
        const magR  = player.size * pSt.magnet;
        const eatR  = player.size + 5;
        const toEat = [];

        for (let i = 0; i < foodItems.length; i++) {
            const f = foodItems[i];
            if (!f.alive) continue;
            f.age += dt;

            const fdx = f.x - player.x;
            const fdy = f.y - player.y;
            const fd  = Math.sqrt(fdx * fdx + fdy * fdy);

            // Frustum culling pour le dessin
            if (isVisible(f.x, f.y)) {
                drawFoodItem(f, f.age);
            }

            // Aimantation herbivore
            const compatible = (player.diet === 'herbivore' && f.type === 'plant') ||
                               (player.diet === 'carnivore' && f.type === 'meat');

            if (compatible && fd < magR && fd > 0) {
                const force = 14 * (1 - fd / magR);
                f.x -= (fdx / fd) * force * dt;
                f.y -= (fdy / fd) * force * dt;
            }

            // Collision nourriture
            if (fd < eatR) {
                if (player.eat(f.type, 1)) {
                    toEat.push(i);
                    sfxEat();
                    GS.totalFoodEaten++;
                    spawnBurst(f.x, f.y,
                        f.type === 'plant' ? 0x00ffaa : 0xff2055, 4, 80);
                }
            }
        }

        // Supprimer nourriture mangée (ordre inverse)
        for (let i = toEat.length - 1; i >= 0; i--) {
            const idx = toEat[i];
            removeFood(foodItems[idx]);
            foodItems.splice(idx, 1);
        }

        // Respawn nourriture périodique
        GS.foodRespawnTimer += dt;
        if (GS.foodRespawnTimer > 60) {
            GS.foodRespawnTimer = 0;
            const target = WORLDS[GS.world].food;
            const missing = target - foodItems.length;
            if (missing > 0) {
                const batch = Math.min(missing, 8);
                for (let i = 0; i < batch; i++) {
                    const type = Math.random() > 0.45 ? 'plant' : 'meat';
                    foodItems.push(makeFood(type));
                }
            }
        }

        // ── MUTATIONS DÉCLENCHEMENT ────────────────────────────────────
        const mutThresh = 16 + Object.keys(player.mutations).length * 20;
        if (player.targetSize > mutThresh && GS.mutCooldown <= 0) {
            GS.mutCooldown = 350;
            showMutationModal();
        }

        // ── PROGRESSION / STAGES ───────────────────────────────────────
        checkStage();

        for (let id = 2; id <= 5; id++) {
            if (id > GS.world && player.size >= WORLDS[id].unlockSize) {
                transitionWorld(id); break;
            }
        }

        // ── PARTICULES ────────────────────────────────────────────────
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.update(dt);
            if (!p.alive) {
                p.destroy();
                particles.splice(i, 1);
            }
        }

        // ── ANIMATION ÉTOILES BG ──────────────────────────────────────
        for (const s of bgStars) {
            s.gfx.alpha = s.base + Math.sin(GS.age * 0.018 + s.phase) * 0.15;
        }

        // ── CAMÉRA ───────────────────────────────────────────────────
        // Zoom inversement proportionnel à la taille, avec limites confortables
        const targetZoom = Math.max(0.28, Math.min(1.5, 20 / Math.max(player.size, 1)));
        GS.camZoom += (targetZoom - GS.camZoom) * 0.055;

        GS.camX += (player.x - GS.camX) * 0.1;
        GS.camY += (player.y - GS.camY) * 0.1;

        // Screen shake
        let cx = GS.camX, cy = GS.camY;
        if (GS.shakeAmt > 0.3) {
            cx += (Math.random() - 0.5) * GS.shakeAmt;
            cy += (Math.random() - 0.5) * GS.shakeAmt;
            GS.shakeAmt *= 0.83;
        }

        worldContainer.pivot.set(cx, cy);
        worldContainer.position.set(app.screen.width / 2, app.screen.height / 2);
        worldContainer.scale.set(GS.camZoom);

        // Parallaxe subtil du bg (fixé : pas de déplacement hors-bounds)
        bgLayer.pivot.set((cx - WORLD_W / 2) * 0.04, (cy - WORLD_H / 2) * 0.04);

        // ── HUD ─────────────────────────────────────────────────────
        updateHUD();
        drawMinimap();
    }

    // ══════════════════════════════════════════════════════════════════════
    // INITIALISATION (DOM READY)
    // ══════════════════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', () => {

        // ── PIXI APP ────────────────────────────────────────────────
        app = new PIXI.Application({
            resizeTo: window,
            backgroundColor: WORLDS[1].bg,
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            autoDensity: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        document.getElementById('game-container').appendChild(app.view);
        app.view.style.position = 'absolute';
        app.view.style.inset    = '0';

        // ── LAYERS (ordre d'empilement) ──────────────────────────────
        worldContainer = new PIXI.Container();
        bgLayer        = new PIXI.Container();
        gridLayer      = new PIXI.Container();
        foodLayer      = new PIXI.Container();
        entityLayer    = new PIXI.Container();
        fxLayer        = new PIXI.Container();

        worldContainer.addChild(bgLayer, gridLayer, foodLayer, entityLayer, fxLayer);
        app.stage.addChild(worldContainer);

        // ── INPUT ────────────────────────────────────────────────────
        window.addEventListener('mousemove', e => { GS.mouseX = e.clientX; GS.mouseY = e.clientY; });
        window.addEventListener('touchmove', e => {
            e.preventDefault();
            GS.mouseX = e.touches[0].clientX; GS.mouseY = e.touches[0].clientY;
        }, { passive: false });
        window.addEventListener('touchstart', e => {
            GS.mouseX = e.touches[0].clientX; GS.mouseY = e.touches[0].clientY;
        });

        // ── BOUTONS HUD ──────────────────────────────────────────────
        document.getElementById('btn-pause').addEventListener('click', () => {
            if (!GS.running) return;
            GS.paused = !GS.paused;
            document.getElementById('btn-pause').textContent = GS.paused ? '▶ Reprendre' : '⏸ Pause';
            document.getElementById('pause-overlay').classList.toggle('show', GS.paused);
        });

        document.getElementById('btn-mute').addEventListener('click', () => {
            GS.muted = !GS.muted;
            document.getElementById('btn-mute').textContent = GS.muted ? '🔇 Muet' : '🔊 Son';
            if (ambientNode) {
                if (GS.muted) { try { ambientNode.disconnect(); } catch(_){} }
                else          { try { ambientNode.connect(audioCtx.destination); } catch(_){} }
            }
        });

        document.getElementById('btn-info').addEventListener('click', () => {
            document.getElementById('info-modal').classList.toggle('hidden');
        });
        document.getElementById('close-info-btn').addEventListener('click', () => {
            document.getElementById('info-modal').classList.add('hidden');
        });
        document.getElementById('info-modal').addEventListener('click', e => {
            if (e.target === document.getElementById('info-modal'))
                document.getElementById('info-modal').classList.add('hidden');
        });

        // ── START GAME ───────────────────────────────────────────────
        function startGame(diet) {
            initAudio();
            document.getElementById('start-menu').classList.add('hidden');

            // Reset état
            GS.running=false; GS.paused=false;
            GS.age=0; GS.kills=0; GS.score=0;
            GS.lastStageIdx=0; GS.mutCooldown=0;
            GS.world=1; GS.worldsVisited=new Set([1]);
            GS.terrestrial=false; GS.shakeAmt=0;
            GS.totalFoodEaten=0; GS.comboKills=0; GS.foodRespawnTimer=0;

            // Clear tout
            for (const f of foodItems) removeFood(f); foodItems=[];
            clearAllEnemies();
            for (const p of particles) p.destroy(); particles=[];

            // Build monde
            buildBackground(1);
            app.renderer.backgroundColor = WORLDS[1].bg;
            spawnFoodBatch(WORLDS[1].food);

            // Créer joueur
            player = new Entity(WORLD_W / 2, WORLD_H / 2, MIN_SIZE, diet, true);
            entityLayer.addChild(player.container);

            GS.camX = player.x; GS.camY = player.y; GS.camZoom = 1;
            GS.startTime = Date.now();

            document.getElementById('h-biome').textContent = WORLDS[1].name;
            document.getElementById('ability-bar').style.display = 'none';
            document.getElementById('ability-bar').innerHTML = '';

            spawnEnemies(WORLDS[1].enemies);
            GS.running = true;

            sfxLevel();
            showBanner('Unicellulaire', 'Organisme primitif');

            // Lance la boucle
            app.ticker.add(mainLoop);
        }

        document.getElementById('btn-herb').addEventListener('click', () => startGame('herbivore'));
        document.getElementById('btn-carn').addEventListener('click', () => startGame('carnivore'));

        // ── RESIZE ──────────────────────────────────────────────────
        window.addEventListener('resize', () => { if (app) app.resize(); });
    });

})();
