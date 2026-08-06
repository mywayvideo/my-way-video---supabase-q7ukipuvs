import { getProxiedImageUrl, proxyMarkdownImages, normalizeImageUrl } from '@/lib/image-proxy'
import {
  sanitizeHeadings,
  deduplicateAndLimitImages,
  enforceLayoutOrder,
} from '@/utils/image-layout'
import {
  escapeRegex,
  sanitizeEmptyHeadings,
  separateImagesFromHeadings,
  cleanHtmlImages,
  cleanBrokenMarkdownImages,
  fixMissingImageBangs,
  extractExistingImageUrls,
} from '@/utils/markdown-sanitizer'
import { extractModelCode, removeOrphanBoldMarkers } from '@/utils/markdown-cleanup'
import { debugLog, debugGroup, debugGroupEnd, safeLen } from '@/utils/debug-front'

export interface ProductImageInfo {
  name: string
  image_url?: string | null
  id?: string
}

export function normalizeProductName(name: string): string {
  const normalized = name.replace(/(\s*\([^)]*\))+\s*$/i, '').trim()
  if (normalized !== name) {
    debugLog('normalizeProductName', `"${name}" → "${normalized}"`)
  }
  return normalized
}

function hasColorVariants(product: ProductImageInfo, allProducts: ProductImageInfo[]): boolean {
  if (!product.name) return false
  const normalized = normalizeProductName(product.name)
  if (normalized === product.name) return false
  return allProducts.some(
    (p) =>
      p.id !== product.id &&
      p.name &&
      normalizeProductName(p.name) === normalized &&
      p.name !== normalized,
  )
}

function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    if (!parsed.hostname) return false
    return true
  } catch {
    return false
  }
}

function buildSearchRegex(term: string): RegExp {
  const escaped = escapeRegex(term)
  const lastChar = term[term.length - 1]
  if (/[a-zA-Z0-9_]/.test(lastChar)) {
    return new RegExp(`\\b${escaped}\\b`, 'i')
  }
  return new RegExp(`\\b${escaped}`, 'i')
}

const HEADING_RE = /^#{1,6}\s+/
const IMG_TEST = /!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/
const IMG_URL_RE = /!\[[^\]]*\]\(([^)]+)\)/
const IMG_ALT_RE = /^!\[([^\]]*)\]/
const BOLD_TITLE_RE = /^\*\*[^*]+\*\*$/

function isTitleLine(trimmed: string): boolean {
  return HEADING_RE.test(trimmed) || BOLD_TITLE_RE.test(trimmed)
}

function scanExistingProductImages(
  content: string,
  products: ProductImageInfo[],
  existingUrls: Set<string>,
): Set<string> {
  const lines = content.split('\n')
  const illustratedIds = new Set<string>()

  for (const product of products) {
    if (!product?.id || !product?.name) continue
    const displayName = normalizeProductName(product.name) || product.name
    if (displayName.length < 3) continue

    const hasVariants = hasColorVariants(product, products)
    const searchTerms: string[] = [product.name]
    if (!hasVariants && displayName !== product.name) searchTerms.push(displayName)
    const modelCode = extractModelCode(product.name)
    if (!hasVariants && modelCode && modelCode.toLowerCase() !== displayName.toLowerCase()) {
      searchTerms.push(modelCode)
    }

    let found = false
    for (const term of searchTerms) {
      if (found) break
      if (!term || term.length < 3) continue
      const regex = buildSearchRegex(term)
      let inCodeBlock = false
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim()
        if (trimmed.startsWith('```')) {
          inCodeBlock = !inCodeBlock
          continue
        }
        if (inCodeBlock) continue
        if (!regex.test(lines[i])) continue
        const radius = 5
        const start = Math.max(0, i - radius)
        const end = Math.min(lines.length - 1, i + radius)
        for (let j = start; j <= end; j++) {
          const lineTrimmed = lines[j].trim()
          if (IMG_TEST.test(lineTrimmed)) {
            illustratedIds.add(product.id!)
            const imgMatch = lineTrimmed.match(IMG_URL_RE)
            if (imgMatch && imgMatch[1]) existingUrls.add(normalizeImageUrl(imgMatch[1]))
            found = true
            break
          }
        }
        if (found) break
      }
    }
  }

  if (illustratedIds.size > 0) {
    debugLog(
      'scanExistingProductImages',
      `illustratedCount=${illustratedIds.size} ids=[${[...illustratedIds].join(', ')}]`,
    )
  }
  return illustratedIds
}

