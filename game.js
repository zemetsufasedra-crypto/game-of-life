// =============================================================================
// MOTEUR DE JEU : SPORE EVOLUTION (STAGE CELLULAIRE & BIO-LUMINESCENCE)
// Architecture WebGL Native - Version Intégrale Haute Densité
// =============================================================================

// --- CONFIGURATION LOGIQUE ET UNIVERSELLE DE L'ESPACE ---
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 2500;
const GRID_SIZE = 120;

// Configuration de l'application PixiJS avec accélération matérielle forcée
const app = new PIXI.Application({
    resizeTo: window,
    backgroundColor: 0x010206, // Profondeur marine abyssale
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true
});

// Injection immédiate du viewport de rendu dans le conteneur HTML principal
const containerElement = document.getElementById('game-container') || document.body;
containerElement.appendChild(app.view || app.canvas);

// --- PROTOCOLE D'ORGANISATION PAR CALQUES SÉPARÉS (RENDERING ARRAYS) ---
const backgroundLayer = new PIXI.Container();
const environmentGrid = new PIXI.Graphics();
const trailParticleLayer = new PIXI.Container();
const foodSourceLayer = new PIXI.Container();
const creatureFaunaLayer = new PIXI.Container();
const interfaceFxLayer = new PIXI.Container();

backgroundLayer.addChild(environmentGrid);
app.stage.addChild(backgroundLayer);
app.stage.addChild(trailParticleLayer);
app.stage.addChild(foodSourceLayer);
app.stage.addChild(creatureFaunaLayer);
app.stage.addChild(interfaceFxLayer);

// --- REGISTRE DES ÉTATS ET TIMERS DE L'ÉCOSYSTÈME ---
let player = null;
let cells = [];
let plants = [];
let visualParticles = [];
let damageTexts = [];
let planktonDust = [];
let familyEvolutionTree = [];

let gameState = {
    paused: false,
    age: 0,
    elapsedFrames: 0,
    shakeMatrixIntensity: 0,
    generationIndex: 1,
    maxConcurrentAI: 40,
    maxConcurrentPlants: 150
};

const SHOP_CATALOG = {
    flagelle: { id: 'flagelle', name: 'Flagelle Propulseur', cost: 15, max: 3, speedBonus: 0.20, emoji: '⚡', desc: 'Augmente la vitesse de pointe.' },
    spike: { id: 'spike', name: 'Épine Perforante', cost: 20, max: 4, attackBonus: 0.40, emoji: '🔪', desc: 'Inflige des dégâts de contact destructeurs.' },
    shield: { id: 'shield', name: 'Membrane Renforcée', cost: 25, max: 2, defenseBonus: 0.30, emoji: '🛡️', desc: 'Réduit l\'impact des morsures ennemies.' },
    cilia: { id: 'cilia', name: 'Cils Vibratiles', cost: 10, max: 3, agilityBonus: 0.25, emoji: '🪶', desc: 'Améliore le sillage et la vitesse de virage.' }
};

let inputMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.addEventListener('mousemove', (event) => {
    inputMouse.x = event.clientX;
    inputMouse.y = event.clientY;
});

// =============================================================================
// ENGINS MATHÉMATIQUES ET TRANSLATIONS CHROMATIQUES
// =============================================================================
function mathLerp(origin, destination, factor) {
    return (1 - factor) * origin + factor * destination;
}

function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function generateHslHex(h, s, l) {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return Number(`0x${f(0)}${f(8)}${f(4)}`);
}

// =============================================================================
// ENGIN AUDIO SYNTHÉTIQUE (Web Audio API - Zéro Fichier Externe)
// =============================================================================
let audioContextInstance = null;
function triggerBioSound(frequency, duration, waveType = 'sine', outputVolume = 0.08) {
    try {
        if (!audioContextInstance) {
            audioContextInstance = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContextInstance.state === 'suspended') {
            audioContextInstance.resume();
        }
        
        const oscillator = audioContextInstance.createOscillator();
        const gainNode = audioContextInstance.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContextInstance.destination);
        
        oscillator.type = waveType;
        oscillator.frequency.setValueAtTime(frequency, audioContextInstance.currentTime);
        
        gainNode.gain.setValueAtTime(outputVolume, audioContextInstance.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContextInstance.currentTime + duration);
        
        oscillator.start(audioContextInstance.currentTime);
        oscillator.stop(audioContextInstance.currentTime + duration);
    } catch (error) {
        // Mode silencieux si restriction navigateur
    }
}

