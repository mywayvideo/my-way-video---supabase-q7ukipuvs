-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

-- Create B-Tree indexes for high-traffic columns to optimize read/write performance
CREATE INDEX IF NOT EXISTS idx_product_search_cache_expires_at ON public.product_search_cache USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_product_search_cache_search_query ON public.product_search_cache USING btree (search_query);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages USING btree (session_id);

-- Setup automated cache maintenance cron job
DO $$
BEGIN
  -- Unschedule existing job if it exists to ensure idempotency
  BEGIN
    PERFORM cron.unschedule('cleanup-product-cache');
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
  
  -- Schedule the job to run every 6 hours
  PERFORM cron.schedule(
    'cleanup-product-cache',
    '0 */6 * * *',
    'DELETE FROM public.product_search_cache WHERE expires_at < NOW();'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Failed to configure cron job: %', SQLERRM;
END $$;

-- Adjust Realtime Publication to reduce write-amplification
DO $$
BEGIN
  -- Only attempt to modify the publication if it exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    
    -- Attempt to remove product_search_cache from realtime publication
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.product_search_cache;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Table public.product_search_cache is not in publication supabase_realtime or drop failed: %', SQLERRM;
    END;

    -- Attempt to remove chat_messages from realtime publication
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_messages;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Table public.chat_messages is not in publication supabase_realtime or drop failed: %', SQLERRM;
    END;
    
  END IF;
END $$;
