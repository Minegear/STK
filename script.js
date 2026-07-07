// Coupe le son sur toutes les vidéos, présentes et futures
(function() {
    document.querySelectorAll('video').forEach(v => { v.muted = true; });
    new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            if (node.tagName === 'VIDEO') node.muted = true;
            node.querySelectorAll && node.querySelectorAll('video').forEach(v => { v.muted = true; });
        }));
    }).observe(document.body, { childList: true, subtree: true });
})();

let currentData = null;
let currentExo = null;
let currentStep = 0;
let currentCategory = null;
let targetsLeftInStep = [];
let consecutiveErrors = 0;
let isClickable = true;
let startTime = null;
let currentScore = 0;
let totalQuestions = 0;
let totalErrors = 0;
let totalWrongSelected = 0;
let totalMissed = 0;
let selectedAnimals = new Set();
let stepStartTime = null;
let stepErrors = 0;
let userIdentifier = '';
let userAge = null;
let identMode = 'eleve';
let isTeacher = false;
let currentSessionId = null;

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
        const savedId      = localStorage.getItem('userIdentifier');
        const savedTeacher = sessionStorage.getItem('teacherMode') === 'true';

        if (savedId) {
            userIdentifier = savedId;
            const savedAge = localStorage.getItem('userAge');
            if (savedAge !== null) userAge = parseInt(savedAge);
            updateUserDisplay();
        }
        if (savedTeacher) {
            isTeacher = true;
            document.getElementById('btn-results').classList.remove('hidden');
        }
        if (savedId || savedTeacher) {
            document.getElementById('identification-modal').classList.add('hidden');
        }
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
            displayName = 'Assosigne';
        } else if (category.id.includes('cat_recit')) {
            targetId = 'recit_group';
            displayName = 'Récits';
        } else if (category.id.includes('cat_para')) {
            targetId = 'para_group';
            displayName = 'Paradigme';
        } else if (category.id.includes('anaphore')) {
            targetId = 'anaphore_group';
            displayName = 'Pont FR-LSF';
        } else if (category.id.includes('qui_est_ce')) {
            targetId = 'qui_est_ce_group';
            displayName = 'Qui est-ce ?';
        }

        html += ` > <a href="#" onclick="startCategory('${targetId}')">${displayName}</a>`;
    }

    if (exo) {
        const list = currentCategory
            ? (currentCategory.exercices || currentCategory.questions || [])
            : [];
        const index = list.findIndex(e => e.id === exo.id);
        const isGrille = currentCategory && currentCategory.type === 'grille_elimination';
        const name = index >= 0
            ? (isGrille ? `Défi ${index + 1}` : `Question ${index + 1}`)
            : exo.id.split('_').pop().toUpperCase();
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
        { id: 'vrai_faux_group', nom: 'Assosigne', desc: 'Associez des signes LSF à des images ou inversement.' },
        { id: 'qui_est_ce_group', nom: 'Qui est-ce ?', desc: 'Un jeu d’élimination pour trouver l’animal mystère.' },
        { id: 'recit_group', nom: 'Récits', desc: 'Regarde une histoire en LSF et réponds aux questions sur son contenu.' },
        { id: 'para_group', nom: 'Paradigme', desc: 'Regarde un signe et retrouve l’image qui lui correspond parmi des propositions proches.' },
        { id: 'anaphore_group', nom: 'Pont FR-LSF', desc: 'Travaillez les liens entre le français et la LSF.' }
    ];

    menu.innerHTML = mainPillars.map(pillar => `
        <div class="card">
            <h3>${pillar.nom}</h3>
            <p>${pillar.desc}</p>
            <button class="btn-play" onclick="startCategory('${pillar.id}')">Faire le défi</button>
        </div>
    `).join('');
}

// --- GESTION DES CATÉGORIES ET SOUS-MENUS ---

// Session: mémorise les consignes déjà montrées
function hasShownConsigne(catId) {
    const shown = JSON.parse(sessionStorage.getItem('shownConsignes') || '[]');
    return shown.includes(catId);
}
function markConsigneShown(catId) {
    const shown = JSON.parse(sessionStorage.getItem('shownConsignes') || '[]');
    if (!shown.includes(catId)) { shown.push(catId); sessionStorage.setItem('shownConsignes', JSON.stringify(shown)); }
}

let consigneCallback = null;
function dismissConsigne() {
    if (consigneCallback) { const cb = consigneCallback; consigneCallback = null; cb(); }
}

// Affiche la vidéo de consigne si c'est la première fois, puis appelle onComplete
function showConsigneVideoIfNeeded(category, onComplete) {
    if (category.consignes && !hasShownConsigne(category.id)) {
        markConsigneShown(category.id);
        consigneCallback = onComplete;
        const hasSupp = !!category.consignesupp;
        const container = document.getElementById('exercise-container');

        function renderConsigneScreen(src, index, total) {
            container.innerHTML = `
                <div class="consigne-screen">
                    <h2>Consigne du défi${total > 1 ? ` <span class="consigne-counter">${index}/${total}</span>` : ''}</h2>
                    <video id="consigne-video" class="video-main" controls autoplay src="${src}"></video>
                    <div class="text-center" style="margin-top: 20px;">
                        <button class="btn-play btn-next-consigne" id="btn-next-consigne" style="padding: 15px 40px; font-size: 1.2rem; display: none;"
                            onclick="${index < total ? `showNextConsigne()` : `dismissConsigne()`}">
                            ${index < total ? 'Voir la consigne suivante ▶' : 'Compris !'}
                        </button>
                    </div>
                </div>`;
            document.getElementById('consigne-video').addEventListener('ended', () => {
                document.getElementById('btn-next-consigne').style.display = 'inline-block';
            });
        }

        window.showNextConsigne = function() {
            renderConsigneScreen(category.consignesupp, 2, 2);
        };

        renderConsigneScreen(category.consignes, hasSupp ? 1 : 0, hasSupp ? 2 : 0);
    } else {
        onComplete();
    }
}

