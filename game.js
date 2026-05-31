// ==========================================
// MOTEUR "SPORE" : ÉCOSYSTÈME COMPLET
// ==========================================
const WORLD_WIDTH = 2500;
const WORLD_HEIGHT = 1500;

const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x030307,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});

const gameCanvas = app.canvas || app.view;
document.getElementById('game-container').appendChild(gameCanvas);

const backgroundLayer = new PIXI.Container();
const gameLayer = new PIXI.Container();
const uiLayer = new PIXI.Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(uiLayer);

let player = null;
let cells = [];
let plants = []; 
let particles = [];
let floatingTexts = [];

// Le jeu commence en pause pour laisser le joueur choisir
let gameState = { paused: true, age: 0, shakeIntensity: 0 };

const SHOP_ITEMS = {
    flagelle: { name: 'Flagelle', cost: 15, max: 4, speed: 1.3, emoji: '⚡' },
    spike: { name: 'Épine', cost: 20, max: 4, attack: 1.5, emoji: '🔪' },
    shield: { name: 'Membrane Dure', cost: 25, max: 2, defense: 1.4, emoji: '🛡️' },
    sizeburst: { name: 'Noyau Géant', cost: 40, max: 3, size: 1.3, emoji: '💥' }
};

let mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX; mousePosition.y = e.clientY;
});

function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return Number(`0x${f(0)}${f(8)}${f(4)}`);
}

function lerp(start, end, amount) { return (1 - amount) * start + amount * end; }

// ==========================================
// SYSTEME AUDIO
// ==========================================
let globalAudioCtx = null;
function playSound(frequency, duration, type = 'sine') {
    try {
        if (!globalAudioCtx) globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (globalAudioCtx.state === 'suspended') globalAudioCtx.resume();
        const oscillator = globalAudioCtx.createOscillator();
        const gainNode = globalAudioCtx.createGain();
        oscillator.connect(gainNode); gainNode.connect(globalAudioCtx.destination);
        oscillator.frequency.value = frequency; oscillator.type = type;
        gainNode.gain.setValueAtTime(0.1, globalAudioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, globalAudioCtx.currentTime + duration);
        oscillator.start(globalAudioCtx.currentTime);
        oscillator.stop(globalAudioCtx.currentTime + duration);
    } catch (e) {}
}

// ==========================================
// EFFETS VISUELS
// ==========================================
class FloatingText {
    constructor(x, y, textStr, colorHex) {
        this.x = x; this.y = y; this.life = 40;
        try {
            this.txt = new PIXI.Text(textStr, { fontFamily: 'Arial', fontSize: 14, fontWeight: 'bold', fill: colorHex });
            this.txt.anchor.set(0.5); this.txt.x = this.x; this.txt.y = this.y;
            gameLayer.addChild(this.txt);
        } catch(e) { this.txt = null; }
    }
    update(delta) {
        this.life -= delta; this.y -= 1 * delta;
        if(this.txt) { this.txt.y = this.y; this.txt.alpha = Math.max(0, this.life / 40); }
    }
    destroy() { if(this.txt) { gameLayer.removeChild(this.txt); this.txt.destroy(); } }
}

