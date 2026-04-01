let currentData = null;
let currentExo = null;
let currentStep = 0;
let currentCategory = null;
let targetsLeftInStep = [];
let consecutiveErrors = 0;
let isClickable = true;
let startTime = null;
const sessionID = "user_" + Math.floor(Math.random() * 10000);

// --- INITIALISATION ---

fetch('exercices.json')
    .then(response => response.json())
    .then(data => {
        currentData = data;
        showMenu();
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
    const menu = document.getElementById('menu-container');
    const exoCont = document.getElementById('exercise-container');
    menu.classList.remove('hidden');
    exoCont.classList.add('hidden');
    updateBreadcrumb();

    const mainPillars = [
        { id: 'cat_qui_est_ce', nom: 'Qui est-ce ?', desc: 'Un jeu d’élimination pour trouver l’animal mystère.' },
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
    else if (category) {
        updateBreadcrumb(category);
        if (category.id === 'cat_anaphore_lsf') {
            showAnaphoreRecit(category);
        } 
        else if (category.id.includes('cat_anaphore')) {
            showAnaphoreConsigne(category);
        } 
        else if (category.id === 'cat_qui_est_ce') {
            showSubMenuQuiEstCe(category);
        } else {
            loadExercise(category, 0);
        }
    }
}

// Affiche les variantes du mode Vrai ou Faux
function showSubMenuVraiFaux() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Choisissez le mode :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_vrai_faux_image')">Trouver le mot (Vidéo -> Image)</button>
                <button class="btn-variant" onclick="startCategory('cat_vrai_faux_vidéo')">Trouver le geste (Image -> Vidéo)</button>
            </div>
        </div>`;
}

// Affiche les différents exercices d'Anaphore
function showSubMenuAnaphore() {
    document.getElementById('exercise-container').innerHTML = `
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
    let html = `<div class="submenu-selection"><h2>Choisissez votre défi :</h2><div class="options-grid">`;
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

    if (category.type === 'grille_elimination') {
        container.innerHTML = `<h2>${item.titre}</h2>` + renderQuiEstCe(category, item);
        return; 
    }

    let html = "";
    if (category.video_contexte) {
        html += renderAnaphoreGeneric(category, item);
    }

    html += `<h2>${item.titre || category.nom}</h2>`;
    html += `<div class="consigne-container">`;
    
    if (category.id === "cat_anaphore_fr") {
        html += `
            <div class="recit-reference-card">
                <h3>Texte de référence</h3>
                <p>Lou, son grand frère Liam et sa petite sœur Julie sont dans le jardin. Ils jouent à cache-cache. La plus jeune doit trouver les autres. Elle commence à compter près de l’arbre. Son frère court derrière le buisson. Ça lui fait une bonne cachette. Sa sœur va dans le garage et se glisse entre la voiture et les vélos. Sans faire exprès, elle les fait tomber. Julie a fini de compter et elle part à leur recherche. Elle voit bouger quelque chose derrière le toboggan. Mais c’est Milou qui aboie et veut jouer ! Julie lui dit : « Aide-moi à les trouver ! Est-ce que tu les as vus près du buisson ? ». Elle y va, accompagnée de son chien, et ils trouvent Liam. Ce dernier l’aide à chercher Lou qui semble bien cachée. Ils se dirigent vers le garage. Ils y entrent. Là, ils découvrent leurs vélos par terre. Ils les poussent et trouvent enfin leur sœur. Tout contents de cette bonne partie, ils rentrent goûter.</p>
            </div>`;
    }

    if (item.video) {
        html += `<video class="video-main" controls autoplay src="${item.video}"></video>`;
    } else if (item.image) {
        html += `<div class="text-center"><img src="${item.image}" class="img-main-qcm"></div>`;
    }

    if (item.text || item.phrase) {
        let text = item.text || item.phrase;
        if (item.target) {
            const regex = new RegExp(`(${item.target})`, 'gi');
            text = text.replace(regex, `<span class="target-text">$1</span>`);
        }
        html += `<div class="card-text-consigne"><p>${text}</p></div>`;
    }
    html += `</div>`;

    const hasVideoOptions = item.options && item.options.some(opt => 
        typeof opt === 'string' && (opt.toLowerCase().includes('.mov') || opt.toLowerCase().includes('.mp4'))
    );
    
    const gridClass = hasVideoOptions ? 'options-grid-vertical' : 'options-grid-horizontal';

    html += `<div class="${gridClass}">`;
    html += item.options.map((opt, i) => {
        const isMedia = typeof opt === 'string' && (opt.includes('.') || opt.includes('/'));
        const isVideo = isMedia && (opt.toLowerCase().includes('.mov') || opt.toLowerCase().includes('.mp4'));

        return `
            <div class="option-card" id="opt-${i}">
                <div class="media-container ${!isMedia ? 'text-option-padding' : ''}">
                    ${isMedia ? 
                        (isVideo ? 
                            `<video id="vid-${i}" src="${opt}" onclick="toggleZoom(this)"></video>
                             <button class="btn-play-video" onclick="playVideo('vid-${i}')"><span class="play-icon">▶</span> Visionner</button>` : 
                            `<img src="${opt}" onclick="selectOption(${i})">`
                        ) : 
                        `<p class="text-choice">${opt}</p>`
                    }
                </div>
                <div class="selection-area" onclick="selectOption(${i})">
                    <input type="radio" name="qcm" id="check-${i}" ${isClickable ? '' : 'disabled'}>
                    <label for="check-${i}"></label>
                </div>
            </div>`;
    }).join('');
    
    html += `</div><button class="btn-play btn-validate" onclick="validateQCM()">Valider Réponse</button>`;
    container.innerHTML = html;

    startTime = Date.now();
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
    if (category.video_contexte) {
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
    const selected = document.querySelector('input[name="qcm"]:checked');
    if (!selected) return;
    
    const index = parseInt(selected.id.split('-')[1]);
    const el = document.getElementById(`opt-${index}`);

    if (index === currentExo.reponse) {

        const endTime = Date.now();
        const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
        const dateStr = new Date().toLocaleString();
        console.log("ID de l'exo :", currentExo ? currentExo.id : "ERREUR : currentExo est null");
        sendDataToGoogle(sessionID, dateStr, currentExo.id, durationSeconds + "s");

        el.classList.add('correct-border');
        isClickable = false;

        setTimeout(() => {
            const nextIndex = currentStep + 1;
            const totalQuestions = (currentCategory.questions || []).length;

            if (nextIndex < totalQuestions) {
                isClickable = true;
                loadExercise(currentCategory, nextIndex);
            } else {
                showFinishModal();
                isClickable = true;
                if (currentCategory.id.includes('vrai_faux')) startCategory('vrai_faux_group');
                else if (currentCategory.id.includes('anaphore')) startCategory('anaphore_group');
                else showMenu();
            }
        }, 1500);
    } else {
        el.classList.add('error-flash');
        setTimeout(() => el.classList.remove('error-flash'), 1000);
    }
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
        el.classList.add('error-flash');
        consecutiveErrors++;
        if (consecutiveErrors >= 2) { 
            window.scrollTo(0, 0); 
            document.getElementById('video-player').play(); 
            consecutiveErrors = 0; 
        }
        setTimeout(() => el.classList.remove('error-flash'), 1000);
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
            container.innerHTML = `<h2>${currentExo.titre}</h2>` + renderQuiEstCe(currentCategory, currentExo);
        } else {
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
    const input = document.getElementById(`check-${index}`);
    if (input) input.checked = true;
}

function playVideo(id) {
    const v = document.getElementById(id);
    if (v.paused) v.play();
    else v.pause();
}

function toggleZoom(videoElement) {
    videoElement.classList.toggle('video-zoom');
}

// --- GESTION DE LA FIN DE L'EXERCICE ---

function showFinishModal() {
    const modal = document.getElementById('finish-modal');
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
    } else if (currentCategory.id === 'cat_qui_est_ce') {
        startCategory('cat_qui_est_ce');
    } else {
        goToHome();
    }
}

function goToHome() {
    closeFinishModal();
    showMenu();
}

function sendDataToGoogle(user, date, exo, temps) {
    const formURL = "https://docs.google.com/forms/d/e/1FAIpQLSfyHVDqMvl_SEkjbFy74LSONtsZCcO1Xuu4GGFrZ4EqF07tJQ/formResponse";
    
    const params = new URLSearchParams();
    params.append("entry.1475131332", user);
    params.append("entry.464227689", date);
    params.append("entry.723616511", exo);
    params.append("entry.2104479172", temps);

    fetch(formURL, {
        method: "POST",
        mode: "no-cors",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
    })
    .then(() => {
        console.log("Données envoyées avec la méthode URL !");
    })
    .catch((error) => {
        console.error("Erreur d'envoi :", error);
    });
}
