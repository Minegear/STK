let currentData = null;
let currentExo = null;
let currentStep = 0;
let currentCategory = null;
let targetsLeftInStep = [];
let consecutiveErrors = 0;
let isClickable = true;
let startTime = null;
let restoreClickTimerGarder = null;
let currentScore = 0;
let totalQuestions = 0;
let totalErrors = 0;
let userIdentifier = '';
let identMode = 'eleve';

// -----------------------------------------------------------------------
// CONFIGURATION SUPABASE
// Remplissez ces deux valeurs depuis :
//   Dashboard Supabase > Project Settings > API
// -----------------------------------------------------------------------
const SUPABASE_URL = 'https://iohgfwhwsyddqeeycgxw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvaGdmd2h3c3lkZHFlZXljZ3h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMDMyMTUsImV4cCI6MjA5NTU3OTIxNX0.uLoW4w6n5ICnKokimkJM7K25nnooA5OeW0Eo3C3jdBw';      // clé "anon / public"
// -----------------------------------------------------------------------

// --- INITIALISATION ---

fetch('exercices.json')
    .then(response => response.json())
    .then(data => {
        currentData = data;
        showMenu();
        // Vérification de l'identification sauvegardée
        const savedId = localStorage.getItem('userIdentifier');
        if (savedId) {
            userIdentifier = savedId;
            updateUserDisplay();
            document.getElementById('identification-modal').classList.add('hidden');
        }
        // Sinon, la modal reste visible (pas de classe "hidden" par défaut)
    });

// --- NAVIGATION ET INTERFACE ---

// Gère l'affichage du fil d'Ariane (Accueil > Catégorie > Exercice)
function updateBreadcrumb(category = null, exo = null) {
    const nav = document.getElementById('nav-breadcrumb');
    let html = '<a href="#" onclick="showMenu()">Accueil</a>';

    if (category) {
        let targetId = category.id;
        let displayName = category.nom;

        if (category.id.includes('vrai_faux')) {
            targetId = 'vrai_faux_group';
            displayName = 'Vrai ou Faux';
        } else if (category.id.includes('anaphore')) {
            targetId = 'anaphore_group';
            displayName = 'Anaphore';
        } else if (category.id.includes('qui_est_ce')) {
            targetId = 'qui_est_ce_group';
            displayName = 'Qui est-ce ?';
        }

        html += ` > <a href="#" onclick="startCategory('${targetId}')">${displayName}</a>`;
    }

    if (exo) {
        const name = exo.id.split('_').pop().toUpperCase();
        html += ` > ${name}`;
    }

    nav.innerHTML = html;
}

// Affiche l'écran d'accueil avec les trois grands piliers
function showMenu() {
    const allVideos = document.querySelectorAll('video');
    allVideos.forEach(v => {
        v.pause();
        v.currentTime = 0;
    });

    const menu = document.getElementById('menu-container');
    const exoCont = document.getElementById('exercise-container');
    const modal = document.getElementById('context-modal');
    if (modal) modal.classList.add('hidden');
    menu.classList.remove('hidden');
    exoCont.classList.add('hidden');
    updateBreadcrumb();

    const mainPillars = [
        { id: 'qui_est_ce_group', nom: 'Qui est-ce ?', desc: 'Un jeu d’élimination pour trouver l’animal mystère.' },
        { id: 'vrai_faux_group', nom: 'Vrai ou Faux', desc: 'Associez des signes LSF à des images ou inversement.' },
        { id: 'anaphore_group', nom: 'Anaphore', desc: 'Travaillez les liens entre le français et la LSF.' }
    ];

    menu.innerHTML = mainPillars.map(pillar => `
        <div class="card">
            <h3>${pillar.nom}</h3>
            <p>${pillar.desc}</p>
            <button class="btn-play" onclick="startCategory('${pillar.id}')">Faire l'exercice</button>
        </div>
    `).join('');
}

// --- GESTION DES CATÉGORIES ET SOUS-MENUS ---

