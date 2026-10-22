// Corbeille : suppression douce. Un document est « en corbeille » s'il possède un champ deletedAt (ISO 8601).
// Les anciennes fiches, sans ce champ, restent actives.
export const TRASH_RETENTION_DAYS = 30;
export const isTrashed = (item) => Boolean(item?.deletedAt);

export function splitTrash(all) {
    const active = [], trashed = [];
    for (const item of all) (isTrashed(item) ? trashed : active).push(item);
    return { active, trashed };
}

// Jours restants avant la suppression définitive autorisée (≤ 0 : délai écoulé). null si la date est illisible.
export function trashDaysLeft(item, now = new Date(), days = TRASH_RETENTION_DAYS) {
    const deleted = Date.parse(item?.deletedAt);
    if (Number.isNaN(deleted)) return null;
    return days - Math.floor((now.getTime() - deleted) / 86400000);
}
