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

// Logos affichés sur les boutons des menus (piliers et sous-menus), indexés par l'id
// passé à startCategory() pour ce bouton (id de groupe ou, à défaut, id de catégorie directe)
const MENU_LOGOS = {
    'langue_ecrite_group': 'assets/logos/LE.png',
    'lsf_group':           'assets/logos/LSF.png',
    'ponts_group':         'assets/logos/ponts.png',
    'vrai_faux_group':     'assets/logos/pro_des_formes3.png',
    'qui_est_ce_group':    'assets/logos/poil_aux_pattes.png',
    'para_group':          'assets/logos/assosigne.png',
    'recit_group':         'assets/logos/signe.png',
    'temps_group':         'assets/logos/temps.png',
    'anaphore_group':      'assets/logos/cherche_sens.png',
    'cat_pronoms':         'assets/logos/jetuil.gif',
};

function menuLogoHtml(id) {
    const src = MENU_LOGOS[id];
    return src ? `<img class="btn-logo" src="${src}" alt="">` : '';
}

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
            displayName = 'Pro des formes';
        } else if (category.id.includes('cat_recit')) {
            targetId = 'recit_group';
            displayName = 'Il était un signe';
        } else if (category.id.includes('cat_para')) {
            targetId = 'para_group';
            displayName = 'Assosigne';
        } else if (category.id.includes('anaphore')) {
            targetId = 'anaphore_group';
            displayName = 'À la recherche de sens';
        } else if (category.id.includes('qui_est_ce')) {
            targetId = 'qui_est_ce_group';
            displayName = 'Poil aux pattes';
        } else if (category.id.startsWith('cat_le_')) {
            targetId = 'langue_ecrite_group';
            displayName = 'Langue Écrite';
        }

        html += ` > <a href="#" onclick="startCategory('${targetId}')">${displayName}</a>`;
    }

    if (exo) {
        const list = currentCategory
            ? (currentCategory.exercices || currentCategory.questions || currentCategory.phrases || [])
            : [];
        const index = list.findIndex(e => e.id === exo.id);
        const isGrille = currentCategory && currentCategory.type === 'grille_elimination';
        const isPhrase = currentCategory && currentCategory.affichage === 'phrase';
        const name = index >= 0
            ? (isGrille ? `Défi ${index + 1}` : isPhrase ? `Phrase ${index + 1}` : `Question ${index + 1}`)
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
        { id: 'langue_ecrite_group', nom: 'Langue Écrite', desc: 'Travaille la compréhension et la production du français écrit.' },
        { id: 'lsf_group', nom: 'LSF', desc: 'Des jeux pour progresser en langue des signes.' },
        { id: 'ponts_group', nom: 'Ponts', desc: 'Fais le lien entre le français et la LSF.' }
    ];

    menu.innerHTML = mainPillars.map(pillar => `
        <div class="card">
            ${menuLogoHtml(pillar.id)}
            <h3>${pillar.nom}</h3>
            <button class="btn-play" onclick="startCategory('${pillar.id}')" ${pillar.placeholder ? 'disabled' : ''}>${pillar.placeholder ? 'Bientôt disponible' : 'Faire le défi'}</button>
        </div>
    `).join('');
}

// Affiche les sous-catégories du pilier "LSF"
function showSubMenuLSF() {
    const items = [
        { id: 'vrai_faux_group', nom: 'Pro des formes' },
        { id: 'qui_est_ce_group', nom: 'Poil aux pattes' },
        { id: 'para_group', nom: 'Assosigne' },
        { id: 'recit_group', nom: 'Il était un signe' },
        { id: 'temps_group', nom: 'Voyage dans le temps' }
    ];
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>LSF — Choisis ton défi :</h2>
            <div class="options-grid">
                ${items.map(i => `<button class="btn-variant" onclick="startCategory('${i.id}')" ${i.placeholder ? 'disabled' : ''}>${menuLogoHtml(i.id)}${i.nom}${i.placeholder ? ' (bientôt disponible)' : ''}</button>`).join('')}
            </div>
        </div>`;
}

// Affiche les défis disponibles pour le pilier "Langue Écrite"
function showSubMenuLangueEcrite() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Langue Écrite — Choisis ton défi :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_le_d3_pronoms_sujets')">Pronoms personnels sujets</button>
                <button class="btn-variant" onclick="showSubMenuLangueEcriteArticles()">Articles</button>
                <button class="btn-variant" onclick="showSubMenuLangueEcriteNegation()">Négation</button>
                <button class="btn-variant" onclick="showSubMenuLangueEcritePrepositions()">Préposition</button>
                <button class="btn-variant" onclick="showSubMenuLangueEcriteFonctions()">Fonctions</button>
                <button class="btn-variant" onclick="showSubMenuLangueEcriteTemps()">Emploi des temps</button>
                <button class="btn-variant" onclick="showSubMenuLangueEcriteAccords()">Accords en genre et en nombre</button>
            </div>
        </div>`;
}

// Affiche les défis regroupés sous "Accords en genre et en nombre"
function showSubMenuLangueEcriteAccords() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Accords en genre et en nombre — Choisis ton défi :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_le_d64_accords_adjectifs')">Défi 1</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d66_accords_genre')">Défi 2</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d68_accords_pluriel')">Défi 3</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d70_pluriel_mots')">Défi 4</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d72_choix_mots')">Défi 5</button>
            </div>
        </div>`;
}

// Affiche les défis regroupés sous "Emploi des temps"
function showSubMenuLangueEcriteTemps() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Emploi des temps — Choisis ton défi :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_le_d49_temps')">Défi 1 — Hier, maintenant, demain</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d49_temps_2')">Défi 2 — Étiquettes temporelles</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d53_conjugaison_present')">Défi 3 — Conjugaison au présent</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d55_conjugaison_passe_compose')">Défi 4 — Conjugaison au passé composé</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d57_conjugaison_futur_proche')">Défi 5 — Conjugaison au futur proche</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d59_conjugaison_futur')">Défi 6 — Conjugaison au futur</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d61_conjugaison_contexte')">Défi 7 — Conjugaison selon le contexte</button>
            </div>
        </div>`;
}

// Affiche les défis regroupés sous "Fonctions"
function showSubMenuLangueEcriteFonctions() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Fonctions — Choisis ton défi :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_le_d42_fonctions')">Défi 1</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d43_fonctions')">Défi 2</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d44_fonctions')">Défi 3</button>
            </div>
        </div>`;
}

// Affiche les défis regroupés sous "Préposition"
function showSubMenuLangueEcritePrepositions() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Préposition — Choisis ton défi :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_le_d35_prepositions')">Défi 1 — À, de, chez, sur, dans, vers, du</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d35_prepositions_2')">Défi 2 — À, de, dans, avec</button>
            </div>
        </div>`;
}

// Affiche les défis regroupés sous "Négation"
function showSubMenuLangueEcriteNegation() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Négation — Choisis ton défi :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_le_d26_negation_pas')">Défi 1 — Ne...pas</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d28_negation_plus_jamais')">Défi 2 — Ne...plus / Ne...jamais</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d30_negation_personne_rien')">Défi 3 — Personne / Rien</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d32_negation_mixte')">Défi 4 — Négation mixte</button>
            </div>
        </div>`;
}

// Affiche les deux défis regroupés sous "Articles"
function showSubMenuLangueEcriteArticles() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Articles — Choisis ton défi :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_le_d6_articles')">Défi 1 — Articles définis et indéfinis</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d14_articles_sport')">Défi 2 — Partitifs</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d8_articles_simples_def')">Défi 3 — Le, la, l', les</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d10_articles_simples_indef')">Défi 4 — Un, une, des</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d17_omelette')">Défi 5 — Recette de l'omelette</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d19_sandwich')">Défi 6 — Recette du sandwich</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d12_articles_tableau')">Défi 7 — Trier par article</button>
                <button class="btn-variant" onclick="startCategory('cat_le_d21_articles_images')">Défi 8 — Trier par article (images)</button>
            </div>
        </div>`;
}