// Redirige vers le bon sous-menu ou le bon écran selon la catégorie choisie
function startCategory(catId) {
    const container = document.getElementById('exercise-container');
    const menu = document.getElementById('menu-container');
    const category = currentData.categories.find(c => c.id === catId);

    menu.classList.add('hidden');
    container.classList.remove('hidden');
    currentStep = 0; 

    if (catId === 'vrai_faux_group') {
        updateBreadcrumb({ id: 'vrai_faux_group', nom: 'Vrai ou Faux' });
        showSubMenuVraiFaux();
    }
    else if (catId === 'anaphore_group') {
        updateBreadcrumb({ id: 'anaphore_group', nom: 'Anaphore' });
        showSubMenuAnaphore();
    }
    else if (catId === 'qui_est_ce_group') {
        updateBreadcrumb({ id: 'qui_est_ce_group', nom: 'Qui est-ce ?' });
        showSubMenuQuiEstCeGroup();
    }
    else if (category) {
        updateBreadcrumb(category);
        if (category.id === 'cat_anaphore_lsf') {
            showAnaphoreRecit(category);
        }
        else if (category.id.includes('cat_anaphore')) {
            showAnaphoreConsigne(category);
        }
        else if (category.id.includes('qui_est_ce')) {
            showSubMenuQuiEstCe(category);
        } else {
            loadExercise(category, 0);
        }
    }
}

// Affiche les variantes du mode Vrai ou Faux
function showSubMenuVraiFaux() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="help-button-container">
            <button class="btn-help" onclick="openConsigneModal('vrai_faux_group')">?</button>
        </div>
        <div class="submenu-selection">
            <h2>Choisissez le mode :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_vrai_faux_image')">Trouver le mot (Vidéo -> Image)</button>
                <button class="btn-variant" onclick="startCategory('cat_vrai_faux_vidéo')">Trouver le geste (Image -> Vidéo)</button>
            </div>
        </div>`;
}

// Affiche le choix de mode pour "Qui est-ce ?" (Garder ou Éliminer)
function showSubMenuQuiEstCeGroup() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Choisissez le mode :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_qui_est_ce_garder')">
                    Sélectionner les animaux qui correspondent
                </button>
                <button class="btn-variant" onclick="startCategory('cat_qui_est_ce_eliminer')">
                    Éliminer les animaux qui ne correspondent pas
                </button>
            </div>
        </div>`;
}

