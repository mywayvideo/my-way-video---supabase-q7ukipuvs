import React, { useEffect, useMemo, useState } from 'react'
import { getProxiedImageUrl, proxyMarkdownImages } from '@/lib/image-proxy'
import { debugLog, debugGroup, debugGroupEnd } from '@/utils/debug-front'

function extractOriginalFromProxy(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.pathname.includes('image-proxy')) {
      return parsed.searchParams.get('url')
    }
  } catch {
    return null
  }
  return null
}

function getDirectProxyUrl(url: string): string | null {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
    if (!supabaseUrl || !supabaseKey) return null
    const proxyUrl = new URL(`${supabaseUrl}/functions/v1/image-proxy`)
    proxyUrl.searchParams.set('url', url)
    proxyUrl.searchParams.set('apikey', supabaseKey)
    return proxyUrl.toString()
  } catch {
    return null
  }
}

function getFallbackUrl(src: string): string | null {
  const original = extractOriginalFromProxy(src)
  if (original) return original
  const proxied = getProxiedImageUrl(src)
  if (proxied && proxied !== src) return proxied
  return getDirectProxyUrl(src)
}

const ProductImageSkeleton: React.FC<{ src: string; alt: string; thumbnail?: boolean }> = ({
  src,
  alt,
  thumbnail = false,
}) => {
  const [currentSrc, setCurrentSrc] = useState(src)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [triedFallback, setTriedFallback] = useState(false)

  useEffect(() => {
    setCurrentSrc(src)
    setStatus('loading')
    setTriedFallback(false)
  }, [src])

  const handleError = () => {
    if (!triedFallback) {
      const fallback = getFallbackUrl(currentSrc)
      if (fallback) {
        setTriedFallback(true)
        setCurrentSrc(fallback)
        setStatus('loading')
        return
      }
    }
    setStatus('error')
  }

  if (thumbnail) {
    return (
      <span className="flex items-center justify-center align-middle shrink-0 w-full">
        {status === 'loading' && (
          <span className="flex w-10 h-10 rounded shrink-0 animate-pulse bg-zinc-800/80" />
        )}
        {status === 'error' ? (
          <span className="flex w-10 h-10 rounded shrink-0 bg-zinc-800/60 items-center justify-center">
            <span className="text-zinc-600 text-[10px]">N/A</span>
          </span>
        ) : (
          <img
            src={currentSrc}
            alt={alt}
            className="w-10 h-10 rounded object-contain shrink-0"
            style={{ display: status === 'loading' ? 'none' : 'block' }}
            onLoad={() => setStatus('loaded')}
            onError={handleError}
          />
        )}
      </span>
    )
  }

  return (
    <span className="block align-top" style={{ width: 'fit-content' }}>
      {status === 'loading' && (
        <span className="flex w-40 h-28 rounded-lg animate-pulse bg-zinc-800/80" />
      )}
      {status === 'error' ? (
        <span className="flex w-40 h-28 rounded-lg bg-zinc-800/60 items-center justify-center">
          <span className="text-zinc-500 text-xs">Imagem indisponível</span>
        </span>
      ) : (
        <img
          src={currentSrc}
          alt={alt}
          className="max-w-full h-auto rounded-lg max-h-48"
          style={{ display: status === 'loading' ? 'none' : 'block' }}
          onLoad={() => setStatus('loaded')}
          onError={handleError}
        />
      )}
    </span>
  )
}

