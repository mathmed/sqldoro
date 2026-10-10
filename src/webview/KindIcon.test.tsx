import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ColumnKind } from '../core/engine/query.ts'
import { KindIcon, kindName } from './KindIcon.tsx'

describe('KindIcon', () => {
  it.each([
    [ColumnKind.Number, 'number', ''],
    [ColumnKind.Text, 'text', 'abc'],
    [ColumnKind.Boolean, 'boolean', ''],
    [ColumnKind.Temporal, 'date and time', ''],
    [ColumnKind.Json, 'JSON', ''],
    [ColumnKind.Binary, 'binary', '01'],
    [ColumnKind.Other, 'other', ''],
  ])('should draw the %s kind, hidden from screen readers', (kind, name, text) => {
    const { container } = render(<KindIcon kind={kind} />)

    const icon = container.querySelector('svg')
    expect(icon?.getAttribute('class')).toBe(`kind-icon kind-${kind}`)
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.textContent).toBe(text)
    expect(icon?.childElementCount).toBe(1)
    expect(kindName(kind)).toBe(name)
  })

  it('should draw a kind it does not know as any other value', () => {
    const unknown = 'geometry' as ColumnKind

    expect(kindName(unknown)).toBe('other')
  })
})
