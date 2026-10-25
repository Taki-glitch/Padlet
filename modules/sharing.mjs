// Partage document par document : le champ booléen `shared` décide si les utilisateurs ordinaires voient la fiche.
// Fiche sans champ `shared` = ancienne fiche, visible aujourd'hui par tous : traitée comme partagée jusqu'à la « préparation du partage »
// (migration) qui écrit le champ partout. Les fiches en corbeille ne sont jamais partagées (jamais envoyées aux utilisateurs).
export const isShared = (item) => item?.shared === true;
export const effectivelyShared = (item) => item?.shared !== false;   // sert à préremplir la case du formulaire (anciennes fiches : cochée)

// Mise à la corbeille : la fiche devient non partagée ; l'ancien état est gardé pour la restauration.
export function trashChanges(item) {
    return { set: { shared: false, sharedBeforeTrash: effectivelyShared(item) } };
}
// Restauration : l'ancien état de partage est rétabli (inconnu → non partagée, par prudence).
export function restoreChanges(item) {
    return { set: { shared: item?.sharedBeforeTrash === true } };
}

// Plan de la préparation : écrit `shared` sur toutes les fiches qui n'ont pas le champ, sans changer ce que les utilisateurs voient
// aujourd'hui (fiches actives → partagées), et rend non partagées les fiches en corbeille.
export function sharingMigrationPlan(active = [], trashed = []) {
    const writes = [];
    for (const item of active) if (typeof item.shared !== "boolean") writes.push({ id: item.id, patch: { shared: true } });
    for (const item of trashed) if (item.shared !== false) writes.push({ id: item.id, patch: { shared: false, sharedBeforeTrash: typeof item.sharedBeforeTrash === "boolean" ? item.sharedBeforeTrash : true } });
    return {
        writes,
        counts: {
            share: writes.filter((w) => w.patch.shared === true).length,
            hideTrash: writes.filter((w) => w.patch.shared === false).length,
            alreadyShared: active.filter((item) => item.shared === true).length,
            alreadyPrivate: active.filter((item) => item.shared === false).length
        }
    };
}

// Interrupteur de déploiement : tant qu'il vaut false, les utilisateurs ordinaires continuent de voir toutes les fiches (comportement
// d'avant). Passer à true APRÈS la préparation du partage (docs/PARTAGE.md, étape 4) : ils ne demandent alors que les fiches partagées.
export const SHARING_ENFORCED = false;
