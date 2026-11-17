import { describe, expect, it } from 'vitest'

import { touchedLines } from './hunks.ts'

const DIFF = `diff --git a/src/core/a.ts b/src/core/a.ts
index 1111111..2222222 100644
--- a/src/core/a.ts
+++ b/src/core/a.ts
@@ -3 +3 @@ export const A = 1
-old
+new
@@ -10,0 +11,3 @@ function f(): void {
+one
+two
+three
@@ -20,2 +23,0 @@ function g(): void {
-gone
-gone too
diff --git a/src/core/new file.ts b/src/core/new file.ts
new file mode 100644
--- /dev/null
+++ b/src/core/new file.ts
@@ -0,0 +1,2 @@
+export const B = 2
+export const C = 3
diff --git a/src/core/top.ts b/src/core/top.ts
--- a/src/core/top.ts
+++ b/src/core/top.ts
@@ -1,2 +0,0 @@
-// a comment
-// another`

describe('touchedLines', () => {
  it('should list the new lines of every hunk of every file', () => {
    const sut = touchedLines(DIFF)

    expect(sut.get('src/core/a.ts')).toEqual([3, 11, 12, 13, 23, 24])
    expect(sut.get('src/core/new file.ts')).toEqual([1, 2])
  })

  it('should stand for a deletion at the start of a file with its first lines', () => {
    expect(touchedLines(DIFF).get('src/core/top.ts')).toEqual([1, 1])
  })

  it('should read no line from a hunk header it cannot read', () => {
    const sut = touchedLines('+++ b/a.ts\n@@ \n@@ -1 +x @@\n@@ -1 +2,y @@')

    expect(sut.get('a.ts')).toEqual([])
  })

  it('should read nothing from an empty diff', () => {
    expect(touchedLines('')).toStrictEqual(new Map())
  })
})