// =============================================================================
// ÉLÉMENTS VISUELS : POUSSIÈRES PARTICULAIRES & INTERFACES FLOTTANTES
// =============================================================================
class DeepPlankton {
    constructor() {
        this.gfx = new PIXI.Graphics();
        this.x = Math.random() * WORLD_WIDTH;
        this.y = Math.random() * WORLD_HEIGHT;
        this.radius = Math.random() * 2 + 0.8;
        this.parallaxFactor = Math.random() * 0.4 + 0.1;
        this.pulseFrequency = Math.random() * 0.05 + 0.01;
        this.seed = Math.random() * 50;

        this.gfx.beginFill(0x5a8eff, Math.random() * 0.3 + 0.1);
        this.gfx.drawCircle(0, 0, this.radius);
        this.gfx.endFill();
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        backgroundLayer.addChild(this.gfx);
    }
    animate(time) {
        this.gfx.y += Math.sin(time * this.pulseFrequency + this.seed) * 0.15;
    }
    clear() {
        backgroundLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

class LiquidTrailParticle {
    constructor(x, y, tint, structuralTrail = false) {
        this.x = x;
        this.y = y;
        this.structuralTrail = structuralTrail;
        this.lifespan = structuralTrail ? 20 : 35;
        this.maxLifespan = this.lifespan;
        this.scaleSize = Math.random() * 3 + 1.5;
        
        this.vx = (Math.random() - 0.5) * (structuralTrail ? 0.6 : 4);
        this.vy = (Math.random() - 0.5) * (structuralTrail ? 0.6 : 4);

        this.gfx = new PIXI.Graphics();
        this.gfx.beginFill(tint, structuralTrail ? 0.4 : 0.7);
        this.gfx.drawCircle(0, 0, this.scaleSize);
        this.gfx.endFill();
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        
        trailParticleLayer.addChild(this.gfx);
    }
    progress(delta) {
        this.x += this.vx * delta;
        this.y += this.vy * delta;
        this.lifespan -= delta;
        
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        this.gfx.alpha = Math.max(0, this.lifespan / this.maxLifespan);
        
        if (this.structuralTrail) {
            this.gfx.scale.set(this.lifespan / this.maxLifespan);
        }
    }
    clear() {
        trailParticleLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

class FluidFloatingText {
    constructor(x, y, label, textTint) {
        this.x = x;
        this.y = y;
        this.duration = 50;
        this.pixiText = new PIXI.Text(label, {
            fontFamily: 'Arial',
            fontSize: 14,
            fontWeight: '900',
            fill: textTint,
            stroke: 0x000000,
            strokeThickness: 3
        });
        this.pixiText.anchor.set(0.5);
        this.pixiText.x = this.x;
        this.pixiText.y = this.y;
        interfaceFxLayer.addChild(this.pixiText);
    }
    progress(delta) {
        this.duration -= delta;
        this.y -= 1.1 * delta;
        this.pixiText.y = this.y;
        this.pixiText.alpha = Math.max(0, this.duration / 50);
    }
    clear() {
        interfaceFxLayer.removeChild(this.pixiText);
        this.pixiText.destroy();
    }
}

// =============================================================================
// BOTANIQUE CELLULAIRE : SPOTS DE NOURRITURE LUMINESCENTE
// =============================================================================
class BioluminescentPlant {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 7;
        this.pulseSeed = Math.random() * Math.PI * 2;
        this.gfx = new PIXI.Graphics();
        
        this.renderPlantGeometry();
        this.gfx.x = this.x;
        this.gfx.y = this.y;
        
        // Configuration du filtre Glow pour l'esthétique Spore moderne
        this.gfx.filters = [new PIXI.filters.GlowFilter({
            distance: 12,
            outerStrength: 2,
            color: 0x11ff55,
            quality: 0.5
        })];
        foodSourceLayer.addChild(this.gfx);
    }
    renderPlantGeometry() {
        this.gfx.clear();
        this.gfx.beginFill(0x19a043, 0.8);
        this.gfx.lineStyle(1.5, 0x8dffa9, 0.5);
        
        // Tracé d'une spore végétale trilobée
        this.gfx.moveTo(0, -this.size * 1.6);
        this.gfx.quadraticCurveTo(this.size * 1.2, -this.size * 1.2, this.size, 0);
        this.gfx.quadraticCurveTo(this.size * 1.4, this.size * 1.4, 0, this.size);
        this.gfx.quadraticCurveTo(-this.size * 1.4, this.size * 1.4, -this.size, 0);
        this.gfx.quadraticCurveTo(-this.size * 1.2, -this.size * 1.2, 0, -this.size * 1.6);
        this.gfx.endFill();
        
        // Organelle interne luminescent
        this.gfx.beginFill(0x8cffb2, 1);
        this.gfx.drawCircle(0, 0, this.size * 0.4);
        this.gfx.endFill();
    }
    pulseAnimation(age) {
        const angleSway = Math.sin(age * 0.03 + this.pulseSeed) * 0.15;
        this.gfx.rotation = angleSway;
        const dimensionScale = 1 + Math.sin(age * 0.06 + this.pulseSeed) * 0.08;
        this.gfx.scale.set(dimensionScale);
    }
    clear() {
        foodSourceLayer.removeChild(this.gfx);
        this.gfx.destroy();
    }
}

// =============================================================================
// ENTITÉ SUPRÊME : CLASSE CRÉATURE ÉVOLUTIVE ET ARCHITECTURE MORPHOLOGIQUE
// =============================================================================
class Organism {
    constructor(x, y, radius, controlledByPlayer = false, biologicalDiet = 'herbivore') {
        this.x = x;
        this.y = y;
        this.size = radius;
        this.isPlayer = controlledByPlayer;
        this.diet = biologicalDiet;
        
        this.vx = 0;
        this.vy = 0;
        this.nominalSpeed = controlledByPlayer ? 4.0 : Math.random() * 1.5 + 1.2;
        this.statAgility = 1.0;
        this.statSpeedMultiplier = 1.0;
        this.statAttackMultiplier = 1.0;
        this.statDefenseMultiplier = 1.0;
        
        this.healthPoints = radius * 12;
        this.maxHealthPoints = this.healthPoints;
        this.dnaPool = 0;
        this.mutationsRegistry = [];
        this.phase = 0; // Phase 0: Microbe rond, Phase 1: Organisme segmenté, Phase 2: Créature Hydrodynamique

        this.displayContainer = new PIXI.Container();
        this.layerGlow = new PIXI.Graphics();
        this.layerAppendages = new PIXI.Graphics();
        this.layerBodyShell = new PIXI.Graphics();
        this.layerSensors = new PIXI.Graphics();

        this.displayContainer.addChild(this.layerGlow);
        this.displayContainer.addChild(this.layerAppendages);
        this.displayContainer.addChild(this.layerBodyShell);
        this.displayContainer.addChild(this.layerSensors);

        // Sélection de la charte de couleur
        if (this.diet === 'herbivore') {
            this.colorHex = this.isPlayer ? 0x00ffd2 : generateHslHex(145 + Math.random() * 25, 85, 45);
        } else {
            this.colorHex = this.isPlayer ? 0xff1e56 : generateHslHex(355 + Math.random() * 20, 90, 48);
        }

        this.glowShaderFilter = new PIXI.filters.GlowFilter({
            distance: this.isPlayer ? 25 : 12,
            outerStrength: this.isPlayer ? 2.8 : 1.3,
            innerStrength: 0,
            color: this.colorHex,
            quality: 0.6
        });
        this.displayContainer.filters = [this.glowShaderFilter];

        this.refreshMorphology();
        creatureFaunaLayer.addChild(this.displayContainer);
    }

    refreshMorphology() {
        this.layerBodyShell.clear();
        this.layerSensors.clear();
        this.layerAppendages.clear();

        // ÉVALUATION DES MATRICES DE DESSIN SUIVANT LA ZONE DE CROISSANCE (Taille globale)
        if (this.size < 26) {
            this.phase = 0;
        } else if (this.size >= 26 && this.size < 48) {
            this.phase = 1;
        } else {
            this.phase = 2;
        }

        // Phase 0 : Conception Microbienne Circulaire primitive
        if (this.phase === 0) {
            this.layerBodyShell.beginFill(this.colorHex, 0.45);
            this.layerBodyShell.drawCircle(0, 0, this.size + 2);
            this.layerBodyShell.endFill();

            this.layerBodyShell.beginFill(this.colorHex, 0.9);
            this.layerBodyShell.lineStyle(1.5, 0xffffff, 0.7);
            this.layerBodyShell.drawCircle(0, 0, this.size);
            this.layerBodyShell.endFill();

            // Cytoplasme / Organites visibles
            this.layerBodyShell.beginFill(0xffffff, 0.25);
            this.layerBodyShell.drawCircle(-this.size * 0.25, -this.size * 0.2, this.size * 0.3);
            this.layerBodyShell.endFill();
        } 
        // Phase 1 : Organisme Métamérisé Allongé (Évolution bilatérale type annélide)
        else if (this.phase === 1) {
            this.layerBodyShell.beginFill(this.colorHex, 0.4);
            this.layerBodyShell.drawEllipse(0, 0, this.size * 1.35, this.size * 0.85);
            this.layerBodyShell.drawCircle(-this.size * 0.8, 0, this.size * 0.65);
            this.layerBodyShell.endFill();

            this.layerBodyShell.beginFill(this.colorHex, 0.95);
            this.layerBodyShell.lineStyle(2, 0xffffff, 0.8);
            this.layerBodyShell.drawEllipse(0, 0, this.size * 1.2, this.size * 0.7);
            this.layerBodyShell.drawCircle(-this.size * 0.7, 0, this.size * 0.5);
            this.layerBodyShell.endFill();

            // Intégration de récepteurs visuels simples
            this.layerSensors.beginFill(0xffffff, 1);
            this.layerSensors.drawCircle(this.size * 0.55, -this.size * 0.25, 4.5);
            this.layerSensors.drawCircle(this.size * 0.55, this.size * 0.25, 4.5);
            this.layerSensors.endFill();
            
            this.layerSensors.beginFill(0x010206, 1);
            this.layerSensors.drawCircle(this.size * 0.6, -this.size * 0.25, 2);
            this.layerSensors.drawCircle(this.size * 0.6, this.size * 0.25, 2);
            this.layerSensors.endFill();
        } 
        // Phase 2 : Créature Prédatrice/Complexe Réaliste Supérieure (Silhouette hydrodynamique articulée)
        else {
            const bodyCoordinates = [
                new PIXI.Point(this.size * 1.7, 0),
                new PIXI.Point(this.size * 0.9, -this.size * 0.8),
                new PIXI.Point(-this.size * 0.3, -this.size * 0.65),
                new PIXI.Point(-this.size * 1.4, -this.size * 0.4),
                new PIXI.Point(-this.size * 2.1, 0), // Zone caudale
                new PIXI.Point(-this.size * 1.4, this.size * 0.4),
                new PIXI.Point(-this.size * 0.3, this.size * 0.65),
                new PIXI.Point(this.size * 0.9, this.size * 0.8)
            ];

            this.layerBodyShell.beginFill(this.colorHex, 0.95);
            this.layerBodyShell.lineStyle(2.5, 0xffffff, 0.85);
            this.layerBodyShell.drawPolygon(bodyCoordinates);
            this.layerBodyShell.endFill();

            // Plaques d'exosquelette de protection dorsale
            this.layerBodyShell.beginFill(0xffffff, 0.2);
            this.layerBodyShell.drawEllipse(-this.size * 0.1, 0, this.size * 0.5, this.size * 0.35);
            this.layerBodyShell.endFill();

            // Système oculaire binoculaire développé
            this.layerSensors.beginFill(0xffffff, 1);
            this.layerSensors.drawCircle(this.size * 0.95, -this.size * 0.35, 6.5);
            this.layerSensors.drawCircle(this.size * 0.95, this.size * 0.35, 6.5);
            this.layerSensors.endFill();

            const centralPupilColor = this.diet === 'carnivore' ? 0xff002b : 0x0055ff;
            this.layerSensors.beginFill(centralPupilColor, 1);
            this.layerSensors.drawCircle(this.size * 1.05, -this.size * 0.35, 2.5);
            this.layerSensors.drawCircle(this.size * 1.05, this.size * 0.35, 2.5);
            this.layerSensors.endFill();
        }

        // --- CONSTRUIRE ET DESSINER LES APPENDAGES ISSUS DES MUTATIONS ---
        const activeSpikesCount = this.mutationsRegistry.filter(m => m.id === 'spike').length;
        if (activeSpikesCount > 0) {
            this.layerAppendages.lineStyle(3.5, 0xffaa00, 1);
            for (let i = 0; i < activeSpikesCount * 3; i++) {
                const radialAngle = (i / (activeSpikesCount * 3)) * Math.PI * 2;
                const radiusStart = this.size;
                const radiusEnd = this.size * 1.42;
                this.layerAppendages.moveTo(Math.cos(radialAngle) * radiusStart, Math.sin(radialAngle) * radiusStart);
                this.layerAppendages.lineTo(Math.cos(radialAngle) * radiusEnd, Math.sin(radialAngle) * radiusEnd);
            }
        }

        const activeFlagellesCount = this.mutationsRegistry.filter(m => m.id === 'flagelle').length;
        if (activeFlagellesCount > 0) {
            this.layerAppendages.lineStyle(2, 0xefefff, 0.6);
            for (let i = 0; i < activeFlagellesCount; i++) {
                const lateralOffset = (i - (activeFlagellesCount - 1) / 2) * 9;
                this.layerAppendages.moveTo(-this.size, lateralOffset);
                this.layerAppendages.quadraticCurveTo(-this.size * 2.1, lateralOffset + 12, -this.size * 2.6, lateralOffset - 4);
            }
        }

        const activeShieldsCount = this.mutationsRegistry.filter(m => m.id === 'shield').length;
        if (activeShieldsCount > 0) {
            this.layerAppendages.lineStyle(2, 0x00d2ff, 0.75);
            this.layerAppendages.drawCircle(0, 0, this.size + 5.5);
        }
    }

    acquireGenetics(key) {
        const mutationTemplate = SHOP_CATALOG[key];
        const ownedCount = this.mutationsRegistry.filter(m => m.id === key).length;

        if (this.dnaPool >= mutationTemplate.cost && ownedCount < mutationTemplate.max) {
            this.dnaPool -= mutationTemplate.cost;
            this.mutationsRegistry.push(mutationTemplate);

            if (mutationTemplate.speedBonus) this.statSpeedMultiplier += mutationTemplate.speedBonus;
            if (mutationTemplate.attackBonus) this.statAttackMultiplier += mutationTemplate.attackBonus;
            if (mutationTemplate.defenseBonus) this.statDefenseMultiplier += mutationTemplate.defenseBonus;
            if (mutationTemplate.agilityBonus) this.statAgility += mutationTemplate.agilityBonus;

            this.refreshMorphology();
            triggerBioSound(620, 0.22, 'triangle', 0.12);
            pushEvolutionSnapshot(`Évolution génétique validée : ${mutationTemplate.name}`);
            return true;
        }
        return false;
    }

    inflictDamage(rawPoints) {
        const scaledDamage = Math.max(1, rawPoints / this.statDefenseMultiplier);
        this.healthPoints -= scaledDamage;

        if (this.isPlayer) {
            gameState.shakeMatrixIntensity = 7;
            triggerBioSound(140, 0.18, 'square', 0.22);
        }

        for (let i = 0; i < 4; i++) {
            visualParticles.push(new LiquidTrailParticle(this.x, this.y, 0xff2a2a));
        }
        return this.healthPoints > 0;
    }

    update(delta) {
        const calculatedVelocity = this.nominalSpeed * this.statSpeedMultiplier;

        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x + this.vx * calculatedVelocity * delta));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y + this.vy * calculatedVelocity * delta));

