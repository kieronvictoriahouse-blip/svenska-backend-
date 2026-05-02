-- Bucket svenska-media (public) pour les uploads d'images
INSERT INTO storage.buckets (id, name, public)
VALUES ('svenska-media', 'svenska-media', true)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique (pas d'auth requise pour afficher les images)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read media'
  ) THEN
    CREATE POLICY "Public read media"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'svenska-media');
  END IF;
END $$;

-- Upload réservé aux utilisateurs authentifiés
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Auth upload media'
  ) THEN
    CREATE POLICY "Auth upload media"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'svenska-media' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- Suppression réservée aux utilisateurs authentifiés
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Auth delete media'
  ) THEN
    CREATE POLICY "Auth delete media"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'svenska-media' AND auth.role() = 'authenticated');
  END IF;
END $$;
