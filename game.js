// ==========================================================================
// MOTEUR SPORE - VERSION FINALE (COMBAT HYBRIDE & JUS VISUEL)
// ==========================================================================

const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 3000;

// Initialisation de l'application PixiJS
const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x02050c,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});
document.getElementById('game-container').appendChild(app.view);

// Création des couches (Layers) pour gérer la profondeur
const backgroundLayer = new PIXI.Container();
const shadowLayer = new PIXI.Container();
const foodLayer = new PIXI.Container();
const gameLayer = new PIXI.Container();
const fxLayer = new PIXI.Container();
const uiLayer = new PIXI.Container();
const lightingOverlay = new PIXI.Graphics(); // Rendu visuel d'ambiance

app.stage.addChild(backgroundLayer);
app.stage.addChild(shadowLayer);
app.stage.addChild(foodLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(fxLayer);
app.stage.addChild(lightingOverlay);
app.stage.addChild(uiLayer);

// Variables globales
let player = null;
let cells = [];
let particles = [];
let bubbles = [];
let planktonArray = [];
let nutrients = [];
let floatingTexts = [];

let gameState = {
    paused: true,
    age: 0,
    shakeIntensity: 0,
    hitStopTimer: 0, // Gèle le jeu quelques millisecondes lors d'un gros impact
    currentWorld: 1,
    cameraZoom: 1,
    isTerrestrial: false,
    bossActive: false,
    bossEntity: null
};

// Configuration des mondes
const WORLDS_CONFIG = {
    1: { name: "Surface", bg: 0x020714, density: 35, foodCount: 100, monsterScale: 1.0, terrestrial: false },
    2: { name: "Récif", bg: 0x011a24, density: 25, foodCount: 70, monsterScale: 1.5, terrestrial: false },
    3: { name: "Abysses", bg: 0x110217, density: 15, foodCount: 40, monsterScale: 2.2, terrestrial: false },
    4: { name: "Terre", bg: 0x202b1c, density: 20, foodCount: 60, monsterScale: 1.2, terrestrial: true }
};

// ==========================================================================
// CLASSES VISUELLES (EFFETS, PARTICULES, TEXTES)
// ==========================================================================

class Plankton {
    constructor() {
        this.x = Math.random() * WORLD_WIDTH;
        this.y = Math.random() * WORLD_HEIGHT;
        this.speed = Math.random() * 0.5 + 0.1;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(0x88ccff, Math.random() * 0.3);
        this.gfx.drawCircle(0, 0, Math.random() * 2 + 1);
        this.gfx.endFill();
        backgroundLayer.addChild(this.gfx);
    }
    update(delta) {
        this.y -= this.speed * delta;
        if (this.y < 0) this.y = WORLD_HEIGHT;
        this.gfx.x = this.x;
        this.gfx.y = this.y;
    }
}

class Bubble {
    constructor(x, y, size) {
        this.x = x; this.y = y; this.life = 40; this.size = Math.random() * size + 2;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(0xffffff, 0.3);
        this.gfx.drawCircle(0, 0, this.size);
        this.gfx.endFill();
        fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.life -= delta; this.y -= 0.5 * delta;
        this.gfx.x = this.x; this.gfx.y = this.y;
        this.gfx.alpha = this.life / 40;
    }
    destroy() { fxLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

class Particle {
    constructor(x, y, color, speedScale = 1) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 10 * speedScale;
        this.vy = (Math.random() - 0.5) * 10 * speedScale;
        this.life = 30 + Math.random() * 20;
        this.maxLife = this.life;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(color);
        this.gfx.drawCircle(0, 0, Math.random() * 4 + 2);
        this.gfx.endFill();
        fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.x += this.vx * delta;
        this.y += this.vy * delta;
        this.vx *= 0.9; // Friction
        this.vy *= 0.9;
        this.life -= delta;
        this.gfx.x = this.x; this.gfx.y = this.y;
        this.gfx.alpha = this.life / this.maxLife;
        this.gfx.scale.set(this.life / this.maxLife);
    }
    destroy() { fxLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

class FloatingText {
    constructor(x, y, text, color = 0xffffff, isCritical = false) {
        this.x = x; this.y = y; this.life = 40;
        this.style = new PIXI.TextStyle({
            fontFamily: 'Arial',
            fontSize: isCritical ? 24 : 16,
            fontWeight: isCritical ? 'bold' : 'normal',
            fill: color,
            stroke: 0x000000,
            strokeThickness: 3
        });
        this.textObj = new PIXI.Text(text, this.style);
        this.textObj.anchor.set(0.5);
        uiLayer.addChild(this.textObj);
    }
    update(delta) {
        this.y -= 1 * delta;
        this.life -= delta;
        this.textObj.x = this.x;
        this.textObj.y = this.y;
        this.textObj.alpha = this.life / 40;
    }
    destroy() { uiLayer.removeChild(this.textObj); this.textObj.destroy(); }
}

// ==========================================================================
// CLASSES DU JEU (ENTITÉS)
// ==========================================================================

class Nutrient {
    constructor(x, y, type = 'normal') {
        this.x = x; this.y = y;
        this.type = type; // 'normal' = vert (plante), 'meat' = rouge (viande), 'gold' = boss loot
        this.value = type === 'gold' ? 50 : 5;
        this.gfx = new PIXI.Graphics();
        this.draw();
        foodLayer.addChild(this.gfx);
    }
    draw() {
        this.gfx.clear();
        if (this.type === 'normal') {
            this.gfx.beginFill(0x44ff44); this.gfx.drawCircle(0, 0, 4);
        } else if (this.type === 'meat') {
            this.gfx.beginFill(0xff4444); this.gfx.drawRect(-4, -4, 8, 8);
        } else if (this.type === 'gold') {
            this.gfx.beginFill(0xffd700); this.gfx.drawStar(0, 0, 5, 8, 4);
        }
        this.gfx.endFill();
        this.gfx.x = this.x; this.gfx.y = this.y;
    }
    destroy() { foodLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

class Creature {
    constructor(x, y, size, color, isPlayer = false) {
        this.x = x; this.y = y;
        this.size = size;
        this.color = color;
        this.isPlayer = isPlayer;
        this.isBoss = false;
        
        // Statistiques RPG
        this.diet = 'omnivore'; // herbivore, carnivore, omnivore
        this.speed = isPlayer ? 4 : Math.random() * 2 + 1;
        this.attack = size * 0.5;
        this.defense = size * 0.2;
        this.maxHp = size * 2;
        this.hp = this.maxHp;
        
        this.invulnTimer = 0;
        this.targetX = x; this.targetY = y;

        this.gfx = new PIXI.Graphics();
        gameLayer.addChild(this.gfx);
        this.draw();
    }
    
    draw() {
        this.gfx.clear();
        this.gfx.beginFill(this.color);
        this.gfx.lineStyle(2, 0xffffff, 0.3);
        
        if (this.isBoss) {
            this.gfx.drawStar(0, 0, 8, this.size, this.size * 0.5); // Forme menaçante pour le boss
        } else {
            this.gfx.drawCircle(0, 0, this.size);
        }
        
        this.gfx.endFill();
        
        // Barre de vie (uniquement si HP max n'est pas plein pour les ennemis)
        if (!this.isPlayer && this.hp < this.maxHp) {
            this.gfx.beginFill(0xff0000);
            this.gfx.drawRect(-this.size, -this.size - 10, this.size * 2, 4);
            this.gfx.beginFill(0x00ff00);
            this.gfx.drawRect(-this.size, -this.size - 10, (this.hp / this.maxHp) * (this.size * 2), 4);
            this.gfx.endFill();
        }
    }

    grow(amount) {
        this.size += amount * 0.1;
        this.maxHp = this.size * 2;
        this.hp = Math.min(this.hp + amount, this.maxHp); // Soigne en mangeant
        this.attack = this.size * 0.5;
        this.defense = this.size * 0.2;
        this.draw();
    }

    takeDamage(amount, attacker) {
        if (this.invulnTimer > 0) return false;
        
        // Calcul des dégâts avec réduction d'armure
        let reductionMultiplier = 10 / (10 + this.defense); 
        let finalDamage = Math.max(1, amount * reductionMultiplier);
        
        this.hp -= finalDamage;
        this.invulnTimer = 20; // i-frames
        
        // Effets visuels
        createExplosion(this.x, this.y, this.color, 5);
        floatingTexts.push(new FloatingText(this.x, this.y - this.size, `-${Math.round(finalDamage)}`, 0xffffff));

        // Recul (Knockback)
        let dx = this.x - attacker.x;
        let dy = this.y - attacker.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            this.x += (dx / dist) * 30;
            this.y += (dy / dist) * 30;
        }

        this.draw();
        return true; // Dégât infligé avec succès
    }

    destroy() { gameLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

// ==========================================================================
// FONCTIONS UTILITAIRES ET SYSTÈMES
// ==========================================================================

function createExplosion(x, y, color, count = 10, speedScale = 1) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color, speedScale));
    }
}

function spawnNutrients(count) {
    for (let i = 0; i < count; i++) {
        nutrients.push(new Nutrient(
            Math.random() * WORLD_WIDTH,
            Math.random() * WORLD_HEIGHT,
            Math.random() > 0.8 ? 'meat' : 'normal'
        ));
    }
}

function spawnBossLoot(x, y) {
    for (let i = 0; i < 15; i++) {
        let angle = Math.random() * Math.PI * 2;
        let dist = Math.random() * 150;
        nutrients.push(new Nutrient(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 'gold'));
    }
}

function triggerScreenShake(intensity) {
    gameState.shakeIntensity = intensity;
}

function triggerHitStop(frames) {
    gameState.hitStopTimer = frames;
}

function spawnBoss(worldIndex) {
    gameState.bossActive = true;
    let bossConf = WORLDS_CONFIG[worldIndex];
    let boss = new Creature(player.x + 800, player.y + 800, player.size * 2, 0xff0055);
    boss.isBoss = true;
    boss.maxHp *= 3; // Boss très résistant
    boss.hp = boss.maxHp;
    boss.attack *= 1.5;
    boss.draw();
    gameState.bossEntity = boss;
    cells.push(boss);
    
    floatingTexts.push(new FloatingText(player.x, player.y - 100, "BOSS EN APPROCHE !", 0xff0000, true));
    triggerScreenShake(20);
}

function transitionToWorld(targetWorld) {
    if (targetWorld > 4) {
        document.getElementById('start-menu').style.display = 'flex';
        document.getElementById('start-menu').innerHTML = `<h1>VICTOIRE !</h1><p>Tu es l'espèce dominante.</p><button onclick="location.reload()">Rejouer</button>`;
        gameState.paused = true;
        return;
    }
    
    gameState.currentWorld = targetWorld;
    let config = WORLDS_CONFIG[targetWorld];
    gameState.isTerrestrial = config.terrestrial;
    app.renderer.backgroundColor = config.bg;
    
    // Nettoyage et repeuplement
    cells.forEach(c => c.destroy()); cells = [];
    nutrients.forEach(n => n.destroy()); nutrients = [];
    spawnNutrients(config.foodCount);
    
    triggerScreenShake(15);
    floatingTexts.push(new FloatingText(player.x, player.y - 50, `Passage : ${config.name}`, 0x00ffff, true));
}

function triggerGameOver() {
    gameState.paused = true;
    document.getElementById('start-menu').style.display = 'flex';
    document.getElementById('start-menu').innerHTML = `<h1>Game Over</h1><p>Tu as été dévoré.</p><button onclick="location.reload()">Réessayer</button>`;
}

// Initialisation globale
for(let i = 0; i < 100; i++) {
    planktonArray.push(new Plankton());
}

// ==========================================================================
// CONTRÔLES ET SOURIS
// ==========================================================================

let mouseX = 0, mouseY = 0;
app.view.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
});

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-menu').style.display = 'none';
    
    player = new Creature(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 10, 0x00aaff, true);
    
    // Sélection de l'évolution initiale (Simulée ici, à lier avec tes boutons si tu en as)
    player.diet = 'omnivore'; // Par défaut
    
    spawnNutrients(WORLDS_CONFIG[1].foodCount);
    for(let i=0; i < WORLDS_CONFIG[1].density; i++) {
        cells.push(new Creature(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() * 15 + 5, 0xaaaaaa));
    }
    gameState.paused = false;
});