        this.displayContainer.x = this.x;
        this.displayContainer.y = this.y;

        if (Math.random() < 0.32) {
            visualParticles.push(new LiquidTrailParticle(this.x, this.y, this.colorHex, true));
        }
        return this.healthPoints > 0;
    }

    calculatePhysicsAnimation(age) {
        const breathingPulse = 1 + Math.sin(age * 0.07 + this.x) * 0.038;
        this.layerBodyShell.scale.set(breathingPulse);

        if (this.vx !== 0 || this.vy !== 0) {
            const headingAngle = Math.atan2(this.vy, this.vx);
            let angularDifference = headingAngle - this.displayContainer.rotation;

            while (angularDifference < -Math.PI) angularDifference += Math.PI * 2;
            while (angularDifference > Math.PI) angularDifference -= Math.PI * 2;

            this.displayContainer.rotation += angularDifference * 0.09 * this.statAgility;
        }
    }

    checkCollision(targetEntity) {
        const distanceBetween = calculateDistance(this.x, this.y, targetEntity.x, targetEntity.y);
        return distanceBetween < (this.size + targetEntity.size);
    }

    consumeTarget(category, targetObject) {
        if (category === 'plant' && this.diet === 'herbivore') {
            this.size += 0.38;
            this.healthPoints = Math.min(this.maxHealthPoints, this.healthPoints + 2.5);
            
            if (this.isPlayer) {
                this.dnaPool += 1;
                visualParticles.push(new LiquidTrailParticle(targetObject.x, targetObject.y, 0x11ff55));
                damageTexts.push(new FluidFloatingText(targetObject.x, targetObject.y, "+1 ADN", '#2bff61'));
                triggerBioSound(920, 0.05, 'sine', 0.08);
                evaluateMorphologicalTransition();
            }
            this.refreshMorphology();
            return true;
        }

        if (category === 'cell' && this.diet === 'carnivore') {
            const capturedSize = targetObject.size;
            this.size += capturedSize * 0.16;
            this.maxHealthPoints = this.size * 12;
            this.healthPoints = Math.min(this.maxHealthPoints, this.healthPoints + capturedSize * 2.8);

            if (this.isPlayer) {
                const generatedDna = Math.floor(capturedSize * 0.45) + 2;
                this.dnaPool += generatedDna;
                damageTexts.push(new FluidFloatingText(targetObject.x, targetObject.y, `+${generatedDna} ADN`, '#ff1e56'));
                triggerBioSound(460, 0.1, 'sine', 0.12);
                evaluateMorphologicalTransition();
            }

            for (let i = 0; i < 6; i++) {
                visualParticles.push(new LiquidTrailParticle(targetObject.x, targetObject.y, targetObject.colorHex));
            }
            this.refreshMorphology();
            return true;
        }
        return false;
    }

    destroy() {
        creatureFaunaLayer.removeChild(this.displayContainer);
        this.displayContainer.destroy({ children: true });
    }
}

