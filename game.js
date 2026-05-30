// ===== CONFIGURATION =====
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1200;

// ===== CANVAS SETUP =====
const canvas = document.getElementById('gameCanvas');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext('2d');

let gameState = {
    paused: false,
    age: 0,
    cameraX: 0,
    cameraY: 0
};

// ===== CLASSE CELLULE =====
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
        this.color = this.getColor();
        
        // Nouvelles stats
        this.attackPower = 1;
        this.defense = 1;
        this.hp = size * 10;
    }

    getColor() {
        if (this.isPlayer) {
            return '#00ff00';
        }
        const hue = (this.x + this.y) % 360;
        return `hsl(${hue}, 70%, 50%)`;
    }

    applyMutation(mutationName) {
        const mutations = {
            flagelle: { 
                name: 'Flagelle', 
                effect: () => { this.speed *= 1.5; }
            },
            spike: { 
                name: 'Spike', 
                effect: () => { this.attackPower *= 1.3; }
            },
            shield: { 
                name: 'Shield', 
                effect: () => { this.defense *= 1.2; this.size *= 1.1; }
            },
            sizeburst: { 
                name: 'Grosse Bombe', 
                effect: () => { this.size *= 1.3; this.hp *= 1.5; }
            }
        };

        const mutation = mutations[mutationName];
        if (!mutation) return;

        this.mutations.push(mutation);
        mutation.effect();
    }

    takeDamage(damage) {
        const actualDamage = damage / this.defense;
        this.hp -= actualDamage;
        return this.hp > 0;
    }

    attackCell(other) {
        if (this.mutations.find(m => m.name === 'Spike')) {
            const damage = this.size * 0.5 * this.attackPower;
            other.takeDamage(damage);
        }
    }

    update() {
        this.x += this.vx * this.speed;
        this.y += this.vy * this.speed;

        this.x = Math.max(this.size, Math.min(WORLD_WIDTH - this.size, this.x));
        this.y = Math.max(this.size, Math.min(WORLD_HEIGHT - this.size, this.y));

        this.energy -= this.speed * 0.1;
        this.age++;

        if (this.hp <= 0 || this.energy <= 0) {
            return false;
        }

        return true;
    }

    draw(ctx, cameraX, cameraY) {
        const screenX = this.x - cameraX;
        const screenY = this.y - cameraY;

        if (screenX < -this.size || screenX > CANVAS_WIDTH + this.size ||
            screenY < -this.size || screenY > CANVAS_HEIGHT + this.size) {
            return;
        }

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 0.8;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        ctx.strokeStyle = this.isPlayer ? '#00ff00' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (this.mutations.find(m => m.name === 'Spike')) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const x1 = screenX + Math.cos(angle) * this.size;
                const y1 = screenY + Math.sin(angle) * this.size;
                const x2 = screenX + Math.cos(angle) * (this.size + 12);
                const y2 = screenY + Math.sin(angle) * (this.size + 12);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }

        if (this.isPlayer) {
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('TOI', screenX, screenY - this.size - 15);
        }
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
        return true;
    }
}

// ===== GAME WORLD =====
let player = null;
let cells = [];

function initGame() {
    player = new Cell(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 15, true);
    cells = [];
    gameState.age = 0;
    nextMutationSize = 10;

    for (let i = 0; i < 30; i++) {
        const x = Math.random() * WORLD_WIDTH;
        const y = Math.random() * WORLD_HEIGHT;
        const size = Math.random() * 8 + 5;
        cells.push(new Cell(x, y, size, false));
    }
}

// ===== SOURIS =====
let mouseX = CANVAS_WIDTH / 2;
let mouseY = CANVAS_HEIGHT / 2;

document.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

// ===== MUTATIONS =====
const MUTATION_LIMITS = {
    flagelle: 2,
    spike: 2,
    shield: 2,
    sizeburst: 1
};

let nextMutationSize = 10;

function checkMutations() {
    if (player.size >= nextMutationSize) {
        const availableMutations = Object.keys(MUTATION_LIMITS).filter(mut => {
            const mutationName = {
                flagelle: 'Flagelle',
                spike: 'Spike',
                shield: 'Shield',
                sizeburst: 'Grosse Bombe'
            }[mut];
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
            modal.classList.add('hidden');
            gameState.paused = false;
        });
        
        choices.appendChild(btn);
    });

    modal.classList.remove('hidden');
    gameState.paused = true;
}

