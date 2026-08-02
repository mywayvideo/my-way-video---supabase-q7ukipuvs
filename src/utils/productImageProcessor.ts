import { getProxiedImageUrl, proxyMarkdownImages } from '@/lib/image-proxy'
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
  const matchedNames: string[] = []
  const usedUrls = new Set<string>(existingUrls)
  const loggedNormalized = new Set<string>()

  for (const product of eligible) {
    const displayName = normalizeProductName(product.name) || product.name
    if (!loggedNormalized.has(product.id!)) {
      loggedNormalized.add(product.id!)
      debugLog(
        'insertImagesByName:normalizedName',
        `original="${product.name}" normalized="${displayName}" id=${product.id}`,
      )
    }
    if (displayName.length < 3) {
      debugLog(
        'insertImagesByName:skipped',
        `name="${product.name}" reason="displayName too short (${displayName.length})" url=${product.image_url}`,
      )
      continue
    }

    const isSubsumed = matchedNames.some(
      (m) =>
        m.toLowerCase().includes(displayName.toLowerCase()) &&
        m.toLowerCase() !== displayName.toLowerCase(),
    )
    const isDuplicate = matchedNames.some((m) => m.toLowerCase() === displayName.toLowerCase())
    if (isSubsumed || isDuplicate) {
      debugLog(
        'insertImagesByName:skipped',
        `name="${product.name}" displayName="${displayName}" reason="${isSubsumed ? 'subsumed' : 'duplicate'}" url=${product.image_url}`,
      )
      continue
    }

    const escapedName = escapeRegex(displayName)
    const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'i')
    const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url!
    if (usedUrls.has(proxiedUrl) || (product.image_url && usedUrls.has(product.image_url))) {
      debugLog(
        'insertImagesByName:skipped',
        `name="${product.name}" displayName="${displayName}" reason="URL already used" originalUrl=${product.image_url} proxiedUrl=${proxiedUrl}`,
      )
      continue
    }

    let inCodeBlock = false
    let inserted = false

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock
        continue
      }
      if (inCodeBlock || IMG_TEST.test(trimmed) || trimmed.startsWith('|')) continue
      if (!nameRegex.test(lines[i])) continue
      if (HEADING_RE.test(trimmed)) {
        lines.splice(i + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
        usedUrls.add(proxiedUrl)
        if (product.image_url) usedUrls.add(product.image_url)
        insertedIds.add(product.id!)
        matchedNames.push(displayName)
        debugLog(
          'insertImagesByName:matchedHeading',
          `name="${displayName}" id=${product.id} line=${i} proxiedUrl=${proxiedUrl}`,
        )
        inserted = true
        break
      }
    }

    if (!inserted) {
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
        if (!nameRegex.test(lines[i])) continue
        lines.splice(i + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
        usedUrls.add(proxiedUrl)
        if (product.image_url) usedUrls.add(product.image_url)
        insertedIds.add(product.id!)
        matchedNames.push(displayName)
        debugLog(
          'insertImagesByName:matchedLine',
          `name="${displayName}" id=${product.id} line=${i} proxiedUrl=${proxiedUrl}`,
        )
        break
      }
    }

    if (!matchedNames.includes(displayName)) {
      const modelCode = extractModelCode(product.name)
      if (modelCode && modelCode.toLowerCase() !== displayName.toLowerCase()) {
        debugLog(
          'insertImagesByName:fallbackModelCode',
          `name="${product.name}" displayName="${displayName}" modelCode="${modelCode}" id=${product.id}`,
        )
        const modelRegex = new RegExp(`\\b${escapeRegex(modelCode)}\\b`, 'i')
        inCodeBlock = false
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim()
          if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock
            continue
          }
          if (inCodeBlock || IMG_TEST.test(trimmed) || trimmed.startsWith('|')) continue
          if (!modelRegex.test(lines[i])) continue
          if (HEADING_RE.test(trimmed)) {
            lines.splice(i + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
            usedUrls.add(proxiedUrl)
            if (product.image_url) usedUrls.add(product.image_url)
            insertedIds.add(product.id!)
            matchedNames.push(displayName)
            debugLog(
              'insertImagesByName:fallbackMatchedHeading',
              `name="${displayName}" modelCode="${modelCode}" id=${product.id} line=${i} proxiedUrl=${proxiedUrl}`,
            )
            break
          }
        }
        if (!matchedNames.includes(displayName)) {
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
            if (!modelRegex.test(lines[i])) continue
            lines.splice(i + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
            usedUrls.add(proxiedUrl)
            if (product.image_url) usedUrls.add(product.image_url)
            insertedIds.add(product.id!)
            matchedNames.push(displayName)
            debugLog(
              'insertImagesByName:fallbackMatchedLine',
              `name="${displayName}" modelCode="${modelCode}" id=${product.id} line=${i} proxiedUrl=${proxiedUrl}`,
            )
            break
          }
        }
      }
    }

    if (!matchedNames.includes(displayName)) {
      debugLog(
        'insertImagesByName:notMatched',
        `name="${product.name}" displayName="${displayName}" originalUrl=${product.image_url} proxiedUrl=${proxiedUrl} reason="product name not found in content"`,
      )
    }
  }

  const allDisplayNames = eligible.map((p) => normalizeProductName(p.name) || p.name)
  const unmatchedNames = allDisplayNames.filter((n) => !matchedNames.includes(n))
  debugLog(
    'insertImagesByName:end',
    `matched=${matchedNames.length} unmatched=${unmatchedNames.length} matchedNames=[${matchedNames.join(', ')}] unmatchedNames=[${unmatchedNames.join(', ')}]`,
  )
  return lines.join('\n')
}

