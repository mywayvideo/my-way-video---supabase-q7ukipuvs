import React from 'react'

interface Props {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: Props) {
  if (!content) return null

  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []

  const pushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc pl-5 mb-4 space-y-1">
          {listItems}
        </ul>,
      )
      listItems = []
    }
  }

  const parseInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(<li key={`li-${i}`}>{parseInline(trimmed.substring(2))}</li>)
    } else {
      pushList()
      if (trimmed) {
        elements.push(
          <p key={`p-${i}`} className="mb-4">
            {parseInline(trimmed)}
          </p>,
        )
      }
    }
  })
  pushList()

  return <div className={`leading-relaxed ${className}`}>{elements}</div>
}
