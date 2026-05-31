// ==========================================================================
// MOTEUR SPORE - ÉDITION PROFESSIONNELLE (SÉCURITÉ, PERFORMANCES & ADDICTION)
// ==========================================================================

// IIFE (Immediately Invoked Function Expression) pour sécuriser la mémoire
// Empêche la modification des variables depuis la console du navigateur
(function() {
    const WORLD_WIDTH = 4000;
    const WORLD_HEIGHT = 3000;

    const app = new PIXI.Application({
        resizeTo: window,
        backgroundColor: 0x01050a, // Fond abyssal plus profond
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true
    });
    document.getElementById('game-container').appendChild(app.view);

    // Architecture des Calques
    const backgroundLayer = new PIXI.Container();
    const boidsLayer = new PIXI.Container(); // Nouveau calque d'écosystème
    const shadowLayer = new PIXI.Container();
    const foodLayer = new PIXI.Container();
    const gameLayer = new PIXI.Container();
    const fxLayer = new PIXI.Container();
    const uiLayer = new PIXI.Container();

    app.stage.addChild(backgroundLayer);
    app.stage.addChild(boidsLayer);
    app.stage.addChild(shadowLayer);
    app.stage.addChild(foodLayer);
    app.stage.addChild(gameLayer);
    app.stage.addChild(fxLayer);
    app.stage.addChild(uiLayer);

    // Registres globaux encapsulés
    let player = null;
    let cells = [];
    let boids = [];
    let activeParticles = [];
    let activeNutrients = [];
    let floatingTexts = [];

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
        1: { name: "Surface Lumineuse", bg: 0x01050a, density: 35, foodCount: 120 },
        2: { name: "Récif Océanique", bg: 0x01121c, density: 25, foodCount: 80 },
        3: { name: "Abysses Fluorescentes", bg: 0x080112, density: 15, foodCount: 50 },
        4: { name: "Terres Primordiales", bg: 0x1a2618, density: 20, foodCount: 60, terrestrial: true }
    };

    // ==========================================================================
    // SYSTÈME DE POOLING (ÉCOLOGIE MÉMOIRE & PERFORMANCES)
    // ==========================================================================
    
    class ObjectPool {
        constructor(createFn) {
            this.pool = [];
            this.createFn = createFn;
        }
        get(...args) {
            let obj = this.pool.length > 0 ? this.pool.pop() : this.createFn();
            obj.init(...args);
            return obj;
        }
        release(obj) {
            obj.sleep();
            this.pool.push(obj);
        }
    }

    const nutrientPool = new ObjectPool(() => new Nutrient());
    const particlePool = new ObjectPool(() => new Particle());

    // ==========================================================================
    // CLASSES VISUELLES ET PARTICULES
    // ==========================================================================

    class Nutrient {
        constructor() {
            this.gfx = new PIXI.Graphics();
            foodLayer.addChild(this.gfx);
            this.active = false;
        }
        init(x, y, type = 'normal') {
            this.x = x; this.y = y; this.type = type;
            this.value = type === 'gold' ? 50 : 5;
            this.active = true;
            this.gfx.visible = true;
            this.gfx.alpha = 1;
            this.draw();
        }
        draw() {
            this.gfx.clear();
            // Utilisation du Blend Mode ADD pour un effet "Bloom/Néon" natif et gratuit
            this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
            if (this.type === 'normal') {
                this.gfx.beginFill(0x22ffaa, 0.4); this.gfx.drawCircle(0, 0, 8);
                this.gfx.beginFill(0xafffff, 0.9); this.gfx.drawCircle(0, 0, 3);
            } else if (this.type === 'meat') {
                this.gfx.beginFill(0xff2244, 0.4); this.gfx.drawCircle(0, 0, 8);
                this.gfx.beginFill(0xff8888, 0.9); this.gfx.drawRect(-3, -3, 6, 6);
            } else if (this.type === 'gold') {
                this.gfx.beginFill(0xffaa00, 0.5); this.gfx.drawCircle(0, 0, 12);
                this.gfx.beginFill(0xffffaa, 1); this.gfx.drawStar(0, 0, 5, 6, 3);
            }
            this.gfx.endFill();
            this.gfx.x = this.x; this.gfx.y = this.y;
        }
        sleep() { this.active = false; this.gfx.visible = false; }
    }

    class Particle {
        constructor() {
            this.gfx = new PIXI.Graphics();
            fxLayer.addChild(this.gfx);
            this.active = false;
        }
        init(x, y, color, speedScale = 1) {
            this.x = x; this.y = y;
            this.vx = (Math.random() - 0.5) * 12 * speedScale;
            this.vy = (Math.random() - 0.5) * 12 * speedScale;
            this.life = 20 + Math.random() * 20;
            this.maxLife = this.life;
            this.active = true;
            this.gfx.visible = true;
            this.gfx.clear();
            this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
            this.gfx.beginFill(color);
            this.gfx.drawCircle(0, 0, Math.random() * 4 + 2);
            this.gfx.endFill();
            this.gfx.x = x; this.gfx.y = y;
        }
        update(delta) {
            this.x += this.vx * delta; this.y += this.vy * delta;
            this.vx *= 0.88; this.vy *= 0.88;
            this.life -= delta;
            this.gfx.x = this.x; this.gfx.y = this.y;
            this.gfx.alpha = this.life / this.maxLife;
            this.gfx.scale.set(this.life / this.maxLife);
        }
        sleep() { this.active = false; this.gfx.visible = false; }
    }

    class FloatingText {
        constructor(x, y, text, color = 0xffffff, scale = 1) {
            this.x = x; this.y = y; this.life = 45;
            this.style = new PIXI.TextStyle({ fontFamily: 'monospace', fontSize: 16 * scale, fontWeight: 'bold', fill: color, stroke: 0x000000, strokeThickness: 3 });
            this.obj = new PIXI.Text(text, this.style);
            this.obj.anchor.set(0.5); this.obj.x = this.x; this.obj.y = this.y;
            uiLayer.addChild(this.obj);
        }
        update(delta) {
            this.y -= 1.2 * delta; this.life -= delta;
            this.obj.y = this.y; this.obj.alpha = this.life / 45;
            this.obj.scale.set(1 + (45 - this.life) * 0.01);
        }
        destroy() { uiLayer.removeChild(this.obj); this.obj.destroy(); }
    }

    // ==========================================================================
    // ÉCOSYSTÈME VISUEL (ALGORITHME DE BOIDS)
    // ==========================================================================
    
    class Boid {
        constructor() {
            this.x = Math.random() * WORLD_WIDTH; this.y = Math.random() * WORLD_HEIGHT;
            this.vx = (Math.random() - 0.5) * 2; this.vy = (Math.random() - 0.5) * 2;
            this.gfx = new PIXI.Graphics();
            this.gfx.beginFill(0x4488cc, 0.3);
            this.gfx.drawPolygon([-3, -2, 5, 0, -3, 2]); // Forme de petit poisson
            this.gfx.endFill();
            boidsLayer.addChild(this.gfx);
        }
        update(delta) {
            this.x += this.vx * delta; this.y += this.vy * delta;
            if (this.x < 0) this.x = WORLD_WIDTH; if (this.x > WORLD_WIDTH) this.x = 0;
            if (this.y < 0) this.y = WORLD_HEIGHT; if (this.y > WORLD_HEIGHT) this.y = 0;
            this.gfx.x = this.x; this.gfx.y = this.y;
            this.gfx.rotation = Math.atan2(this.vy, this.vx);
            // Légère dérive mathématique (Bruit)
            this.vx += (Math.random() - 0.5) * 0.1; this.vy += (Math.random() - 0.5) * 0.1;
            let speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
            if(speed > 2) { this.vx = (this.vx/speed)*2; this.vy = (this.vy/speed)*2; }
        }
    }
    for(let i=0; i<80; i++) boids.push(new Boid());

    // ==========================================================================
    // CLASSE CRÉATURE (COMBAT, FRENZY, SQUASH & STRETCH)
    // ==========================================================================

    class Creature {
        constructor(x, y, size, colorHex, isPlayer = false, diet = 'omnivore') {
            this.x = x; this.y = y; this.size = size;
            this.colorHex = colorHex; this.isPlayer = isPlayer; this.diet = diet;
            this.isBoss = false;
            
            // Stats RPG
            this.baseSpeed = isPlayer ? 4.5 : Math.random() * 2 + 1.5;
            this.speed = this.baseSpeed;
            this.attack = size * 0.6; this.defense = size * 0.3;
            this.maxHp = size * 2.5; this.hp = this.maxHp;
            
            this.vx = 0; this.vy = 0;
            this.invulnTimer = 0;
            
            // Système de Combo (Frenzy)
            this.comboCount = 0; this.comboTimer = 0; this.frenzyTimer = 0;

            this.gfx = new PIXI.Container();
            this.bodyGfx = new PIXI.Graphics();
            this.glowGfx = new PIXI.Graphics();
            
            this.gfx.addChild(this.glowGfx);
            this.gfx.addChild(this.bodyGfx);
            gameLayer.addChild(this.gfx);
            
            this.drawStructure();
        }

        drawStructure() {
            this.bodyGfx.clear();
            this.glowGfx.clear();

            // Rendu vectoriel dynamique selon le niveau
            this.bodyGfx.beginFill(this.colorHex);
            this.bodyGfx.lineStyle(2, 0xffffff, 0.4);
            
            if (this.isBoss) {
                this.bodyGfx.drawStar(0, 0, 10, this.size, this.size * 0.6);
            } else {
                this.bodyGfx.drawCircle(0, 0, this.size);
                // Si la taille est grande, ajout de nageoires vectorielles
                if (this.size > 20) {
                    this.bodyGfx.drawPolygon([-this.size*0.5, -this.size*0.8, -this.size*1.2, -this.size*1.5, 0, -this.size]);
                    this.bodyGfx.drawPolygon([-this.size*0.5, this.size*0.8, -this.size*1.2, this.size*1.5, 0, this.size]);
                }
            }
            this.bodyGfx.endFill();

            // Barre de vie (ennemis)
            if (!this.isPlayer && this.hp < this.maxHp) {
                this.bodyGfx.beginFill(0xff0000, 0.8); this.bodyGfx.drawRect(-this.size, -this.size - 12, this.size * 2, 4);
                this.bodyGfx.beginFill(0x00ffcc, 0.9); this.bodyGfx.drawRect(-this.size, -this.size - 12, (this.hp / this.maxHp) * (this.size * 2), 4);
                this.bodyGfx.endFill();
            }

            // Glow natif (Bloom)
            this.glowGfx.blendMode = PIXI.BLEND_MODES.ADD;
            this.glowGfx.beginFill(this.colorHex, 0.3);
            this.glowGfx.drawCircle(0, 0, this.size * 1.8);
            this.glowGfx.endFill();
        }

        grow(amount) {
            this.size += amount * 0.1;
            this.maxHp = this.size * 2.5;
            this.hp = Math.min(this.hp + amount, this.maxHp);
            this.attack = this.size * 0.6; this.defense = this.size * 0.3;
            this.drawStructure();

            // Gestion de l'addiction : Le Combo !
            if (this.isPlayer) {
                this.comboCount++;
                this.comboTimer = 120; // 2 secondes pour maintenir le combo
                if (this.comboCount >= 5 && this.frenzyTimer <= 0) {
                    this.frenzyTimer = 180; // 3 secondes de furie
                    this.comboCount = 0;
                    floatingTexts.push(new FloatingText(this.x, this.y - 40, "🔥 FRÉNÉSIE !", 0xffcc00, 1.5));
                    triggerScreenShake(10);
                }
            }
        }

        takeDamage(amount, attacker) {
            if (this.invulnTimer > 0 || this.frenzyTimer > 0) return false;
            
            let reduction = 10 / (10 + this.defense); 
            let dmg = Math.max(1, amount * reduction);
            
            this.hp -= dmg;
            this.invulnTimer = this.isPlayer ? 45 : 20; // i-frames
            
            createExplosion(this.x, this.y, this.colorHex, 6, 1.5);
            floatingTexts.push(new FloatingText(this.x, this.y - this.size, `-${Math.round(dmg)}`, 0xff3333, this.isPlayer ? 1.5 : 1));

            // Knockback
            let dx = this.x - attacker.x; let dy = this.y - attacker.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) { this.x += (dx / dist) * 35; this.y += (dy / dist) * 35; }
            
            this.drawStructure();
            return true;
        }

        updatePhysics(delta, targetX = null, targetY = null) {
            // Anti-cheat & Limiteurs
            const MAX_SPEED = 15;

            // Logique de Frenzy
            if (this.frenzyTimer > 0) {
                this.frenzyTimer -= delta;
                this.speed = this.baseSpeed * 2.2;
                this.glowGfx.tint = 0xffaa00; // Devient doré
                this.bodyGfx.tint = (Math.floor(gameState.age) % 4 < 2) ? 0xffffff : 0xffaa00;
            } else {
                this.speed = this.baseSpeed;
                this.glowGfx.tint = 0xffffff;
                this.bodyGfx.tint = (this.invulnTimer > 0 && Math.floor(this.invulnTimer) % 4 < 2) ? 0xff0000 : 0xffffff;
            }

            if (this.comboTimer > 0) this.comboTimer -= delta;
            else this.comboCount = 0;

            if (this.invulnTimer > 0) this.invulnTimer -= delta;

            if (targetX !== null && targetY !== null) {
                let dx = targetX - this.x; let dy = targetY - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    this.vx = (dx / dist) * this.speed;
                    this.vy = (dy / dist) * this.speed;
                } else { this.vx = 0; this.vy = 0; }
            }
            
            // Sécurité de vitesse
            let currentSpeed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
            if (currentSpeed > MAX_SPEED) {
                this.vx = (this.vx / currentSpeed) * MAX_SPEED;
                this.vy = (this.vy / currentSpeed) * MAX_SPEED;
            }

            this.x += this.vx * delta; this.y += this.vy * delta;
            this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
            this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

            // Rendu visuel (Animation Procédurale Squash & Stretch)
            this.gfx.x = this.x; this.gfx.y = this.y;
            
            if (currentSpeed > 0.5) {
                this.gfx.rotation = Math.atan2(this.vy, this.vx);
                // S'allonge avec la vitesse
                this.bodyGfx.scale.x = 1 + (currentSpeed * 0.05) + Math.sin(gameState.age * 0.4) * 0.05;
                this.bodyGfx.scale.y = 1 - (currentSpeed * 0.03) + Math.cos(gameState.age * 0.4) * 0.05;
            } else {
                // Respiration à l'arrêt
                this.bodyGfx.scale.x = 1 + Math.sin(gameState.age * 0.05) * 0.03;
                this.bodyGfx.scale.y = 1 + Math.cos(gameState.age * 0.05) * 0.03;
            }
        }

        destroy() { gameLayer.removeChild(this.gfx); this.gfx.destroy({children:true}); }
    }

    // ==========================================================================
    // OUTILS D'AMBIANCE ET SPAWNS
    // ==========================================================================

    function createExplosion(x, y, color, count = 10, speedScale = 1) {
        for (let i = 0; i < count; i++) activeParticles.push(particlePool.get(x, y, color, speedScale));
    }

    function spawnNutrients(count) {
        for (let i = 0; i < count; i++) {
            activeNutrients.push(nutrientPool.get(
                Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() > 0.8 ? 'meat' : 'normal'
            ));
        }
    }

    function triggerScreenShake(intensity) { gameState.shakeIntensity = intensity; }
    function triggerHitStop(frames) { gameState.hitStopTimer = frames; }

    function spawnBoss(worldIndex) {
        gameState.bossActive = true;
        let boss = new Creature(player.x + 800, player.y + 800, player.size * 1.8, 0xff0055, false, 'carnivore');
        boss.isBoss = true; boss.maxHp *= 3; boss.hp = boss.maxHp; boss.attack *= 1.5; boss.drawStructure();
        gameState.bossEntity = boss; cells.push(boss);
        
        floatingTexts.push(new FloatingText(player.x, player.y - 100, "⚠️ PRÉDATEUR ALPHA ⚠️", 0xff0000, 2));
        triggerScreenShake(25);
    }

    function transitionToWorld(targetWorld) {
        if (targetWorld > 4) {
            document.getElementById('start-menu').style.display = 'flex';
            document.getElementById('start-menu').innerHTML = `<h1>ÉVOLUTION TERMINÉE</h1><p>Espèce Dominante Atteinte.</p><button onclick="location.reload()">Rejouer</button>`;
            gameState.paused = true; return;
        }
        gameState.currentWorld = targetWorld;
        let config = WORLDS_CONFIG[targetWorld];
        app.renderer.backgroundColor = config.bg;
        
        cells.forEach(c => c.destroy()); cells = [];
        activeNutrients.forEach(n => nutrientPool.release(n)); activeNutrients = [];
        spawnNutrients(config.foodCount);
        
        triggerScreenShake(15);
        floatingTexts.push(new FloatingText(player.x, player.y - 80, `🌊 ${config.name.toUpperCase()}`, 0x00ffff, 1.5));
    }

    function triggerGameOver() {
        gameState.paused = true;
        document.getElementById('start-menu').style.display = 'flex';
        document.getElementById('start-menu').innerHTML = `<h1>ASSIMILÉ</h1><p>La chaîne alimentaire a eu raison de vous.</p><button onclick="location.reload()">Réessayer</button>`;
    }

    // ==========================================================================
    // INITIALISATION DOM & SOURIS
    // ==========================================================================
    let mouseX = app.screen.width/2, mouseY = app.screen.height/2;
    app.view.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

    function startGame(dietChoice) {
        const menu = document.getElementById('start-menu');
        if (menu) menu.style.display = 'none';
        
        // Setup initial du joueur
        let pColor = dietChoice === 'herbivore' ? 0x00ffcc : 0xff1e56;
        player = new Creature(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 12, pColor, true, dietChoice);
        
        spawnNutrients(WORLDS_CONFIG[1].foodCount);
        for(let i=0; i < WORLDS_CONFIG[1].density; i++) {
            let eDiet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
            let eColor = eDiet === 'herbivore' ? 0x22cc77 : 0xff4455;
            cells.push(new Creature(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() * 12 + 6, eColor, false, eDiet));
        }
        gameState.paused = false;
    }

    const btnHerbi = document.getElementById('btn-herbivore');
    const btnCarni = document.getElementById('btn-carnivore');
    if (btnHerbi) btnHerbi.addEventListener('click', () => startGame('herbivore'));
    if (btnCarni) btnCarni.addEventListener('click', () => startGame('carnivore'));

    // ==========================================================================
    // BOUCLE DE RENDU PRINCIPALE (TICKER)
    // ==========================================================================
    app.ticker.add((delta) => {
        if (gameState.paused || !player) return;

        // Hit-Stop (Gel de l'action)
        if (gameState.hitStopTimer > 0) { gameState.hitStopTimer -= delta; return; }
        gameState.age += delta;

        // Mise à jour de l'écosystème Boids
        boidsLayer.x = gameLayer.x * 0.4; boidsLayer.y = gameLayer.y * 0.4;
        boids.forEach(b => b.update(delta));

        // Mouvement Joueur
        let targetWorldX = (mouseX - app.screen.width / 2) / gameState.cameraZoom + player.x;
        let targetWorldY = (mouseY - app.screen.height / 2) / gameState.cameraZoom + player.y;
        player.updatePhysics(delta, targetWorldX, targetWorldY);
        
        // Régénération passive
        if (player.hp < player.maxHp && gameState.age % 60 < 1) player.hp += (player.diet === 'herbivore' ? 0.8 : 0.4);

        // Mécanique Nutriments (Magnétisme Herbivore)
        const magneticRadius = player.diet === 'herbivore' ? player.size * 3.5 : player.size * 1.5;
        for (let i = activeNutrients.length - 1; i >= 0; i--) {
            let nut = activeNutrients[i];
            let dx = nut.x - player.x; let dy = nut.y - player.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < magneticRadius && player.frenzyTimer <= 0) {
                nut.x -= (dx / dist) * 8 * delta; nut.y -= (dy / dist) * 8 * delta; nut.draw();
            }
            if (dist < player.size) {
                let xp = nut.value;
                if (player.diet === 'herbivore' && nut.type === 'normal') xp *= 3;
                if (player.diet === 'carnivore' && nut.type === 'meat') xp *= 3;
                player.grow(xp);
                nutrientPool.release(nut); activeNutrients.splice(i, 1);
            }
        }

        // Mécanique Ennemis et Combat
        for (let i = cells.length - 1; i >= 0; i--) {
            let enemy = cells[i];
            
            // IA
            let edx = player.x - enemy.x; let edy = player.y - enemy.y;
            let edist = Math.sqrt(edx * edx + edy * edy);
            if (edist < 350 && enemy.size > player.size * 1.1 && enemy.diet === 'carnivore') {
                enemy.updatePhysics(delta, player.x, player.y); // Chasse
            } else {
                enemy.vx += (Math.random() - 0.5) * 0.5; enemy.vy += (Math.random() - 0.5) * 0.5;
                enemy.updatePhysics(delta, null, null); // Errance
            }

            // Collisions
            if (edist < player.size + enemy.size) {
                // One-Shot Prédateur Alpha
                if (player.size > enemy.size * 2 || player.frenzyTimer > 0) {
                    createExplosion(enemy.x, enemy.y, enemy.colorHex, 15, 2);
                    triggerScreenShake(5);
                    player.grow(enemy.size * (player.diet === 'carnivore' ? 1.5 : 0.5));
                    enemy.destroy(); cells.splice(i, 1);
                    continue;
                }
                // One-Shot Proie
                else if (enemy.size > player.size * 2 && player.frenzyTimer <= 0) {
                    triggerGameOver(); return;
                }
                // Combat Équilibré
                else {
                    if (player.size >= enemy.size) {
                        if (enemy.takeDamage(player.attack, player)) {
                            triggerHitStop(4); triggerScreenShake(8);
                            if (enemy.hp <= 0) {
                                createExplosion(enemy.x, enemy.y, enemy.colorHex, 20, 3);
                                player.grow(enemy.size * (player.diet === 'carnivore' ? 1.2 : 0.6));
                                if (enemy.isBoss) {
                                    for(let j=0; j<12; j++) activeNutrients.push(nutrientPool.get(enemy.x + (Math.random()-0.5)*150, enemy.y + (Math.random()-0.5)*150, 'gold'));
                                    gameState.bossActive = false; gameState.bossEntity = null;
                                }
                                enemy.destroy(); cells.splice(i, 1);
                            }
                        }
                    } else if (player.frenzyTimer <= 0) {
                        if (player.takeDamage(enemy.attack, enemy)) {
                            triggerScreenShake(12);
                            if (player.hp <= 0) { triggerGameOver(); return; }
                        }
                    }
                }
            }
        }

        // Logique Boss & Strate
        if (!gameState.bossActive && !gameState.bossEntity) {
            let target = 0;
            if (gameState.currentWorld === 1 && player.size >= 40) target = 2;
            else if (gameState.currentWorld === 2 && player.size >= 80) target = 3;
            else if (gameState.currentWorld === 3 && player.size >= 140) target = 4;
            
            if (target > 0) { spawnBoss(target); player.size -= 1; }
        }

        if (!gameState.bossActive && gameState.bossEntity === null && activeNutrients.filter(n => n.type === 'gold').length === 0 && player.size > 40) {
            // Option pour forcer la transition si le loot est ramassé (Ajustable)
        }

        // Nettoyage Particules & Textes
        for (let i = activeParticles.length - 1; i >= 0; i--) {
            activeParticles[i].update(delta);
            if (!activeParticles[i].active) { activeParticles.splice(i, 1); }
        }
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            floatingTexts[i].update(delta);
            if (floatingTexts[i].life <= 0) { floatingTexts[i].destroy(); floatingTexts.splice(i, 1); }
        }

        // Caméra Elastique & Parallaxe
        gameState.cameraZoom = Math.max(0.3, 20 / player.size);
        const targetCamX = app.screen.width / 2 - player.x * gameState.cameraZoom;
        const targetCamY = app.screen.height / 2 - player.y * gameState.cameraZoom;
        
        gameLayer.x += (targetCamX - gameLayer.x) * 0.1; gameLayer.y += (targetCamY - gameLayer.y) * 0.1;
        gameLayer.scale.set(gameState.cameraZoom);
        foodLayer.x = gameLayer.x; foodLayer.y = gameLayer.y; foodLayer.scale.set(gameState.cameraZoom);
        fxLayer.x = gameLayer.x; fxLayer.y = gameLayer.y; fxLayer.scale.set(gameState.cameraZoom);
        uiLayer.x = gameLayer.x; uiLayer.y = gameLayer.y; uiLayer.scale.set(gameState.cameraZoom);
        
        backgroundLayer.x = gameLayer.x * 0.1; backgroundLayer.y = gameLayer.y * 0.1;

        // Effet Screen Shake Global
        if (gameState.shakeIntensity > 0) {
            app.stage.x = (Math.random() - 0.5) * gameState.shakeIntensity;
            app.stage.y = (Math.random() - 0.5) * gameState.shakeIntensity;
            gameState.shakeIntensity *= 0.85;
            if (gameState.shakeIntensity < 0.5) { gameState.shakeIntensity = 0; app.stage.x = 0; app.stage.y = 0; }
        }

        // HUD Text updates
        document.getElementById('size').textContent = Math.floor(player.size);
        document.getElementById('population').textContent = cells.length;
        document.getElementById('fps').textContent = Math.round(app.ticker.FPS);
    });

})(); // Fin de l'encapsulation IIFE
