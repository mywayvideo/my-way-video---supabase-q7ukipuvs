import { describe, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ymlkyspcznrrmlktudxx.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

describe('Diagnóstico Real da Base - SKU Sony e Outras Marcas (Dry-Run)', () => {
  it('executes dry-run analysis against live products table', async () => {
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Logar como operador admin para garantir leitura irrestrita
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'qa.operator@mywayvideo.com',
      password: 'Skip@Pass123!',
    })
    if (authError) {
      console.warn('Auth fallback (using anon):', authError.message)
    } else {
      console.log('Authenticated successfully for dry-run analysis.')
    }

    // 1. Carregar fabricantes
    const { data: mfrs, error: mfrError } = await supabase
      .from('manufacturers')
      .select('id, name')

    if (mfrError) {
      console.error('Mfr error:', mfrError)
    }

    const mfrMap = new Map<string, string>()
    ;(mfrs || []).forEach((m) => mfrMap.set(m.id, m.name))

    // 2. Buscar todos os produtos (com paginação se passar de 1000)
    let allProducts: any[] = []
    let page = 0
    const pageSize = 1000
    while (true) {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, manufacturer_id, price_usd, is_discontinued, created_at, updated_at, last_reviewed_at')
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) {
        console.error('Products error:', error)
        break
      }
      if (!data || data.length === 0) break
      allProducts.push(...data)
      if (data.length < pageSize) break
      page++
    }

    console.log(`\n========================================`)
    console.log(`TOTAL DE PRODUTOS CARREGADOS: ${allProducts.length}`)
    console.log(`========================================\n`)

    const normalizeSku = (sku: string | null | undefined): string => {
      if (!sku) return ''
      return String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '').trim()
    }

    // Encontrar ID do fabricante Sony
    let sonyMfrId: string | null = null
    for (const [id, name] of mfrMap.entries()) {
      if (name.toLowerCase().trim() === 'sony') {
        sonyMfrId = id
        break
      }
    }
    console.log(`Fabricante Sony ID: ${sonyMfrId} (Nome: Sony)`)

    const sonyProducts: any[] = []
    const otherProducts: any[] = []

    for (const p of allProducts) {
      const mfrName = (p.manufacturer_id ? mfrMap.get(p.manufacturer_id) : '') || ''
      const isSony = (sonyMfrId && p.manufacturer_id === sonyMfrId) || mfrName.toLowerCase().trim() === 'sony'
      if (isSony) {
        sonyProducts.push({ ...p, mfrName: 'Sony' })
      } else {
        sonyProducts.push({ ...p, mfrName: mfrName || 'Sem Fabricante' })
      }
    }

    console.log(`Total Sony: ${sonyProducts.length}`)
    console.log(`Total Outras Marcas: ${otherProducts.length}`)

    // Análise Sony:
    // - Com traço ("-")
    // - Sem traço
    // - Sem SKU
    // - Fica idêntico após normalização
    let sonyWithDash = 0
    let sonyWithoutDash = 0
    let sonyNoSku = 0
    let sonyIdenticalAfterNorm = 0
    const sonySampleWithDash: any[] = []
    const sonySampleWithoutDash: any[] = []

    for (const p of sonyProducts) {
      const sku = p.sku ? String(p.sku).trim() : ''
      if (!sku) {
        sonyNoSku++
        continue
      }
      const hasDash = sku.includes('-')
      if (hasDash) {
        sonyWithDash++
        if (sonySampleWithDash.length < 10) sonySampleWithDash.push({ sku, name: p.name, id: p.id })
      } else {
        sonyWithoutDash++
        if (sonySampleWithoutDash.length < 10) sonySampleWithoutDash.push({ sku, name: p.name, id: p.id })
      }

      const normalized = normalizeSku(sku)
      if (sku === normalized) {
        sonyIdenticalAfterNorm++
      }
    }

    console.log(`\n--- ESTATÍSTICAS SONY ---`)
    console.log(`Total Sony: ${sonyProducts.length}`)
    console.log(`Sony COM traço (-): ${sonyWithDash}`)
    console.log(`Sony SEM traço: ${sonyWithoutDash}`)
    console.log(`Sony SEM SKU: ${sonyNoSku}`)
    console.log(`Sony com SKU idêntico após normalização: ${sonyIdenticalAfterNorm}`)
    console.log(`Amostras Sony COM traço:`, sonySampleWithDash)
    console.log(`Amostras Sony SEM traço:`, sonySampleWithoutDash)

    // Análise Outras Marcas:
    let otherWithDash = 0
    let otherWithoutDash = 0
    let otherNoSku = 0
    for (const p of otherProducts) {
      const sku = p.sku ? String(p.sku).trim() : ''
      if (!sku) {
        otherNoSku++
        continue
      }
      if (sku.includes('-')) {
        otherWithDash++
      } else {
        otherWithoutDash++
      }
    }
    console.log(`\n--- ESTATÍSTICAS OUTRAS MARCAS ---`)
    console.log(`Total Outras Marcas: ${otherProducts.length}`)
    console.log(`Outras marcas COM traço (-): ${otherWithDash}`)
    console.log(`Outras marcas SEM traço: ${otherWithoutDash}`)
    console.log(`Outras marcas SEM SKU: ${otherNoSku}`)

    // 2. Detecção de COLISÕES
    // Dentro da Sony:
    const sonyByNormSku = new Map<string, any[]>()
    for (const p of sonyProducts) {
      const norm = normalizeSku(p.sku)
      if (!norm) continue
      if (!sonyByNormSku.has(norm)) {
        sonyByNormSku.set(norm, [])
      }
      sonyByNormSku.get(norm)!.push(p)
    }

    const sonyCollisions: { normSku: string; products: any[] }[] = []
    for (const [normSku, list] of sonyByNormSku.entries()) {
      if (list.length > 1) {
        sonyCollisions.push({ normSku, products: list })
      }
    }

    console.log(`\n========================================`)
    console.log(`COLISÕES DENTRO DA SONY: ${sonyCollisions.length} grupos`)
    console.log(`========================================`)
    sonyCollisions.forEach((c, idx) => {
      console.log(`\n[Sony Colisão #${idx + 1}] SKU Normalizado: "${c.normSku}" - ${c.products.length} cadastros:`)
      c.products.forEach((p) => {
        console.log(`  - ID: ${p.id} | SKU Original: "${p.sku}" | Preço: $${p.price_usd} | Descontinuado: ${p.is_discontinued} | Criado: ${p.created_at} | Atualizado: ${p.updated_at} | Nome: "${p.name}"`)
      })
    })

    // Colisões entre outras marcas / geral:
    // Agrupamento por (marca, normSku) e também global por normSku
    const allByNormSku = new Map<string, any[]>()
    for (const p of allProducts) {
      const norm = normalizeSku(p.sku)
      if (!norm) continue
      if (!allByNormSku.has(norm)) {
        allByNormSku.set(norm, [])
      }
      allByNormSku.get(norm)!.push(p)
    }

    const otherCollisionsSameBrand: { brand: string; normSku: string; products: any[] }[] = []
    const crossBrandCollisions: { normSku: string; brands: string[]; products: any[] }[] = []

    for (const [normSku, list] of allByNormSku.entries()) {
      if (list.length > 1) {
        // Verificar marcas
        const brands = new Set<string>()
        list.forEach((p) => {
          const b = (p.manufacturer_id ? mfrMap.get(p.manufacturer_id) : '') || 'Desconhecido'
          brands.add(b)
        })

        if (brands.size === 1) {
          const brandName = Array.from(brands)[0]
          if (brandName.toLowerCase() !== 'sony') {
            otherCollisionsSameBrand.push({ brand: brandName, normSku, products: list })
          }
        } else {
          crossBrandCollisions.push({ normSku, brands: Array.from(brands), products: list })
        }
      }
    }

    console.log(`\n========================================`)
    console.log(`COLISÕES MESMA MARCA (NÃO SONY): ${otherCollisionsSameBrand.length} grupos`)
    console.log(`========================================`)
    otherCollisionsSameBrand.forEach((c, idx) => {
      console.log(`\n[Outra Marca Colisão #${idx + 1}] Marca: ${c.brand} | SKU Normalizado: "${c.normSku}":`)
      c.products.forEach((p) => {
        console.log(`  - ID: ${p.id} | SKU Original: "${p.sku}" | Preço: $${p.price_usd} | Descontinuado: ${p.is_discontinued} | Nome: "${p.name}"`)
      })
    })

    console.log(`\n========================================`)
    console.log(`COLISÕES ENTRE MARCAS DIFERENTES (CROSS-BRAND): ${crossBrandCollisions.length} grupos`)
    console.log(`========================================`)
    crossBrandCollisions.forEach((c, idx) => {
      console.log(`\n[Cross-Brand Colisão #${idx + 1}] Marcas: [${c.brands.join(', ')}] | SKU Normalizado: "${c.normSku}":`)
      c.products.forEach((p) => {
        const b = (p.manufacturer_id ? mfrMap.get(p.manufacturer_id) : '') || 'Desconhecido'
        console.log(`  - [${b}] ID: ${p.id} | SKU Original: "${p.sku}" | Preço: $${p.price_usd} | Nome: "${p.name}"`)
      })
    })
  }, 120000)
})
