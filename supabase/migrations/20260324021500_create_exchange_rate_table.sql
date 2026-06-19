-- create table exchange_rate
CREATE TABLE IF NOT EXISTS public.exchange_rate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usd_to_brl NUMERIC(10,4) NOT NULL,
    spread_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.2,
    spread_type TEXT NOT NULL DEFAULT 'percentage',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- create index
CREATE INDEX IF NOT EXISTS idx_exchange_rate_last_updated ON public.exchange_rate (last_updated DESC);

-- insert initial row
INSERT INTO public.exchange_rate (usd_to_brl, spread_percentage, spread_type, last_updated)
SELECT 5.2305, 0.2, 'fixed', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.exchange_rate);

-- enable RLS
ALTER TABLE public.exchange_rate ENABLE ROW LEVEL SECURITY;

-- drop existing policies if they exist for idempotency
DROP POLICY IF EXISTS "exchange_rate_select_all" ON public.exchange_rate;
DROP POLICY IF EXISTS "exchange_rate_insert_admin" ON public.exchange_rate;
DROP POLICY IF EXISTS "exchange_rate_update_admin" ON public.exchange_rate;

-- Policy 1: Allow all users to read
CREATE POLICY "exchange_rate_select_all"
    ON public.exchange_rate FOR SELECT
    USING (true);

-- Policy 2: Allow only admin users to insert
CREATE POLICY "exchange_rate_insert_admin"
    ON public.exchange_rate FOR INSERT
    TO authenticated
    WITH CHECK (
        ((auth.jwt() ->> 'role'::text) = 'admin'::text) OR
        (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text) OR
        (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
    );

-- Policy 3: Allow only admin users to update
CREATE POLICY "exchange_rate_update_admin"
    ON public.exchange_rate FOR UPDATE
    TO authenticated
    USING (
        ((auth.jwt() ->> 'role'::text) = 'admin'::text) OR
        (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text) OR
        (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
    )
    WITH CHECK (
        ((auth.jwt() ->> 'role'::text) = 'admin'::text) OR
        (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text) OR
        (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
    );

-- Delete is implicitly denied (no policy provided)
