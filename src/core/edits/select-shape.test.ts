import { describe, expect, it } from 'vitest'

import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { selectShape, ShapeProblem } from './select-shape.ts'

const DIALECTS = [
  ['MySQL', MYSQL_DIALECT],
  ['PostgreSQL', POSTGRES_DIALECT],
] as const

function expression(column: number): string {
  return `Column ${String(column)} of the query is an expression, not a column of the table: only queries that select plain columns can be edited.`
}

describe.each(DIALECTS)('selectShape (%s)', (...[, dialect]) => {
  it.each([
    ['SELECT * FROM orders', ['orders']],
    ['select * from orders;', ['orders']],
    ['SELECT id, name FROM sales.orders WHERE id > 5 ORDER BY id LIMIT 10', ['sales', 'orders']],
    ['SELECT o.* FROM orders o', ['orders']],
    ['SELECT o.id AS ident, o.name n FROM orders AS o OFFSET 5', ['orders']],
    ['SELECT ALL id FROM orders', ['orders']],
    ['SELECT s.orders.id FROM s.orders', ['s', 'orders']],
    ['SELECT *, id FROM orders', ['orders']],
    ['SELECT * FROM orders WHERE id IN (SELECT order_id FROM lines GROUP BY order_id)', ['orders']],
    ["SELECT * FROM orders WHERE note = 'a UNION b, c JOIN d'", ['orders']],
    ['SELECT * FROM orders -- JOIN lines\nWHERE id = 1', ['orders']],
    ['SELECT * FROM orders /* , lines */ ORDER BY (SELECT 1)', ['orders']],
    ['SELECT * FROM orders o WHERE (SELECT count(*) FROM lines l JOIN x ON true) > 0', ['orders']],
  ])('should read the rows of one table from %j', (sql, parts) => {
    expect(selectShape(sql, dialect)).toStrictEqual({ table: { parts } })
  })

  it.each([
    ["SELECT 'abc FROM orders", ShapeProblem.Unreadable],
    ['UPDATE orders SET a = 1', ShapeProblem.NotARead],
    ['DELETE FROM orders', ShapeProblem.NotARead],
    ['SELECT * FROM orders FOR UPDATE', ShapeProblem.NotARead],
    ['SELECT * INTO copy FROM orders', ShapeProblem.NotARead],
    ['', ShapeProblem.NotARead],
    ['SELECT * FROM orders; SELECT * FROM lines', ShapeProblem.Several],
    ['WITH o AS (SELECT * FROM orders) SELECT * FROM o', ShapeProblem.NotASelect],
    ['TABLE orders', ShapeProblem.NotASelect],
    ['VALUES (1)', ShapeProblem.NotASelect],
    ['(SELECT * FROM orders)', ShapeProblem.NotASelect],
    ['SHOW TABLES', ShapeProblem.NotASelect],
    ['EXPLAIN SELECT * FROM orders', ShapeProblem.NotASelect],
    ['SELECT DISTINCT id FROM orders', ShapeProblem.Distinct],
    ['SELECT distinctrow id FROM orders', ShapeProblem.Distinct],
    ['SELECT 1', ShapeProblem.NoTable],
    ['SELECT (SELECT id FROM orders)', ShapeProblem.NoTable],
    ['SELECT * FROM orders JOIN lines ON lines.order_id = orders.id', ShapeProblem.Join],
    ['SELECT * FROM orders o LEFT JOIN lines l USING (id)', ShapeProblem.Join],
    ['SELECT * FROM orders CROSS JOIN lines', ShapeProblem.Join],
    ['SELECT * FROM orders STRAIGHT_JOIN lines', ShapeProblem.Join],
    ['SELECT * FROM orders, lines', ShapeProblem.Join],
    ['SELECT * FROM orders o, lines l WHERE o.id = l.order_id', ShapeProblem.Join],
    ['SELECT * FROM (SELECT * FROM orders) AS o', ShapeProblem.Subquery],
    ['SELECT * FROM generate_series(1, 3)', ShapeProblem.Subquery],
    ['SELECT * FROM s.f(1)', ShapeProblem.Subquery],
    ['SELECT id FROM orders GROUP BY id', ShapeProblem.Grouped],
    ['SELECT id FROM orders WHERE id > 1 HAVING id > 2', ShapeProblem.Grouped],
    ['SELECT id FROM orders UNION SELECT id FROM lines', ShapeProblem.Combined],
    ['SELECT id FROM orders UNION ALL SELECT id FROM lines', ShapeProblem.Combined],
    ['SELECT id FROM orders INTERSECT SELECT id FROM lines', ShapeProblem.Combined],
    ['SELECT id FROM orders EXCEPT SELECT id FROM lines', ShapeProblem.Combined],
    ['SELECT id FROM orders MINUS SELECT id FROM lines', ShapeProblem.Combined],
    ['SELECT id FROM orders WINDOW w AS (ORDER BY id)', ShapeProblem.Window],
    ['SELECT * FROM orders TABLESAMPLE SYSTEM (10)', ShapeProblem.Unknown],
    ['SELECT * FROM orders USE INDEX (by_code)', ShapeProblem.Unknown],
    ['SELECT * FROM orders FORCE INDEX (by_code)', ShapeProblem.Unknown],
    ['SELECT * FROM orders PARTITION (p0)', ShapeProblem.Unknown],
    ['SELECT * FROM orders AS o (a, b)', ShapeProblem.Unknown],
    ['SELECT * FROM orders o x', ShapeProblem.Unknown],
    ['SELECT * FROM LATERAL orders', ShapeProblem.Unknown],
    ['SELECT * FROM', ShapeProblem.Unknown],
  ])('should explain why %j is not the rows of one table', (sql, problem) => {
    expect(selectShape(sql, dialect)).toStrictEqual({ problem })
  })

  it.each([
    ['SELECT id, price * 2 FROM orders', 2],
    ['SELECT count(*) FROM orders', 1],
    ['SELECT 1 FROM orders', 1],
    ["SELECT 'x' FROM orders", 1],
    ['SELECT -id FROM orders', 1],
    ['SELECT id + 1 AS n FROM orders', 1],
    ['SELECT a, b, CASE WHEN a THEN 1 END FROM orders', 3],
    ['SELECT NULL FROM orders', 1],
    ['SELECT o.* x FROM orders o', 1],
    ['SELECT * x FROM orders', 1],
    ['SELECT a b c FROM orders', 1],
    ['SELECT id, coalesce(a, b), c FROM orders', 2],
    ['SELECT id, FROM orders', 2],
    ['SELECT id AS x y FROM orders', 1],
    ['SELECT o. FROM orders o', 1],
    ['SELECT .* FROM orders', 1],
  ])('should refuse %j, which selects something else than a column', (sql, column) => {
    expect(selectShape(sql, dialect)).toStrictEqual({ problem: expression(column) })
  })
})