function parseInline(text: string, isTable: boolean = false): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const regex =
    /(!\[([^\]]*)\]\(((?:[^()]|\([^()]*\))*)\))|(\[([^\]]+)\]\(([^)]*)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.substring(lastIndex, match.index))
    }

    if (match[1]) {
      const imgAlt = match[2]
      const imgSrc = match[3]
      if (imgAlt.startsWith('PRODUCT_IMAGE:')) {
        nodes.push(
          <ProductImageSkeleton
            key={key++}
            src={imgSrc}
            alt={imgAlt.replace('PRODUCT_IMAGE:', '')}
            thumbnail={isTable}
          />,
        )
      } else {
        nodes.push(
          <ProductImageSkeleton key={key++} src={imgSrc} alt={imgAlt} thumbnail={isTable} />,
        )
      }
    } else if (match[4]) {
      nodes.push(
        <a
          key={key++}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#60a5fa', textDecoration: 'underline' }}
        >
          {match[5]}
        </a>,
      )
    } else if (match[7]) {
      nodes.push(
        <strong key={key++} style={{ fontWeight: 700 }}>
          {match[8]}
        </strong>,
      )
    } else if (match[9]) {
      nodes.push(
        <em key={key++} style={{ fontStyle: 'italic' }}>
          {match[10]}
        </em>,
      )
    } else if (match[11]) {
      nodes.push(
        <code
          key={key++}
          style={{
            backgroundColor: '#27272a',
            color: '#4ade80',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '0.875em',
          }}
        >
          {match[12]}
        </code>,
      )
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex))
  }

  return nodes
}

interface TableRow {
  cells: string[]
}

interface ParseTableResult {
  rows: TableRow[]
  end: number
}

const parseTable = (start: number, lines: string[]): ParseTableResult => {
  const rows: TableRow[] = []
  let j = start

  while (j < lines.length) {
    const raw = lines[j]
    const line = raw.trim()
    if (line === '') {
      j++
      continue
    }
    const pipeCount = raw.split('|').length - 1
    if (pipeCount < 2) break
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    const isSeparator = cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell))

    if (!isSeparator) {
      rows.push({ cells })
    }
    j++
  }

  return { rows, end: j }
}

interface TableBlockProps {
  rows: TableRow[]
}

