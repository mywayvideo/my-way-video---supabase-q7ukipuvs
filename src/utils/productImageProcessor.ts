import { getProxiedImageUrl, proxyMarkdownImages } from '@/lib/image-proxy'
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
  const processedRanges: Array<{ start: number; end: number }> = []

  for (const product of eligible) {
    const displayName = normalizeProductName(product.name) || product.name
    if (displayName.length < 3) continue
    const escapedName = escapeRegex(displayName)
    const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'i')
    const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url!

    if (existingUrls.has(proxiedUrl) || (product.image_url && existingUrls.has(product.image_url)))
      continue

    let inCodeBlock = false
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock
        continue
      }
      if (inCodeBlock) continue
      if (HEADING_RE.test(trimmed)) continue
      if (IMG_TEST.test(trimmed)) continue
      if (trimmed.startsWith('|')) continue
      if (!nameRegex.test(lines[i])) continue

      const overlaps = processedRanges.some((r) => i >= r.start - 1 && i <= r.end + 1)
      if (overlaps) continue

      lines.splice(i + 1, 0, '', `![${displayName}](${proxiedUrl})`, '')
      processedRanges.push({ start: i, end: i + 3 })
      existingUrls.add(proxiedUrl)
      if (product.image_url) existingUrls.add(product.image_url)
      insertedIds.add(product.id!)
      break
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
      return ` ![PRODUCT_IMAGE:${displayName}](${proxiedUrl}) `
    },
  )

  processed = separateImagesFromHeadings(processed)
  processed = insertImagesByName(processed, products, insertedIds, existingUrls)
  processed = proxyMarkdownImages(processed)

  return processed
}
