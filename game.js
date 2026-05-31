// ==========================================================================
// 1. ARCHITECTURE ET CONFIGURATION DES STRATES DE L'ÉCOSYSTÈME (AQUATIQUE -> TERRESTRE)
// ==========================================================================
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 3000;

const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x02050c,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});
document.getElementById('game-container').appendChild(app.view);

const backgroundLayer = new PIXI.Container();
const shadowLayer = new PIXI.Container(); // Nouveau calque pour l'illusion 3D
const foodLayer = new PIXI.Container();
const gameLayer = new PIXI.Container();
const fxLayer = new PIXI.Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(shadowLayer);
app.stage.addChild(foodLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(fxLayer);

let player = null;
let cells = [];
let particles = [];
let footprints = []; // Traces de pas terrestres
let nutrients = [];
let floatingTexts = [];

let nextMutationSize = 25; 
let playerColor = 0x00ffcc;
let playerDiet = 'herbivore';

let gameState = {
    paused: true,
    age: 0,
    shakeIntensity: 0,
    currentWorld: 1,
    cameraZoom: 1,
    isTerrestrial: false // Bascule physique majeure
};

// Paliers d'évolution jusqu'au continent
const WORLDS_CONFIG = {
    1: { name: "Eaux de Surface", bg: 0x020714, density: 35, foodCount: 100, monsterScale: 1.0, terrestrial: false },
    2: { name: "Récif Océanique", bg: 0x011a24, density: 25, foodCount: 70, monsterScale: 1.5, terrestrial: false },
    3: { name: "Abysses Sombres", bg: 0x110217, density: 15, foodCount: 40, monsterScale: 2.2, terrestrial: false },
    4: { name: "Continent Primordial", bg: 0x202b1c, density: 20, foodCount: 60, monsterScale: 1.2, terrestrial: true } // Terrestre
};

const MUTATION_LIMITS = { flagelle: 2, spike: 2, shield: 2 };
let mousePosition = { x: app.screen.width / 2, y: app.screen.height / 2 };

window.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
});

// ==========================================================================
// 2. OUTILS MATHÉMATIQUES & RÉTROACTION (GAME FEEL)
// ==========================================================================
function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return parseInt(`0x${f(0)}${f(8)}${f(4)}`, 16);
}

function lerp(start, end, amount) { return (1 - amount) * start + amount * end; }

function playSound(frequency, duration, type = 'sine') {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode); gainNode.connect(audioContext.destination);
        oscillator.frequency.value = frequency; oscillator.type = type;
        gainNode.gain.setValueAtTime(0.06, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        oscillator.start(audioContext.currentTime); oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {}
}

