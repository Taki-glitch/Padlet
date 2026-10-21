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
import { getFirestore, collection, doc, setDoc, deleteDoc, deleteField, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth, getIdTokenResult, signInWithCustomToken, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { addRetentionMonths as addMonthsToDate, dateLabel, daysUntil, isDueForPurge, parseCivilDate } from "./supabase/functions/_shared/expiration.mjs";
import { buildTimelineTicks, timelineDateRatio } from "./modules/timeline.mjs";
import { personalPreferencesStorageKey, readPersonalPreferences, writePersonalPreferences } from "./modules/preferences.mjs";
import { createAuthGateway, hasAdminRole, normalizeUsername } from "./modules/auth.mjs";
import { deleteDocumentAndFile, PartialDocumentDeletionError } from "./modules/data.mjs";
import { buildMetadataExportPayload } from "./modules/admin.mjs";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const firebaseAuth = getAuth(app);
const itemsCollection = collection(db, "padletItems");
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const authGateway = supabase ? createAuthGateway(supabase) : null;
let items = [];
let isDragging = false;
let dragStartX = 0;
let startScrollLeft = 0;
let timelineDragTarget = null;
let suppressTimelineClick = false;

const $ = (id) => document.getElementById(id);
const btnTheme = $("btn-theme");
const btnTimeline = $("btn-timeline");
const btnDashboard = $("btn-dashboard");
const btnSettings = $("btn-settings");
const viewThemes = $("view-themes");
const viewTimeline = $("view-timeline");
const viewDashboard = $("view-dashboard");
const viewSettings = $("view-settings");
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
const gridViewButton = $("view-grid");
const listViewButton = $("view-list");
const selectModeButton = $("select-mode-toggle");
const selectionToolbar = $("selection-toolbar");
const selectionCount = $("selection-count");
const deleteSelectedButton = $("delete-selected");
const activeFilters = $("active-filters");
const filterSummary = $("filter-summary");
const recentlyViewedSection = $("recently-viewed");
const recentlyViewedList = $("recently-viewed-list");
const DISPLAY_MODE_KEY = "padlet-display-mode";
const RECENTLY_VIEWED_LIMIT = 6;
const timelineScaleControl = $("timeline-scale");
const PERSONAL_PREFERENCE_DEFAULTS = { theme: "system", accent: "indigo", timelineView: "month", timelineAnchor: "" };
let localPreferencesAvailable = true;
function localDateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseLocalDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
function loadPersonalPreferences(userId) {
    try {
        const result = readPersonalPreferences(userId, PERSONAL_PREFERENCE_DEFAULTS, (value) => {
            const anchor = parseLocalDate(value);
            return anchor ? localDateValue(anchor) : null;
        }, { storage: window.localStorage, fallbackAnchor: localDateValue(new Date()) });
        localPreferencesAvailable = result.storageAvailable;
        return result.preferences;
    } catch {
        localPreferencesAvailable = false;
        return { ...PERSONAL_PREFERENCE_DEFAULTS, timelineAnchor: localDateValue(new Date()) };
    }
}
let personalPreferences = loadPersonalPreferences(null);
let timelineAnchor = parseLocalDate(personalPreferences.timelineAnchor) || new Date();
let displayMode = (() => {
    try { return localStorage.getItem(DISPLAY_MODE_KEY) === "list" ? "list" : "grid"; }
    catch { return "grid"; }
})();
let readModalItem = null;
let readModalReturnFocus = null;
let readModalReturnView = "themes";
let docFormBaseline = "";
let timelineFormBaseline = "";
let selectionMode = false;
const selectedDocumentIds = new Set();
const STORAGE_LIMIT_BYTES = 50 * 1024 * 1024;
let storageUsedBytes = null;
let unsubscribeItems = null;
let currentUser = null;
let currentProfile = null;
let firebaseSessionUserId = null;
let firebaseSessionRole = null;

function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
}

function savePersonalPreferences() {
    if (!currentUser?.id) return;
    personalPreferences.timelineAnchor = localDateValue(timelineAnchor);
    try {
        localPreferencesAvailable = writePersonalPreferences(currentUser.id, personalPreferences, window.localStorage);
    } catch {
        localPreferencesAvailable = false;
        $("settings-status").textContent = "Préférence non enregistrée : le stockage local est indisponible.";
    }
}

function applyAppearance() {
    document.body.dataset.theme = personalPreferences.theme;
    document.body.dataset.accent = personalPreferences.accent;
    $("setting-theme").value = personalPreferences.theme;
    $("setting-accent").value = personalPreferences.accent;
    $("setting-timeline-view").value = personalPreferences.timelineView;
    timelineScaleControl.value = personalPreferences.timelineView;
}

function isAdmin() { return hasAdminRole(currentProfile); }

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

function recentlyViewedStorageKey() { return currentUser?.id ? `padlet-recently-viewed:${currentUser.id}` : ""; }
function recentlyViewedIds() {
    const key = recentlyViewedStorageKey();
    if (!key) return [];
    try {
        const ids = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === "string"))].slice(0, RECENTLY_VIEWED_LIMIT) : [];
    } catch { return []; }
}
function rememberRecentlyViewed(item) {
    const key = recentlyViewedStorageKey();
    if (!key || item?.type !== "document" || !item.id) return;
    try { localStorage.setItem(key, JSON.stringify([item.id, ...recentlyViewedIds().filter((id) => id !== item.id)].slice(0, RECENTLY_VIEWED_LIMIT))); }
    catch { /* L'accès rapide reste facultatif si le navigateur désactive le stockage local. */ }
}
function renderRecentlyViewed() {
    recentlyViewedList.replaceChildren();
    const byId = new Map(documentItems().map((item) => [item.id, item]));
    const recent = recentlyViewedIds().map((id) => byId.get(id)).filter(Boolean);
    recent.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "recent-document-button";
        button.dataset.documentId = item.id;
        button.textContent = item.title || "Sans titre";
        button.addEventListener("click", () => openReadModal(item));
        recentlyViewedList.append(button);
    });
    recentlyViewedSection.classList.toggle("hidden", recent.length === 0 || viewThemes.classList.contains("hidden"));
}

function applyRoleUi() {
    $("btn-add").classList.toggle("hidden", !isAdmin());
    $("btn-admin-users").classList.toggle("hidden", !isAdmin());
    $("admin-backup-panel").classList.toggle("hidden", !isAdmin());
    selectModeButton.classList.toggle("hidden", !isAdmin());
    if (!isAdmin()) { selectionMode = false; selectedDocumentIds.clear(); }
    formModal.classList.add("hidden");
    timelineFormModal.classList.add("hidden");
    updateSelectionToolbar();
    renderAdminExpirationReview();
}

