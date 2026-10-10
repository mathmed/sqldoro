import { describe, expect, it } from 'vitest'

import { placeUnder, popupPlace } from './popup.ts'

function rect(left: number, right: number): DOMRect {
  return { left, right, top: 10, bottom: 30, width: right - left, height: 20 } as DOMRect
}

describe('popupPlace', () => {
  it('should open under what opened it, flush with its left edge in the left half', () => {
    expect(popupPlace(rect(100, 120), 1000)).toStrictEqual({ top: 32, left: 100 })
    expect(popupPlace(rect(500, 520), 1000)).toStrictEqual({ top: 32, left: 500 })
  })

  it('should open flush with its right edge in the right half, to stay in the window', () => {
    expect(popupPlace(rect(501, 521), 1000)).toStrictEqual({ top: 32, right: 479 })
  })
})

describe('placeUnder', () => {
  it('should open under an element of the page', () => {
    const element = document.createElement('button')

    expect(placeUnder(element)).toStrictEqual({ top: 2, left: 0 })
  })

  it('should open in the top left corner when the element is gone', () => {
    expect(placeUnder(null)).toStrictEqual({ top: 0, left: 0 })
  })
})
