// ==========================================
// CONFIGURATION DU MONDE ET DES PARAMÈTRES
// ==========================================
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1200;

// Configuration robuste du moteur PixiJS v7
const app = new PIXI.Application({
    resizeTo: window,
    background: '#030307', 
    backgroundColor: 0x030307, 
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});
document.getElementById('game-container').appendChild(app.view);

// Architecture par Calques (Layers)
const backgroundLayer = new PIXI.Container();
const gameLayer = new PIXI.Container();
const uiLayer = new PIXI.Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(uiLayer);

let player = null;
let cells = [];
let particles = [];
let nextMutationSize = 25;

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

let mousePosition = { x: app.screen.width / 2, y: app.screen.height / 2 };
window.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
});

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

// ==========================================
// SYSTEME DE SONS (Instance Unique / Anti-Crash)
// ==========================================
let globalAudioCtx = null;

function playSound(frequency, duration) {
    try {
        if (!globalAudioCtx) {
            globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (globalAudioCtx.state === 'suspended') {
            globalAudioCtx.resume();
        }
        
        const oscillator = globalAudioCtx.createOscillator();
        const gainNode = globalAudioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(globalAudioCtx.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.1, globalAudioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, globalAudioCtx.currentTime + duration);
        
        oscillator.start(globalAudioCtx.currentTime);
        oscillator.stop(globalAudioCtx.currentTime + duration);
    } catch (e) {
        // Mode silencieux si le navigateur bloque l'audio au départ
    }
}

// ==========================================
// CLASSE PARTICLE
// ==========================================
class Particle {
    constructor(x, y, colorHex) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = (Math.random() - 0.5) * 6 - 2;
        this.life = 30;
        this.size = Math.random() * 4 + 2;

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
        this.vy += 0.1 * delta;
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
// CLASSE CELLULE (Sécurisée pour les Textes et Filtres)
// ==========================================
class Cell {
    constructor(x, y, size, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.isPlayer = isPlayer;
        this.vx = 0;
        this.vy = 0;
        this.speed = isPlayer ? 3.5 : Math.random() * 1.5 + 0.5;
        this.energy = size * 50;
        this.mutations = [];
        this.age = 0;
        this.attackPower = 1;
        this.defense = 1;
        this.hp = size * 10;

        this.display = new PIXI.Container();
        this.display.x = this.x;
        this.display.y = this.y;

        this.colorHex = this.isPlayer ? 0x00ffcc : hslToHex((x + y) % 360, 75, 50);

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

        if (this.isPlayer) {
            this.label = new PIXI.Text('TOI', {
                fontFamily: 'Arial', fontSize: 13, fontWeight: 'bold', fill: '#00ffcc', align: 'center'
            });
            this.label.anchor.set(0.5);
            this.display.addChild(this.label);

            this.mutationLabel = new PIXI.Text('', {
                fontFamily: 'Arial', fontSize: 12, fontWeight: 'bold', fill: '#ffffff', align: 'center'
            });
            this.mutationLabel.anchor.set(0.5);
            this.display.addChild(this.mutationLabel);

            // Double détection adaptative pour le filtre Glow v7/v8
            let glow = null;
            if (PIXI.filters && PIXI.filters.GlowFilter) {
                glow = new PIXI.filters.GlowFilter({ distance: 20, outerStrength: 2, innerStrength: 0, color: 0x00ffcc, quality: 0.5 });
            } else if (PIXI.GlowFilter) {
                glow = new PIXI.GlowFilter({ distance: 20, outerStrength: 2, innerStrength: 0, color: 0x00ffcc, quality: 0.5 });
            }
            if (glow) this.bodyGfx.filters = [glow];
        }

        this.refreshStaticDraws();
        gameLayer.addChild(this.display);
    }

    refreshStaticDraws() {
        this.bodyGfx.clear();
        this.bodyGfx.beginFill(this.colorHex, 0.85);
        this.bodyGfx.drawCircle(0, 0, this.size);
        this.bodyGfx.endFill();
        this.bodyGfx.lineStyle(2, 0xffffff, 0.2);
        this.bodyGfx.drawCircle(0, 0, this.size);

        this.spikesGfx.clear();
        if (this.mutations.find(m => m.name === 'Spike')) {
            const numSpikes = 8;
            for (let i = 0; i < numSpikes; i++) {
                const angle = (i / numSpikes) * Math.PI * 2;
                const x1 = Math.cos(angle) * this.size;
                const y1 = Math.sin(angle) * this.size;
                const spikeLength = this.size * 0.5;
                const x2 = Math.cos(angle) * (this.size + spikeLength);
                const y2 = Math.sin(angle) * (this.size + spikeLength);
                
                this.spikesGfx.lineStyle(2, 0xff3355);
                this.spikesGfx.moveTo(x1, y1);
                this.spikesGfx.lineTo(x2, y2);
                
                this.spikesGfx.beginFill(0xff3355);
                this.spikesGfx.drawCircle(x2, y2, 3);
                this.spikesGfx.endFill();
            }
        }

        if (this.isPlayer) {
            this.label.y = -this.size - 22;
            this.mutationLabel.y = -this.size - 5;
        }
    }

    updateVisualAnimations(age) {
        this.display.x = this.x;
        this.display.y = this.y;

        const pulse = 1 + Math.sin(age * 0.05 + (this.x * 0.0005)) * 0.03;
        this.bodyGfx.scale.set(pulse);

        this.shieldGfx.clear();
        if (this.mutations.find(m => m.name === 'Shield')) {
            this.shieldGfx.lineStyle(3, 0x00bfff, 0.5);
            this.shieldGfx.drawCircle(0, 0, this.size + 12);
            const shieldPulse = Math.sin(age * 0.06) * 2 + 4;
            this.shieldGfx.lineStyle(1.5, 0x00bfff, 0.2);
            this.shieldGfx.drawCircle(0, 0, this.size + 16 + shieldPulse);
        }

        this.flagellaGfx.clear();
        if (this.mutations.find(m => m.name === 'Flagelle')) {
            const numFlagella = 3;
            this.flagellaGfx.lineStyle(2.5, 0x00ffaa, 0.7);
            for (let i = 0; i < numFlagella; i++) {
                const angle = (i / numFlagella) * Math.PI * 2 + age * 0.03;
                this.flagellaGfx.moveTo(Math.cos(angle) * this.size, Math.sin(angle) * this.size);
                
                for (let j = 1; j < 8; j++) {
                    const progress = j / 8;
                    const wave = Math.sin(age * 0.1 + j * 0.4) * 6;
                    const x = Math.cos(angle) * (this.size + progress * this.size * 0.7) + Math.sin(angle + Math.PI / 2) * wave;
                    const y = Math.sin(angle) * (this.size + progress * this.size * 0.7) + Math.cos(angle + Math.PI / 2) * wave;
                    this.flagellaGfx.lineTo(x, y);
                }
            }
        }

        this.bombGfx.clear();
        if (this.mutations.find(m => m.name === 'Grosse Bombe')) {
            this.bombGfx.lineStyle(2, 0xffaa00, 0.6);
            this.bombGfx.drawCircle(0, 0, this.size + 6);
        }
    }

    applyMutation(mutationName) {
        const mutations = {
            flagelle: { name: 'Flagelle', speed: 1.4 },
            spike: { name: 'Spike', attack: 1.4 },
            shield: { name: 'Shield', defense: 1.3 },
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
            const emojis = { 'Flagelle': '⚡', 'Spike': '🔪', 'Shield': '🛡️', 'Grosse Bombe': '💥' };
            this.mutationLabel.text = this.mutations.map(m => emojis[m.name] || '').join(' ');
        }
    }

    takeDamage(damage) {
        const actualDamage = damage / this.defense;
        this.hp -= actualDamage;
        
        if (this.isPlayer && actualDamage > 3) {
            gameState.shakeIntensity = 5;
            playSound(180, 0.12);
        }
        
        for (let i = 0; i < 3; i++) {
            particles.push(new Particle(this.x, this.y, 0xff3333));
        }
        
        return this.hp > 0;
    }

    attackCell(other) {
        if (this.mutations.find(m => m.name === 'Spike')) {
            const damage = this.size * 0.4 * this.attackPower;
            other.takeDamage(damage);
        }
    }

    update(delta) {
        this.x += this.vx * this.speed * delta;
        this.y += this.vy * this.speed * delta;

        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

        this.energy -= this.speed * 0.01 * delta;
        this.age += delta;

        return !(this.hp <= 0 || this.energy <= 0);
    }

    distanceTo(other) {
        return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
    }

    canEat(other) {
        return this.size > other.size * 1.1;
    }

    eat(other) {
        this.energy += other.size * 35;
        this.size += other.size * 0.25;
        this.hp += other.size * 4;
        
        for (let i = 0; i < 6; i++) {
            particles.push(new Particle(other.x, other.y, other.colorHex));
        }
        
        playSound(450 + Math.random() * 150, 0.08);
        this.refreshStaticDraws();
    }

    destroy() {
        gameLayer.removeChild(this.display);
        this.display.destroy({ children: true });
    }
}

// ==========================================
// INITIALISATION DU JEU
// ==========================================
function initGame() {
    cells.forEach(c => c.destroy());
    particles.forEach(p => p.destroy());
    backgroundLayer.removeChildren();

    cells = [];
    particles = [];
    gameState.age = 0;
    nextMutationSize = 25;
    gameState.shakeIntensity = 0;

    player = new Cell(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 16, true);

    for (let i = 0; i < 120; i++) {
        const dot = new PIXI.Graphics();
        dot.beginFill(0x00aaff, Math.random() * 0.25 + 0.05);
        dot.drawCircle(0, 0, Math.random() * 2 + 1);
        dot.endFill();
        dot.x = Math.random() * WORLD_WIDTH;
        dot.y = Math.random() * WORLD_HEIGHT;
        backgroundLayer.addChild(dot);
    }

    for (let i = 0; i < 35; i++) {
        const x = Math.random() * WORLD_WIDTH;
        const y = Math.random() * WORLD_HEIGHT;
        const size = Math.random() * 8 + 6;
        cells.push(new Cell(x, y, size, false));
    }
}

// ==========================================
// GESTION DES MUTATIONS
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
    if (!modal || !choices) return;

    choices.innerHTML = '';
    
    const labels = {
        flagelle: '⚡ Flagelle (+40% vitesse)',
        spike: '🔪 Spike (+40% dégâts)',
        shield: '🛡️ Shield (+30% défense)',
        sizeburst: '💥 Grosse Bombe (+25% volume)'
    };

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'mutation-btn';
        btn.textContent = labels[opt];
        
        btn.addEventListener('click', () => {
            player.applyMutation(opt);
            playSound(750, 0.12);
            modal.classList.add('hidden');
            gameState.paused = false;
        });
        
        choices.appendChild(btn);
    });

    modal.classList.remove('hidden');
    gameState.paused = true;
}