function setAuthenticatedUi(user, profile = null) {
    if (currentUser?.id !== user?.id) {
        selectionMode = false;
        selectedDocumentIds.clear();
        personalPreferences = loadPersonalPreferences(user?.id);
        timelineAnchor = parseLocalDate(personalPreferences.timelineAnchor) || new Date();
        applyAppearance();
        $("settings-status").textContent = localPreferencesAvailable ? "" : "Stockage local indisponible : les valeurs par défaut sont utilisées.";
    }
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

function requireAdmin() {
    if (isAdmin()) return true;
    setStatus("Cette action est réservée aux administrateurs.", true);
    return false;
}

async function refreshAdminFirestoreSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session || session.user.id !== currentUser?.id) throw new Error("Session Supabase invalide. Reconnectez-vous.");
    const profile = await authGateway.loadProfile(session.user);
    currentProfile = profile;
    if (!isAdmin()) {
        applyRoleUi();
        throw new Error("Cette action est réservée aux administrateurs.");
    }
    // Reissue the Firebase token before a mutation so a role change cannot leave
    // an administrator with a stale Firebase claim (or vice versa).
    if (firebaseSessionUserId !== session.user.id || firebaseSessionRole !== "admin") await startFirestoreSession(session);
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
        (snapshot) => {
            items = snapshot.docs.map((item) => item.data());
            const availableIds = new Set(documentItems().map((item) => item.id));
            [...selectedDocumentIds].forEach((id) => { if (!availableIds.has(id)) selectedDocumentIds.delete(id); });
            render();
            setStatus(`${items.length} élément${items.length > 1 ? "s" : ""} synchronisé${items.length > 1 ? "s" : ""}.`);
        },
        (error) => { console.error(error); setStatus("Connexion Firestore impossible. Vérifiez votre session Firebase et vos règles Firestore.", true); });
    await refreshStorageUsage();
}

async function initialiseAuthentication() {
    if (!supabase) { setStatus("La configuration Supabase est absente.", true); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuthenticatedUi(null); setStatus("Connectez-vous pour accéder au tableau."); return; }
    try {
        setAuthenticatedUi(session.user, await authGateway.loadProfile(session.user));
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
        const { data, error } = await authGateway.signInWithUsername(username, password);
        if (error) throw error;
        setAuthenticatedUi(data.user, await authGateway.loadProfile(data.user));
        const { data: { session } } = await supabase.auth.getSession();
        await startFirestoreSession(session);
    } catch (error) { console.error(error); $("auth-error").textContent = "Identifiant ou mot de passe incorrect, ou connexion indisponible."; }
    finally { submit.disabled = false; }
});

$("btn-sign-out").addEventListener("click", async () => {
    await signOutCurrentUser();
});

function formatTags(tags = "") { return tags.split(",").map((tag) => tag.trim()).filter(Boolean); }

function normalizeSearchText(value = "") {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
}

function normalizeOrganizationValue(value = "") {
    return normalizeSearchText(value).replace(/\s+/g, " ").trim();
}

function highlightSearchTerms(container) {
    const terms = [...new Set(normalizeSearchText(searchInput.value).trim().split(/\s+/).filter(Boolean))];
    if (!terms.length) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue.trim() && !node.parentElement?.closest("a, mark")) textNodes.push(node);
    }
    textNodes.forEach((textNode) => {
        const original = textNode.nodeValue;
        let foldedText = "";
        const offsets = [];
        for (let index = 0; index < original.length;) {
            const character = String.fromCodePoint(original.codePointAt(index));
            const end = index + character.length;
            for (const foldedCharacter of normalizeSearchText(character)) {
                foldedText += foldedCharacter;
                offsets.push({ start: index, end });
            }
            if (!normalizeSearchText(character) && /[\u0300-\u036f]/.test(character) && offsets.length) offsets[offsets.length - 1].end = end;
            index = end;
        }
        const ranges = [];
        terms.forEach((term) => {
            let index = 0;
            while ((index = foldedText.indexOf(term, index)) !== -1) {
                ranges.push({ start: offsets[index].start, end: offsets[index + term.length - 1].end });
                index += term.length;
            }
        });
        if (!ranges.length) return;
        ranges.sort((a, b) => a.start - b.start || a.end - b.end);
        const merged = ranges.reduce((result, range) => {
            const previous = result[result.length - 1];
            if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
            else result.push({ ...range });
            return result;
        }, []);
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        merged.forEach(({ start, end }) => {
            fragment.append(document.createTextNode(original.slice(cursor, start)));
            const mark = document.createElement("mark");
            mark.textContent = original.slice(start, end);
            fragment.append(mark);
            cursor = end;
        });
        fragment.append(document.createTextNode(original.slice(cursor)));
        textNode.replaceWith(fragment);
    });
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
    // Every search word must match somewhere in the item's searchable text; accents and case are ignored.
    const terms = normalizeSearchText(searchInput.value).trim().split(/\s+/).filter(Boolean);
    const seen = new Set();
    return items.filter((item) => {
        const identity = item.id || item;
        const haystack = normalizeSearchText([
            item.title, item.summary, item.description, item.tags, item.theme, item.content,
            item.fileName, item.fileType, item.date, item.publishedAt, item.expiresAt, item.retentionMonths
        ].filter((value) => value !== null && value !== undefined && value !== "").join(" "));
        const matchesSearch = terms.every((term) => haystack.includes(term));
        const matchesTheme = !themeFilter.value || normalizeOrganizationValue(item.theme) === themeFilter.value;
        const matchesTag = !tagFilter.value || formatTags(item.tags).some((tag) => normalizeOrganizationValue(tag) === tagFilter.value);
        const matchesFavorite = favoriteFilter.value !== "favorites" || (item.type === "document" && isFavorite(item));
        const matches = matchesSearch && matchesTheme && matchesTag && matchesFavorite;
        if (!matches || seen.has(identity)) return false;
        seen.add(identity);
        return true;
    });
}

function updateExpirationPreview() {
    const months = Number($("doc-retention").value);
    const expiresAt = addMonthsToDate($("doc-date").value, months);
    const isPast = expiresAt && isDueForPurge(expiresAt, new Date().toISOString().slice(0, 10));
    $("expiration-preview").textContent = expiresAt
        ? `${months} mois à partir de la date du document : ${dateLabel(expiresAt)}. Le document reste disponible jusqu’à la fin de cette date.${isPast ? " Cette date est déjà passée ; une confirmation sera demandée avant l’enregistrement." : ""}`
        : months ? "Choisissez une date du document valide pour calculer l’échéance." : "Aucune durée de conservation : ce document ne sera pas supprimé automatiquement.";
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
    renderActiveFilters();
    updateSelectionToolbar();
    renderRecentlyViewed();
    renderThemes();
    renderTimeline();
    renderDashboard();
    renderAdminExpirationReview();
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

function renderActiveFilters() {
    activeFilters.replaceChildren();
    const criteria = [];
    const query = searchInput.value.trim();
    if (query) criteria.push({ label: `Recherche : ${query}`, clear: () => { searchInput.value = ""; } });
    if (themeFilter.value) criteria.push({ label: `Thème : ${themeFilter.selectedOptions[0]?.textContent || themeFilter.value}`, clear: () => { themeFilter.value = ""; } });
    if (tagFilter.value) criteria.push({ label: `Tag : ${tagFilter.selectedOptions[0]?.textContent || tagFilter.value}`, clear: () => { tagFilter.value = ""; } });
    if (favoriteFilter.value) criteria.push({ label: "Favoris", clear: () => { favoriteFilter.value = ""; } });
    const selectedSort = sortControl.options[sortControl.selectedIndex];
    criteria.push({ label: `Tri : ${selectedSort?.textContent || sortControl.value}`, clear: () => { sortControl.value = "date-desc"; } });
    criteria.forEach(({ label, clear }) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "active-filter-chip";
        chip.textContent = `${label} ×`;
        chip.setAttribute("aria-label", `Retirer le critère ${label}`);
        chip.addEventListener("click", () => { clear(); render(); });
        activeFilters.append(chip);
    });
    filterSummary.classList.toggle("hidden", criteria.length === 0);
}

