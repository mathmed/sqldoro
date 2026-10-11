import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { type ConnectionConfig, newConnection } from './connection.ts'
import {
  connectionFolders,
  deletedFolder,
  folderNode,
  folderProblem,
  renamedFolder,
} from './folders.ts'

function connection(id: string, folder: string): ConnectionConfig {
  return { ...newConnection(id, fakeEngine()), name: `Connection ${id}`, folder }
}

const CONNECTIONS = [
  connection('b', 'clients/acme'),
  connection('a', 'clients/acme'),
  connection('c', ' clients / globex '),
  connection('d', ''),
  connection('e', 'internal'),
  connection('f', 'clientsx'),
]

describe('folderProblem', () => {
  it('should accept a folder of printable text', () => {
    expect(folderProblem('clients/acme')).toBeUndefined()
    expect(folderProblem('my clients')).toBeUndefined()
    expect(folderProblem('x'.repeat(200))).toBeUndefined()
  })

  it('should refuse a folder too long or with control characters', () => {
    expect(folderProblem('x'.repeat(201))).toBe('The folder must have at most 200 characters')
    expect(folderProblem('a\tb')).toBe('The folder cannot contain control characters')
    expect(folderProblem('a\u007fb')).toBe('The folder cannot contain control characters')
  })
})

describe('connectionFolders and folderNode', () => {
  it('should list every folder that holds a connection, with the folders around it', () => {
    expect(connectionFolders(CONNECTIONS)).toStrictEqual([
      'clients',
      'clients/acme',
      'clients/globex',
      'clientsx',
      'internal',
    ])
  })

  it('should give the top its folders and its connections', () => {
    expect(folderNode(CONNECTIONS, '')).toStrictEqual({
      path: '',
      name: '',
      folders: ['clients', 'clientsx', 'internal'],
      connections: [connection('d', '')],
    })
  })

  it('should give a folder its folders and its connections by name', () => {
    expect(folderNode(CONNECTIONS, 'clients')).toMatchObject({
      name: 'clients',
      folders: ['clients/acme', 'clients/globex'],
      connections: [],
    })
    expect(folderNode(CONNECTIONS, 'clients/acme').connections.map(({ id }) => id)).toStrictEqual([
      'a',
      'b',
    ])
    expect(folderNode(CONNECTIONS, 'clients/globex')).toMatchObject({
      name: 'globex',
      connections: [connection('c', ' clients / globex ')],
    })
  })
})

describe('renamedFolder and deletedFolder', () => {
  it('should move the connections of a folder and of the folders inside it', () => {
    expect(
      renamedFolder(CONNECTIONS, { from: 'clients', to: 'customers/active' }).map(
        ({ id, folder }) => [id, folder],
      ),
    ).toStrictEqual([
      ['b', 'customers/active/acme'],
      ['a', 'customers/active/acme'],
      ['c', 'customers/active/globex'],
    ])
  })

  it('should move a folder to the top', () => {
    expect(
      renamedFolder(CONNECTIONS, { from: 'clients/acme', to: '' }).map(({ folder }) => folder),
    ).toStrictEqual(['', ''])
  })

  it('should move the connections of a deleted folder to the folder around it', () => {
    expect(
      deletedFolder(CONNECTIONS, 'clients/acme').map(({ id, folder }) => [id, folder]),
    ).toStrictEqual([
      ['b', 'clients'],
      ['a', 'clients'],
    ])
    expect(deletedFolder(CONNECTIONS, 'clients').map(({ folder }) => folder)).toStrictEqual([
      'acme',
      'acme',
      'globex',
    ])
  })
})
