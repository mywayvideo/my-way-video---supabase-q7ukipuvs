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
      if (isInsideBold(text, match.index)) continue
      if (isInsideHeading(text, match.index)) continue
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

    const resolved = product.image_url
    if (!resolved) continue

    if (existingUrls.has(resolved)) continue

    const normalized = normalizeProductName(product.name)
    const namesToTry = [product.name, normalized].filter(
      (n, i, arr) => n && n.length >= 4 && /[a-z0-9]/i.test(n) && arr.indexOf(n) === i,
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

  return processed
}