// Affiche les sous-catégories du pilier "Ponts"
function showSubMenuPonts() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="submenu-selection">
            <h2>Ponts — Choisis ton défi :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('anaphore_group')">${menuLogoHtml('anaphore_group')}À la recherche de sens</button>
                <button class="btn-variant" onclick="startCategory('cat_pronoms')">${menuLogoHtml('cat_pronoms')}MISSIONS PRONOMS</button>
            </div>
        </div>`;
}

// Affiche le choix des 3 niveaux de l'exercice "Temps"
function showSubMenuTemps() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="help-button-container">
            <button class="btn-help" onclick="openConsigneModal('temps_group')">?</button>
        </div>
        <div class="submenu-selection">
            <h2>Voyage dans le temps — Choisis ton niveau :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="startCategory('cat_temps_niv1')">Niveau 1</button>
                <button class="btn-variant" onclick="startCategory('cat_temps_niv2')">Niveau 2</button>
                <button class="btn-variant" onclick="startCategory('cat_temps_niv3')">Niveau 3</button>
            </div>
        </div>`;
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
function showConsigneVideoIfNeeded(category, onComplete, extraText = '', extraHtml = '') {
    if (category.consignes && !hasShownConsigne(category.id)) {
        markConsigneShown(category.id);
        consigneCallback = onComplete;
        const hasSupp = !!category.consignesupp;
        const container = document.getElementById('exercise-container');

        function renderConsigneScreen(src, index, total) {
            container.innerHTML = `
                <div class="consigne-screen">
                    <h2>Consigne du défi${total > 1 ? ` <span class="consigne-counter">${index}/${total}</span>` : ''}</h2>
                    ${extraText ? `<p>${extraText}</p>` : ''}
                    <video id="consigne-video" class="video-main" controls autoplay src="${src}"></video>
                    ${extraHtml}
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

    if (catId === 'langue_ecrite_group') {
        updateBreadcrumb({ id: 'langue_ecrite_group', nom: 'Langue Écrite' });
        showSubMenuLangueEcrite();
    }
    else if (catId === 'lsf_group') {
        updateBreadcrumb({ id: 'lsf_group', nom: 'LSF' });
        showSubMenuLSF();
    }
    else if (catId === 'ponts_group') {
        updateBreadcrumb({ id: 'ponts_group', nom: 'Ponts' });
        showSubMenuPonts();
    }
    else if (catId === 'temps_group') {
        updateBreadcrumb({ id: 'temps_group', nom: 'Voyage dans le temps' });
        showSubMenuTemps();
    }
    else if (catId === 'vrai_faux_group') {
        updateBreadcrumb({ id: 'vrai_faux_group', nom: 'Pro des formes' });
        showSubMenuVraiFaux();
    }
    else if (catId === 'recit_group') {
        updateBreadcrumb({ id: 'recit_group', nom: 'Il était un signe' });
        showSubMenuRecit();
    }
    else if (catId === 'para_group') {
        updateBreadcrumb({ id: 'para_group', nom: 'Assosigne' });
        showSubMenuParadigme();
    }
    else if (catId === 'anaphore_group') {
        updateBreadcrumb({ id: 'anaphore_group', nom: 'À la recherche de sens' });
        showSubMenuAnaphore();
    }
    else if (catId === 'qui_est_ce_group') {
        updateBreadcrumb({ id: 'qui_est_ce_group', nom: 'Poil aux pattes' });
        showSubMenuQuiEstCeGroup();
    }
    else if (category) {
        updateBreadcrumb(category);
        if (/^cat_anaphore\d*_lsf$/.test(category.id)) {
            showAnaphoreRecit(category);
        }
        else if (category.id.includes('cat_anaphore')) {
            showAnaphoreConsigne(category);
        }
        else if (category.id.includes('cat_recit')) {
            showConsigneVideoIfNeeded(category, () => showRecitIntro(category), "Regarde attentivement l'histoire avant de répondre aux questions.");
        }
        else if (category.id.includes('qui_est_ce')) {
            showConsigneVideoIfNeeded(category, () => showSubMenuQuiEstCe(category));
        }
        else if (category.id.startsWith('cat_le_')) {
            const isEtiquetteUnique = category.type === 'text_to_text';
            showConsigneVideoIfNeeded(category, () => {
                if (isEtiquetteUnique) loadExerciseTexteEtiquettes(category, 0);
                else if (category.type === 'texte_trous_etiquettes') loadExerciseTexteEtiquettesListe(category);
                else if (category.type === 'grille_tri') {
                    if (category.affichage === 'phrase') loadExerciseGrilleTriPhrase(category, 0);
                    else loadExerciseGrilleTri(category);
                }
                else if (category.type === 'reponse_libre_negation') loadExerciseNegation(category, 0);
                else if (category.type === 'texte_trous_saisie') loadExerciseTexteTrousSaisie(category);
                else if (category.type === 'phrase_reecriture') loadExercisePhraseReecriture(category);
                else if (category.affichage === 'liste') loadExerciseTexteTrousListe(category);
                else loadExerciseTexteTrous(category, 0);
            }, '', isEtiquetteUnique ? buildEtiquetteDemoHtml() : '');
        } else {
            if (category.type === 'tri_temporel') prepareTempsQuestions(category);
            showConsigneVideoIfNeeded(category, () => loadExercise(category, 0));
        }
    }
}

// Mélange un tableau (Fisher-Yates) sans modifier l'original
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Reconstruit à chaque lancement les questions de l'exercice "Temps" : mélange les vidéos
// fixes du niveau avec un tirage aléatoire dans la banque partagée "en cours" (niveaux 2 et 3),
// puis les transforme au format QCM générique (3 options fixes = les colonnes en_cours/fini/vava).
function prepareTempsQuestions(category) {
    if (!category._rawQuestions) {
        category._rawQuestions = category.questions;
    }

    let pool = [...category._rawQuestions];
    if (category.banque_en_cours_ref) {
        const banque = (currentData.banques_partagees && currentData.banques_partagees[category.banque_en_cours_ref]) || [];
        const tirage = shuffleArray(banque).slice(0, category.banque_en_cours_count || 0);
        pool = pool.concat(tirage);
    }
    pool = shuffleArray(pool);

    const colonneLabels = category.colonnes.map(c => c.label);
    category.questions = pool.map(q => ({
        id: q.id,
        video: q.video,
        options: colonneLabels,
        reponse: category.colonnes.findIndex(c => c.id === q.reponse)
    }));
}

// Affiche les variantes du mode Assosigne
function showSubMenuVraiFaux() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="help-button-container">
            <button class="btn-help" onclick="openConsigneModal('vrai_faux_group')">?</button>
        </div>
        <div class="submenu-selection">
            <h2>Choisis le mode :</h2>
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
            <h2>Choisis le mode :</h2>
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
            <h2>Choisis ton récit :</h2>
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
            <h2>Choisis ton défi :</h2>
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

// Affiche le choix entre les différentes versions d'Anaphore (anaphore1, anaphore2, ...)
function showSubMenuAnaphore() {
    document.getElementById('exercise-container').innerHTML = `
        <div class="help-button-container">
            <button class="btn-help" onclick="openAnaphoreGlobalConsigneModal()">?</button>
        </div>
        <div class="submenu-selection">
            <h2>Choisis ton récit :</h2>
            <div class="options-grid">
                <button class="btn-variant" onclick="showSubMenuAnaphoreVariant(1)">Anaphore 1</button>
                <button class="btn-variant" onclick="showSubMenuAnaphoreVariant(2)">Anaphore 2</button>
            </div>
        </div>`;
}

const ANAPHORE_VARIANT_SUFFIXES = ['lsf', 'fr>lsf', 'lsf>fr', 'fr'];
const ANAPHORE_VARIANT_LABELS = {
    'lsf':    'Anaphore LSF',
    'fr>lsf': 'Pont Français > LSF',
    'lsf>fr': 'Pont LSF > Français',
    'fr':     'Anaphore Français écrit'
};

// Affiche les 4 défis (LSF / FR>LSF / LSF>FR / FR écrit) d'une version d'Anaphore
function showSubMenuAnaphoreVariant(variantNum) {
    const buttons = ANAPHORE_VARIANT_SUFFIXES.map(suffix => {
        const catId = `cat_anaphore${variantNum}_${suffix}`;
        const category = currentData.categories.find(c => c.id === catId);
        if (!category) return '';
        const list = category.exercices || category.questions || [];
        const firstId = list[0] ? list[0].id : '';
        return `<button class="btn-variant" onclick="loadExerciseById('${catId}', '${firstId}')">${ANAPHORE_VARIANT_LABELS[suffix]}</button>`;
    }).join('');

    document.getElementById('exercise-container').innerHTML = `
        <div class="help-button-container">
            <button class="btn-help" onclick="openAnaphoreGlobalConsigneModal()">?</button>
        </div>
        <div class="submenu-selection">
            <h2>Anaphore ${variantNum} — Choisis ton défi :</h2>
            <div class="options-grid">${buttons}</div>
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
        if (/^cat_anaphore\d*_lsf$/.test(category.id) && index === 0) {
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

// Construit une regex qui surligne le "target" en entier, sans matcher un fragment
// à l'intérieur d'un autre mot (ex: "le" ne doit pas matcher dans "Elle" ou "console")
const FRENCH_LETTER = 'a-zA-ZÀ-ÖØ-öø-ÿ';
function buildTargetRegex(target) {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startsWithLetter = new RegExp(`^[${FRENCH_LETTER}]`).test(target);
    const endsWithLetter = new RegExp(`[${FRENCH_LETTER}]$`).test(target);
    const lookbehind = startsWithLetter ? `(?<![${FRENCH_LETTER}])` : '';
    const lookahead = endsWithLetter ? `(?![${FRENCH_LETTER}])` : '';
    return new RegExp(`${lookbehind}(${escaped})${lookahead}`, 'gi');
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
    
    if (/^cat_anaphore\d*_fr$/.test(category.id)) {
        let fullText = category.texte_contexte || "";

        if (item.phrase && item.target) {
            let phraseHighlighted = item.phrase.replace(buildTargetRegex(item.target), `<u>$1</u>`);
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
        if (/^cat_anaphore\d*_fr>lsf$/.test(category.id) && index > 0) {
            const prevText = category.questions[index - 1].text;
            
            if (text.startsWith(prevText)) {
                const newPart = text.substring(prevText.length);
                text = `<span class="text-history">${prevText}</span><span class="text-new">${newPart}</span>`;
            }
        }

        if (item.target) {
            text = text.replace(buildTargetRegex(item.target), `<span class="target-text">$1</span>`);
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
    if (videoSrc && (/^cat_anaphore\d*_lsf$/.test(category.id) || category.id.includes('cat_recit'))) {
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

// Petite animation de démonstration : une étiquette "Exemple" reliée par un trait à l'ombre où la
// déposer, avec un curseur qui parcourt le trait en boucle. Utilisée dans la consigne et le modal "?".
function buildEtiquetteDemoHtml() {
    return `
        <div class="etiquette-demo">
            <div class="etiquette-demo-row">
                <div class="etiquette etiquette-demo-tag"><span class="etiquette-label">Exemple</span></div>
                <div class="etiquette-demo-line-wrap">
                    <div class="etiquette-demo-line"></div>
                    <img class="etiquette-demo-cursor" src="assets/images/LE/curseur.png" alt="">
                </div>
                <div class="te-dropzone etiquette-demo-shadow"></div>
            </div>
            <p class="etiquette-demo-caption">Glisse l'étiquette jusqu'à l'ombre, ou clique dessus pour la placer.</p>
        </div>`;
}

// Affiche une question de l'exercice "Langue Écrite — étiquettes à glisser-déposer" :
// texte de référence en haut, phrase concernée + zone de dépôt à droite, banque d'étiquettes en dessous
function loadExerciseTexteEtiquettes(category, index) {
    currentCategory = category;
    currentStep = index;
    const container = document.getElementById('exercise-container');
    const item = category.questions[index];
    if (!item) return;
    currentExo = item;

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category, item);

    if (index === 0) {
        currentScore = 0;
        totalQuestions = 0;
        totalErrors = 0;
        totalWrongSelected = 0;
        totalMissed = 0;
        currentSessionId = crypto.randomUUID();
    }
    startTime = Date.now();

    let fullText = category.texte_contexte || "";
    if (item.phrase) {
        const phraseHighlighted = item.target
            ? item.phrase.replace(buildTargetRegex(item.target), `<u>$1</u>`)
            : item.phrase;
        fullText = fullText.replace(item.phrase, `<strong>${phraseHighlighted}</strong>`);
    }

    let phraseDisplay = item.phrase || '';
    if (item.target) {
        phraseDisplay = phraseDisplay.replace(buildTargetRegex(item.target), `<span class="target-text">$1</span>`);
    }

    const shuffledOptions = shuffleArray((item.options || []).map((opt, i) => ({ opt, i })));

    let html = `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;

    html += `
        <div class="recit-reference-card">
            <h3>Texte de référence</h3>
            <p>${fullText}</p>
        </div>
        <div class="te-phrase-row">
            <div class="te-phrase-box card-text-consigne"><p>${phraseDisplay}</p></div>
            <div class="te-dropzone" id="te-dropzone"
                 ondragover="event.preventDefault()"
                 ondragenter="event.preventDefault(); this.classList.add('drag-over')"
                 ondragleave="this.classList.remove('drag-over')"
                 ondrop="handleEtiquetteDrop(event)"></div>
        </div>
        <div class="te-bank" id="te-bank">
            ${shuffledOptions.map(({ opt, i }) => `
                <div class="etiquette" id="etq-${i}" draggable="true"
                     ondragstart="handleEtiquetteDragStart(event, ${i})"
                     onclick="placeEtiquette(${i})">
                    <span class="etiquette-label">${opt}</span>
                </div>`).join('')}
        </div>
        <button class="btn-play btn-validate" id="btn-valider-etq" onclick="validateEtiquette()" disabled>Valider</button>`;

    container.innerHTML = html;
}

let draggedEtiquetteIndex = null;

function handleEtiquetteDragStart(e, i) {
    draggedEtiquetteIndex = i;
    e.dataTransfer.setData('text/plain', i);
    e.dataTransfer.effectAllowed = 'move';
}

function handleEtiquetteDrop(e) {
    e.preventDefault();
    const dropzone = document.getElementById('te-dropzone');
    if (dropzone) dropzone.classList.remove('drag-over');
    const raw = e.dataTransfer.getData('text/plain');
    const i = raw !== '' ? parseInt(raw) : draggedEtiquetteIndex;
    if (i !== null && !isNaN(i)) placeEtiquette(i);
}

// Place (ou déplace) une étiquette dans la zone de dépôt ; renvoie l'ancienne étiquette dans la banque
function placeEtiquette(i) {
    if (!isClickable) return;
    const dropzone = document.getElementById('te-dropzone');
    const bank = document.getElementById('te-bank');
    const el = document.getElementById(`etq-${i}`);
    if (!dropzone || !bank || !el) return;

    const previous = dropzone.querySelector('.etiquette');
    if (previous && previous !== el) bank.appendChild(previous);

    dropzone.appendChild(el);
    // L'ombre épouse la taille naturelle de l'étiquette qu'on vient d'y déposer, en un peu plus grand
    dropzone.style.width = (el.offsetWidth + 16) + 'px';
    dropzone.style.height = (el.offsetHeight + 12) + 'px';
    document.getElementById('btn-valider-etq').disabled = false;
}

// Vérifie l'étiquette déposée dans la zone de réponse
function validateEtiquette() {
    if (!isClickable) return;
    const dropzone = document.getElementById('te-dropzone');
    const placed = dropzone ? dropzone.querySelector('.etiquette') : null;
    if (!placed) return;

    isClickable = false;

    const index = parseInt(placed.id.split('-')[1]);
    const isCorrect = index === currentExo.reponse;
    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

    totalQuestions++;
    if (isCorrect) currentScore++;
    sendDataToSupabase(currentExo.id, currentCategory.type, isCorrect, null, duree);

    placed.classList.add(isCorrect ? 'etiquette-correct' : 'etiquette-incorrect');
    placed.draggable = false;
    placed.onclick = null;

    setTimeout(() => {
        const nextIndex = currentStep + 1;
        const total = (currentCategory.questions || []).length;

        if (nextIndex < total) {
            loadExerciseTexteEtiquettes(currentCategory, nextIndex);
        } else {
            showFinishModal();
            isClickable = true;
            startCategory('langue_ecrite_group');
        }
    }, 900);
}

// Affiche une question de l'exercice "Langue Écrite — texte à trous multiples" : la phrase
// complète avec, à chaque emplacement "{}", un menu déroulant stylisé rempli avec banque_options
function loadExerciseTexteTrous(category, index) {
    currentCategory = category;
    currentStep = index;
    const container = document.getElementById('exercise-container');
    const item = category.questions[index];
    if (!item) return;
    currentExo = item;

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category, item);

    if (index === 0) {
        currentScore = 0;
        totalQuestions = 0;
        totalErrors = 0;
        totalWrongSelected = 0;
        totalMissed = 0;
        currentSessionId = crypto.randomUUID();
    }
    startTime = Date.now();

    const segments = item.phrase.split('{}');

    let phraseHtml = segments[0];
    for (let i = 0; i < item.reponses.length; i++) {
        // Chaque trou peut avoir ses propres options (options_par_trou), sinon on retombe
        // sur la banque partagée de la catégorie (ex: articles réutilisables à chaque trou)
        const options = (item.options_par_trou && item.options_par_trou[i]) || category.banque_options || [];
        phraseHtml += `<select class="trou-select" id="trou-${i}" onchange="checkTrousComplete()">
                <option value="" selected disabled>...</option>
                ${options.map((opt, oi) => `<option value="${oi}">${opt}</option>`).join('')}
            </select>`;
        phraseHtml += segments[i + 1] || '';
    }

    let html = `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;
    html += `
        <div class="recit-reference-card te-trous-card">
            <p class="te-trous-text">${phraseHtml}</p>
        </div>
        <button class="btn-play btn-validate" id="btn-valider-trous" onclick="validateTrous()" disabled>Valider</button>`;

    container.innerHTML = html;
}

// Active le bouton "Valider" seulement quand tous les menus déroulants ont une valeur choisie
function checkTrousComplete() {
    const selects = document.querySelectorAll('.trou-select');
    const allFilled = [...selects].every(s => s.value !== '');
    const btn = document.getElementById('btn-valider-trous');
    if (btn) btn.disabled = !allFilled;
}

// Vérifie chaque menu déroulant de la phrase courante
function validateTrous() {
    if (!isClickable) return;
    const selects = document.querySelectorAll('.trou-select');
    if (selects.length === 0) return;
    isClickable = false;

    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    const segments = currentExo.phrase.split('{}');
    let wrong = 0;
    const erreursDetails = [];

    selects.forEach((sel, i) => {
        const options = (currentExo.options_par_trou && currentExo.options_par_trou[i]) || currentCategory.banque_options || [];
        const chosen = parseInt(sel.value, 10);
        const correct = currentExo.reponses[i];
        sel.disabled = true;
        if (chosen === correct) {
            sel.classList.add('trou-correct');
        } else {
            sel.classList.add('trou-incorrect');
            wrong++;

            // Contexte de l'erreur : le mot juste avant et juste après le trou concerné
            const beforeWords = (segments[i] || '').trim().split(/\s+/).filter(Boolean);
            const afterWords  = (segments[i + 1] || '').trim().split(/\s+/).filter(Boolean);
            const wordBefore  = beforeWords.length ? beforeWords[beforeWords.length - 1] : '';
            const wordAfter   = afterWords.length ? afterWords[0] : '';
            const mis         = options[chosen] ?? '?';
            const attendu     = options[correct] ?? '?';
            erreursDetails.push(
                `« ${[wordBefore, mis, wordAfter].filter(Boolean).join(' ')} » au lieu de « ${[wordBefore, attendu, wordAfter].filter(Boolean).join(' ')} »`
            );
        }
    });

    totalQuestions += selects.length;
    currentScore += (selects.length - wrong);
    totalErrors += wrong;
    sendDataToSupabase(currentExo.id, currentCategory.type, null, wrong, duree, {
        infos_erreurs: erreursDetails.length ? erreursDetails.join(' | ') : null
    });

    setTimeout(() => {
        const nextIndex = currentStep + 1;
        const total = (currentCategory.questions || []).length;

        if (nextIndex < total) {
            loadExerciseTexteTrous(currentCategory, nextIndex);
        } else {
            showFinishModal();
            isClickable = true;
            startCategory('langue_ecrite_group');
        }
    }, 1200);
}

// Variante "liste" du texte à trous : toutes les phrases (mots simples) affichées en même temps
// sur un seul écran, chacune avec son propre menu déroulant, un seul bouton "Valider" pour tout.
function loadExerciseTexteTrousListe(category) {
    currentCategory = category;
    currentStep = 0;
    currentExo = null;
    const container = document.getElementById('exercise-container');

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category);

    currentScore = 0;
    totalQuestions = 0;
    totalErrors = 0;
    totalWrongSelected = 0;
    totalMissed = 0;
    currentSessionId = crypto.randomUUID();
    startTime = Date.now();

    const itemsHtml = category.questions.map((q, qi) => {
        const segments = q.phrase.split('{}');
        let itemHtml = segments[0];
        for (let bi = 0; bi < q.reponses.length; bi++) {
            const options = (q.options_par_trou && q.options_par_trou[bi]) || category.banque_options || [];
            itemHtml += `<select class="trou-select" id="trou-${qi}-${bi}" onchange="checkTrousListeComplete()">
                    <option value="" selected disabled>...</option>
                    ${options.map((opt, oi) => `<option value="${oi}">${opt}</option>`).join('')}
                </select>`;
            itemHtml += segments[bi + 1] || '';
        }
        return `<li class="te-trous-item">${itemHtml}</li>`;
    }).join('');

    let html = `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;
    html += `
        <div class="recit-reference-card te-trous-card">
            <ul class="te-trous-liste">${itemsHtml}</ul>
        </div>
        <button class="btn-play btn-validate" id="btn-valider-trous" onclick="validateTrousListe()" disabled>Valider</button>`;

    container.innerHTML = html;
}

// Active le bouton "Valider" seulement quand tous les menus déroulants de la liste ont une valeur
function checkTrousListeComplete() {
    const selects = document.querySelectorAll('.trou-select');
    const allFilled = [...selects].every(s => s.value !== '');
    const btn = document.getElementById('btn-valider-trous');
    if (btn) btn.disabled = !allFilled;
}

// Vérifie tous les mots de la liste d'un coup
function validateTrousListe() {
    if (!isClickable) return;
    isClickable = false;

    const category = currentCategory;
    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

    category.questions.forEach((q, qi) => {
        const segments = q.phrase.split('{}');
        let wrong = 0;
        const erreursDetails = [];

        q.reponses.forEach((correct, bi) => {
            const sel = document.getElementById(`trou-${qi}-${bi}`);
            if (!sel) return;
            const options = (q.options_par_trou && q.options_par_trou[bi]) || category.banque_options || [];
            const chosen = parseInt(sel.value, 10);
            sel.disabled = true;
            if (chosen === correct) {
                sel.classList.add('trou-correct');
            } else {
                sel.classList.add('trou-incorrect');
                wrong++;

                const beforeWords = (segments[bi] || '').trim().split(/\s+/).filter(Boolean);
                const afterWords  = (segments[bi + 1] || '').trim().split(/\s+/).filter(Boolean);
                const wordBefore  = beforeWords.length ? beforeWords[beforeWords.length - 1] : '';
                const wordAfter   = afterWords.length ? afterWords[0] : '';
                const mis         = options[chosen] ?? '?';
                const attendu     = options[correct] ?? '?';
                erreursDetails.push(
                    `« ${[wordBefore, mis, wordAfter].filter(Boolean).join(' ')} » au lieu de « ${[wordBefore, attendu, wordAfter].filter(Boolean).join(' ')} »`
                );
            }
        });

        totalQuestions += q.reponses.length;
        currentScore += (q.reponses.length - wrong);
        totalErrors += wrong;
        sendDataToSupabase(q.id, category.type, null, wrong, duree, {
            infos_erreurs: erreursDetails.length ? erreursDetails.join(' | ') : null
        });
    });

    setTimeout(() => {
        showFinishModal();
        isClickable = true;
        startCategory('langue_ecrite_group');
    }, 1200);
}

// --- LANGUE ÉCRITE — TEXTE À TROUS PAR SAISIE LIBRE (ex. conjugaison) ---
// Toutes les phrases affichées en même temps, chaque trou est un champ texte dont le
// placeholder (le verbe à l'infinitif) s'efface dès qu'on tape et réapparaît si le champ est vidé
// — comportement natif de l'attribut HTML "placeholder", aucun JS supplémentaire requis pour ça.

function loadExerciseTexteTrousSaisie(category) {
    currentCategory = category;
    currentStep = 0;
    currentExo = null;
    const container = document.getElementById('exercise-container');

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category);

    currentScore = 0;
    totalQuestions = 0;
    totalErrors = 0;
    totalWrongSelected = 0;
    totalMissed = 0;
    currentSessionId = crypto.randomUUID();
    startTime = Date.now();

    const itemsHtml = category.questions.map((q, qi) => {
        const segments = q.phrase.split('{}');
        let itemHtml = segments[0];
        for (let bi = 0; bi < q.reponses.length; bi++) {
            const infinitif = q.infinitifs[bi] || '';
            itemHtml += `<input type="text" class="conj-input" id="saisie-${qi}-${bi}"
                placeholder="${infinitif}" autocomplete="off" autocapitalize="off" spellcheck="false"
                oninput="checkSaisieComplete()">`;
            itemHtml += segments[bi + 1] || '';
        }
        return `<li class="te-trous-item">${itemHtml}</li>`;
    }).join('');

    let html = `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;
    html += `
        <div class="recit-reference-card te-trous-card">
            <ul class="te-trous-liste">${itemsHtml}</ul>
        </div>
        <button class="btn-play btn-validate" id="btn-valider-saisie" onclick="validateSaisie()" disabled>Valider</button>`;

    container.innerHTML = html;
}

// Active "Valider" seulement quand tous les champs ont été remplis
function checkSaisieComplete() {
    const inputs = document.querySelectorAll('.conj-input');
    const allFilled = [...inputs].every(inp => inp.value.trim() !== '');
    const btn = document.getElementById('btn-valider-saisie');
    if (btn) btn.disabled = !allFilled;
}

// Corrige tous les champs d'un coup (comparaison insensible à la casse)
function validateSaisie() {
    if (!isClickable) return;
    const inputs = document.querySelectorAll('.conj-input');
    if (inputs.length === 0) return;
    isClickable = false;

    const category = currentCategory;
    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    const normalize = s => s.trim().toLowerCase().replace(/\s*[.?!]+$/, '');

    category.questions.forEach((q, qi) => {
        let wrong = 0;
        const donnees = [];

        q.reponses.forEach((correct, bi) => {
            const inp = document.getElementById(`saisie-${qi}-${bi}`);
            if (!inp) return;
            const donne = inp.value.trim();
            donnees.push(donne);
            // Un trou peut accepter plusieurs formulations (ex: "va prendre" ou "prendra")
            const accepted = Array.isArray(correct) ? correct : [correct];
            const isCorrect = accepted.some(c => normalize(donne) === normalize(c));
            inp.disabled = true;
            inp.classList.add(isCorrect ? 'conj-correct' : 'conj-incorrect');
            if (!isCorrect) wrong++;
        });

        totalQuestions += q.reponses.length;
        currentScore += (q.reponses.length - wrong);
        totalErrors += wrong;

        const attenduAll = q.reponses.map(r => Array.isArray(r) ? r.join('/') : r).join(' / ');
        sendDataToSupabase(q.id, category.type, wrong === 0, null, duree, {
            infos_erreurs: wrong === 0 ? null : `Réponse : « ${donnees.join(' / ')} » au lieu de « ${attenduAll} »`
        });
    });

    setTimeout(() => {
        showFinishModal();
        isClickable = true;
        startCategory('langue_ecrite_group');
    }, 1200);
}

// --- LANGUE ÉCRITE — RÉÉCRITURE DE PHRASE ENTIÈRE (ex. accorder un mot en gras au pluriel) ---
// La phrase d'origine (avec le mot ciblé en gras) est affichée, l'élève retape toute la phrase
// transformée dans un champ libre. Toutes les phrases affichées en même temps.

function loadExercisePhraseReecriture(category) {
    currentCategory = category;
    currentStep = 0;
    currentExo = null;
    const container = document.getElementById('exercise-container');

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category);

    currentScore = 0;
    totalQuestions = 0;
    totalErrors = 0;
    totalWrongSelected = 0;
    totalMissed = 0;
    currentSessionId = crypto.randomUUID();
    startTime = Date.now();

    const itemsHtml = category.questions.map((q, qi) => `
        <li class="reecriture-item">
            <p class="reecriture-original">${q.original}</p>
            <input type="text" class="conj-input reecriture-input" id="reec-${qi}"
                placeholder="" autocomplete="off" autocapitalize="off" spellcheck="false"
                oninput="checkReecritureComplete()">
        </li>`).join('');

    let html = `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;
    html += `
        <div class="recit-reference-card te-trous-card">
            <ul class="te-trous-liste">${itemsHtml}</ul>
        </div>
        <button class="btn-play btn-validate" id="btn-valider-reec" onclick="validateReecriture()" disabled>Valider</button>`;

    container.innerHTML = html;
}

// Active "Valider" seulement quand toutes les phrases ont été retapées
function checkReecritureComplete() {
    const inputs = document.querySelectorAll('.reecriture-input');
    const allFilled = [...inputs].every(inp => inp.value.trim() !== '');
    const btn = document.getElementById('btn-valider-reec');
    if (btn) btn.disabled = !allFilled;
}

// Corrige chaque phrase réécrite (comparaison insensible à la casse et aux espaces superflus)
function validateReecriture() {
    if (!isClickable) return;
    const inputs = document.querySelectorAll('.reecriture-input');
    if (inputs.length === 0) return;
    isClickable = false;

    const category = currentCategory;
    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    const normalize = s => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’]/g, "'").replace(/\s*[.?!]+$/, '');

    category.questions.forEach((q, qi) => {
        const inp = document.getElementById(`reec-${qi}`);
        if (!inp) return;
        const donne = inp.value.trim();
        const accepted = Array.isArray(q.reponse) ? q.reponse : [q.reponse];
        const isCorrect = accepted.some(r => normalize(donne) === normalize(r));

        inp.disabled = true;
        inp.classList.add(isCorrect ? 'conj-correct' : 'conj-incorrect');

        totalQuestions += 1;
        if (isCorrect) currentScore += 1;
        else totalErrors += 1;

        sendDataToSupabase(q.id, category.type, isCorrect, null, duree, {
            infos_erreurs: isCorrect ? null : `Réponse : « ${donne} » au lieu de « ${accepted.join(' / ')} »`
        });
    });

    setTimeout(() => {
        showFinishModal();
        isClickable = true;
        startCategory('langue_ecrite_group');
    }, 1200);
}

// --- LANGUE ÉCRITE — ÉTIQUETTES À USAGE UNIQUE (ex. recettes) ---
// Une ombre par mot de la liste, une banque d'étiquettes (autant que de mots, doublons compris)
// à glisser une seule fois chacune. Vidéo de contexte affichée à droite.

let selectedEtiquetteMultiIndex = null;

function loadExerciseTexteEtiquettesListe(category) {
    currentCategory = category;
    currentStep = 0;
    currentExo = null;
    selectedEtiquetteMultiIndex = null;
    const container = document.getElementById('exercise-container');

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category);

    currentScore = 0;
    totalQuestions = 0;
    totalErrors = 0;
    totalWrongSelected = 0;
    totalMissed = 0;
    currentSessionId = crypto.randomUUID();
    startTime = Date.now();

    const shuffledEtiquettes = shuffleArray(category.questions.map((q, i) => ({ i, texte: q.reponse })));

    // Deux formats supportés : "mot" (l'ombre précède un mot fixe, ex. les recettes) ou
    // "phrase" avec "{}" à l'endroit du trou (peut être au début, au milieu ou à la fin).
    const itemsHtml = category.questions.map((q, qi) => {
        const dropzoneHtml = `<div class="te-dropzone" id="dzm-${qi}"
                 onclick="handleDropzoneMultiClick(${qi})"
                 ondragover="event.preventDefault()"
                 ondragenter="event.preventDefault(); this.classList.add('drag-over')"
                 ondragleave="this.classList.remove('drag-over')"
                 ondrop="handleEtiquetteMultiDrop(event, ${qi})"></div>`;

        if (q.phrase) {
            const [before, after] = q.phrase.split('{}');
            const beforeHtml = before ? `<span class="te-liste-mot">${before}</span>` : '';
            const afterHtml = after ? `<span class="te-liste-mot">${after}</span>` : '';
            return `<li class="te-liste-item">${beforeHtml}${dropzoneHtml}${afterHtml}</li>`;
        }

        return `<li class="te-liste-item">${dropzoneHtml}<span class="te-liste-mot">${q.mot}</span></li>`;
    }).join('');

    const bankHtml = shuffledEtiquettes.map(({ i, texte }) => `
        <div class="etiquette" id="etqm-${i}" draggable="true"
             ondragstart="handleEtiquetteMultiDragStart(event, ${i})"
             onclick="selectEtiquetteMulti(${i})">
            <span class="etiquette-label">${texte}</span>
        </div>`).join('');

    let html = `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;
    html += `
        <div class="te-liste-layout">
            <div class="te-liste-main">
                ${category.intro ? `<p class="te-liste-intro">${category.intro}</p>` : ''}
                <ul class="te-liste-items">${itemsHtml}</ul>
                <div class="te-bank" id="te-bank-multi"
                     ondragover="event.preventDefault()"
                     ondrop="handleBankMultiDrop(event)">${bankHtml}</div>
            </div>
            ${category.video_contexte ? `
            <div class="te-liste-video">
                <video class="video-main" controls autoplay muted loop playsinline src="${category.video_contexte}"></video>
            </div>` : ''}
        </div>
        <button class="btn-play btn-validate" id="btn-valider-etqm" onclick="validateEtiquetteMulti()" disabled>Valider</button>`;

    container.innerHTML = html;
}

function handleEtiquetteMultiDragStart(e, i) {
    if (!isClickable) { e.preventDefault(); return; }
    draggedEtiquetteIndex = i;
    e.dataTransfer.setData('text/plain', i);
    e.dataTransfer.effectAllowed = 'move';
}

function handleEtiquetteMultiDrop(e, qi) {
    e.preventDefault();
    const dropzone = document.getElementById(`dzm-${qi}`);
    if (dropzone) dropzone.classList.remove('drag-over');
    if (!isClickable) return;
    const raw = e.dataTransfer.getData('text/plain');
    const i = raw !== '' ? parseInt(raw) : draggedEtiquetteIndex;
    if (i !== null && !isNaN(i)) placeEtiquetteMulti(i, qi);
}

// Dépose (glisser) une étiquette hors de sa zone : elle revient dans la banque
function handleBankMultiDrop(e) {
    e.preventDefault();
    if (!isClickable) return;
    const raw = e.dataTransfer.getData('text/plain');
    const i = raw !== '' ? parseInt(raw) : draggedEtiquetteIndex;
    if (i === null || isNaN(i)) return;
    const el = document.getElementById(`etqm-${i}`);
    const bank = document.getElementById('te-bank-multi');
    if (el && bank) {
        bank.appendChild(el);
        checkEtiquetteMultiComplete();
    }
}

// Clic sur une étiquette non placée : la sélectionne (ou désélectionne) pour un clic-pose ensuite
function selectEtiquetteMulti(i) {
    if (!isClickable) return;
    const el = document.getElementById(`etqm-${i}`);
    if (!el || el.parentElement.classList.contains('te-dropzone')) return;

    document.querySelectorAll('.etiquette.etiquette-selected').forEach(e => e.classList.remove('etiquette-selected'));
    if (selectedEtiquetteMultiIndex === i) {
        selectedEtiquetteMultiIndex = null;
        return;
    }
    selectedEtiquetteMultiIndex = i;
    el.classList.add('etiquette-selected');
}

// Clic sur une ombre : si elle contient déjà une étiquette, la renvoie dans la banque ;
// sinon, y place l'étiquette actuellement sélectionnée (le cas échéant)
function handleDropzoneMultiClick(qi) {
    if (!isClickable) return;
    const dropzone = document.getElementById(`dzm-${qi}`);
    const bank = document.getElementById('te-bank-multi');
    if (!dropzone || !bank) return;

    const existing = dropzone.querySelector('.etiquette');
    if (existing) {
        bank.appendChild(existing);
        dropzone.style.width = '';
        dropzone.style.height = '';
        checkEtiquetteMultiComplete();
        return;
    }

    if (selectedEtiquetteMultiIndex !== null) {
        placeEtiquetteMulti(selectedEtiquetteMultiIndex, qi);
        selectedEtiquetteMultiIndex = null;
    }
}

// Place l'étiquette i dans l'ombre qi (en renvoyant dans la banque celle qui y était déjà)
function placeEtiquetteMulti(i, qi) {
    if (!isClickable) return;
    const dropzone = document.getElementById(`dzm-${qi}`);
    const bank = document.getElementById('te-bank-multi');
    const el = document.getElementById(`etqm-${i}`);
    if (!dropzone || !bank || !el) return;

    const previous = dropzone.querySelector('.etiquette');
    if (previous && previous !== el) bank.appendChild(previous);

    el.classList.remove('etiquette-selected');
    dropzone.appendChild(el);
    // L'ombre épouse la taille naturelle de l'étiquette qu'on vient d'y déposer, en un peu plus grand
    dropzone.style.width = (el.offsetWidth + 16) + 'px';
    dropzone.style.height = (el.offsetHeight + 12) + 'px';

    checkEtiquetteMultiComplete();
}

// Active "Valider" seulement quand toutes les ombres contiennent une étiquette
function checkEtiquetteMultiComplete() {
    const total = currentCategory.questions.length;
    const filled = document.querySelectorAll('.te-liste-item .te-dropzone .etiquette').length;
    const btn = document.getElementById('btn-valider-etqm');
    if (btn) btn.disabled = filled !== total;
}

// Vérifie toutes les étiquettes déposées d'un coup
function validateEtiquetteMulti() {
    if (!isClickable) return;
    isClickable = false;

    const category = currentCategory;
    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    let totalWrong = 0;

    category.questions.forEach((q, qi) => {
        const dropzone = document.getElementById(`dzm-${qi}`);
        const placed = dropzone ? dropzone.querySelector('.etiquette') : null;
        const label = placed ? placed.querySelector('.etiquette-label') : null;
        const donne = label ? label.textContent.trim() : '';
        const isCorrect = donne === q.reponse;

        if (placed) {
            placed.classList.add(isCorrect ? 'etiquette-correct' : 'etiquette-incorrect');
            placed.draggable = false;
            placed.onclick = null;
        }
        if (!isCorrect) totalWrong++;

        const contexte = q.mot || (q.phrase ? q.phrase.replace('{}', `[${q.reponse}]`) : q.id);
        sendDataToSupabase(q.id, category.type, isCorrect, null, duree, {
            infos_erreurs: isCorrect ? null : `« ${donne || '(vide)'} » au lieu de « ${q.reponse} » (${contexte})`
        });
    });

    totalQuestions += category.questions.length;
    currentScore += (category.questions.length - totalWrong);
    totalErrors += totalWrong;

    setTimeout(() => {
        showFinishModal();
        isClickable = true;
        startCategory('langue_ecrite_group');
    }, 1200);
}

// --- LANGUE ÉCRITE — TABLEAU DE TRI (ex. classer par article) ---
// Un tableau à colonnes (Le / La / Les / L'), une banque d'étiquettes en dessous. Pas d'ombre :
// on glisse l'étiquette directement dans la colonne ; hors des colonnes, elle revient d'où elle vient
// (comportement natif du drag & drop HTML5 quand aucune zone valide ne traite le dépôt).

let selectedTriIndex = null;

function loadExerciseGrilleTri(category) {
    currentCategory = category;
    currentStep = 0;
    currentExo = null;
    selectedTriIndex = null;
    const container = document.getElementById('exercise-container');

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category);

    currentScore = 0;
    totalQuestions = 0;
    totalErrors = 0;
    totalWrongSelected = 0;
    totalMissed = 0;
    currentSessionId = crypto.randomUUID();
    startTime = Date.now();

    const shuffledItems = shuffleArray(category.questions.map((q, i) => ({ i, mot: q.mot, image: q.image })));

    const colonnesHtml = category.colonnes.map(col => `
        <div class="tri-colonne" id="tri-col-${col.id}"
             ondragover="event.preventDefault()"
             ondragenter="event.preventDefault(); this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="handleTriDrop(event, '${col.id}')"
             onclick="handleTriColonneClick('${col.id}')">
            <div class="tri-colonne-header">${col.label}</div>
            <div class="tri-colonne-body"></div>
        </div>`).join('');

    const bankHtml = shuffledItems.map(({ i, mot, image }) => image
        ? `<div class="image-carte" id="etqt-${i}" draggable="true"
                 ondragstart="handleTriDragStart(event, ${i})"
                 onclick="selectEtiquetteTri(${i})">
                <img src="${image}" alt="">
            </div>`
        : `<div class="etiquette" id="etqt-${i}" draggable="true"
             ondragstart="handleTriDragStart(event, ${i})"
             onclick="selectEtiquetteTri(${i})">
            <span class="etiquette-label">${mot}</span>
        </div>`).join('');

    let html = `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;
    html += `
        <div class="tri-tableau">${colonnesHtml}</div>
        <div class="te-bank" id="tri-bank"
             ondragover="event.preventDefault()"
             ondrop="handleTriBankDrop(event)"
             onclick="handleTriBankClick(event)">${bankHtml}</div>
        <button class="btn-play btn-validate" id="btn-valider-tri" onclick="validateTri()" disabled>Valider</button>`;

    container.innerHTML = html;
}

function handleTriDragStart(e, i) {
    if (!isClickable) { e.preventDefault(); return; }
    draggedEtiquetteIndex = i;
    e.dataTransfer.setData('text/plain', i);
    e.dataTransfer.effectAllowed = 'move';
}

function handleTriDrop(e, colId) {
    e.preventDefault();
    const col = document.getElementById(`tri-col-${colId}`);
    if (col) col.classList.remove('drag-over');
    if (!isClickable) return;
    const raw = e.dataTransfer.getData('text/plain');
    const i = raw !== '' ? parseInt(raw) : draggedEtiquetteIndex;
    if (i !== null && !isNaN(i)) placeEtiquetteTri(i, colId);
}

function handleTriBankDrop(e) {
    e.preventDefault();
    if (!isClickable) return;
    const raw = e.dataTransfer.getData('text/plain');
    const i = raw !== '' ? parseInt(raw) : draggedEtiquetteIndex;
    if (i === null || isNaN(i)) return;
    const el = document.getElementById(`etqt-${i}`);
    const bank = document.getElementById('tri-bank');
    if (el && bank) {
        el.classList.remove('etiquette-selected');
        bank.appendChild(el);
        checkTriComplete();
    }
}

// Place l'étiquette i dans la colonne colId
function placeEtiquetteTri(i, colId) {
    if (!isClickable) return;
    const body = document.querySelector(`#tri-col-${colId} .tri-colonne-body`);
    const el = document.getElementById(`etqt-${i}`);
    if (!body || !el) return;
    el.classList.remove('etiquette-selected');
    body.appendChild(el);
    checkTriComplete();
}

// Clic sur une étiquette : la sélectionne (ou désélectionne) pour un clic-pose ensuite
function selectEtiquetteTri(i) {
    if (!isClickable) return;
    const el = document.getElementById(`etqt-${i}`);
    if (!el) return;
    document.querySelectorAll('.etiquette-selected').forEach(e => e.classList.remove('etiquette-selected'));
    if (selectedTriIndex === i) {
        selectedTriIndex = null;
        return;
    }
    selectedTriIndex = i;
    el.classList.add('etiquette-selected');
}

// Clic sur une colonne : y dépose l'étiquette actuellement sélectionnée (le cas échéant)
function handleTriColonneClick(colId) {
    if (!isClickable) return;
    if (selectedTriIndex !== null) {
        placeEtiquetteTri(selectedTriIndex, colId);
        selectedTriIndex = null;
    }
}

// Clic dans la banque (hors étiquette) : y renvoie l'étiquette sélectionnée
function handleTriBankClick(e) {
    if (!isClickable) return;
    if (e.target.closest('.etiquette')) return;
    if (selectedTriIndex !== null) {
        const el = document.getElementById(`etqt-${selectedTriIndex}`);
        const bank = document.getElementById('tri-bank');
        if (el && bank) bank.appendChild(el);
        selectedTriIndex = null;
        checkTriComplete();
    }
}

// Active "Valider" seulement quand toutes les étiquettes ont quitté la banque
function checkTriComplete() {
    const bank = document.getElementById('tri-bank');
    const btn = document.getElementById('btn-valider-tri');
    if (btn) btn.disabled = !bank || bank.querySelectorAll('.etiquette, .image-carte').length > 0;
}

// Nom lisible d'un item pour les logs (le mot, ou le nom du fichier image sans extension)
function itemLabel(q) {
    if (q.mot) return q.mot;
    if (q.image) return q.image.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    return q.id;
}

// Vérifie la colonne de chaque étiquette
function validateTri() {
    if (!isClickable) return;
    isClickable = false;

    const category = currentCategory;
    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    let totalWrong = 0;

    const labelOf = colId => (category.colonnes.find(c => c.id === colId) || {}).label || colId;

    category.questions.forEach((q, i) => {
        const el = document.getElementById(`etqt-${i}`);
        if (!el) return;
        const colEl = el.closest('.tri-colonne');
        const placedCol = colEl ? colEl.id.replace('tri-col-', '') : null;
        const isCorrect = placedCol === q.colonne;

        el.classList.add(isCorrect ? 'etiquette-correct' : 'etiquette-incorrect');
        el.draggable = false;
        el.onclick = null;
        if (!isCorrect) totalWrong++;

        const nom = itemLabel(q);
        sendDataToSupabase(q.id, category.type, isCorrect, null, duree, {
            infos_erreurs: isCorrect ? null : `« ${placedCol ? labelOf(placedCol) : '(non classé)'} ${nom} » au lieu de « ${labelOf(q.colonne)} ${nom} »`
        });
    });

    totalQuestions += category.questions.length;
    currentScore += (category.questions.length - totalWrong);
    totalErrors += totalWrong;

    setTimeout(() => {
        showFinishModal();
        isClickable = true;
        startCategory('langue_ecrite_group');
    }, 1200);
}

// --- TABLEAU DE TRI — VARIANTE "PHRASE PAR PHRASE" (ex. Fonctions grammaticales) ---
// Comme loadExerciseGrilleTri, mais une phrase à la fois : la phrase en haut, le tableau,
// puis seulement les étiquettes issues de cette phrase. On valide, puis on passe à la suivante.

function loadExerciseGrilleTriPhrase(category, phraseIndex) {
    currentCategory = category;
    currentStep = phraseIndex;
    selectedTriIndex = null;
    const container = document.getElementById('exercise-container');
    const phrase = category.phrases[phraseIndex];
    if (!phrase) return;
    currentExo = phrase;

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category, phrase);

    if (phraseIndex === 0) {
        currentScore = 0;
        totalQuestions = 0;
        totalErrors = 0;
        totalWrongSelected = 0;
        totalMissed = 0;
        currentSessionId = crypto.randomUUID();
    }
    startTime = Date.now();

    // Les étiquettes restent dans l'ordre de la phrase (pas de mélange), pour suivre sa lecture
    const shuffledItems = phrase.items.map((it, i) => ({ i, mot: it.mot, image: it.image }));

    const colonnesHtml = category.colonnes.map(col => `
        <div class="tri-colonne" id="tri-col-${col.id}"
             ondragover="event.preventDefault()"
             ondragenter="event.preventDefault(); this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="handleTriDrop(event, '${col.id}')"
             onclick="handleTriColonneClick('${col.id}')">
            <div class="tri-colonne-header">${col.label}</div>
            <div class="tri-colonne-body"></div>
        </div>`).join('');

    const bankHtml = shuffledItems.map(({ i, mot, image }) => image
        ? `<div class="image-carte" id="etqt-${i}" draggable="true"
                 ondragstart="handleTriDragStart(event, ${i})"
                 onclick="selectEtiquetteTri(${i})">
                <img src="${image}" alt="">
            </div>`
        : `<div class="etiquette" id="etqt-${i}" draggable="true"
             ondragstart="handleTriDragStart(event, ${i})"
             onclick="selectEtiquetteTri(${i})">
            <span class="etiquette-label">${mot}</span>
        </div>`).join('');

    let html = `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;
    html += `
        <div class="step-counter">Phrase ${phraseIndex + 1} / ${category.phrases.length}</div>
        <div class="card-text-consigne"><p>${phrase.texte}</p></div>
        <div class="tri-tableau">${colonnesHtml}</div>
        <div class="te-bank" id="tri-bank"
             ondragover="event.preventDefault()"
             ondrop="handleTriBankDrop(event)"
             onclick="handleTriBankClick(event)">${bankHtml}</div>
        <button class="btn-play btn-validate" id="btn-valider-tri" onclick="validateTriPhrase()" disabled>Valider</button>`;

    container.innerHTML = html;
}

// Vérifie la colonne de chaque étiquette de la phrase courante, puis passe à la phrase suivante
function validateTriPhrase() {
    if (!isClickable) return;
    isClickable = false;

    const category = currentCategory;
    const phrase = currentExo;
    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    let totalWrong = 0;

    const labelOf = colId => (category.colonnes.find(c => c.id === colId) || {}).label || colId;

    phrase.items.forEach((it, i) => {
        const el = document.getElementById(`etqt-${i}`);
        if (!el) return;
        const colEl = el.closest('.tri-colonne');
        const placedCol = colEl ? colEl.id.replace('tri-col-', '') : null;
        const isCorrect = placedCol === it.colonne;

        el.classList.add(isCorrect ? 'etiquette-correct' : 'etiquette-incorrect');
        el.draggable = false;
        el.onclick = null;
        if (!isCorrect) totalWrong++;

        const nom = itemLabel(it);
        sendDataToSupabase(`${phrase.id}_${i}`, category.type, isCorrect, null, duree, {
            infos_erreurs: isCorrect ? null : `« ${placedCol ? labelOf(placedCol) : '(non classé)'} ${nom} » au lieu de « ${labelOf(it.colonne)} ${nom} »`
        });
    });

    totalQuestions += phrase.items.length;
    currentScore += (phrase.items.length - totalWrong);
    totalErrors += totalWrong;

    setTimeout(() => {
        const nextIndex = currentStep + 1;
        const total = category.phrases.length;

        if (nextIndex < total) {
            loadExerciseGrilleTriPhrase(category, nextIndex);
        } else {
            showFinishModal();
            isClickable = true;
            startCategory('langue_ecrite_group');
        }
    }, 1200);
}

// --- LANGUE ÉCRITE — RÉPONSE LIBRE (ex. négation) ---
// L'élève tape sa réponse dans un champ texte ; notation par points partiels selon des critères
// grammaticaux (présence de "ne/n'", de "pas", et le cas échéant d'un changement de sujet correct).

// Analyse une réponse tapée et renvoie {score, max, manque} selon les critères de la question
function gradeNegationAnswer(text, item) {
    const negWord = item.negation_mot || 'pas';
    const hasNe = /\bne\b|n['’]/i.test(text);
    const hasNegWord = new RegExp(`\\b${negWord}\\b`, 'i').test(text);
    let score = (hasNe ? 1 : 0) + (hasNegWord ? 1 : 0);
    let max = 2;
    const manque = [];
    if (!hasNe) manque.push('le « ne »/« n’ »');
    if (!hasNegWord) manque.push(`le « ${negWord} »`);

    // sujets_valides contient des motifs regex prêts à l'emploi (gère l'élision, ex: "je['’]" pour je/j')
    if (item.changement_sujet_requis && Array.isArray(item.sujets_valides)) {
        max = 3;
        const hasSujet = item.sujets_valides.some(s => new RegExp(s, 'i').test(text));
        if (hasSujet) score += 1;
        else manque.push('le bon changement de sujet');
    }

    return { score, max, manque };
}

// Affiche une question à réponse libre, avec l'exemple de référence rappelé au-dessus
function loadExerciseNegation(category, index) {
    currentCategory = category;
    currentStep = index;
    const container = document.getElementById('exercise-container');
    const item = category.questions[index];
    if (!item) return;
    currentExo = item;

    consecutiveErrors = 0;
    isClickable = true;
    updateBreadcrumb(category, item);

    if (index === 0) {
        currentScore = 0;
        totalQuestions = 0;
        totalErrors = 0;
        totalWrongSelected = 0;
        totalMissed = 0;
        currentSessionId = crypto.randomUUID();
    }
    startTime = Date.now();

    const exemple = category.exemple;

    let html = `<div class="help-button-container"><button class="btn-help" onclick="openConsigneModal('${category.id}')">?</button></div>`;
    if (exemple) {
        html += `
        <div class="neg-exemple-card">
            <p class="neg-exemple-label">Exemple</p>
            <p class="neg-exemple-text"><strong>${exemple.question}</strong><br>→ ${exemple.reponse}</p>
        </div>`;
    }
    html += `
        <div class="card-text-consigne"><p>${item.question}</p></div>
        <div class="neg-reponse-zone">
            <span class="neg-non">Non,</span>
            <input type="text" id="neg-input" class="neg-input" placeholder="..." autocomplete="off" oninput="checkNegationComplete()">
        </div>
        <p id="neg-feedback" class="neg-feedback hidden"></p>
        <button class="btn-play btn-validate" id="btn-valider-neg" onclick="validateNegation()" disabled>Valider</button>`;

    container.innerHTML = html;
    const input = document.getElementById('neg-input');
    if (input) {
        input.focus();
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !document.getElementById('btn-valider-neg').disabled) {
                document.getElementById('btn-valider-neg').click();
            }
        });
    }
}

// Active "Valider" seulement quand un texte a été saisi
function checkNegationComplete() {
    const input = document.getElementById('neg-input');
    const btn = document.getElementById('btn-valider-neg');
    if (btn) btn.disabled = !input || input.value.trim() === '';
}

// --- MESURE TEMPORAIRE (test de la notation) : affiche le score + le détail des critères,
// et nécessite un second clic sur "Valider" (devenu "Question suivante") pour continuer.
// À retirer / remettre en mode silencieux une fois la grille de notation validée. ---

// Corrige la réponse libre et affiche le détail des points obtenus
function validateNegation() {
    if (!isClickable) return;
    const input = document.getElementById('neg-input');
    if (!input || !input.value.trim()) return;
    isClickable = false;

    const category = currentCategory;
    const item = currentExo;
    const duree = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
    const text = input.value.trim();
    const { score, max, manque } = gradeNegationAnswer(text, item);
    const isFullyCorrect = score === max;

    input.disabled = true;
    input.classList.add(isFullyCorrect ? 'neg-input-correct' : (score > 0 ? 'neg-input-partial' : 'neg-input-incorrect'));

    const feedback = document.getElementById('neg-feedback');
    if (feedback) {
        const negWord = item.negation_mot || 'pas';
        const hasNe = /\bne\b|n['’]/i.test(text);
        const hasNegWord = new RegExp(`\\b${negWord}\\b`, 'i').test(text);

        let details = `<span class="neg-critere ${hasNe ? 'ok' : 'ko'}">${hasNe ? '✓' : '✗'} « ne »/« n’ »</span>`;
        details += ` <span class="neg-critere ${hasNegWord ? 'ok' : 'ko'}">${hasNegWord ? '✓' : '✗'} « ${negWord} »</span>`;
        if (item.changement_sujet_requis && Array.isArray(item.sujets_valides)) {
            const hasSujet = item.sujets_valides.some(s => new RegExp(s, 'i').test(text));
            details += ` <span class="neg-critere ${hasSujet ? 'ok' : 'ko'}">${hasSujet ? '✓' : '✗'} changement de sujet</span>`;
        }

        feedback.innerHTML = `<strong>${score}/${max} points</strong><br>${details}`;
        feedback.className = 'neg-feedback ' + (isFullyCorrect ? 'neg-feedback-ok' : 'neg-feedback-partial');
    }

    totalQuestions += max;
    currentScore += score;
    totalErrors += (max - score);

    sendDataToSupabase(item.id, category.type, isFullyCorrect, null, duree, {
        infos_erreurs: isFullyCorrect ? null : `Réponse : « Non, ${text} » — ${score}/${max} pts, manque : ${manque.join(', ')}`
    });

    // Il faut recliquer sur le bouton (devenu "Question suivante" / "Terminer") pour avancer
    const total = (category.questions || []).length;
    const isLast = currentStep + 1 >= total;
    const btn = document.getElementById('btn-valider-neg');
    if (btn) {
        btn.textContent = isLast ? 'Terminer' : 'Question suivante';
        btn.disabled = false;
        btn.onclick = () => {
            const nextIndex = currentStep + 1;
            if (nextIndex < total) {
                loadExerciseNegation(category, nextIndex);
            } else {
                showFinishModal();
                isClickable = true;
                startCategory('langue_ecrite_group');
            }
        };
    }
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
            else if (currentCategory.id === 'cat_pronoms') startCategory('ponts_group');
            else if (currentCategory.id.startsWith('cat_temps_niv')) startCategory('temps_group');
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
        .filter((c, i, arr) => arr.findIndex(x => x.consignes === c.consignes) === i)
        .map(c => ({ label: c.nom, src: c.consignes }));

    const showEtiquetteDemo = categories.some(c => c.type === 'text_to_text' || c.type === 'texte_trous_etiquettes');
    renderConsigneModal(texteConsigne, videos, showEtiquetteDemo ? buildEtiquetteDemoHtml() : '');
}

// Consigne globale des anaphores (commune à anaphore1 et anaphore2, un seul fichier
// suffit donc pas de risque de doublon même si les 2 versions partagent le même "groupe")
const ANAPHORE_GLOBAL_CONSIGNE = 'assets/videos/anaphore1/ana_consignes.mp4';
function openAnaphoreGlobalConsigneModal() {
    renderConsigneModal(
        "Des consignes en langage des signes sont disponibles au début de chaque exercice.",
        [{ label: null, src: ANAPHORE_GLOBAL_CONSIGNE }]
    );
}

function renderConsigneModal(texteConsigne, videos, extraHtml = '') {
    const videosHtml = videos.length > 0 ? `
        <div style="margin-top: 20px;">
            <h3 style="margin-bottom: 12px; color: #333;">Revoir la consigne en vidéo</h3>
            ${videos.map((v, i) => `
                <div style="margin-bottom: 8px;">
                    ${videos.length > 1 && v.label ? `<p style="font-weight:700;margin:0 0 6px;">${v.label}</p>` : ''}
                    <button class="btn-play" style="width:100%;" onclick="toggleConsigneVideo('mcv-${i}', this)">▶ Voir la consigne vidéo</button>
                    <video id="mcv-${i}" class="video-main" controls src="${v.src}" style="display:none;margin-top:10px;margin-bottom:0;"></video>
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
            ${extraHtml}
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
    if (currentCategory && currentCategory.id.startsWith('cat_le_')) {
        if (currentCategory.type === 'text_to_text') {
            loadExerciseTexteEtiquettes(currentCategory, 0);
        } else if (currentCategory.type === 'texte_trous_etiquettes') {
            loadExerciseTexteEtiquettesListe(currentCategory);
        } else if (currentCategory.type === 'grille_tri') {
            if (currentCategory.affichage === 'phrase') loadExerciseGrilleTriPhrase(currentCategory, 0);
            else loadExerciseGrilleTri(currentCategory);
        } else if (currentCategory.type === 'reponse_libre_negation') {
            loadExerciseNegation(currentCategory, 0);
        } else if (currentCategory.type === 'texte_trous_saisie') {
            loadExerciseTexteTrousSaisie(currentCategory);
        } else if (currentCategory.type === 'phrase_reecriture') {
            loadExercisePhraseReecriture(currentCategory);
        } else if (currentCategory.affichage === 'liste') {
            loadExerciseTexteTrousListe(currentCategory);
        } else {
            loadExerciseTexteTrous(currentCategory, 0);
        }
        return;
    }

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
    } else if (currentCategory.id.startsWith('cat_le_')) {
        startCategory('langue_ecrite_group');
    } else if (currentCategory.id === 'cat_pronoms') {
        startCategory('ponts_group');
    } else if (currentCategory.id.startsWith('cat_temps_niv')) {
        startCategory('temps_group');
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
    errorEl.textContent = 'Remplis tous les champs.';
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
    'cat_vrai_faux_image':    'Pro des formes — Video vers Image',
    'cat_vrai_faux_vidéo': 'Pro des formes — Image vers Video',
    'cat_recit_arc':          'Il était un signe — Arc de triomphe',
    'cat_recit_festival':     'Il était un signe — Festival',
    'cat_recit_restaurant':   'Il était un signe — Restaurant',
    'cat_para_a1':            'Assosigne — A1',
    'cat_para_a2':            'Assosigne — A2',
    'cat_para_a3':            'Assosigne — A3',
    'cat_para_n1':            'Assosigne — N1',
    'cat_para_n2':            'Assosigne — N2',
    'cat_para_n3':            'Assosigne — N3',
    // Anciens IDs (données historiques enregistrées avant le passage à anaphore1/anaphore2)
    'cat_anaphore_lsf':       'Anaphore 1 — LSF',
    'cat_anaphore_fr>lsf':    'Anaphore 1 — Français vers LSF',
    'cat_anaphore_lsf>fr':    'Anaphore 1 — LSF vers Français',
    'cat_anaphore_fr':        'Anaphore 1 — Français écrit',
    'cat_anaphore1_lsf':      'Anaphore 1 — LSF',
    'cat_anaphore1_fr>lsf':   'Anaphore 1 — Français vers LSF',
    'cat_anaphore1_lsf>fr':   'Anaphore 1 — LSF vers Français',
    'cat_anaphore1_fr':       'Anaphore 1 — Français écrit',
    'cat_anaphore2_lsf':      'Anaphore 2 — LSF',
    'cat_anaphore2_fr>lsf':   'Anaphore 2 — Français vers LSF',
    'cat_anaphore2_lsf>fr':   'Anaphore 2 — LSF vers Français',
    'cat_anaphore2_fr':       'Anaphore 2 — Français écrit',
    'cat_qui_est_ce_garder':  'Poil aux pattes — Sélection',
    'cat_qui_est_ce_eliminer':'Poil aux pattes — Elimination',
    'cat_pronoms':            'MISSIONS PRONOMS',
    'cat_temps_niv1':         'Voyage dans le temps — Niveau 1',
    'cat_temps_niv2':         'Voyage dans le temps — Niveau 2',
    'cat_temps_niv3':         'Voyage dans le temps — Niveau 3',
    'cat_le_d3_pronoms_sujets': 'Langue Écrite — Pronoms personnels sujets',
    'cat_le_d6_articles':       'Langue Écrite — Articles définis et indéfinis',
    'cat_le_d14_articles_sport':'Langue Écrite — Articles contractés (partitifs)',
    'cat_le_d8_articles_simples_def':   'Langue Écrite — Articles simples (le/la/l\'/les)',
    'cat_le_d10_articles_simples_indef':'Langue Écrite — Articles simples (un/une/des)',
    'cat_le_d17_omelette':      'Langue Écrite — Recette de l\'omelette',
    'cat_le_d19_sandwich':      'Langue Écrite — Recette du sandwich',
    'cat_le_d12_articles_tableau': 'Langue Écrite — Trier par article',
    'cat_le_d21_articles_images':  'Langue Écrite — Trier par article (images)',
    'cat_le_d26_negation_pas':     'Langue Écrite — Négation (ne...pas)',
    'cat_le_d28_negation_plus_jamais': 'Langue Écrite — Négation (ne...plus / ne...jamais)',
    'cat_le_d30_negation_personne_rien': 'Langue Écrite — Négation (personne / rien)',
    'cat_le_d32_negation_mixte': 'Langue Écrite — Négation (mixte)',
    'cat_le_d35_prepositions': 'Langue Écrite — Prépositions',
    'cat_le_d35_prepositions_2': 'Langue Écrite — Prépositions (Défi 2)',
    'cat_le_d42_fonctions': 'Langue Écrite — Fonctions grammaticales',
    'cat_le_d43_fonctions': 'Langue Écrite — Fonctions grammaticales (Défi 2)',
    'cat_le_d44_fonctions': 'Langue Écrite — Fonctions grammaticales (Défi 3)',
    'cat_le_d49_temps': 'Langue Écrite — Emploi des temps (hier/maintenant/demain)',
    'cat_le_d49_temps_2': 'Langue Écrite — Emploi des temps (Défi 2)',
    'cat_le_d53_conjugaison_present': 'Langue Écrite — Conjugaison (présent)',
    'cat_le_d55_conjugaison_passe_compose': 'Langue Écrite — Conjugaison (passé composé)',
    'cat_le_d57_conjugaison_futur_proche': 'Langue Écrite — Conjugaison (futur proche)',
    'cat_le_d59_conjugaison_futur': 'Langue Écrite — Conjugaison (futur simple)',
    'cat_le_d61_conjugaison_contexte': 'Langue Écrite — Conjugaison (selon le contexte)',
    'cat_le_d64_accords_adjectifs': 'Langue Écrite — Accords en genre et en nombre',
    'cat_le_d66_accords_genre': 'Langue Écrite — Accords en genre et en nombre (Défi 2)',
    'cat_le_d68_accords_pluriel': 'Langue Écrite — Accords en genre et en nombre (Défi 3)',
    'cat_le_d70_pluriel_mots': 'Langue Écrite — Accords en genre et en nombre (Défi 4)',
    'cat_le_d72_choix_mots': 'Langue Écrite — Accords en genre et en nombre (Défi 5)'
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
            { key: 'qui_est_ce', label: 'Poil aux pattes'  },
            { key: 'assosigne',  label: 'Pro des formes'   },
            { key: 'recit',      label: 'Il était un signe'      },
            { key: 'paradigme',  label: 'Assosigne'   },
            { key: 'anaphore',   label: 'À la recherche de sens' },
            { key: 'pronoms',    label: 'MISSIONS PRONOMS' },
            { key: 'temps',      label: 'Voyage dans le temps' },
            { key: 'langue_ecrite', label: 'Langue Écrite' },
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
    'anaphore':    { label: 'anaphore',    ids: [
        'cat_anaphore_lsf', 'cat_anaphore_fr>lsf', 'cat_anaphore_lsf>fr', 'cat_anaphore_fr',
        'cat_anaphore1_lsf', 'cat_anaphore1_fr>lsf', 'cat_anaphore1_lsf>fr', 'cat_anaphore1_fr',
        'cat_anaphore2_lsf', 'cat_anaphore2_fr>lsf', 'cat_anaphore2_lsf>fr', 'cat_anaphore2_fr'
    ] },
    'pronoms':     { label: 'pronoms',     ids: ['cat_pronoms'] },
    'temps':       { label: 'temps',       ids: ['cat_temps_niv1', 'cat_temps_niv2', 'cat_temps_niv3'] },
    'langue_ecrite': { label: 'langue_ecrite', ids: ['cat_le_d3_pronoms_sujets', 'cat_le_d6_articles', 'cat_le_d14_articles_sport', 'cat_le_d8_articles_simples_def', 'cat_le_d10_articles_simples_indef', 'cat_le_d17_omelette', 'cat_le_d19_sandwich', 'cat_le_d12_articles_tableau', 'cat_le_d21_articles_images', 'cat_le_d26_negation_pas', 'cat_le_d28_negation_plus_jamais', 'cat_le_d30_negation_personne_rien', 'cat_le_d32_negation_mixte', 'cat_le_d35_prepositions', 'cat_le_d35_prepositions_2', 'cat_le_d42_fonctions', 'cat_le_d43_fonctions', 'cat_le_d44_fonctions', 'cat_le_d49_temps', 'cat_le_d49_temps_2', 'cat_le_d53_conjugaison_present', 'cat_le_d55_conjugaison_passe_compose', 'cat_le_d57_conjugaison_futur_proche', 'cat_le_d59_conjugaison_futur', 'cat_le_d61_conjugaison_contexte', 'cat_le_d64_accords_adjectifs', 'cat_le_d66_accords_genre', 'cat_le_d68_accords_pluriel', 'cat_le_d70_pluriel_mots', 'cat_le_d72_choix_mots'] },
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
            const trousTotaux = s.rows.map(r => _getNbTrous(r.exercice, r.question_id));
            const totalTrous = trousTotaux.every(n => n != null) ? trousTotaux.reduce((a, b) => a + b, 0) : null;

            if (totalTrous) {
                const correct = totalTrous - totalErr;
                s.score = `${correct} sur ${totalTrous}`;
                s.pct   = `${Math.round((correct / totalTrous) * 100)}%`;
            } else {
                s.score = `${totalErr} erreur${totalErr > 1 ? 's' : ''}`;
                s.pct   = '—';
            }
        }
    });
    return sessionStats;
}

// Retrouve le nombre de trous d'une question "texte_trous_multiples" à partir de exercices.json
// (permet de calculer un %RC même si l'info n'a pas été stockée telle quelle dans Supabase)
function _getNbTrous(exerciceId, questionId) {
    if (!currentData) return null;
    const cat = currentData.categories.find(c => c.id === exerciceId);
    if (!cat || !Array.isArray(cat.questions)) return null;
    const q = cat.questions.find(q => q.id === questionId);
    return (q && Array.isArray(q.reponses)) ? q.reponses.length : null;
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