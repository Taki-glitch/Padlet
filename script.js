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
import { getAuth, getIdTokenResult, signInWithCustomToken, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const firebaseAuth = getAuth(app);
const itemsCollection = collection(db, "padletItems");
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
let items = [];
let isDragging = false;
let dragStartX = 0;
let startScrollLeft = 0;

const $ = (id) => document.getElementById(id);
const btnTheme = $("btn-theme");
const btnTimeline = $("btn-timeline");
const btnDashboard = $("btn-dashboard");
const viewThemes = $("view-themes");
const viewTimeline = $("view-timeline");
const viewDashboard = $("view-dashboard");
const timelineContainer = $("timeline-container");
const timelineScroll = $("timeline-scroll");
const formModal = $("form-modal");
const readModal = $("read-modal");
const timelineFormModal = $("timeline-form-modal");
const docForm = $("doc-form");
const timelineForm = $("timeline-form");
const status = $("app-status");
const searchInput = $("document-search");
const clearSearchButton = $("clear-search");
const themeFilter = $("theme-filter");
const tagFilter = $("tag-filter");
const favoriteFilter = $("favorite-filter");
const sortControl = $("sort-control");
const resultsCount = $("results-count");
const STORAGE_LIMIT_BYTES = 50 * 1024 * 1024;
let storageUsedBytes = null;
let unsubscribeItems = null;
let currentUser = null;
let currentProfile = null;
let firebaseSessionUserId = null;
let firebaseSessionRole = null;

// Supabase utilise une adresse technique non distribuable. L'utilisateur ne saisit
// jamais cette adresse : elle est reconstruite ici avec la même convention que les
// Edge Functions (voir README).
const TECHNICAL_EMAIL_DOMAIN = "auth.padlet.invalid";
function normalizeUsername(value) { return value.trim().toLowerCase(); }
function technicalEmail(username) {
    const normalized = normalizeUsername(username);
    return normalized.includes("@") ? normalized : `${normalized}@${TECHNICAL_EMAIL_DOMAIN}`;
}

function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
}

function isAdmin() { return currentProfile?.role === "admin"; }

function favoritesStorageKey() { return currentUser?.id ? `padlet-favorites:${currentUser.id}` : ""; }
function favoriteIds() {
    const key = favoritesStorageKey();
    if (!key) return new Set();
    try {
        const stored = JSON.parse(localStorage.getItem(key) || "[]");
        return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : []);
    } catch { return new Set(); }
}
function isFavorite(item) { return favoriteIds().has(item.id); }
function toggleFavorite(item) {
    const key = favoritesStorageKey();
    if (!key || !item?.id) return;
    const ids = favoriteIds();
    ids.has(item.id) ? ids.delete(item.id) : ids.add(item.id);
    localStorage.setItem(key, JSON.stringify([...ids]));
    render();
}

function applyRoleUi() {
    $("btn-add").classList.toggle("hidden", !isAdmin());
    $("btn-admin-users").classList.toggle("hidden", !isAdmin());
    formModal.classList.add("hidden");
    timelineFormModal.classList.add("hidden");
}

function setAuthenticatedUi(user, profile = null) {
    currentUser = user;
    currentProfile = profile;
    const username = profile?.username || user?.user_metadata?.username || "utilisateur";
    const roleLabel = profile?.role === "admin" ? "Administrateur" : "Utilisateur";
    $("auth-user").textContent = user ? `Connecté : ${username} · ${roleLabel}` : "";
    $("auth-user").classList.toggle("hidden", !user);
    $("btn-sign-out").classList.toggle("hidden", !user);
    $("auth-modal").classList.toggle("hidden", Boolean(user));
    applyRoleUi();
}

async function loadCurrentProfile(user) {
    const { data, error } = await supabase.from("profiles").select("username, role").eq("id", user.id).maybeSingle();
    if (error || !data || !["admin", "user"].includes(data.role)) throw new Error("Profil utilisateur introuvable.");
    return data;
}

function requireAdmin() {
    if (isAdmin()) return true;
    setStatus("Cette action est réservée aux administrateurs.", true);
    return false;
}

async function refreshAdminFirestoreSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session || session.user.id !== currentUser?.id) throw new Error("Session Supabase invalide. Reconnectez-vous.");
    const profile = await loadCurrentProfile(session.user);
    currentProfile = profile;
    if (!isAdmin()) {
        applyRoleUi();
        throw new Error("Cette action est réservée aux administrateurs.");
    }
    // Reissue the Firebase token before a mutation so a role change cannot leave
    // an administrator with a stale Firebase claim (or vice versa).
    await startFirestoreSession(session);
    if (firebaseSessionUserId !== session.user.id || firebaseSessionRole !== "admin") {
        throw new Error("Session Firebase administrateur invalide. Reconnectez-vous.");
    }
}

