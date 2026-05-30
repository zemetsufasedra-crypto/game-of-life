// ===== MUTATIONS =====

// Système de mutations limitées
const MUTATION_LIMITS = {
    flagelle: 2,      // Max 2x
    spike: 2,         // Max 2x
    shield: 2,        // Max 2x
    sizeburst: 1      // Max 1x (l'OP)
};

let nextMutationSize = 10;

function checkMutations() {
    if (player.size >= nextMutationSize) {
        // Filtre les mutations déjà au max
        const availableMutations = Object.keys(MUTATION_LIMITS).filter(mut => {
            const count = player.mutations.filter(m => m.name === MUTATION_LIMITS[mut]).length;
            // Compte les mutations actives (c'est pas parfait mais c'est un fix rapide)
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