// ==========================================================================
// BOUCLE PRINCIPALE (GAME LOOP)
// ==========================================================================

app.ticker.add((delta) => {
    if (gameState.paused || !player) return;

    // 1. HIT-STOP (Pause le jeu pour accentuer les impacts)
    if (gameState.hitStopTimer > 0) {
        gameState.hitStopTimer -= delta;
        return; // On zappe la frame
    }

    gameState.age += delta;

    // 2. MOUVEMENT DU JOUEUR
    let targetWorldX = (mouseX - app.screen.width / 2) / gameState.cameraZoom + player.x;
    let targetWorldY = (mouseY - app.screen.height / 2) / gameState.cameraZoom + player.y;
    
    let dx = targetWorldX - player.x;
    let dy = targetWorldY - player.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 5 && player.invulnTimer <= 0) {
        player.x += (dx / dist) * player.speed * delta;
        player.y += (dy / dist) * player.speed * delta;
    }

    // Gestion de l'invincibilité visuelle
    if (player.invulnTimer > 0) {
        player.invulnTimer -= delta;
        player.gfx.tint = (Math.floor(player.invulnTimer) % 4 < 2) ? 0xff0000 : 0xffffff;
    } else {
        player.gfx.tint = 0xffffff;
    }
    player.gfx.x = player.x; player.gfx.y = player.y;

    // Sillage d'eau
    if (!gameState.isTerrestrial && Math.random() < 0.2 && dist > 10) {
        bubbles.push(new Bubble(player.x, player.y, player.size * 0.3));
    }

    // 3. MISE À JOUR ENVIRONNEMENT (Plancton, Particules, Textes, Bulles)
    planktonArray.forEach(p => p.update(delta));
    for (let i = bubbles.length - 1; i >= 0; i--) {
        bubbles[i].update(delta);
        if (bubbles[i].life <= 0) { bubbles[i].destroy(); bubbles.splice(i, 1); }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(delta);
        if (particles[i].life <= 0) { particles[i].destroy(); particles.splice(i, 1); }
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].update(delta);
        if (floatingTexts[i].life <= 0) { floatingTexts[i].destroy(); floatingTexts.splice(i, 1); }
    }

    // 4. GESTION DES NUTRIMENTS (Équilibrage Herbivore)
    const magneticRadius = player.diet === 'herbivore' ? player.size * 3.5 : player.size * 1.2;
    for (let i = nutrients.length - 1; i >= 0; i--) {
        let nut = nutrients[i];
        let ndx = nut.x - player.x;
        let ndy = nut.y - player.y;
        let ndist = Math.sqrt(ndx * ndx + ndy * ndy);

        if (ndist < magneticRadius) {
            nut.x -= (ndx / ndist) * 7 * delta;
            nut.y -= (ndy / ndist) * 7 * delta;
            nut.draw();
        }

        if (ndist < player.size) {
            let xpGained = nut.value;
            if (player.diet === 'herbivore' && nut.type === 'normal') xpGained *= 3; // Bonus herbi
            if (player.diet === 'carnivore' && nut.type === 'meat') xpGained *= 3; // Bonus carni
            
            player.grow(xpGained);
            nut.destroy();
            nutrients.splice(i, 1);
        }
    }

    // Régénération passive lente pour tout le monde
    if (player.hp < player.maxHp && gameState.age % 60 < 1) player.hp += 0.5;

    // 5. GESTION DES ENNEMIS ET COMBAT (LE COEUR DU SYSTÈME)
    for (let i = cells.length - 1; i >= 0; i--) {
        let enemy = cells[i];
        
        // IA Basique : Bouge aléatoirement ou suit le joueur si proche et plus gros
        let edx = player.x - enemy.x;
        let edy = player.y - enemy.y;
        let edist = Math.sqrt(edx * edx + edy * edy);
        
        if (edist < 300 && enemy.size > player.size * 1.1) {
            enemy.x += (edx / edist) * enemy.speed * delta;
            enemy.y += (edy / edist) * enemy.speed * delta;
        } else {
            enemy.x += (Math.random() - 0.5) * enemy.speed * 2 * delta;
            enemy.y += (Math.random() - 0.5) * enemy.speed * 2 * delta;
        }

        // Garde dans les limites
        enemy.x = Math.max(0, Math.min(WORLD_WIDTH, enemy.x));
        enemy.y = Math.max(0, Math.min(WORLD_HEIGHT, enemy.y));
        
        // Affichage i-frames ennemi
        if (enemy.invulnTimer > 0) {
            enemy.invulnTimer -= delta;
            enemy.gfx.tint = 0xffaaaa;
        } else {
            enemy.gfx.tint = 0xffffff;
        }
        enemy.gfx.x = enemy.x; enemy.gfx.y = enemy.y;
        enemy.draw(); // Redessine la barre de vie

        // --- COLLISIONS ET DÉGÂTS ---
        if (edist < player.size + enemy.size) {
            
            // CAS 1 : JOUEUR EST LE PRÉDATEUR ALPHA (ONE-SHOT SATISFAISANT)
            if (player.size > enemy.size * 2) {
                createExplosion(enemy.x, enemy.y, enemy.color, 15, 2);
                triggerScreenShake(5);
                player.grow(enemy.size * (player.diet === 'carnivore' ? 2 : 1));
                enemy.destroy();
                cells.splice(i, 1);
                continue;
            }
            // CAS 2 : JOUEUR EST LA PROIE ABSOLUE (ONE-SHOT ENNEMI)
            else if (enemy.size > player.size * 2) {
                triggerGameOver();
                return;
            }
            // CAS 3 : COMBAT ÉPIQUE (Tailles similaires)
            else {
                if (player.size >= enemy.size) { // Le joueur a l'avantage
                    let hitSuccess = enemy.takeDamage(player.attack, player);
                    if (hitSuccess) {
                        triggerHitStop(5); // Fige l'écran un instant
                        triggerScreenShake(8); // Fait trembler
                        
                        if (enemy.hp <= 0) {
                            createExplosion(enemy.x, enemy.y, enemy.color, 20, 3);
                            player.grow(enemy.size * (player.diet === 'carnivore' ? 1.5 : 0.8));
                            
                            if (enemy.isBoss) {
                                spawnBossLoot(enemy.x, enemy.y);
                                gameState.bossActive = false;
                                gameState.bossEntity = null;
                            }
                            
                            enemy.destroy();
                            cells.splice(i, 1);
                        }
                    }
                } else { // L'ennemi a l'avantage
                    let hitSuccess = player.takeDamage(enemy.attack, enemy);
                    if (hitSuccess) {
                        triggerScreenShake(12);
                        if (player.hp <= 0) {
                            triggerGameOver();
                            return;
                        }
                    }
                }
            }
        }
    }

    // 6. GESTION DU BOSS ET CHANGEMENT DE ZONE
    if (!gameState.bossActive && !gameState.bossEntity) {
        let target = 0;
        if (gameState.currentWorld === 1 && player.size >= 40) target = 2;
        else if (gameState.currentWorld === 2 && player.size >= 80) target = 3;
        else if (gameState.currentWorld === 3 && player.size >= 130) target = 4;
        
        if (target > 0) {
            spawnBoss(target);
            // Empêche la boucle de spammer le spawn le temps qu'on tue le boss
            player.size -= 1; // Petite triche pour ne pas relancer le check en boucle
        }
    }

    // Condition de victoire du monde une fois le boss mort (le loot a été lâché)
    if (!gameState.bossActive && gameState.bossEntity === null && nutrients.filter(n => n.type === 'gold').length === 0) {
        // On attend que le joueur ait ramassé tout le loot doré avant de changer de monde
        // Optionnel: on peut forcer le changement au bout de X secondes si besoin.
    }

    // 7. CAMÉRA ELASTIQUE (SMOOTH DAMP)
    gameState.cameraZoom = Math.max(0.3, 20 / player.size);
    const targetCamX = app.screen.width / 2 - player.x * gameState.cameraZoom;
    const targetCamY = app.screen.height / 2 - player.y * gameState.cameraZoom;
    
    gameLayer.x += (targetCamX - gameLayer.x) * 0.1;
    gameLayer.y += (targetCamY - gameLayer.y) * 0.1;
    gameLayer.scale.set(gameState.cameraZoom);
    
    foodLayer.x = gameLayer.x; foodLayer.y = gameLayer.y; foodLayer.scale.set(gameState.cameraZoom);
    fxLayer.x = gameLayer.x; fxLayer.y = gameLayer.y; fxLayer.scale.set(gameState.cameraZoom);
    uiLayer.x = gameLayer.x; uiLayer.y = gameLayer.y; uiLayer.scale.set(gameState.cameraZoom);
    
    // Parallaxe du fond
    backgroundLayer.x = gameLayer.x * 0.2;
    backgroundLayer.y = gameLayer.y * 0.2;

    // 8. AMBIANCE VISUELLE (Filtre Eau)
    lightingOverlay.clear();
    if (!gameState.isTerrestrial) {
        lightingOverlay.beginFill(0x004466, 0.15);
        lightingOverlay.drawRect(0, 0, app.screen.width, app.screen.height);
    }

    // 9. SCREEN SHAKE (Tremblement de l'écran entier)
    if (gameState.shakeIntensity > 0) {
        app.stage.x = (Math.random() - 0.5) * gameState.shakeIntensity;
        app.stage.y = (Math.random() - 0.5) * gameState.shakeIntensity;
        gameState.shakeIntensity *= 0.85; // Diminue progressivement
        if (gameState.shakeIntensity < 0.5) {
            gameState.shakeIntensity = 0;
            app.stage.x = 0;
            app.stage.y = 0;
        }
    }
});