// =============================================================================
// PERSISTANCE HISTORIQUE ET ARBRE GÉNETIQUE COMPLET
// =============================================================================
function pushEvolutionSnapshot(eventLogDescription) {
    if (!player) return;
    familyEvolutionTree.push({
        generation: gameState.generationIndex,
        timestamp: Math.floor(gameState.age / 60),
        organismSize: Math.floor(player.size),
        biologicalPhase: player.phase,
        regime: player.diet,
        description: eventLogDescription
    });
}

function processAndRenderTreeUI() {
    const visualTreeDisplay = document.getElementById('treeDisplay');
    if (!visualTreeDisplay) return;
    visualTreeDisplay.innerHTML = '';

    if (familyEvolutionTree.length === 0) {
        visualTreeDisplay.innerHTML = `<p style="color: #888; text-align: center; width: 100%;">Vide.</p>`;
        return;
    }

    familyEvolutionTree.forEach((historicalFrame) => {
        const entryWidget = document.createElement('div');
        entryWidget.className = 'mutation-item';
        entryWidget.style.borderLeft = historicalFrame.regime === 'herbivore' ? '4px solid #00ffd2' : '4px solid #ff1e56';
        entryWidget.style.background = 'rgba(255, 255, 255, 0.02)';
        entryWidget.style.padding = '10px';
        entryWidget.style.borderRadius = '5px';
        entryWidget.style.color = '#fff';

        const stageTitle = ["Stade Cellulaire", "Stade Allongé Segmenté", "Stade Créature Supérieure"][historicalFrame.biologicalPhase] || "Inconnu";

        entryWidget.innerHTML = `
            <div style="font-size: 13px; line-height: 1.4;">
                <span style="color: #ffd700; font-weight: bold;">Génération ${historicalFrame.generation}</span> — <strong>${stageTitle}</strong><br>
                <span style="color: #e0e0e0;">${historicalFrame.description}</span><br>
                <small style="opacity: 0.5;">Diamètre : ${historicalFrame.organismSize}px | Durée : ${historicalFrame.timestamp}s</small>
            </div>
        `;
        visualTreeDisplay.appendChild(entryWidget);
    });
}

