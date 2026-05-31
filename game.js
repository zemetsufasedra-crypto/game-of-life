// ==========================================
// 🛡️ BOUCLIER ANTI-CRASH GLOBAL
// Affiche l'erreur en direct si le navigateur bloque
// ==========================================
window.addEventListener('error', (e) => {
    const errLog = document.getElementById('error-log');
    if (errLog) errLog.textContent = `CRASH: ${e.message} (Vide le cache CTRL+F5)`;
    console.error("Game Error:", e.message);
});

// ==========================================
// CONFIGURATION DU MONDE
// ==========================================
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1200;

// Création du moteur Pixi
const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x030307,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});

// Compatibilité absolue : Pixi v8 utilise app.canvas, Pixi v7 utilise app.view
const gameCanvas = app.canvas || app.view;
document.getElementById('game-container').appendChild(gameCanvas);

// Architecture par Calques
const backgroundLayer = new PIXI.Container();
const gameLayer = new PIXI.Container();
const uiLayer = new PIXI.Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(uiLayer);

let player = null;
let cells = [];
let particles = [];
let floatingTexts = []; // Nouvel ajout : Textes flottants
let nextMutationSize = 25;

let gameState = { paused: false, age: 0, shakeIntensity: 0 };
const MUTATION_LIMITS = { flagelle: 2, spike: 2, shield: 2, sizeburst: 1 };

let mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
});

// Utilitaires de couleurs et de maths
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
        oscillator.connect(gainNode);
        gainNode.connect(globalAudioCtx.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        gainNode.gain.setValueAtTime(0.1, globalAudioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, globalAudioCtx.currentTime + duration);
        oscillator.start(globalAudioCtx.currentTime);
        oscillator.stop(globalAudioCtx.currentTime + duration);
    } catch (e) { /* Mode silencieux sécurisé */ }
}

// ==========================================
// EFFETS VISUELS : TEXTES FLOTTANTS & PARTICULES
// ==========================================
class FloatingText {
    constructor(x, y, textStr, colorHex) {
        this.x = x;
        this.y = y;
        this.life = 40;
        try {
            // Stylisation version-agnostique
            this.txt = new PIXI.Text(textStr, { fontFamily: 'Arial', fontSize: 16, fontWeight: '900', fill: colorHex });
            this.txt.anchor.set(0.5);
            this.txt.x = this.x;
            this.txt.y = this.y;
            gameLayer.addChild(this.txt);
        } catch(e) { this.txt = null; }
    }
    update(delta) {
        this.life -= delta;
        this.y -= 1.5 * delta;
        if(this.txt) {
            this.txt.y = this.y;
            this.txt.alpha = Math.max(0, this.life / 40);
            this.txt.scale.set(1 + (40 - this.life) * 0.01);
        }
    }
    destroy() {
        if(this.txt) { gameLayer.removeChild(this.txt); this.txt.destroy(); }
    }
}

