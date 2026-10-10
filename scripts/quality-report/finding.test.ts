import { describe, expect, it } from 'vitest'

import { DetailsFormat, finding, markdownDetails, textDetails } from './finding.ts'
import { Status } from './status.ts'

describe('finding', () => {
  it('should leave details out when there are none', () => {
    expect(finding(Status.Ok, 'fine')).toStrictEqual({ status: Status.Ok, summary: 'fine' })
  })

  it('should keep the details it is given', () => {
    const details = { title: 'Output', body: 'log', format: DetailsFormat.Text }

    expect(finding(Status.Failed, 'broken', details)).toStrictEqual({
      status: Status.Failed,
      summary: 'broken',
      details,
    })
  })
})

describe('details', () => {
  it('should build plain text and Markdown details', () => {
    expect(textDetails('Output', 'log')).toStrictEqual({
      title: 'Output',
      body: 'log',
      format: DetailsFormat.Text,
    })
    expect(markdownDetails('Table', '| a |')).toStrictEqual({
      title: 'Table',
      body: '| a |',
      format: DetailsFormat.Markdown,
    })
  })

  it('should have no details for an empty body', () => {
    expect(textDetails('Output', '')).toBeUndefined()
    expect(markdownDetails('Table', '')).toBeUndefined()
  })
})
