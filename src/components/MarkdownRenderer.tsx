import { useMemo, type ReactNode } from 'react'
import { MarkdownImage } from './MarkdownImage'

interface MarkdownRendererProps {
  content: string
  className?: string
}

function parseInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let remaining = text
  let idx = 0

  while (remaining.length > 0) {
    const img = remaining.match(/^!\[([^\]]*)\]\(([^)\s]+)\)/)
    if (img) {
      nodes.push(
        <MarkdownImage
          key={`${keyBase}-img-${idx}`}
          src={img[2]}
          alt={img[1]}
          className="max-w-full h-auto rounded-lg my-2"
        />,
      )
      remaining = remaining.slice(img[0].length)
      idx++
      continue
    }

    const link = remaining.match(/^\[([^\]]+)\]\(([^)\s]+)\)/)
    if (link) {
      nodes.push(
        <a
          key={`${keyBase}-link-${idx}`}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          {link[1]}
        </a>,
      )
      remaining = remaining.slice(link[0].length)
      idx++
      continue
    }

    const bold = remaining.match(/^\*\*(.+?)\*\*/)
    if (bold) {
      nodes.push(<strong key={`${keyBase}-b-${idx}`}>{bold[1]}</strong>)
      remaining = remaining.slice(bold[0].length)
      idx++
      continue
    }

    const code = remaining.match(/^`([^`]+)`/)
    if (code) {
      nodes.push(
        <code key={`${keyBase}-c-${idx}`} className="bg-muted px-1.5 py-0.5 rounded text-sm">
          {code[1]}
        </code>,
      )
      remaining = remaining.slice(code[0].length)
      idx++
      continue
    }

    const italic = remaining.match(/^\*(.+?)\*/)
    if (italic) {
      nodes.push(<em key={`${keyBase}-i-${idx}`}>{italic[1]}</em>)
      remaining = remaining.slice(italic[0].length)
      idx++
      continue
    }

    const next = remaining.search(/[!*[`]/)
    if (next === -1) {
      nodes.push(remaining)
      break
    }
    if (next > 0) {
      nodes.push(remaining.slice(0, next))
      remaining = remaining.slice(next)
    } else {
      nodes.push(remaining[0])
      remaining = remaining.slice(1)
    }
    idx++
  }

  return nodes
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const elements = useMemo(() => {
    if (!content) return []
    const text = content.replace(/\r\n/g, '\n')
    const lines = text.split('\n')
    const result: ReactNode[] = []
    let i = 0
    let key = 0

    while (i < lines.length) {
      const line = lines[i]

      const h = line.match(/^(#{1,4})\s+(.+)$/)
      if (h) {
        const lvl = h[1].length
        const parsed = parseInline(h[2], `h-${key}`)
        if (lvl === 1)
          result.push(
            <h1 key={key++} className="font-bold text-xl mt-3 mb-1">
              {parsed}
            </h1>,
          )
        else if (lvl === 2)
          result.push(
            <h2 key={key++} className="font-bold text-lg mt-3 mb-1">
              {parsed}
            </h2>,
          )
        else if (lvl === 3)
          result.push(
            <h3 key={key++} className="font-bold text-base mt-2 mb-1">
              {parsed}
            </h3>,
          )
        else
          result.push(
            <h4 key={key++} className="font-bold text-sm mt-2 mb-1">
              {parsed}
            </h4>,
          )
        i++
        continue
      }

      if (/^---+\s*$/.test(line)) {
        result.push(<hr key={key++} className="my-3 border-border" />)
        i++
        continue
      }

      if (/^[-*]\s+/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, ''))
          i++
        }
        result.push(
          <ul key={key++} className="list-disc pl-5 my-2 space-y-1">
            {items.map((it, idx) => (
              <li key={idx}>{parseInline(it, `ul-${key}-${idx}`)}</li>
            ))}
          </ul>,
        )
        continue
      }

      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = []
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ''))
          i++
        }
        result.push(
          <ol key={key++} className="list-decimal pl-5 my-2 space-y-1">
            {items.map((it, idx) => (
              <li key={idx}>{parseInline(it, `ol-${key}-${idx}`)}</li>
            ))}
          </ol>,
        )
        continue
      }

      if (line.trim() === '') {
        i++
        continue
      }

      const para: string[] = []
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^#{1,4}\s/.test(lines[i]) &&
        !/^[-*]\s/.test(lines[i]) &&
        !/^\d+\.\s/.test(lines[i]) &&
        !/^---+\s*$/.test(lines[i])
      ) {
        para.push(lines[i])
        i++
      }
      result.push(
        <p key={key++} className="my-1 leading-relaxed">
          {parseInline(para.join(' '), `p-${key}`)}
        </p>,
      )
    }

    return result
  }, [content])

  return <div className={className}>{elements}</div>
}
