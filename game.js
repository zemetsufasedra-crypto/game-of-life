// ==========================================================================
// MOTEUR SPORE EVO - ÉDITION INDIE AAA (BIOLUMINESCENCE & ADDICTION)
// ==========================================================================

(function() {
    // Sécurité : Encapsulation totale pour éviter la pollution globale
    const WORLD_WIDTH = 5000;
    const WORLD_HEIGHT = 5000;

    let app;
    let player = null;
    let enemies = [];
    let ambientPlankton = [];
    
    // Variables globales du jeu
    let gameState = {
        paused: true,
        age: 0,
        shakeIntensity: 0,
        cameraZoom: 1,
        mouseX: 0,
        mouseY: 0
    };

    // ==========================================================================
    // SYSTÈME ÉCO-RESPONSABLE : OBJECT POOLING (Zéro micro-saccade)
    // ==========================================================================
    class SmartPool {
        constructor(createFn) {
            this.pool = [];
            this.createFn = createFn;
            this.activeList = [];
        }
        get(...args) {
            let item = this.pool.length > 0 ? this.pool.pop() : this.createFn();
            item.init(...args);
            this.activeList.push(item);
            return item;
        }
        release(item) {
            item.sleep();
            this.activeList = this.activeList.filter(i => i !== item);
            this.pool.push(item);
        }
        updateAll(delta) {
            for (let i = this.activeList.length - 1; i >= 0; i--) {
                this.activeList[i].update(delta);
                if (!this.activeList[i].active) this.release(this.activeList[i]);
            }
        }
    }

    // ==========================================================================
    // INITIALISATION DU MOTEUR
    // ==========================================================================
    document.addEventListener('DOMContentLoaded', () => {
        // 1. Initialisation de PixiJS
        app = new PIXI.Application({
            resizeTo: window,
            backgroundColor: 0x030812, // Abysse sombre
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            antialias: true
        });
        const container = document.getElementById('game-container');
        if (container) container.appendChild(app.view);

        // 2. Architecture des calques (Profondeur)
        const worldContainer = new PIXI.Container();
        const bgLayer = new PIXI.Container();
        const foodLayer = new PIXI.Container();
        const entityLayer = new PIXI.Container();
        const fxLayer = new PIXI.Container();
        const uiLayer = new PIXI.Container();

        worldContainer.addChild(bgLayer, foodLayer, entityLayer, fxLayer);
        app.stage.addChild(worldContainer, uiLayer);

        // Capture de la souris globale
        app.view.addEventListener('mousemove', (e) => {
            gameState.mouseX = e.clientX;
            gameState.mouseY = e.clientY;
        });

        // ==========================================================================
        // CLASSES DE PARTICULES ET EFFETS VISUELS (LE "JUICE")
        // ==========================================================================
        class Particle {
            constructor() {
                this.gfx = new PIXI.Graphics();
                this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
                fxLayer.addChild(this.gfx);
                this.active = false;
            }
            init(x, y, color, speed, size) {
                this.x = x; this.y = y; this.color = color;
                this.vx = (Math.random() - 0.5) * speed;
                this.vy = (Math.random() - 0.5) * speed;
                this.life = 1.0;
                this.decay = Math.random() * 0.03 + 0.02;
                this.size = size;
                this.active = true;
                this.gfx.visible = true;
            }
            update(delta) {
                this.x += this.vx * delta; this.y += this.vy * delta;
                this.vx *= 0.9; this.vy *= 0.9; // Friction
                this.life -= this.decay * delta;
                
                if (this.life <= 0) { this.active = false; return; }
                
                this.gfx.clear();
                this.gfx.beginFill(this.color, this.life);
                this.gfx.drawCircle(0, 0, this.size * this.life);
                this.gfx.endFill();
                this.gfx.position.set(this.x, this.y);
            }
            sleep() { this.gfx.visible = false; }
        }

        class Shockwave {
            constructor() {
                this.gfx = new PIXI.Graphics();
                this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
                fxLayer.addChild(this.gfx);
                this.active = false;
            }
            init(x, y, color, maxRadius) {
                this.x = x; this.y = y; this.color = color;
                this.radius = 1; this.maxRadius = maxRadius;
                this.active = true; this.gfx.visible = true;
            }
            update(delta) {
                this.radius += 10 * delta;
                let alpha = 1 - (this.radius / this.maxRadius);
                if (alpha <= 0) { this.active = false; return; }
                
                this.gfx.clear();
                this.gfx.lineStyle(4, this.color, alpha);
                this.gfx.drawCircle(0, 0, this.radius);
                this.gfx.position.set(this.x, this.y);
            }
            sleep() { this.gfx.visible = false; }
        }

        class Food {
            constructor() {
                this.gfx = new PIXI.Graphics();
                this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
                foodLayer.addChild(this.gfx);
                this.active = false;
            }
            init(x, y, isMeat) {
                this.x = x; this.y = y; 
                this.isMeat = isMeat;
                this.color = isMeat ? 0xff2a55 : 0x00ffcc;
                this.pulseOff = Math.random() * Math.PI * 2;
                this.active = true;
                this.gfx.visible = true;
            }
            update(delta) {
                let scale = 1 + Math.sin(gameState.age * 0.1 + this.pulseOff) * 0.2;
                this.gfx.clear();
                this.gfx.beginFill(this.color, 0.6);
                this.gfx.drawCircle(0, 0, 4 * scale);
                this.gfx.beginFill(0xffffff, 1);
                this.gfx.drawCircle(0, 0, 1.5 * scale);
                this.gfx.endFill();
                this.gfx.position.set(this.x, this.y);
            }
            sleep() { this.gfx.visible = false; }
        }

        // Instanciation des Pools
        const particlePool = new SmartPool(() => new Particle());
        const shockwavePool = new SmartPool(() => new Shockwave());
        const foodPool = new SmartPool(() => new Food());

        // Création du plancton de fond (Parallaxe)
        for (let i = 0; i < 150; i++) {
            let p = new PIXI.Graphics();
            p.beginFill(0x00ffcc, Math.random() * 0.3);
            p.drawCircle(0, 0, Math.random() * 2 + 0.5);
            p.endFill();
            p.x = Math.random() * WORLD_WIDTH;
            p.y = Math.random() * WORLD_HEIGHT;
            p.vz = Math.random() * 0.5 + 0.1;
            bgLayer.addChild(p);
            ambientPlankton.push(p);
        }

        // ==========================================================================
        // ENTITÉ PRINCIPALE (JOUEUR ET ENNEMIS)
        // ==========================================================================
        class Entity {
            constructor(x, y, size, color, isPlayer) {
                this.x = x; this.y = y; 
                this.size = size; this.targetSize = size;
                this.vx = 0; this.vy = 0;
                this.color = color;
                this.isPlayer = isPlayer;
                
                // Système de Combo
                this.combo = 0;
                this.comboTimer = 0;
                this.frenzyMode = false;

                this.container = new PIXI.Container();
                this.aura = new PIXI.Graphics();
                this.body = new PIXI.Graphics();
                
                this.aura.blendMode = PIXI.BLEND_MODES.ADD;
                this.container.addChild(this.aura, this.body);
                entityLayer.addChild(this.container);
                
                this.draw();
            }

            draw() {
                this.body.clear();
                this.body.beginFill(this.color);
                this.body.lineStyle(2, 0xffffff, 0.5);
                this.body.drawCircle(0, 0, this.size);
                this.body.endFill();

                this.aura.clear();
                this.aura.beginFill(this.color, 0.3);
                this.aura.drawCircle(0, 0, this.size * 1.8);
                this.aura.endFill();
            }

            eat(amount) {
                this.targetSize += amount;
                
                // Mécanique addictive : Combos et Frénésie
                if (this.isPlayer) {
                    this.combo++;
                    this.comboTimer = 60; // 1 seconde à 60fps pour enchaîner
                    
                    // Feedback visuel de consommation
                    for(let i=0; i<5; i++) {
                        particlePool.get(this.x, this.y, 0xffffff, 15, 3);
                    }

                    if (this.combo > 10 && !this.frenzyMode) {
                        this.frenzyMode = true;
                        gameState.shakeIntensity = 15; // Énorme secousse
                        shockwavePool.get(this.x, this.y, 0xffd700, 300);
                        this.color = 0xffd700; // Devient doré
                        this.draw();
                    }
                }
            }

            update(delta, targetX = null, targetY = null) {
                // Interpolation douce de la taille (Croissance organique)
                if (this.size < this.targetSize) {
                    this.size += 0.05 * delta;
                    this.draw();
                }

                // Gestion des Combos
                if (this.comboTimer > 0) {
                    this.comboTimer -= delta;
                } else if (this.isPlayer && this.combo > 0) {
                    this.combo = 0;
                    if (this.frenzyMode) {
                        this.frenzyMode = false;
                        this.color = 0x00ffcc; // Retour à la couleur normale
                        this.draw();
                    }
                }

                // Physique et Mouvement
                if (targetX !== null && targetY !== null) {
                    let dx = targetX - this.x;
                    let dy = targetY - this.y;
                    let dist = Math.sqrt(dx*dx + dy*dy);
                    
                    if (dist > 5) {
                        let speedLimit = (this.frenzyMode ? 0.8 : 0.4) * (50 / this.size);
                        this.vx += (dx / dist) * speedLimit;
                        this.vy += (dy / dist) * speedLimit;
                    }
                }

                this.vx *= 0.92; // Friction aquatique
                this.vy *= 0.92;
                
                this.x += this.vx * delta;
                this.y += this.vy * delta;

                // Limites du monde
                this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
                this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

                this.container.x = this.x;
                this.container.y = this.y;

                // SQUASH & STRETCH (Le secret du Game Feel AAA)
                let speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
                if (speed > 0.5) {
                    this.container.rotation = Math.atan2(this.vy, this.vx);
                    this.body.scale.set(1 + speed * 0.02, 1 - speed * 0.02);
                } else {
                    // Respiration au repos
                    let breath = Math.sin(gameState.age * 0.05) * 0.03;
                    this.body.scale.set(1 + breath, 1 - breath);
                }

                // Sillage de particules si grande vitesse
                if (speed > 4 && Math.random() > 0.5) {
                    particlePool.get(this.x - this.vx, this.y - this.vy, this.color, 2, 4);
                }
            }
        }

        // ==========================================================================
        // CONTRÔLEURS ET BOUCLE DE JEU
        // ==========================================================================
        function spawnFood(amount) {
            for(let i = 0; i < amount; i++) {
                foodPool.get(
                    Math.random() * WORLD_WIDTH, 
                    Math.random() * WORLD_HEIGHT, 
                    Math.random() > 0.5
                );
            }
        }

        const btnHerbi = document.getElementById('btn-herbivore');
        const btnCarni = document.getElementById('btn-carnivore');

        const startGame = (diet) => {
            const menu = document.getElementById('start-menu');
            if (menu) menu.style.display = 'none';

            let playerColor = diet === 'herbivore' ? 0x00ffcc : 0xff2a55;
            player = new Entity(WORLD_WIDTH/2, WORLD_HEIGHT/2, 15, playerColor, true);
            
            spawnFood(400); // Remplir la carte
            gameState.paused = false;
        };

        if (btnHerbi) btnHerbi.addEventListener('click', () => startGame('herbivore'));
        if (btnCarni) btnCarni.addEventListener('click', () => startGame('carnivore'));

        // LA BOUCLE MAGIQUE (60 FPS constants)
        app.ticker.add((ticker) => {
            if (gameState.paused || !player) return;
            
            const delta = ticker.deltaTime;
            gameState.age += delta;

            // 1. Calcul du mouvement du joueur vers la souris dans le monde
            let targetWorldX = (gameState.mouseX - app.screen.width/2) / gameState.cameraZoom + player.x;
            let targetWorldY = (gameState.mouseY - app.screen.height/2) / gameState.cameraZoom + player.y;
            player.update(delta, targetWorldX, targetWorldY);

            // 2. Logique d'absorption Magnétique (Hyper satisfaisant)
            let magnetRadius = player.size * 4;
            foodPool.activeList.forEach(food => {
                let dx = food.x - player.x;
                let dy = food.y - player.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < magnetRadius) {
                    // Attraction
                    food.x -= (dx / dist) * 12 * delta;
                    food.y -= (dy / dist) * 12 * delta;
                }
                
                if (dist < player.size) {
                    // Miam
                    player.eat(0.2);
                    foodPool.release(food);
                    // On fait respawn la nourriture ailleurs pour un cycle infini
                    foodPool.get(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() > 0.5);
                }
            });

            // 3. Mise à jour des pools (Particules, Nourriture, FX)
            particlePool.updateAll(delta);
            shockwavePool.updateAll(delta);
            foodPool.updateAll(delta);

            // 4. Parallaxe du plancton
            ambientPlankton.forEach(p => {
                p.y -= p.vz * delta;
                p.x += Math.sin(gameState.age * 0.02 + p.vz) * 0.5 * delta;
                if (p.y < 0) p.y = WORLD_HEIGHT;
                if (p.x < 0) p.x = WORLD_WIDTH;
                if (p.x > WORLD_WIDTH) p.x = 0;
            });

            // 5. Caméra Dynamique (Smooth Damp + Dézoom évolutif)
            let targetZoom = Math.max(0.3, 20 / player.size);
            gameState.cameraZoom += (targetZoom - gameState.cameraZoom) * 0.05 * delta;

            let targetCamX = app.screen.width/2 - player.x * gameState.cameraZoom;
            let targetCamY = app.screen.height/2 - player.y * gameState.cameraZoom;

            // Secousse d'écran (Screen Shake)
            if (gameState.shakeIntensity > 0) {
                targetCamX += (Math.random() - 0.5) * gameState.shakeIntensity;
                targetCamY += (Math.random() - 0.5) * gameState.shakeIntensity;
                gameState.shakeIntensity *= 0.85; // Amortissement
                if (gameState.shakeIntensity < 0.5) gameState.shakeIntensity = 0;
            }

            worldContainer.x += (targetCamX - worldContainer.x) * 0.1 * delta;
            worldContainer.y += (targetCamY - worldContainer.y) * 0.1 * delta;
            worldContainer.scale.set(gameState.cameraZoom);

            // Effet de parallaxe sur le fond
            bgLayer.x = player.x * 0.2;
            bgLayer.y = player.y * 0.2;

            // 6. Mise à jour de l'UI HTML
            const sizeUI = document.getElementById('size');
            const fpsUI = document.getElementById('fps');
            const popUI = document.getElementById('population');
            if (sizeUI) sizeUI.textContent = Math.floor(player.size);
            if (fpsUI) fpsUI.textContent = Math.round(app.ticker.FPS);
            if (popUI) popUI.textContent = player.combo > 0 ? `Combo x${player.combo} 🔥` : "Normal";
        });
    });
})();
