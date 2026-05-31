// ==========================================
// CONFIGURATION DU MONDE ET DES PARAMÈTRES
// ==========================================
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1200;

// Configuration du moteur PixiJS (WebGL Accéléré)
const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x030307, // Fond abyssal microscopique
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});
document.getElementById('game-container').appendChild(app.view);

// Architecture par Calques (Layers) pour optimiser le processeur
const backgroundLayer = new PIXI.Container();
const gameLayer = new PIXI.Container();
const uiLayer = new PIXI.Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(uiLayer);

// Éléments globaux du jeu
let player = null;
let cells = [];
let particles = [];
let nextMutationSize = 10;

let gameState = {
    paused: false,
    age: 0,
    shakeIntensity: 0
};

const MUTATION_LIMITS = {
    flagelle: 2,
    spike: 2,
    shield: 2,
    sizeburst: 1
};

// Position de la souris globale
let mousePosition = { x: app.screen.width / 2, y: app.screen.height / 2 };
window.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
});

// Assistant : Convertisseur de couleur HSL vers Hexadécimal pour PixiJS
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

// Assistant : Interpolation linéaire pour adoucir la caméra (Lerp)
function lerp(start, end, amount) {
    return (1 - amount) * start + amount * end;
}

// ==========================================
// SYSTEME DE SONS (Identique à ton original)
// ==========================================
function playSound(frequency, duration) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        // Support audio absent du navigateur
    }
}

// ==========================================
// CLASSE PARTICLE OPTIMISÉE POUR PIXIJS
// ==========================================
class Particle {
    constructor(x, y, colorHex) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = (Math.random() - 0.5) * 6 - 2;
        this.life = 30;
        this.size = Math.random() * 4 + 2;