// Redirige vers le bon sous-menu ou le bon écran selon la catégorie choisie
function startCategory(catId) {
    const container = document.getElementById('exercise-container');
    const menu = document.getElementById('menu-container');
    const category = currentData.categories.find(c => c.id === catId);

    menu.classList.add('hidden');
    container.classList.remove('hidden');
    currentStep = 0; 

    if (catId === 'vrai_faux_group') {
        updateBreadcrumb({ id: 'vrai_faux_group', nom: 'Assosigne' });
        showSubMenuVraiFaux();
    }
    else if (catId === 'recit_group') {
        updateBreadcrumb({ id: 'recit_group', nom: 'Récits' });
        showSubMenuRecit();
    }
    else if (catId === 'para_group') {
        updateBreadcrumb({ id: 'para_group', nom: 'Paradigme' });
        showSubMenuParadigme();
    }
    else if (catId === 'anaphore_group') {
        updateBreadcrumb({ id: 'anaphore_group', nom: 'Pont FR-LSF' });
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
        else if (category.id.includes('cat_recit')) {
            showConsigneVideoIfNeeded(category, () => showRecitIntro(category));
        }
        else if (category.id.includes('qui_est_ce')) {
            showConsigneVideoIfNeeded(category, () => showSubMenuQuiEstCe(category));
        } else {
            showConsigneVideoIfNeeded(category, () => loadExercise(category, 0));
        }
    }
}

// Affiche les variantes du mode Assosigne
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

// Affiche le choix des récits disponibles
function showSubMenuRecit() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="help-button-container">
            <button class="btn-help" onclick="openConsigneModal('recit_group')">?</button>
        </div>
        <div class="submenu-selection">
            <h2>Choisissez votre récit :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_recit_arc')">Arc de triomphe</button>
                <button class="btn-variant" onclick="startCategory('cat_recit_festival')">Festival</button>
                <button class="btn-variant" onclick="startCategory('cat_recit_restaurant')">Restaurant</button>
            </div>
        </div>`;
}

// Affiche les différentes variantes du mode Paradigme
function showSubMenuParadigme() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="help-button-container">
            <button class="btn-help" onclick="openConsigneModal('para_group')">?</button>
        </div>
        <div class="submenu-selection">
            <h2>Choisissez votre défi :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_para_a1')">A1</button>
                <button class="btn-variant" onclick="startCategory('cat_para_a2')">A2</button>
                <button class="btn-variant" onclick="startCategory('cat_para_a3')">A3</button>
                <button class="btn-variant" onclick="startCategory('cat_para_n1')">N1</button>
                <button class="btn-variant" onclick="startCategory('cat_para_n2')">N2</button>
                <button class="btn-variant" onclick="startCategory('cat_para_n3')">N3</button>
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
            <h2>Choisissez ton défi d'anaphore :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="loadExerciseById('cat_anaphore_lsf', 'ana_lsf_pouce')">Anaphore LSF</button>
                <button class="btn-variant" onclick="loadExerciseById('cat_anaphore_fr>lsf', 'ana_fr>lsf_cachecache')">Pont Français > LSF</button>
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
        <div class="submenu-selection"><h2>Choisis ton défi :</h2><div class="options-grid">`;
    html += category.exercices.map((exo, index) => `
        <button class="btn-variant" onclick="loadExerciseById('${category.id}', '${exo.id}')">
            Défi ${index + 1}
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
            showConsigneVideoIfNeeded(category, () => showAnaphoreRecit(category));
        }
        else if (category.id.includes('cat_anaphore') && index === 0) {
            showConsigneVideoIfNeeded(category, () => loadExercise(category, 0));
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

    // Réinitialisation des scores au début d'un exercice
    if (index === 0) {
        currentScore = 0;
        totalQuestions = 0;
        totalErrors = 0;
        totalWrongSelected = 0;
        totalMissed = 0;
        currentSessionId = crypto.randomUUID();
    }
    // Chrono réinitialisé à chaque question (timing individuel pour QCM)
    startTime = Date.now();


    if (category.type === 'grille_elimination') {
        const renderFn = category.id === 'cat_qui_est_ce_garder' ? renderQuiEstCeGarder : renderQuiEstCe;
        container.innerHTML = `<h2>${item.titre}</h2>` + renderFn(category, item);
        return;
    }

    let html = "";
    if (category.id.includes('cat_anaphore')) {
        html += `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;
    }
    if (category.video_contexte || category.video_recit) {
        html += renderAnaphoreGeneric(category, item);
    }

    if (item.titre) {
        html += `<h2>${item.titre}</h2>`;
    }
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
        if (item.textgras) {
            const escaped = item.textgras.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            text = text.replace(new RegExp(escaped), `<strong>$&</strong>`);
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
            <p>Regarde attentivement l'histoire avant de passer aux consignes.</p>
            <video class="video-main" controls autoplay src="${videoSrc}"></video>
            <div class="text-center" style="margin-top: 20px;">
                <button class="btn-play" style="padding: 15px 40px; font-size: 1.2rem;"
                        onclick="loadExercise(currentData.categories.find(c => c.id === '${category.id}'), 0)">
                    Commencer
                </button>
            </div>
        </div>
    `;
}

// Affiche le récit complet avant de commencer les questions (mode Récits)
function showRecitIntro(category) {
    const container = document.getElementById('exercise-container');
    const videoSrc = category.video_recit || "";

    container.innerHTML = `
        <div class="consigne-screen recit-screen">
            <h2>Le récit</h2>
            <p>Regarde attentivement l'histoire avant de répondre aux questions.</p>
            <video class="video-main" controls autoplay src="${videoSrc}"></video>
            <div class="text-center" style="margin-top: 20px;">
                <button class="btn-play" style="padding: 15px 40px; font-size: 1.2rem;"
                        onclick="loadExercise(currentData.categories.find(c => c.id === '${category.id}'), 0)">
                    Commencer
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
            <h2>Consigne du défi</h2>
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
    const videoSrc = category.video_contexte || category.video_recit;
    if (videoSrc && (category.id === 'cat_anaphore_lsf' || category.id.includes('cat_recit'))) {
        return `
            <div class="mini-context-container" onclick="openContextModal()">
                <video src="${videoSrc}"></video>
                <span>Voir le récit</span>
            </div>
            <div id="context-modal" class="modal-overlay hidden" onclick="closeContextModal()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <span class="close-modal" onclick="closeContextModal()">&times;</span>
                    <h3>Récit complet</h3>
                    <video id="modal-context-video" controls src="${videoSrc}"></video>
                </div>
            </div>`;
    }
    return "";
}

