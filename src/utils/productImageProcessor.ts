import { getProxiedImageUrl } from '@/lib/image-proxy'
import { resolveImageUrl } from '@/hooks/use-image-fallback'

export interface ProductImageInfo {
  name: string
  image_url?: string | null
  id?: string
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function resolveProductImageUrl(url: string | null | undefined): string | null {
  const resolved = resolveImageUrl(url)
  if (!resolved) return null
  return getProxiedImageUrl(resolved) ?? resolved
}

function cleanHtmlImages(text: string): string {
  return text
    .replace(
      /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?\/?>/gi,
      (_m, src: string, alt?: string) => `\n\n![${alt || ''}](${src})\n\n`,
    )
    .replace(
      /<img\s+[^>]*?(?:alt=["']([^"']*)["'])?[^>]*?src=["']([^"']+)["'][^>]*?\/?>/gi,
      (_m, alt?: string, src?: string) => `\n\n![${alt || ''}](${src})\n\n`,
    )
}

function cleanBrokenMarkdownImages(text: string): string {
  return text
    .replace(/\*\*(!\[[^\]]*\]\([^)]+\))\*\*/g, '$1')
    .replace(/\*(!\[[^\]]*\]\([^)]+\))\*/g, '$1')
    .replace(/(!\[[^\]]*\]\([^)]+\))\*\*/g, '$1')
    .replace(/\*\*(!\[[^\]]*\]\([^)]+\))/g, '$1')
}

function extractExistingImageUrls(text: string): Set<string> {
  const urls = new Set<string>()
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    urls.add(match[1])
  }
  return urls
}

function hasImageWithName(text: string, names: string[]): boolean {
  for (const name of names) {
    if (!name || name.length < 3) continue
    const lower = name.toLowerCase()
    const regex = /!\[([^\]]*)\]\([^)]+\)/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      const alt = m[1].toLowerCase().trim()
      if (alt && (alt.includes(lower) || lower.includes(alt))) return true
    }
  }
  return false
}

function findFirstMention(text: string, names: string[]): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null
  for (const name of names) {
    if (!name || name.length < 3) continue
    const escaped = escapeRegex(name)
    const regex = new RegExp(`(?<!\\w)${escaped}`, 'i')
    const match = regex.exec(text)
    if (match && (best === null || match.index < best.index)) {
      best = { index: match.index, length: match[0].length }
    }
  }
  return best
}

function isTableLine(text: string, position: number): boolean {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1
  const lineEnd = text.indexOf('\n', position)
  const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd)
  return line.trim().startsWith('|')
}

function findLineEnd(text: string, position: number): number {
  const idx = text.indexOf('\n', position)
  return idx === -1 ? text.length : idx
}

export function processProductImages(content: string, products: ProductImageInfo[]): string {
  if (!content) return content
  if (!products || products.length === 0) return content

  let processed = cleanHtmlImages(content)
  processed = cleanBrokenMarkdownImages(processed)

  const existingUrls = extractExistingImageUrls(processed)

  for (const product of products) {
    if (!product?.name || !product?.image_url) continue
    const resolved = resolveProductImageUrl(product.image_url)
    if (!resolved) continue

    if (existingUrls.has(resolved) || existingUrls.has(product.image_url)) continue

    const normalized = normalizeProductName(product.name)
    const namesToTry = [product.name, normalized].filter(
      (n, i, arr) => n && n.length >= 3 && arr.indexOf(n) === i,
    )

    if (hasImageWithName(processed, namesToTry)) continue

    const mention = findFirstMention(processed, namesToTry)
    if (!mention) continue
    if (isTableLine(processed, mention.index)) continue

    const insertPos = findLineEnd(processed, mention.index + mention.length)
    const displayName = normalized || product.name
    const imageMarkdown = `\n\n![${displayName}](${resolved})\n`

    processed = processed.substring(0, insertPos) + imageMarkdown + processed.substring(insertPos)
    existingUrls.add(resolved)
  }

  return processed
}