const TableBlock: React.FC<TableBlockProps> = ({ rows }) => {
  const thStyle: React.CSSProperties = {
    backgroundColor: '#1e293b',
    color: '#f1f5f9',
    border: '1px solid #475569',
    padding: '10px 14px',
    textAlign: 'left',
    fontWeight: 600,
    verticalAlign: 'top',
    overflowWrap: 'break-word',
  }
  const tdStyle: React.CSSProperties = {
    border: '1px solid #475569',
    padding: '10px 14px',
    verticalAlign: 'top',
    overflowWrap: 'break-word',
  }
  if (rows.length === 0) return null

  const headerCellCount = rows[0].cells.length

  return (
    <div style={{ overflowX: 'auto', width: '100%', margin: '1em 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto' }}>
        <thead>
          <tr>
            {rows[0].cells.map((header, index) => (
              <th key={index} style={thStyle}>
                {parseInline(header, true)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: headerCellCount }).map((_, cellIndex) => (
                <td key={cellIndex} style={tdStyle}>
                  {parseInline(row.cells[cellIndex] || '', true)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const isCodeStart = (line: string): boolean => {
  return line.trim().startsWith('```')
}

const isTableStart = (line: string): boolean => {
  const t = line.trim()
  const pipeCount = (t.match(/\|/g) || []).length
  return t.startsWith('|') && pipeCount >= 2
}

const isListStart = (line: string): boolean => {
  const t = line.trim()
  return t.startsWith('- ') || t.startsWith('* ') || /^\d+\.\s/.test(t)
}

const GREEN_400 = 'rgb(74 222 128)'

const parseMarkdown = (lines: string[]): React.ReactNode[] => {
  const h3Count = lines.filter((l) => l.trim().startsWith('### ')).length
  const imgCount = lines.filter((l) => /!\[/.test(l)).length
  const tableLineCount = lines.filter((l) => l.trim().startsWith('|')).length
  debugLog(
    'parseMarkdown:input',
    `lines=${lines.length} h3Headings=${h3Count} imageLines=${imgCount} tableLines=${tableLineCount}`,
  )
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') {
      i++
      continue
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={elements.length} style={{ margin: '0.5em 0' }}>
          {parseInline(trimmed.slice(2).trim())}
        </h1>,
      )
      i++
      continue
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={elements.length} style={{ color: GREEN_400, margin: '0.75em 0 0.5em' }}>
          {parseInline(trimmed.slice(3).trim())}
        </h2>,
      )
      i++
      continue
    }
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={elements.length} style={{ color: GREEN_400, margin: '0.75em 0 0.5em' }}>
          {parseInline(trimmed.slice(4).trim())}
        </h3>,
      )
      i++
      continue
    }
    if (trimmed.startsWith('#### ')) {
      elements.push(
        <h4 key={elements.length} style={{ margin: '0.5em 0' }}>
          {parseInline(trimmed.slice(5).trim())}
        </h4>,
      )
      i++
      continue
    }

    if (isCodeStart(line)) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !isCodeStart(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      elements.push(
        <pre
          key={elements.length}
          style={{
            backgroundColor: '#f6f8fa',
            padding: '16px',
            overflowX: 'auto',
            borderRadius: '6px',
            margin: '1em 0',
          }}
        >
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    if (isTableStart(line)) {
      const tableResult = parseTable(i, lines)
      elements.push(<TableBlock key={elements.length} rows={tableResult.rows} />)
      i = Math.max(tableResult.end, i + 1)
      continue
    }

    if (isListStart(line)) {
      const listItems: React.ReactNode[] = []
      const isOrdered = /^\d+\.\s/.test(trimmed)
      const currentI = i

      while (i < lines.length && isListStart(lines[i])) {
        const itemLine = lines[i].trim()
        let itemText: string

        if (isOrdered) {
          itemText = itemLine.replace(/^\d+\.\s+/, '').trim()
        } else {
          itemText = itemLine.slice(2).trim()
        }

        listItems.push(<li key={listItems.length}>{parseInline(itemText)}</li>)
        i++
      }

      const listKey = `list-${currentI}`
      const listElement = isOrdered ? (
        <ol key={listKey} style={{ margin: '0.5em 0', paddingLeft: '1.5em' }}>
          {listItems}
        </ol>
      ) : (
        <ul key={listKey} style={{ margin: '0.5em 0', paddingLeft: '1.5em' }}>
          {listItems}
        </ul>
      )

      elements.push(listElement)
      continue
    }

    const paraLines: string[] = [line]
    i++

    while (i < lines.length) {
      const nextLine = lines[i]
      const nextTrimmed = nextLine.trim()

      if (
        nextTrimmed === '' ||
        nextTrimmed.startsWith('# ') ||
        nextTrimmed.startsWith('## ') ||
        nextTrimmed.startsWith('### ') ||
        nextTrimmed.startsWith('#### ') ||
        isCodeStart(nextLine) ||
        isTableStart(nextLine) ||
        isListStart(nextLine)
      ) {
        break
      }

      paraLines.push(nextLine)
      i++
    }

    const paraText = paraLines
      .map((l) => l.trim())
      .join(' ')
      .trim()
    elements.push(
      <p key={elements.length} style={{ margin: '0.5em 0' }}>
        {parseInline(paraText)}
      </p>,
    )
  }

  return elements
}

interface MarkdownWithTablesProps {
  markdown: string
  className?: string
}

const IMAGE_EXTENSIONS_REGEX = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?[^\s)]*)?$/i

const fixMalformedImageMarkdown = (text: string): string => {
  const inputLen = text.length
  const imgCountBefore = (text.match(/!\[/g) || []).length
  let result = text

  // Step 1: Rejoin broken multi-line image tags (with ! prefix)
  // Handles: ![alt\n text](url), ![alt]\n(url), ![alt\n text]\n(url), ![alt](url\n part)
  result = result.replace(/!\[([^\]]*?)\]\s*\(([^)]*?)\)/g, (m, alt: string, url: string) => {
    if (!m.includes('\n') && !m.includes('\r')) return m
    const cleanAlt = alt
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const cleanUrl = url.replace(/[\s\r\n]+/g, '').trim()
    return `![${cleanAlt}](${cleanUrl})`
  })

  // Step 2: Rejoin broken multi-line link tags (without ! prefix)
  // Same patterns as Step 1 but for links — needed so Step 3 can inspect the full URL
  result = result.replace(/(?<!!)\[([^\]]*?)\]\s*\(([^)]*?)\)/g, (m, alt: string, url: string) => {
    if (!m.includes('\n') && !m.includes('\r')) return m
    const cleanAlt = alt
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const cleanUrl = url.replace(/[\s\r\n]+/g, '').trim()
    return `[${cleanAlt}](${cleanUrl})`
  })

  // Step 3: Add missing ! prefix for links whose URL ends with an image extension
  // Line-isolation rule: only convert when the link is alone on its own line
  const lines3 = result.split('\n')
  for (let k = 0; k < lines3.length; k++) {
    const line = lines3[k]
    const trimmed = line.trim()
    const match = trimmed.match(/^\[([^\]]*?)\]\(([^)]*?)\)$/)
    if (match && IMAGE_EXTENSIONS_REGEX.test(match[2].trim())) {
      const leadingWhitespace = line.substring(0, line.indexOf(trimmed))
      const trailingWhitespace = line.substring(line.indexOf(trimmed) + trimmed.length)
      lines3[k] = `${leadingWhitespace}![${match[1]}](${match[2].trim()})${trailingWhitespace}`
    }
  }
  result = lines3.join('\n')

  // Step 4: Collapse any double ! prefixes introduced by previous steps (idempotency guard)
  result = result.replace(/!{2,}\[/g, '![')

  const imgCountAfter = (result.match(/!\[/g) || []).length
  debugLog(
    'fixMalformedImageMarkdown',
    `inputLen=${inputLen} outputLen=${result.length} imgTagsBefore=${imgCountBefore} imgTagsAfter=${imgCountAfter}`,
  )
  return result
}

const fixBrokenImageMarkdown = (text: string): string => {
  const inputLen = text.length
  let repairedCount = 0
  const result = text.replace(
    /!\[([^\]]*)\]\(((?:[^()]|\([^()]*\))*)\)/g,
    (match, alt: string, url: string) => {
      if (!match.includes('\n')) return match
      repairedCount++
      const fixedAlt = alt.replace(/\r?\n/g, ' ').trim()
      const fixedUrl = url.replace(/\r?\n/g, '').trim()
      return `![${fixedAlt}](${fixedUrl})`
    },
  )
  debugLog(
    'fixBrokenImageMarkdown',
    `inputLen=${inputLen} outputLen=${result.length} repairedTags=${repairedCount}`,
  )
  return result
}

