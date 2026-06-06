// ============================================================================
// EVOSPHERE - SPORE SIMULATOR v2.0 (FIXED & STABLE)
// ============================================================================

(function() {
    const WORLD_WIDTH = 5000;
    const WORLD_HEIGHT = 5000;

    // ==================== CONFIG ====================
    const WORLDS = {
        1: { name: "Abysse", bg: 0x030812, color: 0x00ffcc, foodDensity: 350, enemyCount: 25 },
        2: { name: "Récif Lumineux", bg: 0x011a24, color: 0x00aaff, foodDensity: 400, enemyCount: 30 },
        3: { name: "Épave Abyssale", bg: 0x0d1117, color: 0xff6b9d, foodDensity: 380, enemyCount: 35 },
        4: { name: "Zone Thermale", bg: 0x1a0f0a, color: 0xffaa00, foodDensity: 300, enemyCount: 40 },
        5: { name: "Utopie Terrestre", bg: 0x1a2113, color: 0x55ff22, foodDensity: 500, enemyCount: 45 }
    };

    const MUTATIONS = {
        flagella: { name: "Flagelle", color: 0xffaa00, speedMult: 1.3, desc: "+30% vitesse" },
        spike: { name: "Épine", color: 0xff1e56, damageMult: 1.5, desc: "+50% dégâts" },
        shield: { name: "Armure", color: 0x6b7adb, defenseMult: 1.4, desc: "+40% défense" },
        neuron: { name: "Neurone", color: 0xa78bfa, magnetMult: 1.6, desc: "+60% sensibilité" },
        chemosynthesis: { name: "Chimio", color: 0x00ffcc, foodEff: 1.5, desc: "+50% assimilation" }
    };

    // ==================== STATE ====================
    let app = null;
    let player = null;
    let enemies = [];
    let allParticles = [];
    let foodPool = [];

    // Layers GLOBALES
    let worldContainer, bgLayer, foodLayer, entityLayer, fxLayer;

    let gameState = {
        paused: false,
        muted: false,
        age: 0,
        shakeIntensity: 0,
        cameraZoom: 1,
        camX: WORLD_WIDTH / 2,
        camY: WORLD_HEIGHT / 2,
        mouseX: 0,
        mouseY: 0,
        currentWorld: 1,
        startTime: Date.now(),
        worldsExplored: new Set([1]),
        isTerrestrial: false
    };

    let audioCtx = null;

    // ==================== AUDIO ====================
    function initAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.log("Audio not supported");
            }
        }
    }

    function playSound(freq, duration, type = 'sine') {
        if (gameState.muted || !audioCtx) return;
        try {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + duration);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
            osc.start(now);
            osc.stop(now + duration);
        } catch (e) {}
    }

    // ==================== POOLING ====================
    class EntityPool {
        constructor() {
            this.pool = [];
            this.active = [];
        }

        get(x, y, size, diet) {
            let entity = this.pool.length > 0 ? this.pool.pop() : new Entity(x, y, size, diet, false);
            entity.revive(x, y, size, diet);
            this.active.push(entity);
            return entity;
        }

        release(entity) {
            if (entity.container && entity.container.parent) {
                entity.container.parent.removeChild(entity.container);
            }
            this.active = this.active.filter(e => e !== entity);
            this.pool.push(entity);
        }

        updateAll(delta) {
            for (let i = this.active.length - 1; i >= 0; i--) {
                this.active[i].update(delta);
            }
        }

        killAll() {
            for (let e of this.active) {
                if (e.container && e.container.parent) {
                    e.container.parent.removeChild(e.container);
                }
            }
            this.pool.push(...this.active);
            this.active = [];
        }
    }

    // ==================== PARTICLE ====================
    class Particle {
        constructor(x, y, vx, vy, color, size, life) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.color = color;
            this.size = size;
            this.maxLife = life;
            this.life = life;
            this.active = true;
            this.gfx = new PIXI.Graphics();
            this.gfx.blendMode = PIXI.BLEND_MODES.ADD;
            allParticles.push(this);
        }

        update(delta) {
            this.x += this.vx * delta;
            this.y += this.vy * delta;
            this.vx *= 0.92;
            this.vy *= 0.92;
            this.life -= delta;

            if (this.life <= 0) {
                this.active = false;
                return;
            }

            const alpha = this.life / this.maxLife;
            this.gfx.clear();
            this.gfx.beginFill(this.color, alpha * 0.8);
            this.gfx.drawCircle(0, 0, this.size * alpha);
            this.gfx.endFill();
            this.gfx.position.set(this.x, this.y);
        }
    }

    // ==================== ENTITY (Joueur + Ennemis) ====================
    class Entity {
        constructor(x, y, size, diet, isPlayer = false) {
            this.isPlayer = isPlayer;
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.size = size;
            this.targetSize = size;
            this.diet = diet;
            this.mutations = {};
            this.color = diet === 'herbivore' ? 0x00ffcc : 0xff2a55;
            this.health = 100;
            this.hungerLevel = 100;
            this.container = null;
            this.body = null;
            this.draw();
        }

        revive(x, y, size, diet) {
            this.x = x;
            this.y = y;
            this.size = size;
            this.targetSize = size;
            this.diet = diet;
            this.health = 100;
            this.hungerLevel = 100;
            this.mutations = {};
            this.color = diet === 'herbivore' ? 0x00ffcc : 0xff2a55;

            if (!this.container) {
                this.container = new PIXI.Container();
                this.body = new PIXI.Graphics();
                this.container.addChild(this.body);
                if (entityLayer) {
                    entityLayer.addChild(this.container);
                }
            }
            this.draw();
        }

        draw() {
            if (!this.body) return;
            this.body.clear();
            this.body.beginFill(this.color);
            this.body.lineStyle(2, 0xffffff, 0.7);

            if (this.diet === 'carnivore') {
                // Carnivore = polygone pointu
                this.drawStar(0, 0, 5 + Object.keys(this.mutations).length, this.size, this.size * 0.65);
            } else {
                this.body.drawCircle(0, 0, this.size);
                if (Object.keys(this.mutations).length > 0) {
                    this.body.beginFill(0xffffff, 0.15);
                    this.body.drawCircle(0, 0, this.size * 0.5);
                }
            }
            this.body.endFill();
        }

        drawStar(x, y, points, radius1, radius2) {
            const step = (Math.PI * 2) / points;
            const pathX = [];
            const pathY = [];

            for (let i = 0; i < points * 2; i++) {
                const r = i % 2 === 0 ? radius1 : radius2;
                const angle = (i * step) / 2 - Math.PI / 2;
                pathX.push(x + Math.cos(angle) * r);
                pathY.push(y + Math.sin(angle) * r);
            }

            this.body.moveTo(pathX[0], pathY[0]);
            for (let i = 1; i < pathX.length; i++) {
                this.body.lineTo(pathX[i], pathY[i]);
            }
            this.body.lineTo(pathX[0], pathY[0]);
        }

        getMutationBonus(type) {
            const mut = this.mutations[type];
            return mut ? MUTATIONS[type][type + 'Mult'] || 1 : 1;
        }

        getStats() {
            const baseSpeed = this.diet === 'herbivore' ? 0.35 : 0.55;
            const baseMagnet = this.diet === 'herbivore' ? 6 : 1.5;
            return {
                speed: baseSpeed * this.getMutationBonus('flagella') * (50 / this.size),
                magnetism: baseMagnet * this.getMutationBonus('neuron'),
                damage: (this.diet === 'carnivore' ? 1.2 : 0.3) * this.getMutationBonus('spike'),
                defense: 1 * this.getMutationBonus('shield')
            };
        }

        eat(foodType, foodSize, amount = 1) {
            const compatible = (this.diet === 'herbivore' && foodType === 'plant') ||
                             (this.diet === 'carnivore' && foodType === 'meat');
            if (!compatible) return false;

            const foodEff = this.mutations.chemosynthesis ? 1.5 : 1;
            this.targetSize += amount * foodEff * 0.5;
            this.hungerLevel = Math.min(100, this.hungerLevel + 20 * foodEff);
            return true;
        }

        mutate() {
            const availableMutations = Object.keys(MUTATIONS).filter(m => !this.mutations[m]);
            if (availableMutations.length === 0) return;

            const chosen = availableMutations[Math.floor(Math.random() * availableMutations.length)];
            this.mutations[chosen] = true;
            this.color = MUTATIONS[chosen].color;
            this.draw();

            if (this.isPlayer) {
                playSound(800, 0.3);
                showMutationChoice();
            }
        }

        update(delta, targetX = null, targetY = null) {
            // Faim et santé
            this.hungerLevel = Math.max(0, this.hungerLevel - 0.1 * delta);
            if (this.hungerLevel < 20) this.health -= 0.5 * delta;
            if (this.health <= 0) return;

            // Croissance
            if (this.size < this.targetSize) {
                this.size += 0.15 * delta;
                this.draw();
            }

            // Mouvement
            if (targetX !== null && targetY !== null) {
                const dx = targetX - this.x;
                const dy = targetY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    const stats = this.getStats();
                    this.vx += (dx / dist) * stats.speed * 0.05;
                    this.vy += (dy / dist) * stats.speed * 0.05;
                }
            }

            // Physique
            const friction = gameState.isTerrestrial ? 0.80 : 0.94;
            this.vx *= friction;
            this.vy *= friction;
            this.x += this.vx * delta;
            this.y += this.vy * delta;

            // Confinement
            this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
            this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

            // Position
            if (this.container) {
                this.container.x = this.x;
                this.container.y = this.y;

                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (speed > 0.5 && !gameState.isTerrestrial) {
                    this.container.rotation = Math.atan2(this.vy, this.vx);
                    this.body.scale.set(1 + speed * 0.01, 1 - speed * 0.01);
                } else {
                    const breath = Math.sin(gameState.age * 0.05) * 0.02;
                    this.body.scale.set(1 + breath, 1 - breath);
                }
            }
        }
    }

    // ==================== INIT ====================
    document.addEventListener('DOMContentLoaded', () => {
        app = new PIXI.Application({
            resizeTo: window,
            backgroundColor: WORLDS[1].bg,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            antialias: true
        });

        const container = document.getElementById('game-container');
        if (container) container.appendChild(app.view);

        // Layers GLOBALES
        worldContainer = new PIXI.Container();
        bgLayer = new PIXI.Container();
        foodLayer = new PIXI.Container();
        entityLayer = new PIXI.Container();
        fxLayer = new PIXI.Container();

        worldContainer.addChild(bgLayer, foodLayer, entityLayer, fxLayer);
        app.stage.addChild(worldContainer);

        app.view.addEventListener('mousemove', (e) => {
            gameState.mouseX = e.clientX;
            gameState.mouseY = e.clientY;
        });

        // ==================== FOOD ====================
        function spawnFood(amount) {
            for (let i = 0; i < amount; i++) {
                const type = Math.random() > 0.4 ? 'plant' : 'meat';
                const x = Math.random() * WORLD_WIDTH;
                const y = Math.random() * WORLD_HEIGHT;

                const food = new PIXI.Graphics();
                food.pulseOff = Math.random() * 10;
                foodLayer.addChild(food);

                foodPool.push({
                    x, y, type, food, active: true,
                    update(delta) {
                        const scale = 1 + Math.sin(gameState.age * 0.1 + this.pulseOff) * 0.15;
                        const color = this.type === 'meat' ? 0xff2a55 : 0x00ffaa;
                        this.food.clear();
                        this.food.beginFill(color, 0.7);
                        if (this.type === 'meat') {
                            this.food.drawRect(-3 * scale, -3 * scale, 6 * scale, 6 * scale);
                        } else {
                            this.food.drawCircle(0, 0, 4 * scale);
                        }
                        this.food.endFill();
                        this.food.position.set(this.x, this.y);
                    }
                });
            }
        }

        // ==================== ENEMIES ====================
        const enemyPool = new EntityPool();

        function spawnEnemies(amount) {
            enemyPool.killAll();
            enemies = [];
            for (let i = 0; i < amount; i++) {
                const diet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
                const size = Math.random() * 25 + 8;
                const enemy = enemyPool.get(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, size, diet);
                enemies.push(enemy);
            }
        }

        // ==================== TRANSITIONS ====================
        function transitionWorld(worldId) {
            if (gameState.currentWorld === worldId) return;
            gameState.currentWorld = worldId;
            gameState.worldsExplored.add(worldId);

            const conf = WORLDS[worldId];
            app.renderer.backgroundColor = conf.bg;
            gameState.isTerrestrial = conf.terrestrial || false;

            document.getElementById('biome').textContent = conf.name;

            playSound(400, 0.5);
            gameState.shakeIntensity = 20;

            foodPool = foodPool.filter(f => f.active);
            spawnFood(conf.foodDensity - foodPool.length);
            spawnEnemies(conf.enemyCount);
        }

        // ==================== MUTATIONS ====================
        function showMutationChoice() {
            const modal = document.getElementById('mutation-modal');
            const choices = document.getElementById('mutationChoices');
            choices.innerHTML = '';

            const available = Object.keys(MUTATIONS).filter(m => !player.mutations[m]);
            const selected = available.slice(0, 3);

            selected.forEach(mutKey => {
                const mut = MUTATIONS[mutKey];
                const btn = document.createElement('button');
                btn.className = 'mutation-btn';
                btn.innerHTML = `<div class="mutation-name">${mut.name}</div><div class="mutation-desc">${mut.desc}</div>`;
                btn.onclick = () => {
                    player.mutations[mutKey] = true;
                    player.color = mut.color;
                    player.draw();
                    modal.classList.add('hidden');
                    gameState.paused = false;
                    playSound(600, 0.2);
                };
                choices.appendChild(btn);
            });

            modal.classList.remove('hidden');
            gameState.paused = true;
        }

        // ==================== GAME OVER ====================
        function triggerGameOver() {
            gameState.paused = true;
            const modal = document.getElementById('gameover-modal');
            const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;

            document.getElementById('final-size').textContent = Math.floor(player.size);
            document.getElementById('final-mutations').textContent = Object.keys(player.mutations).length;
            document.getElementById('final-worlds').textContent = gameState.worldsExplored.size;
            document.getElementById('final-time').textContent = `${minutes}m ${seconds}s`;

            modal.classList.remove('hidden');
            playSound(200, 0.8, 'sine');
        }

        // ==================== START ====================
        function startGame(diet) {
            initAudio();
            document.getElementById('start-menu').classList.add('hidden');

            player = new Entity(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 12, diet, true);
            gameState.camX = player.x;
            gameState.camY = player.y;
            gameState.startTime = Date.now();

            spawnFood(WORLDS[1].foodDensity);
            spawnEnemies(WORLDS[1].enemyCount);

            gameState.paused = false;
            playSound(600, 0.4);
        }

        document.getElementById('btn-herbivore').addEventListener('click', () => startGame('herbivore'));
        document.getElementById('btn-carnivore').addEventListener('click', () => startGame('carnivore'));

        document.getElementById('btn-pause').addEventListener('click', () => {
            gameState.paused = !gameState.paused;
            document.getElementById('btn-pause').textContent = gameState.paused ? '▶ Resume' : '⏸ Pause';
        });

        document.getElementById('btn-mute').addEventListener('click', () => {
            gameState.muted = !gameState.muted;
            document.getElementById('btn-mute').textContent = gameState.muted ? '🔇 Mute' : '🔊 Mute';
        });

        // ==================== MAIN LOOP ====================
        app.ticker.add((ticker) => {
            if (gameState.paused || !player) return;

            const delta = ticker.deltaTime;
            gameState.age += delta;

            // 1. JOUEUR
            const targetWorldX = (gameState.mouseX - app.screen.width / 2) / gameState.cameraZoom + gameState.camX;
            const targetWorldY = (gameState.mouseY - app.screen.height / 2) / gameState.cameraZoom + gameState.camY;
            player.update(delta, targetWorldX, targetWorldY);

            if (player.health <= 0) {
                triggerGameOver();
                return;
            }

            // 2. ENNEMIS
            enemyPool.updateAll(delta);

            enemies = enemies.filter(enemy => {
                if (enemy.health <= 0) {
                    enemyPool.release(enemy);
                    return false;
                }

                const dx = player.x - enemy.x;
                const dy = player.y - enemy.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                let targetX = null, targetY = null;

                if (dist < 400) {
                    if (enemy.diet === 'carnivore' && enemy.size > player.size * 0.8) {
                        targetX = player.x;
                        targetY = player.y;
                    } else if (enemy.size < player.size * 1.5) {
                        targetX = enemy.x - dx * 0.5;
                        targetY = enemy.y - dy * 0.5;
                    }
                }

                enemy.update(delta, targetX, targetY);

                // Collision
                if (dist < player.size + enemy.size) {
                    if (player.size > enemy.size * 1.15) {
                        player.eat('meat', enemy.size, enemy.size * 0.4);
                        enemyPool.release(enemy);
                        playSound(300, 0.15);
                        gameState.shakeIntensity = 5;

                        for (let i = 0; i < 8; i++) {
                            const angle = (i / 8) * Math.PI * 2;
                            const speed = 150;
                            new Particle(player.x, player.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 0xff2a55, 3, 0.5);
                        }
                        return false;
                    } else if (enemy.size > player.size * 1.2 && enemy.diet === 'carnivore') {
                        player.health -= 5;
                        playSound(150, 0.2);
                    }
                }

                return true;
            });

            // 3. FOOD
            const stats = player.getStats();
            const magnetRadius = player.size * stats.magnetism;

            foodPool = foodPool.filter(f => f.active);
            foodPool.forEach((food, idx) => {
                food.update(delta);

                const dx = food.x - player.x;
                const dy = food.y - player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < magnetRadius) {
                    if ((player.diet === 'herbivore' && food.type === 'plant') ||
                        (player.diet === 'carnivore' && food.type === 'meat')) {
                        food.x -= (dx / dist) * 10 * delta;
                        food.y -= (dy / dist) * 10 * delta;
                    }
                }

                if (dist < player.size) {
                    if (player.eat(food.type, 1)) {
                        foodPool.splice(idx, 1);
                        if (food.food.parent) food.food.parent.removeChild(food.food);
                        playSound(500, 0.08);

                        const newType = Math.random() > 0.4 ? 'plant' : 'meat';
                        const newFood = new PIXI.Graphics();
                        foodLayer.addChild(newFood);
                        foodPool.push({
                            x: Math.random() * WORLD_WIDTH,
                            y: Math.random() * WORLD_HEIGHT,
                            type: newType,
                            food: newFood,
                            active: true,
                            pulseOff: Math.random() * 10,
                            update(delta) {
                                const scale = 1 + Math.sin(gameState.age * 0.1 + this.pulseOff) * 0.15;
                                const color = newType === 'meat' ? 0xff2a55 : 0x00ffaa;
                                this.food.clear();
                                this.food.beginFill(color, 0.7);
                                if (newType === 'meat') {
                                    this.food.drawRect(-3 * scale, -3 * scale, 6 * scale, 6 * scale);
                                } else {
                                    this.food.drawCircle(0, 0, 4 * scale);
                                }
                                this.food.endFill();
                                this.food.position.set(this.x, this.y);
                            }
                        });
                    }
                }
            });

            // Progression
            const nextMutationThreshold = 20 + (Object.keys(player.mutations).length * 25);
            if (player.targetSize > nextMutationThreshold && player.health > 50) {
                player.mutate();
            }

            // Transitions
            if (player.size > 50 && gameState.currentWorld === 1) transitionWorld(2);
            if (player.size > 85 && gameState.currentWorld === 2) transitionWorld(3);
            if (player.size > 120 && gameState.currentWorld === 3) transitionWorld(4);
            if (player.size > 160 && gameState.currentWorld === 4) transitionWorld(5);

            // 4. PARTICLES
            allParticles = allParticles.filter(p => {
                if (!p.active) {
                    if (p.gfx && p.gfx.parent) p.gfx.parent.removeChild(p.gfx);
                    return false;
                }
                p.update(delta);
                if (!p.gfx.parent) fxLayer.addChild(p.gfx);
                return true;
            });

            // 5. CAMERA
            const targetZoom = Math.max(0.2, 25 / player.size);
            gameState.cameraZoom += (targetZoom - gameState.cameraZoom) * 0.08 * delta;

            gameState.camX += (player.x - gameState.camX) * 0.12 * delta;
            gameState.camY += (player.y - gameState.camY) * 0.12 * delta;

            let finalCamX = gameState.camX;
            let finalCamY = gameState.camY;

            if (gameState.shakeIntensity > 0) {
                finalCamX += (Math.random() - 0.5) * gameState.shakeIntensity;
                finalCamY += (Math.random() - 0.5) * gameState.shakeIntensity;
                gameState.shakeIntensity *= 0.85;
            }

            worldContainer.pivot.set(finalCamX, finalCamY);
            worldContainer.position.set(app.screen.width / 2, app.screen.height / 2);
            worldContainer.scale.set(gameState.cameraZoom);

            bgLayer.x = finalCamX * 0.08;
            bgLayer.y = finalCamY * 0.08;

            // 6. HUD
            document.getElementById('size').textContent = Math.floor(player.size);
            document.getElementById('mutations').textContent = Object.keys(player.mutations).length;
            document.getElementById('fps').textContent = Math.round(app.ticker.FPS);

            const progression = Math.min(100, (player.size / 200) * 100);
            document.getElementById('prog-fill').style.width = progression + '%';

            let stage = 'Unicellulaire';
            if (player.size > 50) stage = 'Multicellulaire';
            if (player.size > 85) stage = 'Créature Primitive';
            if (player.size > 120) stage = 'Créature Évoluée';
            if (player.size > 160) stage = 'Créature Suprême';
            document.getElementById('stage').textContent = stage;
        });
    });
})();