// Affiche les différents exercices d'Anaphore
function showSubMenuAnaphore() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="help-button-container">
            <button class="btn-help" onclick="openConsigneModal('anaphore_group')">?</button>
        </div>
        <div class="submenu-selection">
            <h2>Choisissez l'exercice d'anaphore :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="loadExerciseById('cat_anaphore_lsf', 'ana_lsf_pouce')">Anaphore LSF</button>
                <button class="btn-variant" onclick="loadExerciseById('cat_anaphore_fr>lsf', 'ana_fr>lsf_compter')">Pont Français > LSF</button>
                <button class="btn-variant" onclick="loadExerciseById('cat_anaphore_lsf>fr', 'ana_lsf>fr_cachecache')">Pont LSF > Français</button>
                <button class="btn-variant" onclick="loadExerciseById('cat_anaphore_fr', 'ana_fr_ils')">Anaphore Français écrit</button>
            </div>
        </div>`;
}

// Affiche la liste des exercices pour "Qui est-ce ?"
function showSubMenuQuiEstCe(category) {
    let html = `
        <div class="help-button-container">
            <button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button>
        </div>
        <div class="submenu-selection"><h2>Choisissez votre défi :</h2><div class="options-grid">`;
    html += category.exercices.map((exo, index) => `
        <button class="btn-variant" onclick="loadExerciseById('${category.id}', '${exo.id}')">
            ${index + 1}. ${exo.id.split('_').pop().toUpperCase()}
        </button>`).join('');
    html += `</div></div>`;
    document.getElementById('exercise-container').innerHTML = html;
}

// --- LOGIQUE DE CHARGEMENT ---

// Recherche un exercice par son ID et gère son lancement initial
function loadExerciseById(catId, exoId) {
    const category = currentData.categories.find(c => c.id === catId);
    let index = -1;
    
    if (category.exercices) {
        index = category.exercices.findIndex(e => e.id === exoId);
    } else if (category.questions) {
        index = category.questions.findIndex(q => q.id === exoId);
    }

    if (index !== -1) {
        if (category.id === 'cat_anaphore_lsf' && index === 0) {
            showAnaphoreRecit(category);
        } 
        else if (category.id.includes('cat_anaphore') && index === 0) {
            showAnaphoreConsigne(category);
        } 
        else if (category.type === 'grille_elimination') {
            currentStep = 0; 
            loadExercise(category, index);
        }
        else {
            loadExercise(category, index);
        }
    }
}

// Prépare et affiche l'interface de l'exercice sélectionné
function loadExercise(category, index) {
    currentCategory = category;
    if (category.type !== 'grille_elimination') {
        currentStep = index;
    }
    const container = document.getElementById('exercise-container');
    const item = category.exercices ? category.exercices[index] : category.questions[index];
    if (!item) return;
    currentExo = item;

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category, item);

    // Réinitialisation des scores et du chrono au début d'un exercice
    if (index === 0) {
        currentScore = 0;
        totalQuestions = 0;
        totalErrors = 0;
        startTime = Date.now();
    }


    if (category.type === 'grille_elimination') {
        const renderFn = category.id === 'cat_qui_est_ce_garder' ? renderQuiEstCeGarder : renderQuiEstCe;
        container.innerHTML = `<h2>${item.titre}</h2>` + renderFn(category, item);
        return;
    }

    let html = "";
    if (category.video_contexte) {
        html += renderAnaphoreGeneric(category, item);
    }

    html += `<h2>${item.titre || category.nom}</h2>`;
    html += `<div class="consigne-container">`;
    
    if (category.id === "cat_anaphore_fr") {
        let fullText = "Lou, son grand frère Liam et sa petite sœur Julie sont dans le jardin. Ils jouent à cache-cache. La plus jeune doit trouver les autres. Elle commence à compter près de l’arbre. Son frère court derrière le buisson. Ça lui fait une bonne cachette. Sa sœur va dans le garage et se glisse entre la voiture et les vélos. Sans faire exprès, elle les fait tomber. Julie a fini de compter et elle part à leur recherche. Elle voit bouger quelque chose derrière le toboggan. Mais c’est Milou qui aboie et veut jouer ! Julie lui dit : « Aide-moi à les trouver ! Est-ce que tu les as vus près du buisson ? ». Elle y va, accompagnée de son chien, et ils trouvent Liam. Ce dernier l’aide à chercher Lou qui semble bien cachée. Ils se dirigent vers le garage. Ils y entrent. Là, ils découvrent leurs vélos par terre. Ils les poussent et trouvent enfin leur sœur. Tout contents de cette bonne partie, ils rentrent goûter.";

        if (item.phrase && item.target) {
            let phraseHighlighted = item.phrase.replace(item.target, `<u>${item.target}</u>`);
            let finalSentence = `<strong>${phraseHighlighted}</strong>`;
            
            fullText = fullText.replace(item.phrase, finalSentence);
        }

        html += `
            <div class="recit-reference-card">
                <h3>Texte de référence</h3>
                <p>${fullText}</p>
            </div>`;
    }

    if (item.video) {
        html += `<video class="video-main" controls autoplay src="${item.video}"></video>`;
    } else if (item.image) {
        html += `<div class="text-center"><img src="${item.image}" class="img-main-qcm"></div>`;
    }

    if (item.text || item.phrase) {
        let text = item.text || item.phrase;
        
        // Grisage du texte précédement présent
        if (category.id === 'cat_anaphore_fr>lsf' && index > 0) {
            const prevText = category.questions[index - 1].text;
            
            if (text.startsWith(prevText)) {
                const newPart = text.substring(prevText.length);
                text = `<span class="text-history">${prevText}</span><span class="text-new">${newPart}</span>`;
            }
        }

        if (item.target) {
            const regex = new RegExp(`(${item.target})`, 'gi');
            text = text.replace(regex, `<span class="target-text">$1</span>`);
        }
        html += `<div class="card-text-consigne"><p>${text}</p></div>`;
    }
    html += `</div>`;

    const gridClass = 'options-grid-horizontal';

    html += `<div class="${gridClass}">`;

    html += item.options.map((opt, i) => {
        const isMedia = typeof opt === 'string' && (opt.includes('.') || opt.includes('/'));
        const isVideo = isMedia && (opt.toLowerCase().includes('.mov') || opt.toLowerCase().includes('.mp4'));

        return `
            <div class="option-card" id="opt-${i}" onclick="selectOption(${i})">
                <div class="media-container ${!isMedia ? 'text-option-padding' : ''}">
                    ${isMedia ? 
                        (isVideo ? 
                            `<div class="video-wrapper">
                                <video id="vid-${i}" src="${opt}" loop muted playsinline></video>
                                <div class="video-overlay"><span class="play-icon-overlay">▶</span></div>
                             </div>` : 
                            `<img src="${opt}">`
                        ) : 
                        `<p class="text-choice">${opt}</p>`
                    }
                </div>
                <input type="radio" name="qcm" id="check-${i}" style="display:none;">
            </div>`;
    }).join('');
    
    html += `</div><button class="btn-play btn-validate" onclick="validateQCM()" style="font-size: 2.5rem; padding: 10px 60px;">✓</button>`;
    container.innerHTML = html;

}

// --- FONCTIONS DE RENDU (TEMPLATES) ---

// Affiche la vidéo du récit complet pour les anaphores
function showAnaphoreRecit(category) {
    const container = document.getElementById('exercise-container');
    const videoSrc = category.video_contexte || ""; 

    container.innerHTML = `
        <div class="consigne-screen recit-screen">
            <h2>Récit complet</h2>
            <p>Regardez attentivement l'histoire avant de passer aux consignes.</p>
            <video class="video-main" controls autoplay src="${videoSrc}"></video>
            <div class="text-center" style="margin-top: 20px;">
                <button class="btn-play" style="padding: 15px 40px; font-size: 1.2rem;" 
                        onclick="showAnaphoreConsigne(currentData.categories.find(c => c.id === '${category.id}'))">
                    Passer aux consignes
                </button>
            </div>
        </div>
    `;
}

// Affiche la vidéo de consigne avant de commencer l'exercice
function showAnaphoreConsigne(category) {
    const container = document.getElementById('exercise-container');
    const videoSrc = category.consignes || ""; 

    container.innerHTML = `
        <div class="consigne-screen">
            <h2>Consigne de l'exercice</h2>
            <video class="video-main" controls autoplay src="${videoSrc}"></video>
            <div class="text-center" style="margin-top: 20px;">
                <button class="btn-play" style="padding: 15px 40px; font-size: 1.2rem;" 
                        onclick="loadExercise(currentData.categories.find(c => c.id === '${category.id}'), 0)">
                    Compris !
                </button>
            </div>
        </div>
    `;
}

// Génère le bouton "Voir le récit" et sa fenêtre modale
function renderAnaphoreGeneric(category, item) {
    if (category.id === 'cat_anaphore_lsf' && category.video_contexte) {
        return `
            <div class="mini-context-container" onclick="openContextModal()">
                <video src="${category.video_contexte}"></video>
                <span>Voir le récit</span>
            </div>
            <div id="context-modal" class="modal-overlay hidden" onclick="closeContextModal()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <span class="close-modal" onclick="closeContextModal()">&times;</span>
                    <h3>Récit complet</h3>
                    <video id="modal-context-video" controls src="${category.video_contexte}"></video>
                </div>
            </div>`;
    }
    return "";
}

// Génère la grille d'animaux pour le jeu "Qui est-ce ?"
function renderQuiEstCe(category, exo) {
    window.scrollTo(0, 0);
    consecutiveErrors = 0;
    isClickable = true;
    const etape = exo.etapes[currentStep];
    targetsLeftInStep = [...etape.indices_a_retirer];

    return `
        <div class="step-counter">Étape ${currentStep + 1} / ${exo.etapes.length}</div>
        <video id="video-player" class="video-main" controls autoplay src="${etape.video}"></video>
        <div id="grille-elimination" class="grid-elimination">
            ${category.banque_animaux.map(a => `
                <div class="animal-card ${isAlreadyRemoved(a.id) ? 'already-removed' : ''}" id="animal-${a.id}" onclick="checkElimination(${a.id})">
                    <img src="${a.img}">
                </div>`).join('')}
        </div>`;
}

// --- ACTIONS ET INTERACTION ---

// Vérifie la réponse choisie dans un QCM
function validateQCM() {
    if (!isClickable) return;
    
    const selected = document.querySelector('input[name="qcm"]:checked');
    if (!selected) return;
    
    isClickable = false;
    
    const index = parseInt(selected.id.split('-')[1]);

    // Enregistrement de la réponse sans feedback visuel
    totalQuestions++;
    if (index === currentExo.reponse) currentScore++;

    setTimeout(() => {
        const nextIndex = currentStep + 1;
        const total = (currentCategory.questions || []).length;

        if (nextIndex < total) {
            loadExercise(currentCategory, nextIndex);
        } else {
            // Fin de l'exercice : envoi des données et affichage du score
            const endTime = Date.now();
            const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
            sendDataToSupabase(currentCategory.id, parseFloat(durationSeconds), currentScore, totalQuestions, null);

            showFinishModal();
            isClickable = true;
            if (currentCategory.id.includes('vrai_faux')) startCategory('vrai_faux_group');
            else if (currentCategory.id.includes('anaphore')) startCategory('anaphore_group');
            else showMenu();
        }
    }, 400);
}

// Gère l'élimination d'un animal dans "Qui est-ce ?"
function checkElimination(id) {
    if (!isClickable) return;
    isClickable = false;
    const el = document.getElementById(`animal-${id}`);
    document.getElementById('grille-elimination').classList.add('click-locked');
    
    setTimeout(() => { 
        isClickable = true; 
        document.getElementById('grille-elimination').classList.remove('click-locked'); 
    }, 1000);

    if (targetsLeftInStep.includes(id)) {
        el.classList.add('correct-removed');
        targetsLeftInStep = targetsLeftInStep.filter(tid => tid !== id);
        if (targetsLeftInStep.length === 0) handleNextStep();
    } else {
        // Erreur enregistrée silencieusement, sans feedback visuel
        totalErrors++;
        consecutiveErrors++;
        if (consecutiveErrors >= 2) {
            window.scrollTo(0, 0);
            document.getElementById('video-player').play();
            consecutiveErrors = 0;
        }
    }
}

// Passe à l'étape suivante dans le jeu d'élimination
function handleNextStep() {
    currentStep++;
    const grille = document.getElementById('grille-elimination');
    if (grille) grille.classList.add('step-validated');

    setTimeout(() => {
        if (currentStep < currentExo.etapes.length) {
            const container = document.getElementById('exercise-container');
            const renderFn = currentCategory.id === 'cat_qui_est_ce_garder' ? renderQuiEstCeGarder : renderQuiEstCe;
            container.innerHTML = `<h2>${currentExo.titre}</h2>` + renderFn(currentCategory, currentExo);
        } else {
            const endTime = Date.now();
            const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
            sendDataToSupabase(currentExo.id, parseFloat(durationSeconds), null, null, totalErrors);

            showFinishModal();
            showMenu();
        }
    }, 3000);
}

// Vérifie si un animal a déjà été éliminé aux étapes précédentes
function isAlreadyRemoved(id) {
    let removedSoFar = [];
    if (currentExo && currentExo.etapes) {
        for (let i = 0; i < currentStep; i++) {
            removedSoFar = removedSoFar.concat(currentExo.etapes[i].indices_a_retirer);
        }
    }
    return removedSoFar.includes(id);
}

// --- MODE GARDER ---

// Vérifie si un animal est exclu du jeu dans le mode "garder"
// (absent des indices valides de l'étape précédente)
function isEliminatedGarder(id) {
    if (currentStep === 0) return false;
    return !currentExo.etapes[currentStep - 1].indices_a_valider.includes(id);
}

// Génère la grille d'animaux pour le mode "garder" :
// tous grisés au départ, l'utilisateur sélectionne les bons
function renderQuiEstCeGarder(category, exo) {
    window.scrollTo(0, 0);
    consecutiveErrors = 0;
    isClickable = true;
    const etape = exo.etapes[currentStep];
    targetsLeftInStep = [...etape.indices_a_valider];

    return `
        <div class="step-counter">Étape ${currentStep + 1} / ${exo.etapes.length}</div>
        <video id="video-player" class="video-main" controls autoplay src="${etape.video}"></video>
        <div id="grille-garder" class="grid-elimination">
            ${category.banque_animaux.map(a => {
                const eliminated = isEliminatedGarder(a.id);
                const cssClass = eliminated ? 'barred-out' : 'grised-out';
                return `
                <div class="animal-card ${cssClass}" id="animal-${a.id}"
                     ${!eliminated ? `onclick="checkGarder(${a.id})"` : ''}>
                    <img src="${a.img}">
                </div>`;
            }).join('')}
        </div>`;
}

// Gère le clic sur un animal dans le mode "garder"
function checkGarder(id) {
    if (!isClickable) return;
    isClickable = false;
    const el = document.getElementById(`animal-${id}`);
    const grille = document.getElementById('grille-garder');
    grille.classList.add('click-locked');

    restoreClickTimerGarder = setTimeout(() => {
        isClickable = true;
        grille.classList.remove('click-locked');
    }, 800);

    if (targetsLeftInStep.includes(id)) {
        // Bonne sélection
        el.classList.remove('grised-out');
        el.classList.add('correct-kept');
        el.onclick = null;
        consecutiveErrors = 0;
        targetsLeftInStep = targetsLeftInStep.filter(tid => tid !== id);
        if (targetsLeftInStep.length === 0) handleNextStepGarder();
    } else {
        // Erreur enregistrée silencieusement, sans feedback visuel
        totalErrors++;
        consecutiveErrors++;
        if (consecutiveErrors >= 2) {
            window.scrollTo(0, 0);
            document.getElementById('video-player').play();
            consecutiveErrors = 0;
        }
    }
}

// Passe à l'étape suivante dans le mode "garder"
function handleNextStepGarder() {
    // Annule le timer de restauration du clic pour garder la grille verrouillée
    clearTimeout(restoreClickTimerGarder);
    isClickable = false;

    currentStep++;
    const grille = document.getElementById('grille-garder');
    if (grille) grille.classList.add('step-validated');

    setTimeout(() => {
        isClickable = true;
        if (currentStep < currentExo.etapes.length) {
            const container = document.getElementById('exercise-container');
            container.innerHTML = `<h2>${currentExo.titre}</h2>` + renderQuiEstCeGarder(currentCategory, currentExo);
        } else {
            const endTime = Date.now();
            const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
            sendDataToSupabase(currentExo.id, parseFloat(durationSeconds), null, null, totalErrors);
            showFinishModal();
            showMenu();
        }
    }, 3000);
}

// --- UTILITAIRES VIDÉO ET MODALES ---

function openContextModal() {
    const modal = document.getElementById('context-modal');
    const modalVideo = document.getElementById('modal-context-video');
    modal.classList.remove('hidden');
    modalVideo.play();
}

function closeContextModal() {
    const modal = document.getElementById('context-modal');
    const modalVideo = document.getElementById('modal-context-video');
    modalVideo.pause();
    modalVideo.currentTime = 0;
    modal.classList.add('hidden');
}

function selectOption(index) {
    if (!isClickable) return;

    const allVideos = document.querySelectorAll('video[id^="vid-"]');
    const allCards = document.querySelectorAll('.option-card');
    const currentVideo = document.getElementById(`vid-${index}`);
    const currentCard = document.getElementById(`opt-${index}`);
    const radio = document.getElementById(`check-${index}`);

    allCards.forEach(card => card.classList.remove('is-selected', 'is-playing'));
    allVideos.forEach(v => {
        if (v !== currentVideo) {
            v.pause();
            v.currentTime = 0;
        }
    });

    if (radio) radio.checked = true;

    if (currentCard) currentCard.classList.add('is-selected');

    if (currentVideo) {
        if (currentVideo.paused) {
            currentVideo.play();
            currentCard.classList.add('is-playing'); 
        } else {
            currentVideo.pause();
            currentCard.classList.remove('is-playing');
        }

        currentVideo.onended = () => currentCard.classList.remove('is-playing');
    }
}

function playVideo(id) {
    const v = document.getElementById(id);
    if (v.paused) v.play();
    else v.pause();
}

function toggleZoom(videoElement) {
    videoElement.classList.toggle('video-zoom');
}

function openConsigneModal(groupName) {
    let category = currentData.categories.find(c => c.groupe === groupName || c.id === groupName);

    const texteConsigne = category ? (category.consigne_texte || "Consigne non disponible.") : "Consigne non disponible.";
    
    let modal = document.getElementById('consigne-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'consigne-modal';
        modal.className = 'modal-overlay hidden';
        modal.onclick = closeConsigneModal;
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" onclick="event.stopPropagation()">
            <span class="close-modal" onclick="closeConsigneModal()">&times;</span>
            <h2 style="margin-bottom: 20px; color: #333;">Comment jouer ?</h2>
            <div class="consigne-texte-zone">
                <p style="font-size: 1.2rem; line-height: 1.6; color: #444;">${texteConsigne}</p>
            </div>
            <button class="btn-play" onclick="closeConsigneModal()" style="margin-top: 25px;">J'ai compris</button>
        </div>`;
    
    modal.classList.remove('hidden');
}

