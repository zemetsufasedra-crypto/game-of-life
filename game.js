// ==========================================================================
// MOTEUR SPORE - BOSS, LOOT GÉNÉTIQUE, ENDURANCE X5 & 2.5D
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
const shadowLayer = new PIXI.Container();
const foodLayer = new PIXI.Container();
const gameLayer = new PIXI.Container();
const fxLayer = new PIXI.Container();
const lightingLayer = new PIXI.Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(shadowLayer);
app.stage.addChild(foodLayer);
app.stage.addChild(gameLayer);
app.stage.addChild(fxLayer);
app.stage.addChild(lightingLayer);

let player = null;
let cells = [];
let particles = [];
let footprints = [];
let nutrients = [];
let floatingTexts = [];
let soundWaves = [];

let nextMutationSize = 25; 
let playerColor = 0x00ffcc;
let playerDiet = 'herbivore';

let gameState = {
    paused: true,
    age: 0,
    shakeIntensity: 0,
    currentWorld: 1,
    cameraZoom: 1,
    isTerrestrial: false,
    bossActive: false,
    bossEntity: null
};

const WORLDS_CONFIG = {
    1: { name: "Surface", bg: 0x020714, density: 35, foodCount: 100, monsterScale: 1.0, terrestrial: false },
    2: { name: "Récif", bg: 0x011a24, density: 25, foodCount: 70, monsterScale: 1.5, terrestrial: false },
    3: { name: "Abysses", bg: 0x110217, density: 15, foodCount: 40, monsterScale: 2.2, terrestrial: false },
    4: { name: "Terre", bg: 0x202b1c, density: 20, foodCount: 60, monsterScale: 1.2, terrestrial: true }
};

const MUTATION_LIMITS = { flagelle: 2, spike: 2, shield: 2 };

// ==========================================================================
// CONTRÔLES 
// ==========================================================================
let mousePosition = { x: app.screen.width / 2, y: app.screen.height / 2 };
let isSprintKeyPressed = false;
let isSingingKeyPressed = false;

window.addEventListener('mousemove', (e) => { mousePosition.x = e.clientX; mousePosition.y = e.clientY; });
window.addEventListener('mousedown', () => { isSprintKeyPressed = true; });
window.addEventListener('mouseup', () => { isSprintKeyPressed = false; });
window.addEventListener('touchstart', () => { isSprintKeyPressed = true; });
window.addEventListener('touchend', () => { isSprintKeyPressed = false; });
window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 's') isSingingKeyPressed = true; });
window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 's') isSingingKeyPressed = false; });

// ==========================================================================
// OUTILS & FX
// ==========================================================================
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

