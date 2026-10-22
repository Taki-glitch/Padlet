-- Limite de taille par fichier appliquée par le service de stockage (50 Mio), en plus du contrôle du navigateur.
-- Retour arrière : update storage.buckets set file_size_limit = null where id = 'documents';
update storage.buckets set file_size_limit = 52428800 where id = 'documents';
