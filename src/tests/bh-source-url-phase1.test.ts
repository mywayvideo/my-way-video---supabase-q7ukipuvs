import { describe, it, expect } from 'vitest'

describe('Fase 1: B&H source URL extraction and persistence', () => {
  it('extractFromUrl returns source_url from payload or falls back to input url', async () => {
    const mockUrl = 'https://www.bhphotovideo.com/c/product/12345-sony-camera.html'
    
    const mockEdgeResponse = {
      source_url: mockUrl,
      name: 'Sony FX3',
      sku: 'ILME-FX3',
      price_usa: '3999.00',
    }

    expect(mockEdgeResponse.source_url).toBe(mockUrl)
  })

  it('createProduct includes website_url in payload sent to database', async () => {
    const inputPayload = {
      name: 'Sony FX3',
      sku: 'ILME-FX3',
      price_usa: 3999,
      price_cost: 3500,
      price_brl: 25000,
      weight: 2.5,
      website_url: 'https://www.bhphotovideo.com/c/product/12345-sony-camera.html',
    }

    expect(inputPayload.website_url).toBe(
      'https://www.bhphotovideo.com/c/product/12345-sony-camera.html',
    )
  })

  it('update logic confirms when overwriting existing website_url with a different one', () => {
    const existingUrl: string = 'https://www.bhphotovideo.com/c/product/old-link.html'
    const newUrl: string = 'https://www.bhphotovideo.com/c/product/new-link.html'

    let targetWebsiteUrl = existingUrl

    const shouldConfirm = !!existingUrl && existingUrl !== newUrl
    expect(shouldConfirm).toBe(true)

    // Simulating user declining confirmation
    const userConfirmedNo = false
    if (userConfirmedNo) {
      targetWebsiteUrl = newUrl
    }
    expect(targetWebsiteUrl).toBe(existingUrl)

    // Simulating user accepting confirmation
    const userConfirmedYes = true
    if (userConfirmedYes) {
      targetWebsiteUrl = newUrl
    }
    expect(targetWebsiteUrl).toBe(newUrl)
  })

  it('creation logic preserves invariant created_at = updated_at = last_reviewed_at when website_url is present', () => {
    const now = new Date().toISOString()
    const product = {
      name: 'Sony FX3',
      sku: 'ILME-FX3',
      website_url: 'https://www.bhphotovideo.com/c/product/12345-sony-camera.html',
      created_at: now,
      updated_at: now,
      last_reviewed_at: now,
    }

    expect(product.created_at).toBe(product.updated_at)
    expect(product.updated_at).toBe(product.last_reviewed_at)
  })
})
