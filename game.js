// ==========================================================================
// 1. ARCHITECTURE ET CONFIGURATION DES STRATES DE L'ÉCOSYSTÈME
// ==========================================================================
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x02050c,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});
document.getElementById('game-container').appendChild(app.view);

const backgroundLayer = new PIXI.Container();
const foodLayer = new PIXI.Container();
const gameLayer = new PIXI.Container();
const fxLayer = new PIXI.Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(foodLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(fxLayer);

let player = null;
let cells = [];
let particles = [];
let nutrients = [];
let floatingTexts = [];

// Configuration de la progression par paliers de taille (Style Spore)
let nextMutationSize = 22; 
let playerColor = 0x00ffcc;
let playerDiet = 'herbivore'; // Fixé dynamiquement à l'initialisation

let gameState = {
    paused: true,
    age: 0,
    shakeIntensity: 0,
    currentWorld: 1,
    cameraZoom: 1
};

// Paramètres des strates environnementales
const WORLDS_CONFIG = {
    1: { name: "Eaux de Surface", bg: 0x020714, density: 40, foodCount: 120, monsterScale: 1.0 },
    2: { name: "Récif Océanique Moyen", bg: 0x011a24, density: 30, foodCount: 80, monsterScale: 1.6 },
    3: { name: "Abysses Préhistoriques", bg: 0x14021a, density: 20, foodCount: 50, monsterScale: 2.6 }
};

const MUTATION_LIMITS = { flagelle: 2, spike: 2, shield: 2 };
let mousePosition = { x: app.screen.width / 2, y: app.screen.height / 2 };

window.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
});

// ==========================================================================
// 2. MATHÉMATIQUES & EFFETS DE RÉTROACTION (GAME FEEL)
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

function lerp(start, end, amount) {
    return (1 - amount) * start + amount * end;
}

