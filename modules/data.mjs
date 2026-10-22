export class PartialDocumentDeletionError extends Error {
    constructor(itemId, cause) {
        super("Le fichier a été supprimé, mais la fiche Firestore est encore présente. Réessayez la suppression pour retirer la fiche; le fichier supprimé ne peut pas être restauré depuis l’application.", { cause });
        this.name = "PartialDocumentDeletionError";
        this.itemId = itemId;
        this.fileAlreadyDeleted = true;
    }
}

export async function deleteDocumentAndFile(item, { removeFile, deleteMetadata }) {
    let fileRemoved = false;
    if (item.filePath) {
        fileRemoved = await removeFile(item.filePath) !== false;
    }
    try {
        await deleteMetadata();
    } catch (error) {
        if (fileRemoved) throw new PartialDocumentDeletionError(item.id, error);
        throw error;
    }
}
