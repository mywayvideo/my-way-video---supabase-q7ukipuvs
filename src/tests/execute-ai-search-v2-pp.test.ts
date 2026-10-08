import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as ts from 'typescript'

describe('execute_ai_search_v2_pp Edge Function checks', () => {
  const code = fs.readFileSync('supabase/functions/execute_ai_search_v2_pp/index.ts', 'utf-8')

  it('parses execute_ai_search_v2_pp/index.ts with zero syntax diagnostics', () => {
    const sourceFile = ts.createSourceFile(
      'index.ts',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    // @ts-expect-error
    const parseDiagnostics = sourceFile.parseDiagnostics || []
    expect(parseDiagnostics.length).toBe(0)
  })

  it('includes generic anti-refusal rule in product page prompt instructions', () => {
    expect(code).toContain('0. REGRA PRIORITARIA ANTI-RECUSA:')
    expect(code).toContain('Na pagina de produto, toda pergunta relacionada ao produto atual')
    expect(code).toContain('E proibido usar qualquer mensagem de recusa de escopo nesta pagina')
    expect(code).toContain('Se um dado especifico nao estiver no contexto, responda com o que souber sobre o equipamento e informe que um especialista confirmara a informacao complementar.')
  })

  it('disarms blocking keywords when intent === PRODUCT_SPECIFIC', () => {
    expect(code).toMatch(/keywords\?\.some\(\(k\)\s*=>\s*k\.is_blocking\)\s*&&\s*intent\s*!==\s*'PRODUCT_SPECIFIC'/)
  })

  it('maps is_discontinued in productContext and sets discontinued instructions without mentioning stock', () => {
    expect(code).toContain('is_discontinued?: boolean | null')
    expect(code).toContain('productContext.is_discontinued === true')
    expect(code).toContain('STATUS DO PRODUTO: FORA DE LINHA (DESCONTINUADO)')
    expect(code).toContain('A empresa nao trabalha com controle de estoque, portanto NUNCA fale em estoque')
  })
})