class Particle {
    constructor(x, y, colorHex) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 6; this.vy = (Math.random() - 0.5) * 6;
        this.life = 25; this.size = Math.random() * 3 + 2;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(colorHex); this.gfx.drawCircle(0, 0, this.size); this.gfx.endFill();
        gameLayer.addChild(this.gfx);
    }
    update(delta) {
        this.x += this.vx * delta; this.y += this.vy * delta; this.life -= delta;
        this.gfx.x = this.x; this.gfx.y = this.y; this.gfx.alpha = Math.max(0, this.life / 25);
    }
    destroy() { gameLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

class Plant {
    constructor(x, y) {
        this.x = x; this.y = y; this.size = 5;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(0x33ff55, 0.8); this.gfx.lineStyle(1, 0xaaffaa, 0.5);
        this.gfx.moveTo(0, -this.size); this.gfx.quadraticCurveTo(this.size, 0, 0, this.size);
        this.gfx.quadraticCurveTo(-this.size, 0, 0, -this.size); this.gfx.endFill();
        this.gfx.x = this.x; this.gfx.y = this.y;
        gameLayer.addChild(this.gfx);
    }
    update(age) { this.gfx.rotation = Math.sin(age * 0.05 + this.x) * 0.5; }
    destroy() { gameLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

// ==========================================
// CLASSE CELLULE (Adaptée aux régimes)
// ==========================================
class Cell {
    constructor(x, y, size, isPlayer = false, diet = 'herbivore') {
        this.x = x; this.y = y; this.size = size;
        this.isPlayer = isPlayer;
        this.diet = diet; // 'herbivore' ou 'carnivore'
        this.vx = 0; this.vy = 0;
        this.speed = isPlayer ? 3.5 : Math.random() * 1.5 + 0.5;
        this.energy = size * 50;
        this.mutations = [];
        this.attackPower = 1; this.defense = 1;
        this.hp = size * 10;
        this.dna = 0; 

        if (this.isPlayer) {
            this.history = []; this.maxHistory = 25;
            this.trailGfx = new PIXI.Graphics();
            backgroundLayer.addChild(this.trailGfx); 
        }

        this.display = new PIXI.Container();
        
        // Attribution des couleurs par régime (Verts pour Herbivores, Rouges pour Carnivores)
        if (this.diet === 'herbivore') {
            this.colorHex = this.isPlayer ? 0x00ffcc : hslToHex(120 + Math.random() * 40 - 20, 75, 50);
        } else {
            this.colorHex = this.isPlayer ? 0xff3355 : hslToHex(0 + Math.random() * 40 - 20, 75, 50);
        }

        this.glowGfx = new PIXI.Graphics();
        this.mutationsGfx = new PIXI.Graphics();
        this.bodyGfx = new PIXI.Graphics();

        this.display.addChild(this.glowGfx);
        this.display.addChild(this.mutationsGfx);
        this.display.addChild(this.bodyGfx);

        this.refreshStaticDraws();
        gameLayer.addChild(this.display);
    }

    drawNativeGlow(radius, color) {
        this.glowGfx.clear();
        for (let i = 4; i > 0; i--) {
            this.glowGfx.beginFill(color, 0.08);
            this.glowGfx.drawCircle(0, 0, radius + (i * 3));
            this.glowGfx.endFill();
        }
    }

    refreshStaticDraws() {
        this.bodyGfx.clear();
        this.bodyGfx.beginFill(this.colorHex, 0.9);
        this.bodyGfx.lineStyle(2, 0xffffff, 0.6);
        this.bodyGfx.drawCircle(0, 0, this.size);
        this.bodyGfx.endFill();

        if (this.isPlayer) this.drawNativeGlow(this.size, this.colorHex);

        this.mutationsGfx.clear();
        const spikes = this.mutations.filter(m => m.name === 'Épine').length;
        if (spikes > 0) {
            const count = spikes * 4;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const x2 = Math.cos(angle) * (this.size * 1.5);
                const y2 = Math.sin(angle) * (this.size * 1.5);
                this.mutationsGfx.lineStyle(3, 0xff3355);
                this.mutationsGfx.moveTo(Math.cos(angle)*this.size, Math.sin(angle)*this.size);
                this.mutationsGfx.lineTo(x2, y2);
            }
        }
    }

    updateVisualAnimations(age) {
        this.display.x = this.x; this.display.y = this.y;
        this.bodyGfx.scale.set(1 + Math.sin(age * 0.1) * 0.03);

        if (this.isPlayer && this.trailGfx) {
            this.trailGfx.clear();
            if (this.history.length > 1) {
                for (let i = 0; i < this.history.length - 1; i++) {
                    const p1 = this.history[i]; const p2 = this.history[i + 1];
                    const progress = 1 - (i / this.history.length);
                    this.trailGfx.lineStyle(this.size * progress * 0.8, this.colorHex, progress * 0.4);
                    this.trailGfx.moveTo(p1.x, p1.y); this.trailGfx.lineTo(p2.x, p2.y);
                }
            }
        }
    }

    buyMutation(key) {
        const item = SHOP_ITEMS[key];
        const currentCount = this.mutations.filter(m => m.name === item.name).length;
        if (this.dna >= item.cost && currentCount < item.max) {
            this.dna -= item.cost;
            this.mutations.push(item);
            if (item.speed) this.speed *= item.speed;
            if (item.attack) this.attackPower *= item.attack;
            if (item.defense) this.defense *= item.defense;
            if (item.size) this.size *= item.size;
            
            this.refreshStaticDraws();
            playSound(600, 0.2, 'triangle');
            return true;
        }
        return false;
    }

    takeDamage(damage) {
        this.hp -= (damage / this.defense);
        if (this.isPlayer && damage > 1) {
            gameState.shakeIntensity = 4;
            playSound(150, 0.1, 'square');
        }
        for (let i = 0; i < 3; i++) particles.push(new Particle(this.x, this.y, 0xff3333));
        return this.hp > 0;
    }

    update(delta) {
        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x + this.vx * this.speed * delta));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y + this.vy * this.speed * delta));
        
        if (this.isPlayer) {
            const lastPoint = this.history[0];
            if (!lastPoint || Math.abs(lastPoint.x - this.x) > 2 || Math.abs(lastPoint.y - this.y) > 2) {
                this.history.unshift({ x: this.x, y: this.y });
                if (this.history.length > this.maxHistory) this.history.pop();
            }
        }
        return !(this.hp <= 0);
    }

    distanceTo(other) { return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2); }
    canEat(other) { return this.size > other.size * 1.15; }

    eat(other, type) {
        // Validation du régime alimentaire
        if (type === 'plant' && this.diet !== 'herbivore') return false;
        if (type === 'cell' && this.diet !== 'carnivore') return false;

        if (type === 'plant') {
            this.size += 0.5;
            if (this.isPlayer) {
                this.dna += 1;
                floatingTexts.push(new FloatingText(other.x, other.y, "+1 ADN", '#33ff55'));
                playSound(800, 0.05, 'sine');
            }
        } else if (type === 'cell') {
            this.size += other.size * 0.25;
            this.hp += other.size * 4;
            if (this.isPlayer) {
                const dnaGained = Math.floor(other.size / 2);
                this.dna += dnaGained;
                floatingTexts.push(new FloatingText(other.x, other.y, `+${dnaGained} ADN`, '#ff3355'));
                playSound(400, 0.1, 'sine');
            }
            for (let i = 0; i < 6; i++) particles.push(new Particle(other.x, other.y, other.colorHex));
        }
        this.refreshStaticDraws();
        return true;
    }

    destroy() {
        gameLayer.removeChild(this.display);
        this.display.destroy({ children: true });
        if (this.trailGfx) { backgroundLayer.removeChild(this.trailGfx); this.trailGfx.destroy(); }
    }
}

