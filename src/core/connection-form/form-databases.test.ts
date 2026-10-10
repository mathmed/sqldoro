import { describe, expect, it } from 'vitest'

import { openedForm as opened } from '../../../test/fixtures/connection-form.ts'
import { ConnectionField } from '../connection/validation.ts'
import {
  failListing,
  finishListing,
  hideDatabases,
  pickDatabase,
  showDatabases,
} from './form-databases.ts'
import { ListingState, NO_DATABASES } from './form-state.ts'

const LISTED = { state: ListingState.Listed, names: ['app', 'shop'], message: '', isOpen: true }

describe('finishListing', () => {
  it('should show the databases under their field, and take the user there', () => {
    const listing = opened({ databases: { ...NO_DATABASES, state: ListingState.Listing } })

    expect(finishListing(listing, ['app', 'shop'])).toMatchObject({
      databases: LISTED,
      focus: { field: ConnectionField.Database },
    })
  })

  it('should show no list for a server without databases', () => {
    expect(finishListing(opened(), []).databases).toStrictEqual({
      ...LISTED,
      names: [],
      isOpen: false,
    })
  })
})

describe('failListing', () => {
  it("should keep the server's error", () => {
    expect(failListing(opened({ databases: LISTED }), 'Access denied').databases).toStrictEqual({
      state: ListingState.Failed,
      names: [],
      message: 'Access denied',
      isOpen: false,
    })
  })
})

describe('showing and hiding the databases', () => {
  it('should show the names again only when there are some', () => {
    const hidden = hideDatabases(opened({ databases: LISTED }))

    expect(hidden.databases).toStrictEqual({ ...LISTED, isOpen: false })
    expect(showDatabases(hidden).databases).toStrictEqual(LISTED)
    expect(showDatabases(opened()).databases.isOpen).toBe(false)
  })

  it('should put the database picked in its field and hide the names', () => {
    const sut = pickDatabase(opened({ databases: LISTED }), 'shop')

    expect(sut.draft.connection.database).toBe('shop')
    expect(sut.touched).toStrictEqual(new Set([ConnectionField.Database]))
    expect(sut.databases).toStrictEqual({ ...LISTED, isOpen: false })
  })
})
