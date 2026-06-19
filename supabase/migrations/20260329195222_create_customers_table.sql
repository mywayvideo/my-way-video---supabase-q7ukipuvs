CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customers_user_id_key UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own customer data" ON public.customers;
CREATE POLICY "Users can read own customer data" ON public.customers
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own customer data" ON public.customers;
CREATE POLICY "Users can update own customer data" ON public.customers
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own customer data" ON public.customers;
CREATE POLICY "Users can insert own customer data" ON public.customers
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.customers (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_customer ON auth.users;
CREATE TRIGGER on_auth_user_created_customer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_customer();

-- Migrate existing users to customers table to avoid empty states
INSERT INTO public.customers (user_id, full_name)
SELECT id, raw_user_meta_data->>'name' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
