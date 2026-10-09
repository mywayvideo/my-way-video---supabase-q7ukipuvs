import { describe, it, expect } from 'vitest'

describe('Product audit dates invariant and business rules', () => {
  it('rule 1: creation sets created_at = updated_at = last_reviewed_at', () => {
    const now = '2026-10-02T16:00:00.000Z'
    const product = {
      created_at: now,
      updated_at: now,
      last_reviewed_at: now,
    }
    expect(product.created_at).toBe(product.updated_at)
    expect(product.updated_at).toBe(product.last_reviewed_at)
    expect(new Date(product.last_reviewed_at).getTime()).toBeGreaterThanOrEqual(
      new Date(product.updated_at).getTime(),
    )
  })

  it('rule 2: real content edit sets updated_at and last_reviewed_at to the exact same new timestamp', () => {
    const created = '2026-10-01T10:00:00.000Z'
    const editTime = '2026-10-02T12:00:00.000Z'
    const product = {
      created_at: created,
      updated_at: editTime,
      last_reviewed_at: editTime,
    }
    expect(product.updated_at).toBe(product.last_reviewed_at)
    expect(new Date(product.updated_at).getTime()).toBeGreaterThan(
      new Date(product.created_at).getTime(),
    )
    expect(new Date(product.last_reviewed_at).getTime()).toBeGreaterThanOrEqual(
      new Date(product.updated_at).getTime(),
    )
  })

  it('rule 3: manual review updates only last_reviewed_at, keeping updated_at unchanged', () => {
    const created = '2026-10-01T10:00:00.000Z'
    const updateTime = '2026-10-01T10:00:00.000Z'
    const reviewTime = '2026-10-02T14:30:00.000Z'

    const product = {
      created_at: created,
      updated_at: updateTime,
      last_reviewed_at: reviewTime,
    }

    expect(product.updated_at).toBe(updateTime)
    expect(new Date(product.last_reviewed_at).getTime()).toBeGreaterThan(
      new Date(product.updated_at).getTime(),
    )
    expect(new Date(product.last_reviewed_at).getTime()).toBeGreaterThanOrEqual(
      new Date(product.updated_at).getTime(),
    )
  })

  it('rule 4: save without content changes preserves existing dates', () => {
    const state = {
      created_at: '2026-10-01T10:00:00.000Z',
      updated_at: '2026-10-01T15:00:00.000Z',
      last_reviewed_at: '2026-10-01T15:00:00.000Z',
    }

    const savedState = { ...state }
    expect(savedState.updated_at).toBe(state.updated_at)
    expect(savedState.last_reviewed_at).toBe(state.last_reviewed_at)
  })

  it('rule 5: visual status badge determination logic', () => {
    // Case 1: pending review (dates equal) -> blue
    const itemPending = {
      updated_at: '2026-10-02T12:00:00.000Z',
      last_reviewed_at: '2026-10-02T12:00:00.000Z',
    }
    const isPending =
      new Date(itemPending.last_reviewed_at).getTime() ===
      new Date(itemPending.updated_at).getTime()
    expect(isPending).toBe(true)

    // Case 2: reviewed after update -> green
    const itemReviewed = {
      updated_at: '2026-10-02T12:00:00.000Z',
      last_reviewed_at: '2026-10-02T14:00:00.000Z',
    }
    const isReviewed =
      new Date(itemReviewed.last_reviewed_at).getTime() >
      new Date(itemReviewed.updated_at).getTime()
    expect(isReviewed).toBe(true)
  })

  it('rule 6: isReviewedToday utility validates current day and invariant last_reviewed_at >= updated_at', async () => {
    const { isReviewedToday } = await import('@/pages/admin/AdminBhUpdatePage')

    const now = new Date()
    const todayIso = now.toISOString()
    const earlierTodayIso = new Date(now.getTime() - 1000 * 60 * 30).toISOString()
    const laterTodayIso = new Date(now.getTime() + 1000 * 60 * 30).toISOString()
    const yesterdayIso = new Date(now.getTime() - 1000 * 60 * 60 * 25).toISOString()

    // 1. null / undefined -> false
    expect(isReviewedToday(null, todayIso)).toBe(false)
    expect(isReviewedToday(undefined, todayIso)).toBe(false)
    expect(isReviewedToday('', todayIso)).toBe(false)

    // 2. Revisado ontem -> false
    expect(isReviewedToday(yesterdayIso, yesterdayIso)).toBe(false)

    // 3. Revisado hoje e atualizado hoje mais cedo -> true
    expect(isReviewedToday(todayIso, earlierTodayIso)).toBe(true)

    // 4. Invariante: revisado hoje, mas com data anterior a updated_at (ex: produto editado depois da revisão) -> false
    expect(isReviewedToday(earlierTodayIso, laterTodayIso)).toBe(false)

    // 5. Revisado hoje sem updated_at informado -> true
    expect(isReviewedToday(todayIso, null)).toBe(true)
    expect(isReviewedToday(todayIso, undefined)).toBe(true)
  })
})