function closeConsigneModal() {
    const modal = document.getElementById('consigne-modal');
    const video = document.getElementById('modal-consigne-video');
    if (video) video.pause();
    if (modal) modal.classList.add('hidden');
}

// --- GESTION DE LA FIN DE L'EXERCICE ---

function showFinishModal() {
    const modal = document.getElementById('finish-modal');
    const msgEl = document.getElementById('finish-message');

    if (currentCategory && currentCategory.type === 'grille_elimination') {
        // Score pour Qui est-ce ? (basé sur les erreurs)
        let appreciation = '';
        if (totalErrors === 0) appreciation = 'Parfait, aucune erreur !';
        else if (totalErrors <= 2) appreciation = 'Tres bien !';
        else if (totalErrors <= 5) appreciation = 'Bien joué !';
        else appreciation = "Continue de t'entrainer !";

        msgEl.innerHTML = `
            <div class="score-display">
                <span class="score-fraction">${totalErrors} erreur${totalErrors > 1 ? 's' : ''}</span>
                <span class="score-appreciation">${appreciation}</span>
            </div>`;
    } else {
        // Score QCM pour Anaphore et Vrai ou Faux
        const pct = totalQuestions > 0 ? Math.round((currentScore / totalQuestions) * 100) : 0;
        let appreciation = '';
        if (pct === 100) appreciation = 'Parfait !';
        else if (pct >= 80) appreciation = 'Excellent !';
        else if (pct >= 60) appreciation = 'Bien joué !';
        else appreciation = "Continue de t'entrainer !";

        msgEl.innerHTML = `
            <div class="score-display">
                <span class="score-fraction">${currentScore} / ${totalQuestions}</span>
                <span class="score-appreciation">${appreciation}</span>
            </div>`;
    }

    modal.classList.remove('hidden');
}

