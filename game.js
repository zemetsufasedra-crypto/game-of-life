// ==========================================================================
// MOTEUR SPORE EVO - ÉDITION PROFESSIONNELLE INDIE-AAA (JUICE & PERFORMANCE)
// ==========================================================================

(function() {
    const WORLD_WIDTH = 4000;
    const WORLD_HEIGHT = 3000;

    // Initialisation du moteur de rendu haute performance
    const app = new PIXI.Application({
        resizeTo: window,
        backgroundColor: 0x01050d, // Fond abyssal ultra-profond
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true
    });
    document.getElementById('game-container').appendChild(app.view);

    // Architecture de gestion des calques (Profondeur AAA)
    const backgroundLayer = new PIXI.Container();
    const ecosystemLayer = new PIXI.Container();
    const shadowLayer = new PIXI.Container();
    const foodLayer = new PIXI.Container();
    const gameLayer = new PIXI.Container();
    const fxLayer = new PIXI.Container();
    const lightingOverlay = new PIXI.Graphics();
    const uiLayer = new PIXI.Container();

    app.stage.addChild(backgroundLayer);
    app.stage.addChild(ecosystemLayer);
    app.stage.addChild(shadowLayer);
    app.stage.addChild(foodLayer);
    app.stage.addChild(gameLayer);
    app.stage.addChild(fxLayer);
    app.stage.addChild(lightingOverlay);
    app.stage.addChild(uiLayer);

    // États globaux sécurisés dans l'IIFE
    let player = null;
    let cells = [];
    let activeParticles = [];
    let activeBubbles = [];
    let activeNutrients = [];
    let activeShockwaves = [];
    let floatingTexts = [];
    let microPlankton = [];

    let gameState = {
        paused: true,
        age: 0,
        shakeIntensity: 0,
        hitStopTimer: 0,
        currentWorld: 1,
        cameraZoom: 1,
        isTerrestrial: false,
        bossActive: false,
        bossEntity: null
    };

    const WORLDS_CONFIG = {
        1: { name: "Abysse Primordiale", bg: 0x020714, density: 35, foodCount: 130, terrestrial: false },
        2: { name: "Récif Bioluminescent", bg: 0x01131f, density: 25, foodCount: 90, terrestrial: false },
        3: { name: "Faille de Pression", bg: 0x0b0214, density: 18, foodCount: 60, terrestrial: false },
        4: { name: "Rivage Évolutif", bg: 0x182414, density: 22, foodCount: 75, terrestrial: true }
    };

    // ==========================================================================
    // SYSTÈME DE RECYCLAGE DE MÉMOIRE (OBJECT POOLING - OPTIMISATION CPU/BATTERIE)
    // ==========================================================================
    class SmartPool {
        constructor(createInstanceFn) {
            this.pool = [];
            this.createInstanceFn = createInstanceFn;
        }
        get(...args) {
            let instance = this.pool.length > 0 ? this.pool.pop() : this.createInstanceFn();
            instance.init(...args);
            return instance;
        }
        release(instance) {
            instance.sleep();
            this.pool.push(instance);
        }
    }

    const particlePool = new SmartPool(() => new Particle());
    const nutrientPool = new SmartPool(() => new Nutrient());
    const bubblePool = new SmartPool(() => new Bubble());

    // ==========================================================================
    // MODULES FX & JUS VISUEL (NEON EFFECTS & SHOCKWAVES)
    // ==========================================================================
    class Particle {
        constructor() {
            this.gfx = new PIXI.Graphics();
            fxLayer.addChild(this.gfx);
            this.active = false;
        }
        init(x, y, color, speedScale = 1) {
            this.x = x; this.y = y;
            this.vx = (Math.random() - 0.5) * 14 * speedScale;
            this.vy = (Math.random() - 0.5) * 14 * speedScale;
            this.life = 25 + Math.random() * 25;
            this.maxLife = this.life;
            this.color = color;
            this.active = true;
            this.gfx.visible = true;
            this.gfx.alpha = 1;
        }
        update(delta) {
            this.x += this.vx * delta; this.y += this.vy * delta;
            this.vx *= 0.91; this.vy *= 0.91; // Friction fluide
            this.life -= delta;
            
            this.gfx.clear();
            this.gfx.blendMode = PIXI.BLEND_MODES.ADD; // Effet de lueur incandescente gratuit
            this.gfx.beginFill(this.color, this.life / this.maxLife);
            this.gfx.drawCircle(0, 0, (this.life / this.maxLife) * 5 + 1);
            this.gfx.endFill();
            this.gfx.x = this.x; this.gfx.y = this.y;
        }
        sleep() { this.active = false; this.gfx.visible = false; }
    }

    class Bubble {
        constructor() {
            this.gfx = new PIXI.Graphics();
            fxLayer.addChild(this.gfx);
            this.active = false;
        }
        init(x, y, scale = 1) {
            this.x = x; this.y = y;
            this.speed = Math.random() * 1.5 + 1;
            this.wobbleSpeed = Math.random() * 0.1 + 0.05;
            this.life = 50 + Math.random() * 30;
            this.maxLife = this.life;
            this.size = (Math.random() * 4 + 2) * scale;
            this.active = true;
            this.gfx.visible = true;
        }
        update(delta) {
            this.life -= delta;
            this.y -= this.speed * delta;
            this.x += Math.sin(this.life * this.wobbleSpeed) * 0.5 * delta;
            
            this.gfx.clear();
            this.gfx.lineStyle(1.5, 0xffffff, (this.life / this.maxLife) * 0.4);
            this.gfx.drawCircle(0, 0, this.size);
            this.gfx.x = this.x; this.gfx.y = this.y;
        }
        sleep() { this.active = false; this.gfx.visible = false; }
    }

    class Shockwave {
        constructor(x, y, maxRadius, color = 0xffffff) {
            this.x = x; this.y = y; this.radius = 5;
            this.maxRadius = maxRadius; this.color = color;
            this.alpha = 1; this.active = true;
            this.gfx = new PIXI.Graphics();
            this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
            fxLayer.addChild(this.gfx);
        }
        update(delta) {
            this.radius += 6 * delta;
            this.alpha = 1 - (this.radius / this.maxRadius);
            if (this.radius >= this.maxRadius) {
                this.active = false; this.gfx.destroy(); return;
            }
            this.gfx.clear();
            this.gfx.lineStyle(4, this.color, this.alpha);
            this.gfx.drawCircle(0, 0, this.radius);
            this.gfx.x = this.x; this.gfx.y = this.y;
        }
    }

    class FloatingText {
        constructor(x, y, text, color = 0xffffff, scale = 1) {
            this.x = x; this.y = y; this.life = 45;
            this.style = new PIXI.TextStyle({
                fontFamily: 'Impact, Arial Black, sans-serif',
                fontSize: Math.floor(18 * scale),
                fill: color,
                stroke: 0x000000,
                strokeThickness: 4,
                letterSpacing: 1
            });
            this.txt = new PIXI.Text(text, this.style);
            this.txt.anchor.set(0.5);
            uiLayer.addChild(this.txt);
        }
        update(delta) {
            this.y -= 1.5 * delta; this.life -= delta;
            this.txt.x = this.x; this.txt.y = this.y;
            this.txt.alpha = this.life / 45;
            // Pop effect élastique au démarrage
            let s = 1 + Math.sin((45 - this.life) * 0.1) * 0.2;
            this.txt.scale.set(s);
        }
        destroy() { uiLayer.removeChild(this.txt); this.txt.destroy(); }
    }

    class AmbientPlankton {
        constructor() {
            this.x = Math.random() * WORLD_WIDTH; this.y = Math.random() * WORLD_HEIGHT;
            this.speed = Math.random() * 0.4 + 0.1;
            this.wobble = Math.random() * 100;
            this.gfx = new PIXI.Graphics();
            this.gfx.beginFill(0x00ffaa, Math.random() * 0.15);
            this.gfx.drawCircle(0, 0, Math.random() * 3 + 1);
            this.gfx.endFill();
            backgroundLayer.addChild(this.gfx);
        }
        update(delta) {
            this.wobble += 0.02 * delta;
            this.y -= this.speed * delta;
            this.x += Math.sin(this.wobble) * 0.2 * delta;
            if (this.y < 0) this.y = WORLD_HEIGHT;
            if (this.x < 0) this.x = WORLD_WIDTH;
            if (this.x > WORLD_WIDTH) this.x = 0;
            this.gfx.x = this.x; this.gfx.y = this.y;
        }
    }

    // ==========================================================================
    // CLASSE NUTRIMENT OPTIMISÉE
    // ==========================================================================
    class Nutrient {
        constructor() {
            this.gfx = new PIXI.Graphics();
            foodLayer.addChild(this.gfx);
            this.active = false;
        }
        init(x, y, type = 'normal') {
            this.x = x; this.y = y; this.type = type;
            this.value = type === 'gold' ? 45 : 6;
            this.active = true; this.gfx.visible = true;
            this.pulseTimer = Math.random() * 10;
            this.renderGfx();
        }
        renderGfx() {
            this.gfx.clear();
            this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
            if (this.type === 'normal') {
                this.gfx.beginFill(0x33ff99, 0.3); this.gfx.drawCircle(0, 0, 9);
                this.gfx.beginFill(0xccffff, 0.9); this.gfx.drawCircle(0, 0, 3.5);
            } else if (this.type === 'meat') {
                this.gfx.beginFill(0xff2255, 0.3); this.gfx.drawCircle(0, 0, 9);
                this.gfx.beginFill(0xffaaee, 0.9); this.gfx.drawRect(-3, -3, 6, 6);
            } else if (this.type === 'gold') {
                this.gfx.beginFill(0xffcc00, 0.4); this.gfx.drawCircle(0, 0, 14);
                this.gfx.beginFill(0xffffff, 1); this.gfx.drawStar(0, 0, 5, 7, 3.5);
            }
            this.gfx.endFill();
            this.gfx.x = this.x; this.gfx.y = this.y;
        }
        updateAnimation(delta) {
            this.pulseTimer += 0.05 * delta;
            let scale = 1 + Math.sin(this.pulseTimer) * 0.12;
            this.gfx.scale.set(scale);
        }
        sleep() { this.active = false; this.gfx.visible = false; }
    }

    // ==========================================================================
    // CLASSE CRÉATURE ÉLITE (PHYSIQUE FLUIDE, SQUASH/STRETCH & SÉCURITÉ)
    // ==========================================================================
    class Creature {
        constructor(x, y, size, colorHex, isPlayer = false, diet = 'omnivore') {
            this.x = x; this.y = y; this.size = size;
            this.colorHex = colorHex; this.isPlayer = isPlayer; this.diet = diet;
            this.isBoss = false;
            
            // Vecteurs de force pour la physique fluide AAA
            this.vx = 0; this.vy = 0;
            this.baseSpeed = isPlayer ? 0.45 : 0.25 + Math.random() * 0.2;
            this.friction = 0.91; // Glissement aquatique
            
            // Algorithme RPG Équilibré
            this.attack = size * 0.6; this.defense = size * 0.25;
            this.maxHp = size * 2.5; this.hp = this.maxHp;
            
            this.invulnTimer = 0;
            this.comboCount = 0; this.comboTimer = 0; this.frenzyTimer = 0;

            this.gfx = new PIXI.Container();
            this.bodyGfx = new PIXI.Graphics();
            this.auraGfx = new PIXI.Graphics();
            
            this.gfx.addChild(this.auraGfx);
            this.gfx.addChild(this.bodyGfx);
            gameLayer.addChild(this.gfx);
            
            this.buildGeometry();
        }

        buildGeometry() {
            this.bodyGfx.clear();
            this.auraGfx.clear();

            // Rendu de l'Aura lumineuse (effet Bloom néon natif)
            this.auraGfx.blendMode = PIXI.BLEND_MODES.ADD;
            this.auraGfx.beginFill(this.colorHex, 0.25);
            this.auraGfx.drawCircle(0, 0, this.size * 1.7);
            this.auraGfx.endFill();

            // Corps organique de la cellule
            this.bodyGfx.beginFill(this.colorHex);
            this.bodyGfx.lineStyle(2, 0xffffff, 0.4);
            
            if (this.isBoss) {
                this.bodyGfx.drawStar(0, 0, 7, this.size, this.size * 0.55);
            } else {
                this.bodyGfx.drawCircle(0, 0, this.size);
                // Membrane interne décorative pour le feeling AAA
                if (this.size > 18) {
                    this.bodyGfx.beginFill(0xffffff, 0.15);
                    this.bodyGfx.drawCircle(this.size * 0.2, -this.size * 0.2, this.size * 0.3);
                }
            }
            this.bodyGfx.endFill();

            // Barre de vie esthétique intégrée sous l'entité
            if (!this.isPlayer && this.hp < this.maxHp) {
                this.bodyGfx.beginFill(0x111111, 0.7); this.bodyGfx.drawRect(-this.size, -this.size - 14, this.size * 2, 5);
                this.bodyGfx.beginFill(0xff3366, 0.9); this.bodyGfx.drawRect(-this.size, -this.size - 14, (this.hp / this.maxHp) * (this.size * 2), 5);
                this.bodyGfx.endFill();
            }
        }

        grow(amount) {
            this.size += amount * 0.08;
            this.maxHp = this.size * 2.5;
            this.hp = Math.min(this.hp + amount * 0.5, this.maxHp);
            this.attack = this.size * 0.6; this.defense = this.size * 0.25;
            this.buildGeometry();

            // Mécanique addictive du système de Combo
            if (this.isPlayer) {
                this.comboCount++;
                this.comboTimer = 110; // Temps limite pour enchaîner
                
                let comboScale = Math.min(2, 1 + this.comboCount * 0.1);
                floatingTexts.push(new FloatingText(this.x, this.y - this.size - 10, `+${Math.floor(amount)}`, 0x00ffcc, comboScale));

                if (this.comboCount >= 6 && this.frenzyTimer <= 0) {
                    this.frenzyTimer = 200; // Mode Frénésie activé pendant ~3.3 secondes
                    this.comboCount = 0;
                    floatingTexts.push(new FloatingText(this.x, this.y - 50, "🔥 MODE FRÉNÉSIE !", 0xffaa00, 1.8));
                    activeShockwaves.push(new Shockwave(this.x, this.y, 250, 0xffcc00));
                    triggerScreenShake(14);
                }
            }
        }

        takeDamage(amount, attacker) {
            if (this.invulnTimer > 0 || (this.isPlayer && this.frenzyTimer > 0)) return false;

            let dmg = Math.max(1, amount * (12 / (12 + this.defense)));
            this.hp -= dmg;
            this.invulnTimer = this.isPlayer ? 45 : 18;

            // Feedback d'impact lourd (Juice)
            createExplosion(this.x, this.y, this.colorHex, 8, 1.3);
            floatingTexts.push(new FloatingText(this.x, this.y - this.size, `-${Math.round(dmg)}`, 0xff3355, 1.2));
            
            // Calcul mathématique du vecteur de recul (Knockback)
            let dx = this.x - attacker.x; let dy = this.y - attacker.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                this.vx += (dx / dist) * 16;
                this.vy += (dy / dist) * 16;
            }

            this.buildGeometry();
            return true;
        }

        updatePhysics(delta, targetX = null, targetY = null) {
            // Gestion de l'état Frénésie (Changement de couleur pulsée)
            if (this.frenzyTimer > 0) {
                this.frenzyTimer -= delta;
                this.auraGfx.tint = 0xffaa00;
                this.bodyGfx.tint = (Math.floor(gameState.age) % 4 < 2) ? 0xffffff : 0xff5500;
                if (Math.random() < 0.3) activeParticles.push(particlePool.get(this.x, this.y, 0xffaa00, 0.5));
            } else {
                this.auraGfx.tint = 0xffffff;
                this.bodyGfx.tint = (this.invulnTimer > 0 && Math.floor(this.invulnTimer) % 4 < 2) ? 0xff3333 : 0xffffff;
            }

            if (this.comboTimer > 0) this.comboTimer -= delta;
            else this.comboCount = 0;

            if (this.invulnTimer > 0) this.invulnTimer -= delta;

            // Application des forces d'accélération fluide
            if (targetX !== null && targetY !== null) {
                let dx = targetX - this.x; let dy = targetY - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 4) {
                    let accel = this.baseSpeed * (this.frenzyTimer > 0 ? 2.0 : 1.0);
                    this.vx += (dx / dist) * accel;
                    this.vy += (dy / dist) * accel;
                }
            }

            // Friction et déplacement
            this.vx *= this.friction; this.vy *= this.friction;
            this.x += this.vx * delta; this.y += this.vy * delta;

            // Confinement strict à la carte
            this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
            this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

            this.gfx.x = this.x; this.gfx.y = this.y;

            // --- ANIMATION PROCÉDURALE SQUASH & STRETCH (AAA FEELING) ---
            let currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (currentSpeed > 0.3) {
                this.gfx.rotation = Math.atan2(this.vy, this.vx);
                this.bodyGfx.scale.x = 1 + (currentSpeed * 0.035) + Math.sin(gameState.age * 0.3) * 0.03;
                this.bodyGfx.scale.y = 1 - (currentSpeed * 0.022) + Math.cos(gameState.age * 0.3) * 0.03;
            } else {
                // Animation de pulsation organique au repos
                let breath = Math.sin(gameState.age * 0.06) * 0.04;
                this.bodyGfx.scale.set(1 + breath, 1 - breath);
            }
        }

        destroy() { gameLayer.removeChild(this.gfx); this.gfx.destroy({ children: true }); }
    }

    // ==========================================================================
    // LOGIQUE DE GENERATION ET MANAGEMENT DU MONDE
    // ==========================================================================
    function createExplosion(x, y, color, count = 10, speedScale = 1) {
        for (let i = 0; i < count; i++) activeParticles.push(particlePool.get(x, y, color, speedScale));
    }

    function spawnNutrients(count) {
        for (let i = 0; i < count; i++) {
            activeNutrients.push(nutrientPool.get(
                Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() > 0.82 ? 'meat' : 'normal'
            ));
        }
    }

    function triggerScreenShake(intensity) { gameState.shakeIntensity = Math.max(gameState.shakeIntensity, intensity); }
    function triggerHitStop(frames) { gameState.hitStopTimer = frames; }

    function spawnBoss(worldIndex) {
        gameState.bossActive = true;
        let boss = new Creature(player.x + 700, player.y + 600, player.size * 1.75, 0xff0044, false, 'carnivore');
        boss.isBoss = true; boss.maxHp *= 3.5; boss.hp = boss.maxHp; boss.attack *= 1.4; boss.buildGeometry();
        gameState.bossEntity = boss; cells.push(boss);
        
        floatingTexts.push(new FloatingText(player.x, player.y - 120, "⚠️ PRÉDATEUR ALPHA EN APPROCHE ⚠️", 0xff0033, 1.5));
        activeShockwaves.push(new Shockwave(boss.x, boss.y, 400, 0xff0044));
        triggerScreenShake(25);
    }

    function transitionToWorld(targetWorld) {
        if (targetWorld > 4) {
            const menu = document.getElementById('start-menu');
            if (menu) {
                menu.style.display = 'flex';
                menu.innerHTML = `<h1>ÉVOLUTION ULTIME ATTEINTE</h1><p>Votre espèce domine désormais la biosphère.</p><button onclick="location.reload()">Recommencer le cycle</button>`;
            }
            gameState.paused = true; return;
        }
        gameState.currentWorld = targetWorld;
        let config = WORLDS_CONFIG[targetWorld];
        app.renderer.backgroundColor = config.bg;
        gameState.isTerrestrial = config.terrestrial;
        
        cells.forEach(c => c.destroy()); cells = [];
        activeNutrients.forEach(n => nutrientPool.release(n)); activeNutrients = [];
        
        spawnNutrients(config.foodCount);
        for(let i=0; i < config.density; i++) {
            let eDiet = Math.random() > 0.53 ? 'herbivore' : 'carnivore';
            let eColor = eDiet === 'herbivore' ? 0x00ffaa : 0xff3355;
            cells.push(new Creature(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() * (player.size * 1.2) + 8, eColor, false, eDiet));
        }

        triggerScreenShake(20);
        activeShockwaves.push(new Shockwave(player.x, player.y, 500, 0x00ffff));
        floatingTexts.push(new FloatingText(player.x, player.y - 80, `ENTRÉE : ${config.name.toUpperCase()}`, 0x00ffff, 1.6));
    }

    function triggerGameOver() {
        gameState.paused = true;
        const menu = document.getElementById('start-menu');
        if (menu) {
            menu.style.display = 'flex';
            menu.innerHTML = `<h1>MUTATION STÉRILE</h1><p>Votre code génétique a été assimilé par la sélection naturelle.</p><button onclick="location.reload()">Réessayer</button>`;
        }
    }

    // Pré-générer l'arrière-plan vivant
    for(let i=0; i<70; i++) microPlankton.push(new AmbientPlankton());

    // ==========================================================================
    // INITIALISATION SÉCURISÉE DU DOM
    // ==========================================================================
    let mouseX = app.screen.width / 2; let mouseY = app.screen.height / 2;
    app.view.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

    function initGameSetup(dietChoice) {
        const menu = document.getElementById('start-menu');
        if (menu) menu.style.display = 'none';

        let pColor = dietChoice === 'herbivore' ? 0x00ffcc : 0xff1e56;
        player = new Creature(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 13, pColor, true, dietChoice);
        
        transitionToWorld(1);
        gameState.paused = false;
    }

    window.addEventListener('DOMContentLoaded', () => {
        const btnHerbi = document.getElementById('btn-herbivore');
        const btnCarni = document.getElementById('btn-carnivore');
        if (btnHerbi) btnHerbi.addEventListener('click', () => initGameSetup('herbivore'));
        if (btnCarni) btnCarni.addEventListener('click', () => initGameSetup('carnivore'));
    });

    // ==========================================================================
    // BOUCLE DE RENDU PRINCIPALE CRITIQUE (TICKER - 60 FPS EXACTS)
    // ==========================================================================
    app.ticker.add((delta) => {
        if (gameState.paused || !player) return;

        // Effet Hit-Stop (Gel d'impact professionnel)
        if (gameState.hitStopTimer > 0) { gameState.hitStopTimer -= delta; return; }
        gameState.age += delta;

        // Mise à jour de l'arrière-plan
        microPlankton.forEach(p => p.update(delta));

        // Calcul de la position cible de la souris convertie dans l'univers spatial du jeu
        let targetWorldX = (mouseX - app.screen.width / 2) / gameState.cameraZoom + player.x;
        let targetWorldY = (mouseY - app.screen.height / 2) / gameState.cameraZoom + player.y;
        player.updatePhysics(delta, targetWorldX, targetWorldY);

        // Régénération biologique naturelle lente
        if (player.hp < player.maxHp && gameState.age % 60 < 1) {
            player.hp += (player.diet === 'herbivore' ? 0.9 : 0.4);
        }

        // Effet visuel aquatique de sillage (Bubbles)
        if (!gameState.isTerrestrial && Math.random() < 0.18) {
            let currentSpeed = Math.sqrt(player.vx*player.vx + player.vy*player.vy);
            if (currentSpeed > 2) activeBubbles.push(bubblePool.get(player.x - player.vx*2, player.y - player.vy*2, player.size * 0.05));
        }

        // Gestion analytique des Nutriments (Magnétisme pro)
        const magneticDist = player.diet === 'herbivore' ? player.size * 3.8 : player.size * 1.5;
        for (let i = activeNutrients.length - 1; i >= 0; i--) {
            let nut = activeNutrients[i];
            nut.updateAnimation(delta);

            let dx = nut.x - player.x; let dy = nut.y - player.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            // Aspiration magnétique fluide
            if (dist < magneticDist) {
                nut.x -= (dx / dist) * 9 * delta; nut.y -= (dy / dist) * 9 * delta;
                nut.renderGfx();
            }

            // Absorption effective
            if (dist < player.size) {
                let xp = nut.value;
                if (player.diet === 'herbivore' && nut.type === 'normal') xp *= 2.5;
                if (player.diet === 'carnivore' && nut.type === 'meat') xp *= 2.5;
                
                player.grow(xp);
                nutrientPool.release(nut); activeNutrients.splice(i, 1);
            }
        }

        // Boucle de traitement IA et Collisions des Ennemis
        for (let i = cells.length - 1; i >= 0; i--) {
            let enemy = cells[i];
            
            let edx = player.x - enemy.x; let edy = player.y - enemy.y;
            let edist = Math.sqrt(edx * edx + edy * edy);

            // IA Procédurale : Chasse ou Errance autonome
            if (edist < 380 && enemy.size > player.size * 1.05 && enemy.diet === 'carnivore') {
                enemy.updatePhysics(delta, player.x, player.y);
            } else {
                if (gameState.age % 45 < 1) {
                    enemy.vx += (Math.random() - 0.5) * 3; enemy.vy += (Math.random() - 0.5) * 3;
                }
                enemy.updatePhysics(delta, null, null);
            }

            // Gestion de l'arbre des résolutions de collisions
            if (edist < player.size + enemy.size) {
                // Scénario A : Le Joueur surclasse totalement l'ennemi (Instant execution)
                if (player.size > enemy.size * 1.8 || player.frenzyTimer > 0) {
                    createExplosion(enemy.x, enemy.y, enemy.colorHex, 16, 2.2);
                    activeShockwaves.push(new Shockwave(enemy.x, enemy.y, enemy.size * 4, player.colorHex));
                    triggerScreenShake(7);
                    player.grow(enemy.size * (player.diet === 'carnivore' ? 1.4 : 0.6));
                    
                    if (enemy.isBoss) {
                        for(let j=0; j<10; j++) activeNutrients.push(nutrientPool.get(enemy.x + (Math.random()-0.5)*120, enemy.y + (Math.random()-0.5)*120, 'gold'));
                        gameState.bossActive = false; gameState.bossEntity = null;
                    }

                    enemy.destroy(); cells.splice(i, 1); continue;
                }
                // Scénario B : L'ennemi surclasse mortellement le joueur
                else if (enemy.size > player.size * 1.8 && player.frenzyTimer <= 0) {
                    triggerGameOver(); return;
                }
                // Scénario C : Combat dynamique équilibré
                else {
                    if (player.size >= enemy.size) {
                        if (enemy.takeDamage(player.attack, player)) {
                            triggerHitStop(4); triggerScreenShake(6);
                            if (enemy.hp <= 0) {
                                createExplosion(enemy.x, enemy.y, enemy.colorHex, 18, 2.5);
                                activeShockwaves.push(new Shockwave(enemy.x, enemy.y, enemy.size * 5, enemy.colorHex));
                                player.grow(enemy.size * (player.diet === 'carnivore' ? 1.2 : 0.6));
                                
                                if (enemy.isBoss) {
                                    for(let j=0; j<10; j++) activeNutrients.push(nutrientPool.get(enemy.x + (Math.random()-0.5)*120, enemy.y + (Math.random()-0.5)*120, 'gold'));
                                    gameState.bossActive = false; gameState.bossEntity = null;
                                }
                                enemy.destroy(); cells.splice(i, 1);
                            }
                        }
                    } else if (player.frenzyTimer <= 0) {
                        if (player.takeDamage(enemy.attack, enemy)) {
                            triggerScreenShake(10);
                            if (player.hp <= 0) { triggerGameOver(); return; }
                        }
                    }
                }
            }
        }

        // Dispatching du Boss et Changement de Strate Géologique
        if (!gameState.bossActive && !gameState.bossEntity) {
            let nextWorldTrigger = 0;
            if (gameState.currentWorld === 1 && player.size >= 42) nextWorldTrigger = 2;
            else if (gameState.currentWorld === 2 && player.size >= 78) nextWorldTrigger = 3;
            else if (gameState.currentWorld === 3 && player.size >= 135) nextWorldTrigger = 4;
            
            if (nextWorldTrigger > 0) { spawnBoss(nextWorldTrigger); player.size -= 1; }
        }

        // Transition automatique si le Boss est terrassé et le loot légendaire absorbé
        if (!gameState.bossActive && gameState.bossEntity === null && activeNutrients.filter(n => n.type === 'gold').length === 0 && player.size >= 40) {
            if (gameState.currentWorld === 1 && player.size >= 41) transitionToWorld(2);
            else if (gameState.currentWorld === 2 && player.size >= 77) transitionToWorld(3);
            else if (gameState.currentWorld === 3 && player.size >= 134) transitionToWorld(4);
        }

        // Traitement des conteneurs FX (Particules, Textes, Ondes, Bulles)
        for (let i = activeParticles.length - 1; i >= 0; i--) {
            activeParticles[i].update(delta);
            if (!activeParticles[i].active) { particlePool.release(activeParticles[i]); activeParticles.splice(i, 1); }
        }
        for (let i = activeBubbles.length - 1; i >= 0; i--) {
            activeBubbles[i].update(delta);
            if (activeBubbles[i].life <= 0) { bubblePool.release(activeBubbles[i]); activeBubbles.splice(i, 1); }
        }
        for (let i = activeShockwaves.length - 1; i >= 0; i--) {
            activeShockwaves[i].update(delta);
            if (!activeShockwaves[i].active) activeShockwaves.splice(i, 1);
        }
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            floatingTexts[i].update(delta);
            if (floatingTexts[i].life <= 0) { floatingTexts[i].destroy(); floatingTexts.splice(i, 1); }
        }

        // --- CAMERA INTERPOLÉE ET LISSAGE SOURIS (SMOOTH CAMERA DAMP) ---
        gameState.cameraZoom = Math.max(0.25, 22 / player.size);
        const targetCamX = app.screen.width / 2 - player.x * gameState.cameraZoom;
        const targetCamY = app.screen.height / 2 - player.y * gameState.cameraZoom;
        
        // Interpolation linéaire (lerp) à un ratio fluide de 10% par frame
        gameLayer.x += (targetCamX - gameLayer.x) * 0.1 * delta;
        gameLayer.y += (targetCamY - gameLayer.y) * 0.1 * delta;
        gameLayer.scale.set(gameState.cameraZoom);
        
        foodLayer.x = gameLayer.x; foodLayer.y = gameLayer.y; foodLayer.scale.set(gameState.cameraZoom);
        fxLayer.x = gameLayer.x; fxLayer.y = gameLayer.y; fxLayer.scale.set(gameState.cameraZoom);
        uiLayer.x = gameLayer.x; uiLayer.y = gameLayer.y; uiLayer.scale.set(gameState.cameraZoom);
        
        // Parallaxe lointain du fond sous-marin
        backgroundLayer.x = gameLayer.x * 0.15; backgroundLayer.y = gameLayer.y * 0.15;

        // Overlay d'éclairage dynamique (Filtre d'immersion aquatique)
        lightingOverlay.clear();
        if (!gameState.isTerrestrial) {
            lightingOverlay.beginFill(0x003b5c, 0.12);
            lightingOverlay.drawRect(0, 0, app.screen.width, app.screen.height);
            lightingOverlay.endFill();
        }

        // Traitement de l'impulsion de tremblement de terre (Screen Shake)
        if (gameState.shakeIntensity > 0) {
            app.stage.x = (Math.random() - 0.5) * gameState.shakeIntensity;
            app.stage.y = (Math.random() - 0.5) * gameState.shakeIntensity;
            gameState.shakeIntensity *= 0.88;
            if (gameState.shakeIntensity < 0.4) { gameState.shakeIntensity = 0; app.stage.x = 0; app.stage.y = 0; }
        }

        // Export des données d'affichage vers les nœuds du DOM
        const sizeNode = document.getElementById('size');
        const popNode = document.getElementById('population');
        const fpsNode = document.getElementById('fps');
        if (sizeNode) sizeNode.textContent = Math.floor(player.size);
        if (popNode) popNode.textContent = cells.length;
        if (fpsNode) fpsNode.textContent = Math.round(app.ticker.FPS);
    });

})();