describe('selectShape, dialect by dialect', () => {
  it('should read quoted names without their quotes', () => {
    expect(selectShape('SELECT "Id" FROM "Sales"."Order ""A"""', POSTGRES_DIALECT)).toStrictEqual({
      table: { parts: ['Sales', 'Order "A"'] },
    })
    expect(selectShape('SELECT `id` FROM `shop`.`ord``ers`', MYSQL_DIALECT)).toStrictEqual({
      table: { parts: ['shop', 'ord`ers'] },
    })
  })

  it('should read the code of MySQL executable comments, which the server runs', () => {
    expect(selectShape('SELECT /*! SQL_NO_CACHE */ id FROM orders', MYSQL_DIALECT)).toStrictEqual({
      table: { parts: ['orders'] },
    })
    expect(selectShape('SELECT * FROM orders /*!, lines */', MYSQL_DIALECT)).toStrictEqual({
      problem: ShapeProblem.Join,
    })
  })

  it('should take the clauses PostgreSQL keeps rows with', () => {
    expect(selectShape('SELECT * FROM orders FETCH FIRST 5 ROWS ONLY', POSTGRES_DIALECT)).toEqual({
      table: { parts: ['orders'] },
    })
    expect(selectShape('SELECT a::text FROM orders', POSTGRES_DIALECT)).toStrictEqual({
      problem: expression(1),
    })
    expect(selectShape('SELECT DISTINCT ON (id) id FROM orders', POSTGRES_DIALECT)).toEqual({
      problem: ShapeProblem.Distinct,
    })
  })

  it('should leave FROM ONLY to the check of the table the server names', () => {
    expect(selectShape('SELECT * FROM ONLY orders', POSTGRES_DIALECT)).toStrictEqual({
      table: { parts: ['ONLY'] },
    })
  })

  it('should refuse a query that calls a function with side effects', () => {
    expect(selectShape("SELECT * FROM orders WHERE nextval('s') > 0", POSTGRES_DIALECT)).toEqual({
      problem: ShapeProblem.NotARead,
    })
  })
})