const preprocessHtmlImages = (text: string): string => {
  const inputLen = text.length
  let convertedCount = 0
  const result = text
    .replace(
      /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?\/?>/gi,
      (_match, src: string, alt: string | undefined) => {
        convertedCount++
        return `![${alt ?? ''}](${src})`
      },
    )
    .replace(
      /<img\s+[^>]*?(?:alt=["']([^"']*)["'])?[^>]*?src=["']([^"']+)["'][^>]*?\/?>/gi,
      (_match, alt: string | undefined, src: string) => {
        convertedCount++
        return `![${alt ?? ''}](${src})`
      },
    )
  debugLog(
    'preprocessHtmlImages',
    `inputLen=${inputLen} outputLen=${result.length} convertedTags=${convertedCount}`,
  )
  return result
}

const normalizeTableBlocks = (text: string): string => {
  const inputLen = text.length
  const lines = text.split(/\r?\n/)
  const result: string[] = []
  let i = 0
  let tableBlocksNormalized = 0

  const isPotentialTableLine = (line: string): boolean => {
    const trimmed = line.trim()
    if (!trimmed) return false
    const pipeCount = (trimmed.match(/\|/g) || []).length
    return pipeCount >= 2
  }

  const normalizeTableLine = (line: string): string => {
    let normalized = line.trim()
    if (!normalized.startsWith('|')) {
      normalized = '|' + normalized
    }
    if (!normalized.endsWith('|')) {
      normalized = normalized + '|'
    }
    return normalized
  }

  const getCellCount = (line: string): number => {
    const parts = line.split('|')
    if (parts[0] === '') parts.shift()
    if (parts[parts.length - 1] === '') parts.pop()
    return parts.length
  }

  const hasSeparatorLine = (block: string[]): boolean => {
    return block.some((line) => {
      const parts = line.split('|')
      if (parts[0] === '') parts.shift()
      if (parts[parts.length - 1] === '') parts.pop()
      return parts.length > 0 && parts.every((cell) => /^:?-{2,}:?$/.test(cell.trim()))
    })
  }

  while (i < lines.length) {
    if (isPotentialTableLine(lines[i])) {
      const block: string[] = []
      while (i < lines.length) {
        if (isPotentialTableLine(lines[i])) {
          block.push(lines[i])
        } else if (lines[i].trim() === '') {
          let lookAhead = i + 1
          while (lookAhead < lines.length && lines[lookAhead].trim() === '') {
            lookAhead++
          }
          if (lookAhead < lines.length && isPotentialTableLine(lines[lookAhead])) {
            // Skip blank lines between table rows
          } else {
            break
          }
        } else {
          break
        }
        i++
      }

      const normalizedBlock = block.map(normalizeTableLine)

      if (!hasSeparatorLine(normalizedBlock) && normalizedBlock.length >= 1) {
        const cellCount = Math.max(...normalizedBlock.map(getCellCount), 2)
        const separatorCells = Array(cellCount).fill('---')
        const separator = '|' + separatorCells.join('|') + '|'
        normalizedBlock.splice(1, 0, separator)
      }

      result.push(...normalizedBlock)
      tableBlocksNormalized++
    } else {
      result.push(lines[i])
      i++
    }
  }

  const output = result.join('\n')
  debugLog(
    'normalizeTableBlocks',
    `inputLen=${inputLen} outputLen=${output.length} tableBlocksNormalized=${tableBlocksNormalized}`,
  )
  return output
}

