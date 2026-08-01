import { getProxiedImageUrl, proxyMarkdownImages } from '@/lib/image-proxy'

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

function fixMissingImageBangs(text: string): string {
  return text.replace(
    /(?<!!)(?<!\\)\[([^\]]*)\]\(([^)\s]*?)(?:\s+"[^"]*")?\)/g,
    (match, alt: string, url: string) => {
      if (!isImageUrl(url)) return match
      return `![${alt}](${url})`
    },
  )
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

export function processProductImages(content: string, products: ProductImageInfo[]): string {
  if (!content) return content

  let processed = fixMissingImageBangs(content)
  processed = cleanHtmlImages(processed)
  processed = cleanBrokenMarkdownImages(processed)
  processed = proxyMarkdownImages(processed)

  const productMap = new Map<string, ProductImageInfo>()
  for (const p of products) {
    if (p?.id && p?.image_url) {
      productMap.set(p.id, p)
    }
  }

  const existingUrls = extractExistingImageUrls(processed)
  const insertedUuids = new Set<string>()

  processed = processed.replace(
    /<!--\s*PRODUCT_IMAGE:([0-9a-fA-F-]{36})\s*-->/g,
    (match, uuid: string, offset: number) => {
      const product = productMap.get(uuid)
      if (!product || !product.image_url) return ''
      if (insertedUuids.has(uuid)) return ''

      const proxiedUrl = getProxiedImageUrl(product.image_url) || product.image_url
      if (existingUrls.has(proxiedUrl) || existingUrls.has(product.image_url)) return ''

      insertedUuids.add(uuid)
      existingUrls.add(proxiedUrl)
      existingUrls.add(product.image_url)

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

  return processed
}