function updateHUD() {
    const sizeEl = document.getElementById('size');
    const fpsEl = document.getElementById('fps');
    if (sizeEl) sizeEl.textContent = Math.floor(player.size);
    if (fpsEl) fpsEl.textContent = Math.round(app.ticker.FPS);
}

// ==========================================
// MOTEUR DE RENDU ET LOGIQUE DE SOURIS
// ==========================================
app.ticker.add((delta) => {
    if (gameState.paused) return;

    gameState.age += delta;

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

    // Moteur d'IA algorithmique
    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        let targetCell = null;
        let closestDist = Infinity;

        for (let j = 0; j < cells.length; j++) {
            if (i !== j && cell.canEat(cells[j])) {
                const d = cell.distanceTo(cells[j]);
                if (d < closestDist) {
                    closestDist = d;
                    targetCell = cells[j];
                }
            }
        }

        if (cell.size > player.size * 0.8) {
            const playerDist = cell.distanceTo(player);
            if (playerDist < 250 && playerDist < closestDist) {
                targetCell = player;
                closestDist = playerDist;
            }
        }

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

        if (!cell.update(delta)) {
            cell.destroy();
            cells.splice(i, 1);
            continue;
        }

        if (cell.size > 28 && Math.random() < 0.003 * delta) {
            cells.push(new Cell(cell.x + 15, cell.y, cell.size * 0.45, false));
            cell.size *= 0.75;
            cell.refreshStaticDraws();
        }
    }

    // Gestion propre des collisions physiques
    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        if (player.canEat(cell) && player.distanceTo(cell) < player.size + cell.size) {
            player.eat(cell);
            cell.destroy();
            cells.splice(i, 1);
        }
    }

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
                if (!player.takeDamage(cell.size * 0.7)) {
                    alert(`Game Over!\nTaille finale: ${Math.floor(player.size)}`);
                    initGame();
                    return;
                }
            }
        }
    }

    // Mise à jour des particules organiques
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(delta);
        if (particles[i].life <= 0) {
            particles[i].destroy();
            particles.splice(i, 1);
        }
    }

    // Effet cinématique de Secousse de caméra
    let shakeX = 0;
    let shakeY = 0;
    if (gameState.shakeIntensity > 0) {
        shakeX = (Math.random() - 0.5) * gameState.shakeIntensity;
        shakeY = (Math.random() - 0.5) * gameState.shakeIntensity;
        gameState.shakeIntensity -= 0.3 * delta;
    }

    const targetCamX = screenCenterX - player.x;
    const targetCamY = screenCenterY - player.y;

    gameLayer.x = lerp(gameLayer.x, targetCamX, 0.1 * delta) + shakeX;
    gameLayer.y = lerp(gameLayer.y, targetCamY, 0.1 * delta) + shakeY;

    backgroundLayer.x = lerp(backgroundLayer.x, targetCamX * 0.4, 0.1 * delta);
    backgroundLayer.y = lerp(backgroundLayer.y, targetCamY * 0.4, 0.1 * delta);

    // Animation des flagelles et des boucliers translucides
    player.updateVisualAnimations(gameState.age);
    cells.forEach(c => c.updateVisualAnimations(gameState.age));

    checkMutations();
    updateHUD();
});

// Événements UI sécurisés
const rBtn = document.getElementById('restartBtn');
if (rBtn) {
    rBtn.addEventListener('click', () => {
        initGame();
        gameState.paused = false;
        const mModal = document.getElementById('mutationModal');
        if (mModal) mModal.classList.add('hidden');
    });
}

const pBtn = document.getElementById('pauseBtn');
if (pBtn) {
    pBtn.addEventListener('click', () => {
        gameState.paused = !gameState.paused;
        pBtn.textContent = gameState.paused ? '▶️ Jouer' : '⏸️ Pause';
    });
}

// Lancement immédiat de l'écosystème
initGame();
