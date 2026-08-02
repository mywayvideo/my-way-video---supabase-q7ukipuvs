export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function sanitizeEmptyHeadings(text: string): string {
  return text
    .split('\n')
    .map((line) => (/^#{1,6}\s*$/.test(line.trim()) ? '' : line))
    .join('\n')
}

const IMG_REGEX = /!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g
const IMG_TEST = /!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/

export function separateImagesFromHeadings(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^#{1,6}\s+/.test(trimmed) && IMG_TEST.test(trimmed)) {
      const images = trimmed.match(IMG_REGEX) || []
      const headingText = trimmed.replace(IMG_REGEX, '').replace(/\s+/g, ' ').trim()
      for (const img of images) {
        result.push('', img, '')
      }
      if (/^#{1,6}\s+\S/.test(headingText)) {
        result.push(headingText)
      }
    } else {
      result.push(line)
    }
  }
  return result.join('\n')
}

export function cleanHtmlImages(text: string): string {
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

export function cleanBrokenMarkdownImages(text: string): string {
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

export function isImageUrl(url: string): boolean {
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

export function fixMissingImageBangs(text: string): string {
  return text.replace(
    /(?<!!)(?<!\\)\[([^\]]*)\]\(([^)\s]*?)(?:\s+"[^"]*")?\)/g,
    (match, alt: string, url: string) => {
      if (!isImageUrl(url)) return match
      return `![${alt}](${url})`
    },
  )
}

export function extractExistingImageUrls(text: string): Set<string> {
  const urls = new Set<string>()
  const regex = /!\[[^\]]*\]\(((?:[^()]|\([^()]*\))*)\)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    urls.add(match[1])
  }
  return urls
}
