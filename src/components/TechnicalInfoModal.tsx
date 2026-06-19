import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import MarkdownWithTables from '@/components/MarkdownWithTables'

interface TechnicalInfoModalProps {
  isOpen: boolean
  onClose: () => void
  technicalInfo: string | any
}

function formatObjectToMarkdown(obj: any, depth = 0): string {
  let md = ''
  const indent = '  '.repeat(depth)

  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (typeof item === 'object' && item !== null) {
        md += formatObjectToMarkdown(item, depth)
      } else {
        md += `${indent}- ${item}\n`
      }
    })
    return md
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      md += `${indent}- **${key}**:\n`
      md += formatObjectToMarkdown(value, depth + 1)
    } else {
      md += `${indent}- **${key}**: ${value}\n`
    }
  }

  return md
}

const markdownComponents = {
  h1: ({ node, ...props }: any) => (
    <h2 className="text-[1.25rem] font-[600] mt-[1rem] mb-[0.5rem]" {...props} />
  ),
  h2: ({ node, ...props }: any) => (
    <h3 className="text-[1.125rem] font-[600] mt-[0.875rem] mb-[0.5rem]" {...props} />
  ),
  h3: ({ node, ...props }: any) => (
    <h4 className="text-[1rem] font-[600] mt-[0.75rem] mb-[0.5rem]" {...props} />
  ),
  h4: ({ node, ...props }: any) => (
    <h5 className="text-[0.875rem] font-[600] mt-[0.5rem] mb-[0.5rem]" {...props} />
  ),
  h5: ({ node, ...props }: any) => (
    <h6 className="text-[0.875rem] font-[600] mt-[0.5rem] mb-[0.5rem]" {...props} />
  ),
  h6: ({ node, ...props }: any) => (
    <h6 className="text-[0.875rem] font-[600] mt-[0.5rem] mb-[0.5rem]" {...props} />
  ),
  p: ({ node, ...props }: any) => <p className="my-[0.5rem] leading-[1.6]" {...props} />,
  ul: ({ node, ...props }: any) => <ul className="pl-[1.5rem] my-[0.5rem] list-disc" {...props} />,
  ol: ({ node, ...props }: any) => (
    <ol className="pl-[1.5rem] my-[0.5rem] list-decimal" {...props} />
  ),
  li: ({ node, ...props }: any) => <li className="my-[0.25rem] leading-[1.5]" {...props} />,
  strong: ({ node, ...props }: any) => <strong className="font-[700]" {...props} />,
  em: ({ node, ...props }: any) => <em className="italic" {...props} />,
  code: ({ node, className, children, ...props }: any) => (
    <code
      className={cn(
        'bg-muted px-[0.5rem] py-[0.25rem] font-mono text-[0.875rem] rounded-[0.25rem]',
        className,
      )}
      {...props}
    >
      {children}
    </code>
  ),
  br: ({ node, ...props }: any) => <br {...props} />,
}

export function TechnicalInfoModal({ isOpen, onClose, technicalInfo }: TechnicalInfoModalProps) {
  if (!technicalInfo) return null

  let formattedInfo = technicalInfo
  if (typeof technicalInfo === 'string') {
    try {
      const parsed = JSON.parse(technicalInfo)
      if (typeof parsed === 'object' && parsed !== null) {
        formattedInfo = formatObjectToMarkdown(parsed)
      }
    } catch (e) {
      // Not a JSON string, keep as is
    }
  } else if (typeof technicalInfo === 'object' && technicalInfo !== null) {
    formattedInfo = formatObjectToMarkdown(technicalInfo)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col sm:rounded-xl bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl shadow-black/50 p-6 md:p-10">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Informações Técnicas</DialogTitle>
          <DialogDescription className="sr-only">
            Especificações técnicas detalhadas do produto
          </DialogDescription>
        </DialogHeader>
        <div
          className="prose prose-invert max-w-none text-sm leading-tight"
          style={{
            maxHeight: '600px',
            overflowY: 'auto',
            padding: '1.5rem',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
          }}
        >
          <MarkdownWithTables markdown={String(formattedInfo)} />
        </div>
        <DialogFooter className="mt-6">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