function evaluateMorphologicalTransition() {
    const verifiedPhase = player.size < 26 ? 0 : (player.size < 48 ? 1 : 2);
    if (verifiedPhase !== player.phase) {
        gameState.generationIndex++;
        pushEvolutionSnapshot(`Mutation morphologique de l'enveloppe vers le palier supérieur.`);
    }
}

// =============================================================================
// CALCUL DE L'INTELLIGENCE ARTIFICIELLE ET PROCESSUS COGNITIFS DES CELLULES
// =============================================================================
function computeArtificialIntelligence(delta) {
    for (let i = 0; i < cells.length; i++) {
        const entityAI = cells[i];

        if (Math.random() < 0.016) {
            if (entityAI.diet === 'herbivore' && plants.length > 0) {
                let primaryTarget = plants[0];
                let minimumRecordedDistance = calculateDistance(entityAI.x, entityAI.y, primaryTarget.x, primaryTarget.y);
                
                for (let k = 1; k < plants.length; k++) {
                    const currentPlantDistance = calculateDistance(entityAI.x, entityAI.y, plants[k].x, plants[k].y);
                    if (currentPlantDistance < minimumRecordedDistance) {
                        minimumRecordedDistance = currentPlantDistance;
                        primaryTarget = plants[k];
                    }
                }
                const navigationHeading = Math.atan2(primaryTarget.y - entityAI.y, primaryTarget.x - entityAI.x);
                entityAI.vx = Math.cos(navigationHeading);
                entityAI.vy = Math.sin(navigationHeading);
            } else {
                const randomAngleHeading = Math.random() * Math.PI * 2;
                entityAI.vx = Math.cos(randomAngleHeading);
                entityAI.vy = Math.sin(randomAngleHeading);
            }
        }

        if (entityAI.diet === 'carnivore' && player) {
            const distanceMetricsToPlayer = calculateDistance(entityAI.x, entityAI.y, player.x, player.y);
            if (distanceMetricsToPlayer < 240 && entityAI.size > player.size * 1.15) {
                const aggressionHeading = Math.atan2(player.y - entityAI.y, player.x - entityAI.x);
                entityAI.vx = Math.cos(aggressionHeading);
                entityAI.vy = Math.sin(aggressionHeading);
            }
        }

        entityAI.update(delta);
        entityAI.calculatePhysicsAnimation(gameState.age);
    }
}

