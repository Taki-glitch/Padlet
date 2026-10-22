// Liens cliquables sûrs : seules les URL http(s) sont reconnues ; le texte n'est jamais interprété comme du HTML.
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

export function linkSegments(text) {
    const source = String(text ?? ""), segments = []; let last = 0;
    for (const match of source.matchAll(URL_PATTERN)) {
        let url = match[0];
        while (/[.,;:!?)\]]$/.test(url) && !(url.endsWith(")") && url.includes("("))) url = url.slice(0, -1);
        try { if (!["http:", "https:"].includes(new URL(url).protocol)) continue; } catch { continue; }
        if (match.index > last) segments.push({ text: source.slice(last, match.index) });
        segments.push({ href: url, text: url });
        last = match.index + url.length;
    }
    if (last < source.length) segments.push({ text: source.slice(last) });
    return segments;
}

export const isLongText = (text, maxChars = 280, maxLines = 6) => String(text ?? "").length > maxChars || String(text ?? "").split("\n").length > maxLines;