function findFirstParagraphEnd(lines: string[], headingIdx: number): number {
  let i = headingIdx + 1
  while (i < lines.length && lines[i].trim() === '') i++
  if (i >= lines.length) return -1
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || HEADING_RE.test(trimmed)) break
    i++
  }
  return i - 1
}

function hasImageNearby(lines: string[], centerIdx: number, radius: number): boolean {
  const start = Math.max(0, centerIdx - radius)
  const end = Math.min(lines.length - 1, centerIdx + radius)
  for (let i = start; i <= end; i++) {
    if (IMG_TEST.test(lines[i].trim())) return true
  }
  return false
}

function countSectionsMatchingName(lines: string[], name: string): number {
  if (!name || name.length < 3) return 0
  const regex = buildSearchRegex(name)
  let count = 0
  let inCodeBlock = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    if (HEADING_RE.test(trimmed) && regex.test(trimmed)) count++
  }
  return count
}

function matchAndInsert(
  lines: string[],
  searchTerms: string[],
  proxiedUrl: string,
  displayName: string,
  productInsertMap: Map<string, number>,
  productId: string,
): boolean {
  if (productInsertMap.has(productId)) {
    debugLog(
      'matchAndInsert:skipped',
      `productId=${productId} reason="product already in productInsertMap"`,
    )
    return false
  }

  for (const term of searchTerms) {
    if (!term || term.length < 3) continue
    const regex = buildSearchRegex(term)
    let inCodeBlock = false

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock
        continue
      }
      if (inCodeBlock || IMG_TEST.test(trimmed) || trimmed.startsWith('|')) continue
      if (!regex.test(lines[i])) continue
      if (HEADING_RE.test(trimmed)) {
        const paraEndIdx = findFirstParagraphEnd(lines, i)
        if (paraEndIdx >= 0) {
          lines.splice(paraEndIdx + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
          productInsertMap.set(productId, paraEndIdx + 2)
        } else {
          lines.splice(i + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
          productInsertMap.set(productId, i + 2)
        }
        return true
      }
    }

    inCodeBlock = false
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock
        continue
      }
      if (
        inCodeBlock ||
        HEADING_RE.test(trimmed) ||
        IMG_TEST.test(trimmed) ||
        trimmed.startsWith('|')
      )
        continue
      if (!regex.test(lines[i])) continue
      if (i + 1 < lines.length && HEADING_RE.test(lines[i + 1].trim())) continue
      if (hasImageNearby(lines, i + 1, 2)) continue
      lines.splice(i + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
      productInsertMap.set(productId, i + 2)
      return true
    }
  }
  return false
}

