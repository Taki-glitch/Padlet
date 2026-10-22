export function personalPreferencesStorageKey(userId) {
    return userId ? `padlet-personal-preferences:v1:${userId}` : "";
}

export function readPersonalPreferences(userId, defaults, validateAnchor, { storage, now = new Date(), fallbackAnchor = now.toISOString().slice(0, 10) } = {}) {
    const key = personalPreferencesStorageKey(userId);
    let raw = "{}";
    try {
        raw = key ? storage.getItem(key) || "{}" : "{}";
    } catch {
        return { preferences: { ...defaults, timelineAnchor: fallbackAnchor }, storageAvailable: false };
    }
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { /* Malformed preferences fall back to safe defaults. */ }
    const stored = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    const anchor = validateAnchor(stored.timelineAnchor);
    return {
        preferences: {
            theme: ["system", "light", "dark"].includes(stored.theme) ? stored.theme : defaults.theme,
            accent: ["indigo", "blue", "teal", "rose"].includes(stored.accent) ? stored.accent : defaults.accent,
            timelineView: ["month", "year"].includes(stored.timelineView) ? stored.timelineView : defaults.timelineView,
            timelineAnchor: anchor || fallbackAnchor
        },
        storageAvailable: true
    };
}

export function writePersonalPreferences(userId, preferences, storage) {
    const key = personalPreferencesStorageKey(userId);
    if (!key) return false;
    try { storage.setItem(key, JSON.stringify(preferences)); return true; }
    catch { return false; }
}