class SoundWave {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.life = 60; this.radius = 10;
        this.gfx = new PIXI.Graphics(); this.color = color; fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.life -= delta; this.radius += 2 * delta;
        this.gfx.clear(); this.gfx.lineStyle(3, this.color, this.life / 60);
        this.gfx.drawCircle(0, 0, this.radius); this.gfx.x = this.x; this.gfx.y = this.y;
    }
    destroy() { fxLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

class FloatingText {
    constructor(x, y, text, color = 0xffffff) {
        this.x = x; this.y = y; this.life = 60;
        this.gfx = new PIXI.Text(text, { fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold', fill: color });
        this.gfx.anchor.set(0.5); this.gfx.x = this.x; this.gfx.y = this.y; fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.y -= 1.2 * delta; this.gfx.y = this.y; this.life -= delta;
        this.gfx.alpha = Math.max(0, this.life / 60);
    }
    destroy() { fxLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

class Particle {
    constructor(x, y, colorHex) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 6; this.vy = (Math.random() - 0.5) * 6;
        this.life = 20 + Math.random() * 15; this.size = Math.random() * 3 + 1;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(colorHex); this.gfx.drawCircle(0, 0, this.size); this.gfx.endFill(); fxLayer.addChild(this.gfx);
    }
    update(delta) {
        this.x += this.vx * delta; this.y += this.vy * delta; this.life -= delta;
        this.gfx.x = this.x; this.gfx.y = this.y; this.gfx.alpha = Math.max(0, this.life / 30);
    }
    destroy() { fxLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

class Footprint {
    constructor(x, y, size) {
        this.x = x; this.y = y; this.life = 120;
        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(0x000000, 0.4); this.gfx.drawEllipse(0, 0, size * 0.25, size * 0.15); this.gfx.endFill();
        this.gfx.x = this.x; this.gfx.y = this.y; backgroundLayer.addChild(this.gfx);
    }
    update(delta) { this.life -= delta; this.gfx.alpha = Math.max(0, this.life / 120); }
    destroy() { backgroundLayer.removeChild(this.gfx); this.gfx.destroy(); }
}

// ==========================================================================
// CLASSE CREATURE (AVEC SYSTÈME DE BOSS ET BUFFS)
// ==========================================================================
class Creature {
    constructor(x, y, size, isPlayer = false, diet = 'herbivore') {
        this.x = x; this.y = y; this.size = size;
        this.isPlayer = isPlayer; this.diet = diet;
        
        this.vx = 0; this.vy = 0;
        this.baseSpeed = isPlayer ? 4.0 : Math.random() * 1.5 + 0.8;
        this.speed = this.baseSpeed;
        
        this.hp = size * 10;
        this.maxHp = this.hp;
        this.maxStamina = 100; this.stamina = this.maxStamina; this.exhausted = false;
        
        this.isAlly = false; this.singCooldown = 0; this.buffTimer = 0;
        this.isBoss = false; this.targetWorld = 1;

        this.mutations = []; this.attackPower = 1; this.defense = 1;
        this.walkCycle = Math.random() * Math.PI * 2; 

        this.display = new PIXI.Container();
        this.shadowContainer = new PIXI.Container();
        this.colorHex = this.isPlayer ? playerColor : (this.diet === 'carnivore' ? 0xff4455 : 0x22cc77);

        this.shadowGfx = new PIXI.Graphics();
        this.legsGfx = new PIXI.Graphics();
        this.glowGfx = new PIXI.Graphics();
        this.flagellaGfx = new PIXI.Graphics();
        this.shieldGfx = new PIXI.Graphics();
        this.spikesGfx = new PIXI.Graphics();
        this.bodyGfx = new PIXI.Graphics();
        this.eyesGfx = new PIXI.Graphics();
        this.uiGfx = new PIXI.Graphics();

        this.shadowContainer.addChild(this.shadowGfx);
        this.display.addChild(this.glowGfx);
        this.display.addChild(this.legsGfx);
        this.display.addChild(this.flagellaGfx);
        this.display.addChild(this.shieldGfx);
        this.display.addChild(this.spikesGfx);
        this.display.addChild(this.bodyGfx);
        this.display.addChild(this.eyesGfx);
        this.display.addChild(this.uiGfx);

        if (this.isPlayer) {
            const nativeBlur = new PIXI.BlurFilter();
            nativeBlur.blur = 12;
            this.glowGfx.filters = [nativeBlur];
        }

        this.refreshStaticDraws();
        shadowLayer.addChild(this.shadowContainer);
        gameLayer.addChild(this.display);
    }

    refreshStaticDraws() {
        this.bodyGfx.clear();
        this.bodyGfx.beginFill(this.colorHex, 0.9);
        if (gameState.isTerrestrial) this.bodyGfx.drawEllipse(0, 0, this.size, this.size * 0.8);
        else this.bodyGfx.drawCircle(0, 0, this.size);
        this.bodyGfx.endFill();

        this.glowGfx.clear();
        if (this.isPlayer || this.isAlly || this.isBoss) {
            let auraColor = this.isAlly ? 0xff66cc : this.colorHex;
            if (this.isBoss) auraColor = 0xff0000;
            this.glowGfx.beginFill(auraColor, this.isBoss ? 0.6 : 0.4);
            this.glowGfx.drawCircle(0, 0, this.size + (this.isBoss ? 25 : 15));
            this.glowGfx.endFill();
        }

        this.spikesGfx.clear();
        if (this.mutations.find(m => m.name === 'Spike') || this.isBoss || (!this.isPlayer && this.diet === 'carnivore' && Math.random() < 0.5)) {
            const numSpikes = this.isBoss ? 12 : (gameState.isTerrestrial ? 4 : 6);
            this.spikesGfx.lineStyle(this.isBoss ? 5 : 3, 0xffbb00, 0.9);
            for (let i = 0; i < numSpikes; i++) {
                const angle = (i / numSpikes) * Math.PI * 2;
                this.spikesGfx.moveTo(Math.cos(angle) * this.size, Math.sin(angle) * this.size);
                this.spikesGfx.lineTo(Math.cos(angle) * (this.size + (this.isBoss ? 18 : 12)), Math.sin(angle) * (this.size + (this.isBoss ? 18 : 12)));
            }
        }
    }

    updateVisualAnimations(age, delta = 1) {
        this.shadowContainer.x = this.x; this.shadowContainer.y = this.y;
        this.display.x = this.x; this.display.y = this.y;

        const isMoving = Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1;
        const angleDir = Math.atan2(this.vy, this.vx);

        // Flash de couleur si buff Furie actif
        if (this.buffTimer > 0) {
            this.glowGfx.tint = Math.random() > 0.5 ? 0xff00ff : 0xffffff;
        } else {
            this.glowGfx.tint = 0xffffff;
        }

        if (gameState.isTerrestrial) {
            this.shadowGfx.clear();
            this.shadowGfx.beginFill(0x000000, 0.5);
            this.shadowGfx.drawEllipse(0, this.size * 0.5, this.size * 1.1, this.size * 0.6);
            this.shadowGfx.endFill();

            if (isMoving) {
                this.walkCycle += (this.speed * 0.05) * delta;
                this.display.pivot.y = Math.abs(Math.sin(this.walkCycle)) * 8;
                if (Math.random() < 0.15) footprints.push(new Footprint(this.x, this.y + this.size * 0.5, this.size));
            } else {
                this.display.pivot.y = lerp(this.display.pivot.y, 0, 0.2);
            }

            this.legsGfx.clear(); this.flagellaGfx.clear();
            const numLegs = this.isBoss ? 6 : 4;
            this.legsGfx.lineStyle(this.isBoss ? 6 : 4, 0x111111, 0.9);
            for(let i=0; i<numLegs; i++) {
                const phase = this.walkCycle + (i * Math.PI / (numLegs/2));
                const isLeft = i % 2 === 0;
                const baseX = (isLeft ? -this.size : this.size) * 0.6;
                const baseY = this.size * 0.2;
                const stride = isMoving ? (this.isBoss ? 25 : 15) : 0;
                const footX = baseX + Math.cos(phase) * stride;
                const footY = baseY + this.size * 0.8 + Math.max(0, Math.sin(phase)) * 12;
                const kneeX = baseX + (footX - baseX)/2 + (isLeft ? -12 : 12);
                const kneeY = baseY + (footY - baseY)/2 - 8;

                this.legsGfx.moveTo(baseX, baseY);
                this.legsGfx.lineTo(kneeX, kneeY);
                this.legsGfx.lineTo(footX, footY);
                this.legsGfx.beginFill(0x222222); this.legsGfx.drawCircle(footX, footY, this.isBoss ? 6 : 4); this.legsGfx.endFill();
            }
        } else {
            this.shadowGfx.clear(); this.legsGfx.clear(); this.display.pivot.y = 0;
            const pulse = 1 + Math.sin(age * 0.05 + this.x) * 0.03;
            this.bodyGfx.scale.set(pulse);

            this.flagellaGfx.clear();
            if (this.mutations.find(m => m.name === 'Flagelle') || this.isBoss || (!this.isPlayer && this.speed > 1.2)) {
                this.flagellaGfx.lineStyle(this.isBoss ? 5 : 3, this.colorHex, 0.6);
                const tailAngle = angleDir + Math.PI + Math.sin(age * 0.2) * 0.4;
                this.flagellaGfx.moveTo(Math.cos(angleDir + Math.PI) * this.size, Math.sin(angleDir + Math.PI) * this.size);
                this.flagellaGfx.lineTo(Math.cos(tailAngle) * (this.size + (this.isBoss ? 40 : 22)), Math.sin(tailAngle) * (this.size + (this.isBoss ? 40 : 22)));
            }
        }

        this.eyesGfx.clear();
        const lookAngle = isMoving ? angleDir : Math.sin(age * 0.02) * 0.5;
        const drawEye = (side) => {
            const eyeAngle = lookAngle + (side * 0.6);
            const ex = Math.cos(eyeAngle) * (this.size * 0.65);
            const ey = Math.sin(eyeAngle) * (this.size * 0.65);
            this.eyesGfx.beginFill(this.isBoss ? 0xff0000 : 0xffffff); this.eyesGfx.drawCircle(ex, ey, this.size * 0.3); this.eyesGfx.endFill();
            const px = ex + Math.cos(lookAngle) * (this.size * 0.1);
            const py = ey + Math.sin(lookAngle) * (this.size * 0.1);
            this.eyesGfx.beginFill(0x010206); this.eyesGfx.drawCircle(px, py, this.size * 0.14); this.eyesGfx.endFill();
        };
        drawEye(-1); drawEye(1);

        this.uiGfx.clear();
        if (this.isPlayer) {
            const barW = 50;
            this.uiGfx.beginFill(0x333333, 0.8); this.uiGfx.drawRect(-barW/2, -this.size - 25, barW, 5);
            this.uiGfx.beginFill(this.exhausted ? 0xff3333 : 0x00ffcc, 0.9);
            this.uiGfx.drawRect(-barW/2, -this.size - 25, barW * (this.stamina / this.maxStamina), 5);
        } else if (this.isAlly) {
            this.uiGfx.beginFill(0xff66cc); this.uiGfx.drawPolygon([-5, -this.size-20, 5, -this.size-20, 0, -this.size-15]);
        } else if (this.isBoss) {
            // Barre de vie du Boss
            const barW = 100;
            this.uiGfx.beginFill(0x000000, 0.8); this.uiGfx.drawRect(-barW/2, -this.size - 30, barW, 8);
            this.uiGfx.beginFill(0xff0000, 0.9); this.uiGfx.drawRect(-barW/2, -this.size - 30, barW * (this.hp / this.maxHp), 8);
        }
    }

    applyMutation(mutationName) {
        const config = { flagelle: { name: 'Flagelle', speed: 1.3 }, spike: { name: 'Spike', attack: 1.5 }, shield: { name: 'Shield', defense: 1.4 } };
        const m = config[mutationName];
        if (!m) return;
        this.mutations.push(m);
        if (m.speed) this.baseSpeed *= m.speed;
        if (m.attack) this.attackPower *= m.attack;
        if (m.defense) this.defense *= m.defense;
        this.refreshStaticDraws();
    }

    takeDamage(damage) {
        if (this.buffTimer > 0) return true; // Invincible pendant le buff
        const netDamage = Math.max(1, damage / this.defense);
        this.hp -= netDamage;
        if (this.isPlayer) {
            gameState.shakeIntensity = 8; playSound(120, 0.2, 'sawtooth');
            floatingTexts.push(new FloatingText(this.x, this.y - 20, `-${Math.round(netDamage)} PV`, 0xff3333));
        }
        for (let i = 0; i < 5; i++) particles.push(new Particle(this.x, this.y, 0xff4444));
        return this.hp > 0;
    }

    update(delta) {
        if (this.isPlayer) {
            // GESTION DU BUFF FURIE (Loot Mutagène)
            if (this.buffTimer > 0) {
                this.buffTimer -= delta;
                this.speed = this.baseSpeed * 2.5; // Rapide sans épuiser l'endurance
            } else {
                // CORRECTION DES MATHÉMATIQUES D'ENDURANCE (Sprint long)
                if (isSprintKeyPressed && !this.exhausted) {
                    this.speed = this.baseSpeed * 1.8;
                    this.stamina -= 0.6 * delta; // Consommation très faible (5 secondes de course)
                    if (gameState.isTerrestrial && Math.random() < 0.3) particles.push(new Particle(this.x, this.y + this.size, 0x554433));
                    if (this.stamina <= 0) {
                        this.stamina = 0; this.exhausted = true;
                        floatingTexts.push(new FloatingText(this.x, this.y - 30, "ESSOUFFLÉ", 0xff3333));
                    }
                } else {
                    this.speed = this.exhausted ? this.baseSpeed * 0.5 : this.baseSpeed;
                    this.stamina += 0.8 * delta; // Recharge rapide au repos
                    if (this.stamina >= this.maxStamina) { this.stamina = this.maxStamina; this.exhausted = false; }
                }
            }

            if (isSingingKeyPressed && this.singCooldown <= 0) {
                this.singCooldown = 30;
                soundWaves.push(new SoundWave(this.x, this.y, this.colorHex));
                playSound(800, 0.2, 'triangle');
                cells.forEach(cell => {
                    if (!cell.isAlly && !cell.isBoss && cell.diet === this.diet && this.distanceTo(cell) < 200) {
                        cell.isAlly = true;
                        floatingTexts.push(new FloatingText(cell.x, cell.y - 30, "💖 ALLIÉ", 0xff66cc));
                        playSound(1200, 0.3, 'sine');
                        cell.refreshStaticDraws();
                    }
                });
            }
            if (this.singCooldown > 0) this.singCooldown -= delta;
        }

        if (this.isAlly && player) {
            const distToPlayer = this.distanceTo(player);
            if (distToPlayer > 100) {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                this.vx = Math.cos(angle); this.vy = Math.sin(angle);
            } else {
                this.vx = 0; this.vy = 0;
            }
        }

        if (this.isBoss && player) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            this.vx = Math.cos(angle); this.vy = Math.sin(angle);
        }

        this.x += this.vx * this.speed * delta;
        this.y += this.vy * this.speed * delta;
        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));
    }

    distanceTo(other) { return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2); }
    canEat(other) { return this.size > other.size * 1.1; }

    eat(other) {
        this.size += other.size * (gameState.isTerrestrial ? 0.08 : 0.12);
        this.maxHp = this.size * 10;
        this.hp = Math.min(this.maxHp, this.hp + other.size * 3);
        for (let i = 0; i < 6; i++) particles.push(new Particle(other.x, other.y, other.colorHex));
        if (this.isPlayer) {
            playSound(520, 0.08, 'sine');
            floatingTexts.push(new FloatingText(this.x, this.y - 30, `+${Math.floor(other.size)} ADN`, 0x00ffcc));
        }
        this.refreshStaticDraws();
    }

    destroy() {
        shadowLayer.removeChild(this.shadowContainer); gameLayer.removeChild(this.display);
        this.shadowContainer.destroy({ children: true }); this.display.destroy({ children: true });
    }
}

// ==========================================================================
// MÉCANIQUES D'APPARITION : NUTRIMENTS & BOSS
// ==========================================================================
function spawnNutrient() {
    const cfg = WORLDS_CONFIG[gameState.currentWorld];
    if (nutrients.length >= cfg.foodCount) return;
    const nGfx = new PIXI.Graphics();
    const isMutagen = Math.random() < 0.03; // Cristal rare (Furie)
    const rare = Math.random() < 0.15;
    let radius = isMutagen ? 6 : (rare ? 4 : 2.5);

    if (isMutagen) {
        nGfx.beginFill(0xff00ff, 1); nGfx.drawPolygon([0, -radius, radius, 0, 0, radius, -radius, 0]); // Losange
    } else if (gameState.isTerrestrial) {
        nGfx.beginFill(rare ? 0xffaa00 : 0x22aa33, 0.9);
        nGfx.drawCircle(0, -radius, radius); nGfx.drawCircle(-radius, radius, radius); nGfx.drawCircle(radius, radius, radius);
    } else {
        nGfx.beginFill(rare ? 0xffd700 : 0x00bfff, 0.8); nGfx.drawCircle(0, 0, radius);
    }
    nGfx.endFill(); nGfx.x = Math.random() * WORLD_WIDTH; nGfx.y = Math.random() * WORLD_HEIGHT;
    foodLayer.addChild(nGfx); nutrients.push({ gfx: nGfx, x: nGfx.x, y: nGfx.y, r: radius*1.5, mutagen: isMutagen, rare: rare });
}

function spawnBoss(targetWorld) {
    gameState.bossActive = true;
    gameState.shakeIntensity = 25; playSound(100, 1.5, 'sawtooth');
    floatingTexts.push(new FloatingText(player.x, player.y - 60, "⚠️ PRÉDATEUR ALPHA DÉTECTÉ ⚠️", 0xff0000));
    
    const boss = new Creature(player.x + 600, player.y + 600, player.size * 1.8, false, 'carnivore');
    boss.isBoss = true; boss.targetWorld = targetWorld;
    boss.baseSpeed = player.baseSpeed * 0.95; // Un peu plus lent pour pouvoir le fuir/kiter
    boss.maxHp = boss.size * 25; boss.hp = boss.maxHp;
    cells.push(boss);
    gameState.bossEntity = boss;
}

function transitionToWorld(targetWorld) {
    gameState.currentWorld = targetWorld;
    const cfg = WORLDS_CONFIG[targetWorld];
    gameState.isTerrestrial = cfg.terrestrial;
    
    app.renderer.backgroundColor = 0xffffff;
    setTimeout(() => { app.renderer.backgroundColor = cfg.bg; }, 150);

    gameState.shakeIntensity = 20; playSound(150, 0.8, 'sawtooth');
    floatingTexts.push(new FloatingText(player.x, player.y - 50, gameState.isTerrestrial ? "ÉMERGENCE TERRESTRE !" : `STRATE : ${cfg.name.toUpperCase()}`, 0xffffff));

    if (targetWorld === 2) gameState.cameraZoom = 0.7;
    if (targetWorld === 3) gameState.cameraZoom = 0.45;
    if (targetWorld === 4) { gameState.cameraZoom = 0.8; player.size = 25; player.refreshStaticDraws(); }

    cells.forEach(c => { if (!c.isAlly) c.destroy(); }); cells = cells.filter(c => c.isAlly); // Garder ses alliés !
    nutrients.forEach(n => { foodLayer.removeChild(n.gfx); n.gfx.destroy(); }); nutrients = [];
    backgroundLayer.removeChildren(); footprints = [];

    for (let i = 0; i < 150; i++) {
        const dot = new PIXI.Graphics();
        if (gameState.isTerrestrial) {
            dot.beginFill(Math.random() > 0.5 ? 0x112211 : 0x2a2a2a, 0.5); dot.drawPolygon([-3, 5, 0, -5, 3, 5]);
        } else {
            dot.beginFill(0x223355, Math.random() * 0.3); dot.drawCircle(0, 0, Math.random() * 3 + 1);
        }
        dot.endFill(); dot.x = Math.random() * WORLD_WIDTH; dot.y = Math.random() * WORLD_HEIGHT;
        backgroundLayer.addChild(dot);
    }

    for (let i = 0; i < cfg.density; i++) {
        const diet = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
        const enemySize = (Math.random() * 10 + 8) * cfg.monsterScale;
        cells.push(new Creature(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, enemySize, false, diet));
    }
}

function initGame() {
    cells.forEach(c => c.destroy()); particles.forEach(p => p.destroy()); floatingTexts.forEach(t => t.destroy());
    soundWaves.forEach(sw => sw.destroy());
    nutrients.forEach(n => { foodLayer.removeChild(n.gfx); n.gfx.destroy(); }); backgroundLayer.removeChildren();
    footprints.forEach(f => f.destroy());

    cells = []; particles = []; nutrients = []; floatingTexts = []; footprints = []; soundWaves = [];
    gameState.age = 0; gameState.currentWorld = 1; gameState.cameraZoom = 1; nextMutationSize = 22;
    gameState.isTerrestrial = false; gameState.bossActive = false; gameState.bossEntity = null;

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
// TICKER PRINCIPAL (BOUCLE DU MOTEUR)
// ==========================================================================
let lightingOverlay = new PIXI.Graphics();
lightingLayer.addChild(lightingOverlay);

app.ticker.add((delta) => {
    if (gameState.paused || !player) return;
    gameState.age += delta;

    const dx = mousePosition.x - (app.screen.width / 2);
    const dy = mousePosition.y - (app.screen.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 15) { player.vx = dx / dist; player.vy = dy / dist; } 
    else { player.vx = 0; player.vy = 0; }
    
    player.update(delta);
    if (Math.random() < 0.06 * delta) spawnNutrient();

    // Collision Nourriture (Le Mutagène est mangeable par tous les régimes)
    for (let i = nutrients.length - 1; i >= 0; i--) {
        const n = nutrients[i];
        if (player.distanceTo(n) < player.size + n.r) {
            if (n.mutagen) {
                player.buffTimer = 300; // 5 secondes de Mode Furie
                floatingTexts.push(new FloatingText(n.x, n.y, "FUREUR MUTAGÈNE !", 0xff00ff));
                playSound(900, 0.5, 'square');
            } else if (player.diet === 'herbivore') {
                player.size += n.rare ? (gameState.isTerrestrial ? 0.3 : 0.5) : 0.15;
                player.hp = Math.min(player.size * 10, player.hp + 2);
                floatingTexts.push(new FloatingText(n.x, n.y, n.rare ? '+3 ADN' : '+1 ADN', 0x00ffaa));
                playSound(550, 0.04, 'sine');
            } else { continue; } // Carnivores ignorent les plantes normales
            
            foodLayer.removeChild(n.gfx); n.gfx.destroy(); nutrients.splice(i, 1);
            player.refreshStaticDraws();
        }
    }

    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];

        if (!cell.isAlly && !cell.isBoss && Math.random() < 0.02 * delta) {
            if (cell.diet === 'carnivore' && cell.distanceTo(player) < 400 && cell.size > player.size) {
                const cdx = player.x - cell.x; const cdy = player.y - cell.y;
                const clen = Math.sqrt(cdx*cdx + cdy*cdy);
                cell.vx = cdx / clen; cell.vy = cdy / clen;
            } else {
                cell.vx = Math.random() * 2 - 1; cell.vy = Math.random() * 2 - 1;
            }
        }
        cell.update(delta);

        if (cell.isAlly) {
            cells.forEach(enemy => {
                if (!enemy.isAlly && enemy.diet === 'carnivore' && cell.distanceTo(enemy) < 150) {
                    if (cell.mutations.find(m => m.name === 'Spike')) enemy.takeDamage(cell.size * 0.15);
                }
            });
        }

        const gap = player.distanceTo(cell);
        if (gap < player.size + cell.size && !cell.isAlly) {
            // Le joueur mange (Instakill si plus gros, ou inflige dégâts au boss)
            if (player.diet === 'carnivore' && player.size > cell.size * 1.1) {
                player.eat(cell); cell.destroy(); cells.splice(i, 1); continue;
            } else if (player.buffTimer > 0) {
                // Instakill sous effet Mutagène même si plus petit
                cell.takeDamage(1000); 
                if (cell.hp <= 0) { cell.destroy(); cells.splice(i, 1); continue; }
            }

            // L'ennemi attaque le joueur
            if (cell.size > player.size * 1.1 && cell.diet === 'carnivore') {
                if (!player.takeDamage(cell.size * 0.4)) {
                    alert(`FIN DE PARTIE : Assimilé dans la strate "${WORLDS_CONFIG[gameState.currentWorld].name}".`);
                    document.getElementById('dietModal').classList.remove('hidden');
                    gameState.paused = true; return;
                }
            } else if (!player.canEat(cell) && !cell.canEat(player)) {
                if (player.mutations.find(m => m.name === 'Spike')) cell.takeDamage(player.size * 0.2);
            }
        }

        // Mort du Boss = Passage au monde suivant !
        if (cell.isBoss && cell.hp <= 0) {
            const nextW = cell.targetWorld;
            cell.destroy(); cells.splice(i, 1);
            gameState.bossActive = false; gameState.bossEntity = null;
            transitionToWorld(nextW);
        } else if (cell.hp <= 0 && !cell.isPlayer) {
            cell.destroy(); cells.splice(i, 1);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(delta); if (particles[i].life <= 0) { particles[i].destroy(); particles.splice(i, 1); } }
    for (let i = floatingTexts.length - 1; i >= 0; i--) { floatingTexts[i].update(delta); if (floatingTexts[i].life <= 0) { floatingTexts[i].destroy(); floatingTexts.splice(i, 1); } }
    for (let i = footprints.length - 1; i >= 0; i--) { footprints[i].update(delta); if (footprints[i].life <= 0) { footprints[i].destroy(); footprints.splice(i, 1); } }
    for (let i = soundWaves.length - 1; i >= 0; i--) { soundWaves[i].update(delta); if (soundWaves[i].life <= 0) { soundWaves[i].destroy(); soundWaves.splice(i, 1); } }

    lightingOverlay.clear();
    if (gameState.isTerrestrial) {
        const dayPhase = Math.sin(gameState.age * 0.001);
        const darknessOpacity = Math.max(0, dayPhase) * 0.75;
        lightingOverlay.beginFill(0x000015, darknessOpacity);
        lightingOverlay.drawRect(0, 0, app.screen.width, app.screen.height);
        lightingOverlay.endFill();
    } else {
        const rayOffset = (gameState.age * 1.5) % app.screen.width;
        lightingOverlay.beginFill(0x88ccff, 0.04);
        for(let i=0; i<6; i++) {
            const rx = ((i * 350) + rayOffset) % app.screen.width;
            lightingOverlay.drawPolygon([rx, 0, rx+100, 0, rx-150, app.screen.height, rx-250, app.screen.height]);
        }
        lightingOverlay.endFill();
    }

    // Caméra avec inertie (Juiciness)
    let sx = (Math.random() - 0.5) * gameState.shakeIntensity; let sy = (Math.random() - 0.5) * gameState.shakeIntensity;
    if (gameState.shakeIntensity > 0) gameState.shakeIntensity -= 0.3 * delta;

    // Zoom arrière si le joueur sprinte pour accentuer la vitesse
    const targetZoom = (isSprintKeyPressed && !player.exhausted) ? gameState.cameraZoom * 0.9 : gameState.cameraZoom;
    gameLayer.scale.set(lerp(gameLayer.scale.x, targetZoom, 0.05 * delta));
    
    const tx = (app.screen.width / 2) - player.x * gameLayer.scale.x;
    const ty = (app.screen.height / 2) - player.y * gameLayer.scale.y;

    gameLayer.x = lerp(gameLayer.x, tx, 0.06 * delta) + sx; gameLayer.y = lerp(gameLayer.y, ty, 0.06 * delta) + sy;
    shadowLayer.x = gameLayer.x; shadowLayer.y = gameLayer.y; shadowLayer.scale.set(gameLayer.scale.x);
    foodLayer.x = gameLayer.x; foodLayer.y = gameLayer.y; foodLayer.scale.set(gameLayer.scale.x);
    fxLayer.x = gameLayer.x; fxLayer.y = gameLayer.y; fxLayer.scale.set(gameLayer.scale.x);
    backgroundLayer.x = gameLayer.x * (gameState.isTerrestrial ? 0.8 : 0.2); backgroundLayer.y = gameLayer.y * (gameState.isTerrestrial ? 0.8 : 0.2);

    player.updateVisualAnimations(gameState.age, delta);
    cells.forEach(c => c.updateVisualAnimations(gameState.age, delta));

    document.getElementById('size').textContent = `${Math.floor(player.size)} (${WORLDS_CONFIG[gameState.currentWorld].name})`;
    document.getElementById('population').textContent = cells.length;
    document.getElementById('fps').textContent = Math.round(app.ticker.FPS);

    // Apparition du BOSS (Au lieu de changer de monde automatiquement)
    if (!gameState.bossActive) {
        if (gameState.currentWorld === 1 && player.size >= 32) spawnBoss(2);
        else if (gameState.currentWorld === 2 && player.size >= 50) spawnBoss(3);
        else if (gameState.currentWorld === 3 && player.size >= 75) spawnBoss(4);
    }

    if (player.size >= nextMutationSize && !gameState.bossActive) {
        gameState.paused = true;
        const modal = document.getElementById('mutationModal');
        const choices = document.getElementById('mutationChoices');
        if (modal && choices) {
            choices.innerHTML = '';
            const available = Object.keys(MUTATION_LIMITS).filter(k => player.mutations.filter(m => m.name.toLowerCase() === k).length < MUTATION_LIMITS[k]);
            if (available.length === 0) { nextMutationSize += 15; gameState.paused = false; return; }

            const labels = {
                flagelle: gameState.isTerrestrial ? '⚡ Pattes Musclées (+30% Vitesse)' : '⚡ Cils Flagellés (+30% Vitesse hydrodynamique)',
                spike: '🔪 Pointes Cornues (Contre-attaques)',
                shield: '🛡️ Peau Épaisse (+40% Résistance)'
            };
            available.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'mutation-btn';
                btn.textContent = labels[opt];
                btn.addEventListener('click', () => {
                    player.applyMutation(opt); playSound(650, 0.15, 'sine');
                    modal.classList.add('hidden'); gameState.paused = false; nextMutationSize += 15;
                });
                choices.appendChild(btn);
            });
            modal.classList.remove('hidden');
        }
    }
});

document.getElementById('btn-herbivore').addEventListener('click', () => { playerColor = 0x00ffcc; playerDiet = 'herbivore'; document.getElementById('dietModal').classList.add('hidden'); initGame(); gameState.paused = false; });
document.getElementById('btn-carnivore').addEventListener('click', () => { playerColor = 0xff1e56; playerDiet = 'carnivore'; document.getElementById('dietModal').classList.add('hidden'); initGame(); gameState.paused = false; });
document.getElementById('restartBtn').addEventListener('click', () => { document.getElementById('dietModal').classList.remove('hidden'); document.getElementById('mutationModal').classList.add('hidden'); gameState.paused = true; });
const pBtn = document.getElementById('pauseBtn');
if (pBtn) pBtn.addEventListener('click', () => { if (!document.getElementById('dietModal').classList.contains('hidden')) return; gameState.paused = !gameState.paused; pBtn.textContent = gameState.paused ? '▶️ Jouer' : '⏸️ Pause'; });
