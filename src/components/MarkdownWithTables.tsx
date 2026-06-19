import React from 'react'

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
    const pipeCount = raw.split('|').length - 1
    if (pipeCount < 2) break
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    const isSeparator = cells.every((cell) => /^:?-{2,}:?$/.test(cell))

    // header vem SEMPRE antes do separator
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
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: '1px solid #444',
    padding: '12px 8px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  }
  if (rows.length === 0) return null

  return (
    <div style={{ overflowX: 'auto', width: '100%', margin: '1em 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {rows[0].cells.map((header, index) => (
              <th key={index} style={thStyle}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.cells.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{
                    border: '1px solid #ccc',
                    padding: '12px 8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cell}
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

const parseMarkdown = (lines: string[]): React.ReactNode[] => {
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    let line = lines[i]
    let trimmed = line.trim()

    if (trimmed === '') {
      i++
      continue
    }

    if (trimmed.startsWith('# ')) {
      elements.push(<h1 key={elements.length}>{trimmed.slice(2).trim()}</h1>)
      i++
      continue
    }
    if (trimmed.startsWith('## ')) {
      elements.push(<h2 key={elements.length}>{trimmed.slice(3).trim()}</h2>)
      i++
      continue
    }
    if (trimmed.startsWith('### ')) {
      elements.push(<h3 key={elements.length}>{trimmed.slice(4).trim()}</h3>)
      i++
      continue
    }
    if (trimmed.startsWith('#### ')) {
      elements.push(<h4 key={elements.length}>{trimmed.slice(5).trim()}</h4>)
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
      while (lines[i + 1] !== undefined && lines[i + 1].trim() === '') {
        i++
      }
      const tableResult = parseTable(i, lines)
      elements.push(<TableBlock key={elements.length} rows={tableResult.rows} />)
      i = tableResult.end
      continue
    }

    if (isListStart(line)) {
      const listItems: React.ReactNode[] = []
      const isOrdered = /^\d+\.\s/.test(trimmed)
      let currentI = i

      while (i < lines.length && isListStart(lines[i])) {
        let itemLine = lines[i].trim()
        let itemText: string

        if (isOrdered) {
          itemText = itemLine.replace(/^\d+\.\s+/, '').trim()
        } else {
          itemText = itemLine.slice(2).trim()
        }

        listItems.push(<li key={listItems.length}>{itemText}</li>)
        i++
      }

      const listKey = `list-${currentI}`
      const listElement = isOrdered ? (
        <ol key={listKey}>{listItems}</ol>
      ) : (
        <ul key={listKey}>{listItems}</ul>
      )

      elements.push(listElement)
      continue
    }

    let paraLines: string[] = [line]
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
      <p key={elements.length} style={{ margin: '1em 0' }}>
        {paraText}
      </p>,
    )
  }

  return elements
}

interface MarkdownWithTablesProps {
  markdown: string
  className?: string
}

const MarkdownWithTables: React.FC<MarkdownWithTablesProps> = ({ markdown, className = '' }) => {
  const lines = markdown.split(/\r?\n/)
  const content = parseMarkdown(lines)

  return (
    <div className={className} style={{ fontFamily: 'sans-serif', lineHeight: 1.6 }}>
      {content}
    </div>
  )
}

export default MarkdownWithTables
export { TableBlock }
