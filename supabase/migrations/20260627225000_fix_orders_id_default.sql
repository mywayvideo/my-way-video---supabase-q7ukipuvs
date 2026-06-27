-- Fix: null value in column "id" of relation "orders" violates not-null constraint
-- Add default UUID generation for orders and order_items tables

ALTER TABLE public.orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.order_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
