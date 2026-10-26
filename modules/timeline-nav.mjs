// Navigation dans la frise : calculs purs (les éléments sont déjà triés par date et placés un par colonne).
// `dates` = dates AAAA-MM-JJ triées croissantes, `starts` = index du premier élément de chaque regroupement.
export function indexForDate(dates, target) {
    if (!dates.length) return -1;
    const index = dates.findIndex((date) => date >= target);
    return index < 0 ? dates.length - 1 : index;
}

export const centerScroll = (index, column, viewport) => Math.max(0, index * column - viewport / 2 + column / 2);

export function currentIndex(scrollLeft, column, viewport, count) {
    if (!count) return -1;
    const index = Math.round((scrollLeft + viewport / 2 - column / 2) / column);
    return Math.min(count - 1, Math.max(0, index));
}

// Regroupement suivant (direction 1) ou précédent (-1) ; null s'il n'y en a pas.
export function adjacentGroupStart(starts, index, direction) {
    if (direction > 0) return starts.find((start) => start > index) ?? null;
    for (let i = starts.length - 1; i >= 0; i -= 1) if (starts[i] < index) return starts[i];
    return null;
}

// Sans regroupement : saut d'environ 80 % de l'écran.
export const pageStep = (column, viewport) => Math.max(1, Math.floor((viewport * 0.8) / column));

// Cible d'un déplacement « précédent » / « suivant » : début de regroupement si disponible, sinon une page ; toujours dans [0, count-1].
export function stepTarget({ starts, index, direction, column, viewport, count }) {
    if (!count) return -1;
    const group = starts.length ? adjacentGroupStart(starts, index, direction) : null;
    const target = group ?? index + direction * pageStep(column, viewport);
    return Math.min(count - 1, Math.max(0, target));
}