class Particle {
    constructor(x, y, colorHex) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 25;
        this.size = Math.random() * 4 + 2;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(colorHex);
        this.gfx.drawCircle(0, 0, this.size);
        this.gfx.endFill();
        gameLayer.addChild(this.gfx);
    }
    update(delta) {
        this.x += this.vx * delta; this.y += this.vy * delta;
        this.life -= delta;
        this.gfx.x = this.x; this.gfx.y = this.y;
        this.gfx.alpha = Math.max(0, this.life / 25);
    }
    destroy() {
        gameLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

// ==========================================
// CLASSE CELLULE
// ==========================================
class Cell {
    constructor(x, y, size, isPlayer = false) {
        this.x = x; this.y = y; this.size = size;
        this.isPlayer = isPlayer;
        this.vx = 0; this.vy = 0;
        this.speed = isPlayer ? 3.5 : Math.random() * 1.5 + 0.5;
        this.energy = size * 50;
        this.mutations = [];
        this.attackPower = 1; this.defense = 1;
        this.hp = size * 10;

        this.display = new PIXI.Container();
        this.colorHex = this.isPlayer ? 0x00ffcc : hslToHex((x + y) % 360, 75, 50);

        this.glowGfx = new PIXI.Graphics(); // Remplacement natif des filtres
        this.mutationsGfx = new PIXI.Graphics();
        this.bodyGfx = new PIXI.Graphics();

        this.display.addChild(this.glowGfx);
        this.display.addChild(this.mutationsGfx);
        this.display.addChild(this.bodyGfx);

        if (this.isPlayer) {
            try {
                this.label = new PIXI.Text('TOI', { fontFamily: 'Arial', fontSize: 13, fontWeight: 'bold', fill: '#00ffcc' });
                this.label.anchor.set(0.5);
                this.display.addChild(this.label);
                this.mutationLabel = new PIXI.Text('', { fontFamily: 'Arial', fontSize: 12, fill: '#ffffff' });
                this.mutationLabel.anchor.set(0.5);
                this.display.addChild(this.mutationLabel);
            } catch (e) { /* Protection contre les conflits de version d'API Texte */ }
        }

        this.refreshStaticDraws();
        gameLayer.addChild(this.display);
    }

    // Effet visuel natif hyper-optimisé (Sans plugin)
    drawNativeGlow(radius, color) {
        this.glowGfx.clear();
        for (let i = 5; i > 0; i--) {
            this.glowGfx.beginFill(color, 0.08);
            this.glowGfx.drawCircle(0, 0, radius + (i * 4));
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
        if (this.mutations.find(m => m.name === 'Spike')) {
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const x2 = Math.cos(angle) * (this.size + this.size * 0.5);
                const y2 = Math.sin(angle) * (this.size + this.size * 0.5);
                this.mutationsGfx.lineStyle(3, 0xff3355);
                this.mutationsGfx.moveTo(Math.cos(angle)*this.size, Math.sin(angle)*this.size);
                this.mutationsGfx.lineTo(x2, y2);
            }
        }

        if (this.isPlayer && this.label) {
            this.label.y = -this.size - 25;
            this.mutationLabel.y = -this.size - 8;
        }
    }

    updateVisualAnimations(age) {
        this.display.x = this.x; this.display.y = this.y;
        this.bodyGfx.scale.set(1 + Math.sin(age * 0.1) * 0.03); // Respiration
    }

    applyMutation(mutationName) {
        const mutations = {
            flagelle: { name: 'Flagelle', speed: 1.4 },
            spike: { name: 'Spike', attack: 1.4 },
            shield: { name: 'Shield', defense: 1.3 },
            sizeburst: { name: 'Grosse Bombe', size: 1.25 }
        };
        const m = mutations[mutationName];
        if (!m) return;
        this.mutations.push(m);
        if (m.speed) this.speed *= m.speed;
        if (m.attack) this.attackPower *= m.attack;
        if (m.defense) this.defense *= m.defense;
        if (m.size) this.size *= m.size;
        
        floatingTexts.push(new FloatingText(this.x, this.y, `+ ${m.name.toUpperCase()}`, '#ffff00'));
        this.refreshStaticDraws();
        
        if (this.isPlayer && this.mutationLabel) {
            const emojis = { 'Flagelle': '⚡', 'Spike': '🔪', 'Shield': '🛡️', 'Grosse Bombe': '💥' };
            this.mutationLabel.text = this.mutations.map(mu => emojis[mu.name] || '').join(' ');
        }
    }

    takeDamage(damage) {
        const actualDamage = damage / this.defense;
        this.hp -= actualDamage;
        if (this.isPlayer && actualDamage > 3) {
            gameState.shakeIntensity = 6;
            playSound(150, 0.1, 'square');
            floatingTexts.push(new FloatingText(this.x, this.y, "- AÏE", '#ff0000'));
        }
        for (let i = 0; i < 3; i++) particles.push(new Particle(this.x, this.y, 0xff3333));
        return this.hp > 0;
    }

    attackCell(other) {
        if (this.mutations.find(m => m.name === 'Spike')) other.takeDamage(this.size * 0.4 * this.attackPower);
    }

    update(delta) {
        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x + this.vx * this.speed * delta));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y + this.vy * this.speed * delta));
        this.energy -= this.speed * 0.01 * delta;
        return !(this.hp <= 0 || this.energy <= 0);
    }

    distanceTo(other) { return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2); }
    canEat(other) { return this.size > other.size * 1.15; }

    eat(other) {
        this.energy += other.size * 35;
        const growth = other.size * 0.25;
        this.size += growth;
        this.hp += other.size * 4;
        
        for (let i = 0; i < 8; i++) particles.push(new Particle(other.x, other.y, other.colorHex));
        playSound(450 + Math.random() * 200, 0.08);
        
        if (this.isPlayer) {
            floatingTexts.push(new FloatingText(other.x, other.y, "+ MIAM", '#00ffcc'));
        }
        this.refreshStaticDraws();
    }

    destroy() {
        gameLayer.removeChild(this.display);
        this.display.destroy({ children: true });
    }
}

