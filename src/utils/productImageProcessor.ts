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

function stripParentheticals(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getFirstWords(name: string, count: number): string {
  const words = name.split(/\s+/).filter((w) => w.length >= 2)
  return words.slice(0, count).join(' ').trim()
}

function getBrandModel(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length >= 2)
  if (words.length < 2) return ''
  const brand = words[0]
  const modelMatch = name.match(/\b([A-Z]{1,3}[-]?[A-Z0-9]{1,6})\b/)
  if (modelMatch) {
    return `${brand} ${modelMatch[1]}`
  }
  return getFirstWords(name, 2)
}

function generateNameVariants(productName: string): string[] {
  const variants: string[] = []
  const seen = new Set<string>()

  const addVariant = (v: string) => {
    const trimmed = v.trim()
    if (!trimmed || trimmed.length < 4 || !/[a-z0-9]/i.test(trimmed)) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    variants.push(trimmed)
  }

  addVariant(productName)
  addVariant(stripParentheticals(productName))
  addVariant(normalizeProductName(productName))
  addVariant(stripParentheticals(normalizeProductName(productName)))

  for (let i = 4; i >= 2; i--) {
    addVariant(getFirstWords(stripParentheticals(productName), i))
  }

  addVariant(getBrandModel(productName))

  return variants
}

function findHeadingMatch(
  text: string,
  names: string[],
  sectionStart: number,
  sectionEnd: number,
): { insertPos: number; matchIndex: number } | null {
  const sectionText = text.substring(sectionStart, sectionEnd)

  for (const name of names) {
    if (!name || name.length < 4) continue
    const escaped = escapeRegex(name)
    const headingRegex = new RegExp(`^(#{1,6}\\s+.*${escaped}.*)$`, 'gim')
    let match: RegExpExecArray | null
    while ((match = headingRegex.exec(sectionText)) !== null) {
      const absoluteMatchIndex = sectionStart + match.index
      const lineEnd = findLineEnd(text, absoluteMatchIndex + match[0].length)
      return { insertPos: lineEnd, matchIndex: absoluteMatchIndex }
    }
  }
  return null
}

function findBodyMatch(
  text: string,
  names: string[],
  sectionStart: number,
  sectionEnd: number,
): { insertPos: number; matchIndex: number } | null {
  const sectionText = text.substring(sectionStart, sectionEnd)

  for (const name of names) {
    if (!name || name.length < 4) continue
    if (!/[a-z0-9]/i.test(name)) continue
    const escaped = escapeRegex(name)
    const regex = new RegExp(`(?<!\\w)${escaped}`, 'gi')
    let match: RegExpExecArray | null
    while ((match = regex.exec(sectionText)) !== null) {
      const absoluteIndex = sectionStart + match.index
      if (isTableLine(text, absoluteIndex)) continue
      const lineStart = text.lastIndexOf('\n', absoluteIndex - 1) + 1
      const lineEnd = text.indexOf('\n', absoluteIndex)
      const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd)
      if (line.trim().startsWith('#')) continue
      return {
        insertPos: findLineEnd(text, absoluteIndex + match[0].length),
        matchIndex: absoluteIndex,
      }
    }
  }
  return null
}

function findProductSection(text: string): { start: number; end: number } {
  const sectionRegex = /(^|\n)(#{1,6}\s+.*Análise por Produto.*)/gi
  const match = sectionRegex.exec(text)
  if (!match) {
    return { start: 0, end: text.length }
  }

  const startLineIdx = match.index + (match[1] ? match[1].length : 0)
  const headingLevel = (match[2].match(/^#+/) || ['#'])[0].length
  const afterHeading = findLineEnd(text, startLineIdx + match[2].length)

  const nextSectionRegex = new RegExp(`\\n#{1,${headingLevel}}\\s+`, 'g')
  nextSectionRegex.lastIndex = afterHeading
  const nextMatch = nextSectionRegex.exec(text)

  const end = nextMatch ? nextMatch.index + 1 : text.length
  return { start: startLineIdx, end }
}

export function processProductImages(content: string, products: ProductImageInfo[]): string {
  if (!content) return content

  let processed = fixMissingImageBangs(content)
  processed = cleanHtmlImages(processed)
  processed = cleanBrokenMarkdownImages(processed)
  processed = proxyMarkdownImages(processed)

  const existingUrls = extractExistingImageUrls(processed)
  const insertedNormalizedNames = new Set<string>()

  const section = findProductSection(processed)

  for (const product of products) {
    if (!product?.name || !product?.image_url) continue

    if (existingUrls.has(product.image_url)) continue

    const resolved = product.image_url
    if (!resolved) continue
    if (existingUrls.has(resolved)) continue

    const normalized = normalizeProductName(product.name)
    const normalizedKey = normalized.toLowerCase().trim()
    if (normalizedKey && insertedNormalizedNames.has(normalizedKey)) continue

    const variants = generateNameVariants(product.name)

    if (hasImageWithName(processed, variants)) continue

    let match = findHeadingMatch(processed, variants, section.start, section.end)

    if (!match) {
      match = findBodyMatch(processed, variants, section.start, section.end)
    }

    if (!match) continue

    const displayName = normalized || product.name
    const proxiedUrl = getProxiedImageUrl(resolved) || resolved

    const imageMarkdown = `\n\n![${displayName}](${proxiedUrl})\n`

    processed =
      processed.substring(0, match.insertPos) + imageMarkdown + processed.substring(match.insertPos)

    existingUrls.add(product.image_url)
    existingUrls.add(resolved)
    existingUrls.add(proxiedUrl)
    if (normalizedKey) insertedNormalizedNames.add(normalizedKey)
  }

  return processed
}
