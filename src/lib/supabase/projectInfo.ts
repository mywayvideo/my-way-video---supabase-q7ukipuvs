// Info do projeto Supabase usado pelo client, para diagnóstico em console.
// Sem fallback silencioso: reflete exatamente o que o client usa.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

/** URL do projeto Supabase em uso pelo client (ex.: https://xxxx.supabase.co). */
export const supabaseProjectUrl = SUPABASE_URL || null

/** Ref do projeto (subdomínio de *.supabase.co), ou null quando não configurado. */
export const supabaseProjectRef = (() => {
  if (!SUPABASE_URL) return null
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0] || null
  } catch {
    return null
  }
})()

// Em desenvolvimento apenas: deixa explícito no console qual projeto o build usa.
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    `[Supabase] projeto em uso: ${supabaseProjectUrl ?? '(VITE_SUPABASE_URL não configurada!)'}`,
  )
}
