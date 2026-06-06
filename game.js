// ==========================================================================
// MOTEUR SPORE EVO - ÉDITION COMPLÈTE (MUTATIONS, BIOMES & CAMÉRA FLUIDE)
// ==========================================================================

(function() {
    const WORLD_WIDTH = 5000;
    const WORLD_HEIGHT = 5000;

    let app;
    let player = null;
    let enemies = [];
    let ambientParticles = [];
    
    let gameState = {
        paused: true,
        age: 0,
        shakeIntensity: 0,
        cameraZoom: 1,
        camX: WORLD_WIDTH / 2,
        camY: WORLD_HEIGHT / 2,
        mouseX: 0,
        mouseY: 0,
        currentWorld: 1,
        isTerrestrial: false
    };

    const WORLDS = {
        1: { name: "Abysse", bg: 0x030812, color: 0x00ffcc },
        2: { name: "Récif Lumineux", bg: 0x011a24, color: 0x00aaff },
        3: { name: "Zone Terrestre", bg: 0x1a2113, color: 0x55ff22, terrestrial: true }
    };

    // ==========================================================================
    // SYSTÈME DE POOLING & FX
    // ==========================================================================
    class SmartPool {
        constructor(createFn) {
            this.pool = []; this.activeList = []; this.createFn = createFn;
        }
        get(...args) {
            let item = this.pool.length > 0 ? this.pool.pop() : this.createFn();
            item.init(...args); this.activeList.push(item); return item;
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

    document.addEventListener('DOMContentLoaded', () => {
        app = new PIXI.Application({
            resizeTo: window, backgroundColor: WORLDS[1].bg,
            resolution: window.devicePixelRatio || 1, autoDensity: true, antialias: true
        });
        const container = document.getElementById('game-container');
        if (container) container.appendChild(app.view);

        const worldContainer = new PIXI.Container();
        const bgLayer = new PIXI.Container();
        const foodLayer = new PIXI.Container();
        const entityLayer = new PIXI.Container();
        const fxLayer = new PIXI.Container();
        const uiLayer = new PIXI.Container();

        worldContainer.addChild(bgLayer, foodLayer, entityLayer, fxLayer);
        app.stage.addChild(worldContainer, uiLayer);

        app.view.addEventListener('mousemove', (e) => {
            gameState.mouseX = e.clientX; gameState.mouseY = e.clientY;
        });

        class Particle {
            constructor() {
                this.gfx = new PIXI.Graphics();
                this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
                fxLayer.addChild(this.gfx);
            }
            init(x, y, color, speed, size) {
                this.x = x; this.y = y; this.color = color; this.size = size;
                this.vx = (Math.random() - 0.5) * speed; this.vy = (Math.random() - 0.5) * speed;
                this.life = 1.0; this.decay = Math.random() * 0.03 + 0.02;
                this.active = true; this.gfx.visible = true;
            }
            update(delta) {
                this.x += this.vx * delta; this.y += this.vy * delta;
                this.vx *= 0.9; this.vy *= 0.9; this.life -= this.decay * delta;
                if (this.life <= 0) { this.active = false; return; }
                this.gfx.clear(); this.gfx.beginFill(this.color, this.life);
                this.gfx.drawCircle(0, 0, this.size * this.life); this.gfx.endFill();
                this.gfx.position.set(this.x, this.y);
            }
            sleep() { this.gfx.visible = false; }
        }

        class FloatingText {
            constructor() {
                this.txt = new PIXI.Text('', { fontFamily: 'Impact', fill: 0xffffff, stroke: 0x000, strokeThickness: 4 });
                this.txt.anchor.set(0.5);
                fxLayer.addChild(this.txt);
            }
            init(x, y, text, color) {
                this.x = x; this.y = y; this.txt.text = text; this.txt.style.fill = color;
                this.life = 60; this.active = true; this.txt.visible = true;
            }
            update(delta) {
                this.y -= 1.5 * delta; this.life -= delta;
                this.txt.position.set(this.x, this.y);
                this.txt.alpha = this.life / 60;
                this.txt.scale.set(1 + Math.sin(this.life * 0.1) * 0.1);
                if (this.life <= 0) this.active = false;
            }
            sleep() { this.txt.visible = false; }
        }

        class Food {
            constructor() {
                this.gfx = new PIXI.Graphics();
                foodLayer.addChild(this.gfx);
            }
            init(x, y, type) {
                this.x = x; this.y = y; this.type = type; // 'plant' ou 'meat'
                this.color = type === 'meat' ? 0xff2a55 : 0x00ffaa;
                this.pulseOff = Math.random() * 10;
                this.active = true; this.gfx.visible = true;
            }
            update(delta) {
                let scale = 1 + Math.sin(gameState.age * 0.1 + this.pulseOff) * 0.15;
                this.gfx.clear();
                this.gfx.beginFill(this.color, 0.7);
                if (this.type === 'meat') {
                    this.gfx.drawRect(-3*scale, -3*scale, 6*scale, 6*scale);
                } else {
                    this.gfx.drawCircle(0, 0, 4 * scale);
                }
                this.gfx.endFill();
                this.gfx.position.set(this.x, this.y);
            }
            sleep() { this.gfx.visible = false; }
        }

        const particlePool = new SmartPool(() => new Particle());
        const textPool = new SmartPool(() => new FloatingText());
        const foodPool = new SmartPool(() => new Food());

        // ==========================================================================
        // ENTITÉ PRINCIPALE ET MUTATIONS
        // ==========================================================================
        class Entity {
            constructor(x, y, size, diet, isPlayer = false) {
                this.x = x; this.y = y; 
                this.size = size; this.targetSize = size;
                this.vx = 0; this.vy = 0;
                this.diet = diet; // 'herbivore' ou 'carnivore'
                this.isPlayer = isPlayer;
                this.mutationLevel = 0;
                
                // Différences asymétriques
                this.color = diet === 'herbivore' ? 0x00ffcc : 0xff2a55;
                this.baseSpeed = diet === 'herbivore' ? 0.35 : 0.55;
                this.magnetPower = diet === 'herbivore' ? 6 : 1.5;

                this.container = new PIXI.Container();
                this.body = new PIXI.Graphics();
                this.container.addChild(this.body);
                entityLayer.addChild(this.container);
                
                this.draw();
            }

            draw() {
                this.body.clear();
                this.body.beginFill(this.color);
                this.body.lineStyle(2, 0xffffff, 0.8);
                
                // La forme change selon le régime et la mutation
                if (this.diet === 'carnivore') {
                    let points = 5 + this.mutationLevel * 2;
                    this.body.drawStar(0, 0, points, this.size, this.size * 0.7);
                } else {
                    this.body.drawCircle(0, 0, this.size);
                    if (this.mutationLevel > 0) {
                        this.body.beginFill(0xffffff, 0.2);
                        this.body.drawCircle(0, 0, this.size * 0.5); // Noyau visible
                    }
                }
                this.body.endFill();
            }

            mutate() {
                this.mutationLevel++;
                this.baseSpeed += 0.05;
                this.magnetPower += 0.5;
                this.draw();
                
                if (this.isPlayer) {
                    textPool.get(this.x, this.y - this.size - 20, "🧬 MUTATION !", 0xffd700);
                    for(let i=0; i<15; i++) particlePool.get(this.x, this.y, 0xffd700, 10, 4);
                    gameState.shakeIntensity = 10;
                }
            }

            eat(foodType, amount) {
                // Pénalité/Bonus selon le régime
                if (this.diet === 'herbivore' && foodType === 'meat') return; // Ne mange pas de viande
                if (this.diet === 'carnivore' && foodType === 'plant') return; // Ne mange pas de plantes
                
                this.targetSize += amount;
                if (this.isPlayer) {
                    for(let i=0; i<3; i++) particlePool.get(this.x, this.y, 0xffffff, 5, 2);
                    
                    // Gestion des paliers de mutation
                    let nextThreshold = 20 + (this.mutationLevel * 25);
                    if (this.targetSize > nextThreshold) this.mutate();

                    // Transition de monde
                    if (this.targetSize > 60 && gameState.currentWorld === 1) transitionWorld(2);
                    if (this.targetSize > 110 && gameState.currentWorld === 2) transitionWorld(3);
                }
            }

            update(delta, targetX = null, targetY = null) {
                if (this.size < this.targetSize) {
                    this.size += 0.1 * delta;
                    this.draw();
                }

                if (targetX !== null && targetY !== null) {
                    let dx = targetX - this.x; let dy = targetY - this.y;
                    let dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist > 5) {
                        let speedLimit = this.baseSpeed * (50 / this.size);
                        this.vx += (dx / dist) * speedLimit;
                        this.vy += (dy / dist) * speedLimit;
                    }
                }

                // Physique différente sur terre vs dans l'eau
                let friction = gameState.isTerrestrial ? 0.80 : 0.94;
                this.vx *= friction; this.vy *= friction;
                
                this.x += this.vx * delta; this.y += this.vy * delta;
                
                // Confinement
                this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
                this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

                this.container.x = this.x; this.container.y = this.y;

                // Game Feel visuel
                let speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
                if (speed > 0.5 && !gameState.isTerrestrial) {
                    this.container.rotation = Math.atan2(this.vy, this.vx);
                    this.body.scale.set(1 + speed * 0.02, 1 - speed * 0.02);
                } else {
                    this.container.rotation = 0;
                    let breath = Math.sin(gameState.age * 0.05) * 0.03;
                    this.body.scale.set(1 + breath, 1 - breath);
                }
            }
        }

        // ==========================================================================
        // GESTION DU MONDE ET BOUCLE DE JEU
        // ==========================================================================
        function spawnFood(amount) {
            for(let i = 0; i < amount; i++) {
                let type = Math.random() > 0.4 ? 'plant' : 'meat';
                foodPool.get(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, type);
            }
        }

        function spawnEnemies(amount) {
            enemies.forEach(e => { entityLayer.removeChild(e.container); });
            enemies = [];
            for(let i = 0; i < amount; i++) {
                let eDiet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
                let eSize = Math.random() * 30 + 10;
                enemies.push(new Entity(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, eSize, eDiet, false));
            }
        }

        function transitionWorld(worldId) {
            gameState.currentWorld = worldId;
            let conf = WORLDS[worldId];
            app.renderer.backgroundColor = conf.bg;
            gameState.isTerrestrial = conf.terrestrial || false;
            
            textPool.get(player.x, player.y - 80, `🌊 ENTRÉE : ${conf.name} 🌊`, conf.color);
            gameState.shakeIntensity = 15;
            spawnEnemies(30); // Regénère la faune locale
        }

        const startGame = (diet) => {
            const menu = document.getElementById('start-menu');
            if (menu) menu.style.display = 'none';

            player = new Entity(WORLD_WIDTH/2, WORLD_HEIGHT/2, 15, diet, true);
            gameState.camX = player.x; gameState.camY = player.y; // Initialisation propre
            
            spawnFood(400);
            spawnEnemies(30);
            gameState.paused = false;
        };

        const btnHerbi = document.getElementById('btn-herbivore');
        const btnCarni = document.getElementById('btn-carnivore');
        if (btnHerbi) btnHerbi.addEventListener('click', () => startGame('herbivore'));
        if (btnCarni) btnCarni.addEventListener('click', () => startGame('carnivore'));

        // LA BOUCLE MAGIQUE (TICKER)
        app.ticker.add((ticker) => {
            if (gameState.paused || !player) return;
            const delta = ticker.deltaTime;
            gameState.age += delta;

            // 1. Mouvement du joueur
            let targetWorldX = (gameState.mouseX - app.screen.width/2) / gameState.cameraZoom + gameState.camX;
            let targetWorldY = (gameState.mouseY - app.screen.height/2) / gameState.cameraZoom + gameState.camY;
            player.update(delta, targetWorldX, targetWorldY);

            // 2. IA des Ennemis
            enemies.forEach(enemy => {
                let dx = player.x - enemy.x; let dy = player.y - enemy.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                
                // Comportement de chasse ou de fuite
                if (dist < 300) {
                    if (enemy.diet === 'carnivore' && enemy.size > player.size) enemy.update(delta, player.x, player.y); // Chasse
                    else if (enemy.size < player.size) enemy.update(delta, enemy.x - dx, enemy.y - dy); // Fuit
                    else enemy.update(delta, enemy.x + Math.sin(gameState.age * 0.05)*10, enemy.y + Math.cos(gameState.age * 0.05)*10);
                } else {
                    enemy.update(delta, null, null); // Errance
                }

                // Collision Joueur vs Ennemi (Manger ou être mangé)
                if (dist < player.size + enemy.size * 0.5) {
                    if (player.size > enemy.size * 1.2 && player.diet === 'carnivore') {
                        player.eat('meat', enemy.size * 0.3);
                        enemy.x = -1000; // Hors carte, sera géré autrement dans une vraie architecture
                        textPool.get(player.x, player.y, "CRUNCH !", 0xff2a55);
                    } else if (enemy.size > player.size * 1.2 && enemy.diet === 'carnivore') {
                        // Game Over logic
                        gameState.paused = true;
                        if (document.getElementById('start-menu')) {
                            document.getElementById('start-menu').style.display = 'flex';
                            document.getElementById('start-menu').innerHTML = `<h1>MANGÉ !</h1><button onclick="location.reload()">Recommencer</button>`;
                        }
                    }
                }
            });

            // 3. Magnétisme et Nutrition
            let magnetRadius = player.size * player.magnetPower;
            foodPool.activeList.forEach(food => {
                let dx = food.x - player.x; let dy = food.y - player.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                // Attirer la nourriture compatible
                if (dist < magnetRadius) {
                    if ((player.diet === 'herbivore' && food.type === 'plant') || 
                        (player.diet === 'carnivore' && food.type === 'meat')) {
                        food.x -= (dx / dist) * 12 * delta;
                        food.y -= (dy / dist) * 12 * delta;
                    }
                }
                
                // Consommer
                if (dist < player.size) {
                    player.eat(food.type, 0.4);
                    foodPool.release(food);
                    // Cycle infini de nourriture
                    let newType = Math.random() > 0.4 ? 'plant' : 'meat';
                    foodPool.get(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, newType);
                }
            });

            particlePool.updateAll(delta);
            textPool.updateAll(delta);
            foodPool.updateAll(delta);

            // 4. FIX CAMÉRA : Le secret d'une caméra sans téléportation
            let targetZoom = Math.max(0.15, 30 / player.size);
            gameState.cameraZoom += (targetZoom - gameState.cameraZoom) * 0.05 * delta;

            gameState.camX += (player.x - gameState.camX) * 0.1 * delta;
            gameState.camY += (player.y - gameState.camY) * 0.1 * delta;

            let finalCamX = gameState.camX;
            let finalCamY = gameState.camY;

            if (gameState.shakeIntensity > 0) {
                finalCamX += (Math.random() - 0.5) * gameState.shakeIntensity;
                finalCamY += (Math.random() - 0.5) * gameState.shakeIntensity;
                gameState.shakeIntensity *= 0.85;
                if (gameState.shakeIntensity < 0.5) gameState.shakeIntensity = 0;
            }

            // Utilisation du pivot pour un zoom parfaitement centré sans sauts mathématiques
            worldContainer.pivot.set(finalCamX, finalCamY);
            worldContainer.position.set(app.screen.width / 2, app.screen.height / 2);
            worldContainer.scale.set(gameState.cameraZoom);

            bgLayer.x = finalCamX * 0.1;
            bgLayer.y = finalCamY * 0.1;

            // 5. Mise à jour HUD
            const sizeUI = document.getElementById('size');
            const fpsUI = document.getElementById('fps');
            const popUI = document.getElementById('population');
            if (sizeUI) sizeUI.textContent = `Taille: ${Math.floor(player.size)} | Mut: ${player.mutationLevel}`;
            if (fpsUI) fpsUI.textContent = Math.round(app.ticker.FPS);
            if (popUI) popUI.textContent = gameState.isTerrestrial ? "Biome: Terrestre" : `Biome: ${WORLDS[gameState.currentWorld].name}`;
        });
    });
})();