async function startFirestoreSession(session) {
    if (!session?.access_token || session.user.id !== currentUser?.id) throw new Error("Session Supabase invalide. Reconnectez-vous.");
    setStatus("Connexion sécurisée à Firestore…");
    // Do not rely on the SDK's cached authorization header: the custom token must
    // be minted from the Supabase session that just supplied the current profile.
    const { data, error } = await supabase.functions.invoke("firebase-custom-token", {
        headers: { Authorization: `Bearer ${session.access_token}` }
    });
    if (error) throw error;
    if (!data?.token) throw new Error("La fonction Firebase n'a pas retourné de jeton.");
    if (data.uid !== session.user.id || data.role !== currentProfile?.role) {
        throw new Error("La réponse de firebase-custom-token ne correspond pas à la session Supabase actuelle. Vérifiez le déploiement de l'Edge Function.");
    }
    unsubscribeItems?.();
    unsubscribeItems = null;
    await firebaseSignOut(firebaseAuth);
    const credential = await signInWithCustomToken(firebaseAuth, data.token);
    const token = await getIdTokenResult(credential.user, true);
    if (credential.user.uid !== session.user.id) {
        await firebaseSignOut(firebaseAuth);
        throw new Error("L'UID du jeton Firebase ne correspond pas à la session Supabase actuelle.");
    }
    if (token.claims.role !== currentProfile?.role) {
        await firebaseSignOut(firebaseAuth);
        throw new Error("Le jeton Firebase ID ne contient pas le rôle Supabase actuel. Vérifiez le déploiement de firebase-custom-token.");
    }
    firebaseSessionUserId = credential.user.uid;
    firebaseSessionRole = token.claims.role;
    unsubscribeItems = onSnapshot(itemsCollection,
        (snapshot) => { items = snapshot.docs.map((item) => item.data()); render(); setStatus(`${items.length} élément${items.length > 1 ? "s" : ""} synchronisé${items.length > 1 ? "s" : ""}.`); },
        (error) => { console.error(error); setStatus("Connexion Firestore impossible. Vérifiez votre session Firebase et vos règles Firestore.", true); });
    await refreshStorageUsage();
}

async function initialiseAuthentication() {
    if (!supabase) { setStatus("La configuration Supabase est absente.", true); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuthenticatedUi(null); setStatus("Connectez-vous pour accéder au tableau."); return; }
    try {
        setAuthenticatedUi(session.user, await loadCurrentProfile(session.user));
        await startFirestoreSession(session);
    }
    catch (error) { console.error(error); setStatus("La connexion Firebase sécurisée a échoué. Contactez un administrateur.", true); }
}

$("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = normalizeUsername($("auth-username").value);
    const password = $("auth-password").value;
    const submit = $("auth-submit");
    $("auth-error").textContent = "";
    submit.disabled = true;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: technicalEmail(username), password });
        if (error) throw error;
        setAuthenticatedUi(data.user, await loadCurrentProfile(data.user));
        const { data: { session } } = await supabase.auth.getSession();
        await startFirestoreSession(session);
    } catch (error) { console.error(error); $("auth-error").textContent = "Identifiant ou mot de passe incorrect, ou connexion indisponible."; }
    finally { submit.disabled = false; }
});

$("btn-sign-out").addEventListener("click", async () => {
    await signOutCurrentUser();
});

function dateLabel(date) {
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? "Date non renseignée" : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(parsed);
}

function formatTags(tags = "") { return tags.split(",").map((tag) => tag.trim()).filter(Boolean); }

function normalizeSearchText(value = "") {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
}

function normalizeOrganizationValue(value = "") {
    return normalizeSearchText(value).replace(/\s+/g, " ").trim();
}

function displayTheme(value = "") { return String(value).trim().replace(/\s+/g, " "); }

function documentItems() { return items.filter((item) => item.type === "document"); }

function organizationOptions(values, formatter = (value) => value) {
    const options = new Map();
    values.forEach((value) => {
        const label = formatter(value);
        const key = normalizeOrganizationValue(label);
        if (key && !options.has(key)) options.set(key, label);
    });
    return [...options.entries()].sort(([, a], [, b]) => a.localeCompare(b, "fr"));
}

function updateSelectOptions(select, options) {
    const selected = select.value;
    select.replaceChildren(new Option("Tous", ""), ...options.map(([value, label]) => new Option(label, value)));
    select.value = options.some(([value]) => value === selected) ? selected : "";
}