function playSound(frequency, duration, type = 'sine') {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        gainNode.gain.setValueAtTime(0.06, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {}
}

class FloatingText {
    constructor(x, y, text, color = 0xffffff) {
        this.x = x; this.y = y; this.life = 50;
        this.gfx = new PIXI.Text(text, { fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', fill: color });
        this.gfx.anchor.set(0.5);
        this.gfx.x = this.x; this.gfx.y = this.y;
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
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.life = 20 + Math.random() * 10;
        this.size = Math.random() * 2.5 + 1;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(colorHex); this.gfx.drawCircle(0, 0, this.size); this.gfx.endFill();
        this.gfx.x = this.x; this.gfx.y = this.y;
        fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.x += this.vx * delta; this.y += this.vy * delta; this.life -= delta;
        this.gfx.x = this.x; this.gfx.y = this.y; this.gfx.alpha = Math.max(0, this.life / 30);
    }
    destroy() { fxLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

// ==========================================================================
// 3. ANATOMIE CELLULAIRE DE SPORE (AVEC YEUX INCLUS)
// ==========================================================================
class Cell {
    constructor(x, y, size, isPlayer = false, diet = 'herbivore') {
        this.x = x;
        this.y = y;
        this.size = size;
        this.isPlayer = isPlayer;
        this.diet = diet; // 'herbivore' ou 'carnivore'
        
        this.vx = 0; this.vy = 0;
        this.speed = isPlayer ? 3.6 : Math.random() * 1.2 + 0.5;
        this.mutations = [];
        this.attackPower = 1; this.defense = 1;
        this.hp = size * 10;

        this.display = new PIXI.Container();
        this.colorHex = this.isPlayer ? playerColor : (this.diet === 'carnivore' ? 0xff3355 : 0x00ffaa);

        this.glowGfx = new PIXI.Graphics();
        this.flagellaGfx = new PIXI.Graphics();
        this.shieldGfx = new PIXI.Graphics();
        this.spikesGfx = new PIXI.Graphics();
        this.bodyGfx = new PIXI.Graphics();
        this.eyesGfx = new PIXI.Graphics(); // Signature Visuelle Spore

        this.display.addChild(this.glowGfx);
        this.display.addChild(this.flagellaGfx);
        this.display.addChild(this.shieldGfx);
        this.display.addChild(this.spikesGfx);
        this.display.addChild(this.bodyGfx);
        this.display.addChild(this.eyesGfx);

        if (this.isPlayer) {
            const nativeBlur = new PIXI.BlurFilter();
            nativeBlur.blur = 10;
            this.glowGfx.filters = [nativeBlur];
        }

        this.refreshStaticDraws();
        gameLayer.addChild(this.display);
    }

    refreshStaticDraws() {
        this.bodyGfx.clear();
        this.bodyGfx.beginFill(this.colorHex, 0.85);
        this.bodyGfx.drawCircle(0, 0, this.size);
        this.bodyGfx.endFill();
        this.bodyGfx.lineStyle(1.5, 0xffffff, 0.3);
        this.bodyGfx.drawCircle(0, 0, this.size);

        this.glowGfx.clear();
        if (this.isPlayer) {
            this.glowGfx.beginFill(this.colorHex, 0.4);
            this.glowGfx.drawCircle(0, 0, this.size + 14);
            this.glowGfx.endFill();
        }

        // Dessin structurel des pointes offensives
        this.spikesGfx.clear();
        if (this.mutations.find(m => m.name === 'Spike') || (!this.isPlayer && this.diet === 'carnivore' && Math.random() < 0.4)) {
            const numSpikes = this.diet === 'carnivore' ? 5 : 3;
            this.spikesGfx.lineStyle(2, 0xff4466, 0.9);
            for (let i = 0; i < numSpikes; i++) {
                const angle = (i / numSpikes) * Math.PI * 2;
                this.spikesGfx.moveTo(Math.cos(angle) * this.size, Math.sin(angle) * this.size);
                this.spikesGfx.lineTo(Math.cos(angle) * (this.size + 9), Math.sin(angle) * (this.size + 9));
            }
        }
    }

    updateVisualAnimations(age) {
        this.display.x = this.x;
        this.display.y = this.y;

        const pulse = 1 + Math.sin(age * 0.05 + this.x) * 0.025;
        this.bodyGfx.scale.set(pulse);

        // Rendu dynamique des yeux (Ils s'orientent vers la direction de déplacement)
        this.eyesGfx.clear();
        const angleDir = Math.atan2(this.vy, this.vx);
        
        // Structure de la paire d'yeux Spore
        const eyeSpacing = this.size * 0.4;
        const eyeOffsetRadius = this.size * 0.6;
        
        const drawSingleEye = (side) => {
            const eyeAngle = angleDir + (side * 0.5);
            const ex = Math.cos(eyeAngle) * eyeOffsetRadius;
            const ey = Math.sin(eyeAngle) * eyeOffsetRadius;
            
            // Globe oculaire (Blanc)
            this.eyesGfx.beginFill(0xffffff);
            this.eyesGfx.drawCircle(ex, ey, this.size * 0.28);
            this.eyesGfx.endFill();
            
            // Pupille (Noire mobile)
            const pupilLookX = ex + Math.cos(angleDir) * (this.size * 0.08);
            const pupilLookY = ey + Math.sin(angleDir) * (this.size * 0.08);
            this.eyesGfx.beginFill(0x010206);
            this.eyesGfx.drawCircle(pupilLookX, pupilLookY, this.size * 0.13);
            this.eyesGfx.endFill();
        };

        drawSingleEye(-1); // Œil gauche
        drawSingleEye(1);  // Œil droit

        this.shieldGfx.clear();
        if (this.mutations.find(m => m.name === 'Shield')) {
            this.shieldGfx.lineStyle(1.5, 0x00ccff, 0.4);
            this.shieldGfx.drawCircle(0, 0, this.size + 8 + Math.sin(age * 0.1) * 2);
        }

        this.flagellaGfx.clear();
        if (this.mutations.find(m => m.name === 'Flagelle') || (!this.isPlayer && this.speed > 1.2)) {
            this.flagellaGfx.lineStyle(2, this.colorHex, 0.5);
            const tailAngle = angleDir + Math.PI + Math.sin(age * 0.2) * 0.3;
            this.flagellaGfx.moveTo(Math.cos(angleDir + Math.PI) * this.size, Math.sin(angleDir + Math.PI) * this.size);
            this.flagellaGfx.lineTo(Math.cos(tailAngle) * (this.size + 16), Math.sin(tailAngle) * (this.size + 16));
        }
    }

    applyMutation(mutationName) {
        const config = {
            flagelle: { name: 'Flagelle', speed: 1.3 },
            spike: { name: 'Spike', attack: 1.5 },
            shield: { name: 'Shield', defense: 1.4 }
        };
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
            gameState.shakeIntensity = 5;
            playSound(120, 0.2, 'sawtooth');
            floatingTexts.push(new FloatingText(this.x, this.y, `-${Math.round(netDamage)} PV`, 0xff3333));
        }
        for (let i = 0; i < 3; i++) particles.push(new Particle(this.x, this.y, 0xff4444));
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
        this.size += other.size * 0.12;
        this.hp = Math.min(this.size * 10, this.hp + other.size * 2);
        for (let i = 0; i < 6; i++) particles.push(new Particle(other.x, other.y, other.colorHex));
        if (this.isPlayer) {
            playSound(520, 0.08, 'sine');
            floatingTexts.push(new FloatingText(this.x, this.y - 20, `+${Math.floor(other.size)} ADN`, 0x00ffcc));
        }
        this.refreshStaticDraws();
    }

    destroy() {
        gameLayer.removeChild(this.display);
        this.display.destroy({ children: true });
    }
}

// ==========================================================================
// 4. SYSTÈME DE SPATIALISATION ET CHANGEMENT DE MONDE
// ==========================================================================
function spawnNutrient() {
    const cfg = WORLDS_CONFIG[gameState.currentWorld];
    if (nutrients.length >= cfg.foodCount) return;

    const nGfx = new PIXI.Graphics();
    const rare = Math.random() < 0.1;
    const color = rare ? 0xffd700 : 0x00bfff;
    const radius = rare ? 3.5 : 2;

    nGfx.beginFill(color, 0.8); nGfx.drawCircle(0, 0, radius); nGfx.endFill();
    nGfx.x = Math.random() * WORLD_WIDTH; nGfx.y = Math.random() * WORLD_HEIGHT;

    foodLayer.addChild(nGfx);
    nutrients.push({ gfx: nGfx, x: nGfx.x, y: nGfx.y, r: radius, rare: rare });
}

function checkWorldTransition() {
    if (!player) return;

    // Seuils d'évolution des mondes : Monde 1 -> taille 34 | Monde 2 -> taille 55
    if (gameState.currentWorld === 1 && player.size >= 34) {
        transitionToWorld(2);
    } else if (gameState.currentWorld === 2 && player.size >= 55) {
        transitionToWorld(3);
    } else if (gameState.currentWorld === 3 && player.size >= 80) {
        gameState.paused = true;
        alert("FÉLICITATIONS ! Votre cellule est devenue macroscopique.\nPréparez-vous à émerger sur la terre ferme (Fin de la Phase Cellulaire) !");
    }
}

function transitionToWorld(targetWorld) {
    gameState.currentWorld = targetWorld;
    const cfg = WORLDS_CONFIG[targetWorld];
    
    // Rétroaction flash visuelle
    app.renderer.backgroundColor = 0xffffff;
    setTimeout(() => { app.renderer.backgroundColor = cfg.bg; }, 150);

    // Déstabilisation de la caméra (Sensation de plongeon sous-marin)
    gameState.shakeIntensity = 15;
    playSound(200, 0.6, 'sine');

    floatingTexts.push(new FloatingText(player.x, player.y - 40, `ENTRÉE : ${cfg.name.toUpperCase()}`, 0xffffff));

    // Ajustement de l'échelle globale de perception (Zoom arrière de la caméra de simulation)
    gameState.cameraZoom = targetWorld === 2 ? 0.75 : 0.5;

    // Purge des anciennes IA de petite taille et repeuplement avec des prédateurs adaptés
    cells.forEach(c => c.destroy());
    cells = [];
    
    for (let i = 0; i < cfg.density; i++) {
        const diet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
        // Multiplicateur de taille pour simuler les monstres de l'échelon supérieur
        const enemySize = (Math.random() * 12 + 10) * cfg.monsterScale;
        cells.push(new Cell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, enemySize, false, diet));
    }
}

function initGame() {
    cells.forEach(c => c.destroy());
    particles.forEach(p => p.destroy());
    floatingTexts.forEach(t => t.destroy());
    nutrients.forEach(n => { foodLayer.removeChild(n.gfx); n.gfx.destroy(); });
    backgroundLayer.removeChildren();

    cells = []; particles = []; nutrients = []; floatingTexts = [];
    gameState.age = 0; gameState.currentWorld = 1; gameState.cameraZoom = 1; nextMutationSize = 22;

    const currentCfg = WORLDS_CONFIG[1];
    app.renderer.backgroundColor = currentCfg.bg;

    // Instanciation du joueur avec son régime défini
    player = new Cell(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 15, true, playerDiet);

    // Décors de fond en parallaxe
    for (let i = 0; i < 70; i++) {
        const dot = new PIXI.Graphics();
        dot.beginFill(0x223355, Math.random() * 0.25 + 0.1);
        dot.drawCircle(0, 0, Math.random() * 2 + 1); dot.endFill();
        dot.x = Math.random() * WORLD_WIDTH; dot.y = Math.random() * WORLD_HEIGHT;
        backgroundLayer.addChild(dot);
    }

    // Génération initiale de l'écosystème
    for (let i = 0; i < currentCfg.density; i++) {
        const diet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
        cells.push(new Cell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() * 10 + 7, false, diet));
    }
    for (let i = 0; i < currentCfg.foodCount; i++) spawnNutrient();
}

// ==========================================================================
// 5. LABORATOIRE DE MUTATIONS GÉNÉTIQUES
// ==========================================================================
function checkMutations() {
    if (!player || player.size < nextMutationSize) return;
    gameState.paused = true;

    const modal = document.getElementById('mutationModal');
    const choices = document.getElementById('mutationChoices');
    if (!modal || !choices) return;

    choices.innerHTML = '';
    const available = Object.keys(MUTATION_LIMITS).filter(k => player.mutations.filter(m => m.name.toLowerCase() === k).length < MUTATION_LIMITS[k]);

    if (available.length === 0) {
        nextMutationSize += 12; gameState.paused = false; return;
    }

    const labels = {
        flagelle: '⚡ Cils Flagellés (+30% Vitesse hydrodynamique)',
        spike: '🔪 Pointes de Chitine (Active les contre-attaques de contact)',
        shield: '🛡️ Membrane Lipidique Solide (+40% Encaissement des chocs)'
    };

    available.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'mutation-btn';
        btn.textContent = labels[opt];
        btn.addEventListener('click', () => {
            if (player) player.applyMutation(opt);
            playSound(650, 0.15, 'sine');
            modal.classList.add('hidden');
            gameState.paused = false;
            nextMutationSize += 10;
        });
        choices.appendChild(btn);
    });
    modal.classList.remove('hidden');
}