// =============================================================================
// INITIALISATION GLOBALE ET RE-GÉNÉRATION DU BIOME MOTEUR
// =============================================================================
function displayDietSelectionModal() {
    gameState.paused = true;
    
    const dietModal = document.getElementById('dietModal');
    if (dietModal) dietModal.classList.remove('hidden');
    
    const mutationModal = document.getElementById('mutationModal');
    if (mutationModal) mutationModal.classList.add('hidden');
    
    const treeModal = document.getElementById('treeModal');
    if (treeModal) treeModal.classList.add('hidden');
}

function initializeEcologicalWorld(selectedDietType) {
    if (player) {
        player.destroy();
        player = null;
    }
    cells.forEach(c => c.destroy());
    plants.forEach(p => p.destroy());
    visualParticles.forEach(p => p.clear());
    damageTexts.forEach(f => f.clear());
    planktonDust.forEach(d => d.clear());

    cells = [];
    plants = [];
    visualParticles = [];
    damageTexts = [];
    planktonDust = [];
    familyEvolutionTree = [];

    gameState.age = 0;
    gameState.shakeMatrixIntensity = 0;
    gameState.generationIndex = 1;

    // Instanciation de la cellule souveraine du joueur
    player = new Organism(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 15, true, selectedDietType);
    pushEvolutionSnapshot("Émergence cellulaire dans le fluide d'origine.");

    // Grillage de fond pour donner un repère spatial de déplacement
    environmentGrid.clear();
    environmentGrid.lineStyle(1.5, 0x0c1328, 1);
    for (let x = 0; x < WORLD_WIDTH; x += GRID_SIZE) {
        environmentGrid.moveTo(x, 0);
        environmentGrid.lineTo(x, WORLD_HEIGHT);
    }
    for (let y = 0; y < WORLD_HEIGHT; y += GRID_SIZE) {
        environmentGrid.moveTo(0, y);
        environmentGrid.lineTo(WORLD_WIDTH, y);
    }

    // Allocation des poussières de plancton passives
    for (let i = 0; i < 70; i++) {
        planktonDust.push(new DeepPlankton());
    }

    // Répartition uniforme de la flore marine bioluminescente
    for (let i = 0; i < 90; i++) {
        plants.push(new BioluminescentPlant(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT));
    }

    // Génération équilibrée de la faune concurrente autonome
    for (let i = 0; i < gameState.maxConcurrentAI; i++) {
        const assignedDiet = Math.random() > 0.52 ? 'herbivore' : 'carnivore';
        const spawnedCoordinateX = Math.random() * WORLD_WIDTH;
        const spawnedCoordinateY = Math.random() * WORLD_HEIGHT;

        if (calculateDistance(spawnedCoordinateX, spawnedCoordinateY, WORLD_WIDTH / 2, WORLD_HEIGHT / 2) > 280) {
            cells.push(new Organism(spawnedCoordinateX, spawnedCoordinateY, Math.random() * 13 + 9, false, assignedDiet));
        }
    }

    const initialDietModal = document.getElementById('dietModal');
    if (initialDietModal) initialDietModal.classList.add('hidden');
    
    gameState.paused = false;
    triggerBioSound(340, 0.45, 'sine', 0.15);
}

// Assignation des événements sur le panneau sélecteur initial
const herbivoreSelectorBtn = document.getElementById('btn-herbivore');
const carnivoreSelectorBtn = document.getElementById('btn-carnivore');
if (herbivoreSelectorBtn) herbivoreSelectorBtn.addEventListener('click', () => initializeEcologicalWorld('herbivore'));
if (carnivoreSelectorBtn) carnivoreSelectorBtn.addEventListener('click', () => initializeEcologicalWorld('carnivore'));