// Génère la grille d'animaux pour le jeu "Qui est-ce ?"
function renderQuiEstCe(category, exo) {
    window.scrollTo(0, 0);
    if (currentStep === 0) currentSessionId = crypto.randomUUID();
    consecutiveErrors = 0;
    isClickable = true;
    selectedAnimals = new Set();
    stepErrors = 0;
    stepStartTime = Date.now();
    const etape = exo.etapes[currentStep];
    targetsLeftInStep = [...etape.indices_a_retirer];

    return `
        <div class="step-counter">Étape ${currentStep + 1} / ${exo.etapes.length}</div>
        <video id="video-player" class="video-main" controls autoplay src="${etape.video}"></video>
        <div id="grille-elimination" class="grid-elimination">
            ${category.banque_animaux.map(a => `
                <div class="animal-card ${isAlreadyRemoved(a.id) ? 'already-removed' : ''}" id="animal-${a.id}"
                     ${!isAlreadyRemoved(a.id) ? `onclick="toggleAnimalSelection(${a.id})"` : ''}>
                    <img src="${a.img}">
                </div>`).join('')}
        </div>
        <button class="btn-play btn-validate" id="btn-valider" onclick="validateStepEliminer()" disabled>Valider</button>`;
}

// --- ACTIONS ET INTERACTION ---

// Bascule la sélection d'un animal (commun aux deux modes "qui est-ce ?")
function toggleAnimalSelection(id) {
    if (!isClickable) return;
    const el = document.getElementById(`animal-${id}`);
    if (!el || el.classList.contains('already-removed') || el.classList.contains('garder-excluded')) return;

    if (selectedAnimals.has(id)) {
        selectedAnimals.delete(id);
        el.classList.remove('animal-selected');
    } else {
        selectedAnimals.add(id);
        el.classList.add('animal-selected');
    }

    const btn = document.getElementById('btn-valider');
    if (btn) btn.disabled = selectedAnimals.size === 0;
}

// Valide la sélection dans le mode "éliminer"
function validateStepEliminer() {
    if (!isClickable) return;
    isClickable = false;

    const targets = new Set(currentExo.etapes[currentStep].indices_a_retirer);
    const wrongSelected = [...selectedAnimals].filter(id => !targets.has(id));
    const missed = [...targets].filter(id => !selectedAnimals.has(id));
    stepErrors = wrongSelected.length + missed.length;
    totalErrors += stepErrors;
    totalWrongSelected += wrongSelected.length;
    totalMissed += missed.length;

    const grille = document.getElementById('grille-elimination');
    if (grille) grille.classList.add('click-locked');

    selectedAnimals.forEach(id => {
        const el = document.getElementById(`animal-${id}`);
        if (!el) return;
        el.classList.remove('animal-selected');
        el.classList.add(targets.has(id) ? 'correct-fixed' : 'wrong-fixed');
    });
    missed.forEach(id => {
        const el = document.getElementById(`animal-${id}`);
        if (el && !el.classList.contains('already-removed')) el.classList.add('blink-green');
    });

    const stepDuration = parseFloat(((Date.now() - stepStartTime) / 1000).toFixed(2));
    const getName = id => (currentCategory.banque_animaux.find(a => a.id === id) || {}).nom || id;
    const infosErreurs = [
        wrongSelected.length ? 'Mal sél.: ' + wrongSelected.map(getName).join(', ') : null,
        missed.length        ? 'Oubliés: '  + missed.map(getName).join(', ')        : null,
    ].filter(Boolean).join(' | ') || null;
    sendDataToSupabase(`${currentExo.id}_etape${currentStep + 1}`, currentCategory.type, null, stepErrors, stepDuration,
        { nb_mauvaises_selections: wrongSelected.length, nb_oublis: missed.length, infos_erreurs: infosErreurs });

    const btn = document.getElementById('btn-valider');
    if (btn) { btn.textContent = "J'ai compris"; btn.onclick = confirmUnderstoodEliminer; }
}

