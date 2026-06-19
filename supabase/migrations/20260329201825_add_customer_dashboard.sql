DO $$
BEGIN
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone TEXT;
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS date_of_birth DATE;
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS gender TEXT;
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_name TEXT;
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
  ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS cpf TEXT;
END $$;

CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    address_type TEXT NOT NULL CHECK (address_type IN ('shipping', 'billing')),
    street TEXT NOT NULL,
    number TEXT NOT NULL,
    complement TEXT,
    neighborhood TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'Brasil',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own addresses" ON public.customer_addresses;
CREATE POLICY "Users can view own addresses" ON public.customer_addresses FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own addresses" ON public.customer_addresses;
CREATE POLICY "Users can insert own addresses" ON public.customer_addresses FOR INSERT TO authenticated WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own addresses" ON public.customer_addresses;
CREATE POLICY "Users can update own addresses" ON public.customer_addresses FOR UPDATE TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())) WITH CHECK (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own addresses" ON public.customer_addresses;
CREATE POLICY "Users can delete own addresses" ON public.customer_addresses FOR DELETE TO authenticated USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

INSERT INTO storage.buckets (id, name, public) VALUES ('profiles', 'profiles', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON storage.objects;
CREATE POLICY "Public profiles are viewable by everyone" ON storage.objects FOR SELECT USING (bucket_id = 'profiles');

DROP POLICY IF EXISTS "Users can upload their own profile photo" ON storage.objects;
CREATE POLICY "Users can upload their own profile photo" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profiles');

DROP POLICY IF EXISTS "Users can update their own profile photo" ON storage.objects;
CREATE POLICY "Users can update their own profile photo" ON storage.objects FOR UPDATE USING (bucket_id = 'profiles');

DROP POLICY IF EXISTS "Users can delete their own profile photo" ON storage.objects;
CREATE POLICY "Users can delete their own profile photo" ON storage.objects FOR DELETE USING (bucket_id = 'profiles');