// ==========================================
// LANCEMENT & SÉLECTION DU RÉGIME
// ==========================================
function prepareGame() {
    document.getElementById('dietModal').classList.remove('hidden');
    gameState.paused = true;
}

function spawnWorld(playerDiet) {
    if (player) { player.destroy(); player = null; }
    cells.forEach(c => c.destroy()); plants.forEach(p => p.destroy());
    particles.forEach(p => p.destroy()); floatingTexts.forEach(f => f.destroy());
    backgroundLayer.removeChildren();

    cells = []; plants = []; particles = []; floatingTexts = [];
    gameState.age = 0; gameState.shakeIntensity = 0;

    // Création du joueur avec son choix
    player = new Cell(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 16, true, playerDiet);

    for (let i = 0; i < 150; i++) {
        const dot = new PIXI.Graphics();
        dot.beginFill(0x00aaff, Math.random() * 0.3 + 0.1);
        dot.drawCircle(0, 0, Math.random() * 1.5 + 0.5);
        dot.endFill();
        dot.x = Math.random() * WORLD_WIDTH; dot.y = Math.random() * WORLD_HEIGHT;
        backgroundLayer.addChild(dot);
    }

    for (let i = 0; i < 100; i++) plants.push(new Plant(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT));

    // Création d'un écosystème mixte (50% herbivores, 50% carnivores)
    for (let i = 0; i < 35; i++) {
        const aiDiet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
        cells.push(new Cell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() * 8 + 6, false, aiDiet));
    }
    
    document.getElementById('dietModal').classList.add('hidden');
    gameState.paused = false;
}

// Clics de sélection de régime
document.getElementById('btn-herbivore').addEventListener('click', () => spawnWorld('herbivore'));
document.getElementById('btn-carnivore').addEventListener('click', () => spawnWorld('carnivore'));

// ==========================================
// SYSTÈME DE LA BOUTIQUE (L'Éditeur)
// ==========================================
function openShop() {
    gameState.paused = true;
    const modal = document.getElementById('mutationModal');
    const choices = document.getElementById('mutationChoices');
    document.getElementById('shop-dna').textContent = player.dna;
    document.getElementById('evolveBtn').style.display = 'none';
    choices.innerHTML = '';

    Object.keys(SHOP_ITEMS).forEach(key => {
        const item = SHOP_ITEMS[key];
        const owned = player.mutations.filter(m => m.name === item.name).length;
        const div = document.createElement('div');
        div.className = 'mutation-item';
        const canBuy = player.dna >= item.cost && owned < item.max;
        
        div.innerHTML = `
            <div class="mutation-info">
                <strong>${item.emoji} ${item.name}</strong> (Possédé: ${owned}/${item.max})<br>
                <span style="font-size: 12px; color: #ccc;">Améliore ta cellule</span>
            </div>
            <div>
                <span class="mutation-cost">${item.cost} ADN</span>
                <button class="buy-btn" ${canBuy ? '' : 'disabled'}>Acheter</button>
            </div>
        `;
        
        div.querySelector('button').onclick = () => { if (player.buyMutation(key)) openShop(); };
        choices.appendChild(div);
    });

    modal.classList.remove('hidden');
}

