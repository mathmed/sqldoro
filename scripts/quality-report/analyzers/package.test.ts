import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzePackage } from './package.ts'

// The end of a real run of npm run package (vsce 4, then scripts/package.ts).
const PACKED =
  ' DONE  Packaged: sqldoro-0.1.0.vsix (17 files, 723.54 KB)\n>> package sqldoro-0.1.0.vsix: 723.5kb, 17 files, sha256 b6263872dbfecf5734be66f3c49647c5fb095ad04d386c6a67771c1b314f13b5\n>> package file [Content_Types].xml 633b\n>> package file extension.vsixmanifest 3.2kb\n>> package file extension/changelog.md 0b\n>> package file extension/dist/extension.cjs 1.6mb\n>> package file extension/dist/ThirdPartyNotices.txt 55.2kb\n>> package file extension/dist/webview/results.css 8.6kb\n>> package file extension/dist/webview/results.js 325.3kb\n>> package file extension/LICENSE.txt 1kb\n>> package file extension/media/icon.png 22.3kb\n>> package file extension/media/sqldoro.svg 359b\n>> package file extension/media/walkthrough/connect.md 1000b\n>> package file extension/media/walkthrough/edit.md 822b\n>> package file extension/media/walkthrough/keep.md 526b\n>> package file extension/media/walkthrough/query.md 1.1kb\n>> package file extension/media/walkthrough/safety.md 1.2kb\n>> package file extension/package.json 27.9kb\n>> package file extension/readme.md 49kb'

function packing(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Package, exitCode, output, seconds: 2 }
}

describe('analyzePackage', () => {
  it('should report the package, its size, its files and its hash', () => {
    const sut = analyzePackage(packing(PACKED, 0))

    expect(sut.status).toBe(Status.Ok)
    expect(sut.summary).toBe('Packed sqldoro-0.1.0.vsix (723.5kb, 17 files) · sha256 b6263872dbfe')
    expect(sut.details?.body.split('\n')).toHaveLength(17)
    expect(sut.details?.body).toContain('extension/dist/extension.cjs 1.6mb')
  })

  it('should list the problems of a package that holds what it should not', () => {
    const output = `${PACKED}\n>> package problem: the package should not hold extension/src/a.ts\n>> package problem: the package misses extension/dist/webview/results.js`

    expect(analyzePackage(packing(output, 1))).toStrictEqual({
      status: Status.Failed,
      summary: '2 package problems in sqldoro-0.1.0.vsix (723.5kb, 17 files) · sha256 b6263872dbfe',
      details: {
        title: 'Problems',
        body: 'the package should not hold extension/src/a.ts\nthe package misses extension/dist/webview/results.js',
        format: 'text',
      },
    })
  })

  it('should fail when the packing failed after the package was written', () => {
    expect(analyzePackage(packing(PACKED, 1))).toMatchObject({
      status: Status.Failed,
      summary: 'Packing failed after sqldoro-0.1.0.vsix (723.5kb, 17 files) · sha256 b6263872dbfe',
    })
  })

  it('should fail when vsce could not pack the extension', () => {
    const output =
      ' ERROR  Make sure to edit the README.md file before you package or publish your extension.'

    expect(analyzePackage(packing(output, 1))).toStrictEqual({
      status: Status.Failed,
      summary: 'vsce could not pack the extension',
      details: { title: 'Output', body: output, format: 'text' },
    })
  })
})
