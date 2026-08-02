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
  return name.replace(new RegExp(`\\s*\\((?:${pattern})\\)\\s*`, 'gi'), '').trim()
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

  if (!eligible.length) return content

  const lines = content.split('\n')
  const matchedNames: string[] = []
  const usedUrls = new Set<string>(existingUrls)

  for (const product of eligible) {
    const displayName = normalizeProductName(product.name) || product.name
    if (displayName.length < 3) continue

    const isSubsumed = matchedNames.some(
      (m) =>
        m.toLowerCase().includes(displayName.toLowerCase()) &&
        m.toLowerCase() !== displayName.toLowerCase(),
    )
    const isDuplicate = matchedNames.some((m) => m.toLowerCase() === displayName.toLowerCase())
    if (isSubsumed || isDuplicate) continue

    const escapedName = escapeRegex(displayName)
    const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'i')
    const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url!
    if (usedUrls.has(proxiedUrl) || (product.image_url && usedUrls.has(product.image_url))) continue

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
        break
      }
    }
  }
  return lines.join('\n')
}

export function processProductImages(content: string, products: ProductImageInfo[]): string {
  if (!content) return content

  let processed = fixMissingImageBangs(content)
  processed = cleanHtmlImages(processed)
  processed = cleanBrokenMarkdownImages(processed)
  processed = sanitizeEmptyHeadings(processed)
  processed = sanitizeHeadings(processed)

  const productMap = new Map<string, ProductImageInfo>()
  for (const p of products) {
    if (p?.id && p?.image_url) productMap.set(p.id, p)
  }

  const existingUrls = extractExistingImageUrls(processed)
  const insertedIds = new Set<string>()

  processed = processed.replace(
    /<!--\s*PRODUCT_IMAGE:([0-9a-fA-F-]{36})\s*-->/g,
    (_match, uuid: string, offset: number) => {
      const product = productMap.get(uuid)
      if (!product || !product.image_url) return ''
      const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url
      existingUrls.add(proxiedUrl)
      existingUrls.add(product.image_url)
      insertedIds.add(uuid)
      const displayName = normalizeProductName(product.name) || product.name
      const lineStart = processed.lastIndexOf('\n', offset) + 1
      const lineEnd = processed.indexOf('\n', offset)
      const line = processed.substring(lineStart, lineEnd === -1 ? processed.length : lineEnd)
      if (line.trim().startsWith('|')) {
        return `![PRODUCT_IMAGE:${displayName}](${proxiedUrl})`
      }
      return `\n\n![PRODUCT_IMAGE:${displayName}](${proxiedUrl})\n`
    },
  )

  processed = processed.replace(
    /\[PRODUCT:([0-9a-fA-F-]{36})\]/g,
    (_match, uuid: string, offset: number) => {
      const product = productMap.get(uuid)
      if (!product || !product.image_url) return ''
      const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url
      existingUrls.add(proxiedUrl)
      existingUrls.add(product.image_url)
      insertedIds.add(uuid)
      const displayName = normalizeProductName(product.name) || product.name
      const lineStart = processed.lastIndexOf('\n', offset) + 1
      const lineEnd = processed.indexOf('\n', offset)
      const line = processed.substring(lineStart, lineEnd === -1 ? processed.length : lineEnd)
      if (line.trim().startsWith('|')) {
        return `![PRODUCT_IMAGE:${displayName}](${proxiedUrl})`
      }
      return `\n\n![PRODUCT_IMAGE:${displayName}](${proxiedUrl})\n`
    },
  )

  processed = separateImagesFromHeadings(processed)
  processed = insertImagesByName(processed, products, insertedIds, existingUrls)
  processed = deduplicateAndLimitImages(processed)
  processed = enforceLayoutOrder(processed)
  processed = sanitizeHeadings(processed)
  processed = proxyMarkdownImages(processed)

  return processed
}
