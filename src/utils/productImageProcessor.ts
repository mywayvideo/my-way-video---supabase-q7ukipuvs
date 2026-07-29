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
  return resolveImageUrl(url)
}

function cleanHtmlImages(text: string): string {
  return text
    .replace(
      /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?\/?>/gi,
      (_m, src: string, alt?: string) => `\n\n![${alt || ''}](${src})\n\n`,
    )
    .replace(
      /<img\s+[^>]*?(?:alt=["']([^"']*)["'])?[^>]*?src=["']([^"']+)["'][^>]*?\/?>/gi,
      (_m, alt?: string, src?: string) => `\n\n![${alt || ''}](${src ?? ''})\n\n`,
    )
}

function cleanBrokenMarkdownImages(text: string): string {
  const img = '(!\\[[^\\]]*\\]\\([^)]*\\))'
  return text
    .replace(new RegExp(`""${img}`, 'g'), '$1')
    .replace(new RegExp(`"${img}`, 'g'), '$1')
    .replace(new RegExp(`${img}"`, 'g'), '$1')
    .replace(new RegExp(`\\*\\*${img}\\*\\*`, 'g'), '$1')
    .replace(new RegExp(`\\*${img}\\*`, 'g'), '$1')
    .replace(new RegExp(`${img}\\*\\*`, 'g'), '$1')
    .replace(new RegExp(`\\*\\*${img}`, 'g'), '$1')
}

function extractOriginalFromProxied(url: string): string | null {
  const proxyMarker = '/functions/v1/image-proxy?url='
  const idx = url.indexOf(proxyMarker)
  if (idx === -1) return null
  const encodedUrl = url.substring(idx + proxyMarker.length)
  try {
    return decodeURIComponent(encodedUrl)
  } catch {
    return encodedUrl
  }
}

function extractExistingImageUrls(text: string): Set<string> {
  const urls = new Set<string>()
  const regex = /!\[[^\]]*\]\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const rawUrl = match[1]
    urls.add(rawUrl)
    const originalUrl = extractOriginalFromProxied(rawUrl)
    if (originalUrl && originalUrl !== rawUrl) {
      urls.add(originalUrl)
    }
  }
  return urls
}

function proxyMarkdownImageUrls(text: string): string {
  return text.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (match, alt: string, url: string) => {
    const proxied = getProxiedImageUrl(url)
    if (!proxied || proxied === url) return match
    return `![${alt}](${proxied})`
  })
}

function hasImageWithName(text: string, names: string[]): boolean {
  for (const name of names) {
    if (!name || name.length < 3) continue
    const lower = name.toLowerCase()
    const regex = /!\[([^\]]*)\]\(([^)]*)\)/g
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

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
const IMAGE_DOMAINS = [
  'bhphotovideo.com',
  'bhphoto.com',
  'eimagevideo.com',
  'static.bhphoto.com',
  'img.usecurling.com',
]

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0].split('#')[0]
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    return IMAGE_DOMAINS.some((d) => host === d || host.endsWith('.' + d))
  } catch {
    return false
  }
}

function fixMissingImageBangs(text: string): string {
  return text.replace(
    /(?<!!)(?<!\\)\[([^\]]*)\]\(([^)\s]*?)(?:\s+"[^"]*")?\)/g,
    (match, alt: string, url: string) => {
      if (!isImageUrl(url)) return match
      return `![${alt}](${url})`
    },
  )
}

export function processProductImages(content: string, products: ProductImageInfo[]): string {
  if (!content) return content

  let processed = fixMissingImageBangs(content)
  processed = cleanHtmlImages(processed)
  processed = cleanBrokenMarkdownImages(processed)

  const existingUrls = extractExistingImageUrls(processed)

  for (const product of products) {
    if (!product?.name || !product?.image_url) continue

    if (existingUrls.has(product.image_url)) continue

    const resolved = resolveProductImageUrl(product.image_url)
    if (!resolved) continue

    if (existingUrls.has(resolved)) continue

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
    existingUrls.add(product.image_url)
    existingUrls.add(resolved)
  }

  processed = proxyMarkdownImageUrls(processed)

  return processed
}