class FloatingText {
    constructor(x, y, text, color = 0xffffff) {
        this.x = x; this.y = y; this.life = 50;
        this.gfx = new PIXI.Text(text, { fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', fill: color });
        this.gfx.anchor.set(0.5); this.gfx.x = this.x; this.gfx.y = this.y;
        fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.y -= 1.0 * delta; this.gfx.y = this.y; this.life -= delta;
        this.gfx.alpha = Math.max(0, this.life / 50);
    }
    destroy() { fxLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

class Particle {
    constructor(x, y, colorHex) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 4; this.vy = (Math.random() - 0.5) * 4;
        this.life = 20 + Math.random() * 10; this.size = Math.random() * 2.5 + 1;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(colorHex); this.gfx.drawCircle(0, 0, this.size); this.gfx.endFill();
        fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.x += this.vx * delta; this.y += this.vy * delta; this.life -= delta;
        this.gfx.x = this.x; this.gfx.y = this.y; this.gfx.alpha = Math.max(0, this.life / 30);
    }
    destroy() { fxLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

// Empreintes terrestres statiques
class Footprint {
    constructor(x, y, size) {
        this.x = x; this.y = y; this.life = 80;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(0x000000, 0.3); this.gfx.drawEllipse(0, 0, size * 0.2, size * 0.15); this.gfx.endFill();
        this.gfx.x = this.x; this.gfx.y = this.y;
        backgroundLayer.addChild(this.gfx);
    }
    update(delta) {
        this.life -= delta;
        this.gfx.alpha = Math.max(0, this.life / 80);
    }
    destroy() { backgroundLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

// ==========================================================================
// 3. ANATOMIE 2.5D (CORPS, OMBRES ET PATTES PROCÉDURALES)
// ==========================================================================
class Creature {
    constructor(x, y, size, isPlayer = false, diet = 'herbivore') {
        this.x = x; this.y = y; this.size = size;
        this.isPlayer = isPlayer; this.diet = diet;
        
        this.vx = 0; this.vy = 0;
        this.speed = isPlayer ? 3.8 : Math.random() * 1.5 + 0.8;
        this.mutations = [];
        this.attackPower = 1; this.defense = 1;
        this.hp = size * 10;
        this.walkCycle = Math.random() * Math.PI * 2; // Désynchronisation des pas

        this.display = new PIXI.Container();
        this.shadowContainer = new PIXI.Container(); // Container séparé pour rester au sol
        
        this.colorHex = this.isPlayer ? playerColor : (this.diet === 'carnivore' ? 0xff4455 : 0x22cc77);

        this.shadowGfx = new PIXI.Graphics();
        this.legsGfx = new PIXI.Graphics();
        this.glowGfx = new PIXI.Graphics();
        this.flagellaGfx = new PIXI.Graphics();
        this.shieldGfx = new PIXI.Graphics();
        this.spikesGfx = new PIXI.Graphics();
        this.bodyGfx = new PIXI.Graphics();
        this.eyesGfx = new PIXI.Graphics(); 

        this.shadowContainer.addChild(this.shadowGfx);
        
        this.display.addChild(this.glowGfx);
        this.display.addChild(this.legsGfx); // Les pattes sont sous le corps
        this.display.addChild(this.flagellaGfx);
        this.display.addChild(this.shieldGfx);
        this.display.addChild(this.spikesGfx);
        this.display.addChild(this.bodyGfx);
        this.display.addChild(this.eyesGfx);
        // Dans le constructor() de Creature :
        this.maxStamina = 100;
        this.stamina = 100;
        this.isSprinting = false;
        
        // Dans la fonction update() de Creature :
        if (this.isPlayer) {
            if (this.isSprinting && this.stamina > 0) {
                this.speed = 6.0; // Vitesse de pointe
                this.stamina -= 30 * delta; // Se vide vite
                if (gameState.isTerrestrial && Math.random() < 0.3) {
                    // Nuage de poussière quand on court sur terre
                    particles.push(new Particle(this.x, this.y + this.size, 0x443322)); 
                }
            } else {
                this.speed = 3.8; // Vitesse normale
                this.stamina = Math.min(this.maxStamina, this.stamina + 10 * delta); // Se recharge doucement
            }
        }

        if (this.isPlayer) {
            const nativeBlur = new PIXI.BlurFilter();
            nativeBlur.blur = 10;
            this.glowGfx.filters = [nativeBlur];
        }

        this.refreshStaticDraws();
        shadowLayer.addChild(this.shadowContainer);
        gameLayer.addChild(this.display);
    }

    refreshStaticDraws() {
        // Base du corps
        this.bodyGfx.clear();
        this.bodyGfx.beginFill(this.colorHex, 0.9);
        if (gameState.isTerrestrial) {
            this.bodyGfx.drawEllipse(0, 0, this.size, this.size * 0.8); // Plus écrasé sur terre
        } else {
            this.bodyGfx.drawCircle(0, 0, this.size);
        }
        this.bodyGfx.endFill();
        this.bodyGfx.lineStyle(2, 0xffffff, 0.4);
        if (gameState.isTerrestrial) this.bodyGfx.drawEllipse(0, 0, this.size, this.size * 0.8);
        else this.bodyGfx.drawCircle(0, 0, this.size);

        // Lueur
        this.glowGfx.clear();
        if (this.isPlayer) {
            this.glowGfx.beginFill(this.colorHex, 0.4);
            this.glowGfx.drawCircle(0, 0, this.size + 15);
            this.glowGfx.endFill();
        }

        // Épines
        this.spikesGfx.clear();
        if (this.mutations.find(m => m.name === 'Spike') || (!this.isPlayer && this.diet === 'carnivore' && Math.random() < 0.5)) {
            const numSpikes = gameState.isTerrestrial ? 4 : 6;
            this.spikesGfx.lineStyle(3, 0xffbb00, 0.9);
            for (let i = 0; i < numSpikes; i++) {
                const angle = (i / numSpikes) * Math.PI * 2;
                this.spikesGfx.moveTo(Math.cos(angle) * this.size, Math.sin(angle) * this.size);
                this.spikesGfx.lineTo(Math.cos(angle) * (this.size + 12), Math.sin(angle) * (this.size + 12));
            }
        }
        
    }

    updateVisualAnimations(age, delta) {
        this.shadowContainer.x = this.x;
        this.shadowContainer.y = this.y;
        this.display.x = this.x;
        this.display.y = this.y;

        const isMoving = Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1;
        const angleDir = Math.atan2(this.vy, this.vx);

        if (gameState.isTerrestrial) {
            // -- ILLUSION 2.5D TERRESTRE --
            // 1. Ombre projetée au sol (Décalée vers le bas)
            this.shadowGfx.clear();
            this.shadowGfx.beginFill(0x000000, 0.4);
            this.shadowGfx.drawEllipse(0, this.size * 0.5, this.size * 1.1, this.size * 0.6);
            this.shadowGfx.endFill();

            // 2. Rebond du corps (Z-axis) pendant la marche
            if (isMoving) {
                this.walkCycle += 0.2 * delta;
                this.display.pivot.y = Math.abs(Math.sin(this.walkCycle)) * 8; // Rebond vers le haut
                
                // Traces de pas
                if (Math.random() < 0.15) footprints.push(new Footprint(this.x, this.y + this.size * 0.5, this.size));
            } else {
                this.display.pivot.y = lerp(this.display.pivot.y, 0, 0.2); // Repos
            }

            // 3. Pattes procédurales (Inverse Kinematics basique)
            this.legsGfx.clear();
            this.flagellaGfx.clear(); // Les flagelles disparaissent sur terre
            
            const numLegs = 4;
            this.legsGfx.lineStyle(4, 0x111111, 0.8);
            for(let i=0; i<numLegs; i++) {
                // Alternance des pattes pour la marche
                const phaseOffset = (i % 2 === 0) ? 0 : Math.PI;
                const swing = isMoving ? Math.sin(this.walkCycle + phaseOffset) * 12 : 0;
                
                const baseX = (i < 2 ? -1 : 1) * this.size * 0.5;
                const baseY = this.size * 0.2;
                
                const footX = baseX + Math.cos(angleDir) * swing;
                const footY = baseY + this.size * 0.6 + Math.sin(angleDir) * swing;

                this.legsGfx.moveTo(baseX, baseY);
                this.legsGfx.lineTo(footX, footY);
                // Dessin du sabot/pied
                this.legsGfx.beginFill(0x222222);
                this.legsGfx.drawCircle(footX, footY, 4);
                this.legsGfx.endFill();
            }

        } else {
            // -- ANIMATION AQUATIQUE --
            this.shadowGfx.clear(); // Pas d'ombre dans l'eau
            this.legsGfx.clear(); // Pas de pattes
            this.display.pivot.y = 0;
            const pulse = 1 + Math.sin(age * 0.05 + this.x) * 0.03;
            this.bodyGfx.scale.set(pulse);

            this.flagellaGfx.clear();
            if (this.mutations.find(m => m.name === 'Flagelle') || (!this.isPlayer && this.speed > 1.2)) {
                this.flagellaGfx.lineStyle(2, this.colorHex, 0.6);
                const tailAngle = angleDir + Math.PI + Math.sin(age * 0.2) * 0.35;
                this.flagellaGfx.moveTo(Math.cos(angleDir + Math.PI) * this.size, Math.sin(angleDir + Math.PI) * this.size);
                this.flagellaGfx.lineTo(Math.cos(tailAngle) * (this.size + 18), Math.sin(tailAngle) * (this.size + 18));
            }
        }

        // Rendu des Yeux Dynamiques
        this.eyesGfx.clear();
        const lookAngle = isMoving ? angleDir : Math.sin(age * 0.02) * 0.5; // Regarde autour si immobile
        
        const drawEye = (side) => {
            const eyeSpacingAngle = lookAngle + (side * 0.6);
            const ex = Math.cos(eyeSpacingAngle) * (this.size * 0.65);
            const ey = Math.sin(eyeSpacingAngle) * (this.size * 0.65);
            
            this.eyesGfx.beginFill(0xffffff);
            this.eyesGfx.drawCircle(ex, ey, this.size * 0.3);
            this.eyesGfx.endFill();
            
            const px = ex + Math.cos(lookAngle) * (this.size * 0.1);
            const py = ey + Math.sin(lookAngle) * (this.size * 0.1);
            this.eyesGfx.beginFill(0x010206);
            this.eyesGfx.drawCircle(px, py, this.size * 0.14);
            this.eyesGfx.endFill();
        };

        drawEye(-1); drawEye(1);

        // Bouclier
        this.shieldGfx.clear();
        if (this.mutations.find(m => m.name === 'Shield')) {
            this.shieldGfx.lineStyle(1.5, 0x00ccff, 0.4);
            this.shieldGfx.drawEllipse(0, 0, this.size + 8, (this.size + 8) * (gameState.isTerrestrial ? 0.8 : 1));
        }
    }

    applyMutation(mutationName) {
        const config = { flagelle: { name: 'Flagelle', speed: 1.3 }, spike: { name: 'Spike', attack: 1.5 }, shield: { name: 'Shield', defense: 1.4 } };
        const m = config[mutationName];
        if (!m) return;
        this.mutations.push(m);
        if (m.speed) this.speed *= m.speed;
        if (m.attack) this.attackPower *= m.attack;
        if (m.defense) this.defense *= m.defense;
        this.refreshStaticDraws();
    }

    takeDamage(damage) {
        const netDamage = Math.max(1, damage / this.defense);
        this.hp -= netDamage;
        if (this.isPlayer) {
            gameState.shakeIntensity = 6;
            playSound(120, 0.2, 'sawtooth');
            floatingTexts.push(new FloatingText(this.x, this.y - 20, `-${Math.round(netDamage)} PV`, 0xff3333));
        }
        for (let i = 0; i < 4; i++) particles.push(new Particle(this.x, this.y, 0xff4444));
        return this.hp > 0;
    }

    update(delta) {
        this.x += this.vx * this.speed * delta;
        this.y += this.vy * this.speed * delta;
        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));
    }

    distanceTo(other) { return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2); }
    canEat(other) { return this.size > other.size * 1.1; }

    eat(other) {
        this.size += other.size * (gameState.isTerrestrial ? 0.08 : 0.12);
        this.hp = Math.min(this.size * 10, this.hp + other.size * 2);
        for (let i = 0; i < 6; i++) particles.push(new Particle(other.x, other.y, other.colorHex));
        if (this.isPlayer) {
            playSound(520, 0.08, 'sine');
            floatingTexts.push(new FloatingText(this.x, this.y - 30, `+${Math.floor(other.size)} ADN`, 0x00ffcc));
        }
        this.refreshStaticDraws();
    }

    destroy() {
        shadowLayer.removeChild(this.shadowContainer);
        gameLayer.removeChild(this.display);
        this.shadowContainer.destroy({ children: true });
        this.display.destroy({ children: true });
    }
}

// ==========================================================================
// 4. TRANSITION DE MONDE & GÉNÉRATION DE BIOME TERRESTRE
// ==========================================================================
function spawnNutrient() {
    const cfg = WORLDS_CONFIG[gameState.currentWorld];
    if (nutrients.length >= cfg.foodCount) return;

    const nGfx = new PIXI.Graphics();
    const rare = Math.random() < 0.1;
    let radius = rare ? 4 : 2.5;

    if (gameState.isTerrestrial) {
        // Végétation terrestre (Buissons feuillus)
        nGfx.beginFill(rare ? 0xffaa00 : 0x22aa33, 0.9);
        nGfx.drawCircle(0, -radius, radius);
        nGfx.drawCircle(-radius, radius, radius);
        nGfx.drawCircle(radius, radius, radius);
    } else {
        // Plancton marin
        nGfx.beginFill(rare ? 0xffd700 : 0x00bfff, 0.8);
        nGfx.drawCircle(0, 0, radius);
    }
    nGfx.endFill();
    nGfx.x = Math.random() * WORLD_WIDTH; nGfx.y = Math.random() * WORLD_HEIGHT;

    foodLayer.addChild(nGfx);
    nutrients.push({ gfx: nGfx, x: nGfx.x, y: nGfx.y, r: radius*1.5, rare: rare });
}

function checkWorldTransition() {
    if (!player) return;

    // Seuils Spore
    if (gameState.currentWorld === 1 && player.size >= 32) transitionToWorld(2);
    else if (gameState.currentWorld === 2 && player.size >= 50) transitionToWorld(3);
    else if (gameState.currentWorld === 3 && player.size >= 75) transitionToWorld(4); // Sortie de l'eau !
}

function transitionToWorld(targetWorld) {
    gameState.currentWorld = targetWorld;
    const cfg = WORLDS_CONFIG[targetWorld];
    gameState.isTerrestrial = cfg.terrestrial;
    
    // Flash de transition
    app.renderer.backgroundColor = 0xffffff;
    setTimeout(() => { app.renderer.backgroundColor = cfg.bg; }, 150);

    gameState.shakeIntensity = 20;
    playSound(150, 0.8, 'sawtooth');

    floatingTexts.push(new FloatingText(player.x, player.y - 50, gameState.isTerrestrial ? "ÉMERGENCE TERRESTRE !" : `STRATE : ${cfg.name.toUpperCase()}`, 0xffffff));

    // Ajustement de la caméra selon la taille
    if (targetWorld === 2) gameState.cameraZoom = 0.7;
    if (targetWorld === 3) gameState.cameraZoom = 0.45;
    if (targetWorld === 4) {
        gameState.cameraZoom = 0.8; // On se rapproche de nouveau car la créature a rapetissé par rapport au nouveau monde
        player.size = 25; // Réinitialisation de la taille relative pour la phase terre
        player.speed *= 1.5; // Plus rapide sur terre
        player.refreshStaticDraws();
    }

    // Régénération radicale du monde
    cells.forEach(c => c.destroy()); cells = [];
    nutrients.forEach(n => { foodLayer.removeChild(n.gfx); n.gfx.destroy(); }); nutrients = [];
    backgroundLayer.removeChildren(); footprints = [];

    // Décor
    for (let i = 0; i < 150; i++) {
        const dot = new PIXI.Graphics();
        if (gameState.isTerrestrial) {
            // Touffes d'herbe / Rochers
            dot.beginFill(Math.random() > 0.5 ? 0x112211 : 0x2a2a2a, 0.5);
            dot.drawPolygon([-3, 5, 0, -5, 3, 5]);
        } else {
            // Bulles abyssales
            dot.beginFill(0x223355, Math.random() * 0.3);
            dot.drawCircle(0, 0, Math.random() * 3 + 1);
        }
        dot.endFill();
        dot.x = Math.random() * WORLD_WIDTH; dot.y = Math.random() * WORLD_HEIGHT;
        backgroundLayer.addChild(dot);
    }

    // Nouvelle Faune
    for (let i = 0; i < cfg.density; i++) {
        const diet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
        const enemySize = (Math.random() * 10 + 8) * cfg.monsterScale;
        cells.push(new Creature(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, enemySize, false, diet));
    }
}

function initGame() {
    cells.forEach(c => c.destroy()); particles.forEach(p => p.destroy()); floatingTexts.forEach(t => t.destroy());
    nutrients.forEach(n => { foodLayer.removeChild(n.gfx); n.gfx.destroy(); }); backgroundLayer.removeChildren();
    footprints.forEach(f => f.destroy());

    cells = []; particles = []; nutrients = []; floatingTexts = []; footprints = [];
    gameState.age = 0; gameState.currentWorld = 1; gameState.cameraZoom = 1; nextMutationSize = 22;
    gameState.isTerrestrial = false;

    const currentCfg = WORLDS_CONFIG[1];
    app.renderer.backgroundColor = currentCfg.bg;

    player = new Creature(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 14, true, playerDiet);

    for (let i = 0; i < 80; i++) {
        const dot = new PIXI.Graphics();
        dot.beginFill(0x1a2b4c, 0.3); dot.drawCircle(0, 0, Math.random() * 2 + 1); dot.endFill();
        dot.x = Math.random() * WORLD_WIDTH; dot.y = Math.random() * WORLD_HEIGHT;
        backgroundLayer.addChild(dot);
    }

    for (let i = 0; i < currentCfg.density; i++) {
        const diet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
        cells.push(new Creature(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() * 8 + 6, false, diet));
    }
    for (let i = 0; i < currentCfg.foodCount; i++) spawnNutrient();
}

// ==========================================================================
// 5. LABORATOIRE DE MUTATIONS
// ==========================================================================
function checkMutations() {
    if (!player || player.size < nextMutationSize) return;
    gameState.paused = true;

    const modal = document.getElementById('mutationModal');
    const choices = document.getElementById('mutationChoices');
    if (!modal || !choices) return;

    choices.innerHTML = '';
    const available = Object.keys(MUTATION_LIMITS).filter(k => player.mutations.filter(m => m.name.toLowerCase() === k).length < MUTATION_LIMITS[k]);

    if (available.length === 0) { nextMutationSize += 15; gameState.paused = false; return; }

    const labels = {
        flagelle: gameState.isTerrestrial ? '⚡ Pattes Musclées (+30% Vitesse)' : '⚡ Cils Flagellés (+30% Vitesse hydrodynamique)',
        spike: '🔪 Pointes Cornues (Active les contre-attaques de contact)',
        shield: '🛡️ Peau Épaisse (+40% Encaissement des chocs)'
    };

    available.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'mutation-btn';
        btn.textContent = labels[opt];
        btn.addEventListener('click', () => {
            player.applyMutation(opt);
            playSound(650, 0.15, 'sine');
            modal.classList.add('hidden');
            gameState.paused = false;
            nextMutationSize += 12;
        });
        choices.appendChild(btn);
    });
    modal.classList.remove('hidden');
}

// ==========================================================================
// 6. BOUCLE PRINCIPALE (MOTEUR PHYSIQUE & IA)
// ==========================================================================
app.ticker.add((delta) => {
    if (gameState.paused || !player) return;
    gameState.age += delta;

    const dx = mousePosition.x - (app.screen.width / 2);
    const dy = mousePosition.y - (app.screen.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 15) { player.vx = dx / dist; player.vy = dy / dist; } 
    else { player.vx = 0; player.vy = 0; }
    
    player.update(delta);

    if (Math.random() < 0.05 * delta) spawnNutrient();

    // REGIME HERBIVORE : Plantes / Buissons
    if (player.diet === 'herbivore') {
        for (let i = nutrients.length - 1; i >= 0; i--) {
            const n = nutrients[i];
            if (player.distanceTo(n) < player.size + n.r) {
                player.size += n.rare ? (gameState.isTerrestrial ? 0.3 : 0.5) : 0.15;
                player.hp = Math.min(player.size * 10, player.hp + 2);
                floatingTexts.push(new FloatingText(n.x, n.y, n.rare ? '+3 ADN' : '+1 ADN', 0x00ffaa));
                playSound(550, 0.04, 'sine');
                foodLayer.removeChild(n.gfx); n.gfx.destroy(); nutrients.splice(i, 1);
                player.refreshStaticDraws();
            }
        }
    }

    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];

        if (Math.random() < 0.02 * delta) {
            if (cell.diet === 'carnivore' && cell.distanceTo(player) < 400 && cell.size > player.size) {
                const cdx = player.x - cell.x; const cdy = player.y - cell.y;
                const clen = Math.sqrt(cdx*cdx + cdy*cdy);
                cell.vx = cdx / clen; cell.vy = cdy / clen;
            } else {
                cell.vx = Math.random() * 2 - 1; cell.vy = Math.random() * 2 - 1;
            }
        }
        cell.update(delta);

        const gap = player.distanceTo(cell);
        if (gap < player.size + cell.size) {
            if (player.diet === 'carnivore' && player.canEat(cell)) {
                player.eat(cell); cell.destroy(); cells.splice(i, 1); continue;
            }
            if (cell.canEat(player) && cell.diet === 'carnivore') {
                if (!player.takeDamage(cell.size * 0.4)) {
                    alert(`FIN DE PARTIE : Assimilé dans la strate "${WORLDS_CONFIG[gameState.currentWorld].name}".`);
                    document.getElementById('dietModal').classList.remove('hidden');
                    gameState.paused = true; return;
                }
            } else if (!player.canEat(cell) && !cell.canEat(player)) {
                if (player.mutations.find(m => m.name === 'Spike')) cell.takeDamage(player.size * 0.15);
            }
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(delta); if (particles[i].life <= 0) { particles[i].destroy(); particles.splice(i, 1); } }
    for (let i = floatingTexts.length - 1; i >= 0; i--) { floatingTexts[i].update(delta); if (floatingTexts[i].life <= 0) { floatingTexts[i].destroy(); floatingTexts.splice(i, 1); } }
    for (let i = footprints.length - 1; i >= 0; i--) { footprints[i].update(delta); if (footprints[i].life <= 0) { footprints[i].destroy(); footprints.splice(i, 1); } }

    let sx = (Math.random() - 0.5) * gameState.shakeIntensity; let sy = (Math.random() - 0.5) * gameState.shakeIntensity;
    if (gameState.shakeIntensity > 0) gameState.shakeIntensity -= 0.3 * delta;

    const tx = (app.screen.width / 2) - player.x * gameState.cameraZoom;
    const ty = (app.screen.height / 2) - player.y * gameState.cameraZoom;

    gameLayer.x = lerp(gameLayer.x, tx, 0.08 * delta) + sx; gameLayer.y = lerp(gameLayer.y, ty, 0.08 * delta) + sy;
    gameLayer.scale.set(gameState.cameraZoom);
    
    shadowLayer.x = gameLayer.x; shadowLayer.y = gameLayer.y; shadowLayer.scale.set(gameState.cameraZoom);
    foodLayer.x = gameLayer.x; foodLayer.y = gameLayer.y; foodLayer.scale.set(gameState.cameraZoom);
    fxLayer.x = gameLayer.x; fxLayer.y = gameLayer.y; fxLayer.scale.set(gameState.cameraZoom);
    backgroundLayer.x = gameLayer.x * (gameState.isTerrestrial ? 0.8 : 0.2); // Le sol bouge plus vite que le fond marin
    backgroundLayer.y = gameLayer.y * (gameState.isTerrestrial ? 0.8 : 0.2);

    player.updateVisualAnimations(gameState.age, delta);
    cells.forEach(c => c.updateVisualAnimations(gameState.age, delta));

    document.getElementById('size').textContent = `${Math.floor(player.size)} (${WORLDS_CONFIG[gameState.currentWorld].name})`;
    document.getElementById('population').textContent = cells.length;
    document.getElementById('fps').textContent = Math.round(app.ticker.FPS);

    checkWorldTransition(); checkMutations();
});

// ==========================================================================
// 7. ÉVÉNEMENTS D'INTERFACE
// ==========================================================================
document.getElementById('btn-herbivore').addEventListener('click', () => {
    playerColor = 0x00ffcc; playerDiet = 'herbivore';
    document.getElementById('dietModal').classList.add('hidden');
    initGame(); gameState.paused = false;
});

document.getElementById('btn-carnivore').addEventListener('click', () => {
    playerColor = 0xff1e56; playerDiet = 'carnivore';
    document.getElementById('dietModal').classList.add('hidden');
    initGame(); gameState.paused = false;
});

document.getElementById('restartBtn').addEventListener('click', () => {
    document.getElementById('dietModal').classList.remove('hidden');
    document.getElementById('mutationModal').classList.add('hidden');
    gameState.paused = true;
});

const pBtn = document.getElementById('pauseBtn');
if (pBtn) {
    pBtn.addEventListener('click', () => {
        if (!document.getElementById('dietModal').classList.contains('hidden')) return;
        gameState.paused = !gameState.paused;
        pBtn.textContent = gameState.paused ? '▶️ Jouer' : '⏸️ Pause';
    });
}
