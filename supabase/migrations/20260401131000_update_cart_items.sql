-- Add user_id column
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop NOT NULL constraint on cart_id to support direct user carts
ALTER TABLE public.cart_items ALTER COLUMN cart_id DROP NOT NULL;

-- Recreate constraint for quantity limits
ALTER TABLE public.cart_items DROP CONSTRAINT IF EXISTS cart_items_quantity_check;
ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_quantity_check CHECK (quantity >= 1 AND quantity <= 50);

-- Enable RLS
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for auth users
DROP POLICY IF EXISTS "cart_items_select_user" ON public.cart_items;
CREATE POLICY "cart_items_select_user" ON public.cart_items FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cart_items_insert_user" ON public.cart_items;
CREATE POLICY "cart_items_insert_user" ON public.cart_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cart_items_update_user" ON public.cart_items;
CREATE POLICY "cart_items_update_user" ON public.cart_items FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cart_items_delete_user" ON public.cart_items;
CREATE POLICY "cart_items_delete_user" ON public.cart_items FOR DELETE TO authenticated USING (auth.uid() = user_id);
