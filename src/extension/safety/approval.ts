import type { StatementClass } from '../../core/safety/statement-class.ts'

// The statements the guards let a run execute, with what each one does. A statement the guards did
// not see cannot run: every execution path asks the approval of its run first.
export class Approval {
  readonly #statements: ReadonlyMap<string, StatementClass>

  constructor(statements: ReadonlyMap<string, StatementClass>) {
    this.#statements = statements
  }

  classOf(sql: string): StatementClass {
    const statement = this.#statements.get(sql)
    if (statement === undefined) {
      throw new Error('sqldoro did not check this statement before running it, so it did not run')
    }
    return statement
  }
}