export function processProductImages(content: string, products: ProductImageInfo[]): string {
  if (!content) return content

  debugGroup('processProductImages', `inputLen=${safeLen(content)} products=${products.length}`)
  debugLog(
    'processProductImages:input',
    `products=[${products.map((p) => `${p.name || '?'}(${p.id || '?'})`).join(', ')}]`,
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
  for (const p of products) {
    if (p?.id && p?.image_url) productMap.set(p.id, p)
  }

  const existingUrls = extractExistingImageUrls(processed)
  const insertedIds = new Set<string>()
  debugLog(
    'processProductImages:existingUrls',
    `count=${existingUrls.size} urls=[${[...existingUrls].slice(0, 10).join(', ')}]`,
  )

  processed = processed.replace(
    /<!--\s*PRODUCT_IMAGE:([0-9a-fA-F-]{36})\s*-->/g,
    (_match, uuid: string, offset: number) => {
      const product = productMap.get(uuid)
      if (!product || !product.image_url) {
        debugLog(
          'processProductImages:placeholderNotFound',
          `type=HTML_COMMENT uuid=${uuid} reason="product not in map or no image_url"`,
        )
        return ''
      }
      const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url
      existingUrls.add(proxiedUrl)
      existingUrls.add(product.image_url)
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
      const product = productMap.get(uuid)
      if (!product || !product.image_url) {
        debugLog(
          'processProductImages:placeholderNotFound',
          `type=PRODUCT_TAG uuid=${uuid} reason="product not in map or no image_url"`,
        )
        return ''
      }
      const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url
      existingUrls.add(proxiedUrl)
      existingUrls.add(product.image_url)
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
  processed = insertImagesByName(processed, products, insertedIds, existingUrls)
  const imgCountAfterInsert = (processed.match(/!\[/g) || []).length
  debugLog(
    'processProductImages:insertImagesByName',
    `beforeImgs=${imgCountBeforeInsert} afterImgs=${imgCountAfterInsert} insertedIds=${insertedIds.size}`,
  )

  for (const p of products) {
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

  for (const p of products) {
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