function updateSelectionToolbar() {
    const selectedCount = selectedDocumentIds.size;
    const visibleIds = new Set(filteredItems().filter((item) => item.type === "document").map((item) => item.id));
    const hiddenSelectedCount = [...selectedDocumentIds].filter((id) => !visibleIds.has(id)).length;
    selectionToolbar.classList.toggle("hidden", !selectionMode);
    selectModeButton.setAttribute("aria-pressed", String(selectionMode));
    selectModeButton.textContent = selectionMode ? "Annuler la sélection" : "Sélectionner";
    selectionCount.textContent = `${selectedCount} document${selectedCount === 1 ? "" : "s"} sélectionné${selectedCount === 1 ? "" : "s"}${hiddenSelectedCount ? ` (${hiddenSelectedCount} hors filtres)` : ""}`;
    deleteSelectedButton.classList.toggle("hidden", !isAdmin() || selectedCount === 0);
}

function setSelectionMode(enabled) {
    selectionMode = Boolean(enabled) && isAdmin();
    if (!selectionMode) selectedDocumentIds.clear();
    updateSelectionToolbar();
    renderThemes();
}

function toggleDocumentSelection(item, checked) {
    if (!item?.id || item.type !== "document") return;
    if (checked) selectedDocumentIds.add(item.id);
    else selectedDocumentIds.delete(item.id);
    updateSelectionToolbar();
}

function resetFilters() {
    searchInput.value = "";
    themeFilter.value = "";
    tagFilter.value = "";
    favoriteFilter.value = "";
    sortControl.value = "date-desc";
    render();
}

function renderThemes() {
    viewThemes.replaceChildren();
    viewThemes.classList.toggle("list-view", displayMode === "list");
    gridViewButton.setAttribute("aria-pressed", String(displayMode === "grid"));
    listViewButton.setAttribute("aria-pressed", String(displayMode === "list"));
    const documents = filteredItems().filter((item) => item.type === "document");
    if (!documents.length) {
        const hasCriteria = Boolean(searchInput.value.trim() || themeFilter.value || tagFilter.value || favoriteFilter.value);
        const emptyMessage = favoriteFilter.value === "favorites"
            ? "Aucun document favori ne correspond à ces critères. Vous pouvez réinitialiser les filtres pour tout afficher."
            : hasCriteria
                ? "Aucun document ne correspond à vos critères. Vous pouvez réinitialiser les filtres pour tout afficher."
                : "Aucun document pour le moment. Ajoutez-en un pour commencer.";
        viewThemes.append(createEmpty(emptyMessage));
        return;
    }
    if (displayMode === "list") {
        sortDocuments(documents).forEach((item) => viewThemes.append(createDocumentCard(item)));
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
    if (item.expiresAt) return parseCivilDate(item.expiresAt) ? item.expiresAt : "";
    return addMonthsToDate(item.date, Number(item.retentionMonths));
}
function expirationConsistency(item) {
    if (item.type !== "document") return "";
    const rawMonths = item.retentionMonths;
    const hasExpiry = item.expiresAt !== undefined && item.expiresAt !== null && item.expiresAt !== "";
    if (rawMonths === undefined || rawMonths === null || rawMonths === "") {
        return hasExpiry ? "Durée de conservation absente alors qu’une date d’échéance est enregistrée." : "";
    }
    const months = Number(rawMonths);
    const calculated = Number.isInteger(months) && months > 0 ? addMonthsToDate(item.date, months) : null;
    if (!calculated) return "Durée ou date du document invalide : vérifiez l’échéance enregistrée.";
    if (!hasExpiry || !parseCivilDate(item.expiresAt) || item.expiresAt !== calculated) {
        return `Échéance incohérente : la durée de ${months} mois donne le ${dateLabel(calculated)}, mais la valeur enregistrée diffère.`;
    }
    return "";
}
function expirationLabel(item) {
    const days = daysUntil(expirationDate(item));
    if (days === null || days < 0 || days > 30) return "";
    if (days === 0) return "Expire aujourd'hui";
    if (days === 1) return "Expire demain";
    return `Expire dans ${days} jours`;
}
function renderAdminExpirationReview() {
    const container = $("admin-expiration-list");
    if (!isAdmin()) { container.replaceChildren(); return; }
    const scheduled = documentItems()
        .filter((item) => item.retentionMonths !== undefined && item.retentionMonths !== null && item.retentionMonths !== "" || item.expiresAt !== undefined && item.expiresAt !== null && item.expiresAt !== "")
        .sort((a, b) => String(a.expiresAt || "9999-99-99").localeCompare(String(b.expiresAt || "9999-99-99")));
    container.replaceChildren();
    if (!scheduled.length) {
        container.append(createEmpty("Aucun document ne comporte de durée ou de date de suppression automatique."));
        return;
    }
    scheduled.forEach((item) => {
        const row = document.createElement("article"); row.className = "admin-expiration-row";
        const title = document.createElement("strong"); title.textContent = item.title || "Sans titre";
        const rawMonths = item.retentionMonths;
        const months = Number(rawMonths);
        const retentionLabel = rawMonths === undefined || rawMonths === null || rawMonths === ""
            ? "Non définie"
            : Number.isSafeInteger(months) && months > 0 ? `${months} mois` : `Valeur invalide (${String(rawMonths)})`;
        const details = document.createElement("p"); details.textContent = `Date documentaire : ${dateLabel(item.date)} · Durée : ${retentionLabel} · Date d’expiration enregistrée : ${item.expiresAt || "Non définie"}`;
        const warning = expirationConsistency(item);
        const state = document.createElement("p");
        state.className = warning ? "admin-expiration-warning" : "admin-expiration-ok";
        const days = daysUntil(item.expiresAt);
        const schedule = days === null
            ? "Aucune date d’expiration exploitable : la fonction serveur ne doit pas supprimer ce document sur cette valeur."
            : days < 0
                ? "Date dépassée : la purge serveur pourra traiter le document lors d’un passage planifié si les champs concordent."
                : days === 0
                    ? "Échéance valable jusqu’à la fin de cette date ; la purge quotidienne intervient lors d’un passage ultérieur."
                    : `Échéance à venir : le document ne doit pas être purgé avant le ${dateLabel(item.expiresAt)}.`;
        state.textContent = warning ? `${warning} ${schedule}` : schedule;
        row.append(title, details, state);
        if (warning && isCivilDate(item.date) && Number.isSafeInteger(months) && months > 0) {
            const correctedDate = addMonthsToDate(item.date, months);
            if (correctedDate) {
                const repair = document.createElement("button"); repair.type = "button"; repair.textContent = "Recalculer l’échéance";
                repair.addEventListener("click", async () => {
                    const past = isDueForPurge(correctedDate, localDateValue(new Date()));
                    const confirmation = `Remplacer ${item.expiresAt || "aucune date enregistrée"} par ${correctedDate}${past ? " (déjà passée : la purge pourra supprimer le document lors de son prochain passage)" : ""} ?`;
                    if (!window.confirm(confirmation)) return;
                    repair.disabled = true;
                    try {
                        await refreshAdminFirestoreSession();
                        await setDoc(doc(db, "padletItems", item.id), { expiresAt: correctedDate }, { merge: true });
                        setStatus(`Échéance corrigée au ${dateLabel(correctedDate)}.`);
                    } catch (error) { console.error("Correction d’échéance impossible.", error); setStatus("Impossible de corriger l’échéance.", true); }
                    finally { repair.disabled = false; }
                });
                row.append(repair);
            }
        }
        container.append(row);
    });
}
async function exportDocumentMetadata() {
    if (!requireAdmin()) return;
    const button = $("export-document-metadata");
    const status = $("backup-export-status");
    button.disabled = true;
    status.textContent = "Préparation de l’export…";
    try {
        await refreshAdminFirestoreSession();
        const payload = buildMetadataExportPayload(sortDocuments(documentItems()));
        const { documents } = payload;
        const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }));
        const download = document.createElement("a");
        download.href = blobUrl;
        download.download = `padlet-metadonnees-${new Date().toISOString().slice(0, 10)}.json`;
        download.click();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        status.textContent = `Export créé : ${documents.length} document${documents.length === 1 ? "" : "s"}. Il contient les métadonnées et chemins/URL des fichiers, pas les objets eux-mêmes ; il ne constitue pas une sauvegarde complète des fichiers.`;
    } catch (error) {
        console.error("Export des métadonnées impossible.", error);
        status.textContent = error instanceof Error && error.message ? error.message : "L’export n’a pas pu être généré.";
    } finally { button.disabled = false; }
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
function parseTimelineDate(item) {
    const value = timelineDate(item);
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ? null : date;
}
function sortTimelineByDate(a, b) { return (parseTimelineDate(a)?.getTime() ?? Infinity) - (parseTimelineDate(b)?.getTime() ?? Infinity); }