function updateOrganizationControls() {
    const documents = documentItems();
    const themes = organizationOptions(documents.map((item) => item.theme), displayTheme);
    const tags = organizationOptions(documents.flatMap((item) => formatTags(item.tags)));
    updateSelectOptions(themeFilter, themes);
    updateSelectOptions(tagFilter, tags);
    const themeList = $("existing-themes");
    themeList.replaceChildren(...themes.map(([, label]) => new Option(label, label)));
}

function appendInlineMarkdown(container, value) {
    const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|\[([^\]]+)\]\(([^\s)]+)\)/g;
    let lastIndex = 0;
    for (const match of String(value).matchAll(pattern)) {
        container.append(document.createTextNode(value.slice(lastIndex, match.index)));
        if (match[1]) {
            const strong = document.createElement("strong");
            strong.textContent = match[2];
            container.append(strong);
        } else if (match[3]) {
            const emphasis = document.createElement("em");
            emphasis.textContent = match[4];
            container.append(emphasis);
        } else {
            const url = match[6];
            try {
                const parsedUrl = new URL(url);
                if (["http:", "https:", "mailto:"].includes(parsedUrl.protocol)) {
                    const link = document.createElement("a");
                    link.href = parsedUrl.href;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.textContent = match[5];
                    container.append(link);
                } else container.append(document.createTextNode(match[0]));
            } catch { container.append(document.createTextNode(match[0])); }
        }
        lastIndex = match.index + match[0].length;
    }
    container.append(document.createTextNode(value.slice(lastIndex)));
}

function appendParagraph(container, lines) {
    const paragraph = document.createElement("p");
    lines.forEach((line, index) => {
        if (index) paragraph.append(document.createElement("br"));
        appendInlineMarkdown(paragraph, line);
    });
    container.append(paragraph);
}

function renderMarkdownSummary(container, value) {
    container.replaceChildren();
    const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
    let index = 0;
    while (index < lines.length) {
        if (!lines[index].trim()) { index += 1; continue; }
        const heading = lines[index].match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            const element = document.createElement(`h${heading[1].length}`);
            appendInlineMarkdown(element, heading[2]);
            container.append(element); index += 1; continue;
        }
        const quote = lines[index].match(/^>\s?(.*)$/);
        if (quote) {
            const blockquote = document.createElement("blockquote");
            const quoteLines = [];
            while (index < lines.length && (lines[index].match(/^>\s?(.*)$/))) quoteLines.push(lines[index++].replace(/^>\s?/, ""));
            appendParagraph(blockquote, quoteLines); container.append(blockquote); continue;
        }
        const list = lines[index].match(/^(?:[-*+]\s+|\d+\.\s+)(.*)$/);
        if (list) {
            const ordered = /^\d+\.\s+/.test(lines[index]);
            const element = document.createElement(ordered ? "ol" : "ul");
            const matcher = ordered ? /^\d+\.\s+(.*)$/ : /^[-*+]\s+(.*)$/;
            while (index < lines.length) {
                const entry = lines[index].match(matcher);
                if (!entry) break;
                const item = document.createElement("li");
                appendInlineMarkdown(item, entry[1]); element.append(item); index += 1;
            }
            container.append(element); continue;
        }
        const paragraphLines = [];
        while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^>\s?|^(?:[-*+]\s+|\d+\.\s+)/.test(lines[index])) paragraphLines.push(lines[index++]);
        appendParagraph(container, paragraphLines);
    }
}

function filteredItems() {
    const terms = normalizeSearchText(searchInput.value).trim().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
        const haystack = normalizeSearchText([item.title, item.summary, item.description, item.tags, item.theme, item.content].filter(Boolean).join(" "));
        const matchesSearch = terms.every((term) => haystack.includes(term));
        const matchesTheme = !themeFilter.value || normalizeOrganizationValue(item.theme) === themeFilter.value;
        const matchesTag = !tagFilter.value || formatTags(item.tags).some((tag) => normalizeOrganizationValue(tag) === tagFilter.value);
        const matchesFavorite = favoriteFilter.value !== "favorites" || (item.type === "document" && isFavorite(item));
        return matchesSearch && matchesTheme && matchesTag && matchesFavorite;
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
        renderDashboard();
    } catch (error) {
        console.error("Calcul du stockage impossible.", error);
        storageUsedBytes = null;
        updateStorageIndicator(null, "Indisponible");
        renderDashboard();
    }
}

function createStorageFilePath(id, fileName) {
    const safeName = (fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "document").slice(-150);
    const randomId = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16)).join("-");
    return `${id}/${Date.now()}-${randomId}-${safeName}`;
}

function render() {
    updateOrganizationControls();
    clearSearchButton.classList.toggle("hidden", !searchInput.value);
    renderResultsCount();
    renderThemes();
    renderTimeline();
    renderDashboard();
}

