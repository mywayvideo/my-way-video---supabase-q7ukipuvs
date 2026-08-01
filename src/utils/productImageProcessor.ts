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
  const img = '(!\\[[^\\]]*\\]\\((?:[^()]|\\([^()]*\\))*\\))'
  return text
    .replace(new RegExp(`""${img}`, 'g'), '$1')
    .replace(new RegExp(`"${img}`, 'g'), '$1')
    .replace(new RegExp(`${img}"`, 'g'), '$1')
    .replace(new RegExp(`\\*\\*${img}\\*\\*`, 'g'), '$1')
    .replace(new RegExp(`\\*${img}\\*`, 'g'), '$1')
    .replace(new RegExp(`${img}\\*\\*`, 'g'), '$1')
    .replace(new RegExp(`\\*\\*${img}`, 'g'), '$1')
}

function extractExistingImageUrls(text: string): Set<string> {
  const urls = new Set<string>()
  const regex = /!\[[^\]]*\]\(((?:[^()]|\([^()]*\))*)\)/g
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
    const regex = /!\[([^\]]*)\]\(((?:[^()]|\([^()]*\))*)\)/g
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      const alt = m[1].toLowerCase().trim()
      if (alt && (alt.includes(lower) || lower.includes(alt))) return true
    }
  }
  return false
}

function isInsideBold(text: string, position: number): boolean {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1
  const lineBefore = text.substring(lineStart, position)
  const boldCount = (lineBefore.match(/\*\*/g) || []).length
  return boldCount % 2 === 1
}

function isInsideHeading(text: string, position: number): boolean {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1
  const lineEnd = text.indexOf('\n', position)
  const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd)
  return line.trim().startsWith('#')
}

function findFirstMention(text: string, names: string[]): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null
  for (const name of names) {
    if (!name || name.length < 4) continue
    if (!/[a-z0-9]/i.test(name)) continue
    const escaped = escapeRegex(name)
    const regex = new RegExp(`(?<!\\w)${escaped}`, 'gi')
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      if (best === null || match.index < best.index) {
        best = { index: match.index, length: match[0].length }
      }
      break
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

function findFormattingPrefixStart(text: string, mentionIndex: number): number {
  const lineStart = text.lastIndexOf('\n', mentionIndex - 1) + 1
  const beforeMention = text.substring(lineStart, mentionIndex)
  if (/^(\s*#{1,6}\s*\**\s*|\s*\**\s*)$/.test(beforeMention)) {
    return lineStart
  }
  return -1
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
const IMAGE_DOMAINS = [
  'bhphotovideo.com',
  'bhphoto.com',
  'eimagevideo.com',
  'static.bhphoto.com',
  'cdn.bhphotovideo.com',
  'img.usecurling.com',
  'm.media-amazon.com',
  'images-na.ssl-images-amazon.com',
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

import { getProxiedImageUrl, proxyMarkdownImages } from '@/lib/image-proxy'

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

  processed = proxyMarkdownImages(processed)

  const existingUrls = extractExistingImageUrls(processed)
  const insertedNormalizedNames = new Set<string>()

  for (const product of products) {
    if (!product?.name || !product?.image_url) continue

    if (existingUrls.has(product.image_url)) continue

    const resolved = product.image_url
    if (!resolved) continue

    if (existingUrls.has(resolved)) continue

    const normalized = normalizeProductName(product.name)
    const normalizedKey = normalized.toLowerCase().trim()
    if (normalizedKey && insertedNormalizedNames.has(normalizedKey)) continue

    const namesToTry = [product.name, normalized].filter(
      (n, i, arr) => n && n.length >= 4 && /[a-z0-9]/i.test(n) && arr.indexOf(n) === i,
    )

    if (hasImageWithName(processed, namesToTry)) continue

    const mention = findFirstMention(processed, namesToTry)
    if (!mention) continue
    if (isTableLine(processed, mention.index)) continue

    const displayName = normalized || product.name
    const proxiedUrl = getProxiedImageUrl(resolved) || resolved

    const prefixStart = findFormattingPrefixStart(processed, mention.index)
    let insertPos: number
    let imageMarkdown: string
    if (prefixStart !== -1) {
      insertPos = prefixStart
      imageMarkdown = `![${displayName}](${proxiedUrl})\n\n`
    } else {
      insertPos = findLineEnd(processed, mention.index + mention.length)
      imageMarkdown = `\n\n![${displayName}](${proxiedUrl})\n`
    }

    processed = processed.substring(0, insertPos) + imageMarkdown + processed.substring(insertPos)
    existingUrls.add(product.image_url)
    existingUrls.add(resolved)
    existingUrls.add(proxiedUrl)
    if (normalizedKey) insertedNormalizedNames.add(normalizedKey)
  }

  return processed
}