// ==========================================
// INITIALISATION
// ==========================================
function initGame() {
    cells.forEach(c => c.destroy());
    particles.forEach(p => p.destroy());
    floatingTexts.forEach(f => f.destroy());
    backgroundLayer.removeChildren();

    cells = []; particles = []; floatingTexts = [];
    gameState.age = 0; nextMutationSize = 25; gameState.shakeIntensity = 0;

    player = new Cell(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 16, true);

    // Particules de fond
    for (let i = 0; i < 150; i++) {
        const dot = new PIXI.Graphics();
        dot.beginFill(0x00aaff, Math.random() * 0.3 + 0.1);
        dot.drawCircle(0, 0, Math.random() * 1.5 + 0.5);
        dot.endFill();
        dot.x = Math.random() * WORLD_WIDTH;
        dot.y = Math.random() * WORLD_HEIGHT;
        backgroundLayer.addChild(dot);
    }

    for (let i = 0; i < 40; i++) {
        cells.push(new Cell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, Math.random() * 8 + 6, false));
    }
}

function checkMutations() {
    if (player.size >= nextMutationSize) {
        const options = Object.keys(MUTATION_LIMITS).filter(mut => {
            const name = { flagelle: 'Flagelle', spike: 'Spike', shield: 'Shield', sizeburst: 'Grosse Bombe' }[mut];
            return player.mutations.filter(m => m.name === name).length < MUTATION_LIMITS[mut];
        });
        if (options.length > 0) {
            const modal = document.getElementById('mutationModal');
            const choices = document.getElementById('mutationChoices');
            choices.innerHTML = '';
            const labels = { flagelle: '⚡ Flagelle', spike: '🔪 Spike', shield: '🛡️ Shield', sizeburst: '💥 Bombe' };
            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'mutation-btn';
                btn.textContent = labels[opt];
                btn.onclick = () => {
                    player.applyMutation(opt);
                    playSound(800, 0.15, 'triangle');
                    modal.classList.add('hidden');
                    gameState.paused = false;
                };
                choices.appendChild(btn);
            });
            modal.classList.remove('hidden');
            gameState.paused = true;
            nextMutationSize += 15;
        }
    }
}

// ==========================================
// BOUCLE PRINCIPALE (GAME LOOP)
// ==========================================
app.ticker.add((delta) => {
    if (gameState.paused || !player) return;
    gameState.age += delta;

    // Déplacement Joueur
    const dx = mousePosition.x - window.innerWidth / 2;
    const dy = mousePosition.y - window.innerHeight / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 15) {
        player.vx = dx / dist; player.vy = dy / dist;
    } else {
        player.vx = 0; player.vy = 0;
    }

    player.update(delta);

    // Moteur IA et Collisions
    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        
        // IA basique de survie/chasse
        if (Math.random() < 0.02) {
            cell.vx = Math.random() * 2 - 1; cell.vy = Math.random() * 2 - 1;
        }

        if (!cell.update(delta)) {
            cell.destroy(); cells.splice(i, 1); continue;
        }

        // Joueur mange Cellule IA
        if (player.canEat(cell) && player.distanceTo(cell) < player.size + cell.size - 5) {
            player.eat(cell);
            cell.destroy(); cells.splice(i, 1); continue;
        }
        
        // Cellule IA mange Joueur
        if (cell.canEat(player) && cell.distanceTo(player) < cell.size + player.size - 5) {
            if (!player.takeDamage(cell.size)) {
                alert(`Game Over! Taille: ${Math.floor(player.size)}`);
                initGame(); return;
            }
        }
    }

    // Gestion des Particules & Textes
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(delta);
        if (particles[i].life <= 0) { particles[i].destroy(); particles.splice(i, 1); }
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].update(delta);
        if (floatingTexts[i].life <= 0) { floatingTexts[i].destroy(); floatingTexts.splice(i, 1); }
    }

    // Caméra Dynamique + Secousses
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

    checkMutations();

    // Mise à jour de l'interface
    const sEl = document.getElementById('size');
    const fEl = document.getElementById('fps');
    if (sEl) sEl.textContent = Math.floor(player.size);
    if (fEl) fEl.textContent = Math.round(app.ticker.FPS);
});

// Contrôles UI
document.getElementById('restartBtn')?.addEventListener('click', () => { initGame(); gameState.paused = false; document.getElementById('mutationModal').classList.add('hidden'); });
document.getElementById('pauseBtn')?.addEventListener('click', (e) => { gameState.paused = !gameState.paused; e.target.textContent = gameState.paused ? '▶️ Jouer' : '⏸️ Pause'; });

initGame();
