// URIs as VS Code prints and compares them: scheme, path and query.
export class FakeUri {
  readonly scheme: string
  readonly path: string
  readonly query: string

  constructor(scheme: string, path: string, query = '') {
    this.scheme = scheme
    this.path = path
    this.query = query
  }

  get fsPath(): string {
    return this.path
  }

  toString(): string {
    const query = this.query === '' ? '' : `?${this.query}`
    return `${this.scheme}:${this.path}${query}`
  }
}

export const Uri = {
  file: (path: string): FakeUri => new FakeUri('file', path),
  parse: (text: string): FakeUri => {
    const [scheme = '', rest = ''] = text.split(/:(.*)/s)
    const [path = '', query = ''] = rest.split(/\?(.*)/s)
    return new FakeUri(scheme, path, query)
  },
  from: ({
    scheme,
    path = '',
    query = '',
  }: {
    scheme: string
    path?: string
    query?: string
  }): FakeUri => new FakeUri(scheme, path, query),
  joinPath: (base: FakeUri, ...segments: string[]): FakeUri =>
    new FakeUri(base.scheme, [base.path, ...segments].join('/'), base.query),
}