function closeFinishModal() {
    const modal = document.getElementById('finish-modal');
    modal.classList.add('hidden');
}

function restartCurrentExercise() {
    closeFinishModal();
    loadExercise(currentCategory, 0);
}

function goToSubMenu() {
    closeFinishModal();
    if (currentCategory.id.includes('vrai_faux')) {
        startCategory('vrai_faux_group');
    } else if (currentCategory.id.includes('anaphore')) {
        startCategory('anaphore_group');
    } else if (currentCategory.id.includes('qui_est_ce')) {
        startCategory('qui_est_ce_group');
    } else {
        goToHome();
    }
}

function goToHome() {
    closeFinishModal();
    showMenu();
}

// --- IDENTIFICATION ---

function switchIdentMode(mode) {
    identMode = mode;
    document.getElementById('form-eleve').classList.toggle('hidden', mode !== 'eleve');
    document.getElementById('form-classe').classList.toggle('hidden', mode !== 'classe');
    document.getElementById('btn-mode-eleve').classList.toggle('active', mode === 'eleve');
    document.getElementById('btn-mode-classe').classList.toggle('active', mode === 'classe');
    document.getElementById('ident-error').classList.add('hidden');
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function submitIdentification() {
    const errorEl = document.getElementById('ident-error');
    errorEl.classList.add('hidden');

    if (identMode === 'eleve') {
        const nom    = document.getElementById('input-nom').value.trim();
        const animal = document.getElementById('input-animal').value.trim();
        if (!nom || !animal) {
            errorEl.classList.remove('hidden');
            return;
        }
        userIdentifier = capitalizeFirst(nom) + '_' + capitalizeFirst(animal);
    } else {
        const classe = document.getElementById('input-classe').value.trim();
        if (!classe) {
            errorEl.classList.remove('hidden');
            return;
        }
        userIdentifier = classe;
    }

    localStorage.setItem('userIdentifier', userIdentifier);
    document.getElementById('identification-modal').classList.add('hidden');
    updateUserDisplay();
}

function resetIdentification() {
    localStorage.removeItem('userIdentifier');
    userIdentifier = '';
    // Réinitialise les champs
    document.getElementById('input-nom').value    = '';
    document.getElementById('input-animal').value = '';
    document.getElementById('input-classe').value = '';
    document.getElementById('ident-error').classList.add('hidden');
    switchIdentMode('eleve');
    document.getElementById('settings-panel').classList.add('hidden');
    document.getElementById('identification-modal').classList.remove('hidden');
    updateUserDisplay();
}

function updateUserDisplay() {
    const el = document.getElementById('current-user-display');
    if (el) el.textContent = userIdentifier || '—';
}

// --- GESTION DES THEMES ---

function toggleSettingsPanel() {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('hidden');
}

function setTheme(theme) {
    document.body.classList.remove('theme-clair', 'theme-sombre', 'theme-ludique');
    if (theme !== 'clair') {
        document.body.classList.add('theme-' + theme);
    }
    localStorage.setItem('theme', theme);

    // Marque le thème actif dans le panneau
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('theme-active'));
    const activeCard = document.querySelector('.theme-' + theme + '-preview');
    if (activeCard) activeCard.classList.add('theme-active');
}

// Ferme le panneau si on clique en dehors
document.addEventListener('click', function(e) {
    const panel = document.getElementById('settings-panel');
    const btn   = document.getElementById('btn-settings');
    if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        panel.classList.add('hidden');
    }
});

// Application du thème sauvegardé au chargement
(function() {
    const saved = localStorage.getItem('theme') || 'ludique';
    setTheme(saved);
})();

function sendDataToSupabase(exercice, dureeSecondes, scoreCorrect, scoreTotal, nbErreurs) {
    fetch(SUPABASE_URL + '/rest/v1/statistiques', {
        method: 'POST',
        headers: {
            'apikey':        SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal'
        },
        body: JSON.stringify({
            utilisateur:    userIdentifier,
            exercice:       exercice,
            score_correct:  scoreCorrect,
            score_total:    scoreTotal,
            nb_erreurs:     nbErreurs,
            duree_secondes: dureeSecondes
        })
    }).catch(err => console.error('Erreur Supabase :', err));
}