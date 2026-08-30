// Initialisation des données depuis le localStorage
let documents = JSON.parse(localStorage.getItem('padletDocs')) || [];

// Éléments du DOM
const btnTheme = document.getElementById('btn-theme');
const btnTimeline = document.getElementById('btn-timeline');
const viewThemes = document.getElementById('view-themes');
const viewTimeline = document.getElementById('view-timeline');
const timelineContainer = document.getElementById('timeline-container');

const formModal = document.getElementById('form-modal');
const readModal = document.getElementById('read-modal');
const docForm = document.getElementById('doc-form');

// --- GESTION DE L'AFFICHAGE (ONGLETS) ---
btnTheme.addEventListener('click', () => {
    btnTheme.classList.add('active');
    btnTimeline.classList.remove('active');
    viewThemes.classList.remove('hidden');
    viewTimeline.classList.add('hidden');
    render();
});

btnTimeline.addEventListener('click', () => {
    btnTimeline.classList.add('active');
    btnTheme.classList.remove('active');
    viewTimeline.classList.remove('hidden');
    viewThemes.classList.add('hidden');
    render();
});

// --- RENDU DES DOCUMENTS ---
function render() {
    renderThemes();
    renderTimeline();
    localStorage.setItem('padletDocs', JSON.stringify(documents));
}

function renderThemes() {
    viewThemes.innerHTML = '';
    
    // Regrouper par thèmes
    const themes = {};
    documents.forEach(doc => {
        if (!themes[doc.theme]) themes[doc.theme] = [];
        themes[doc.theme].push(doc);
    });

    // Créer les colonnes
    for (const [theme, docs] of Object.entries(themes)) {
        const column = document.createElement('div');
        column.className = 'theme-column';
        column.innerHTML = `<h3>${theme}</h3>`;
        
        docs.forEach(doc => {
            column.appendChild(createDocCard(doc));
        });
        viewThemes.appendChild(column);
    }
}

function renderTimeline() {
    timelineContainer.innerHTML = '';
    
    // Trier par date (du plus ancien au plus récent)
    const sortedDocs = [...documents].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedDocs.forEach(doc => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `<div class="timeline-date">${doc.date}</div>`;
        item.appendChild(createDocCard(doc));
        timelineContainer.appendChild(item);
    });
}

function createDocCard(doc) {
    const card = document.createElement('div');
    card.className = 'doc-card';
    card.innerHTML = `
        <h4>${doc.title}</h4>
        <p style="font-size: 0.9rem; color: #4B5563;">${doc.summary}</p>
        <div class="doc-actions">
            <button onclick="editDoc('${doc.id}', event)">Modifier</button>
            <button onclick="deleteDoc('${doc.id}', event)" style="color: red;">Supprimer</button>
        </div>
    `;
    // Ouvrir la lecture au clic sur la carte
    card.addEventListener('click', () => openReadModal(doc));
    return card;
}

// --- GESTION DU CRUD (Ajout, Modif, Suppression) ---
document.getElementById('btn-add').addEventListener('click', () => {
    docForm.reset();
    document.getElementById('doc-id').value = '';
    document.getElementById('modal-title').innerText = 'Ajouter un document';
    formModal.classList.remove('hidden');
});

docForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('doc-id').value || Date.now().toString();
    const newDoc = {
        id: id,
        title: document.getElementById('doc-title').value,
        date: document.getElementById('doc-date').value,
        theme: document.getElementById('doc-theme').value,
        tags: document.getElementById('doc-tags').value,
        summary: document.getElementById('doc-summary').value,
        content: document.getElementById('doc-content').value,
    };

    const index = documents.findIndex(d => d.id === id);
    if (index > -1) {
        documents[index] = newDoc; // Modif
    } else {
        documents.push(newDoc); // Ajout
    }

    formModal.classList.add('hidden');
    render();
});

window.deleteDoc = (id, event) => {
    event.stopPropagation(); // Empêche d'ouvrir la modale de lecture
    if (confirm('Voulez-vous vraiment supprimer ce document ?')) {
        documents = documents.filter(d => d.id !== id);
        render();
    }
};

window.editDoc = (id, event) => {
    event.stopPropagation();
    const doc = documents.find(d => d.id === id);
    if (doc) {
        document.getElementById('doc-id').value = doc.id;
        document.getElementById('doc-title').value = doc.title;
        document.getElementById('doc-date').value = doc.date;
        document.getElementById('doc-theme').value = doc.theme;
        document.getElementById('doc-tags').value = doc.tags;
        document.getElementById('doc-summary').value = doc.summary;
        document.getElementById('doc-content').value = doc.content;
        
        document.getElementById('modal-title').innerText = 'Modifier le document';
        formModal.classList.remove('hidden');
    }
};

// --- MODALES ET LECTURE ---
function openReadModal(doc) {
    document.getElementById('read-title').innerText = doc.title;
    document.getElementById('read-date').innerText = doc.date;
    document.getElementById('read-theme').innerText = doc.theme;
    document.getElementById('read-content').innerText = doc.content;
    
    const tagsContainer = document.getElementById('read-tags');
    tagsContainer.innerHTML = '';
    if(doc.tags) {
        doc.tags.split(',').forEach(tag => {
            const span = document.createElement('span');
            span.className = 'tag';
            span.innerText = tag.trim();
            tagsContainer.appendChild(span);
        });
    }
    readModal.classList.remove('hidden');
}

document.getElementById('close-form').addEventListener('click', () => formModal.classList.add('hidden'));
document.getElementById('close-read').addEventListener('click', () => readModal.classList.add('hidden'));

// Fermer les modales en cliquant à l'extérieur
window.addEventListener('click', (e) => {
    if (e.target === formModal) formModal.classList.add('hidden');
    if (e.target === readModal) readModal.classList.add('hidden');
});

// Premier rendu au chargement
render();