function insertImagesByName(
  content: string,
  products: ProductImageInfo[],
  insertedIds: Set<string>,
  existingUrls: Set<string>,
): string {
  const eligible = products
    .filter(
      (p) =>
        p?.id && p?.name && p?.image_url && isValidImageUrl(p.image_url) && !insertedIds.has(p.id),
    )
    .sort((a, b) => {
      const aName = normalizeProductName(a.name) || a.name
      const bName = normalizeProductName(b.name) || b.name
      return bName.length - aName.length
    })

  debugLog(
    'insertImagesByName:start',
    `inputLen=${safeLen(content)} totalProducts=${products.length} eligible=${eligible.length} alreadyInserted=${insertedIds.size}`,
  )

  if (!eligible.length) {
    debugLog('insertImagesByName:end', 'no eligible products')
    return content
  }

  const lines = content.split('\n')
  const matchedIds = new Set<string>()
  const usedUrls = new Set<string>(existingUrls)
  const productInsertMap = new Map<string, number>()

  for (const product of eligible) {
    if (matchedIds.has(product.id!)) {
      debugLog(
        'insertImagesByName:skipped',
        `name="${product.name}" id=${product.id} reason="already matched by id"`,
      )
      continue
    }
    if (productInsertMap.has(product.id!)) {
      debugLog(
        'insertImagesByName:skipped',
        `name="${product.name}" id=${product.id} reason="already in productInsertMap"`,
      )
      continue
    }

    const hasVariants = hasColorVariants(product, products)
    const displayName = hasVariants
      ? product.name
      : normalizeProductName(product.name) || product.name

    debugLog(
      'insertImagesByName:normalizedName',
      `original="${product.name}" normalized="${displayName}" id=${product.id}`,
    )

    if (displayName.length < 3) {
      debugLog(
        'insertImagesByName:skipped',
        `name="${product.name}" reason="displayName too short (${displayName.length})" url=${product.image_url}`,
      )
      continue
    }

    if (!hasVariants && displayName !== product.name) {
      const sectionCount = countSectionsMatchingName(lines, displayName)
      if (sectionCount > 1) {
        debugLog(
          'insertImagesByName:skipped',
          `name="${product.name}" displayName="${displayName}" reason="normalized name matches ${sectionCount} sections, ambiguous"`,
        )
        continue
      }
    }

    const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url!
    const normalizedProxied = normalizeImageUrl(proxiedUrl)
    const normalizedOriginal = normalizeImageUrl(product.image_url || '')

    if (
      usedUrls.has(normalizedProxied) ||
      (normalizedOriginal && usedUrls.has(normalizedOriginal))
    ) {
      debugLog(
        'insertImagesByName:skipped',
        `name="${product.name}" displayName="${displayName}" reason="URL already used (normalized)" originalUrl=${product.image_url} proxiedUrl=${proxiedUrl}`,
      )
      continue
    }

    const searchTerms: string[] = [product.name]
    if (!hasVariants && displayName !== product.name) searchTerms.push(displayName)
    const modelCode = extractModelCode(product.name)
    if (!hasVariants && modelCode && modelCode.toLowerCase() !== displayName.toLowerCase()) {
      searchTerms.push(modelCode)
    }

    const inserted = matchAndInsert(
      lines,
      searchTerms,
      proxiedUrl,
      displayName,
      productInsertMap,
      product.id!,
    )

    if (inserted) {
      usedUrls.add(normalizedProxied)
      if (normalizedOriginal) usedUrls.add(normalizedOriginal)
      insertedIds.add(product.id!)
      matchedIds.add(product.id!)
      const lineIdx = productInsertMap.get(product.id!)
      debugLog(
        'insertImagesByName:matched',
        `name="${displayName}" originalName="${product.name}" id=${product.id} proxiedUrl=${proxiedUrl} lineIndex=${lineIdx}`,
      )
    } else {
      debugLog(
        'insertImagesByName:notMatched',
        `name="${product.name}" displayName="${displayName}" originalUrl=${product.image_url} proxiedUrl=${proxiedUrl} reason="product name not found in content"`,
      )
    }
  }

  const unmatched = eligible.filter((p) => !matchedIds.has(p.id!))
  debugLog(
    'insertImagesByName:end',
    `matched=${matchedIds.size} unmatched=${unmatched.length} matchedIds=[${[...matchedIds].join(', ')}] unmatchedNames=[${unmatched.map((p) => normalizeProductName(p.name) || p.name).join(', ')}]`,
  )
  return lines.join('\n')
}

