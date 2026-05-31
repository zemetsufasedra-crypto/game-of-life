// ==========================================================================
// 1. ARCHITECTURE ET CONFIGURATION DU MONDE MICROCOSMIQUE
// ==========================================================================
const WORLD_WIDTH = 2500;
const WORLD_HEIGHT = 1600;

const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x02040a, // Profondeur abyssale sombre et immersive
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});
document.getElementById('game-container').appendChild(app.view);

// Calques (Layers) ordonnés pour gérer la profondeur d'affichage (Z-Index)
const backgroundLayer = new PIXI.Container();
const foodLayer = new PIXI.Container();
const gameLayer = new PIXI.Container();
const fxLayer = new PIXI.Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(foodLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(fxLayer);

// Registres globaux d'entités (Nettoyage de mémoire facilité)
let player = null;
let cells = [];
let particles = [];
let nutrients = [];
let floatingTexts = [];

let nextMutationSize = 24; 
let playerColor = 0x00ffcc; // Couleur dynamique selon le régime choisi

let gameState = {
    paused: true, // Bloqué par défaut en attendant l'action sur la modale de départ
    age: 0,
    shakeIntensity: 0
};

const MUTATION_LIMITS = { flagelle: 2, spike: 2, shield: 2, sizeburst: 1 };
let mousePosition = { x: app.screen.width / 2, y: app.screen.height / 2 };

window.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
});

// ==========================================================================
// 2. UTILITAIRES ET EFFETS AUDIO-VISUELS
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
        
        gainNode.gain.setValueAtTime(0.08, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        // Bloqué de manière sécurisée si le navigateur exige une interaction préalable
    }
}

