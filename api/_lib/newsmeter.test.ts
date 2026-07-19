import { describe, expect, it } from 'vitest'
import { isAdminTokenAuthorized, safeEqual } from './newsmeter'

describe('NewsMeter administrative permissions', () => {
  it('accepts only the exact bearer token', () => {
    expect(isAdminTokenAuthorized('Bearer segredo-forte', 'segredo-forte')).toBe(true)
    expect(isAdminTokenAuthorized('Bearer segredo-errado', 'segredo-forte')).toBe(false)
    expect(isAdminTokenAuthorized('segredo-forte', 'segredo-forte')).toBe(false)
  })

  it('compares equal-length secrets without permissive prefixes', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true)
    expect(safeEqual('abc123', 'abc124')).toBe(false)
    expect(safeEqual('abc', 'abc123')).toBe(false)
  })
})
