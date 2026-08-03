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

const COLOR_SUFFIXES = [
  'white',
  'black',
  'red',
  'blue',
  'green',
  'gray',
  'grey',
  'silver',
  'gold',
  'graphite',
  'space gray',
  'space grey',
  'midnight',
  'starlight',
  'rose gold',
  'titanium',
  'natural',
  'purple',
  'pink',
  'orange',
  'yellow',
  'brown',
  'beige',
  'navy',
  'charcoal',
  'bronze',
  'copper',
]

export function normalizeProductName(name: string): string {
  const pattern = COLOR_SUFFIXES.join('|')
  const normalized = name.replace(new RegExp(`\\s*\\((?:${pattern})\\)\\s*`, 'gi'), '').trim()
  if (normalized !== name) {
    debugLog('normalizeProductName', `"${name}" → "${normalized}"`)
  }
  return normalized
}

const HEADING_RE = /^#{1,6}\s+/
const IMG_TEST = /!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/
const IMG_URL_RE = /!\[[^\]]*\]\(([^)]+)\)/

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

    const searchTerms: string[] = [product.name]
    if (displayName !== product.name) searchTerms.push(displayName)
    const modelCode = extractModelCode(product.name)
    if (modelCode && modelCode.toLowerCase() !== displayName.toLowerCase()) {
      searchTerms.push(modelCode)
    }

    let found = false
    for (const term of searchTerms) {
      if (found) break
      if (!term || term.length < 3) continue
      const escaped = escapeRegex(term)
      const regex = new RegExp(`\\b${escaped}\\b`, 'i')

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
            if (imgMatch && imgMatch[1]) {
              existingUrls.add(normalizeImageUrl(imgMatch[1]))
            }
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

function matchAndInsert(
  lines: string[],
  searchTerms: string[],
  proxiedUrl: string,
  displayName: string,
): boolean {
  for (const term of searchTerms) {
    if (!term || term.length < 3) continue
    const escaped = escapeRegex(term)
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
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
        } else {
          lines.splice(i + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
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
      ) {
        continue
      }
      if (!regex.test(lines[i])) continue
      if (i + 1 < lines.length && HEADING_RE.test(lines[i + 1].trim())) continue
      if (hasImageNearby(lines, i + 1, 2)) continue
      lines.splice(i + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
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
    .filter((p) => p?.id && p?.name && p?.image_url && !insertedIds.has(p.id))
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

  for (const product of eligible) {
    if (matchedIds.has(product.id!)) {
      debugLog(
        'insertImagesByName:skipped',
        `name="${product.name}" id=${product.id} reason="already matched by id"`,
      )
      continue
    }

    const displayName = normalizeProductName(product.name) || product.name

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

    const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url!
    const normalizedProxied = normalizeImageUrl(proxiedUrl)
    const normalizedOriginal = normalizeImageUrl(product.image_url || '')

    if (
      usedUrls.has(normalizedProxied) ||
      (normalizedOriginal && usedUrls.has(normalizedOriginal))
    ) {
      debugLog(
        'insertImagesByName:skipped',
        `name="${product.name}" displayName="${displayName}" reason="URL already used (normalized)" originalUrl=${product.image_url} proxiedUrl=${proxiedUrl} normalizedProxied=${normalizedProxied.substring(0, 80)}`,
      )
      continue
    }

    const searchTerms: string[] = [product.name]
    if (displayName !== product.name) {
      searchTerms.push(displayName)
    }
    const modelCode = extractModelCode(product.name)
    if (modelCode && modelCode.toLowerCase() !== displayName.toLowerCase()) {
      searchTerms.push(modelCode)
    }

    const inserted = matchAndInsert(lines, searchTerms, proxiedUrl, displayName)

    if (inserted) {
      usedUrls.add(normalizedProxied)
      if (normalizedOriginal) usedUrls.add(normalizedOriginal)
      insertedIds.add(product.id!)
      matchedIds.add(product.id!)
      debugLog(
        'insertImagesByName:matched',
        `name="${displayName}" originalName="${product.name}" id=${product.id} proxiedUrl=${proxiedUrl}`,
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

export function processProductImages(content: string, products: ProductImageInfo[]): string {
  if (!content) return content

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
          `type=HTML_COMMENT uuid=${uuid} reason="duplicate placeholder for same product"`,
        )
        return ''
      }
      processedPlaceholderIds.add(uuid)
      const product = productMap.get(uuid)
      if (!product || !product.image_url) {
        debugLog(
          'processProductImages:placeholderNotFound',
          `type=HTML_COMMENT uuid=${uuid} reason="product not in map or no image_url"`,
        )
        return ''
      }
      const normalizedOriginal = normalizeImageUrl(product.image_url)
      if (existingNormalizedUrls.has(normalizedOriginal)) {
        debugLog(
          'processProductImages:placeholderImageAlreadyPresent',
          `type=HTML_COMMENT uuid=${uuid} reason="image already in content" normalizedUrl=${normalizedOriginal.substring(0, 80)}`,
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
          `type=PRODUCT_TAG uuid=${uuid} reason="duplicate placeholder for same product"`,
        )
        return ''
      }
      processedPlaceholderIds.add(uuid)
      const product = productMap.get(uuid)
      if (!product || !product.image_url) {
        debugLog(
          'processProductImages:placeholderNotFound',
          `type=PRODUCT_TAG uuid=${uuid} reason="product not in map or no image_url"`,
        )
        return ''
      }
      const normalizedOriginal = normalizeImageUrl(product.image_url)
      if (existingNormalizedUrls.has(normalizedOriginal)) {
        debugLog(
          'processProductImages:placeholderImageAlreadyPresent',
          `type=PRODUCT_TAG uuid=${uuid} reason="image already in content" normalizedUrl=${normalizedOriginal.substring(0, 80)}`,
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
        `name="${p.name}" id=${p.id} originalUrl=${p.image_url} proxiedUrl=${proxied} reason="not matched in content or already inserted via placeholder"`,
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
  return processed
}
