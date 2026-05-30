// ===== CONFIGURATION =====
const GRID_WIDTH = 80;
const GRID_HEIGHT = 60;
const CELL_SIZE = 8;

// ===== ÉTAT =====
let grid = [];
let nextGrid = [];
let isRunning = false;
let generation = 0;
let gameSpeed = 150;

// Règles (ce qu'on va faire varier)
let birthRule = 3;      // Une cellule morte naît si exactement 3 voisins
let surviveMin = 2;     // Une cellule vivante survive si >= 2 voisins
let surviveMax = 3;     // Une cellule vivante survive si <= 3 voisins

// ===== CANVAS SETUP =====
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = GRID_WIDTH * CELL_SIZE;
canvas.height = GRID_HEIGHT * CELL_SIZE;

// Clique sur le canvas pour placer des cellules
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
    
    if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
        grid[y][x] = grid[y][x] ? 0 : 1;  // Toggle la cellule
        draw();
    }
});

// ===== FONCTIONS CORE =====

// Initialise une grille vide
function initGrid(randomize = false) {
    grid = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
        grid[y] = [];
        for (let x = 0; x < GRID_WIDTH; x++) {
            grid[y][x] = randomize ? Math.random() > 0.8 ? 1 : 0 : 0;
        }
    }
    nextGrid = JSON.parse(JSON.stringify(grid));
    generation = 0;
    updateStats();
    draw();
}

// IMPORTANT: Compte les voisins vivants autour d'une cellule
function countNeighbors(x, y) {
    let count = 0;
    
    // Les 8 voisins (haut, bas, gauche, droite, diagonales)
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue; // La cellule elle-même
            
            // Wrap around (la grille se referme sur elle-même)
            let nx = (x + dx + GRID_WIDTH) % GRID_WIDTH;
            let ny = (y + dy + GRID_HEIGHT) % GRID_HEIGHT;
            
            count += grid[ny][nx];
        }
    }
    return count;
}

// LA RÈGLE: détermine si une cellule vit ou meurt à la prochaine génération
function updateGrid() {
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            let neighbors = countNeighbors(x, y);
            let cell = grid[y][x];
            
            if (cell === 1) {
                // Cellule vivante
                // Elle survit si elle a entre surviveMin et surviveMax voisins
                nextGrid[y][x] = (neighbors >= surviveMin && neighbors <= surviveMax) ? 1 : 0;
            } else {
                // Cellule morte
                // Elle naît si elle a exactement birthRule voisins
                nextGrid[y][x] = (neighbors === birthRule) ? 1 : 0;
            }
        }
    }
    
    // Swap: la prochaine génération devient la génération actuelle
    [grid, nextGrid] = [nextGrid, grid];
    generation++;
    updateStats();
}

// Affiche la grille sur le canvas
function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#00ff00';
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (grid[y][x]) {
                ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
            }
        }
    }
}

// Compte la population actuelle
function countPopulation() {
    let count = 0;
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            count += grid[y][x];
        }
    }
    return count;
}

// Met à jour les stats affichées
function updateStats() {
    document.getElementById('generation').textContent = generation;
    document.getElementById('population').textContent = countPopulation();
}

// La boucle d'animation
function gameLoop() {
    if (isRunning) {
        updateGrid();
        draw();
    }
    setTimeout(gameLoop, gameSpeed);
}

// ===== BOUTONS =====

document.getElementById('playBtn').addEventListener('click', () => {
    isRunning = true;
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    isRunning = false;
});

document.getElementById('resetBtn').addEventListener('click', () => {
    isRunning = false;
    initGrid(false);
});

document.getElementById('randomBtn').addEventListener('click', () => {
    initGrid(true);
});

// ===== SLIDERS (varier les règles) =====

document.getElementById('birthRule').addEventListener('input', (e) => {
    birthRule = parseInt(e.target.value);
    document.getElementById('birthValue').textContent = birthRule;
});

document.getElementById('surviveMin').addEventListener('input', (e) => {
    surviveMin = parseInt(e.target.value);
    document.getElementById('surviveMinValue').textContent = surviveMin;
});

document.getElementById('surviveMax').addEventListener('input', (e) => {
    surviveMax = parseInt(e.target.value);
    document.getElementById('surviveMaxValue').textContent = surviveMax;
});

document.getElementById('speed').addEventListener('input', (e) => {
    gameSpeed = parseInt(e.target.value);
    document.getElementById('speedValue').textContent = gameSpeed;
});
// Ajoute au top du fichier, après les variables
const populationHistory = [];

// Dans updateStats(), rajoute:
populationHistory.push(countPopulation());
if (populationHistory.length > 200) populationHistory.shift();
// ===== DÉMARRAGE =====
initGrid(false);
gameLoop();