// =============================================================================
// INTERFACES LOGIQUES ET BOUTIQUE LABORATOIRE GENETIQUE
// =============================================================================
function displayGeneticsShop() {
    gameState.paused = true;
    const shopModalContainer = document.getElementById('mutationModal');
    const nodesChoicesWrapper = document.getElementById('mutationChoices');
    
    if (!shopModalContainer || !nodesChoicesWrapper) return;
    nodesChoicesWrapper.innerHTML = '';

    const dnaCounterText = document.getElementById('shop-dna');
    if (dnaCounterText) dnaCounterText.textContent = player.dnaPool;
    
    const globalEvolveActionBtn = document.getElementById('evolveBtn');
    if (globalEvolveActionBtn) globalEvolveActionBtn.style.display = 'none';

    Object.keys(SHOP_CATALOG).forEach(indexKey => {
        const template = SHOP_CATALOG[indexKey];
        const ownedInstances = player.mutationsRegistry.filter(m => m.id === template.id).length;
        const purchaseConditionMet = player.dnaPool >= template.cost && ownedInstances < template.max;

        const widgetRow = document.createElement('div');
        widgetRow.className = 'mutation-item';
        widgetRow.style.display = 'flex';
        widgetRow.style.justifyContent = 'space-between';
        widgetRow.style.alignItems = 'center';
        widgetRow.style.marginBottom = '12px';
        widgetRow.style.padding = '10px';
        widgetRow.style.background = 'rgba(255, 255, 255, 0.04)';
        widgetRow.style.borderRadius = '6px';

        widgetRow.innerHTML = `
            <div>
                <strong style="color: #00ffd2;">${template.emoji} ${template.name}</strong> (${ownedInstances}/${template.max})<br>
                <small style="color: #ccc; font-size: 11px;">${template.desc}</small>
            </div>
            <div style="text-align: right;">
                <span style="display: block; color: #ffd700; font-weight: bold; font-size: 13px; margin-bottom: 4px;">${template.cost} ADN</span>
                <button class="buy-btn" ${purchaseConditionMet ? '' : 'disabled'} style="padding: 4px 10px; font-weight: bold; cursor: pointer;">Acheter</button>
            </div>
        `;

        if (purchaseConditionMet) {
            widgetRow.querySelector('.buy-btn').onclick = () => {
                if (player.acquireGenetics(indexKey)) displayGeneticsShop();
            };
        }
        nodesChoicesWrapper.appendChild(widgetRow);
    });

    shopModalContainer.classList.remove('hidden');
}

// Liaisons sur boutons du DOM HUD
const closeShopActionBtn = document.getElementById('closeShopBtn');
if (closeShopActionBtn) {
    closeShopActionBtn.addEventListener('click', () => {
        const shopModal = document.getElementById('mutationModal');
        if (shopModal) shopModal.classList.add('hidden');
        gameState.paused = false;
    });
}

const triggerEvolveActionBtn = document.getElementById('evolveBtn');
if (triggerEvolveActionBtn) {
    triggerEvolveActionBtn.addEventListener('click', () => displayGeneticsShop());
}

const systemRestartActionBtn = document.getElementById('restartBtn');
if (systemRestartActionBtn) {
    systemRestartActionBtn.addEventListener('click', () => displayDietSelectionModal());
}

// Validation de l'existence ou injection sécurisée du déclencheur de l'arbre
let treeUIPanBtn = document.getElementById('viewTreeBtn');
if (!treeUIPanBtn) {
    const UIActionGroup = document.querySelector('.controls');
    if (UIActionGroup) {
        treeUIPanBtn = document.createElement('button');
        treeUIPanBtn.id = 'viewTreeBtn';
        treeUIPanBtn.className = 'btn-game';
        treeUIPanBtn.innerHTML = '🌳 Arbre Génétique';
        treeUIPanBtn.style.marginLeft = '8px';
        UIActionGroup.appendChild(treeUIPanBtn);
    }
}

if (treeUIPanBtn) {
    treeUIPanBtn.addEventListener('click', () => {
        gameState.paused = true;
        processAndRenderTreeUI();
        const treeModal = document.getElementById('treeModal');
        if (treeModal) treeModal.classList.remove('hidden');
    });
}

const shutdownTreeUIBtn = document.getElementById('closeTreeBtn');
if (shutdownTreeUIBtn) {
    shutdownTreeUIBtn.addEventListener('click', () => {
        const treeModal = document.getElementById('treeModal');
        if (treeModal) treeModal.classList.add('hidden');
        gameState.paused = false;
    });
}

