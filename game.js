// ============================================================================
// EVOSPHERE v2.5 — FIXED (écran noir corrigé + tous bugs)
// ============================================================================
(function () {
    'use strict';

    // ── CONSTANTS ──────────────────────────────────────────────────────────
    const WORLD_W  = 5000;
    const WORLD_H  = 5000;
    const MIN_SIZE = 10;
    const MM_W = 130, MM_H = 130;

    const WORLDS = {
        1: { name:'Abysse Primordiale',   bg:0x030812, accent:0x00ffc8, food:350, enemies:22, unlockSize:0   },
        2: { name:'Récif Biolumineux',    bg:0x010e1a, accent:0x00aaff, food:420, enemies:28, unlockSize:50  },
        3: { name:'Épave Abyssale',       bg:0x0c0d14, accent:0xff6b9d, food:390, enemies:34, unlockSize:85  },
        4: { name:'Zone Thermale',        bg:0x160b06, accent:0xffaa00, food:320, enemies:40, unlockSize:120 },
        5: { name:'Biosphère Terrestre',  bg:0x0c1410, accent:0x55ff44, food:500, enemies:48, unlockSize:160, terrestrial:true }
    };

    const STAGES = [
        { size:0,   name:'Unicellulaire',      sub:'Organisme primitif'        },
        { size:30,  name:'Multicellulaire',    sub:'Division cellulaire'       },
        { size:55,  name:'Invertébré',         sub:'Première colonie'          },
        { size:90,  name:'Créature Primitive', sub:'Vertèbres embryonnaires'   },
        { size:130, name:'Créature Évoluée',   sub:'Système nerveux complexe'  },
        { size:170, name:'Créature Suprême',   sub:'Apex Predator'             }
    ];

    const MUTATIONS = {
        flagella:       { name:'Flagelle',        icon:'🌀', color:'#ffaa00', speedMult:1.35, desc:'+35% vitesse' },
        spike:          { name:'Épine Venimeuse', icon:'⚡', color:'#ff2055', damageMult:1.6, desc:'+60% dégâts' },
        shield:         { name:'Cuticule',        icon:'🛡', color:'#6b9ef5', defenseMult:1.5, desc:'+50% résistance' },
        neuron:         { name:'Neurone Étendu',  icon:'🔮', color:'#a78bfa', magnetMult:1.8, desc:'+80% détection nourriture' },
        chemosynthesis: { name:'Chimiosynthèse',  icon:'💚', color:'#00ffcc', foodEff:1.6,    desc:'+60% assimilation' },
        camouflage:     { name:'Camouflage',      icon:'👁', color:'#cbd5e1', camo:true,      desc:'Réduit l\'aggro ennemis' },
        regeneration:   { name:'Régénération',    icon:'❤️', color:'#22d3ee', regenRate:0.5,  desc:'Regénère HP hors combat' }
    };

    // ── GLOBAL STATE ───────────────────────────────────────────────────────
    // PIXI objects — assigned inside DOMContentLoaded
    let app, worldContainer, bgLayer, gridLayer, foodLayer, entityLayer, fxLayer;

    // Game objects
    let player = null;
    let enemies = [];
    let foodItems = [];
    let particles = [];
    let bgStars = [];

    // Enemy pool
    const pool = { inactive:[], active:[] };

    // Game state
    const GS = {
        running:false, paused:false, muted:false,
        age:0,
        camX:WORLD_W/2, camY:WORLD_H/2, camZoom:1, shakeAmt:0,
        mouseX:0, mouseY:0,
        world:1, worldsVisited:new Set([1]),
        terrestrial:false,
        kills:0, startTime:0,
        lastStageIdx:0,
        mutCooldown:0
    };

    // ── AUDIO ──────────────────────────────────────────────────────────────
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(_){}
        }
    }
    function sfx(freq, dur, type='sine', vol=0.22) {
        if (GS.muted || !audioCtx) return;
        try {
            const t = audioCtx.currentTime;
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.connect(g); g.connect(audioCtx.destination);
            o.type = type;
            o.frequency.setValueAtTime(freq, t);
            o.frequency.exponentialRampToValueAtTime(freq*0.4, t+dur);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.001, t+dur);
            o.start(t); o.stop(t+dur);
        } catch(_){}
    }

    // ── TOAST ──────────────────────────────────────────────────────────────
    let toastTimer = null;
    function toast(msg) {
        const el = document.getElementById('notif');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
    }

    // ── STAGE BANNER ───────────────────────────────────────────────────────
    let bannerTimer = null;
    function showBanner(name, sub) {
        const el = document.getElementById('stage-banner');
        if (!el) return;
        document.getElementById('sb-name').textContent = name;
        document.getElementById('sb-sub').textContent  = sub;
        el.classList.add('show');
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }

    // ── PULSE RING ─────────────────────────────────────────────────────────
    function pulseRing() {
        const el = document.getElementById('pulse-ring');
        if (!el) return;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'pulse-expand 0.7s ease-out forwards';
    }

    // ── PARTICLES ──────────────────────────────────────────────────────────
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
            this.x += this.vx*dt*0.016;
            this.y += this.vy*dt*0.016;
            this.vx *= 0.91; this.vy *= 0.91;
            this.life -= dt;
            if (this.life <= 0) { this.alive=false; this.gfx.clear(); return; }
            const a = Math.max(0, this.life/this.maxLife);
            this.gfx.clear();
            this.gfx.beginFill(this.color, a*0.85);
            this.gfx.drawCircle(0, 0, this.size*(0.3+a*0.7));
            this.gfx.endFill();
            this.gfx.x = this.x; this.gfx.y = this.y;
        }
    }

    function spawnBurst(x, y, color, count=10, speed=180) {
        for (let i=0;i<count;i++) {
            const a = (i/count)*Math.PI*2;
            const sp = speed*(0.5+Math.random()*0.5);
            particles.push(new Particle(x,y, Math.cos(a)*sp, Math.sin(a)*sp, color, 2+Math.random()*3, 35));
        }
    }

    // ── ENTITY ─────────────────────────────────────────────────────────────
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
            this.color = diet==='herbivore' ? 0x00ffcc : 0xff2055;
            this.wiggle = Math.random()*Math.PI*2;
            this.lastDamagedAge = -9999;
            this.aiTarget = { x:Math.random()*WORLD_W, y:Math.random()*WORLD_H };
            this.aiTimer = 0;

            this.container = new PIXI.Container();
            this.body = new PIXI.Graphics();
            this.eye  = new PIXI.Graphics();
            this.container.addChild(this.body, this.eye);
            this.draw();
            // Container added to entityLayer by caller
        }

        getBonus(stat) {
            for (const [key, def] of Object.entries(MUTATIONS)) {
                if (this.mutations[key] && def[stat]) return def[stat];
            }
            return 1;
        }

        getStats() {
            return {
                speed:   (this.diet==='herbivore' ? 0.4 : 0.62) * this.getBonus('speedMult') * Math.sqrt(MIN_SIZE/Math.max(this.size,MIN_SIZE)),
                magnet:  (this.diet==='herbivore' ? 7 : 2) * this.getBonus('magnetMult'),
                damage:  (this.diet==='carnivore' ? 1.3 : 0.4) * this.getBonus('damageMult'),
                defense: this.getBonus('defenseMult'),
                foodEff: this.getBonus('foodEff') || 1,
                regen:   this.mutations.regeneration ? MUTATIONS.regeneration.regenRate : 0
            };
        }

        draw() {
            if (!this.body) return;
            this.body.clear();
            this.eye.clear();
            const s = this.size;
            const mc = Object.keys(this.mutations).length;

            // Glow
            this.body.beginFill(this.color, 0.07);
            this.body.drawCircle(0,0,s*1.5);
            this.body.endFill();

            // Body
            this.body.lineStyle(1.5, 0xffffff, 0.25);
            this.body.beginFill(this.color, 0.9);
            if (this.diet==='carnivore') {
                this._drawStar(s, 5+Math.min(mc,4));
            } else {
                this.body.drawCircle(0,0,s);
                if (mc>0) {
                    this.body.beginFill(0xffffff,0.1);
                    this.body.drawCircle(0,0,s*0.42);
                }
            }
            this.body.endFill();

            // Mutation visuals
            if (this.mutations.flagella) {
                this.body.lineStyle(1.5, 0xffaa00, 0.7);
                for (let i=0;i<3;i++) {
                    const ang = Math.PI+(i-1)*0.5;
                    this.body.moveTo(Math.cos(ang)*s, Math.sin(ang)*s);
                    this.body.lineTo(Math.cos(ang)*s*3.2, Math.sin(ang)*s*3.2);
                }
            }
            if (this.mutations.spike) {
                this.body.lineStyle(0);
                for (let i=0;i<6;i++) {
                    const ang=(i/6)*Math.PI*2;
                    this.body.beginFill(0xff2055,0.9);
                    this.body.moveTo(Math.cos(ang+0.15)*s, Math.sin(ang+0.15)*s);
                    this.body.lineTo(Math.cos(ang)*s*1.55, Math.sin(ang)*s*1.55);
                    this.body.lineTo(Math.cos(ang-0.15)*s, Math.sin(ang-0.15)*s);
                    this.body.endFill();
                }
            }

            // Eye
            this.eye.beginFill(0xffffff, 0.95);
            this.eye.drawCircle(s*0.35, -s*0.2, s*0.15);
            this.eye.endFill();
            this.eye.beginFill(0x111111);
            this.eye.drawCircle(s*0.38, -s*0.18, s*0.08);
            this.eye.endFill();
        }

        _drawStar(r, pts) {
            const inner = r*0.58, step=(Math.PI*2)/(pts*2);
            this.body.moveTo(0,-r);
            for (let i=1;i<pts*2;i++) {
                const rad = i%2===0 ? r : inner;
                const a = i*step - Math.PI/2;
                this.body.lineTo(Math.cos(a)*rad, Math.sin(a)*rad);
            }
            this.body.closePath();
        }

        eat(type, amt=1) {
            const ok = (this.diet==='herbivore' && type==='plant') ||
                       (this.diet==='carnivore' && type==='meat');
            if (!ok) return false;
            const eff = this.getStats().foodEff;
            this.targetSize = Math.min(250, this.targetSize + amt*eff*0.5);
            this.hunger = Math.min(100, this.hunger + 18*eff);
            return true;
        }

        takeDamage(amt) {
            this.hp = Math.max(0, this.hp - amt/this.getStats().defense);
            this.lastDamagedAge = GS.age;
            if (this.hp<=0) this.alive=false;
        }

        reset(x, y, size, diet) {
            this.x=x; this.y=y;
            this.vx=0; this.vy=0;
            this.size=size; this.targetSize=size;
            this.diet=diet; this.mutations={};
            this.hp=100; this.maxHp=100; this.hunger=100;
            this.alive=true;
            this.color = diet==='herbivore' ? 0x00ffcc : 0xff2055;
            this.draw();
        }

        update(dt, tx=null, ty=null) {
            if (!this.alive) return;

            // Hunger
            this.hunger = Math.max(0, this.hunger - 0.08*dt);
            if (this.hunger<15) this.takeDamage(0.25*dt);

            // Regen (hors combat)
            if (this.isPlayer) {
                const st = this.getStats();
                if (st.regen>0 && (GS.age - this.lastDamagedAge)*0.016 > 4) {
                    this.hp = Math.min(this.maxHp, this.hp + st.regen*dt);
                }
            }

            // Grow
            if (this.size < this.targetSize) {
                this.size += Math.min(0.18*dt, this.targetSize - this.size);
                this.draw();
            }

            // Move
            if (tx!==null && ty!==null) {
                const dx=tx-this.x, dy=ty-this.y;
                const d=Math.sqrt(dx*dx+dy*dy);
                if (d>3) {
                    const sp = this.getStats().speed*0.08;
                    this.vx += (dx/d)*sp*dt;
                    this.vy += (dy/d)*sp*dt;
                }
            }

            // Friction
            const fr = GS.terrestrial ? 0.82 : 0.93;
            this.vx *= fr; this.vy *= fr;
            this.x += this.vx*dt;
            this.y += this.vy*dt;

            // Bounds
            this.x = Math.max(this.size, Math.min(WORLD_W-this.size, this.x));
            this.y = Math.max(this.size, Math.min(WORLD_H-this.size, this.y));

            // Render
            if (this.container) {
                this.container.x = this.x;
                this.container.y = this.y;
                const spd = Math.sqrt(this.vx*this.vx+this.vy*this.vy);
                if (spd>1) {
                    this.container.rotation = Math.atan2(this.vy, this.vx);
                    const st = 1+Math.min(spd,8)*0.012;
                    this.body.scale.set(st, 1/st);
                } else {
                    this.wiggle += 0.03*dt;
                    const b = Math.sin(this.wiggle)*0.016;
                    this.body.scale.set(1+b, 1-b);
                    this.container.rotation *= 0.92;
                }
            }
        }
    }

    // ── ENEMY POOL ─────────────────────────────────────────────────────────
    function getEnemy(x, y, size, diet) {
        let e;
        if (pool.inactive.length>0) {
            e = pool.inactive.pop();
            e.reset(x, y, size, diet);
        } else {
            e = new Entity(x, y, size, diet, false);
        }
        // Always add container to entityLayer
        if (!e.container.parent) entityLayer.addChild(e.container);
        pool.active.push(e);
        return e;
    }

    function releaseEnemy(e) {
        e.alive = false;
        if (e.container.parent) e.container.parent.removeChild(e.container);
        const idx = pool.active.indexOf(e);
        if (idx!==-1) pool.active.splice(idx,1);
        pool.inactive.push(e);
    }

    function clearAllEnemies() {
        for (const e of pool.active) {
            if (e.container.parent) e.container.parent.removeChild(e.container);
        }
        pool.inactive.push(...pool.active);
        pool.active=[]; enemies=[];
    }

    // ── FOOD ───────────────────────────────────────────────────────────────
    function makeFood(type, x, y) {
        const g = new PIXI.Graphics();
        foodLayer.addChild(g);
        const f = {
            x: x!==undefined ? x : Math.random()*WORLD_W,
            y: y!==undefined ? y : Math.random()*WORLD_H,
            type, gfx:g,
            phase:Math.random()*Math.PI*2,
            alive:true
        };
        foodItems.push(f);
        return f;
    }

    function removeFood(f) {
        f.alive=false;
        if (f.gfx.parent) f.gfx.parent.removeChild(f.gfx);
    }

    function spawnFoodBatch(n) {
        for (let i=0;i<n;i++) {
            makeFood(Math.random()>0.42 ? 'plant' : 'meat');
        }
    }

    function drawFoodItem(f) {
        const sc = 1+Math.sin(GS.age*0.08+f.phase)*0.18;
        const p  = Math.abs(Math.sin(GS.age*0.04+f.phase));
        f.gfx.clear();
        if (f.type==='plant') {
            f.gfx.beginFill(0x00ffaa, 0.78);
            f.gfx.lineStyle(0.5, 0x00ffcc, 0.4+p*0.4);
            for (let i=0;i<6;i++) {
                const a=(i/6)*Math.PI*2, r=4*sc;
                i===0 ? f.gfx.moveTo(Math.cos(a)*r, Math.sin(a)*r)
                       : f.gfx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
            }
            f.gfx.closePath(); f.gfx.endFill();
            f.gfx.beginFill(0xffffff, 0.12+p*0.08);
            f.gfx.drawCircle(0,0,1.5*sc); f.gfx.endFill();
        } else {
            const r=4*sc;
            f.gfx.beginFill(0xff2055, 0.78);
            f.gfx.lineStyle(0.5, 0xff6688, 0.4+p*0.4);
            f.gfx.moveTo(0,-r); f.gfx.lineTo(r*0.65,0);
            f.gfx.lineTo(0,r);  f.gfx.lineTo(-r*0.65,0);
            f.gfx.closePath(); f.gfx.endFill();
        }
        f.gfx.x=f.x; f.gfx.y=f.y;
    }

    // ── BACKGROUND ─────────────────────────────────────────────────────────
    function buildBackground(wid) {
        bgLayer.removeChildren(); gridLayer.removeChildren();
        bgStars=[];
        const conf=WORLDS[wid];

        // Grid
        const g = new PIXI.Graphics();
        g.lineStyle(0.5, 0xffffff, 0.025);
        for (let x=0;x<=WORLD_W;x+=200) { g.moveTo(x,0); g.lineTo(x,WORLD_H); }
        for (let y=0;y<=WORLD_H;y+=200) { g.moveTo(0,y); g.lineTo(WORLD_W,y); }
        gridLayer.addChild(g);

        // Border
        const b=new PIXI.Graphics();
        b.lineStyle(4,conf.accent,0.18); b.drawRect(0,0,WORLD_W,WORLD_H);
        gridLayer.addChild(b);

        // Ambient stars
        for (let i=0;i<160;i++) {
            const s=new PIXI.Graphics();
            const sz=Math.random()*1.6+0.3;
            s.beginFill(conf.accent, Math.random()*0.45+0.08);
            s.drawCircle(0,0,sz); s.endFill();
            s.x=Math.random()*WORLD_W; s.y=Math.random()*WORLD_H;
            bgLayer.addChild(s);
            bgStars.push({gfx:s, phase:Math.random()*Math.PI*2, base:Math.random()*0.35+0.05});
        }

        // Blobs
        for (let i=0;i<8;i++) {
            const blob=new PIXI.Graphics();
            blob.beginFill(conf.accent, 0.014);
            blob.drawCircle(0,0,200+Math.random()*300); blob.endFill();
            blob.x=Math.random()*WORLD_W; blob.y=Math.random()*WORLD_H;
            bgLayer.addChild(blob);
        }
    }

    // ── MINIMAP ────────────────────────────────────────────────────────────
    const mmCanvas = document.getElementById('minimap');
    const mm = mmCanvas ? mmCanvas.getContext('2d') : null;

    function drawMinimap() {
        if (!mm || !player || !player.alive) return;
        const sx=MM_W/WORLD_W, sy=MM_H/WORLD_H;
        mm.clearRect(0,0,MM_W,MM_H);
        mm.fillStyle='#010612'; mm.fillRect(0,0,MM_W,MM_H);
        // Food
        for (const f of foodItems) {
            if (!f.alive) continue;
            mm.fillStyle = f.type==='plant' ? '#00ffaa55' : '#ff205555';
            mm.fillRect(f.x*sx-0.5, f.y*sy-0.5, 1, 1);
        }
        // Enemies
        for (const e of enemies) {
            if (!e.alive) continue;
            mm.fillStyle = e.diet==='herbivore' ? '#00ffc877' : '#ff205577';
            mm.beginPath(); mm.arc(e.x*sx,e.y*sy,1.5,0,Math.PI*2); mm.fill();
        }
        // Player
        mm.shadowColor='#00ffc8'; mm.shadowBlur=6;
        mm.fillStyle='#ffffff';
        mm.beginPath(); mm.arc(player.x*sx,player.y*sy,3,0,Math.PI*2); mm.fill();
        mm.shadowBlur=0;
        // Viewport
        const vw=(app.screen.width/GS.camZoom)*sx, vh=(app.screen.height/GS.camZoom)*sy;
        const vx=(GS.camX-app.screen.width/(2*GS.camZoom))*sx;
        const vy=(GS.camY-app.screen.height/(2*GS.camZoom))*sy;
        mm.strokeStyle='rgba(255,255,255,0.2)'; mm.lineWidth=0.8;
        mm.strokeRect(vx,vy,vw,vh);
    }

    // ── MUTATION MODAL ─────────────────────────────────────────────────────
    function showMutationModal() {
        const avail = Object.keys(MUTATIONS).filter(k=>!player.mutations[k]);
        if (avail.length===0) return;
        const opts = avail.sort(()=>Math.random()-0.5).slice(0,3);
        const cont = document.getElementById('mut-choices');
        cont.innerHTML='';
        opts.forEach(key=>{
            const m=MUTATIONS[key];
            const btn=document.createElement('button');
            btn.className='mut-btn';
            btn.innerHTML=`
                <div class="mut-icon" style="background:${m.color}22;border:1px solid ${m.color}44;">
                    ${m.icon}
                </div>
                <div class="mut-info">
                    <div class="mut-name" style="color:${m.color}">${m.name}</div>
                    <div class="mut-desc">${m.desc}</div>
                </div>`;
            btn.addEventListener('click',()=>{
                player.mutations[key]=true;
                player.color = parseInt(m.color.replace('#',''), 16);
                player.draw();
                document.getElementById('mutation-modal').classList.add('hidden');
                GS.paused=false;
                GS.mutCooldown=300;
                sfx(700,0.3,'sine');
                pulseRing();
                updateAbilityBar();
                toast(`✦ ${m.name} acquis!`);
            });
            cont.appendChild(btn);
        });
        document.getElementById('mutation-modal').classList.remove('hidden');
        GS.paused=true;
        sfx(440,0.4,'triangle');
    }

    function updateAbilityBar() {
        const bar=document.getElementById('ability-bar');
        if (!bar) return;
        const keys=Object.keys(player.mutations);
        if (keys.length===0) { bar.style.display='none'; return; }
        bar.style.display='flex';
        bar.innerHTML='';
        keys.forEach(k=>{
            const m=MUTATIONS[k];
            const chip=document.createElement('div');
            chip.className='ability-chip';
            chip.innerHTML=`<div class="ability-dot" style="background:${m.color}"></div>${m.name}`;
            bar.appendChild(chip);
        });
    }

    // ── SPAWN ENEMIES ──────────────────────────────────────────────────────
    function spawnEnemies(count) {
        for (let i=0;i<count;i++) {
            const diet=Math.random()>0.5?'herbivore':'carnivore';
            const size=8+Math.random()*28;
            let ex,ey;
            do {
                ex=Math.random()*WORLD_W; ey=Math.random()*WORLD_H;
            } while(player && Math.hypot(ex-player.x,ey-player.y)<300);
            const e=getEnemy(ex,ey,size,diet);
            enemies.push(e);
        }
    }

    // ── WORLD TRANSITION ───────────────────────────────────────────────────
    function transitionWorld(id) {
        if (GS.world===id) return;
        GS.world=id; GS.worldsVisited.add(id);
        const conf=WORLDS[id];
        GS.terrestrial=conf.terrestrial||false;
        app.renderer.backgroundColor=conf.bg;
        buildBackground(id);
        // Clear food
        for (const f of foodItems) removeFood(f);
        foodItems=[];
        spawnFoodBatch(conf.food);
        // Clear enemies
        clearAllEnemies();
        spawnEnemies(conf.enemies);
        // UI
        document.getElementById('h-biome').textContent=conf.name;
        GS.shakeAmt=15;
        sfx(250,0.6,'sine');
        toast(`🌍 ${conf.name}`);
        // Flash
        const fl=new PIXI.Graphics();
        fl.beginFill(conf.accent,0.25); fl.drawRect(-999999,-999999,9999999,9999999); fl.endFill();
        app.stage.addChild(fl);
        let fa=0.25;
        const fade=()=>{ fa-=0.018; fl.alpha=fa; if(fa<=0){app.stage.removeChild(fl);app.ticker.remove(fade);} };
        app.ticker.add(fade);
    }

    // ── GAME OVER ──────────────────────────────────────────────────────────
    function gameOver() {
        GS.running=false; GS.paused=true;
        const elapsed=Math.floor((Date.now()-GS.startTime)/1000);
        const mm=Math.floor(elapsed/60), ss=elapsed%60;
        document.getElementById('go-size').textContent   = Math.floor(player.size);
        document.getElementById('go-mut').textContent    = Object.keys(player.mutations).length;
        document.getElementById('go-worlds').textContent = GS.worldsVisited.size;
        document.getElementById('go-kills').textContent  = GS.kills;
        document.getElementById('go-time').textContent   = `${mm}m ${ss.toString().padStart(2,'0')}s`;
        document.getElementById('gameover-modal').classList.remove('hidden');
        sfx(150,1.2,'sawtooth',0.15);
    }

    // ── STAGE CHECK ────────────────────────────────────────────────────────
    function checkStage() {
        let idx=0;
        for (let i=STAGES.length-1;i>=0;i--) {
            if (player.size>=STAGES[i].size) { idx=i; break; }
        }
        if (idx>GS.lastStageIdx) {
            GS.lastStageIdx=idx;
            const s=STAGES[idx];
            document.getElementById('stage-txt').textContent=s.name;
            showBanner(s.name, s.sub);
            sfx(600,0.35,'triangle');
        }
    }

    // ── HUD UPDATE ─────────────────────────────────────────────────────────
    function updateHUD() {
        document.getElementById('h-size').textContent = Math.floor(player.size);
        document.getElementById('h-fps').textContent  = Math.round(app.ticker.FPS);
        document.getElementById('h-hp-bar').style.width     = Math.max(0,player.hp)+'%';
        document.getElementById('h-hunger-bar').style.width = Math.max(0,player.hunger)+'%';
        const hp=player.hp/player.maxHp;
        document.getElementById('h-hp-bar').style.background =
            hp>0.6 ? 'linear-gradient(90deg,#00ffc8,#22d3ee)' :
            hp>0.3 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                     'linear-gradient(90deg,#ff2055,#ff6088)';
        const pct=Math.min(100,(player.size/200)*100);
        document.getElementById('prog-fill').style.width=pct+'%';
        document.getElementById('prog-pct').textContent=Math.floor(pct)+'%';
    }

    // ══════════════════════════════════════════════════════════════════════
    // ── INIT (DOM READY) ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', () => {

        // ── PIXI ────────────────────────────────────────────────────────
        app = new PIXI.Application({
            resizeTo: window,
            backgroundColor: WORLDS[1].bg,
            resolution: Math.min(window.devicePixelRatio||1,2),
            autoDensity: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        document.getElementById('game-container').appendChild(app.view);

        // ── LAYERS (must be created before ANY Entity or food) ──────────
        worldContainer = new PIXI.Container();
        bgLayer        = new PIXI.Container();
        gridLayer      = new PIXI.Container();
        foodLayer      = new PIXI.Container();
        entityLayer    = new PIXI.Container();
        fxLayer        = new PIXI.Container();
        fxLayer.blendMode = PIXI.BLEND_MODES.ADD;

        worldContainer.addChild(bgLayer, gridLayer, foodLayer, entityLayer, fxLayer);
        app.stage.addChild(worldContainer);

        // ── INPUT ───────────────────────────────────────────────────────
        window.addEventListener('mousemove', e => { GS.mouseX=e.clientX; GS.mouseY=e.clientY; });
        window.addEventListener('touchmove', e => {
            e.preventDefault();
            GS.mouseX=e.touches[0].clientX; GS.mouseY=e.touches[0].clientY;
        }, {passive:false});
        window.addEventListener('touchstart', e => {
            GS.mouseX=e.touches[0].clientX; GS.mouseY=e.touches[0].clientY;
        });

        // ── BUTTONS ─────────────────────────────────────────────────────
        document.getElementById('btn-pause').addEventListener('click',()=>{
            GS.paused=!GS.paused;
            document.getElementById('btn-pause').textContent = GS.paused ? '▶ Reprendre' : '⏸ Pause';
        });
        document.getElementById('btn-mute').addEventListener('click',()=>{
            GS.muted=!GS.muted;
            document.getElementById('btn-mute').textContent = GS.muted ? '🔇 Muet' : '🔊 Son';
        });
        document.getElementById('btn-info').addEventListener('click',()=>{
            document.getElementById('info-modal').classList.toggle('hidden');
        });
        document.getElementById('info-modal').addEventListener('click', e=>{
            if (e.target===document.getElementById('info-modal'))
                document.getElementById('info-modal').classList.add('hidden');
        });

        // ── START GAME (defined HERE, inside DOMContentLoaded) ──────────
        function startGame(diet) {
            initAudio();
            document.getElementById('start-menu').classList.add('hidden');

            // Reset state
            GS.running=false; GS.paused=false;
            GS.age=0; GS.kills=0; GS.lastStageIdx=0; GS.mutCooldown=0;
            GS.world=1; GS.worldsVisited=new Set([1]);
            GS.terrestrial=false; GS.shakeAmt=0;

            // Clear leftovers
            for (const f of foodItems) removeFood(f); foodItems=[];
            clearAllEnemies();
            for (const p of particles) { if(p.gfx.parent) p.gfx.parent.removeChild(p.gfx); }
            particles=[];

            // Build world first (before entities)
            buildBackground(1);
            spawnFoodBatch(WORLDS[1].food);

            // Create player
            player = new Entity(WORLD_W/2, WORLD_H/2, MIN_SIZE, diet, true);
            entityLayer.addChild(player.container);

            GS.camX=player.x; GS.camY=player.y;
            GS.camZoom=1;
            GS.startTime=Date.now();

            spawnEnemies(WORLDS[1].enemies);

            GS.running=true;
            sfx(550,0.4,'sine');
            showBanner('Unicellulaire','Organisme primitif');
        }

        document.getElementById('btn-herb').addEventListener('click',()=>startGame('herbivore'));
        document.getElementById('btn-carn').addEventListener('click',()=>startGame('carnivore'));

        // ── MAIN LOOP ────────────────────────────────────────────────────
        app.ticker.add(ticker => {
            if (!GS.running || GS.paused || !player) return;

            const dt = Math.min(ticker.deltaTime, 4);
            GS.age += dt;
            GS.mutCooldown = Math.max(0, GS.mutCooldown-dt);

            // ── PLAYER ──────────────────────────────────────────────────
            const wx = (GS.mouseX - app.screen.width/2)  / GS.camZoom + GS.camX;
            const wy = (GS.mouseY - app.screen.height/2) / GS.camZoom + GS.camY;
            player.update(dt, wx, wy);
            if (!player.alive) { gameOver(); return; }

            // ── ENEMIES ─────────────────────────────────────────────────
            for (let i=enemies.length-1;i>=0;i--) {
                const e=enemies[i];
                if (!e.alive) { releaseEnemy(e); enemies.splice(i,1); continue; }

                // AI
                e.aiTimer -= dt;
                if (e.aiTimer<=0) {
                    e.aiTimer=100+Math.random()*160;
                    e.aiTarget.x=Math.random()*WORLD_W;
                    e.aiTarget.y=Math.random()*WORLD_H;
                }

                const edx=player.x-e.x, edy=player.y-e.y;
                const ed=Math.hypot(edx,edy);
                let tx=null, ty=null;

                if (ed<350) {
                    const camoFactor = player.mutations.camouflage ? 0.5 : 1;
                    if (e.diet==='carnivore' && e.size>player.size*0.85) {
                        tx = player.x*camoFactor + e.x*(1-camoFactor);
                        ty = player.y*camoFactor + e.y*(1-camoFactor);
                    } else if (e.size<player.size*1.3) {
                        // Flee: move AWAY from player
                        tx = e.x - edx*0.8;
                        ty = e.y - edy*0.8;
                    } else {
                        tx=e.aiTarget.x; ty=e.aiTarget.y;
                    }
                } else {
                    tx=e.aiTarget.x; ty=e.aiTarget.y;
                }

                e.update(dt, tx, ty);

                // Collision
                if (ed < player.size+e.size-2) {
                    if (player.size > e.size*1.15) {
                        player.eat('meat', e.size*0.35);
                        GS.kills++;
                        spawnBurst(e.x,e.y, e.color, 12, 200);
                        sfx(280,0.15,'triangle');
                        GS.shakeAmt=5;
                        releaseEnemy(e); enemies.splice(i,1);
                        // Delayed respawn
                        const respawnWorld=GS.world;
                        setTimeout(()=>{
                            if (!GS.running) return;
                            const d2=Math.random()>0.5?'herbivore':'carnivore';
                            const ne=getEnemy(Math.random()*WORLD_W, Math.random()*WORLD_H, 8+Math.random()*24, d2);
                            enemies.push(ne);
                        }, 4000);
                    } else if (e.size>player.size*1.2 && e.diet==='carnivore') {
                        player.takeDamage(e.getStats().damage*4);
                        GS.shakeAmt=8;
                        sfx(140,0.2,'sawtooth',0.2);
                    }
                }
            }

            // ── FOOD ────────────────────────────────────────────────────
            const pSt = player.getStats();
            const magR = player.size * pSt.magnet;
            const toRemove=[];

            for (let i=0;i<foodItems.length;i++) {
                const f=foodItems[i];
                if (!f.alive) continue;
                drawFoodItem(f);

                const fdx=f.x-player.x, fdy=f.y-player.y;
                const fd=Math.hypot(fdx,fdy);

                // Attract
                if (fd<magR && fd>0) {
                    const compat=(player.diet==='herbivore'&&f.type==='plant')||(player.diet==='carnivore'&&f.type==='meat');
                    if (compat) { f.x-=(fdx/fd)*12*dt; f.y-=(fdy/fd)*12*dt; }
                }

                // Eat
                if (fd<player.size+3 && player.eat(f.type,1)) {
                    toRemove.push(i);
                    sfx(500+Math.random()*100, 0.06, 'sine', 0.1);
                }
            }

            // Remove eaten food (reverse order to avoid index shift)
            for (let i=toRemove.length-1;i>=0;i--) {
                const idx=toRemove[i];
                removeFood(foodItems[idx]);
                foodItems.splice(idx,1);
                makeFood(Math.random()>0.42?'plant':'meat'); // respawn
            }

            // ── PROGRESSION ─────────────────────────────────────────────
            const mutThresh = 18 + Object.keys(player.mutations).length*22;
            if (player.targetSize>mutThresh && GS.mutCooldown<=0) {
                GS.mutCooldown=300;
                showMutationModal();
            }
            checkStage();

            // World transitions
            for (let id=2;id<=5;id++) {
                if (id>GS.world && player.size>=WORLDS[id].unlockSize) {
                    transitionWorld(id); break;
                }
            }

            // ── PARTICLES ───────────────────────────────────────────────
            for (let i=particles.length-1;i>=0;i--) {
                particles[i].update(dt);
                if (!particles[i].alive) {
                    if (particles[i].gfx.parent) particles[i].gfx.parent.removeChild(particles[i].gfx);
                    particles.splice(i,1);
                }
            }

            // ── BG ANIMATION ────────────────────────────────────────────
            for (const s of bgStars) {
                s.gfx.alpha = s.base + Math.sin(GS.age*0.02+s.phase)*0.12;
            }

            // ── CAMERA ──────────────────────────────────────────────────
            const targetZoom = Math.max(0.18, 22/Math.max(player.size,1));
            GS.camZoom += (targetZoom-GS.camZoom)*0.06;
            GS.camX += (player.x-GS.camX)*0.1;
            GS.camY += (player.y-GS.camY)*0.1;

            let cx=GS.camX, cy=GS.camY;
            if (GS.shakeAmt>0.2) {
                cx+=(Math.random()-0.5)*GS.shakeAmt;
                cy+=(Math.random()-0.5)*GS.shakeAmt;
                GS.shakeAmt*=0.84;
            }

            worldContainer.pivot.set(cx,cy);
            worldContainer.position.set(app.screen.width/2, app.screen.height/2);
            worldContainer.scale.set(GS.camZoom);

            // Parallax bg
            bgLayer.x = (cx-WORLD_W/2)*(-0.06);
            bgLayer.y = (cy-WORLD_H/2)*(-0.06);

            // ── HUD ─────────────────────────────────────────────────────
            updateHUD();
            drawMinimap();
        });
    });

})();
