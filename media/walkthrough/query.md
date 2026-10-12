# Run a query

**New Query** (from a connection, database or schema in the explorer, or the Command Palette) opens a
SQL editor bound to that connection. The status bar shows where the editor runs.

| Keys                                           | What it does                                       |
| ---------------------------------------------- | -------------------------------------------------- |
| `Ctrl+Enter` (`Cmd+Enter`)                     | Run the selection, or the statement at the cursor. |
| `Ctrl+Alt+Enter` (`Cmd+Alt+Enter`)             | Run every statement of the editor, in order.       |
| `Ctrl+Shift+Backspace` (`Cmd+Shift+Backspace`) | Cancel the running statement on the server.        |

Results open beside the editor, one tab per statement when a run has several. The grid pages rows
in as you scroll, so a million rows stay smooth. Click a header to sort, use the filter button or the
menu of a header to filter or sort a column, type in **Quick Search** to keep the rows with a text in
any column, select cells with the mouse, the keyboard or the row numbers, copy them (`Ctrl+C`), and
export the result to CSV, JSON or SQL from the toolbar. **Columns** chooses the columns shown and
their order.

Click a table in the explorer to open its rows in a panel of their own, and type a condition in its
**WHERE**. The expand button beside it (`Ctrl+Shift+E`, `Cmd+Shift+E`) shows the whole query above the
rows, in a box where you edit and run it in place (`Ctrl+Enter`): a `JOIN`, other columns, another
sort. Its result replaces the rows, and **Back** returns to them.

A cell whose column is in a foreign key is a link: `Ctrl+click` (`Cmd+click`) opens the row it points
at, resting on its arrow peeks at it, and the menu of a cell lists the rows of other tables that
reference its row. In the panel of a table, `Alt+click` opens the row in place and the breadcrumbs
above take you back (`Alt+Left`).

Queries that read get an automatic `LIMIT` (1,000 rows by default); **Load All Rows** runs them again
without it.