// =============================================================================
// MAIN TICKER LOOP : TRAITEMENT NUMÉRIQUE CYCLIQUE ET INTERPOLATION CAMÉRA
// =============================================================================
app.ticker.add((delta) => {
    if (gameState.paused || !player) return;

    gameState.age += delta;
    gameState.elapsedFrames++;

    // Synchronisation constante des valeurs textuelles du HUD
    const sizeOutputLabel = document.getElementById('size');
    const ageOutputLabel = document.getElementById('age');
    const populationOutputLabel = document.getElementById('population');
    const mutationEvolutionLauncherBtn = document.getElementById('evolveBtn');

    if (sizeOutputLabel) sizeOutputLabel.textContent = Math.floor(player.size);
    if (ageOutputLabel) ageOutputLabel.textContent = Math.floor(gameState.age / 60);
    if (populationOutputLabel) populationOutputLabel.textContent = cells.length;
    if (mutationEvolutionLauncherBtn) {
        mutationEvolutionLauncherBtn.style.display = (player.dnaPool >= 15) ? 'inline-block' : 'none';
    }

    // --- INTERPRÉTATION DU VECTEUR DE DÉPLACEMENT SOURIS ---
    const vectorHeadingX = inputMouse.x - window.innerWidth / 2;
    const vectorHeadingY = inputMouse.y - window.innerHeight / 2;
    const vectorRadiusLength = Math.sqrt(vectorHeadingX * vectorHeadingX + vectorHeadingY * vectorHeadingY);

    if (vectorRadiusLength > 16) {
        player.vx = vectorHeadingX / vectorRadiusLength;
        player.vy = vectorHeadingY / vectorRadiusLength;
    } else {
        player.vx = 0;
        player.vy = 0;
    }

    player.update(delta);
    player.calculatePhysicsAnimation(gameState.age);

    // Animation plancton passive
    planktonDust.forEach(dust => dust.animate(gameState.age));

    // --- ACCROISSEMENT CONTROLLÉ DE LA FLORE ---
    if (Math.random() < 0.035 && plants.length < gameState.plantsMaxConcurrent) {
        plants.push(new BioluminescentPlant(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT));
    }

    // --- ÉVALUATION DES ENCHEVÊTREMENTS VEGETAUX (HERBIVORES CORES) ---
    for (let i = plants.length - 1; i >= 0; i--) {
        const leafInstance = plants[i];
        leafInstance.pulseAnimation(gameState.age);

        for (let j = 0; j < cells.length; j++) {
            if (cells[j].diet === 'herbivore' && cells[j].checkCollision(leafInstance)) {
                cells[j].consumeTarget('plant', leafInstance);
                leafInstance.clear();
                plants.splice(i, 1);
                break;
            }
        }

        if (plants[i] && player.diet === 'herbivore' && player.checkCollision(leafInstance)) {
            player.consumeTarget('plant', leafInstance);
            leafInstance.clear();
            plants.splice(i, 1);
        }
    }

    // --- PROTOCOLES DE CHASSE ET AFFRONTEMENTS DE LA FAUNE CONCURRENTE ---
    for (let i = cells.length - 1; i >= 0; i--) {
        const adversarialAI = cells[i];

        if (adversarialAI.healthPoints <= 0) {
            adversarialAI.destroy();
            cells.splice(i, 1);
            continue;
        }

        // Le joueur est un prédateur carnivore : il attaque les cibles plus petites
        if (player.diet === 'carnivore' && player.size > adversarialAI.size * 1.15 && player.checkCollision(adversarialAI)) {
            player.consumeTarget('cell', adversarialAI);
            adversarialAI.destroy();
            cells.splice(i, 1);
            continue;
        }

        // L'IA est un monstre carnivore : elle mord le joueur
        if (adversarialAI.diet === 'carnivore' && adversarialAI.size > player.size * 1.15 && adversarialAI.checkCollision(player)) {
            if (!player.inflictDamage(adversarialAI.size * 0.35)) {
                alert(`🧬 Lignée éteinte ! Tu as atteint la génération ${gameState.generationIndex}.`);
                displayDietSelectionModal();
                return;
            }
        }

        // Carnages inter-IA autonomes
        for (let k = cells.length - 1; k >= 0; k--) {
            if (i !== k && cells[k] && adversarialAI.diet === 'carnivore' && adversarialAI.size > cells[k].size * 1.15 && adversarialAI.checkCollision(cells[k])) {
                adversarialAI.consumeTarget('cell', cells[k]);
                cells[k].destroy();
                cells.splice(k, 1);
                if (k < i) i--;
            }
        }
    }

    computeArtificialIntelligence(delta);

    // --- RECYCLAGE DES TRAILS ET EFFETS PARTICULAIRES DE STRUCTURES ---
    for (let i = visualParticles.length - 1; i >= 0; i--) {
        visualParticles[i].progress(delta);
        if (visualParticles[i].lifespan <= 0) {
            visualParticles[i].clear();
            visualParticles.splice(i, 1);
        }
    }

    for (let i = damageTexts.length - 1; i >= 0; i--) {
        damageTexts[i].progress(delta);
        if (damageTexts[i].duration <= 0) {
            damageTexts[i].clear();
            damageTexts.splice(i, 1);
        }
    }

    // --- ENGIN DE CAMÉRA AMORTIE (LINEAR INTERPOLATION + IMPACT MATRIX SHAKE) ---
    let coordinateModifierX = 0;
    let coordinateModifierY = 0;
    
    if (gameState.shakeMatrixIntensity > 0) {
        coordinateModifierX = (Math.random() - 0.5) * gameState.shakeMatrixIntensity;
        coordinateModifierY = (Math.random() - 0.5) * gameState.shakeMatrixIntensity;
        gameState.shakeMatrixIntensity -= 0.22 * delta;
    }

    const optimalCameraViewpointX = window.innerWidth / 2 - player.x;
    const optimalCameraViewpointY = window.innerHeight / 2 - player.y;

    // Simulation de la friction d'un liquide par lissage fluide (Lerp Factor)
    const fluidLagInertia = 0.08 * delta;
    app.stage.pivot.x = mathLerp(app.stage.pivot.x, player.x - window.innerWidth / 2, fluidLagInertia) + coordinateModifierX;
    app.stage.pivot.y = mathLerp(app.stage.pivot.y, player.y - window.innerHeight / 2, fluidLagInertia) + coordinateModifierY;
});

// Établir le déclenchement forcé du choix de l'alimentation au lancement initial
window.addEventListener('DOMContentLoaded', () => {
    displayDietSelectionModal();
});
