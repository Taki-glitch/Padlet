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
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const itemsCollection = collection(db, "padletItems");
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
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
const searchInput = $("document-search");
const STORAGE_LIMIT_BYTES = 50 * 1024 * 1024;
let storageUsedBytes = null;

function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
}

function dateLabel(date) {
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? "Date non renseignée" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(parsed);
}

function formatTags(tags = "") { return tags.split(",").map((tag) => tag.trim()).filter(Boolean); }

function normalizeSearchText(value = "") {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
}

function filteredItems() {
    const terms = normalizeSearchText(searchInput.value).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return items;
    return items.filter((item) => {
        const haystack = normalizeSearchText([item.title, item.summary, item.description, item.tags, item.theme, item.content].filter(Boolean).join(" "));
        return terms.every((term) => haystack.includes(term));
    });
}

function addMonthsToDate(dateValue, months) {
    if (!dateValue || !Number.isInteger(months) || months < 1) return null;
    const [year, month, day] = dateValue.split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return null;
    const target = new Date(Date.UTC(year, month - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target.toISOString().slice(0, 10);
}

function updateExpirationPreview() {
    const months = Number($("doc-retention").value);
    const expiresAt = addMonthsToDate($("doc-date").value, months);
    $("expiration-preview").textContent = expiresAt
        ? `Expiration prévue : ${dateLabel(expiresAt)}.`
        : months ? "Choisissez une date de publication valide pour calculer l’expiration." : "Ce document ne sera pas supprimé automatiquement.";
}

function formatMegabytes(bytes) { return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`; }

function updateStorageIndicator(usedBytes, message = "") {
    const indicator = $("storage-indicator");
    if (!Number.isFinite(usedBytes)) {
        $("storage-value").textContent = message || "Indisponible";
        $("storage-remaining").textContent = "";
        return;
    }
    const ratio = Math.min(1, usedBytes / STORAGE_LIMIT_BYTES);
    const remaining = Math.max(0, STORAGE_LIMIT_BYTES - usedBytes);
    $("storage-value").textContent = `${formatMegabytes(usedBytes)} / 50 Mo`;
    $("storage-remaining").textContent = `Espace restant : ${formatMegabytes(remaining)}`;
    $("storage-progress").style.width = `${ratio * 100}%`;
    indicator.classList.toggle("warning", ratio >= 0.8 && ratio < 0.95);
    indicator.classList.toggle("alert", ratio >= 0.95);
}

async function listStorageFiles(path = "") {
    const files = [];
    let offset = 0;
    while (true) {
        const { data, error } = await supabase.storage.from("documents").list(path, { limit: 1000, offset });
        if (error) throw error;
        files.push(...data);
        if (data.length < 1000) break;
        offset += data.length;
    }
    const result = [];
    for (const entry of files) {
        const entryPath = path ? `${path}/${entry.name}` : entry.name;
        if (entry.id) result.push(entry);
        else result.push(...await listStorageFiles(entryPath));
    }
    return result;
}

async function refreshStorageUsage() {
    if (!supabase) { updateStorageIndicator(null, "Non configuré"); return; }
    try {
        const files = await listStorageFiles();
        storageUsedBytes = files.reduce((total, file) => total + Number(file.metadata?.size || 0), 0);
        updateStorageIndicator(storageUsedBytes);
    } catch (error) {
        console.error("Calcul du stockage impossible.", error);
        storageUsedBytes = null;
        updateStorageIndicator(null, "Indisponible");
    }
}

function createStorageFilePath(id, fileName) {
    const safeName = (fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "document").slice(-150);
    const randomId = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16)).join("-");
    return `${id}/${Date.now()}-${randomId}-${safeName}`;
}

function render() { renderThemes(); renderTimeline(); }

function renderThemes() {
    viewThemes.replaceChildren();
    const documents = filteredItems().filter((item) => item.type === "document");
    if (!documents.length) {
        viewThemes.append(createEmpty(searchInput.value.trim() ? "Aucun document ne correspond à votre recherche." : "Aucun document pour le moment. Ajoutez-en un pour commencer."));
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
    const sorted = [...filteredItems()].sort(sortByDate);
    if (!sorted.length) { timelineContainer.append(createEmpty(searchInput.value.trim() ? "Aucun élément ne correspond à votre recherche." : "Votre frise apparaîtra ici.")); return; }
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
    $("doc-retention").value = item?.retentionMonths || "";
    $("deadline-color").value = item?.color || "#f97316"; $("deadline-description").value = item?.description || "";
    $("modal-title").textContent = item ? `Modifier ${item.type === "deadline" ? "l'échéance" : "le document"}` : "Ajouter un élément";
    toggleTypeFields(); updateExpirationPreview(); formModal.classList.remove("hidden"); $("doc-title").focus();
}

async function uploadSelectedFile(id) {
    const file = $("doc-file").files[0];
    if (!file) return { fileUrl: $("existing-file-url").value, filePath: $("existing-file-path").value, fileName: $("existing-file-name").value, fileType: $("existing-file-type").value };
    if (!supabase) throw new Error("La configuration Supabase est absente.");
    if (storageUsedBytes === null) await refreshStorageUsage();
    if (Number.isFinite(storageUsedBytes) && file.size > STORAGE_LIMIT_BYTES - storageUsedBytes) throw new Error("Espace de stockage insuffisant : ce fichier dépasse l’espace restant sur 50 Mo.");
    const filePath = createStorageFilePath(id, file.name);
    const { error } = await supabase.storage.from("documents").upload(filePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false
    });
    if (error) throw error;
    const { data } = supabase.storage.from("documents").getPublicUrl(filePath);
    const fileUrl = data.publicUrl;
    if (!fileUrl) {
        await removeSupabaseFile(filePath);
        throw new Error("Supabase n'a pas retourné d'URL publique.");
    }
    return { fileUrl, filePath, fileName: file.name, fileType: file.type, fileSize: file.size };
}

async function removeSupabaseFile(filePath, throwOnError = false) {
    if (!supabase || !filePath || filePath.startsWith("padlet-files/")) return;
    const { error } = await supabase.storage.from("documents").remove([filePath]);
    if (error) { console.warn("Le fichier Supabase n'a pas pu être supprimé.", error); if (throwOnError) throw error; }
}

docForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = document.querySelector('input[name="item-type"]:checked').value;
    const id = $("doc-id").value || doc(itemsCollection).id;
    const submit = $("submit-item"); submit.disabled = true; submit.textContent = "Enregistrement…";
    let uploadedFilePath = "";
    try {
        const file = type === "document" ? await uploadSelectedFile(id) : { fileUrl: "", filePath: "", fileName: "", fileType: "" };
        uploadedFilePath = $("doc-file").files[0] ? file.filePath : "";
        const oldFilePath = $("existing-file-path").value;
        const retentionMonths = Number($("doc-retention").value);
        const expiresAt = addMonthsToDate($("doc-date").value, retentionMonths);
        if (type === "document" && retentionMonths && !expiresAt) throw new Error("La date d’expiration est invalide. Vérifiez la date et la durée de conservation.");
        const item = type === "document"
            ? { id, type, title: $("doc-title").value.trim(), date: $("doc-date").value, theme: $("doc-theme").value.trim(), tags: $("doc-tags").value.trim(), summary: $("doc-summary").value.trim(), content: $("doc-content").value.trim(), publishedAt: itemOrExistingPublishedAt(id), retentionMonths: retentionMonths || null, expiresAt, ...file }
            : { id, type, title: $("doc-title").value.trim(), date: $("doc-date").value, color: $("deadline-color").value, description: $("deadline-description").value.trim() };
        await setDoc(doc(db, "padletItems", id), item);
        if (type === "deadline" || (file.filePath && file.filePath !== oldFilePath)) await removeSupabaseFile(oldFilePath);
        formModal.classList.add("hidden"); setStatus("Élément enregistré en ligne."); await refreshStorageUsage();
    } catch (error) {
        console.error(error);
        await removeSupabaseFile(uploadedFilePath);
        setStatus(error instanceof Error && error.message ? error.message : "Impossible d'enregistrer. Vérifiez votre configuration Firebase, Supabase et leurs règles.", true);
        await refreshStorageUsage();
    }
    finally { submit.disabled = false; submit.textContent = "Enregistrer"; }
});

async function removeItem(item) {
    if (!window.confirm(`Supprimer « ${item.title} » ?`)) return;
    try {
        await removeSupabaseFile(item.filePath, true);
        await deleteDoc(doc(db, "padletItems", item.id));
        setStatus("Élément supprimé."); await refreshStorageUsage();
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
searchInput.addEventListener("input", render);
$("doc-date").addEventListener("change", updateExpirationPreview); $("doc-retention").addEventListener("change", updateExpirationPreview);
$("close-form").addEventListener("click", () => formModal.classList.add("hidden")); $("close-read").addEventListener("click", () => readModal.classList.add("hidden"));
window.addEventListener("click", (event) => { if (event.target === formModal) formModal.classList.add("hidden"); if (event.target === readModal) readModal.classList.add("hidden"); });
window.addEventListener("keydown", (event) => { if (event.key === "Escape") { formModal.classList.add("hidden"); readModal.classList.add("hidden"); } });

timelineScroll.addEventListener("mousedown", (event) => { isDragging = false; dragStartX = event.pageX - timelineScroll.offsetLeft; startScrollLeft = timelineScroll.scrollLeft; timelineScroll.classList.add("dragging"); });
timelineScroll.addEventListener("mousemove", (event) => { if (!timelineScroll.classList.contains("dragging")) return; event.preventDefault(); const distance = (event.pageX - timelineScroll.offsetLeft) - dragStartX; if (Math.abs(distance) > 4) isDragging = true; timelineScroll.scrollLeft = startScrollLeft - distance; });
["mouseup", "mouseleave"].forEach((name) => timelineScroll.addEventListener(name, () => { timelineScroll.classList.remove("dragging"); setTimeout(() => { isDragging = false; }, 0); }));

function itemOrExistingPublishedAt(id) { return items.find((item) => item.id === id)?.publishedAt || new Date().toISOString(); }

onSnapshot(itemsCollection, (snapshot) => { items = snapshot.docs.map((item) => item.data()); render(); setStatus(`${items.length} élément${items.length > 1 ? "s" : ""} synchronisé${items.length > 1 ? "s" : ""}.`); }, (error) => { console.error(error); setStatus("Connexion Firestore impossible. Vérifiez votre configuration Firebase et vos règles Firestore.", true); });
refreshStorageUsage();
