# Edit rows with a preview

Run a plain `SELECT` of one table that includes its primary key (or a unique key without `NULL`s) on
a connection that allows writes. The grid then takes changes:

- `Enter`, `F2` or typing edits a cell; `Enter` puts the value in, `Escape` leaves it as it was.
- The edit bar adds, duplicates and deletes rows (`Delete` marks the selected ones), sets `NULL` or
  `DEFAULT`, and reverts cells or everything.
- `Ctrl+S` (`Cmd+S`) previews the exact statements, their bound values and the rows each must change.

Applying runs them in one transaction: all of them, or none. A row someone changed since sqldoro read
it is reported as a conflict and never overwritten. Anything the grid cannot prove editable (joins,
views, expressions, tables without a key) stays read-only, and the grid says why.
