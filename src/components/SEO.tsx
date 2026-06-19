import { Helmet } from 'react-helmet-async'
import { SITE_URL, DEFAULT_DESCRIPTION } from '@/constants/seo'

interface SEOProps {
  title: string
  description?: string
  image?: string
  article?: boolean
}

export function SEO({ title, description, image, article }: SEOProps) {
  const metaDescription = description || DEFAULT_DESCRIPTION
  const siteTitle = `${title} | My Way Video`

  const getAbsoluteImageUrl = (imgUrl?: string) => {
    if (!imgUrl) return `${SITE_URL}/logo.png`
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
      return imgUrl
    }
    const cleanPath = imgUrl.startsWith('/') ? imgUrl.substring(1) : imgUrl
    return `${SITE_URL}/${cleanPath}`
  }

  const ogImage = getAbsoluteImageUrl(image)
  const ogType = article ? 'article' : 'website'

  return (
    <Helmet>
      <title>{siteTitle}</title>
      <meta name="description" content={metaDescription} />

      <meta property="og:title" content={siteTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={ogImage} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={siteTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  )
}