function finalAntiDuplicateSweep(content: string, products: ProductImageInfo[]): string {
  const lines = content.split('\n')

  const fullNameToProductId = new Map<string, string>()
  const normalizedNameToProductIds = new Map<string, string[]>()
  const productIdToNormalizedName = new Map<string, string>()
  for (const p of products) {
    if (!p?.id || !p?.name) continue
    fullNameToProductId.set(p.name.toLowerCase(), p.id)
    const normalized = normalizeProductName(p.name) || p.name
    const normLower = normalized.toLowerCase()
    if (!normalizedNameToProductIds.has(normLower)) {
      normalizedNameToProductIds.set(normLower, [])
    }
    normalizedNameToProductIds.get(normLower)!.push(p.id)
    productIdToNormalizedName.set(p.id, normLower)
  }

  const productImageLines = new Map<string, number[]>()
  const linesToRemove = new Set<number>()
  let removedCount = 0
  let inCodeBlock = false
  let lastHeadingText = ''
  const sectionSeenNormalized = new Set<string>()
  let sectionHasValidImage = false
  let sectionIndisponivelLines: number[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    if (isTitleLine(trimmed)) {
      lastHeadingText = trimmed
      sectionSeenNormalized.clear()
      sectionHasValidImage = false
      sectionIndisponivelLines = []
    }

    if (trimmed.startsWith('|')) continue

    const imgMatch = trimmed.match(IMG_ALT_RE)
    if (!imgMatch) continue

    const alt = (imgMatch[1] || '').replace(/^PRODUCT_IMAGE:/, '').trim()
    let matchedProductId: string | null = null

    if (alt) {
      matchedProductId = fullNameToProductId.get(alt.toLowerCase()) || null
      if (!matchedProductId) {
        const ids = normalizedNameToProductIds.get(alt.toLowerCase())
        if (ids && ids.length === 1) matchedProductId = ids[0]
      }
    }

    if (!matchedProductId && lastHeadingText) {
      const headingLower = lastHeadingText.toLowerCase()
      const headingClean = headingLower
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\*\*|\*\*$/g, '')
        .trim()
      for (const [name, id] of fullNameToProductId) {
        if (name.length >= 3 && (headingLower.includes(name) || headingClean.includes(name))) {
          matchedProductId = id
          break
        }
      }
      if (!matchedProductId) {
        for (const [name, ids] of normalizedNameToProductIds) {
          if (
            name.length >= 3 &&
            ids.length === 1 &&
            (headingLower.includes(name) ||
              headingClean.includes(name) ||
              name.includes(headingClean))
          ) {
            matchedProductId = ids[0]
            break
          }
        }
      }
      if (!matchedProductId) {
        for (const p of products) {
          if (!p?.id || !p?.name) continue
          const modelCode = extractModelCode(p.name)
          if (
            modelCode &&
            modelCode.length >= 3 &&
            headingClean.includes(modelCode.toLowerCase())
          ) {
            const normName = (normalizeProductName(p.name) || p.name).toLowerCase()
            const ids = normalizedNameToProductIds.get(normName)
            if (ids && ids.length === 1) {
              matchedProductId = ids[0]
              break
            }
          }
        }
      }
    }

    if (matchedProductId) {
      const normName = productIdToNormalizedName.get(matchedProductId)
      if (normName) {
        if (sectionSeenNormalized.has(normName)) {
          linesToRemove.add(i)
          const lineContent = lines[i].trim().substring(0, 100)
          debugLog(
            'finalAntiDuplicateSweep:removedSectionDupe',
            `productId=${matchedProductId} normalized="${normName}" lineIndex=${i} content="${lineContent}"`,
          )
          removedCount++
          continue
        }
        sectionSeenNormalized.add(normName)
      }

      if (!sectionHasValidImage) {
        sectionHasValidImage = true
        for (const idx of sectionIndisponivelLines) {
          if (!linesToRemove.has(idx)) {
            linesToRemove.add(idx)
            const lc = lines[idx].trim().substring(0, 100)
            debugLog(
              'finalAntiDuplicateSweep:removedUnavailablePlaceholder',
              `lineIndex=${idx} content="${lc}"`,
            )
            removedCount++
          }
        }
        sectionIndisponivelLines = []
      }

      if (!productImageLines.has(matchedProductId)) {
        productImageLines.set(matchedProductId, [])
      }
      productImageLines.get(matchedProductId)!.push(i)
    } else if (/indispon[ií]vel/i.test(alt)) {
      if (sectionHasValidImage) {
        linesToRemove.add(i)
        const lineContent = lines[i].trim().substring(0, 100)
        debugLog(
          'finalAntiDuplicateSweep:removedUnavailablePlaceholder',
          `lineIndex=${i} content="${lineContent}"`,
        )
        removedCount++
        continue
      } else {
        sectionIndisponivelLines.push(i)
      }
    }
  }

  for (const [productId, indices] of productImageLines) {
    if (indices.length > 1) {
      for (let k = 1; k < indices.length; k++) {
        if (linesToRemove.has(indices[k])) continue
        linesToRemove.add(indices[k])
        const lineContent = lines[indices[k]].trim().substring(0, 100)
        debugLog(
          'finalAntiDuplicateSweep:removed',
          `productId=${productId} lineIndex=${indices[k]} content="${lineContent}"`,
        )
        removedCount++
      }
    }
  }

  if (removedCount === 0) {
    debugLog('finalAntiDuplicateSweep', 'no duplicates found')
    return content
  }

  debugLog(
    'finalAntiDuplicateSweep',
    `removedCount=${removedCount} products=[${[...productImageLines.entries()]
      .filter(([, v]) => v.length > 1)
      .map(([k]) => k)
      .join(', ')}]`,
  )
  const result = lines.filter((_, i) => !linesToRemove.has(i))
  return result.join('\n').replace(/\n{3,}/g, '\n\n')
}

