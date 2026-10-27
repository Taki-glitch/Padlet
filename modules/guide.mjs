// Guide de première utilisation : contenu selon le rôle (les fonctions réservées aux administrateurs ne sont pas décrites aux autres).
const COMMON = [
    ["Retrouver un document", "Utilisez la barre de recherche (titre, résumé, tags, texte des PDF). Les filtres et le tri affinent la liste ; « Recherches enregistrées » garde vos combinaisons favorites."],
    ["Thèmes et tags", "Les thèmes rangent les documents par grands sujets ; les tags sont des mots-clés transversaux. Cliquez sur un tag pour filtrer."],
    ["La frise chronologique", "L’onglet « Frise » place les documents et les échéances dans le temps. Cliquez sur un élément pour l’ouvrir."],
    ["Les échéances", "Le « Tableau de bord » montre les échéances à venir et dépassées. Paramètres → « Exporter les échéances (.ics) » les envoie vers votre agenda."],
    ["Favoris", "L’étoile d’une fiche l’ajoute à vos favoris, sur cet appareil."],
    ["Raccourcis clavier", "« / » ouvre la recherche, « ? » ce guide, « 1 », « 2 », « 3 » changent de vue (Documents, Frise, Tableau de bord)."]
];
const ADMIN = [
    ["Ajouter un document et choisir de le partager", "« + Ajouter » : la case « Visible par les utilisateurs » décide si les utilisateurs ordinaires voient la fiche. Décochée par défaut."],
    ["Actions groupées", "« Sélectionner » permet de partager, de changer le thème, d’ajouter un tag ou de mettre à la corbeille plusieurs documents d’un coup."]
];
export function guideSteps(role) {
    return role === "admin" ? [...COMMON, ...ADMIN] : COMMON;
}
export const guideSeenKey = (userId) => (userId ? `padlet-guide-seen:${userId}` : "");