document.getElementById('closeShopBtn').addEventListener('click', () => {
    document.getElementById('mutationModal').classList.add('hidden');
    gameState.paused = false;
});
document.getElementById('evolveBtn').addEventListener('click', () => openShop());
document.getElementById('restartBtn').addEventListener('click', () => prepareGame());

// ==========================================
// BOUCLE PRINCIPALE (GAME LOOP)
// ==========================================
app.ticker.add((delta) => {
    if (gameState.paused || !player) return;
    gameState.age += delta;

    document.getElementById('dna').textContent = player.dna;
    document.getElementById('size').textContent = Math.floor(player.size);
    document.getElementById('evolveBtn').style.display = (player.dna >= 15) ? 'block' : 'none';

    // Déplacement joueur
    const dx = mousePosition.x - window.innerWidth / 2;
    const dy = mousePosition.y - window.innerHeight / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 15) { player.vx = dx / dist; player.vy = dy / dist; } else { player.vx = 0; player.vy = 0; }
    player.update(delta);

    // Repousse des plantes
    if (Math.random() < 0.05 && plants.length < 150) {
        plants.push(new Plant(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT));
    }

    // Plantes & Interactions (Seuls les Herbivores peuvent les manger)
    for (let i = plants.length - 1; i >= 0; i--) {
        plants[i].update(gameState.age);
        
        // IA Herbivores mangent les plantes
        for (let j = 0; j < cells.length; j++) {
            if (cells[j].diet === 'herbivore') {
                const pdx = cells[j].x - plants[i].x; const pdy = cells[j].y - plants[i].y;
                if (Math.sqrt(pdx*pdx + pdy*pdy) < cells[j].size) {
                    cells[j].eat(plants[i], 'plant');
                    plants[i].destroy(); plants.splice(i, 1);
                    break;
                }
            }
        }
        
        // Joueur Herbivore mange les plantes
        if (plants[i] && player.diet === 'herbivore') {
            const dx = player.x - plants[i].x; const dy = player.y - plants[i].y;
            if (Math.sqrt(dx*dx + dy*dy) < player.size) {
                player.eat(plants[i], 'plant');
                plants[i].destroy(); plants.splice(i, 1);
            }
        }
    }

    // IA Cellules et Collisions
    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        
        // IA Basique : Chasse
        if (Math.random() < 0.02) { cell.vx = Math.random() * 2 - 1; cell.vy = Math.random() * 2 - 1; }
        if (!cell.update(delta)) { cell.destroy(); cells.splice(i, 1); continue; }

        // Carnivores mangent IA
        if (player.diet === 'carnivore' && player.size > cell.size * 1.15 && player.distanceTo(cell) < player.size + cell.size - 5) {
            player.eat(cell, 'cell'); cell.destroy(); cells.splice(i, 1); continue;
        }
        
        // IA Carnivores mangent Joueur
        if (cell.diet === 'carnivore' && cell.size > player.size * 1.15 && cell.distanceTo(player) < cell.size + player.size - 5) {
            if (!player.takeDamage(cell.size)) {
                alert(`Game Over! Tu as récolté ${player.dna} ADN en tant que ${player.diet}.`);
                prepareGame(); return;
            }
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(delta);
        if (particles[i].life <= 0) { particles[i].destroy(); particles.splice(i, 1); }
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].update(delta);
        if (floatingTexts[i].life <= 0) { floatingTexts[i].destroy(); floatingTexts.splice(i, 1); }
    }

    let shakeX = gameState.shakeIntensity > 0 ? (Math.random() - 0.5) * gameState.shakeIntensity : 0;
    let shakeY = gameState.shakeIntensity > 0 ? (Math.random() - 0.5) * gameState.shakeIntensity : 0;
    if (gameState.shakeIntensity > 0) gameState.shakeIntensity -= 0.3 * delta;

    const tCamX = window.innerWidth / 2 - player.x;
    const tCamY = window.innerHeight / 2 - player.y;

    gameLayer.x = lerp(gameLayer.x, tCamX, 0.1 * delta) + shakeX;
    gameLayer.y = lerp(gameLayer.y, tCamY, 0.1 * delta) + shakeY;
    backgroundLayer.x = lerp(backgroundLayer.x, tCamX * 0.3, 0.1 * delta);
    backgroundLayer.y = lerp(backgroundLayer.y, tCamY * 0.3, 0.1 * delta);

    player.updateVisualAnimations(gameState.age);
    cells.forEach(c => c.updateVisualAnimations(gameState.age));
});

// Premier lancement
prepareGame();