function timelineWindow() {
    const start = personalPreferences.timelineView === "year"
        ? new Date(timelineAnchor.getFullYear(), 0, 1)
        : new Date(timelineAnchor.getFullYear(), timelineAnchor.getMonth(), 1);
    const end = personalPreferences.timelineView === "year"
        ? new Date(timelineAnchor.getFullYear() + 1, 0, 1)
        : new Date(timelineAnchor.getFullYear(), timelineAnchor.getMonth() + 1, 1);
    return { start, end };
}

function updateTimelinePeriod() {
    const { start, end } = timelineWindow();
    const label = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
    $("timeline-date-target").value = localDateValue(timelineAnchor);
    $("timeline-period").textContent = `${label.format(start)} – ${label.format(new Date(end.getTime() - 86400000))} · Aujourd’hui : ${label.format(new Date())}`;
}

function createDocumentCard(item) {
    const card = document.createElement("article");
    card.className = `doc-card${displayMode === "list" ? " doc-list-row" : ""}`;
    card.tabIndex = 0;
    const header = document.createElement("div"); header.className = "doc-card-header";
    const title = document.createElement("h4"); title.textContent = item.title || "Sans titre";
    highlightSearchTerms(title);
    const favorite = document.createElement("button"); favorite.type = "button"; favorite.className = `favorite-button${isFavorite(item) ? " is-favorite" : ""}`;
    favorite.textContent = isFavorite(item) ? "★" : "☆";
    favorite.setAttribute("aria-label", isFavorite(item) ? "Retirer des favoris" : "Ajouter aux favoris");
    favorite.title = favorite.getAttribute("aria-label");
    favorite.addEventListener("click", (event) => { event.stopPropagation(); toggleFavorite(item); });
    if (selectionMode) {
        const selectLabel = document.createElement("label");
        selectLabel.className = "document-select";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selectedDocumentIds.has(item.id);
        checkbox.setAttribute("aria-label", `Sélectionner ${item.title || "ce document"}`);
        checkbox.addEventListener("click", (event) => event.stopPropagation());
        checkbox.addEventListener("change", () => toggleDocumentSelection(item, checkbox.checked));
        selectLabel.append(checkbox);
        header.append(selectLabel);
    }
    header.append(title, favorite);
    const date = document.createElement("p"); date.className = "card-date";
    date.textContent = displayMode === "list"
        ? `Ajouté le ${dateLabel(String(item.publishedAt || item.date || "").slice(0, 10))}`
        : dateLabel(item.date);
    const expiration = expirationLabel(item);
    const summary = document.createElement("div"); summary.className = "doc-summary-preview"; renderMarkdownSummary(summary, item.summary || "Sans résumé");
    if (item.summary) highlightSearchTerms(summary);
    const tags = createTagButtons(item.tags);
    const actions = createActions(item);
    card.append(header);
    if (displayMode === "list") {
        const metadata = document.createElement("div"); metadata.className = "list-metadata";
        const theme = document.createElement("span"); theme.textContent = displayTheme(item.theme) || "Sans thème";
        metadata.append(theme, date);
        const expiry = expirationDate(item);
        if (expiry) {
            const expirationDetail = document.createElement("span");
            expirationDetail.className = "list-expiration";
            expirationDetail.textContent = `Échéance : ${dateLabel(expiry)}`;
            metadata.append(expirationDetail);
        }
        card.append(metadata);
    } else card.append(date);
    if (expiration) { const notice = document.createElement("p"); notice.className = "card-expiration"; notice.textContent = expiration; card.append(notice); }
    const expiryWarning = isAdmin() ? expirationConsistency(item) : "";
    if (expiryWarning) { const warning = document.createElement("p"); warning.className = "expiration-warning"; warning.textContent = expiryWarning; card.append(warning); }
    card.append(summary);
    if (tags.childElementCount) card.append(tags);
    card.append(actions);
    card.addEventListener("click", () => { card.focus(); openReadModal(item); });
    card.addEventListener("keydown", (event) => {
        if (event.target !== card || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openReadModal(item);
    });
    return card;
}

function applyTagFilter(tag) {
    tagFilter.value = normalizeOrganizationValue(tag);
    closeReadModal();
    setView(false);
    render();
    tagFilter.focus();
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

function createTimelineEntry(item) {
    const card = document.createElement("article");
    card.className = `timeline-entry${item.type === "deadline" ? " deadline" : " document"}`;
    const markerColor = item.type === "deadline" ? item.timelineColor || item.color || "" : "";
    if (markerColor) card.style.setProperty("--marker-color", markerColor);
    const open = document.createElement("button");
    open.type = "button";
    open.className = "timeline-entry-open";
    open.setAttribute("aria-label", `Ouvrir ${item.type === "deadline" ? "l’événement" : "le document"} ${timelineTitle(item) || "sans titre"}${parseTimelineDate(item) ? `, ${dateLabel(timelineDate(item))}` : ""}`);
    open.addEventListener("click", () => openReadModal(item));
    const marker = document.createElement("span"); marker.className = "timeline-entry-marker"; marker.setAttribute("aria-hidden", "true");
    const kind = document.createElement("span"); kind.className = "timeline-kind"; kind.textContent = item.type === "deadline" ? "Échéance indépendante" : "Document";
    const title = document.createElement("strong"); title.className = "timeline-entry-title"; title.textContent = timelineTitle(item) || "Sans titre";
    const time = document.createElement("time");
    const date = parseTimelineDate(item);
    if (date) { time.dateTime = timelineDate(item); time.textContent = dateLabel(timelineDate(item)); }
    else time.textContent = "Date non renseignée";
    open.append(marker, kind, title, time);
    const contentValue = timelineContent(item);
    if (contentValue) { const content = document.createElement("div"); content.className = "timeline-content"; renderMarkdownSummary(content, contentValue); card.append(content); }
    if (item.type === "document" && (item.theme || item.tags)) {
        const metadata = document.createElement("span"); metadata.className = "timeline-document-meta";
        metadata.textContent = [displayTheme(item.theme), formatTags(item.tags).join(" · ")].filter(Boolean).join(" · ");
        card.append(metadata);
    }
    card.prepend(open);
    if (isAdmin()) {
        const edit = document.createElement("button"); edit.type = "button"; edit.className = "timeline-edit"; edit.textContent = "Personnaliser la frise";
        edit.addEventListener("click", () => openTimelineForm(item));
        card.append(edit);
    }
    return card;
}

function renderUndatedItems(items) {
    if (!items.length) return;
    const section = document.createElement("section"); section.className = "timeline-undated";
    const heading = document.createElement("h2"); heading.textContent = `Dates non fiables ou absentes (${items.length})`;
    const list = document.createElement("div"); list.className = "timeline-group-items";
    items.forEach((item) => list.append(createTimelineEntry(item)));
    section.append(heading, list); timelineContainer.append(section);
}

function renderLineTimeline(items, undated, start, end) {
    const daysInPeriod = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
    const datedGroups = new Map();
    items.forEach((item) => {
        const date = timelineDate(item);
        if (!datedGroups.has(date)) datedGroups.set(date, []);
        datedGroups.get(date).push(item);
    });
    const groups = [...datedGroups.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (!groups.length) timelineContainer.append(createEmpty("Aucune entrée datée dans cette période. Utilisez Aujourd’hui ou choisissez une autre période."));
    else {
        const scroll = document.createElement("div"); scroll.className = "timeline-line-scroll"; scroll.tabIndex = 0; scroll.setAttribute("aria-label", "Frise chronologique défilable horizontalement");
        const width = Math.max(900, daysInPeriod * 5, groups.length * 190);
        const track = document.createElement("div"); track.className = "timeline-line-track"; track.style.width = `${width}px`;
        timelineContainer.append(scroll);
        scroll.append(track);
        const axis = document.createElement("div"); axis.className = "timeline-line-axis"; track.append(axis);
        const layouts = [];
        const ticks = buildTimelineTicks(start, end, personalPreferences.timelineView);
        ticks.forEach((tick) => {
            const tickMark = document.createElement("span"); tickMark.className = "timeline-line-tick";
            const ratio = timelineDateRatio(tick.date, start, end);
            tickMark.style.left = `${70 + ratio * (width - 140)}px`;
            tickMark.textContent = personalPreferences.timelineView === "year"
                ? new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(start.getFullYear(), tick.month, 1))
                : String(tick.day);
            track.append(tickMark);
        });
        const today = new Date();
        if (today >= start && today < end) {
            const todayRatio = timelineDateRatio(localDateValue(today), start, end);
            const todayMark = document.createElement("span"); todayMark.className = "timeline-line-today"; todayMark.style.left = `${70 + todayRatio * (width - 140)}px`; todayMark.setAttribute("aria-label", "Aujourd’hui"); track.append(todayMark);
        }
        let laneStep = 165;
        const laneEnds = [];
        groups.forEach(([dateValue, entries]) => {
            const date = parseTimelineDate({ date: dateValue });
            if (!date) return;
            const ratio = timelineDateRatio(dateValue, start, end);
            const x = 70 + ratio * (width - 140);
            let lane = laneEnds.findIndex((endX) => endX <= x - 190);
            if (lane < 0) { lane = laneEnds.length; laneEnds.push(x + 190); } else laneEnds[lane] = x + 190;
            const marker = document.createElement("section"); marker.className = "timeline-line-date";
            marker.style.left = `${x}px`; marker.style.setProperty("--timeline-lane", String(lane));
            marker.classList.toggle("below", lane % 2 === 1);
            const dot = document.createElement("span"); dot.className = "timeline-line-dot"; dot.setAttribute("aria-hidden", "true");
            const dateHeading = document.createElement("h3"); dateHeading.textContent = dateLabel(dateValue);
            const cards = document.createElement("div"); cards.className = "timeline-line-cards";
            entries.forEach((item) => cards.append(createTimelineEntry(item)));
            const content = document.createElement("div"); content.className = "timeline-line-date-content"; content.append(dateHeading, cards);
            marker.append(dot, content); track.append(marker); layouts.push({ marker, lane, x });
        });
        const maxContentHeight = Math.max(0, ...layouts.map(({ marker }) => marker.querySelector(".timeline-line-date-content").scrollHeight));
        laneStep = Math.max(165, maxContentHeight + 35);
        laneEnds.length = 0;
        layouts.forEach((layout) => {
            let lane = laneEnds.findIndex((endX) => endX <= layout.x - 190);
            if (lane < 0) { lane = laneEnds.length; laneEnds.push(layout.x + 190); } else laneEnds[lane] = layout.x + 190;
            layout.lane = lane;
            layout.marker.style.setProperty("--timeline-lane", String(lane));
            layout.marker.classList.toggle("below", lane % 2 === 1);
        });
        const laneCount = Math.max(1, laneEnds.length);
        const axisY = Math.ceil(laneCount / 2) * laneStep + 40;
        const maxBelowLevel = laneCount > 1 ? Math.floor((laneCount - 1) / 2) : -1;
        track.style.height = `${axisY + (maxBelowLevel >= 0 ? 28 + maxBelowLevel * laneStep + maxContentHeight + 40 : 55)}px`;
        track.style.setProperty("--timeline-axis-y", `${axisY}px`);
        layouts.forEach(({ marker, lane }) => {
            const level = Math.floor(lane / 2);
            const offset = lane % 2 === 0 ? -(level + 1) * laneStep + 10 : 28 + level * laneStep;
            marker.style.top = `${axisY}px`;
            marker.style.setProperty("--timeline-content-offset", `${offset}px`);
        });
        track.style.setProperty("--timeline-lanes", String(laneCount));
        const anchor = parseLocalDate(localDateValue(timelineAnchor));
        const anchorRatio = anchor ? timelineDateRatio(localDateValue(anchor), start, end) : 0;
        scroll.scrollLeft = Math.max(0, 70 + anchorRatio * (width - 140) - scroll.clientWidth / 2);
        const legend = document.createElement("p"); legend.className = "timeline-line-help"; legend.textContent = "Les entrées sont placées dans l’ordre de leur date. Faites défiler horizontalement pour parcourir la période."; timelineContainer.append(legend);
    }
    renderUndatedItems(undated);
}

function renderTimeline() {
    timelineContainer.replaceChildren();
    updateTimelinePeriod();
    const { start, end } = timelineWindow();
    const withinPeriod = [];
    const undated = [];
    filteredItems().forEach((item) => {
        const date = parseTimelineDate(item);
        if (!date) undated.push(item);
        else if (date >= start && date < end) withinPeriod.push(item);
    });
    withinPeriod.sort(sortTimelineByDate);
    if (!withinPeriod.length && !undated.length) {
        const empty = createEmpty("Aucun élément pour cette période. Revenez à aujourd’hui, choisissez une autre vue ou date, ou avancez/reculez dans le temps.");
        const todayButton = document.createElement("button"); todayButton.type = "button"; todayButton.textContent = "Revenir à aujourd’hui";
        todayButton.addEventListener("click", () => { timelineAnchor = new Date(); savePersonalPreferences(); renderTimeline(); });
        empty.append(document.createElement("br"), todayButton); timelineContainer.append(empty); return;
    }
    renderLineTimeline(withinPeriod, undated, start, end);
}

function formSnapshot(form) {
    return JSON.stringify([...form.elements].map((control) => ({
        name: control.name || control.id,
        value: control.value,
        checked: control.checked,
        files: control.files ? [...control.files].map((file) => `${file.name}:${file.size}:${file.lastModified}`) : []
    })));
}

function closeFormIfConfirmed(modal, form, baseline) {
    if (!modal.classList.contains("hidden") && formSnapshot(form) !== baseline && !window.confirm("Des modifications ne sont pas enregistrées. Fermer sans les enregistrer ?")) return false;
    modal.classList.add("hidden");
    return true;
}

function openTimelineForm(item) {
    if (!requireAdmin()) return;
    $("timeline-item-id").value = item.id;
    $("timeline-date").value = timelineDate(item);
    $("timeline-title").value = timelineTitle(item);
    $("timeline-content").value = timelineContent(item);
    $("timeline-color").value = item.timelineColor || "";
    timelineFormBaseline = formSnapshot(timelineForm);
    timelineFormModal.classList.remove("hidden");
    $("timeline-date").focus();
}

function toggleTypeFields() {
    const isDocument = document.querySelector('input[name="item-type"]:checked').value === "document";
    $("document-fields").classList.toggle("hidden", !isDocument);
    $("deadline-fields").classList.toggle("hidden", isDocument);
    $("doc-date-label").textContent = isDocument ? "Date du document" : "Date de l’échéance";
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
    docFormBaseline = formSnapshot(docForm);
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
    if (!supabase || !filePath || filePath.startsWith("padlet-files/")) return false;
    const { error } = await supabase.storage.from("documents").remove([filePath]);
    if (error) { console.warn("Le fichier Supabase n'a pas pu être supprimé.", error); if (throwOnError) throw error; return false; }
    return true;
}

docForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const type = document.querySelector('input[name="item-type"]:checked').value;
    const id = $("doc-id").value || doc(itemsCollection).id;
    const retentionValue = $("doc-retention").value;
    const retentionMonths = retentionValue ? Number(retentionValue) : null;
    if (type === "document" && retentionValue && (!Number.isSafeInteger(retentionMonths) || retentionMonths < 1)) {
        setStatus("Choisissez une durée de conservation valide.", true);
        return;
    }
    const expiresAt = type === "document" && retentionMonths ? addMonthsToDate($("doc-date").value, retentionMonths) : null;
    if (type === "document" && retentionMonths && !expiresAt) {
        setStatus("La date d’expiration est invalide. Vérifiez la date du document et la durée de conservation.", true);
        return;
    }
    if (expiresAt && isDueForPurge(expiresAt, localDateValue(new Date()))) {
        if (!window.confirm(`La date d’expiration calculée est déjà passée (${dateLabel(expiresAt)}). La purge serveur pourra traiter ce document après son enregistrement. Voulez-vous continuer ?`)) return;
    }
    const submit = $("submit-item"); submit.disabled = true; submit.textContent = "Enregistrement…";
    let uploadedFilePath = "";
    try {
        await refreshAdminFirestoreSession();
        const file = type === "document" ? await uploadSelectedFile(id) : { fileUrl: "", filePath: "", fileName: "", fileType: "" };
        uploadedFilePath = $("doc-file").files[0] ? file.filePath : "";
        const oldFilePath = $("existing-file-path").value;
        const item = type === "document"
            ? { id, type, title: $("doc-title").value.trim(), date: $("doc-date").value, theme: canonicalTheme($("doc-theme").value), tags: $("doc-tags").value.trim(), summary: $("doc-summary").value.trim(), content: $("doc-content").value.trim(), publishedAt: itemOrExistingPublishedAt(id), retentionMonths, expiresAt, color: deleteField(), description: deleteField(), ...file }
            : { id, type, title: $("doc-title").value.trim(), date: $("doc-date").value, color: $("deadline-color").value, description: $("deadline-description").value.trim(), theme: deleteField(), tags: deleteField(), summary: deleteField(), content: deleteField(), publishedAt: deleteField(), retentionMonths: deleteField(), expiresAt: deleteField(), fileUrl: deleteField(), filePath: deleteField(), fileName: deleteField(), fileType: deleteField(), fileSize: deleteField() };
        await setDoc(doc(db, "padletItems", id), item, { merge: true });
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
        await deleteItemRecord(item);
        items = items.filter((entry) => entry.id !== item.id);
        selectedDocumentIds.delete(item.id);
        render();
        setStatus("Élément supprimé."); await refreshStorageUsage();
    } catch (error) { console.error(error); setStatus("La suppression a échoué.", true); }
}

async function deleteItemRecord(item, { sessionChecked = false } = {}) {
    if (!requireAdmin()) throw new Error("Cette action est réservée aux administrateurs.");
    if (!sessionChecked) await refreshAdminFirestoreSession();
    return deleteDocumentAndFile(item, {
        removeFile: (filePath) => removeSupabaseFile(filePath, true),
        deleteMetadata: () => deleteDoc(doc(db, "padletItems", item.id))
    });
}

async function removeSelectedDocuments() {
    if (!requireAdmin()) return;
    const selected = [...new Map(documentItems().filter((item) => selectedDocumentIds.has(item.id)).map((item) => [item.id, item])).values()];
    if (!selected.length) {
        selectedDocumentIds.clear();
        render();
        setStatus("Aucun document sélectionné n’est disponible.", true);
        return;
    }
    const count = selected.length;
    const visibleIds = new Set(filteredItems().filter((item) => item.type === "document").map((item) => item.id));
    const outsideFilters = selected.filter((item) => !visibleIds.has(item.id)).length;
    const hiddenNote = outsideFilters ? ` ${outsideFilters} document${outsideFilters === 1 ? "" : "s"} ne sont pas visibles avec les critères actuels.` : "";
    if (!window.confirm(`Supprimer définitivement ${count} document${count === 1 ? "" : "s"} sélectionné${count === 1 ? "" : "s"} ?${hiddenNote} Les fichiers associés seront aussi supprimés. Cette action ne peut pas être annulée.`)) return;

    deleteSelectedButton.disabled = true;
    deleteSelectedButton.textContent = "Suppression…";
    const deletedIds = new Set();
    const failures = [];
    try {
        await refreshAdminFirestoreSession();
        for (const item of selected) {
            try {
                await deleteItemRecord(item, { sessionChecked: true });
                deletedIds.add(item.id);
            } catch (error) {
                console.error(`Suppression impossible pour « ${item.title || item.id} ».`, error);
                failures.push({ item, partial: error instanceof PartialDocumentDeletionError });
            }
        }
        if (deletedIds.size) {
            items = items.filter((item) => !deletedIds.has(item.id));
            deletedIds.forEach((id) => selectedDocumentIds.delete(id));
        }
        render();
        await refreshStorageUsage();
        if (failures.length) {
            const failedTitles = failures.map(({ item, partial }) => `${item.title || "Sans titre"}${partial ? " (fichier déjà supprimé ; relancer la suppression pour retirer la fiche)" : ""}`).join(", ");
            const deletedMessage = deletedIds.size ? `${deletedIds.size} document${deletedIds.size === 1 ? "" : "s"} supprimé${deletedIds.size === 1 ? "" : "s"}. ` : "Aucun document n’a pu être supprimé. ";
            setStatus(`${deletedMessage}${failures.length} échec${failures.length === 1 ? "" : "s"} : ${failedTitles}. Les fiches en échec restent sélectionnées ; un fichier associé a pu être supprimé avant l’échec Firestore.`, true);
        } else {
            setStatus(`${deletedIds.size} document${deletedIds.size === 1 ? "" : "s"} supprimé${deletedIds.size === 1 ? "" : "s"}.`);
        }
    } catch (error) {
        console.error("Suppression groupée impossible.");
        setStatus(error instanceof Error && error.message ? error.message : "Suppression groupée impossible.", true);
    } finally {
        deleteSelectedButton.disabled = false;
        deleteSelectedButton.textContent = "Supprimer la sélection";
    }
}

function openReadModal(item) {
    readModalReturnFocus = document.activeElement;
    readModalReturnView = !viewTimeline.classList.contains("hidden") ? "timeline" : !viewDashboard.classList.contains("hidden") ? "dashboard" : "themes";
    readModalItem = item;
    rememberRecentlyViewed(item);
    renderRecentlyViewed();
    $("read-type").textContent = item.type === "deadline" ? "Échéance" : "Document";
    $("read-title").textContent = item.title || "Sans titre";
    $("read-date").textContent = item.type === "document"
        ? `Ajouté le ${dateLabel(String(item.publishedAt || item.date || "").slice(0, 10))}`
        : dateLabel(item.date);
    const theme = displayTheme(item.theme);
    $("read-theme").textContent = theme;
    $("read-theme-wrap").classList.toggle("hidden", !theme);
    const expiry = expirationDate(item);
    $("read-expiration").textContent = expiry ? `Échéance : ${dateLabel(expiry)}` : "";
    $("read-expiration-wrap").classList.toggle("hidden", !expiry);
    const expiryWarning = isAdmin() ? expirationConsistency(item) : "";
    $("read-expiration-warning").textContent = expiryWarning;
    $("read-expiration-warning").classList.toggle("hidden", !expiryWarning);
    const readFavorite = $("read-favorite");
    readFavorite.classList.toggle("hidden", item.type !== "document");
    updateReadFavoriteButton();
    const summary = $("read-summary");
    if (item.type === "deadline") summary.textContent = item.description || "Aucune précision.";
    else {
        renderMarkdownSummary(summary, item.summary || "Sans résumé");
        if (item.summary) highlightSearchTerms(summary);
    }
    const content = $("read-content");
    content.textContent = item.type === "document" ? (item.content || "") : "";
    content.classList.toggle("hidden", !content.textContent);
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
    $("close-read").focus();
}

function closeReadModal() {
    if (readModal.classList.contains("hidden")) return;
    readModal.classList.add("hidden");
    renderRecentlyViewed();
    const recentButton = readModalItem?.id
        ? [...recentlyViewedList.querySelectorAll(".recent-document-button")].find((button) => button.dataset.documentId === readModalItem.id)
        : null;
    const fallbackTarget = readModalReturnView === "timeline" ? btnTimeline : readModalReturnView === "dashboard" ? btnDashboard : recentButton || selectModeButton;
    const returnTarget = readModalReturnFocus?.isConnected && readModalReturnFocus !== document.body ? readModalReturnFocus : fallbackTarget;
    returnTarget?.focus();
    readModalReturnFocus = null;
}

function updateReadFavoriteButton() {
    if (!readModalItem || readModalItem.type !== "document") return;
    const favorite = isFavorite(readModalItem);
    const button = $("read-favorite");
    button.textContent = favorite ? "★" : "☆";
    button.classList.toggle("is-favorite", favorite);
    button.setAttribute("aria-label", favorite ? "Retirer des favoris" : "Ajouter aux favoris");
    button.title = button.getAttribute("aria-label");
}

function setDisplayMode(mode) {
    displayMode = mode === "list" ? "list" : "grid";
    try { localStorage.setItem(DISPLAY_MODE_KEY, displayMode); } catch { /* La préférence reste utilisable pour cette session. */ }
    renderThemes();
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
                $("admin-reset-user-id").value = user.id;
                $("admin-reset-password-title").textContent = `Nouveau mot de passe pour ${user.username}`;
                $("admin-reset-password-form").classList.remove("hidden");
                $("admin-reset-password").focus();
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
    const selected = view === "timeline"
        ? "timeline"
        : view === "dashboard"
            ? "dashboard"
            : view === "settings"
                ? "settings"
            : "themes";

    btnTheme.classList.toggle("active", selected === "themes");
    btnTimeline.classList.toggle("active", selected === "timeline");
    btnDashboard.classList.toggle("active", selected === "dashboard");
    btnSettings.classList.toggle("active", selected === "settings");
    btnTheme.setAttribute("aria-current", selected === "themes" ? "page" : "false");
    btnTimeline.setAttribute("aria-current", selected === "timeline" ? "page" : "false");
    btnDashboard.setAttribute("aria-current", selected === "dashboard" ? "page" : "false");
    btnSettings.setAttribute("aria-current", selected === "settings" ? "page" : "false");

    viewThemes.classList.toggle("hidden", selected !== "themes");
    viewTimeline.classList.toggle("hidden", selected !== "timeline");
    viewDashboard.classList.toggle("hidden", selected !== "dashboard");
    viewSettings.classList.toggle("hidden", selected !== "settings");
    recentlyViewedSection.classList.toggle("hidden", selected !== "themes" || recentlyViewedList.childElementCount === 0);

    if (selected === "timeline") { savePersonalPreferences(); renderTimeline(); }
}

btnTheme.addEventListener("click", () => setView("themes")); btnTimeline.addEventListener("click", () => setView("timeline")); btnDashboard.addEventListener("click", () => setView("dashboard")); btnSettings.addEventListener("click", () => setView("settings")); $("btn-add").addEventListener("click", () => openForm());

function moveTimeline(direction) {
    if (personalPreferences.timelineView === "year") timelineAnchor = new Date(timelineAnchor.getFullYear() + direction, 0, 1, 12);
    else timelineAnchor = new Date(timelineAnchor.getFullYear(), timelineAnchor.getMonth() + direction, 1, 12);
    savePersonalPreferences();
    renderTimeline();
}

$("timeline-previous").addEventListener("click", () => moveTimeline(-1));
$("timeline-next").addEventListener("click", () => moveTimeline(1));
$("timeline-today").addEventListener("click", () => { timelineAnchor = new Date(); savePersonalPreferences(); renderTimeline(); });
$("timeline-go-date").addEventListener("click", () => {
    const target = parseLocalDate($("timeline-date-target").value);
    if (!target) { setStatus("Choisissez une date valide pour afficher la période.", true); return; }
    timelineAnchor = target;
    savePersonalPreferences();
    renderTimeline();
});
timelineScaleControl.addEventListener("change", () => {
    personalPreferences.timelineView = timelineScaleControl.value;
    $("setting-timeline-view").value = personalPreferences.timelineView;
    savePersonalPreferences();
    renderTimeline();
});
$("setting-theme").addEventListener("change", () => { personalPreferences.theme = $("setting-theme").value; savePersonalPreferences(); applyAppearance(); });
$("setting-accent").addEventListener("change", () => { personalPreferences.accent = $("setting-accent").value; savePersonalPreferences(); applyAppearance(); });
$("setting-timeline-view").addEventListener("change", () => {
    personalPreferences.timelineView = $("setting-timeline-view").value;
    timelineScaleControl.value = personalPreferences.timelineView;
    savePersonalPreferences();
    renderTimeline();
});
$("reset-preferences").addEventListener("click", () => {
    personalPreferences = { ...PERSONAL_PREFERENCE_DEFAULTS, timelineAnchor: localDateValue(new Date()) };
    displayMode = "grid";
    timelineAnchor = new Date();
    try {
        const key = personalPreferencesStorageKey(currentUser?.id);
        if (key) localStorage.removeItem(key);
        localStorage.removeItem(DISPLAY_MODE_KEY);
        localPreferencesAvailable = true;
    } catch { localPreferencesAvailable = false; }
    timelineScaleControl.value = personalPreferences.timelineView;
    applyAppearance();
    render();
    $("settings-status").textContent = localPreferencesAvailable
        ? "Préférences réinitialisées. Documents, favoris et comptes conservés."
        : "Valeurs par défaut appliquées pour cette session ; stockage local indisponible.";
});
$("export-document-metadata").addEventListener("click", exportDocumentMetadata);

timelineScaleControl.value = personalPreferences.timelineView;
applyAppearance();
$("btn-admin-users").addEventListener("click", async () => {
    if (!requireAdmin()) return;
    $("admin-users-modal").classList.remove("hidden"); setAdminUsersStatus(""); await renderAdminUsers();
});
$("close-admin-users").addEventListener("click", () => $("admin-users-modal").classList.add("hidden"));
$("cancel-password-reset").addEventListener("click", () => { $("admin-reset-password-form").reset(); $("admin-reset-password-form").classList.add("hidden"); });
$("admin-reset-password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const form = event.currentTarget;
    const passwordInput = $("admin-reset-password");
    const password = passwordInput.value;
    const id = $("admin-reset-user-id").value;
    try {
        await callAdminUsers("reset-password", { id, password });
        setAdminUsersStatus("Mot de passe réinitialisé.");
        form.reset(); form.classList.add("hidden");
    } catch (error) {
        setAdminUsersStatus(error instanceof Error ? error.message : "Impossible de réinitialiser le mot de passe.", true);
        passwordInput.value = "";
    }
});
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
gridViewButton.addEventListener("click", () => setDisplayMode("grid"));
listViewButton.addEventListener("click", () => setDisplayMode("list"));
selectModeButton.addEventListener("click", () => setSelectionMode(!selectionMode));
$("clear-selection").addEventListener("click", () => {
    selectedDocumentIds.clear();
    updateSelectionToolbar();
    renderThemes();
});
deleteSelectedButton.addEventListener("click", removeSelectedDocuments);
$("reset-filters").addEventListener("click", resetFilters);
$("read-favorite").addEventListener("click", () => {
    if (!readModalItem || readModalItem.type !== "document") return;
    toggleFavorite(readModalItem);
    updateReadFavoriteButton();
});
$("doc-date").addEventListener("change", updateExpirationPreview); $("doc-retention").addEventListener("change", updateExpirationPreview);
$("close-form").addEventListener("click", () => closeFormIfConfirmed(formModal, docForm, docFormBaseline)); $("close-read").addEventListener("click", closeReadModal);
$("close-timeline-form").addEventListener("click", () => closeFormIfConfirmed(timelineFormModal, timelineForm, timelineFormBaseline)); $("cancel-timeline-form").addEventListener("click", () => closeFormIfConfirmed(timelineFormModal, timelineForm, timelineFormBaseline));
window.addEventListener("click", (event) => {
    if (event.target === formModal) closeFormIfConfirmed(formModal, docForm, docFormBaseline);
    if (event.target === readModal) closeReadModal();
    if (event.target === timelineFormModal) closeFormIfConfirmed(timelineFormModal, timelineForm, timelineFormBaseline);
    if (event.target === $("admin-users-modal")) $("admin-users-modal").classList.add("hidden");
});
window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        const target = event.target;
        const editing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
        const modalOpen = [...document.querySelectorAll(".modal")].some((modal) => !modal.classList.contains("hidden"));
        if (!editing && !modalOpen) {
            event.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
        return;
    }
    if (event.key === "Escape") {
        closeFormIfConfirmed(formModal, docForm, docFormBaseline); closeReadModal(); closeFormIfConfirmed(timelineFormModal, timelineForm, timelineFormBaseline); $("admin-users-modal").classList.add("hidden");
        return;
    }
    if (event.key !== "Tab" || readModal.classList.contains("hidden")) return;
    const focusable = [...readModal.querySelectorAll('button:not([disabled]):not(.hidden), a[href], input:not([disabled]):not(.hidden), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !readModal.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !readModal.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
    }
});

