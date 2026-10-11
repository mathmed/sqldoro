import { describe, expect, it } from 'vitest'

import {
  childFolders,
  folderName,
  folderPathsOf,
  isWithin,
  normalizeFolder,
  parentFolder,
} from './folder-paths.ts'

describe('normalizeFolder', () => {
  it('should trim the parts of a folder and drop the empty ones', () => {
    expect(normalizeFolder(' reports / monthly/ ')).toBe('reports/monthly')
    expect(normalizeFolder('//')).toBe('')
  })
})

describe('folderPathsOf', () => {
  it('should list every folder with the ones above it, in order', () => {
    expect(folderPathsOf(['reports/monthly', '', 'admin', 'reports'])).toStrictEqual([
      'admin',
      'reports',
      'reports/monthly',
    ])
    expect(folderPathsOf(['a/b/c'])).toStrictEqual(['a', 'a/b', 'a/b/c'])
  })
})

describe('folderName and parentFolder', () => {
  it('should name a folder by the last part of its path', () => {
    expect(['reports', 'reports/yearly', 'reports/yearly/2026'].map(folderName)).toStrictEqual([
      'reports',
      'yearly',
      '2026',
    ])
  })

  it('should find the folder around a folder', () => {
    expect(['reports', 'reports/yearly', 'reports/yearly/2026'].map(parentFolder)).toStrictEqual([
      '',
      'reports',
      'reports/yearly',
    ])
  })
})

describe('childFolders and isWithin', () => {
  const paths = ['admin', 'reports', 'reports/monthly', 'reports/monthly/x', 'reportsx']

  it('should list the folders right inside a folder, or at the top', () => {
    expect(childFolders(paths, '')).toStrictEqual(['admin', 'reports', 'reportsx'])
    expect(childFolders(paths, 'reports')).toStrictEqual(['reports/monthly'])
    expect(childFolders(paths, 'admin')).toStrictEqual([])
  })

  it('should tell a folder and those inside it from one that only starts like it', () => {
    expect(isWithin('reports', 'reports')).toBe(true)
    expect(isWithin('reports/monthly', 'reports')).toBe(true)
    expect(isWithin('reportsx', 'reports')).toBe(false)
    expect(isWithin('admin', 'reports')).toBe(false)
  })
})