        // Création de l'affichage WebGL pour la particule
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(colorHex);
        this.gfx.drawCircle(0, 0, this.size);
        this.gfx.endFill();
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        
        gameLayer.addChild(this.gfx);
    }

    update(delta) {
        this.x += this.vx * delta;
        this.y += this.vy * delta;
        this.vy += 0.1 * delta; // Gravité liquide
        this.life -= delta;

        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.alpha = Math.max(0, this.life / 30);
    }

    destroy() {
        gameLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

// ==========================================
// CLASSE CELLULE DIRECTION ARTISTIQUE WEBGL
// ==========================================
class Cell {
    constructor(x, y, size, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.isPlayer = isPlayer;
        this.vx = 0;
        this.vy = 0;
        this.speed = isPlayer ? 3 : Math.random() * 1.5;
        this.energy = size * 50;
        this.mutations = [];
        this.age = 0;
        this.attackPower = 1;
        this.defense = 1;
        this.hp = size * 10;

        // Conteneur racine PixiJS pour regrouper tous les calques de la cellule
        this.display = new PIXI.Container();
        this.display.x = this.x;
        this.display.y = this.y;

        // Attribution des couleurs
        this.colorHex = this.isPlayer ? 0x00ff00 : hslToHex((x + y) % 360, 70, 50);

        // Sous-calques graphiques pour superposer les mutations proprement
        this.flagellaGfx = new PIXI.Graphics();
        this.shieldGfx = new PIXI.Graphics();
        this.spikesGfx = new PIXI.Graphics();
        this.bombGfx = new PIXI.Graphics();
        this.bodyGfx = new PIXI.Graphics();

        this.display.addChild(this.flagellaGfx);
        this.display.addChild(this.shieldGfx);
        this.display.addChild(this.spikesGfx);
        this.display.addChild(this.bombGfx);
        this.display.addChild(this.bodyGfx);

        // Labels textuels pour le joueur
        if (this.isPlayer) {
            this.label = new PIXI.Text('TOI', {
                fontFamily: 'Arial', fontSize: 14, fontWeight: 'bold', fill: 0x00ff00, align: 'center'
            });
            this.label.anchor.set(0.5);
            this.display.addChild(this.label);

            this.mutationLabel = new PIXI.Text('', {
                fontFamily: 'Arial', fontSize: 12, fontWeight: 'bold', fill: 0xffffff, align: 'center'
            });
            this.mutationLabel.anchor.set(0.5);
            this.display.addChild(this.mutationLabel);

            // Filtre de bioluminescence exclusif géré par GPU
            this.bodyGfx.filters = [new PIXI.filters.GlowFilter({
                distance: 25, outerStrength: 2.5, innerStrength: 0, color: 0x00ffcc, quality: 0.5
            })];
        }

        this.refreshStaticDraws();
        gameLayer.addChild(this.display);
    }

    // Génère les dessins statiques (évite de recalculer inutilement à chaque frame)
    refreshStaticDraws() {
        // Corps
        this.bodyGfx.clear();
        this.bodyGfx.beginFill(this.colorHex, 0.8);
        this.bodyGfx.drawCircle(0, 0, this.size);
        this.bodyGfx.endFill();
        this.bodyGfx.lineStyle(2, this.isPlayer ? 0x00ff00 : 0xffffff, 0.3);
        this.bodyGfx.drawCircle(0, 0, this.size);

        // Épines (Spike)
        this.spikesGfx.clear();
        if (this.mutations.find(m => m.name === 'Spike')) {
            const numSpikes = 8;
            for (let i = 0; i < numSpikes; i++) {
                const angle = (i / numSpikes) * Math.PI * 2;
                const x1 = Math.cos(angle) * this.size;
                const y1 = Math.sin(angle) * this.size;
                const spikeLength = this.size * 0.6;
                const x2 = Math.cos(angle) * (this.size + spikeLength);
                const y2 = Math.sin(angle) * (this.size + spikeLength);
                
                this.spikesGfx.lineStyle(2, 0xff3333);
                this.spikesGfx.moveTo(x1, y1);
                this.spikesGfx.lineTo(x2, y2);
                
                this.spikesGfx.beginFill(0xff3333);
                this.spikesGfx.drawCircle(x2, y2, 3);
                this.spikesGfx.endFill();
            }
        }

        // Ajustement des labels textuels selon la taille
        if (this.isPlayer) {
            this.label.y = -this.size - 25;
            this.mutationLabel.y = -this.size - 5;
        }
    }

    // Dessins procéduraux animés (gérés en temps réel à chaque frame)
    updateVisualAnimations(age) {
        this.display.x = this.x;
        this.display.y = this.y;

        // Effet de respiration de la membrane cellulaire
        const pulse = 1 + Math.sin(age * 0.04 + (this.x * 0.001)) * 0.03;
        this.bodyGfx.scale.set(pulse);

        // Bouclier (Shield) ondulant
        this.shieldGfx.clear();
        if (this.mutations.find(m => m.name === 'Shield')) {
            this.shieldGfx.lineStyle(4, 0x64c8ff, 0.6);
            this.shieldGfx.drawCircle(0, 0, this.size + 15);
            
            const shieldPulse = Math.sin(age * 0.05) * 3 + 5;
            this.shieldGfx.lineStyle(2, 0x64c8ff, 0.3);
            this.shieldGfx.drawCircle(0, 0, this.size + 20 + shieldPulse);
        }

        // Tentacules (Flagelle) dynamiques
        this.flagellaGfx.clear();
        if (this.mutations.find(m => m.name === 'Flagelle')) {
            const numFlagella = 4;
            this.flagellaGfx.lineStyle(3, 0x64c896, 0.8);
            for (let i = 0; i < numFlagella; i++) {
                const angle = (i / numFlagella) * Math.PI * 2 + age * 0.02;
                this.flagellaGfx.moveTo(Math.cos(angle) * this.size, Math.sin(angle) * this.size);
                
                for (let j = 1; j < 10; j++) {
                    const progress = j / 10;
                    const wave = Math.sin(age * 0.08 + j * 0.3) * 8;
                    const x = Math.cos(angle) * (this.size + progress * this.size * 0.8) + Math.sin(angle + Math.PI / 2) * wave;
                    const y = Math.sin(angle) * (this.size + progress * this.size * 0.8) + Math.cos(angle + Math.PI / 2) * wave;
                    this.flagellaGfx.lineTo(x, y);
                }
            }
        }

        // Grosse Bombe et ses étoiles scintillantes
        this.bombGfx.clear();
        if (this.mutations.find(m => m.name === 'Grosse Bombe')) {
            this.bombGfx.lineStyle(3, 0xffd700, 0.7);
            this.bombGfx.drawCircle(0, 0, this.size + 8);
            
            this.bombGfx.beginFill(0xffd700, 0.9);
            const numStars = 12;
            for (let i = 0; i < numStars; i++) {
                const angle = (i / numStars) * Math.PI * 2;
                const shine = Math.sin(age * 0.06 + i) * 2 + 2;
                const x = Math.cos(angle) * (this.size + 20);
                const y = Math.sin(angle) * (this.size + 20);
                this.bombGfx.drawCircle(x, y, shine);
            }
            this.bombGfx.endFill();
        }
    }

    applyMutation(mutationName) {
        const mutations = {
            flagelle: { name: 'Flagelle', speed: 1.5 },
            spike: { name: 'Spike', attack: 1.3 },
            shield: { name: 'Shield', defense: 1.2, size: 1.1 },
            sizeburst: { name: 'Grosse Bombe', size: 1.3, hp: 1.5 }
        };

        const mutation = mutations[mutationName];
        if (!mutation) return;

        this.mutations.push(mutation);
        
        if (mutation.speed) this.speed *= mutation.speed;
        if (mutation.attack) this.attackPower *= mutation.attack;
        if (mutation.defense) this.defense *= mutation.defense;
        if (mutation.size) this.size *= mutation.size;
        if (mutation.hp) this.hp *= mutation.hp;

        this.refreshStaticDraws();

        if (this.isPlayer) {
            const emojis = { 'Flagelle': '⚡', 'Spike': '🔪', 'Shield': '🛡️', 'Grosse Bombe': '💥' };
            this.mutationLabel.text = this.mutations.map(m => emojis[m.name] || '').join(' ');
        }
    }

    takeDamage(damage) {
        const actualDamage = damage / this.defense;
        this.hp -= actualDamage;
        
        if (this.isPlayer && actualDamage > 5) {
            gameState.shakeIntensity = 6;
            playSound(200, 0.15);
        }
        
        for (let i = 0; i < 4; i++) {
            particles.push(new Particle(this.x, this.y, 0xff0000));
        }
        
        return this.hp > 0;
    }

    attackCell(other) {
        if (this.mutations.find(m => m.name === 'Spike')) {
            const damage = this.size * 0.5 * this.attackPower;
            other.takeDamage(damage);
        }
    }

    update(delta) {
        this.x += this.vx * this.speed * delta;
        this.y += this.vy * this.speed * delta;

        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

        this.energy -= this.speed * 0.02 * delta;
        this.age += delta;

        return !(this.hp <= 0 || this.energy <= 0);
    }

    distanceTo(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    canEat(other) {
        return this.size > other.size * 1.1;
    }

    eat(other) {
        this.energy += other.size * 40;
        this.size += other.size * 0.3;
        this.hp += other.size * 5;
        
        for (let i = 0; i < 8; i++) {
            particles.push(new Particle(other.x, other.y, other.colorHex));
        }
        
        playSound(400 + Math.random() * 200, 0.1);
        this.refreshStaticDraws();
        return true;
    }

    destroy() {
        gameLayer.removeChild(this.display);
        this.display.destroy({ children: true });
    }
}

// ==========================================
// INITIALISATION DE LA PARTIE
// ==========================================
function initGame() {
    // Nettoyage complet des anciens conteneurs Pixi
    cells.forEach(c => c.destroy());
    particles.forEach(p => p.destroy());
    backgroundLayer.removeChildren();

    cells = [];
    particles = [];
    gameState.age = 0;
    nextMutationSize = 10;
    gameState.shakeIntensity = 0;

    // Recréation du joueur
    player = new Cell(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 15, true);

    // Décor : Génération du bouillon de culture passif (Parallaxe)
    for (let i = 0; i < 150; i++) {
        const dot = new PIXI.Graphics();
        dot.beginFill(0x00aaff, Math.random() * 0.3 + 0.1);
        dot.drawCircle(0, 0, Math.random() * 2 + 1);
        dot.endFill();
        dot.x = Math.random() * WORLD_WIDTH;
        dot.y = Math.random() * WORLD_HEIGHT;
        backgroundLayer.addChild(dot);
    }

    // Génération des cellules IA de départ
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * WORLD_WIDTH;
        const y = Math.random() * WORLD_HEIGHT;
        const size = Math.random() * 8 + 5;
        cells.push(new Cell(x, y, size, false));
    }
}

// ==========================================
// INTERFACE DE MUTATION MODALE
// ==========================================
function checkMutations() {
    if (player.size >= nextMutationSize) {
        const availableMutations = Object.keys(MUTATION_LIMITS).filter(mut => {
            const mutationName = { flagelle: 'Flagelle', spike: 'Spike', shield: 'Shield', sizeburst: 'Grosse Bombe' }[mut];
            const count = player.mutations.filter(m => m.name === mutationName).length;
            return count < MUTATION_LIMITS[mut];
        });

        if (availableMutations.length > 0) {
            showMutationModal(availableMutations);
            nextMutationSize += 15;
        }
    }
}

function showMutationModal(options) {
    const modal = document.getElementById('mutationModal');
    const choices = document.getElementById('mutationChoices');
    choices.innerHTML = '';
    
    const labels = {
        flagelle: '⚡ Flagelle (+50% vitesse)',
        spike: '🔪 Spike (+30% dégâts)',
        shield: '🛡️ Shield (+20% défense)',
        sizeburst: '💥 Grosse Bombe (+30% taille)'
    };

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'mutation-btn';
        btn.textContent = labels[opt];
        
        btn.addEventListener('click', () => {
            player.applyMutation(opt);
            playSound(800, 0.15);
            modal.classList.add('hidden');
            gameState.paused = false;
        });
        
        choices.appendChild(btn);
    });

    modal.classList.remove('hidden');
    gameState.paused = true;
}