timelineScroll.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.target.closest("button, a, input, select, textarea")) return;
    timelineDragTarget = event.target.closest(".timeline-line-scroll") || timelineScroll;
    dragStartX = event.pageX;
    startScrollLeft = timelineDragTarget.scrollLeft;
    isDragging = false;
});
window.addEventListener("mousemove", (event) => {
    if (!timelineDragTarget) return;
    const distance = event.pageX - dragStartX;
    if (Math.abs(distance) > 4) {
        isDragging = true;
        timelineDragTarget.classList.add("dragging");
        event.preventDefault();
        timelineDragTarget.scrollLeft = startScrollLeft - distance;
    }
});
window.addEventListener("mouseup", () => {
    if (!timelineDragTarget) return;
    timelineDragTarget.classList.remove("dragging");
    if (isDragging) {
        suppressTimelineClick = true;
        window.setTimeout(() => { suppressTimelineClick = false; }, 50);
    }
    timelineDragTarget = null;
    isDragging = false;
});
timelineScroll.addEventListener("click", (event) => {
    if (!suppressTimelineClick || !event.target.closest(".timeline-entry-open, .timeline-edit")) return;
    event.preventDefault(); event.stopImmediatePropagation();
}, true);

function itemOrExistingPublishedAt(id) { return items.find((item) => item.id === id)?.publishedAt || new Date().toISOString(); }

if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
        window.setTimeout(async () => {
            if (event === "SIGNED_OUT" && !session && currentUser) {
                unsubscribeItems?.(); unsubscribeItems = null;
                items = []; firebaseSessionUserId = null; firebaseSessionRole = null;
                await firebaseSignOut(firebaseAuth);
                setAuthenticatedUi(null);
                setStatus("Votre session a été fermée. Connectez-vous pour accéder au tableau.");
                return;
            }
            if (!["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event) || !session || session.user.id === currentUser?.id) return;
            try {
                setAuthenticatedUi(session.user, await authGateway.loadProfile(session.user));
                await startFirestoreSession(session);
            } catch (error) {
                console.error("Changement de session impossible.");
                await signOutCurrentUser("La session a changé mais n’a pas pu être restaurée. Reconnectez-vous.");
            }
        }, 0);
    });
}

initialiseAuthentication();
