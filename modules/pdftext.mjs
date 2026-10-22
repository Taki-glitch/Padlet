// Extraction du texte des PDF dans le navigateur (pdf.js chargé à la demande) et extraits de recherche.
export const PDF_TEXT_MAX_CHARS = 20000, PDF_TEXT_MAX_PAGES = 60;
export const normalizeForSearch = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");

// loadPdfjs() renvoie la bibliothèque pdf.js (injectée : testable sans navigateur).
export async function extractPdfText(bytes, loadPdfjs, { maxPages = PDF_TEXT_MAX_PAGES, maxChars = PDF_TEXT_MAX_CHARS } = {}) {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    let text = "", truncated = pdf.numPages > maxPages;
    try {
        for (let number = 1; number <= Math.min(pdf.numPages, maxPages); number++) {
            const content = await (await pdf.getPage(number)).getTextContent();
            text += `${content.items.map((item) => item.str ?? "").join(" ")}\n`;
            if (text.length >= maxChars) { truncated = true; break; }
        }
    } finally { await pdf.destroy?.(); }
    text = text.replace(/\s+/g, " ").trim().slice(0, maxChars);
    return { text, status: text ? "ok" : "empty", truncated, pages: pdf.numPages };   // « empty » : PDF scanné (image), pas d'OCR
}

export function buildSnippet(text, terms, radius = 60) {
    const source = String(text || ""), folded = normalizeForSearch(source);
    if (!terms.length || folded.length !== source.length) return "";
    let at = -1;
    for (const term of terms) { const index = folded.indexOf(term); if (index !== -1 && (at === -1 || index < at)) at = index; }
    if (at === -1) return "";
    const start = Math.max(0, at - radius), end = Math.min(source.length, at + radius);
    return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}
