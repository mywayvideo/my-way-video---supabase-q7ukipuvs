import React from 'react'

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const regex =
    /(!\[([^\]]*)\]\(((?:[^()]*|\([^()]*\))*)\))|(\[([^\]]+)\]\(([^)]*)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.substring(lastIndex, match.index))
    }

    if (match[1]) {
      nodes.push(
        <img
          key={key++}
          src={match[3]}
          alt={match[2]}
          className="max-w-full h-auto rounded-lg my-2"
        />,
      )
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
                {parseInline(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: headerCellCount }).map((_, cellIndex) => (
                <td key={cellIndex} style={tdStyle}>
                  {parseInline(row.cells[cellIndex] || '')}
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
  return t.startsWith('|') && t.includes('|')
}

const isListStart = (line: string): boolean => {
  const t = line.trim()
  return t.startsWith('- ') || t.startsWith('* ') || /^\d+\.\s/.test(t)
}

const GREEN_400 = 'rgb(74 222 128)'

const parseMarkdown = (lines: string[]): React.ReactNode[] => {
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
      i = tableResult.end
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

const preprocessHtmlImages = (text: string): string => {
  return text
    .replace(
      /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?\/?>/gi,
      (_match, src: string, alt: string | undefined) => {
        return `![${alt ?? ''}](${src})`
      },
    )
    .replace(
      /<img\s+[^>]*?(?:alt=["']([^"']*)["'])?[^>]*?src=["']([^"']+)["'][^>]*?\/?>/gi,
      (_match, alt: string | undefined, src: string) => {
        return `![${alt ?? ''}](${src})`
      },
    )
}

const normalizeTableBlocks = (text: string): string => {
  const lines = text.split(/\r?\n/)
  const result: string[] = []
  let i = 0

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
    } else {
      result.push(lines[i])
      i++
    }
  }

  return result.join('\n')
}

const MarkdownWithTables: React.FC<MarkdownWithTablesProps> = ({ markdown, className = '' }) => {
  const processedMarkdown = normalizeTableBlocks(preprocessHtmlImages(markdown))
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

export default MarkdownWithTables
export { TableBlock }