function updateHUD() {
    document.getElementById('size').textContent = Math.floor(player.size);
    document.getElementById('fps').textContent = Math.round(app.ticker.FPS);
}

// ==========================================
// BOUCLE DE LOGIQUE & D'ANIMATION UNIFIÉE
// ==========================================
app.ticker.add((delta) => {
    if (gameState.paused) return;

    gameState.age += delta;

    // 1. Calcul de la direction du joueur vers le curseur
    const screenCenterX = app.screen.width / 2;
    const screenCenterY = app.screen.height / 2;
    const dx = mousePosition.x - screenCenterX;
    const dy = mousePosition.y - screenCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 15) {
        player.vx = dx / dist;
        player.vy = dy / dist;
    } else {
        player.vx = 0;
        player.vy = 0;
    }

    player.update(delta);

    // 2. Gestion et IA des cellules environnantes
    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        let targetCell = null;
        let closestDist = Infinity;

        // L'IA cherche une proie plus petite
        for (let j = 0; j < cells.length; j++) {
            if (i !== j && cell.canEat(cells[j])) {
                const d = cell.distanceTo(cells[j]);
                if (d < closestDist) {
                    closestDist = d;
                    targetCell = cells[j];
                }
            }
        }

        // Si la cellule ennemie est plus grosse que 80% du joueur, elle le traque
        if (cell.size > player.size * 0.8) {
            const playerDist = cell.distanceTo(player);
            if (playerDist < 300 && playerDist < closestDist) {
                targetCell = player;
                closestDist = playerDist;
            }
        }

        // Application de la trajectoire d'attaque ou déplacement aléatoire
        if (targetCell && closestDist < 250) {
            const tdx = targetCell.x - cell.x;
            const tdy = targetCell.y - cell.y;
            const td = Math.sqrt(tdx * tdx + tdy * tdy);
            cell.vx = tdx / td;
            cell.vy = tdy / td;
        } else {
            if (Math.random() < 0.02) {
                cell.vx = Math.random() * 2 - 1;
                cell.vy = Math.random() * 2 - 1;
            }
        }

        // Destruction si HP ou énergie épuisés
        if (!cell.update(delta)) {
            cell.destroy();
            cells.splice(i, 1);
            continue;
        }

        // Division/Reproduction automatique cellulaire
        if (cell.size > 30 && Math.random() < 0.005 * delta) {
            cells.push(new Cell(cell.x + 20, cell.y, cell.size * 0.4, false));
            cell.size *= 0.8;
            cell.refreshStaticDraws();
        }
    }

    // 3. Gestion des collisions (Joueur mange cellule)
    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        if (player.canEat(cell)) {
            if (player.distanceTo(cell) < player.size + cell.size) {
                player.eat(cell);
                cell.destroy();
                cells.splice(i, 1);
            }
        }
    }

    // Collisions inter-cellules IA
    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            const distCells = cells[i].distanceTo(cells[j]);
            if (distCells < cells[i].size + cells[j].size) {
                cells[i].attackCell(cells[j]);
                cells[j].attackCell(cells[i]);

                if (cells[i].canEat(cells[j])) {
                    cells[i].eat(cells[j]);
                    cells[j].destroy();
                    cells.splice(j, 1);
                    j--;
                } else if (cells[j].canEat(cells[i])) {
                    cells[j].eat(cells[i]);
                    cells[i].destroy();
                    cells.splice(i, 1);
                    i--;
                    break;
                }
            }
        }
    }

    // Collisions agressives : Cellules IA vs Joueur
    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        if (cell.distanceTo(player) < cell.size + player.size) {
            cell.attackCell(player);
            player.attackCell(cell);

            if (player.canEat(cell)) {
                player.eat(cell);
                cell.destroy();
                cells.splice(i, 1);
            } else if (cell.canEat(player)) {
                if (!player.takeDamage(cell.size * 0.8)) {
                    alert(`Game Over!\nÂge: ${Math.floor(gameState.age)}\nTaille: ${Math.floor(player.size)}`);
                    initGame();
                    return;
                }
            }
        }
    }

    // 4. Boucle des particules
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(delta);
        if (particles[i].life <= 0) {
            particles[i].destroy();
            particles.splice(i, 1);
        }
    }

    // 5. Gestion des secousses (Caméra Shake) et amortissement
    let shakeX = 0;
    let shakeY = 0;
    if (gameState.shakeIntensity > 0) {
        shakeX = (Math.random() - 0.5) * gameState.shakeIntensity;
        shakeY = (Math.random() - 0.5) * gameState.shakeIntensity;
        gameState.shakeIntensity -= 0.4 * delta;
    }

    // Calcul du point de ciblage idéal pour centrer la caméra
    const targetCamX = screenCenterX - player.x;
    const targetCamY = screenCenterY - player.y;

    // Déplacement fluide des couches de décors (Caméra amortie par Lerp)
    gameLayer.x = lerp(gameLayer.x, targetCamX, 0.1 * delta) + shakeX;
    gameLayer.y = lerp(gameLayer.y, targetCamY, 0.1 * delta) + shakeY;

    // Effet Parallaxe : l'arrière-plan glisse plus lentement pour donner de la profondeur
    backgroundLayer.x = lerp(backgroundLayer.x, targetCamX * 0.4, 0.1 * delta);
    backgroundLayer.y = lerp(backgroundLayer.y, targetCamY * 0.4, 0.1 * delta);

    // 6. Rafraîchissement des rendus graphiques animés de chaque cellule active
    player.updateVisualAnimations(gameState.age);
    cells.forEach(c => c.updateVisualAnimations(gameState.age));

    checkMutations();
    updateHUD();
});

// Événements des boutons de l'interface utilisateur
document.getElementById('restartBtn').addEventListener('click', () => {
    initGame();
    gameState.paused = false;
    document.getElementById('mutationModal').classList.add('hidden');
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    gameState.paused = !gameState.paused;
    document.getElementById('pauseBtn').textContent = gameState.paused ? '▶️ Jouer' : '⏸️ Pause';
});

// Lancement du jeu
initGame();