function renderResultsCount() {
    const count = filteredItems().filter((item) => item.type === "document").length;
    const hasSearch = Boolean(searchInput.value.trim());
    const hasFilters = Boolean(themeFilter.value || tagFilter.value || favoriteFilter.value);
    if (!count && (hasSearch || hasFilters)) resultsCount.textContent = "Aucun document ne correspond à vos critères.";
    else if (hasSearch) resultsCount.textContent = `${count} document${count > 1 ? "s" : ""} correspondant à votre recherche`;
    else if (hasFilters) resultsCount.textContent = `${count} document${count > 1 ? "s" : ""} correspondant à vos filtres`;
    else resultsCount.textContent = `${count} document${count > 1 ? "s" : ""}`;
}

function renderThemes() {
    viewThemes.replaceChildren();
    const documents = filteredItems().filter((item) => item.type === "document");
    if (!documents.length) {
        viewThemes.append(createEmpty(searchInput.value.trim() || themeFilter.value || tagFilter.value || favoriteFilter.value ? "Aucun document ne correspond à vos critères." : "Aucun document pour le moment. Ajoutez-en un pour commencer."));
        return;
    }
    const themes = new Map();
    documents.forEach((item) => {
        const theme = displayTheme(item.theme) || "Sans thème";
        const key = normalizeOrganizationValue(theme) || "__sans-theme__";
        const entry = themes.get(key) || { theme, docs: [] };
        entry.docs.push(item);
        themes.set(key, entry);
    });
    [...themes.values()].sort((a, b) => a.theme.localeCompare(b.theme, "fr")).forEach(({ theme, docs }) => {
        const column = document.createElement("article");
        column.className = "theme-column";
        const heading = document.createElement("h3");
        heading.textContent = theme;
        const count = document.createElement("small");
        count.textContent = ` (${docs.length})`;
        heading.append(count);
        column.append(heading, ...sortDocuments(docs).map(createDocumentCard));
        viewThemes.append(column);
    });
}

