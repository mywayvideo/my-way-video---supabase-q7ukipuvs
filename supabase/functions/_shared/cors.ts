const ALLOWED_ORIGINS = [
  'https://my-way-video-ia-copy-191cd--preview.goskip.app',
  'https://my-way-video.goskip.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
  }
}