// Classe de rétroaction addictive : Textes flottants animés
class FloatingText {
    constructor(x, y, text, color = 0xffffff) {
        this.x = x;
        this.y = y;
        this.life = 45; // Durée de vie en frames
        
        this.gfx = new PIXI.Text(text, {
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 'bold',
            fill: color,
            align: 'center'
        });
        this.gfx.anchor.set(0.5);
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        
        fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.y -= 1.2 * delta; // Ascension fluide vers le haut
        this.gfx.y = this.y;
        this.life -= delta;
        this.gfx.alpha = Math.max(0, this.life / 45);
    }
    destroy() {
        fxLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

class Particle {
    constructor(x, y, colorHex) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = (Math.random() - 0.5) * 5 - 1;
        this.life = 25 + Math.random() * 10;
        this.size = Math.random() * 3 + 1.5;

        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(colorHex);
        this.gfx.drawCircle(0, 0, this.size);
        this.gfx.endFill();
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        
        fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.x += this.vx * delta;
        this.y += this.vy * delta;
        this.life -= delta;
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.alpha = Math.max(0, this.life / 35);
    }
    destroy() {
        fxLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

// ==========================================================================
// 3. CLASSE CELLULE VECTORIELLE IMMUNISÉE CONTRE LES CRASHES
// ==========================================================================
class Cell {
    constructor(x, y, size, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.isPlayer = isPlayer;
        this.vx = 0;
        this.vy = 0;
        this.speed = isPlayer ? 3.8 : Math.random() * 1.4 + 0.6;
        this.mutations = [];
        this.age = 0;
        this.attackPower = 1;
        this.defense = 1;
        this.hp = size * 10;

        this.display = new PIXI.Container();
        this.display.x = this.x;
        this.display.y = this.y;

        this.colorHex = this.isPlayer ? playerColor : hslToHex((x + y) % 360, 65, 45);

        // Architecture des sous-composants graphiques pour éviter les redessins massifs (Optimisation CPU)
        this.glowGfx = new PIXI.Graphics(); 
        this.flagellaGfx = new PIXI.Graphics();
        this.shieldGfx = new PIXI.Graphics();
        this.spikesGfx = new PIXI.Graphics();
        this.bodyGfx = new PIXI.Graphics();

        this.display.addChild(this.glowGfx);
        this.display.addChild(this.flagellaGfx);
        this.display.addChild(this.shieldGfx);
        this.display.addChild(this.spikesGfx);
        this.display.addChild(this.bodyGfx);

        // Effet d'Aura Lumineuse Natif de Haute Performance (Zéro Dépendance Externe)
        if (this.isPlayer) {
            const nativeBlur = new PIXI.BlurFilter();
            nativeBlur.blur = 12; // Rayon de floutage de l'aura
            this.glowGfx.filters = [nativeBlur];
        }

        this.refreshStaticDraws();
        gameLayer.addChild(this.display);
    }

    refreshStaticDraws() {
        this.bodyGfx.clear();
        this.bodyGfx.beginFill(this.colorHex, 0.82);
        this.bodyGfx.drawCircle(0, 0, this.size);
        this.bodyGfx.endFill();
        this.bodyGfx.lineStyle(2, 0xffffff, 0.25);
        this.bodyGfx.drawCircle(0, 0, this.size);

        this.glowGfx.clear();
        if (this.isPlayer) {
            // Dessin du halo brut qui sera flouté nativement par le filtre
            this.glowGfx.beginFill(this.colorHex, 0.5);
            this.glowGfx.drawCircle(0, 0, this.size + 15);
            this.glowGfx.endFill();
        }

        this.spikesGfx.clear();
        if (this.mutations.find(m => m.name === 'Spike')) {
            const numSpikes = 8;
            this.spikesGfx.lineStyle(2.5, 0xff3355, 0.9);
            for (let i = 0; i < numSpikes; i++) {
                const angle = (i / numSpikes) * Math.PI * 2;
                const x1 = Math.cos(angle) * this.size;
                const y1 = Math.sin(angle) * this.size;
                const x2 = Math.cos(angle) * (this.size + 10);
                const y2 = Math.sin(angle) * (this.size + 10);
                this.spikesGfx.moveTo(x1, y1);
                this.spikesGfx.lineTo(x2, y2);
            }
        }
    }

    updateVisualAnimations(age) {
        this.display.x = this.x;
        this.display.y = this.y;

        // Effet de pulsation organique (Battement de membrane cellulaire)
        const pulse = 1 + Math.sin(age * 0.06 + (this.x * 0.0008)) * 0.03;
        this.bodyGfx.scale.set(pulse);
        if (this.isPlayer) this.glowGfx.scale.set(pulse * 1.02);

        this.shieldGfx.clear();
        if (this.mutations.find(m => m.name === 'Shield')) {
            const shieldPulse = Math.sin(age * 0.05) * 3;
            this.shieldGfx.lineStyle(2, 0x00bfff, 0.45);
            this.shieldGfx.drawCircle(0, 0, this.size + 10 + shieldPulse);
        }

        this.flagellaGfx.clear();
        if (this.mutations.find(m => m.name === 'Flagelle')) {
            this.flagellaGfx.lineStyle(2, 0x00ffaa, 0.6);
            // Calcul mathématique d'une ondulation aquatique sinusoïdale réaliste
            const baseAngle = Math.PI + Math.atan2(this.vy, this.vx);
            const wave = Math.sin(age * 0.2) * 0.25;
            const targetAngle = baseAngle + wave;
            
            this.flagellaGfx.moveTo(Math.cos(baseAngle) * this.size, Math.sin(baseAngle) * this.size);
            this.flagellaGfx.lineTo(Math.cos(targetAngle) * (this.size + 18), Math.sin(targetAngle) * (this.size + 18));
        }
    }

    applyMutation(mutationName) {
        const mutations = {
            flagelle: { name: 'Flagelle', speed: 1.35 },
            spike: { name: 'Spike', attack: 1.4 },
            shield: { name: 'Shield', defense: 1.35 },
            sizeburst: { name: 'Grosse Bombe', size: 1.25 }
        };

        const mutation = mutations[mutationName];
        if (!mutation) return;

        this.mutations.push(mutation);
        if (mutation.speed) this.speed *= mutation.speed;
        if (mutation.attack) this.attackPower *= mutation.attack;
        if (mutation.defense) this.defense *= mutation.defense;
        if (mutation.size) this.size *= mutation.size;

        this.refreshStaticDraws();
        
        if (this.isPlayer) {
            floatingTexts.push(new FloatingText(this.x, this.y - 30, `MUTATION : ${mutation.name.toUpperCase()} !`, 0xffd700));
        }
    }

    takeDamage(damage) {
        const actualDamage = Math.max(1, damage / this.defense);
        this.hp -= actualDamage;
        
        if (this.isPlayer) {
            gameState.shakeIntensity = 6;
            playSound(140, 0.15, 'triangle');
            floatingTexts.push(new FloatingText(this.x, this.y, `-${Math.round(actualDamage)} PV`, 0xff3333));
        }
        
        for (let i = 0; i < 4; i++) {
            particles.push(new Particle(this.x, this.y, 0xff3344));
        }
        return this.hp > 0;
    }

    attackCell(other) {
        if (this.mutations.find(m => m.name === 'Spike')) {
            const damageValue = this.size * 0.35 * this.attackPower;
            other.takeDamage(damageValue);
        }
    }

    update(delta) {
        this.x += this.vx * this.speed * delta;
        this.y += this.vy * this.speed * delta;

        // Confinement strict à l'intérieur des frontières du monde microscopique
        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

        return true;
    }

    distanceTo(other) {
        return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
    }

    canEat(other) {
        return this.size > other.size * 1.1;
    }

    eat(other) {
        const growth = other.size * 0.14;
        this.size += growth;
        this.hp = Math.min(this.size * 10, this.hp + (other.size * 3));
        
        for (let i = 0; i < 6; i++) {
            particles.push(new Particle(other.x, other.y, other.colorHex));
        }
        
        if (this.isPlayer) {
            playSound(480 + Math.random() * 120, 0.09, 'sine');
            floatingTexts.push(new FloatingText(this.x, this.y - 20, `+${Math.floor(other.size)} ADN`, 0x00ffcc));
        }
        this.refreshStaticDraws();
    }

    destroy() {
        gameLayer.removeChild(this.display);
        this.display.destroy({ children: true });
    }
}

// ==========================================
// 4. BOUCLE DE GÉNÉRATION DES NUTRIMENTS
// ==========================================
function spawnNutrient() {
    if (nutrients.length >= 180) return;

    const nutrientGfx = new PIXI.Graphics();
    const isRare = Math.random() < 0.15;
    const color = isRare ? 0xffd700 : 0x00aaff;
    const radius = isRare ? 3.5 : 2;

    nutrientGfx.beginFill(color, 0.75);
    nutrientGfx.drawCircle(0, 0, radius);
    nutrientGfx.endFill();
    
    nutrientGfx.x = Math.random() * WORLD_WIDTH;
    nutrientGfx.y = Math.random() * WORLD_HEIGHT;
    
    foodLayer.addChild(nutrientGfx);
    nutrients.push({ gfx: nutrientGfx, x: nutrientGfx.x, y: nutrientGfx.y, r: radius, rare: isRare });
}

// ==========================================
// 5. INITIALISATION TECHNIQUE DE LA SIMULATION
// ==========================================
function initGame() {
    // Vidange intégrale de la mémoire graphique (Évite les Memory Leaks)
    cells.forEach(c => c.destroy());
    particles.forEach(p => p.destroy());
    floatingTexts.forEach(t => t.destroy());
    nutrients.forEach(n => {
        foodLayer.removeChild(n.gfx);
        n.gfx.destroy();
    });
    backgroundLayer.removeChildren();

    cells = [];
    particles = [];
    nutrients = [];
    floatingTexts = [];
    gameState.age = 0;
    nextMutationSize = 24;
    gameState.shakeIntensity = 0;

    player = new Cell(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 16, true);

    // Génération du décor stellaire d'arrière-plan (Parallaxe)
    for (let i = 0; i < 90; i++) {
        const dot = new PIXI.Graphics();
        dot.beginFill(0x334155, Math.random() * 0.3 + 0.1);
        dot.drawCircle(0, 0, Math.random() * 2 + 1);
        dot.endFill();
        dot.x = Math.random() * WORLD_WIDTH;
        dot.y = Math.random() * WORLD_HEIGHT;
        backgroundLayer.addChild(dot);
    }

    // Remplissage initial de l'écosystème bactérien autonome (IA)
    for (let i = 0; i < 35; i++) {
        const rx = Math.random() * WORLD_WIDTH;
        const ry = Math.random() * WORLD_HEIGHT;
        if (Math.abs(rx - player.x) > 150 && Math.abs(ry - player.y) > 150) {
            cells.push(new Cell(rx, ry, Math.random() * 9 + 6, false));
        }
    }

    // Remplissage initial de la biomasse passive (Nutriments)
    for (let i = 0; i < 100; i++) spawnNutrient();
}

// ==========================================
// 6. SYSTÈME D'ÉVOLUTION GÉNOTYPIQUE
// ==========================================
function checkMutations() {
    if (!player || player.size < nextMutationSize) return;

    gameState.paused = true;
    const modal = document.getElementById('mutationModal');
    const choices = document.getElementById('mutationChoices');
    if (!modal || !choices) return;

    choices.innerHTML = '';
    
    const availableMutations = Object.keys(MUTATION_LIMITS).filter(mut => {
        const mutationName = { flagelle: 'Flagelle', spike: 'Spike', shield: 'Shield', sizeburst: 'Grosse Bombe' }[mut];
        return player.mutations.filter(m => m.name === mutationName).length < MUTATION_LIMITS[mut];
    });

    if (availableMutations.length === 0) {
        nextMutationSize += 15;
        gameState.paused = false;
        return;
    }

    const labels = {
        flagelle: '⚡ Cils Flagellés (+35% Vitesse de déplacement)',
        spike: '🔪 Pointes de Chitine (+35% Dégâts offensifs)',
        shield: '🛡️ Membrane Renforcée (+35% Résistance aux chocs)'
    };

    availableMutations.forEach(opt => {
        if (!labels[opt]) return;
        const btn = document.createElement('button');
        btn.className = 'mutation-btn';
        btn.textContent = labels[opt];
        
        btn.addEventListener('click', () => {
            if (player) player.applyMutation(opt);
            playSound(720, 0.15, 'sine');
            modal.classList.add('hidden');
            gameState.paused = false;
            nextMutationSize += 12;
        });
        choices.appendChild(btn);
    });

    modal.classList.remove('hidden');
}

// ==========================================
// 7. BOUCLE LOGIQUE PRINCIPALE (60 FPS WEBGL)
// ==========================================
app.ticker.add((delta) => {
    // Arrêt immédiat si pause ou si le joueur n'est pas encore instancié de manière sécurisée
    if (gameState.paused || !player) return;

    gameState.age += delta;

    // Calcul de la trajectoire fluide dirigée par le curseur de la souris
    const screenCenterX = app.screen.width / 2;
    const screenCenterY = app.screen.height / 2;
    const dx = mousePosition.x - screenCenterX;
    const dy = mousePosition.y - screenCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 12) {
        player.vx = dx / dist;
        player.vy = dy / dist;
    } else {
        player.vx = 0;
        player.vy = 0;
    }

    player.update(delta);

    // Génération progressive et continue de nutriments
    if (Math.random() < 0.05 * delta) spawnNutrient();

    // Traitement des collisions entre le joueur et les nutriments (Boucle inversée sécurisée)
    for (let i = nutrients.length - 1; i >= 0; i--) {
        const nut = nutrients[i];
        const hDist = Math.sqrt((player.x - nut.x) ** 2 + (player.y - nut.y) ** 2);
        if (hDist < player.size + nut.r) {
            player.size += nut.rare ? 0.6 : 0.25;
            player.hp = Math.min(player.size * 10, player.hp + 1);
            
            floatingTexts.push(new FloatingText(nut.x, nut.y, nut.rare ? '+3 ADN' : '+1 ADN', nut.rare ? 0xffd700 : 0x00aaff));
            playSound(500 + (nut.rare ? 200 : 0), 0.04, 'sine');
            
            foodLayer.removeChild(nut.gfx);
            nut.gfx.destroy();
            nutrients.splice(i, 1);
            player.refreshStaticDraws();
        }
    }

    // IA du Monde : Comportement des micro-organismes rivaux
    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        
        if (Math.random() < 0.015 * delta) {
            // Changement aléatoire de direction organique
            cell.vx = Math.random() * 2 - 1;
            cell.vy = Math.random() * 2 - 1;
            const len = Math.sqrt(cell.vx * cell.vx + cell.vy * cell.vy);
            if (len > 0) { cell.vx /= len; cell.vy /= len; }
        }

        cell.update(delta);

        // Prédation : Le joueur absorbe les cellules plus petites
        if (player.canEat(cell) && player.distanceTo(cell) < player.size + cell.size) {
            player.eat(cell);
            cell.destroy();
            cells.splice(i, 1);
            continue;
        }

        // Agression ou Mort : Si la cellule rivale touche le joueur et est plus massive
        if (cell.distanceTo(player) < cell.size + player.size) {
            if (cell.canEat(player)) {
                if (!player.takeDamage(cell.size * 0.4)) {
                    alert(`FIN DE LA SÉQUENCE : Votre micro-organisme a été assimilé.\nTaille finale : ${Math.floor(player.size)}px`);
                    document.getElementById('dietModal').classList.remove('hidden');
                    gameState.paused = true;
                    return;
                }
            } else if (!player.canEat(cell)) {
                // Combat passif par frottement de membranes
                cell.attackCell(player);
                player.attackCell(cell);
            }
        }
    }

    // Traitement du cycle de vie des particules de fluide
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(delta);
        if (particles[i].life <= 0) {
            particles[i].destroy();
            particles.splice(i, 1);
        }
    }

    // Traitement du cycle de vie des textes évanescents
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].update(delta);
        if (floatingTexts[i].life <= 0) {
            floatingTexts[i].destroy();
            floatingTexts.splice(i, 1);
        }
    }

    // Effet Secousse dynamique de la Caméra (Camera Shake sur impact majeur)
    let shakeX = 0;
    let shakeY = 0;
    if (gameState.shakeIntensity > 0) {
        shakeX = (Math.random() - 0.5) * gameState.shakeIntensity;
        shakeY = (Math.random() - 0.5) * gameState.shakeIntensity;
        gameState.shakeIntensity -= 0.25 * delta;
    }

    // Centrage fluide amorti de la caméra sur le joueur (Lerp de caméra de jeu de tir)
    const targetCamX = screenCenterX - player.x;
    const targetCamY = screenCenterY - player.y;

    gameLayer.x = lerp(gameLayer.x, targetCamX, 0.08 * delta) + shakeX;
    gameLayer.y = lerp(gameLayer.y, targetCamY, 0.08 * delta) + shakeY;
    
    foodLayer.x = gameLayer.x;
    foodLayer.y = gameLayer.y;
    fxLayer.x = gameLayer.x;
    fxLayer.y = gameLayer.y;

    // Parallaxe de l'arrière-plan pour donner un sentiment de profondeur tridimensionnelle
    backgroundLayer.x = lerp(backgroundLayer.x, targetCamX * 0.25, 0.08 * delta);
    backgroundLayer.y = lerp(backgroundLayer.y, targetCamY * 0.25, 0.08 * delta);

    // Animation finale des appendices cellulaires
    player.updateVisualAnimations(gameState.age);
    cells.forEach(c => c.updateVisualAnimations(gameState.age));

    // Synchronisation de l'affichage textuel du HUD
    document.getElementById('size').textContent = Math.floor(player.size);
    document.getElementById('population').textContent = cells.length;
    document.getElementById('fps').textContent = Math.round(app.ticker.FPS);

    checkMutations();
});

// ==========================================
// 8. ÉCOUTEURS D'ÉVÉNEMENTS DES MODALES (DOM)
// ==========================================
document.getElementById('btn-herbivore').addEventListener('click', () => {
    playerColor = 0x00ffcc; // Teinte turquoise bio-luminescente
    document.getElementById('dietModal').classList.add('hidden');
    initGame();
    gameState.paused = false;
});

document.getElementById('btn-carnivore').addEventListener('click', () => {
    playerColor = 0xff1e56; // Teinte rouge prédateur agressif
    document.getElementById('dietModal').classList.add('hidden');
    initGame();
    gameState.paused = false;
});

document.getElementById('restartBtn').addEventListener('click', () => {
    document.getElementById('dietModal').classList.remove('hidden');
    document.getElementById('mutationModal').classList.add('hidden');
    gameState.paused = true;
});

const pauseButton = document.getElementById('pauseBtn');
if (pauseButton) {
    pauseButton.addEventListener('click', () => {
        // Protection si la modale de départ est visible
        if (!document.getElementById('dietModal').classList.contains('hidden')) return;
        
        gameState.paused = !gameState.paused;
        pauseButton.textContent = gameState.paused ? '▶️ Jouer' : '⏸️ Pause';
    });
}
