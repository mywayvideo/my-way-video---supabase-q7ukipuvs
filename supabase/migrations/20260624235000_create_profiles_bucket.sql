DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('profiles', 'profiles', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
END $$;

DROP POLICY IF EXISTS "Public View Profiles" ON storage.objects;
CREATE POLICY "Public View Profiles"
ON storage.objects FOR SELECT
USING (bucket_id = 'profiles');

DROP POLICY IF EXISTS "Users can upload their own profile photo" ON storage.objects;
CREATE POLICY "Users can upload their own profile photo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'profiles' AND
    (string_to_array(name, '/'))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own profile photo" ON storage.objects;
CREATE POLICY "Users can update their own profile photo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'profiles' AND
    (string_to_array(name, '/'))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own profile photo" ON storage.objects;
CREATE POLICY "Users can delete their own profile photo"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'profiles' AND
    (string_to_array(name, '/'))[1] = auth.uid()::text
);
