const RESTORABLE_METADATA_FIELDS = [
    "type", "title", "date", "publishedAt", "theme", "tags", "summary", "content",
    "retentionMonths", "expiresAt", "color", "description", "timelineDate", "timelineTitle",
    "timelineContent", "timelineColor", "fileName", "fileType", "fileSize", "filePath", "fileUrl"
];

export function buildMetadataExportPayload(documents, generatedAt = new Date()) {
    const safeDocuments = documents.map((item) => {
        const record = { id: item.id };
        RESTORABLE_METADATA_FIELDS.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(item, field)) record[field] = item[field];
        });
        return record;
    });
    return { format: "padlet-document-metadata", version: 2, generatedAt: generatedAt.toISOString(), documentCount: safeDocuments.length, documents: safeDocuments };
}