// Valide la sélection dans le mode "garder"
function validateStepGarder() {
    if (!isClickable) return;
    isClickable = false;

    const targets = new Set(currentExo.etapes[currentStep].indices_a_valider);
    const wrongSelected = [...selectedAnimals].filter(id => !targets.has(id));
    const missed = [...targets].filter(id => !selectedAnimals.has(id));
    stepErrors = wrongSelected.length + missed.length;
    totalErrors += stepErrors;
    totalWrongSelected += wrongSelected.length;
    totalMissed += missed.length;

    const grille = document.getElementById('grille-garder');
    if (grille) grille.classList.add('click-locked');

    selectedAnimals.forEach(id => {
        const el = document.getElementById(`animal-${id}`);
        if (!el) return;
        el.classList.remove('animal-selected');
        el.classList.add(targets.has(id) ? 'correct-fixed' : 'wrong-fixed');
    });
    missed.forEach(id => {
        const el = document.getElementById(`animal-${id}`);
        if (el && !el.classList.contains('garder-excluded')) el.classList.add('blink-green');
    });

    const stepDuration = parseFloat(((Date.now() - stepStartTime) / 1000).toFixed(2));
    const getName = id => (currentCategory.banque_animaux.find(a => a.id === id) || {}).nom || id;
    const infosErreurs = [
        wrongSelected.length ? 'Mal sél.: ' + wrongSelected.map(getName).join(', ') : null,
        missed.length        ? 'Oubliés: '  + missed.map(getName).join(', ')        : null,
    ].filter(Boolean).join(' | ') || null;
    sendDataToSupabase(`${currentExo.id}_etape${currentStep + 1}`, currentCategory.type, null, stepErrors, stepDuration,
        { nb_mauvaises_selections: wrongSelected.length, nb_oublis: missed.length, infos_erreurs: infosErreurs });

    const btn = document.getElementById('btn-valider');
    if (btn) { btn.textContent = "J'ai compris"; btn.onclick = confirmUnderstoodGarder; }
}

// Passe à l'étape suivante dans le mode "éliminer" après le feedback
function confirmUnderstoodEliminer() {
    currentStep++;
    if (currentStep < currentExo.etapes.length) {
        const container = document.getElementById('exercise-container');
        container.innerHTML = `<h2>${currentExo.titre}</h2>` + renderQuiEstCe(currentCategory, currentExo);
    } else {
        showFinishModal();
    }
}

// Passe à l'étape suivante dans le mode "garder" après le feedback
function confirmUnderstoodGarder() {
    currentStep++;
    if (currentStep < currentExo.etapes.length) {
        const container = document.getElementById('exercise-container');
        container.innerHTML = `<h2>${currentExo.titre}</h2>` + renderQuiEstCeGarder(currentCategory, currentExo);
    } else {
        showFinishModal();
    }
}

