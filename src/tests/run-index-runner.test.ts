import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || ''

describe('Index NCM Embeddings runner', () => {
  it('calls index-ncm-embeddings to test connection', async () => {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await supabase.functions.invoke('index-ncm-embeddings', {
      body: { action: 'stats' }
    })
    console.log('STATS RESULT:', { data, error })
    expect(error).toBeNull()
  }, 30000)
})
