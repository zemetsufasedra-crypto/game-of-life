// =============================================================================
// MOTEUR SPORE WEB : PHASE CELLULAIRE & ÉVOLUTION UNIFIÉE
// Architecture WebGL Haute Performance - Version Professionnelle Complète
// =============================================================================

// --- CONFIGURATION DE L'ESPACE DE JEU ---
const WORLD_WIDTH = 3500;
const WORLD_HEIGHT = 2200;

// Initialisation du moteur PixiJS avec accélération matérielle
const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x020205, // Profondeur abyssale sombre
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});

// Injection du canvas dans l'interface
const gameCanvas = app.canvas || app.view;
document.getElementById('game-container').appendChild(gameCanvas);

// --- ARCHITECTURE DES CALQUES (LAYERS) ---
const backgroundLayer = new PIXI.Container();
const particleLayer = new PIXI.Container();
const foodLayer = new PIXI.Container();
const creatureLayer = new PIXI.Container();
const fxLayer = new PIXI.Container();

app.stage.addChild(backgroundLayer);
app.stage.addChild(particleLayer);
app.stage.addChild(foodLayer);
app.stage.addChild(creatureLayer);
app.stage.addChild(fxLayer);

// --- VARIABLES D'ÉTAT GLOBALES ---
let player = null;
let cells = [];
let plants = [];
let particles = [];
let floatingTexts = [];
let ambientDust = [];
let familyTree = [];

let gameState = {
    paused: true,
    age: 0,
    shakeIntensity: 0,
    generationCount: 1
};

// Configuration du catalogue de mutations
const SHOP_ITEMS = {
    flagelle: { name: 'Flagelle Propulseur', cost: 15, max: 3, speed: 1.25, emoji: '⚡', desc: 'Augmente la vitesse de déplacement.' },
    spike: { name: 'Épine Perforante', cost: 20, max: 4, attack: 1.4, emoji: '🔪', desc: 'Inflige de lourds dégâts de contact.' },
    shield: { name: 'Membrane Renforcée', cost: 25, max: 2, defense: 1.35, emoji: '🛡️', desc: 'Réduit les dégâts subis.' },
    cilia: { name: 'Cils Vibratiles', cost: 30, max: 2, agility: 1.3, emoji: '🧬', desc: 'Améliore la maniabilité et le sillage.' }
};

// Capture des coordonnées de la souris
let mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX;
    mousePosition.y = e.clientY;
});

// --- OUTILS MATHÉMATIQUES & CONVERSION ---
function lerp(start, end, amount) {
    return (1 - amount) * start + amount * end;
}

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

function getDistance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// =============================================================================
// SYNTHÉTISEUR AUDIO INTÉGRÉ (Web Audio API - Zéro Fichier Externe)
// =============================================================================
let audioCtx = null;
function playSynthesizedSound(freq, duration, type = 'sine', volume = 0.1) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.warn("Audio non supporté ou bloqué par le navigateur.");
    }
}