// ==========================================================================
// 6. BOUCLE PRINCIPALE WEBGL (LOGIQUE DE JEU)
// ==========================================================================
app.ticker.add((delta) => {
    if (gameState.paused || !player) return;
    gameState.age += delta;

    // Vecteur directionnel souris
    const dx = mousePosition.x - (app.screen.width / 2);
    const dy = mousePosition.y - (app.screen.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 15) {
        player.vx = dx / dist; player.vy = dy / dist;
    } else {
        player.vx = 0; player.vy = 0;
    }
    player.update(delta);

    if (Math.random() < 0.04 * delta) spawnNutrient();

    // REGIME HERBIVORE : Gestion de l'alimentation par les plantes
    if (player.diet === 'herbivore') {
        for (let i = nutrients.length - 1; i >= 0; i--) {
            const n = nutrients[i];
            if (player.distanceTo(n) < player.size + n.r) {
                player.size += n.rare ? 0.5 : 0.2;
                player.hp = Math.min(player.size * 10, player.hp + 1);
                floatingTexts.push(new FloatingText(n.x, n.y, n.rare ? '+2 ADN' : '+1 ADN', 0x00bfff));
                playSound(550, 0.04, 'sine');
                foodLayer.removeChild(n.gfx); n.gfx.destroy(); nutrients.splice(i, 1);
                player.refreshStaticDraws();
            }
        }
    }

    // LOGIQUE DE L'ÉCOSYSTÈME DES IA INFÉRIEURES ET SUPÉRIEURES
    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];

        // IA Spore : Comportement autonome directionnel
        if (Math.random() < 0.02 * delta) {
            if (cell.diet === 'carnivore' && cell.distanceTo(player) < 350 && cell.size > player.size) {
                // Chasse : L'IA fonce sur le joueur
                const cdx = player.x - cell.x; const cdy = player.y - cell.y;
                const clen = Math.sqrt(cdx*cdx + cdy*cdy);
                cell.vx = cdx / clen; cell.vy = cdy / clen;
            } else {
                // Patrouille erratique standard
                cell.vx = Math.random() * 2 - 1; cell.vy = Math.random() * 2 - 1;
            }
        }
        cell.update(delta);

        // COLLISIONS & AGRESSIONS
        const gap = player.distanceTo(cell);
        if (gap < player.size + cell.size) {
            
            // REGIME CARNIVORE : Le joueur mange l'ennemi s'il est plus grand
            if (player.diet === 'carnivore' && player.canEat(cell)) {
                player.eat(cell); cell.destroy(); cells.splice(i, 1); continue;
            }

            // ATTAQUE ENNEMIE SUR LE JOUEUR
            if (cell.canEat(player) && cell.diet === 'carnivore') {
                if (!player.takeDamage(cell.size * 0.35)) {
                    alert(`SÉQUENCE INTERROMPUE : Votre espèce s'est éteinte dans la strate ${gameState.currentWorld}.\nTaille terminale : ${Math.floor(player.size)}px`);
                    document.getElementById('dietModal').classList.remove('hidden');
                    gameState.paused = true; return;
                }
            } 
            // Échange de coups si contact neutre avec des épines
            else if (!player.canEat(cell) && !cell.canEat(player)) {
                if (player.mutations.find(m => m.name === 'Spike')) cell.takeDamage(player.size * 0.1);
            }
        }
    }

    // Nettoyage FX
    for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(delta); if (particles[i].life <= 0) { particles[i].destroy(); particles.splice(i, 1); } }
    for (let i = floatingTexts.length - 1; i >= 0; i--) { floatingTexts[i].update(delta); if (floatingTexts[i].life <= 0) { floatingTexts[i].destroy(); floatingTexts.splice(i, 1); } }

    // SECCOUSSE ET ENCADREMENT CAMÉRA (Prise en compte du zoom de strate)
    let sx = (Math.random() - 0.5) * gameState.shakeIntensity;
    let sy = (Math.random() - 0.5) * gameState.shakeIntensity;
    if (gameState.shakeIntensity > 0) gameState.shakeIntensity -= 0.3 * delta;

    const tx = (app.screen.width / 2) - player.x * gameState.cameraZoom;
    const ty = (app.screen.height / 2) - player.y * gameState.cameraZoom;

    // Application matricielle de la caméra globale
    gameLayer.x = lerp(gameLayer.x, tx, 0.07 * delta) + sx;
    gameLayer.y = lerp(gameLayer.y, ty, 0.07 * delta) + sy;
    gameLayer.scale.set(gameState.cameraZoom);

    foodLayer.x = gameLayer.x; foodLayer.y = gameLayer.y; foodLayer.scale.set(gameState.cameraZoom);
    fxLayer.x = gameLayer.x; fxLayer.y = gameLayer.y; fxLayer.scale.set(gameState.cameraZoom);

    backgroundLayer.x = gameLayer.x * 0.2; backgroundLayer.y = gameLayer.y * 0.2;

    player.updateVisualAnimations(gameState.age);
    cells.forEach(c => c.updateVisualAnimations(gameState.age));

    // Mise à jour de l'interface utilisateur
    document.getElementById('size').textContent = `${Math.floor(player.size)} (Strate ${gameState.currentWorld})`;
    document.getElementById('population').textContent = cells.length;
    document.getElementById('fps').textContent = Math.round(app.ticker.FPS);

    checkWorldTransition();
    checkMutations();
});

// ==========================================================================
// 7. LISTENERS DES MENUS INTERACTIFS
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