// Vérifie la réponse choisie dans un QCM
function validateQCM() {
    if (!isClickable) return;
    
    const selected = document.querySelector('input[name="qcm"]:checked');
    if (!selected) return;
    
    isClickable = false;
    
    const index = parseInt(selected.id.split('-')[1]);
    const isCorrect = index === currentExo.reponse;
    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

    // Enregistrement par question sans feedback visuel
    totalQuestions++;
    if (isCorrect) currentScore++;
    sendDataToSupabase(currentExo.id, currentCategory.type, isCorrect, null, duree);

    setTimeout(() => {
        const nextIndex = currentStep + 1;
        const total = (currentCategory.questions || []).length;

        if (nextIndex < total) {
            loadExercise(currentCategory, nextIndex);
        } else {
            showFinishModal();
            isClickable = true;
            if (currentCategory.id.includes('vrai_faux')) startCategory('vrai_faux_group');
            else if (currentCategory.id.includes('cat_recit')) startCategory('recit_group');
            else if (currentCategory.id.includes('cat_para')) startCategory('para_group');
            else if (currentCategory.id.includes('anaphore')) startCategory('anaphore_group');
            else showMenu();
        }
    }, 400);
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
// animaux affichés en couleur, l'utilisateur sélectionne les bons
function renderQuiEstCeGarder(category, exo) {
    window.scrollTo(0, 0);
    if (currentStep === 0) currentSessionId = crypto.randomUUID();
    consecutiveErrors = 0;
    isClickable = true;
    selectedAnimals = new Set();
    stepErrors = 0;
    stepStartTime = Date.now();
    const etape = exo.etapes[currentStep];
    targetsLeftInStep = [...etape.indices_a_valider];

    return `
        <div class="step-counter">Étape ${currentStep + 1} / ${exo.etapes.length}</div>
        <video id="video-player" class="video-main" controls autoplay src="${etape.video}"></video>
        <div id="grille-garder" class="grid-elimination">
            ${category.banque_animaux.map(a => {
                const eliminated = isEliminatedGarder(a.id);
                return `
                <div class="animal-card ${eliminated ? 'garder-excluded' : ''}" id="animal-${a.id}"
                     ${!eliminated ? `onclick="toggleAnimalSelection(${a.id})"` : ''}>
                    <img src="${a.img}">
                </div>`;
            }).join('')}
        </div>
        <button class="btn-play btn-validate" id="btn-valider" onclick="validateStepGarder()" disabled>Valider</button>`;
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
    // Cherche d'abord par ID exact, sinon toutes les catégories du groupe
    const directMatch = currentData.categories.find(c => c.id === groupName);
    const categories = directMatch
        ? [directMatch]
        : currentData.categories.filter(c => c.groupe === groupName);

    const texteConsigne = (categories.find(c => c.consigne_texte) || {}).consigne_texte || "Consigne non disponible.";

    // Collecte les vidéos de consigne uniques (avec label si plusieurs)
    const videos = categories
        .filter(c => c.consignes)
        .filter((c, i, arr) => arr.findIndex(x => x.consignes === c.consignes) === i);

    const videosHtml = videos.length > 0 ? `
        <div style="margin-top: 20px;">
            <h3 style="margin-bottom: 12px; color: #333;">Revoir la consigne en vidéo</h3>
            ${videos.map((c, i) => `
                <div style="margin-bottom: 8px;">
                    ${videos.length > 1 ? `<p style="font-weight:700;margin:0 0 6px;">${c.nom || 'Mode ' + (i + 1)}</p>` : ''}
                    <button class="btn-play" style="width:100%;" onclick="toggleConsigneVideo('mcv-${i}', this)">▶ Voir la consigne vidéo</button>
                    <video id="mcv-${i}" class="video-main" controls src="${c.consignes}" style="display:none;margin-top:10px;margin-bottom:0;"></video>
                </div>
            `).join('')}
        </div>` : '';

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
            ${videosHtml}
            <button class="btn-play" onclick="closeConsigneModal()" style="margin-top: 25px;">J'ai compris</button>
        </div>`;

    modal.classList.remove('hidden');
}

function closeConsigneModal() {
    const modal = document.getElementById('consigne-modal');
    if (modal) {
        modal.querySelectorAll('video').forEach(v => v.pause());
        modal.classList.add('hidden');
    }
}

function toggleConsigneVideo(videoId, btn) {
    const video = document.getElementById(videoId);
    if (!video) return;
    if (video.style.display === 'none') {
        video.style.display = 'block';
        video.play();
        btn.textContent = '✕ Masquer la vidéo';
    } else {
        video.pause();
        video.style.display = 'none';
        btn.textContent = '▶ Voir la consigne vidéo';
    }
}

// --- GESTION DE LA FIN DE L'EXERCICE ---

function showFinishModal() {
    const modal = document.getElementById('finish-modal');
    const msgEl = document.getElementById('finish-message');
    let triggerConfetti = false;

    if (currentCategory && currentCategory.type === 'grille_elimination') {
        let appreciation = '';
        if (totalErrors === 0) appreciation = 'Parfait, aucune erreur !';
        else if (totalErrors <= 2) appreciation = 'Très bien !';
        else if (totalErrors <= 5) appreciation = 'Bien joué !';
        else appreciation = "Continue de t'entraîner !";

        if (totalErrors <= 5) triggerConfetti = true;

        msgEl.innerHTML = `
            <div class="score-display">
                <span class="score-appreciation">${appreciation}</span>
                <span class="score-fraction">${totalErrors} erreur${totalErrors > 1 ? 's' : ''}</span>
            </div>`;
    } else {
        const pct = totalQuestions > 0 ? Math.round((currentScore / totalQuestions) * 100) : 0;
        let appreciation = '';
        if (pct === 100) appreciation = 'Parfait !';
        else if (pct >= 80) appreciation = 'Excellent !';
        else if (pct >= 60) appreciation = 'Bien joué !';
        else appreciation = "Continue de t'entraîner !";

        if (pct >= 70) triggerConfetti = true;

        msgEl.innerHTML = `
            <div class="score-display">
                <span class="score-appreciation">${appreciation}</span>
                <span class="score-fraction">${currentScore} / ${totalQuestions}</span>
            </div>`;
    }

    modal.classList.remove('hidden');
    if (triggerConfetti) launchConfetti();
}

function launchConfetti() {
    const existing = document.getElementById('confetti-container');
    if (existing) existing.remove();

    const colors = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#ec4899'];
    const container = document.createElement('div');
    container.id = 'confetti-container';
    document.body.appendChild(container);

    for (let i = 0; i < 90; i++) {
        const piece = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        const left = Math.random() * 100;
        const delay = Math.random() * 1.8;
        const duration = 2.5 + Math.random() * 2;
        const size = 7 + Math.random() * 7;
        const isCircle = Math.random() > 0.45;

        piece.className = 'confetti-piece';
        piece.style.cssText = `left:${left}%;width:${size}px;height:${size}px;background:${color};border-radius:${isCircle ? '50%' : '2px'};animation-duration:${duration}s;animation-delay:${delay}s;`;
        container.appendChild(piece);
    }

    setTimeout(() => { const el = document.getElementById('confetti-container'); if (el) el.remove(); }, 6000);
}

function closeFinishModal() {
    const modal = document.getElementById('finish-modal');
    modal.classList.add('hidden');
}

function restartCurrentExercise() {
    closeFinishModal();
    document.getElementById('menu-container').classList.add('hidden');
    document.getElementById('exercise-container').classList.remove('hidden');
    currentStep = 0;
    totalErrors = 0;
    totalWrongSelected = 0;
    totalMissed = 0;
    // Qui est-ce : reprend le même exercice (même animal) depuis l'étape 1
    // QCM (Assosigne, Anaphore) : repart toujours de la question 1
    let index = 0;
    if (currentCategory && currentCategory.type === 'grille_elimination' && currentExo) {
        const list = currentCategory.exercices || [];
        index = Math.max(0, list.findIndex(e => e.id === currentExo.id));
    }
    loadExercise(currentCategory, index);
}

function goToSubMenu() {
    closeFinishModal();
    if (currentCategory.id.includes('vrai_faux')) {
        startCategory('vrai_faux_group');
    } else if (currentCategory.id.includes('cat_recit')) {
        startCategory('recit_group');
    } else if (currentCategory.id.includes('cat_para')) {
        startCategory('para_group');
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
    document.getElementById('form-professeur').classList.toggle('hidden', mode !== 'professeur');
    document.getElementById('btn-mode-eleve').classList.toggle('active', mode === 'eleve');
    document.getElementById('btn-mode-classe').classList.toggle('active', mode === 'classe');
    document.getElementById('btn-mode-professeur').classList.toggle('active', mode === 'professeur');
    const errorEl = document.getElementById('ident-error');
    errorEl.textContent = 'Veuillez remplir tous les champs.';
    errorEl.classList.add('hidden');
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
        const ageVal = document.getElementById('input-age').value.trim();
        if (!nom || !animal || !ageVal) { errorEl.classList.remove('hidden'); return; }
        userIdentifier = capitalizeFirst(nom) + '_' + capitalizeFirst(animal);
        userAge = parseInt(ageVal);
        localStorage.setItem('userIdentifier', userIdentifier);
        localStorage.setItem('userAge', userAge);
        document.getElementById('identification-modal').classList.add('hidden');
        updateUserDisplay();

    } else if (identMode === 'classe') {
        const classe = document.getElementById('input-classe').value.trim();
        if (!classe) { errorEl.classList.remove('hidden'); return; }
        userIdentifier = classe;
        localStorage.setItem('userIdentifier', userIdentifier);
        document.getElementById('identification-modal').classList.add('hidden');
        updateUserDisplay();

    } else if (identMode === 'professeur') {
        const pwd = document.getElementById('input-password').value;
        if (pwd !== 'pr0FsTk-l0g1N') {
            errorEl.textContent = 'Mot de passe incorrect.';
            errorEl.classList.remove('hidden');
            return;
        }
        isTeacher = true;
        sessionStorage.setItem('teacherMode', 'true');
        document.getElementById('btn-results').classList.remove('hidden');
        document.getElementById('identification-modal').classList.add('hidden');
    }
}

let _savedUserState = null;

function resetIdentification() {
    // Sauvegarde l'état actuel pour pouvoir l'annuler via la croix
    _savedUserState = userIdentifier
        ? { userIdentifier, userAge, isTeacher: !!isTeacher }
        : null;

    localStorage.removeItem('userIdentifier');
    localStorage.removeItem('userAge');
    sessionStorage.removeItem('teacherMode');
    userIdentifier = '';
    userAge = null;
    isTeacher = false;
    document.getElementById('btn-results').classList.add('hidden');
    document.getElementById('input-nom').value      = '';
    document.getElementById('input-animal').value   = '';
    document.getElementById('input-age').value      = '';
    document.getElementById('input-classe').value   = '';
    document.getElementById('input-password').value = '';
    switchIdentMode('eleve');
    document.getElementById('settings-panel').classList.add('hidden');

    // Affiche la croix seulement si un utilisateur était déjà identifié
    const btnClose = document.getElementById('btn-close-ident');
    if (_savedUserState) {
        btnClose.classList.remove('hidden');
    } else {
        btnClose.classList.add('hidden');
    }

    document.getElementById('identification-modal').classList.remove('hidden');
    updateUserDisplay();
}

function closeIdentModal() {
    if (!_savedUserState) return;
    // Restaure l'état précédent sans changer d'utilisateur
    userIdentifier = _savedUserState.userIdentifier;
    userAge = _savedUserState.userAge;
    isTeacher = _savedUserState.isTeacher;
    localStorage.setItem('userIdentifier', userIdentifier);
    if (userAge !== null) localStorage.setItem('userAge', userAge);
    if (isTeacher) {
        sessionStorage.setItem('teacherMode', 'true');
        document.getElementById('btn-results').classList.remove('hidden');
    }
    _savedUserState = null;
    document.getElementById('identification-modal').classList.add('hidden');
    document.getElementById('btn-close-ident').classList.add('hidden');
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

function sendDataToSupabase(questionId, typeExercice, estCorrect, nbErreurs, dureeSecondes, extra = {}) {
    if (!userIdentifier) return;
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
            age:            userAge,
            session_id:     currentSessionId,
            exercice:       currentCategory ? currentCategory.id : questionId,
            question_id:    questionId,
            type_exercice:  typeExercice,
            est_correct:    estCorrect,
            nb_erreurs:     nbErreurs,
            duree_secondes: dureeSecondes,
            ...extra
        })
    }).catch(err => console.error('Erreur Supabase :', err));
}

// --- PAGE DE RESULTATS (vue professeur) ---

const CATEGORY_LABELS = {
    'cat_vrai_faux_image':    'Assosigne — Video vers Image',
    'cat_vrai_faux_vidéo': 'Assosigne — Image vers Video',
    'cat_recit_arc':          'Récits — Arc de triomphe',
    'cat_recit_festival':     'Récits — Festival',
    'cat_recit_restaurant':   'Récits — Restaurant',
    'cat_para_a1':            'Paradigme — A1',
    'cat_para_a2':            'Paradigme — A2',
    'cat_para_a3':            'Paradigme — A3',
    'cat_para_n1':            'Paradigme — N1',
    'cat_para_n2':            'Paradigme — N2',
    'cat_para_n3':            'Paradigme — N3',
    'cat_anaphore_lsf':       'Anaphore LSF',
    'cat_anaphore_fr>lsf':    'Anaphore Français vers LSF',
    'cat_anaphore_lsf>fr':    'Anaphore LSF vers Français',
    'cat_anaphore_fr':        'Anaphore Français écrit',
    'cat_qui_est_ce_garder':  'Qui est-ce ? — Sélection',
    'cat_qui_est_ce_eliminer':'Qui est-ce ? — Elimination'
};

async function showResultsPage() {
    const menu = document.getElementById('menu-container');
    const container = document.getElementById('exercise-container');
    menu.classList.add('hidden');
    container.classList.remove('hidden');

    document.getElementById('nav-breadcrumb').innerHTML =
        '<a href="#" onclick="showMenu()">Accueil</a> > Résultats';

    container.innerHTML = '<div class="results-page"><p class="results-loading">Chargement...</p></div>';

    try {
        const res = await fetch(
            SUPABASE_URL + '/rest/v1/statistiques?select=utilisateur&order=utilisateur.asc',
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
        );
        const data = await res.json();
        const users = [...new Set(data.map(r => r.utilisateur))].filter(Boolean).sort();

        if (users.length === 0) {
            container.innerHTML = '<div class="results-page"><p class="results-empty">Aucune donnée disponible.</p></div>';
            return;
        }

        container.innerHTML = `
            <div class="results-page">
                <h2 class="results-title">Résultats</h2>
                <p class="results-subtitle">${users.length} utilisateur${users.length > 1 ? 's' : ''}</p>
                <input type="text" class="users-search" placeholder="Rechercher un utilisateur..."
                       oninput="filterUsers(this.value)">
                <div class="users-list">
                    ${users.map(u => `
                        <button class="user-card" data-user="${u}" onclick="showUserResults(this.dataset.user)">
                            <span class="user-name">${u}</span>
                            <span class="user-arrow">›</span>
                        </button>`).join('')}
                </div>
            </div>`;
    } catch(e) {
        container.innerHTML = '<div class="results-page"><p class="results-error">Erreur de chargement.</p></div>';
    }
}

function filterUsers(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.user-card').forEach(card => {
        const match = card.dataset.user.toLowerCase().includes(q);
        card.style.display = match ? '' : 'none';
    });
}

let _currentUserRows = [];

async function showUserResults(user) {
    const container = document.getElementById('exercise-container');

    document.getElementById('nav-breadcrumb').innerHTML =
        `<a href="#" onclick="showMenu()">Accueil</a> > <a href="#" onclick="showResultsPage()">Résultats</a> > ${user}`;

    container.innerHTML = '<div class="results-page"><p class="results-loading">Chargement...</p></div>';

    try {
        const res = await fetch(
            SUPABASE_URL + `/rest/v1/statistiques?utilisateur=eq.${encodeURIComponent(user)}&order=date_heure.desc`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
        );
        const rows = await res.json();
        _currentUserRows = rows;

        if (rows.length === 0) {
            container.innerHTML = `<div class="results-page"><h2>${user}</h2><p class="results-empty">Aucune donnée.</p></div>`;
            return;
        }

        // Regroupement : date → sessions (une session = un run complet identifié par session_id)
        const byDate = {};
        const dateOrder = [];
        rows.forEach(r => {
            const d = r.date_heure
                ? new Date(r.date_heure).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : 'Date inconnue';
            if (!byDate[d]) { byDate[d] = []; dateOrder.push(d); }
            // Clé de session : session_id si dispo, sinon fallback exercice (anciennes données)
            const sid = r.session_id || `__legacy__${r.exercice}`;
            let session = byDate[d].find(s => s.sid === sid);
            if (!session) {
                session = { sid, catId: r.exercice, rows: [] };
                byDate[d].push(session);
            }
            session.rows.push(r);
        });

        // Numéroter les sessions multiples d'une même catégorie dans une même journée
        for (const d of dateOrder) {
            const countByCat = {};
            byDate[d].forEach(s => { countByCat[s.catId] = (countByCat[s.catId] || 0) + 1; });
            const runByCat = {};
            byDate[d].forEach(s => {
                runByCat[s.catId] = (runByCat[s.catId] || 0) + 1;
                s.runLabel = countByCat[s.catId] > 1 ? ` — Tentative ${runByCat[s.catId]}` : '';
            });
        }

        const exercicesPresents = new Set(rows.map(r => r.exercice));
        const hasGroup = key => CSV_GROUPS[key].ids.some(id => exercicesPresents.has(id));
        const u = user.replace(/'/g, "\\'");

        const btnGroups = [
            { key: 'qui_est_ce', label: 'Qui est-ce'  },
            { key: 'assosigne',  label: 'Assosigne'   },
            { key: 'recit',      label: 'Récits'      },
            { key: 'paradigme',  label: 'Paradigme'   },
            { key: 'anaphore',   label: 'Pont FR-LSF' },
        ];

        let html = `<div class="results-page">
            <div class="results-user-header">
                <h2 class="results-title">${user}</h2>
                <div class="export-btn-group">
                    <button class="btn-export-csv" onclick="exportUserCSV('${u}')" title="Tout exporter">⬇ Tout exporter</button>
                    ${btnGroups.map(g => {
                        const active = hasGroup(g.key);
                        return `<button class="btn-export-csv btn-export-single${active ? '' : ' disabled'}"
                            ${active ? `onclick="exportUserCSVGroup('${u}', '${g.key}')"` : 'disabled'}
                            title="${active ? g.label : g.label + ' (aucune donnée)'}">
                            ⬇ ${g.label}
                        </button>`;
                    }).join('')}
                </div>
            </div>`;

        for (const date of dateOrder) {
            html += `<div class="date-block"><div class="date-label">${date}</div>`;

            for (const session of byDate[date]) {
                const { catId, rows: catRows, runLabel } = session;
                const label = CATEGORY_LABELS[catId] || catId;
                const isQCM = catRows.some(r => r.est_correct !== null);

                html += `<div class="category-block"><h3 class="category-label">${label}${runLabel}</h3>`;

                if (isQCM) {
                    const correct = catRows.filter(r => r.est_correct).length;
                    const total   = catRows.length;
                    const pct     = Math.round((correct / total) * 100);
                    const avgTime = (catRows.reduce((s, r) => s + (r.duree_secondes || 0), 0) / total).toFixed(1);

                    html += `<div class="stat-summary">${pct}% de bonnes réponses (${correct}/${total}) — moy. ${avgTime}s / question</div>`;
                    html += `<table class="results-table">`;
                    catRows.forEach(r => {
                        const nom = (r.question_id || '').split('_').pop().toUpperCase();
                        html += `<tr>
                            <td class="q-name">${nom}</td>
                            <td class="${r.est_correct ? 'correct' : 'incorrect'}">${r.est_correct ? 'Correct' : 'Incorrect'}</td>
                            <td class="q-time">${r.duree_secondes != null ? r.duree_secondes + 's' : '—'}</td>
                        </tr>`;
                    });
                    html += `</table>`;
                } else {
                    const totalErr = catRows.reduce((s, r) => s + (r.nb_erreurs || 0), 0);
                    html += `<div class="stat-summary">${totalErr} erreur${totalErr > 1 ? 's' : ''} au total sur le défi</div>`;
                    html += `<table class="results-table">`;
                    catRows.forEach(r => {
                        const qid = r.question_id || '';
                        const etapeMatch = qid.match(/_etape(\d+)$/i);
                        const nom = etapeMatch
                            ? qid.replace(/_etape\d+$/i, '').replace(/^qec_/i, '').toUpperCase() + ` — Étape ${etapeMatch[1]}`
                            : qid.split('_').pop().toUpperCase();
                        const err = r.nb_erreurs != null ? `${r.nb_erreurs} erreur${r.nb_erreurs > 1 ? 's' : ''}` : '—';
                        const mauvaises = r.nb_mauvaises_selections != null ? `${r.nb_mauvaises_selections} mauvaise${r.nb_mauvaises_selections > 1 ? 's' : ''} sél.` : null;
                        const oublis = r.nb_oublis != null ? `${r.nb_oublis} oubli${r.nb_oublis > 1 ? 's' : ''}` : null;
                        const detail = (mauvaises || oublis) ? `<br><span class="q-detail">${[mauvaises, oublis].filter(Boolean).join(' · ')}</span>` : '';
                        html += `<tr>
                            <td class="q-name">${nom}</td>
                            <td>${err}${detail}</td>
                            <td class="q-time">${r.duree_secondes != null ? r.duree_secondes + 's' : '—'}</td>
                        </tr>`;
                    });
                    html += `</table>`;
                }

                html += `</div>`;
            }

            html += `</div>`;
        }

        html += `</div>`;
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = `<div class="results-page"><h2>${user}</h2><p class="results-error">Erreur de chargement.</p></div>`;
    }
}

const CSV_GROUPS = {
    'qui_est_ce':  { label: 'qui_est_ce',  ids: ['cat_qui_est_ce_garder', 'cat_qui_est_ce_eliminer'] },
    'assosigne':   { label: 'assosigne',   ids: ['cat_vrai_faux_image', 'cat_vrai_faux_vidéo'] },
    'recit':       { label: 'recit',       ids: ['cat_recit_arc', 'cat_recit_festival', 'cat_recit_restaurant'] },
    'paradigme':   { label: 'paradigme',   ids: ['cat_para_a1', 'cat_para_a2', 'cat_para_a3', 'cat_para_n1', 'cat_para_n2', 'cat_para_n3'] },
    'anaphore':    { label: 'anaphore',    ids: ['cat_anaphore_lsf', 'cat_anaphore_fr>lsf', 'cat_anaphore_lsf>fr', 'cat_anaphore_fr'] },
};

function _buildSessionStats(rows) {
    const sessionStats = {};
    rows.forEach(r => {
        const sid = r.session_id || `__legacy__${r.exercice}`;
        if (!sessionStats[sid]) sessionStats[sid] = { rows: [], isQCM: r.est_correct !== null };
        sessionStats[sid].rows.push(r);
    });
    Object.values(sessionStats).forEach(s => {
        if (s.isQCM) {
            const correct = s.rows.filter(r => r.est_correct).length;
            const total   = s.rows.length;
            s.score = `${correct} sur ${total}`;
            s.pct   = `${Math.round((correct / total) * 100)}%`;
        } else {
            const totalErr = s.rows.reduce((acc, r) => acc + (r.nb_erreurs || 0), 0);
            s.score = `${totalErr} erreur${totalErr > 1 ? 's' : ''}`;
            s.pct   = '—';
        }
    });
    return sessionStats;
}

function _downloadCSV(user, groupKey, rows, sessionStats) {
    if (rows.length === 0) return;
    const group = CSV_GROUPS[groupKey];
    // Colonnes internes → en-têtes CSV affichés
    const colDefs = [
        { key: 'date_heure',              header: 'date_heure'              },
        { key: 'utilisateur',             header: 'utilisateur'             },
        { key: 'age',                     header: 'age'                     },
        { key: 'session_id',              header: 'session_id'              },
        { key: 'session_score',           header: 'session_score'           },
        { key: 'session_pct',             header: '% RC'                    },
        { key: 'exercice',                header: 'exercice'                },
        { key: 'question_id',             header: 'question_id'             },
        { key: 'type_exercice',           header: 'type_exercice'           },
        { key: 'est_correct',             header: 'est_correct'             },
        { key: 'nb_erreurs',              header: 'nb_total_erreurs'        },
        { key: 'nb_mauvaises_selections', header: 'nb_mauvaises_selections' },
        { key: 'nb_oublis',               header: 'nb_oublis'               },
        { key: 'duree_secondes',          header: 'TEMPS DE RÉACTION'       },
        { key: 'infos_erreurs',           header: 'infos_erreurs'           },
    ];

    const escape = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
        colDefs.map(d => d.header).join(','),
        ...rows.map(r => {
            const sid   = r.session_id || `__legacy__${r.exercice}`;
            const stats = sessionStats[sid];
            return colDefs.map(({ key: c }) => {
                if (c === 'session_score') return escape(stats.score);
                if (c === 'session_pct')   return escape(stats.pct);
                if (c === 'exercice')      return escape(CATEGORY_LABELS[r[c]] || r[c]);
                if (c === 'est_correct')   return r[c] == null ? '' : (r[c] ? 1 : 0);
                return escape(r[c]);
            }).join(',');
        })
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `resultats_${user}_${group.label}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Exporte tous les groupes d'un coup
function exportUserCSV(user) {
    const rows = _currentUserRows;
    if (!rows || rows.length === 0) return;
    const sessionStats = _buildSessionStats(rows);
    Object.keys(CSV_GROUPS).forEach(key => {
        const groupRows = rows.filter(r => CSV_GROUPS[key].ids.includes(r.exercice));
        _downloadCSV(user, key, groupRows, sessionStats);
    });
}

// Exporte un seul groupe
function exportUserCSVGroup(user, groupKey) {
    const rows = _currentUserRows;
    if (!rows || rows.length === 0) return;
    const sessionStats = _buildSessionStats(rows);
    const groupRows = rows.filter(r => CSV_GROUPS[groupKey].ids.includes(r.exercice));
    _downloadCSV(user, groupKey, groupRows, sessionStats);
}