function expirationDate(item) {
    if (item.type !== "document") return "";
    return item.expiresAt || addMonthsToDate(item.date, Number(item.retentionMonths));
}
function daysUntil(dateValue) {
    if (!dateValue) return null;
    const target = new Date(`${dateValue}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (Number.isNaN(target.getTime())) return null;
    return Math.round((target - today) / 86400000);
}
function expirationLabel(item) {
    const days = daysUntil(expirationDate(item));
    if (days === null || days < 0 || days > 30) return "";
    if (days === 0) return "Expire aujourd'hui";
    if (days === 1) return "Expire demain";
    return `Expire dans ${days} jours`;
}
function dashboardMetric(label, value) {
    const metric = document.createElement("article"); metric.className = "dashboard-metric";
    const name = document.createElement("span"); name.textContent = label;
    const amount = document.createElement("strong"); amount.textContent = value;
    metric.append(name, amount); return metric;
}
function renderDashboardList(container, entries, emptyMessage, detail) {
    container.replaceChildren();
    if (!entries.length) { container.append(createEmpty(emptyMessage)); return; }
    const list = document.createElement("div"); list.className = "dashboard-list";
    entries.forEach((item) => {
        const row = document.createElement("div"); row.className = "dashboard-list-item";
        const title = document.createElement("strong"); title.textContent = item.title || "Sans titre";
        const info = document.createElement("small"); info.textContent = detail(item);
        row.append(title, info); list.append(row);
    });
    container.append(list);
}
function renderDashboard() {
    const documents = documentItems();
    const remaining = Number.isFinite(storageUsedBytes) ? Math.max(0, STORAGE_LIMIT_BYTES - storageUsedBytes) : null;
    $("dashboard-metrics").replaceChildren(
        dashboardMetric("Documents", String(documents.length)),
        dashboardMetric("Éléments de la frise", String(items.length)),
        dashboardMetric("Espace utilisé", Number.isFinite(storageUsedBytes) ? formatMegabytes(storageUsedBytes) : "Indisponible"),
        dashboardMetric("Espace restant", remaining === null ? "Indisponible" : formatMegabytes(remaining))
    );
    const upcoming = documents.filter((item) => { const days = daysUntil(expirationDate(item)); return days !== null && days >= 0 && days <= 30; })
        .sort((a, b) => expirationDate(a).localeCompare(expirationDate(b)));
    renderDashboardList($("dashboard-expirations"), upcoming, "Aucune échéance dans les 30 prochains jours.", (item) => `${expirationLabel(item)} · ${dateLabel(expirationDate(item))}`);
    const recent = [...documents].sort((a, b) => String(b.publishedAt || b.date || "").localeCompare(String(a.publishedAt || a.date || ""))).slice(0, 5);
    renderDashboardList($("dashboard-recent"), recent, "Aucun document pour le moment.", (item) => `Ajouté le ${dateLabel(item.publishedAt || item.date)}`);
}

function createEmpty(message) { const el = document.createElement("p"); el.className = "empty-state"; el.textContent = message; return el; }
function sortByDate(a, b) { return new Date(a.date) - new Date(b.date); }

function sortDocuments(documents) {
    const byTitle = (a, b) => String(a.title || "").localeCompare(String(b.title || ""), "fr", { sensitivity: "base" });
    const comparators = {
        "date-desc": (a, b) => sortByDate(b, a),
        "date-asc": sortByDate,
        "title-asc": byTitle,
        "title-desc": (a, b) => byTitle(b, a)
    };
    return [...documents].sort(comparators[sortControl.value] || comparators["date-desc"]);
}

function timelineDate(item) { return item.timelineDate || item.date; }
function timelineTitle(item) { return item.timelineTitle || item.title; }
function timelineBaseContent(item) { return item.type === "document" ? (item.summary || "") : (item.description || ""); }
function timelineContent(item) { return item.timelineContent || timelineBaseContent(item); }
function sortTimelineByDate(a, b) { return new Date(timelineDate(a)) - new Date(timelineDate(b)); }

function createDocumentCard(item) {
    const card = document.createElement("article");
    card.className = "doc-card";
    const header = document.createElement("div"); header.className = "doc-card-header";
    const title = document.createElement("h4"); title.textContent = item.title;
    const favorite = document.createElement("button"); favorite.type = "button"; favorite.className = `favorite-button${isFavorite(item) ? " is-favorite" : ""}`;
    favorite.textContent = isFavorite(item) ? "★" : "☆";
    favorite.setAttribute("aria-label", isFavorite(item) ? "Retirer des favoris" : "Ajouter aux favoris");
    favorite.title = favorite.getAttribute("aria-label");
    favorite.addEventListener("click", (event) => { event.stopPropagation(); toggleFavorite(item); });
    header.append(title, favorite);
    const date = document.createElement("p"); date.className = "card-date"; date.textContent = dateLabel(item.date);
    const expiration = expirationLabel(item);
    const summary = document.createElement("div"); summary.className = "doc-summary-preview"; renderMarkdownSummary(summary, item.summary || "Sans résumé");
    const tags = createTagButtons(item.tags);
    const actions = createActions(item);
    card.append(header, date);
    if (expiration) { const notice = document.createElement("p"); notice.className = "card-expiration"; notice.textContent = expiration; card.append(notice); }
    card.append(summary);
    if (tags.childElementCount) card.append(tags);
    card.append(actions);
    card.addEventListener("click", () => openReadModal(item));
    return card;
}

function applyTagFilter(tag) {
    tagFilter.value = normalizeOrganizationValue(tag);
    readModal.classList.add("hidden");
    setView(false);
    render();
}

function createTagButtons(tagsValue) {
    const container = document.createElement("div");
    container.className = "tags-container card-tags";
    formatTags(tagsValue).forEach((tag) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tag tag-button";
        button.textContent = tag;
        button.title = `Filtrer par « ${tag} »`;
        button.addEventListener("click", (event) => { event.stopPropagation(); applyTagFilter(tag); });
        container.append(button);
    });
    return container;
}

function createActions(item) {
    const actions = document.createElement("div"); actions.className = "doc-actions";
    if (!isAdmin()) return actions;
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Modifier";
    edit.addEventListener("click", (event) => { event.stopPropagation(); openForm(item); });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete"; remove.textContent = "Supprimer";
    remove.addEventListener("click", (event) => { event.stopPropagation(); removeItem(item); });
    actions.append(edit, remove); return actions;
}

function renderTimeline() {
    timelineContainer.replaceChildren();
    const sorted = [...filteredItems()].sort(sortTimelineByDate);
    if (!sorted.length) { timelineContainer.append(createEmpty(searchInput.value.trim() ? "Aucun élément ne correspond à votre recherche." : "Votre frise apparaîtra ici.")); return; }
    const width = Math.max(900, 230 + (sorted.length - 1) * 230);
    timelineContainer.style.setProperty("--timeline-width", `${width}px`);
    sorted.forEach((item, index) => {
        const marker = document.createElement("article");
        marker.className = `timeline-marker ${item.type === "deadline" ? "deadline" : "document"}`;
        marker.style.left = `${index === 0 ? 7 : 7 + (index / Math.max(1, sorted.length - 1)) * 86}%`;
        const markerColor = item.timelineColor || (item.type === "deadline" ? item.color || "#f97316" : "");
        if (markerColor) { marker.style.setProperty("--marker-color", markerColor); marker.classList.add("custom-color"); }
        const label = document.createElement("div"); label.className = "timeline-label";
        const title = document.createElement("strong"); title.textContent = `${item.type === "deadline" ? "◆ " : ""}${timelineTitle(item)}`;
        const time = document.createElement("time"); time.textContent = dateLabel(timelineDate(item));
        const content = document.createElement("div"); content.className = "timeline-content"; renderMarkdownSummary(content, timelineContent(item));
        label.append(title, time, content);
        if (isAdmin()) {
            const edit = document.createElement("button"); edit.type = "button"; edit.className = "timeline-edit"; edit.textContent = "Modifier";
            edit.addEventListener("click", (event) => { event.stopPropagation(); openTimelineForm(item); });
            label.append(edit);
        }
        marker.append(label);
        marker.addEventListener("click", () => { if (!isDragging) openReadModal(item); });
        timelineContainer.append(marker);
    });
}

function openTimelineForm(item) {
    if (!requireAdmin()) return;
    $("timeline-item-id").value = item.id;
    $("timeline-date").value = timelineDate(item);
    $("timeline-title").value = timelineTitle(item);
    $("timeline-content").value = timelineContent(item);
    $("timeline-color").value = item.timelineColor || "";
    timelineFormModal.classList.remove("hidden");
    $("timeline-date").focus();
}

function toggleTypeFields() {
    const isDocument = document.querySelector('input[name="item-type"]:checked').value === "document";
    $("document-fields").classList.toggle("hidden", !isDocument);
    $("deadline-fields").classList.toggle("hidden", isDocument);
    $("doc-theme").required = isDocument;
    $("doc-summary").required = isDocument;
}

function openForm(item = null) {
    if (!requireAdmin()) return;
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

function canonicalTheme(value) {
    const entered = displayTheme(value);
    if (!entered) return "";
    const existing = organizationOptions(documentItems().map((item) => item.theme), displayTheme)
        .find(([key]) => key === normalizeOrganizationValue(entered));
    return existing ? existing[1] : entered;
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
    if (!requireAdmin()) return;
    const type = document.querySelector('input[name="item-type"]:checked').value;
    const id = $("doc-id").value || doc(itemsCollection).id;
    const submit = $("submit-item"); submit.disabled = true; submit.textContent = "Enregistrement…";
    let uploadedFilePath = "";
    try {
        await refreshAdminFirestoreSession();
        const file = type === "document" ? await uploadSelectedFile(id) : { fileUrl: "", filePath: "", fileName: "", fileType: "" };
        uploadedFilePath = $("doc-file").files[0] ? file.filePath : "";
        const oldFilePath = $("existing-file-path").value;
        const retentionMonths = Number($("doc-retention").value);
        const expiresAt = addMonthsToDate($("doc-date").value, retentionMonths);
        if (type === "document" && retentionMonths && !expiresAt) throw new Error("La date d’expiration est invalide. Vérifiez la date et la durée de conservation.");
        const item = type === "document"
            ? { id, type, title: $("doc-title").value.trim(), date: $("doc-date").value, theme: canonicalTheme($("doc-theme").value), tags: $("doc-tags").value.trim(), summary: $("doc-summary").value.trim(), content: $("doc-content").value.trim(), publishedAt: itemOrExistingPublishedAt(id), retentionMonths: retentionMonths || null, expiresAt, ...file }
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

timelineForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const id = $("timeline-item-id").value;
    const item = items.find((entry) => entry.id === id);
    if (!item) { setStatus("Cet événement n’existe plus.", true); timelineFormModal.classList.add("hidden"); return; }
    const submit = $("submit-timeline-form"); submit.disabled = true; submit.textContent = "Enregistrement…";
    const date = $("timeline-date").value;
    const title = $("timeline-title").value.trim();
    const content = $("timeline-content").value.trim();
    try {
        await refreshAdminFirestoreSession();
        await setDoc(doc(db, "padletItems", id), {
            timelineDate: date === item.date ? "" : date,
            timelineTitle: title === item.title ? "" : title,
            timelineContent: content === timelineBaseContent(item) ? "" : content,
            timelineColor: $("timeline-color").value
        }, { merge: true });
        timelineFormModal.classList.add("hidden");
        setStatus("Personnalisation de la frise enregistrée.");
    } catch (error) {
        console.error(error);
        setStatus("Impossible d’enregistrer la personnalisation de la frise.", true);
    } finally { submit.disabled = false; submit.textContent = "Enregistrer"; }
});

async function removeItem(item) {
    if (!requireAdmin()) return;
    if (!window.confirm(`Supprimer « ${item.title} » ?`)) return;
    try {
        await refreshAdminFirestoreSession();
        await removeSupabaseFile(item.filePath, true);
        await deleteDoc(doc(db, "padletItems", item.id));
        setStatus("Élément supprimé."); await refreshStorageUsage();
    } catch (error) { console.error(error); setStatus("La suppression a échoué.", true); }
}

function openReadModal(item) {
    $("read-type").textContent = item.type === "deadline" ? "Échéance" : "Document";
    $("read-title").textContent = item.title; $("read-date").textContent = dateLabel(item.date);
    $("read-theme").textContent = item.theme || ""; $("read-theme-wrap").classList.toggle("hidden", !item.theme);
    const summary = $("read-summary");
    if (item.type === "deadline") summary.textContent = item.description || "Aucune précision.";
    else renderMarkdownSummary(summary, item.summary);
    $("read-content").textContent = item.type === "document" ? (item.content || "") : "";
    const tags = $("read-tags"); tags.replaceChildren();
    if (item.type === "document") {
        const tagButtons = createTagButtons(item.tags);
        if (tagButtons.childElementCount) tags.append(tagButtons);
    }
    const preview = $("read-file"); preview.replaceChildren();
    if (item.fileUrl) {
        if ((item.fileType || "").startsWith("image/")) { const image = document.createElement("img"); image.src = item.fileUrl; image.alt = `Aperçu : ${item.title}`; preview.append(image); }
        else { const link = document.createElement("a"); link.className = "file-link"; link.href = item.fileUrl; link.target = "_blank"; link.rel = "noopener"; link.textContent = item.fileType === "application/pdf" ? "Prévisualiser le PDF" : `Télécharger ${item.fileName || "le fichier"}`; preview.append(link); }
    }
    readModal.classList.remove("hidden");
}

async function callAdminUsers(action, payload = {}) {
    if (!requireAdmin()) throw new Error("Accès administrateur requis.");
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || session.user.id !== currentUser?.id) throw new Error("Session Supabase invalide. Reconnectez-vous.");
    const { data, error } = await supabase.functions.invoke("admin-users", { body: { action, ...payload }, headers: { Authorization: `Bearer ${session.access_token}` } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
}

function setAdminUsersStatus(message, isError = false) {
    const element = $("admin-users-status");
    element.textContent = message;
    element.classList.toggle("error", isError);
}

async function renderAdminUsers() {
    const list = $("admin-users-list");
    list.replaceChildren(createEmpty("Chargement des utilisateurs…"));
    try {
        const { users = [] } = await callAdminUsers("list");
        list.replaceChildren();
        if (!users.length) { list.append(createEmpty("Aucun utilisateur.")); return; }
        users.forEach((user) => {
            const row = document.createElement("div"); row.className = "admin-user-row";
            const username = document.createElement("strong"); username.textContent = user.username;
            const role = document.createElement("select");
            ["user", "admin"].forEach((value) => { const option = document.createElement("option"); option.value = value; option.textContent = value === "admin" ? "Administrateur" : "Utilisateur"; option.selected = user.role === value; role.append(option); });
            const save = document.createElement("button"); save.type = "button"; save.textContent = "Rôle";
            save.addEventListener("click", async () => {
                try {
                    await callAdminUsers("update", { id: user.id, role: role.value });
                    setAdminUsersStatus(`Rôle de ${user.username} mis à jour.`);
                    if (user.id === currentUser?.id) await signOutCurrentUser("Votre rôle a changé. Reconnectez-vous pour obtenir les nouvelles permissions.");
                    else await renderAdminUsers();
                } catch (error) { console.error(error); setAdminUsersStatus("Impossible de modifier le rôle.", true); }
            });
            const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "Mot de passe";
            reset.addEventListener("click", async () => {
                const password = window.prompt(`Nouveau mot de passe pour ${user.username} (8 caractères minimum) :`);
                if (password === null) return;
                try { await callAdminUsers("reset-password", { id: user.id, password }); setAdminUsersStatus(`Mot de passe de ${user.username} réinitialisé.`); }
                catch (error) { console.error(error); setAdminUsersStatus("Impossible de réinitialiser le mot de passe.", true); }
            });
            const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete"; remove.textContent = "Supprimer"; remove.disabled = user.id === currentUser?.id;
            remove.addEventListener("click", async () => {
                if (!window.confirm(`Supprimer définitivement l’utilisateur « ${user.username} » ?`)) return;
                try { await callAdminUsers("delete", { id: user.id }); setAdminUsersStatus(`Utilisateur ${user.username} supprimé.`); await renderAdminUsers(); }
                catch (error) { console.error(error); setAdminUsersStatus("Impossible de supprimer l’utilisateur.", true); }
            });
            row.append(username, role, save, reset, remove); list.append(row);
        });
    } catch (error) { console.error(error); list.replaceChildren(createEmpty("Impossible de charger les utilisateurs.")); setAdminUsersStatus(error instanceof Error ? error.message : "Impossible de charger les utilisateurs.", true); }
}

async function signOutCurrentUser(message = "Connectez-vous pour accéder au tableau.") {
    unsubscribeItems?.(); unsubscribeItems = null; items = []; render();
    firebaseSessionUserId = null; firebaseSessionRole = null;
    await firebaseSignOut(firebaseAuth); await supabase.auth.signOut();
    setAuthenticatedUi(null); setStatus(message);
}

function setView(view) {
    const selected = view === true ? "timeline" : view === "dashboard" ? "dashboard" : "themes";
    btnTheme.classList.toggle("active", selected === "themes"); btnTimeline.classList.toggle("active", selected === "timeline"); btnDashboard.classList.toggle("active", selected === "dashboard");
    viewThemes.classList.toggle("hidden", selected !== "themes"); viewTimeline.classList.toggle("hidden", selected !== "timeline"); viewDashboard.classList.toggle("hidden", selected !== "dashboard");
}
btnTheme.addEventListener("click", () => setView("themes")); btnTimeline.addEventListener("click", () => setView("timeline")); btnDashboard.addEventListener("click", () => setView("dashboard")); $("btn-add").addEventListener("click", () => openForm());
$("btn-admin-users").addEventListener("click", async () => {
    if (!requireAdmin()) return;
    $("admin-users-modal").classList.remove("hidden"); setAdminUsersStatus(""); await renderAdminUsers();
});
$("close-admin-users").addEventListener("click", () => $("admin-users-modal").classList.add("hidden"));
$("admin-create-user-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const form = event.currentTarget;
    const submit = $("admin-create-user-submit"); submit.disabled = true;
    try {
        await callAdminUsers("create", { username: normalizeUsername($("admin-new-username").value), password: $("admin-new-password").value, role: $("admin-new-role").value });
        form.reset(); setAdminUsersStatus("Utilisateur créé."); await renderAdminUsers();
    } catch (error) { console.error(error); setAdminUsersStatus(error instanceof Error ? error.message : "Impossible de créer l’utilisateur. Vérifiez l’identifiant et le mot de passe.", true); }
    finally { submit.disabled = false; }
});
document.querySelectorAll('input[name="item-type"]').forEach((input) => input.addEventListener("change", toggleTypeFields));
searchInput.addEventListener("input", render);
clearSearchButton.addEventListener("click", () => { searchInput.value = ""; searchInput.focus(); render(); });
[themeFilter, tagFilter, favoriteFilter, sortControl].forEach((control) => control.addEventListener("change", render));
$("doc-date").addEventListener("change", updateExpirationPreview); $("doc-retention").addEventListener("change", updateExpirationPreview);
$("close-form").addEventListener("click", () => formModal.classList.add("hidden")); $("close-read").addEventListener("click", () => readModal.classList.add("hidden"));
$("close-timeline-form").addEventListener("click", () => timelineFormModal.classList.add("hidden")); $("cancel-timeline-form").addEventListener("click", () => timelineFormModal.classList.add("hidden"));
window.addEventListener("click", (event) => { if (event.target === formModal) formModal.classList.add("hidden"); if (event.target === readModal) readModal.classList.add("hidden"); if (event.target === timelineFormModal) timelineFormModal.classList.add("hidden"); if (event.target === $("admin-users-modal")) $("admin-users-modal").classList.add("hidden"); });
window.addEventListener("keydown", (event) => { if (event.key === "Escape") { formModal.classList.add("hidden"); readModal.classList.add("hidden"); timelineFormModal.classList.add("hidden"); $("admin-users-modal").classList.add("hidden"); } });

timelineScroll.addEventListener("mousedown", (event) => { isDragging = false; dragStartX = event.pageX - timelineScroll.offsetLeft; startScrollLeft = timelineScroll.scrollLeft; timelineScroll.classList.add("dragging"); });
timelineScroll.addEventListener("mousemove", (event) => { if (!timelineScroll.classList.contains("dragging")) return; event.preventDefault(); const distance = (event.pageX - timelineScroll.offsetLeft) - dragStartX; if (Math.abs(distance) > 4) isDragging = true; timelineScroll.scrollLeft = startScrollLeft - distance; });
["mouseup", "mouseleave"].forEach((name) => timelineScroll.addEventListener(name, () => { timelineScroll.classList.remove("dragging"); setTimeout(() => { isDragging = false; }, 0); }));

function itemOrExistingPublishedAt(id) { return items.find((item) => item.id === id)?.publishedAt || new Date().toISOString(); }

initialiseAuthentication();