// =============================================================================
// SYSTEME DE PARTICULES ET EFFETS VISUELS ADVANCÉS
// =============================================================================
class AmbientDust {
    constructor() {
        this.gfx = new PIXI.Graphics();
        this.x = Math.random() * WORLD_WIDTH;
        this.y = Math.random() * WORLD_HEIGHT;
        this.size = Math.random() * 2 + 1;
        this.depth = Math.random() * 0.5 + 0.2; // Effet parallaxe de profondeur
        this.alpha = Math.random() * 0.4 + 0.1;
        
        this.gfx.beginFill(0x77aaff, this.alpha);
        this.gfx.drawCircle(0, 0, this.size);
        this.gfx.endFill();
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        backgroundLayer.addChild(this.gfx);
    }
    update(age) {
        this.gfx.y += Math.sin(age * 0.02 + this.x) * 0.1;
    }
    destroy() {
        backgroundLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

class VisualParticle {
    constructor(x, y, colorHex, isTrail = false) {
        this.x = x;
        this.y = y;
        this.life = isTrail ? 25 : 35;
        this.maxLife = this.life;
        this.isTrail = isTrail;
        this.vx = (Math.random() - 0.5) * (isTrail ? 1 : 5);
        this.vy = (Math.random() - 0.5) * (isTrail ? 1 : 5);
        this.size = Math.random() * 3 + 2;

        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(colorHex, 0.7);
        this.gfx.drawCircle(0, 0, this.size);
        this.gfx.endFill();
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        particleLayer.addChild(this.gfx);
    }
    update(delta) {
        this.x += this.vx * delta;
        this.y += this.vy * delta;
        this.life -= delta;
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.alpha = Math.max(0, this.life / this.maxLife);
        if (this.isTrail) {
            this.gfx.scale.set(this.life / this.maxLife);
        }
    }
    destroy() {
        particleLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

class FloatingText {
    constructor(x, y, textStr, colorHex) {
        this.x = x;
        this.y = y;
        this.life = 45;
        this.txt = new PIXI.Text(textStr, {
            fontFamily: 'Segoe UI',
            fontSize: 15,
            fontWeight: 'bold',
            fill: colorHex,
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowBlur: 3,
            dropShadowDistance: 2
        });
        this.txt.anchor.set(0.5);
        this.txt.x = this.x;
        this.txt.y = this.y;
        fxLayer.addChild(this.txt);
    }
    update(delta) {
        this.life -= delta;
        this.y -= 1.2 * delta;
        this.txt.y = this.y;
        this.txt.alpha = Math.max(0, this.life / 45);
    }
    destroy() {
        fxLayer.removeChild(this.txt);
        this.txt.destroy();
    }
}

// =============================================================================
// BIOLOGIE VEGETALE : FLORE INTERACTIVE (HERBIVORE ONLY)
// =============================================================================
class BioluminescentPlant {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 6;
        this.pulseSeed = Math.random() * 100;
        this.gfx = new PIXI.Graphics();
        this.drawPlant();
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        
        // Effet lueur de la flore sauvage
        this.gfx.filters = [new PIXI.filters.GlowFilter({ distance: 10, outerStrength: 1.5, color: 0x33ff66 })];
        foodLayer.addChild(this.gfx);
    }
    drawPlant() {
        this.gfx.clear();
        this.gfx.beginFill(0x22cc55, 0.85);
        this.gfx.lineStyle(1.5, 0x99ffaa, 0.6);
        // Forme de feuille organique complexe spirale micro-cellulaire
        this.gfx.moveTo(0, -this.size * 1.5);
        this.gfx.quadraticCurveTo(this.size, -this.size, this.size * 0.5, this.size);
        this.gfx.quadraticCurveTo(0, this.size * 0.5, -this.size * 0.5, this.size);
        this.gfx.quadraticCurveTo(-this.size, -this.size, 0, -this.size * 1.5);
        this.gfx.endFill();
        
        // Noyau lumineux central
        this.gfx.beginFill(0xaaffcc, 1);
        this.gfx.drawCircle(0, 0, this.size * 0.3);
        this.gfx.endFill();
    }
    update(age) {
        const sway = Math.sin(age * 0.04 + this.pulseSeed) * 0.2;
        this.gfx.rotation = sway;
        const scalePulse = 1 + Math.sin(age * 0.08 + this.pulseSeed) * 0.06;
        this.gfx.scale.set(scalePulse);
    }
    destroy() {
        foodLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

// =============================================================================
// ENGIN CENTRAL DES CELLULES ET EVOLUTIONS MORPHOLOGIQUES
// =============================================================================
class Organism {
    constructor(x, y, size, isPlayer = false, diet = 'herbivore') {
        this.x = x;
        this.y = y;
        this.size = size;
        this.isPlayer = isPlayer;
        this.diet = diet; // 'herbivore' ou 'carnivore'
        
        this.vx = 0;
        this.vy = 0;
        this.baseSpeed = isPlayer ? 3.8 : Math.random() * 1.4 + 1.0;
        this.speedModifier = 1;
        this.attackModifier = 1;
        this.defenseModifier = 1;
        
        this.hp = size * 10;
        this.maxHp = this.hp;
        this.dna = 0;
        this.mutations = [];
        this.phase = 0; // Phase 0: Microbe, Phase 1: Organisme Structuré, Phase 2: Créature Avancée

        // Structure d'assemblage graphique de PixiJS
        this.display = new PIXI.Container();
        this.glowGfx = new PIXI.Graphics();
        this.mutationsGfx = new PIXI.Graphics();
        this.bodyGfx = new PIXI.Graphics();
        this.eyesGfx = new PIXI.Graphics();

        this.display.addChild(this.glowGfx);
        this.display.addChild(this.mutationsGfx);
        this.display.addChild(this.bodyGfx);
        this.display.addChild(this.eyesGfx);

        // Définition de la palette de couleurs
        if (this.diet === 'herbivore') {
            this.colorHex = this.isPlayer ? 0x00ffcc : hslToHex(130 + Math.random() * 30, 85, 45);
        } else {
            this.colorHex = this.isPlayer ? 0xff2255 : hslToHex(350 + Math.random() * 25, 90, 50);
        }

        // Configuration de la lueur pro par shader WebGL
        this.glowFilter = new PIXI.filters.GlowFilter({
            distance: this.isPlayer ? 24 : 14,
            outerStrength: this.isPlayer ? 2.5 : 1.2,
            innerStrength: 0,
            color: this.colorHex,
            quality: 0.6
        });
        this.display.filters = [this.glowFilter];

        this.refreshMorphology();
        creatureLayer.addChild(this.display);
    }

    refreshMorphology() {
        this.bodyGfx.clear();
        this.eyesGfx.clear();
        this.mutationsGfx.clear();

        // ÉVALUATION DES COUCHES GRAPHIQUES SUIVANT LA COMPLEXITÉ DE LA CRÉATURE (ZONES DE CROISSANCE)
        if (this.size < 28) {
            this.phase = 0; // Stade Cellule Simple
        } else if (this.size >= 28 && this.size < 50) {
            this.phase = 1; // Stade Organisme Allongé
        } else {
            this.phase = 2; // Stade Créature Complexes Réaliste
        }

        // --- DESSIN CONCENTRIQUE BIO-RÉALISTE ---
        if (this.phase === 0) {
            // Membrane à double paroi
            this.bodyGfx.beginFill(this.colorHex, 0.4);
            this.bodyGfx.drawCircle(0, 0, this.size + 3);
            this.bodyGfx.endFill();

            this.bodyGfx.beginFill(this.colorHex, 0.9);
            this.bodyGfx.lineStyle(1.5, 0xffffff, 0.7);
            this.bodyGfx.drawCircle(0, 0, this.size);
            this.bodyGfx.endFill();

            // Noyau interne visible
            this.bodyGfx.beginFill(0xffffff, 0.3);
            this.bodyGfx.drawCircle(-this.size * 0.2, -this.size * 0.2, this.size * 0.35);
            this.bodyGfx.endFill();

        } else if (this.phase === 1) {
            // Corps segmenté bilatéral (Évolution vers un ver marin complexe)
            this.bodyGfx.beginFill(this.colorHex, 0.5);
            this.bodyGfx.drawEllipse(0, 0, this.size * 1.4, this.size * 0.9);
            this.bodyGfx.drawCircle(-this.size * 0.9, 0, this.size * 0.7);
            this.bodyGfx.endFill();

            this.bodyGfx.beginFill(this.colorHex, 0.95);
            this.bodyGfx.lineStyle(2, 0xffffff, 0.8);
            this.bodyGfx.drawEllipse(0, 0, this.size * 1.2, this.size * 0.75);
            this.bodyGfx.drawCircle(-this.size * 0.8, 0, this.size * 0.55);
            this.bodyGfx.endFill();

            // Dessin des yeux primitifs
            this.eyesGfx.beginFill(0xffffff, 1);
            this.eyesGfx.drawCircle(this.size * 0.6, -this.size * 0.3, 5);
            this.eyesGfx.drawCircle(this.size * 0.6, this.size * 0.3, 5);
            this.eyesGfx.endFill();
            this.eyesGfx.beginFill(0x000000, 1);
            this.eyesGfx.drawCircle(this.size * 0.7, -this.size * 0.3, 2);
            this.eyesGfx.drawCircle(this.size * 0.7, this.size * 0.3, 2);
            this.eyesGfx.endFill();

        } else {
            // Phase Créature Supérieure : Forme Hydrodynamique et Carapace en plaques
            // Tracé d'un exosquelette en polygone lissé
            const points = [
                new PIXI.Point(this.size * 1.6, 0),
                new PIXI.Point(this.size * 0.8, -this.size * 0.9),
                new PIXI.Point(-this.size * 0.4, -this.size * 0.7),
                new PIXI.Point(-this.size * 1.5, -this.size * 0.4),
                new PIXI.Point(-this.size * 2.0, 0), // Queue
                new PIXI.Point(-this.size * 1.5, this.size * 0.4),
                new PIXI.Point(-this.size * 0.4, this.size * 0.7),
                new PIXI.Point(this.size * 0.8, this.size * 0.9)
            ];
            
            this.bodyGfx.beginFill(this.colorHex, 0.95);
            this.bodyGfx.lineStyle(2.5, 0xffffff, 0.9);
            this.bodyGfx.drawPolygon(points);
            this.bodyGfx.endFill();

            // Arêtes dorsales de protection
            this.bodyGfx.beginFill(0xffffff, 0.25);
            this.bodyGfx.drawEllipse(-this.size * 0.2, 0, this.size * 0.6, this.size * 0.4);
            this.bodyGfx.endFill();

            // Yeux prédateurs développés complexes
            this.eyesGfx.beginFill(0xffffff, 1);
            this.eyesGfx.drawCircle(this.size * 1.0, -this.size * 0.4, 7);
            this.eyesGfx.drawCircle(this.size * 1.0, this.size * 0.4, 7);
            this.eyesGfx.endFill();
            
            const pupilColor = this.diet === 'carnivore' ? 0xff0000 : 0x0000ff;
            this.eyesGfx.beginFill(pupilColor, 1);
            this.eyesGfx.drawCircle(this.size * 1.1, -this.size * 0.4, 3);
            this.eyesGfx.drawCircle(this.size * 1.1, this.size * 0.4, 3);
            this.eyesGfx.endFill();
        }

        // --- INJECTION ET RENDU DES MUTATIONS ACHETÉES ---
        const spikesCount = this.mutations.filter(m => m.name === 'Épine Perforante').length;
        if (spikesCount > 0) {
            this.mutationsGfx.lineStyle(3, 0xffaa00, 1);
            for (let i = 0; i < spikesCount * 3; i++) {
                const angle = (i / (spikesCount * 3)) * Math.PI * 2;
                const startRadius = this.size;
                const endRadius = this.size * 1.45;
                this.mutationsGfx.moveTo(Math.cos(angle) * startRadius, Math.sin(angle) * startRadius);
                this.mutationsGfx.lineTo(Math.cos(angle) * endRadius, Math.sin(angle) * endRadius);
            }
        }

        const flagelleCount = this.mutations.filter(m => m.name === 'Flagelle Propulseur').length;
        if (flagelleCount > 0) {
            this.mutationsGfx.lineStyle(2, 0xffffff, 0.6);
            for (let i = 0; i < flagelleCount; i++) {
                const offsetOffset = (i - (flagelleCount - 1) / 2) * 8;
                this.mutationsGfx.moveTo(-this.size, offsetOffset);
                this.mutationsGfx.quadraticCurveTo(-this.size * 2, offsetOffset + 10, -this.size * 2.5, offsetOffset - 5);
            }
        }
        
        const shieldCount = this.mutations.filter(m => m.name === 'Membrane Renforcée').length;
        if (shieldCount > 0) {
            this.mutationsGfx.lineStyle(2, 0x00bfff, 0.8);
            this.mutationsGfx.drawCircle(0, 0, this.size + 6);
        }
    }

    buyMutation(key) {
        const item = SHOP_ITEMS[key];
        const currentCount = this.mutations.filter(m => m.name === item.name).length;
        
        if (this.dna >= item.cost && currentCount < item.max) {
            this.dna -= item.cost;
            this.mutations.push(item);
            
            if (item.speed) this.speedModifier *= item.speed;
            if (item.attack) this.attackModifier *= item.attack;
            if (item.defense) this.defenseModifier *= item.defense;
            
            this.refreshMorphology();
            playSynthesizedSound(580, 0.25, 'triangle', 0.15);
            
            // Notification dans l'historique généalogique
            recordGenerationEvent(`Achat mutation : ${item.name}`);
            return true;
        }
        return false;
    }

    takeDamage(rawDamage) {
        const trueDamage = Math.max(1, rawDamage / this.defenseModifier);
        this.hp -= trueDamage;
        
        if (this.isPlayer) {
            gameState.shakeIntensity = 6;
            playSynthesizedSound(120, 0.15, 'square', 0.25);
        }

        // Émission d'éclats de chair bioluminescents
        for (let i = 0; i < 4; i++) {
            particles.push(new VisualParticle(this.x, this.y, 0xff3333));
        }
        return this.hp > 0;
    }

    update(delta) {
        const currentSpeed = this.baseSpeed * this.speedModifier;
        
        // Calcul des nouvelles coordonnées avec butées physiques du monde marin
        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x + this.vx * currentSpeed * delta));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y + this.vy * currentSpeed * delta));

        this.display.x = this.x;
        this.display.y = this.y;

        // Génération du sillage continu (effet fluide aquatique)
        if (Math.random() < 0.35) {
            particles.push(new VisualParticle(this.x, this.y, this.colorHex, true));
        }

        return this.hp > 0;
    }

    animatePhysics(age) {
        // Oscillation respiratoire asynchrone pour simuler le vivant
        const pulse = 1 + Math.sin(age * 0.08 + this.x) * 0.04;
        this.bodyGfx.scale.set(pulse);
        
        // Orientation fluide vers le vecteur de déplacement
        if (this.vx !== 0 || this.vy !== 0) {
            const targetAngle = Math.atan2(this.vy, this.vx);
            // Interpolation angulaire douce pour éviter les saccades de rotation
            let diff = targetAngle - this.display.rotation;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.display.rotation += diff * 0.1;
        }
    }

    checkCollision(other) {
        const dist = getDistance(this.x, this.y, other.x, other.y);
        return dist < (this.size + other.size);
    }

    eatFood(type, amountOrObject) {
        if (type === 'plant' && this.diet === 'herbivore') {
            this.size += 0.4;
            this.hp = Math.min(this.maxHp, this.hp + 2);
            if (this.isPlayer) {
                this.dna += 1;
                floatingTexts.push(new FloatingText(amountOrObject.x, amountOrObject.y, "+1 ADN", '#33ff55'));
                playSynthesizedSound(880, 0.06, 'sine', 0.1);
                checkMorphologyThresholds();
            }
            this.refreshMorphology();
            return true;
        } 
        
        if (type === 'cell' && this.diet === 'carnivore') {
            const preySize = amountOrObject.size;
            this.size += preySize * 0.18;
            this.maxHp = this.size * 10;
            this.hp = Math.min(this.maxHp, this.hp + preySize * 3);
            
            if (this.isPlayer) {
                const gainedDna = Math.floor(preySize * 0.5) + 2;
                this.dna += gainedDna;
                floatingTexts.push(new FloatingText(amountOrObject.x, amountOrObject.y, `+${gainedDna} ADN`, '#ff2255'));
                playSynthesizedSound(440, 0.12, 'sine', 0.15);
                checkMorphologyThresholds();
            }

            for (let i = 0; i < 7; i++) {
                particles.push(new VisualParticle(amountOrObject.x, amountOrObject.y, amountOrObject.colorHex));
            }
            this.refreshMorphology();
            return true;
        }
        return false;
    }

    destroy() {
        creatureLayer.removeChild(this.display);
        this.display.destroy({ children: true });
    }
}

// =============================================================================
// GESTIONNAIRE DE L'ARBRE GÉNÉALOGIQUE ET HISTORIQUE D'ÉVOLUTION
// =============================================================================
function recordGenerationEvent(description) {
    if (!player) return;
    familyTree.push({
        generation: gameState.generationCount,
        age: Math.floor(gameState.age / 60),
        size: Math.floor(player.size),
        phase: player.phase,
        diet: player.diet,
        event: description
    });
}

function displayFamilyTree() {
    const container = document.getElementById('treeDisplay');
    if (!container) return;
    container.innerHTML = '';

    if (familyTree.length === 0) {
        container.innerHTML = `<p style="color: #aaa; text-align: center; width: 100%;">Aucun historique génétique enregistré pour le moment.</p>`;
        return;
    }

    familyTree.forEach((node) => {
        const card = document.createElement('div');
        card.className = 'mutation-item';
        card.style.borderLeft = node.diet === 'herbivore' ? '4px solid #00ffcc' : '4px solid #ff2255';
        card.style.background = 'rgba(255, 255, 255, 0.03)';
        card.style.padding = '12px';
        card.style.borderRadius = '6px';
        
        let phaseLabel = ["Cellule", "Organisme", "Prédateur Évolué"][node.phase] || "Inconnu";

        card.innerHTML = `
            <div style="font-size: 13px;">
                <span style="color: #ffd700; font-weight: bold;">Gen ${node.generation}</span> - Stades : <strong>${phaseLabel}</strong><br>
                <span style="color: #ccc;">Action : ${node.event}</span><br>
                <small style="opacity: 0.6;">Taille : ${node.size} | Temps : ${node.age}s</small>
            </div>
        `;
        container.appendChild(card);
    });
}

function checkMorphologyThresholds() {
    // Si la créature franchit un seuil de taille, on enregistre la bascule de génération dans l'arbre
    const computedPhase = player.size < 28 ? 0 : (player.size < 50 ? 1 : 2);
    if (computedPhase !== player.phase) {
        gameState.generationCount++;
        recordGenerationEvent(`Mutation naturelle vers la phase morphologique supérieure.`);
    }
}

// =============================================================================
// PILOTAGE DE L'INTELLIGENCE ARTIFICIELLE DES CELLULES ENNEMIES
// =============================================================================
function manageAIBehaviors(delta) {
    for (let i = 0; i < cells.length; i++) {
        const ai = cells[i];
        
        // Actualisation aléatoire des directions pour simuler la recherche
        if (Math.random() < 0.015) {
            if (ai.diet === 'herbivore' && plants.length > 0) {
                // Ciblage de la plante la plus proche
                let closest = plants[0];
                let minDist = getDistance(ai.x, ai.y, closest.x, closest.y);
                for (let p = 1; p < plants.length; p++) {
                    const d = getDistance(ai.x, ai.y, plants[p].x, plants[p].y);
                    if (d < minDist) { minDist = d; closest = plants[p]; }
                }
                const angle = Math.atan2(closest.y - ai.y, closest.x - ai.x);
                ai.vx = Math.cos(angle);
                ai.vy = Math.sin(angle);
            } else {
                // Trajectoire aléatoire autonome pour carnivores ou si vide
                const angle = Math.random() * Math.PI * 2;
                ai.vx = Math.cos(angle);
                ai.vy = Math.sin(angle);
            }
        }

        // Comportement d'agression si l'IA est un carnivore géant à proximité du joueur
        if (ai.diet === 'carnivore' && player) {
            const distToPlayer = getDistance(ai.x, ai.y, player.x, player.y);
            if (distToPlayer < 250 && ai.size > player.size * 1.15) {
                // Mode Traque offensive
                const angle = Math.atan2(player.y - ai.y, player.x - ai.x);
                ai.vx = Math.cos(angle);
                ai.vy = Math.sin(angle);
            }
        }

        ai.update(delta);
        ai.animatePhysics(gameState.age);
    }
}

// =============================================================================
// INITIALISATION DU ÉCOSYSTÈME COMPLET
// =============================================================================
function openDietModal() {
    gameState.paused = true;
    document.getElementById('dietModal').classList.remove('hidden');
    document.getElementById('mutationModal').classList.add('hidden');
    document.getElementById('treeModal').classList.add('hidden');
}

function startWorldLife(selectedDiet) {
    // Nettoyage absolu des résidus mémoire de la partie précédente
    if (player) { player.destroy(); player = null; }
    cells.forEach(c => c.destroy());
    plants.forEach(p => p.destroy());
    particles.forEach(p => p.destroy());
    floatingTexts.forEach(f => f.destroy());
    ambientDust.forEach(d => d.destroy());

    cells = [];
    plants = [];
    particles = [];
    floatingTexts = [];
    ambientDust = [];
    familyTree = [];
    
    gameState.age = 0;
    gameState.shakeIntensity = 0;
    gameState.generationCount = 1;

    // Création du joueur souverain
    player = new Organism(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 16, true, selectedDiet);
    recordGenerationEvent("Naissance cellulaire dans le bouillon originel.");

    // Génération de la poussière marine en arrière-plan (profondeur immersive)
    for (let i = 0; i < 60; i++) {
        ambientDust.push(new AmbientDust());
    }

    // Répartition de la flore initiale
    for (let i = 0; i < 80; i++) {
        plants.push(new BioluminescentPlant(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT));
    }

    // Injection équilibrée de la faune concurrente IA (50% Herbivores / 50% Carnivores)
    for (let i = 0; i < 30; i++) {
        const dietAI = Math.random() > 0.5 ? 'herbivore' : 'carnivore';
        const spawnX = Math.random() * WORLD_WIDTH;
        const spawnY = Math.random() * WORLD_HEIGHT;
        
        // Éviter de spawner directement sur la tête du joueur
        if (getDistance(spawnX, spawnY, WORLD_WIDTH / 2, WORLD_HEIGHT / 2) > 300) {
            cells.push(new Organism(spawnX, spawnY, Math.random() * 14 + 10, false, dietAI));
        }
    }

    document.getElementById('dietModal').classList.add('hidden');
    gameState.paused = false;
    playSynthesizedSound(330, 0.4, 'sine', 0.2);
}

// Liaisons d'écouteurs sur le menu de démarrage
document.getElementById('btn-herbivore').addEventListener('click', () => startWorldLife('herbivore'));
document.getElementById('btn-carnivore').addEventListener('click', () => startWorldLife('carnivore'));

// =============================================================================
// GESTION DU LABORATOIRE INTERNE (MUTATIONS & BOUTIQUE)
// =============================================================================
function openShopMenu() {
    gameState.paused = true;
    const modal = document.getElementById('mutationModal');
    const choicesPanel = document.getElementById('mutationChoices');
    
    document.getElementById('shop-dna').textContent = player.dna;
    document.getElementById('evolveBtn').style.display = 'none';
    choicesPanel.innerHTML = '';

    Object.keys(SHOP_ITEMS).forEach(key => {
        const item = SHOP_ITEMS[key];
        const countOwned = player.mutations.filter(m => m.name === item.name).length;
        const isTradable = player.dna >= item.cost && countOwned < item.max;

        const widget = document.createElement('div');
        widget.className = 'mutation-item';
        widget.style.display = 'flex';
        widget.style.justifyContent = 'space-between';
        widget.style.alignItems = 'center';
        widget.style.marginBottom = '10px';
        widget.style.padding = '10px';
        widget.style.background = 'rgba(255,255,255,0.05)';
        widget.style.borderRadius = '8px';

        widget.innerHTML = `
            <div>
                <strong>${item.emoji} ${item.name}</strong> (${countOwned}/${item.max})<br>
                <small style="color:#aaa;">${item.desc}</small>
            </div>
            <div style="text-align: right;">
                <span class="mutation-cost" style="display:block; color:#ffd700; font-weight:bold; margin-bottom:4px;">${item.cost} ADN</span>
                <button class="buy-btn" ${isTradable ? '' : 'disabled'} style="padding:5px 10px; cursor:pointer;">Acheter</button>
            </div>
        `;

        if (isTradable) {
            widget.querySelector('.buy-btn').onclick = () => {
                if (player.buyMutation(key)) openShopMenu();
            };
        }
        choicesPanel.appendChild(widget);
    });

    modal.classList.remove('hidden');
}

// Écouteurs d'interface utilisateur
document.getElementById('closeShopBtn').addEventListener('click', () => {
    document.getElementById('mutationModal').classList.add('hidden');
    gameState.paused = false;
});

document.getElementById('evolveBtn').addEventListener('click', () => openShopMenu());

document.getElementById('restartBtn').addEventListener('click', () => {
    openDietModal();
});

// Écouteurs pour le bouton d'arbre généalogique s'il existe ou injection dynamique
let treeBtn = document.getElementById('viewTreeBtn');
if (!treeBtn) {
    // Si le bouton n'est pas présent dans l'HTML, on l'ajoute proprement aux contrôles
    const controls = document.querySelector('.controls');
    if (controls) {
        treeBtn = document.createElement('button');
        treeBtn.id = 'viewTreeBtn';
        treeBtn.className = 'btn-game';
        treeBtn.innerHTML = '🌳 Arbre Génétique';
        treeBtn.style.marginLeft = '8px';
        controls.appendChild(treeBtn);
    }
}

if (treeBtn) {
    treeBtn.addEventListener('click', () => {
        gameState.paused = true;
        displayFamilyTree();
        document.getElementById('treeModal').classList.remove('hidden');
    });
}

const closeTreeBtn = document.getElementById('closeTreeBtn');
if (closeTreeBtn) {
    closeTreeBtn.addEventListener('click', () => {
        document.getElementById('treeModal').classList.add('hidden');
        gameState.paused = false;
    });
}

// =============================================================================
// CORE LOOP : BOUCLE DE TRAITEMENT ET DE RENDU HAUTE FRÉQUENCE
// =============================================================================
app.ticker.add((delta) => {
    if (gameState.paused || !player) return;

    // Progression temporelle globale
    gameState.age += delta;

    // Synchronisation permanente du HUD de jeu
    document.getElementById('dna').textContent = player.dna;
    document.getElementById('size').textContent = Math.floor(player.size);
    document.getElementById('evolveBtn').style.display = (player.dna >= 15) ? 'inline-block' : 'none';

    // --- CAPTURE DU MOUVEMENT ET CALCUL VECTEUR DU JOUEUR ---
    const targetVectorX = mousePosition.x - window.innerWidth / 2;
    const targetVectorY = mousePosition.y - window.innerHeight / 2;
    const centerDistance = Math.sqrt(targetVectorX * targetVectorX + targetVectorY * targetVectorY);

    if (centerDistance > 18) {
        player.vx = targetVectorX / centerDistance;
        player.vy = targetVectorY / centerDistance;
    } else {
        player.vx = 0;
        player.vy = 0;
    }

    player.update(delta);
    player.animatePhysics(gameState.age);

    // Maintenance et rafraîchissement de la poussière d'ambiance marine
    ambientDust.forEach(dust => dust.update(gameState.age));

    // --- RÉGULATION AUTOMATIQUE DE LA VÉGÉTATION ---
    if (Math.random() < 0.04 && plants.length < 130) {
        plants.push(new BioluminescentPlant(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT));
    }

    // --- INTERACTION ET NETTOYAGE FLORE (HERBIVORES) ---
    for (let i = plants.length - 1; i >= 0; i--) {
        const plant = plants[i];
        plant.update(gameState.age);

        // Alimentation des IA herbivores
        for (let j = 0; j < cells.length; j++) {
            if (cells[j].diet === 'herbivore' && cells[j].checkCollision(plant)) {
                cells[j].eatFood('plant', plant);
                plant.destroy();
                plants.splice(i, 1);
                break;
            }
        }

        // Alimentation du joueur herbivore
        if (plants[i] && player.diet === 'herbivore' && player.checkCollision(plant)) {
            player.eatFood('plant', plant);
            plant.destroy();
            plants.splice(i, 1);
        }
    }

    // --- INTERACTION, TRAQUE ET COMBATS ENTRE ORGANISMES ---
    for (let i = cells.length - 1; i >= 0; i--) {
        const ai = cells[i];

        // Élimination si l'organisme IA n'a plus de points de vie
        if (ai.hp <= 0) {
            ai.destroy();
            cells.splice(i, 1);
            continue;
        }

        // Le joueur est carnivore : il attaque et dévore l'IA plus petite
        if (player.diet === 'carnivore' && player.size > ai.size * 1.15 && player.checkCollision(ai)) {
            player.eatFood('cell', ai);
            ai.destroy();
            cells.splice(i, 1);
            continue;
        }

        // L'IA est carnivore : elle agresse et mutile le joueur s'il est plus petit
        if (ai.diet === 'carnivore' && ai.size > player.size * 1.15 && ai.checkCollision(player)) {
            if (!player.takeDamage(ai.size * 0.4)) {
                // Déclenchement de l'état fatidique Game Over
                alert(`🧬 Lignée éteinte ! Tu as survécu jusqu'à la génération ${gameState.generationCount} avec ${player.dna} points d'ADN.`);
                openDietModal();
                return;
            }
        }

        // Combats d'opportunisme de contact entre IA
        for (let j = cells.length - 1; j >= 0; j--) {
            if (i !== j && cells[j] && ai.diet === 'carnivore' && ai.size > cells[j].size * 1.15 && ai.checkCollision(cells[j])) {
                ai.eatFood('cell', cells[j]);
                cells[j].destroy();
                cells.splice(j, 1);
                if (j < i) i--; // Ajustement de l'index de sécurité de boucle
            }
        }
    }

    // Traitement du comportement global des intelligences artificielles
    manageAIBehaviors(delta);

    // --- FILTRAGE ET CONTRÔLE DES EFFETS PARTICULAIRES ---
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(delta);
        if (particles[i].life <= 0) {
            particles[i].destroy();
            particles.splice(i, 1);
        }
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        floatingTexts[i].update(delta);
        if (floatingTexts[i].life <= 0) {
            floatingTexts[i].destroy();
            floatingTexts.splice(i, 1);
        }
    }

    // --- SYSTÈME DE GESTION DE LA CAMÉRA DE JEU (FLUID INTERPOLATION + SHAKE) ---
    let shakeX = 0;
    let shakeY = 0;
    if (gameState.shakeIntensity > 0) {
        shakeX = (Math.random() - 0.5) * gameState.shakeIntensity;
        shakeY = (Math.random() - 0.5) * gameState.shakeIntensity;
        gameState.shakeIntensity -= 0.25 * delta;
    }

    // Calcul du point de focus idéal au centre de la fenêtre de vision du joueur
    const cameraFocusX = window.innerWidth / 2 - player.x;
    const cameraFocusY = window.innerHeight / 2 - player.y;

    // Application du lissage linéaire (Lerp) pour simuler l'inertie du liquide aqueux
    gameLayer.x = lerp(gameLayer.x, cameraFocusX, 0.08 * delta) + shakeX;
    gameLayer.y = lerp(gameLayer.y, cameraFocusY, 0.08 * delta) + shakeY;
    particleLayer.x = gameLayer.x;
    particleLayer.y = gameLayer.y;
    foodLayer.x = gameLayer.x;
    foodLayer.y = gameLayer.y;
    fxLayer.x = gameLayer.x;
    fxLayer.y = gameLayer.y;

    // Légère parallaxe inversée sur l'arrière-plan pour augmenter l'effet tridimensionnel
    backgroundLayer.x = lerp(backgroundLayer.x, cameraFocusX * 0.35, 0.08 * delta);
    backgroundLayer.y = lerp(backgroundLayer.y, cameraFocusY * 0.35, 0.08 * delta);
});

// Lancement automatique du cycle au chargement initial du fichier de script
openDietModal();
