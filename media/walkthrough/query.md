# Run a query

**New Query** (from a connection, database or schema in the explorer, or the Command Palette) opens a
SQL editor bound to that connection. The status bar shows where the editor runs.

| Keys                                           | What it does                                       |
| ---------------------------------------------- | -------------------------------------------------- |
| `Ctrl+Enter` (`Cmd+Enter`)                     | Run the selection, or the statement at the cursor. |
| `Ctrl+Alt+Enter` (`Cmd+Alt+Enter`)             | Run every statement of the editor, in order.       |
| `Ctrl+Shift+Backspace` (`Cmd+Shift+Backspace`) | Cancel the running statement on the server.        |

Results open beside the editor, one tab per statement. The grid pages rows in as you scroll, so a
million rows stay smooth. Click a header to sort, type in the filter row, select cells with the mouse
or the keyboard, copy them (`Ctrl+C`), and export the whole result to CSV, JSON or SQL.

Queries that read get an automatic `LIMIT` (1,000 rows by default); **Load All Rows** runs them again
without it.
