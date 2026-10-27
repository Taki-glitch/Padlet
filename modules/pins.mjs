// Fiches épinglées en haut de la liste (champ booléen `pinned`, réservé aux administrateurs). Tri stable : l'ordre choisi est conservé dans chaque groupe.
export const isPinned = (item) => item?.pinned === true;
export function withPinnedFirst(sorted) {
    return [...sorted.filter(isPinned), ...sorted.filter((item) => !isPinned(item))];
}