// ===== UPDATE GAME LOGIC =====
function update() {
    if (gameState.paused) return;

    gameState.age++;

    const targetX = gameState.cameraX + mouseX;
    const targetY = gameState.cameraY + mouseY;
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 10) {
        player.vx = dx / dist;
        player.vy = dy / dist;
    } else {
        player.vx = 0;
        player.vy = 0;
    }

    player.update();

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
            if (playerDist < 300 && playerDist < closestDist) {
                targetCell = player;
                closestDist = playerDist;
            }
        }

        if (targetCell && closestDist < 250) {
            const dx = targetCell.x - cell.x;
            const dy = targetCell.y - cell.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            cell.vx = dx / d;
            cell.vy = dy / d;
        } else {
            if (Math.random() < 0.02) {
                cell.vx = Math.random() * 2 - 1;
                cell.vy = Math.random() * 2 - 1;
            }
        }

        if (!cell.update()) {
            cells.splice(i, 1);
            continue;
        }

        if (cell.size > 30 && Math.random() < 0.01) {
            cells.push(new Cell(cell.x + 20, cell.y, cell.size * 0.4, false));
            cell.size *= 0.8;
        }
    }

    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        if (player.canEat(cell)) {
            const dist = player.distanceTo(cell);
            if (dist < player.size + cell.size) {
                player.eat(cell);
                cells.splice(i, 1);
            }
        }
    }

    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            const dist = cells[i].distanceTo(cells[j]);
            if (dist < cells[i].size + cells[j].size) {
                cells[i].attackCell(cells[j]);
                cells[j].attackCell(cells[i]);

                if (cells[i].canEat(cells[j])) {
                    cells[i].eat(cells[j]);
                    cells.splice(j, 1);
                    j--;
                } else if (cells[j].canEat(cells[i])) {
                    cells[j].eat(cells[i]);
                    cells.splice(i, 1);
                    i--;
                    break;
                }
            }
        }
    }

    for (let i = cells.length - 1; i >= 0; i--) {
        const cell = cells[i];
        const dist = cell.distanceTo(player);
        
        if (dist < cell.size + player.size) {
            cell.attackCell(player);
            player.attackCell(cell);

            if (player.canEat(cell)) {
                player.eat(cell);
                cells.splice(i, 1);
            } else if (cell.canEat(player)) {
                if (!player.takeDamage(cell.size * 0.8)) {
                    alert(`Game Over!\nÂge: ${gameState.age}\nTaille: ${Math.floor(player.size)}`);
                    initGame();
                    return;
                }
            }
        }
    }

    gameState.cameraX = player.x - CANVAS_WIDTH / 2;
    gameState.cameraY = player.y - CANVAS_HEIGHT / 2;
    gameState.cameraX = Math.max(0, Math.min(WORLD_WIDTH - CANVAS_WIDTH, gameState.cameraX));
    gameState.cameraY = Math.max(0, Math.min(WORLD_HEIGHT - CANVAS_HEIGHT, gameState.cameraY));

    checkMutations();
    updateHUD();
}

// ===== RENDER =====
function draw() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const gridSize = 100;
    for (let x = -gameState.cameraX % gridSize; x < CANVAS_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
    }
    for (let y = -gameState.cameraY % gridSize; y < CANVAS_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
    }

    cells.forEach(cell => cell.draw(ctx, gameState.cameraX, gameState.cameraY));
    player.draw(ctx, gameState.cameraX, gameState.cameraY);
}

// ===== HUD =====
function updateHUD() {
    document.getElementById('size').textContent = Math.floor(player.size);
    document.getElementById('age').textContent = gameState.age;
    document.getElementById('population').textContent = cells.length;
}

// ===== BUTTONS =====
document.getElementById('restartBtn').addEventListener('click', () => {
    initGame();
    gameState.paused = false;
    document.getElementById('mutationModal').classList.add('hidden');
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    gameState.paused = !gameState.paused;
    document.getElementById('pauseBtn').textContent = gameState.paused ? '▶️ Jouer' : '⏸️ Pause';
});

// ===== GAME LOOP =====
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

initGame();
gameLoop();