export interface ProcessProductImagesResult {
  content: string
  insertedProductIds: string[]
}

export function processProductImages(
  content: string,
  products: ProductImageInfo[],
): ProcessProductImagesResult {
  if (!content) return { content, insertedProductIds: [] }

  const uniqueProducts: ProductImageInfo[] = []
  const seenIds = new Set<string>()
  for (const p of products) {
    if (p?.id && !seenIds.has(p.id)) {
      seenIds.add(p.id)
      uniqueProducts.push(p)
    }
  }
  const dedupRemoved = products.length - uniqueProducts.length
  if (dedupRemoved > 0) {
    debugLog(
      'processProductImages:deduplication',
      `removed=${dedupRemoved} before=${products.length} after=${uniqueProducts.length}`,
    )
  }
  const dedupedProducts = uniqueProducts

  debugGroup(
    'processProductImages',
    `inputLen=${safeLen(content)} products=${dedupedProducts.length}`,
  )
  debugLog(
    'processProductImages:input',
    `products=[${dedupedProducts.map((p) => `${p.name || '?'}(${p.id || '?'})`).join(', ')}]`,
  )

  let processed = fixMissingImageBangs(content)
  debugLog('processProductImages:fixMissingImageBangs', `outputLen=${safeLen(processed)}`)

  processed = cleanHtmlImages(processed)
  debugLog('processProductImages:cleanHtmlImages', `outputLen=${safeLen(processed)}`)

  processed = cleanBrokenMarkdownImages(processed)
  debugLog('processProductImages:cleanBrokenMarkdownImages', `outputLen=${safeLen(processed)}`)

  processed = sanitizeEmptyHeadings(processed)
  debugLog('processProductImages:sanitizeEmptyHeadings', `outputLen=${safeLen(processed)}`)

  processed = sanitizeHeadings(processed)
  debugLog('processProductImages:sanitizeHeadings', `outputLen=${safeLen(processed)}`)

  const productMap = new Map<string, ProductImageInfo>()
  for (const p of dedupedProducts) {
    if (p?.id && p?.image_url) productMap.set(p.id, p)
  }

  const existingUrls = extractExistingImageUrls(processed)
  const existingNormalizedUrls = new Set<string>([...existingUrls].map((u) => normalizeImageUrl(u)))
  const preScannedIds = scanExistingProductImages(
    processed,
    dedupedProducts,
    existingNormalizedUrls,
  )
  const processedPlaceholderIds = new Set<string>()
  const insertedIds = new Set<string>(preScannedIds)
  debugLog(
    'processProductImages:preScan',
    `preScannedIds=${preScannedIds.size} ids=[${[...preScannedIds].join(', ')}]`,
  )
  debugLog(
    'processProductImages:existingUrls',
    `count=${existingUrls.size} urls=[${[...existingUrls].slice(0, 10).join(', ')}]`,
  )

  processed = processed.replace(
    /<!--\s*PRODUCT_IMAGE:([0-9a-fA-F-]{36})\s*-->/g,
    (_match, uuid: string, offset: number) => {
      if (processedPlaceholderIds.has(uuid)) {
        debugLog(
          'processProductImages:placeholderDuplicateRemoved',
          `type=HTML_COMMENT uuid=${uuid} reason="duplicate placeholder"`,
        )
        return ''
      }
      processedPlaceholderIds.add(uuid)
      if (insertedIds.has(uuid)) {
        debugLog(
          'processProductImages:placeholderAlreadyInserted',
          `type=HTML_COMMENT uuid=${uuid} reason="product already in insertedIds from pre-scan"`,
        )
        return ''
      }
      const product = productMap.get(uuid)
      if (!product || !product.image_url || !isValidImageUrl(product.image_url)) {
        debugLog(
          'processProductImages:placeholderNotFound',
          `type=HTML_COMMENT uuid=${uuid} reason="product not in map, no image_url, or invalid URL"`,
        )
        return ''
      }
      const normalizedOriginal = normalizeImageUrl(product.image_url)
      if (existingNormalizedUrls.has(normalizedOriginal)) {
        debugLog(
          'processProductImages:placeholderImageAlreadyPresent',
          `type=HTML_COMMENT uuid=${uuid} reason="image already in content"`,
        )
        insertedIds.add(uuid)
        return ''
      }
      const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url
      existingNormalizedUrls.add(normalizedOriginal)
      existingNormalizedUrls.add(normalizeImageUrl(proxiedUrl))
      insertedIds.add(uuid)
      const displayName = normalizeProductName(product.name) || product.name
      const lineStart = processed.lastIndexOf('\n', offset) + 1
      const lineEnd = processed.indexOf('\n', offset)
      const line = processed.substring(lineStart, lineEnd === -1 ? processed.length : lineEnd)
      if (line.trim().startsWith('|')) {
        debugLog(
          'processProductImages:placeholderReplaced',
          `type=HTML_COMMENT uuid=${uuid} name="${displayName}" context=table`,
        )
        return `![PRODUCT_IMAGE:${displayName}](${proxiedUrl})`
      }
      debugLog(
        'processProductImages:placeholderReplaced',
        `type=HTML_COMMENT uuid=${uuid} name="${displayName}" context=block`,
      )
      return `\n\n![PRODUCT_IMAGE:${displayName}](${proxiedUrl})\n`
    },
  )

  processed = processed.replace(
    /\[PRODUCT:([0-9a-fA-F-]{36})\]/g,
    (_match, uuid: string, offset: number) => {
      if (processedPlaceholderIds.has(uuid)) {
        debugLog(
          'processProductImages:placeholderDuplicateRemoved',
          `type=PRODUCT_TAG uuid=${uuid} reason="duplicate placeholder"`,
        )
        return ''
      }
      processedPlaceholderIds.add(uuid)
      if (insertedIds.has(uuid)) {
        debugLog(
          'processProductImages:placeholderAlreadyInserted',
          `type=PRODUCT_TAG uuid=${uuid} reason="product already in insertedIds from pre-scan"`,
        )
        return ''
      }
      const product = productMap.get(uuid)
      if (!product || !product.image_url || !isValidImageUrl(product.image_url)) {
        debugLog(
          'processProductImages:placeholderNotFound',
          `type=PRODUCT_TAG uuid=${uuid} reason="product not in map, no image_url, or invalid URL"`,
        )
        return ''
      }
      const normalizedOriginal = normalizeImageUrl(product.image_url)
      if (existingNormalizedUrls.has(normalizedOriginal)) {
        debugLog(
          'processProductImages:placeholderImageAlreadyPresent',
          `type=PRODUCT_TAG uuid=${uuid} reason="image already in content"`,
        )
        insertedIds.add(uuid)
        return ''
      }
      const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url
      existingNormalizedUrls.add(normalizedOriginal)
      existingNormalizedUrls.add(normalizeImageUrl(proxiedUrl))
      insertedIds.add(uuid)
      const displayName = normalizeProductName(product.name) || product.name
      const lineStart = processed.lastIndexOf('\n', offset) + 1
      const lineEnd = processed.indexOf('\n', offset)
      const line = processed.substring(lineStart, lineEnd === -1 ? processed.length : lineEnd)
      if (line.trim().startsWith('|')) {
        debugLog(
          'processProductImages:placeholderReplaced',
          `type=PRODUCT_TAG uuid=${uuid} name="${displayName}" context=table`,
        )
        return `![PRODUCT_IMAGE:${displayName}](${proxiedUrl})`
      }
      debugLog(
        'processProductImages:placeholderReplaced',
        `type=PRODUCT_TAG uuid=${uuid} name="${displayName}" context=block`,
      )
      return `\n\n![PRODUCT_IMAGE:${displayName}](${proxiedUrl})\n`
    },
  )

  debugLog(
    'processProductImages:afterPlaceholders',
    `insertedIds=${insertedIds.size} contentLen=${safeLen(processed)}`,
  )

  processed = separateImagesFromHeadings(processed)
  debugLog('processProductImages:separateImagesFromHeadings', `outputLen=${safeLen(processed)}`)

  const imgCountBeforeInsert = (processed.match(/!\[/g) || []).length
  processed = insertImagesByName(processed, dedupedProducts, insertedIds, existingNormalizedUrls)
  const imgCountAfterInsert = (processed.match(/!\[/g) || []).length
  debugLog(
    'processProductImages:insertImagesByName',
    `beforeImgs=${imgCountBeforeInsert} afterImgs=${imgCountAfterInsert} insertedIds=${insertedIds.size}`,
  )

  for (const p of dedupedProducts) {
    if (p?.id && !insertedIds.has(p.id) && p?.image_url) {
      const proxied = getProxiedImageUrl(p.image_url) || p.image_url
      debugLog(
        'processProductImages:imageNotInserted',
        `name="${p.name}" id=${p.id} originalUrl=${p.image_url} proxiedUrl=${proxied}`,
      )
    }
  }

  const imgCountBeforeDedup = (processed.match(/!\[/g) || []).length
  processed = deduplicateAndLimitImages(processed)
  const imgCountAfterDedup = (processed.match(/!\[/g) || []).length
  debugLog(
    'processProductImages:deduplicateAndLimitImages',
    `beforeImgs=${imgCountBeforeDedup} afterImgs=${imgCountAfterDedup} removed=${imgCountBeforeDedup - imgCountAfterDedup}`,
  )

  processed = enforceLayoutOrder(processed)
  debugLog('processProductImages:enforceLayoutOrder', `outputLen=${safeLen(processed)}`)

  processed = sanitizeHeadings(processed)
  debugLog('processProductImages:sanitizeHeadingsFinal', `outputLen=${safeLen(processed)}`)

  processed = proxyMarkdownImages(processed)
  debugLog('processProductImages:proxyMarkdownImages', `outputLen=${safeLen(processed)}`)

  processed = removeOrphanBoldMarkers(processed)
  debugLog('processProductImages:removeOrphanBoldMarkers', `outputLen=${safeLen(processed)}`)

  const imgCountBeforeSweep = (processed.match(/!\[/g) || []).length
  processed = finalAntiDuplicateSweep(processed, dedupedProducts)
  const imgCountAfterSweep = (processed.match(/!\[/g) || []).length
  debugLog(
    'processProductImages:finalAntiDuplicateSweep',
    `beforeImgs=${imgCountBeforeSweep} afterImgs=${imgCountAfterSweep} removed=${imgCountBeforeSweep - imgCountAfterSweep}`,
  )

  const finalImgCount = (processed.match(/!\[/g) || []).length
  const finalH3Count = (processed.match(/^###\s/gm) || []).length
  debugLog(
    'processProductImages:final',
    `contentLen=${safeLen(processed)} images=${finalImgCount} h3Headings=${finalH3Count}`,
  )

  for (const p of dedupedProducts) {
    if (!p?.name) continue
    const name = normalizeProductName(p.name) || p.name
    const h3Regex = new RegExp(`^###\\s+.*${escapeRegex(name)}`, 'im')
    const hasH3 = h3Regex.test(processed)
    if (hasH3) {
      debugLog('processProductImages:greenHeadingFound', `name="${name}"`)
    } else {
      const allHeadings = processed.match(/^#{1,6}\s+.+$/gm) || []
      const closest = allHeadings.find((h) => {
        const firstWord = name.toLowerCase().split(/\s+/)[0]
        return firstWord && firstWord.length > 2 && h.toLowerCase().includes(firstWord)
      })
      debugLog(
        'processProductImages:greenHeadingMissing',
        `name="${name}" closestHeading="${closest || 'none'}"`,
      )
    }
  }

  debugGroupEnd()
  return { content: processed, insertedProductIds: [...insertedIds] }
}