const sanitizeRenderedHeadings = (text: string): string => {
  const inputLen = text.length
  const emptyHeadingsRemoved = (text.match(/^#{1,6}\s*$/gm) || []).length
  const result = text.replace(/^#{1,6}\s*$/gm, '').replace(/\n{3,}/g, '\n\n')
  debugLog(
    'sanitizeRenderedHeadings',
    `inputLen=${inputLen} outputLen=${result.length} emptyHeadingsRemoved=${emptyHeadingsRemoved}`,
  )
  return result
}

const MarkdownWithTablesBase: React.FC<MarkdownWithTablesProps> = ({
  markdown,
  className = '',
}) => {
  const processedMarkdown = useMemo(() => {
    debugGroup('MarkdownWithTables:preprocessing', `inputLen=${markdown?.length || 0}`)
    if (import.meta.env.DEV) {
      console.time('MarkdownWithTables:processPipeline')
    }
    let step = fixMalformedImageMarkdown(markdown)
    debugLog('step:fixMalformedImageMarkdown', `outputLen=${step.length}`)
    step = fixBrokenImageMarkdown(step)
    debugLog('step:fixBrokenImageMarkdown', `outputLen=${step.length}`)
    step = preprocessHtmlImages(step)
    debugLog('step:preprocessHtmlImages', `outputLen=${step.length}`)
    step = normalizeTableBlocks(step)
    debugLog('step:normalizeTableBlocks', `outputLen=${step.length}`)
    step = sanitizeRenderedHeadings(step)
    debugLog('step:sanitizeRenderedHeadings', `outputLen=${step.length}`)
    step = proxyMarkdownImages(step)
    debugLog('step:proxyMarkdownImages', `outputLen=${step.length}`)

    const finalH3Count = (step.match(/^###\s/gm) || []).length
    const finalImgCount = (step.match(/!\[/g) || []).length
    const finalTableLines = (step.match(/^\|/gm) || []).length
    debugLog(
      'preprocessing:final',
      `h3Headings=${finalH3Count} images=${finalImgCount} tableLines=${finalTableLines}`,
    )
    debugGroupEnd()

    if (import.meta.env.DEV) {
      console.timeEnd('MarkdownWithTables:processPipeline')
    }
    return step
  }, [markdown])

  const lines = processedMarkdown.split(/\r?\n/)
  const content = parseMarkdown(lines)

  return (
    <div
      className={className}
      style={{
        fontFamily: 'sans-serif',
        lineHeight: 1.6,
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
      }}
    >
      {content}
    </div>
  )
}

const MarkdownWithTables = React.memo(MarkdownWithTablesBase)

export default MarkdownWithTables
export { TableBlock }
