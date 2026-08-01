import { useState } from 'react'

interface MarkdownImageProps {
  src: string
  alt: string
  className?: string
}

export function MarkdownImage({ src, alt, className }: MarkdownImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed || !src) return null

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={className ?? 'max-w-full h-auto rounded-lg my-2'}
      loading="lazy"
    />
  )
}
