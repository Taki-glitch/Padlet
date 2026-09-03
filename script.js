const firebaseConfig = {
  apiKey: "AIzaSyAGFzbPtFgIyI9YmWAaNfiw4QFv8uiwBnw",
  authDomain: "padlet-assembly.firebaseapp.com",
  projectId: "padlet-assembly",
  storageBucket: "padlet-assembly.firebasestorage.app",
  messagingSenderId: "550691267356",
  appId: "1:550691267356:web:b3a94b1d94014b82cd90d9",
  measurementId: "G-BJJDP6M9Q4"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const itemsCollection = collection(db, "padletItems");
let items = [];
let isDragging = false;
let dragStartX = 0;
let startScrollLeft = 0;

const $ = (id) => document.getElementById(id);
const btnTheme = $("btn-theme");
const btnTimeline = $("btn-timeline");
const viewThemes = $("view-themes");
const viewTimeline = $("view-timeline");
const timelineContainer = $("timeline-container");
const timelineScroll = $("timeline-scroll");
const formModal = $("form-modal");
const readModal = $("read-modal");
const docForm = $("doc-form");
const status = $("app-status");

function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
}

function dateLabel(date) {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${date}T12:00:00`));
}

function formatTags(tags = "") { return tags.split(",").map((tag) => tag.trim()).filter(Boolean); }

function render() { renderThemes(); renderTimeline(); }

function renderThemes() {
    viewThemes.replaceChildren();
    const documents = items.filter((item) => item.type === "document");
    if (!documents.length) {
        viewThemes.append(createEmpty("Aucun document pour le moment. Ajoutez-en un pour commencer."));
        return;
    }
    const themes = new Map();
    documents.forEach((item) => {
        const theme = item.theme || "Sans thème";
        themes.set(theme, [...(themes.get(theme) || []), item]);
    });
    [...themes.entries()].sort(([a], [b]) => a.localeCompare(b, "fr")).forEach(([theme, docs]) => {
        const column = document.createElement("article");
        column.className = "theme-column";
        const heading = document.createElement("h3");
        heading.textContent = theme;
        const count = document.createElement("small");
        count.textContent = ` (${docs.length})`;
        heading.append(count);
        column.append(heading, ...docs.sort(sortByDate).map(createDocumentCard));
        viewThemes.append(column);
    });
}

function createEmpty(message) { const el = document.createElement("p"); el.className = "empty-state"; el.textContent = message; return el; }
function sortByDate(a, b) { return new Date(a.date) - new Date(b.date); }

function createDocumentCard(item) {
    const card = document.createElement("article");
    card.className = "doc-card";
    const title = document.createElement("h4"); title.textContent = item.title;
    const date = document.createElement("p"); date.className = "card-date"; date.textContent = dateLabel(item.date);
    const summary = document.createElement("p"); summary.textContent = item.summary || "Sans résumé";
    const actions = createActions(item);
    card.append(title, date, summary, actions);
    card.addEventListener("click", () => openReadModal(item));
    return card;
}

function createActions(item) {
    const actions = document.createElement("div"); actions.className = "doc-actions";
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Modifier";
    edit.addEventListener("click", (event) => { event.stopPropagation(); openForm(item); });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete"; remove.textContent = "Supprimer";
    remove.addEventListener("click", (event) => { event.stopPropagation(); removeItem(item); });
    actions.append(edit, remove); return actions;
}

function renderTimeline() {
    timelineContainer.replaceChildren();
    const sorted = [...items].sort(sortByDate);
    if (!sorted.length) { timelineContainer.append(createEmpty("Votre frise apparaîtra ici.")); return; }
    const width = Math.max(900, 230 + (sorted.length - 1) * 230);
    timelineContainer.style.setProperty("--timeline-width", `${width}px`);
    sorted.forEach((item, index) => {
        const marker = document.createElement("article");
        marker.className = `timeline-marker ${item.type === "deadline" ? "deadline" : "document"}`;
        marker.style.left = `${index === 0 ? 7 : 7 + (index / Math.max(1, sorted.length - 1)) * 86}%`;
        if (item.type === "deadline") marker.style.setProperty("--marker-color", item.color || "#f97316");
        const label = document.createElement("div"); label.className = "timeline-label";
        const title = document.createElement("strong"); title.textContent = `${item.type === "deadline" ? "◆ " : ""}${item.title}`;
        const time = document.createElement("time"); time.textContent = dateLabel(item.date);
        label.append(title, time); marker.append(label);
        marker.addEventListener("click", () => { if (!isDragging) openReadModal(item); });
        timelineContainer.append(marker);
    });
}

function toggleTypeFields() {
    const isDocument = document.querySelector('input[name="item-type"]:checked').value === "document";
    $("document-fields").classList.toggle("hidden", !isDocument);
    $("deadline-fields").classList.toggle("hidden", isDocument);
    $("doc-theme").required = isDocument;
    $("doc-summary").required = isDocument;
}

function openForm(item = null) {
    docForm.reset();
    $("doc-id").value = item?.id || "";
    $("existing-file-url").value = item?.fileUrl || "";
    $("existing-file-path").value = item?.filePath || "";
    $("existing-file-name").value = item?.fileName || "";
    $("existing-file-type").value = item?.fileType || "";
    document.querySelector(`input[name="item-type"][value="${item?.type || "document"}"]`).checked = true;
    $("doc-title").value = item?.title || ""; $("doc-date").value = item?.date || "";
    $("doc-theme").value = item?.theme || ""; $("doc-tags").value = item?.tags || "";
    $("doc-summary").value = item?.summary || ""; $("doc-content").value = item?.content || "";
    $("deadline-color").value = item?.color || "#f97316"; $("deadline-description").value = item?.description || "";
    $("modal-title").textContent = item ? `Modifier ${item.type === "deadline" ? "l'échéance" : "le document"}` : "Ajouter un élément";
    toggleTypeFields(); formModal.classList.remove("hidden"); $("doc-title").focus();
}

async function uploadSelectedFile(id) {
    const file = $("doc-file").files[0];
    if (!file) return { fileUrl: $("existing-file-url").value, filePath: $("existing-file-path").value, fileName: $("existing-file-name").value, fileType: $("existing-file-type").value };
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `padlet-files/${id}/${Date.now()}-${safeName}`;
    const fileRef = ref(storage, filePath);
    await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
    const fileUrl = await getDownloadURL(fileRef);
    const oldPath = $("existing-file-path").value;
    if (oldPath && oldPath !== filePath) deleteObject(ref(storage, oldPath)).catch(() => {});
    return { fileUrl, filePath, fileName: file.name, fileType: file.type };
}

docForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = document.querySelector('input[name="item-type"]:checked').value;
    const id = $("doc-id").value || doc(itemsCollection).id;
    const submit = $("submit-item"); submit.disabled = true; submit.textContent = "Enregistrement…";
    try {
        const file = type === "document" ? await uploadSelectedFile(id) : { fileUrl: "", filePath: "", fileName: "", fileType: "" };
        if (type === "deadline" && $("existing-file-path").value) deleteObject(ref(storage, $("existing-file-path").value)).catch(() => {});
        const item = type === "document"
            ? { id, type, title: $("doc-title").value.trim(), date: $("doc-date").value, theme: $("doc-theme").value.trim(), tags: $("doc-tags").value.trim(), summary: $("doc-summary").value.trim(), content: $("doc-content").value.trim(), ...file }
            : { id, type, title: $("doc-title").value.trim(), date: $("doc-date").value, color: $("deadline-color").value, description: $("deadline-description").value.trim() };
        await setDoc(doc(db, "padletItems", id), item);
        formModal.classList.add("hidden"); setStatus("Élément enregistré en ligne.");
    } catch (error) { console.error(error); setStatus("Impossible d'enregistrer. Vérifiez votre configuration Firebase et vos règles.", true); }
    finally { submit.disabled = false; submit.textContent = "Enregistrer"; }
});

async function removeItem(item) {
    if (!window.confirm(`Supprimer « ${item.title} » ?`)) return;
    try {
        await deleteDoc(doc(db, "padletItems", item.id));
        if (item.filePath) deleteObject(ref(storage, item.filePath)).catch(() => {});
        setStatus("Élément supprimé.");
    } catch (error) { console.error(error); setStatus("La suppression a échoué.", true); }
}

function openReadModal(item) {
    $("read-type").textContent = item.type === "deadline" ? "Échéance" : "Document";
    $("read-title").textContent = item.title; $("read-date").textContent = dateLabel(item.date);
    $("read-theme").textContent = item.theme || ""; $("read-theme-wrap").classList.toggle("hidden", !item.theme);
    $("read-summary").textContent = item.type === "deadline" ? (item.description || "Aucune précision.") : (item.summary || "");
    $("read-content").textContent = item.type === "document" ? (item.content || "") : "";
    const tags = $("read-tags"); tags.replaceChildren();
    if (item.type === "document") formatTags(item.tags).forEach((tag) => { const el = document.createElement("span"); el.className = "tag"; el.textContent = tag; tags.append(el); });
    const preview = $("read-file"); preview.replaceChildren();
    if (item.fileUrl) {
        if ((item.fileType || "").startsWith("image/")) { const image = document.createElement("img"); image.src = item.fileUrl; image.alt = `Aperçu : ${item.title}`; preview.append(image); }
        else { const link = document.createElement("a"); link.className = "file-link"; link.href = item.fileUrl; link.target = "_blank"; link.rel = "noopener"; link.textContent = item.fileType === "application/pdf" ? "Prévisualiser le PDF" : `Télécharger ${item.fileName || "le fichier"}`; preview.append(link); }
    }
    readModal.classList.remove("hidden");
}

function setView(timeline) { btnTheme.classList.toggle("active", !timeline); btnTimeline.classList.toggle("active", timeline); viewThemes.classList.toggle("hidden", timeline); viewTimeline.classList.toggle("hidden", !timeline); }
btnTheme.addEventListener("click", () => setView(false)); btnTimeline.addEventListener("click", () => setView(true)); $("btn-add").addEventListener("click", () => openForm());
document.querySelectorAll('input[name="item-type"]').forEach((input) => input.addEventListener("change", toggleTypeFields));
$("close-form").addEventListener("click", () => formModal.classList.add("hidden")); $("close-read").addEventListener("click", () => readModal.classList.add("hidden"));
window.addEventListener("click", (event) => { if (event.target === formModal) formModal.classList.add("hidden"); if (event.target === readModal) readModal.classList.add("hidden"); });
window.addEventListener("keydown", (event) => { if (event.key === "Escape") { formModal.classList.add("hidden"); readModal.classList.add("hidden"); } });

timelineScroll.addEventListener("mousedown", (event) => { isDragging = false; dragStartX = event.pageX - timelineScroll.offsetLeft; startScrollLeft = timelineScroll.scrollLeft; timelineScroll.classList.add("dragging"); });
timelineScroll.addEventListener("mousemove", (event) => { if (!timelineScroll.classList.contains("dragging")) return; event.preventDefault(); const distance = (event.pageX - timelineScroll.offsetLeft) - dragStartX; if (Math.abs(distance) > 4) isDragging = true; timelineScroll.scrollLeft = startScrollLeft - distance; });
["mouseup", "mouseleave"].forEach((name) => timelineScroll.addEventListener(name, () => { timelineScroll.classList.remove("dragging"); setTimeout(() => { isDragging = false; }, 0); }));

onSnapshot(itemsCollection, (snapshot) => { items = snapshot.docs.map((item) => item.data()); render(); setStatus(`${items.length} élément${items.length > 1 ? "s" : ""} synchronisé${items.length > 1 ? "s" : ""}.`); }, (error) => { console.error(error); setStatus("Connexion Firestore impossible. Ajoutez votre configuration Firebase et autorisez Firestore/Storage.", true); });
