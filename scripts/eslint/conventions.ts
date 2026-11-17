import type { AST, ESLint, Rule, SourceCode } from 'eslint'

// A JSDoc block opens with "/**": its value, the text between the delimiters, starts with "*".
const JSDOC_OPENER = '*'

type Comment = ReturnType<SourceCode['getAllComments']>[number]
type LocatedComment = Comment & { readonly loc: AST.SourceLocation }

function isJsdoc(comment: Comment): comment is LocatedComment {
  return (
    comment.type === 'Block' &&
    comment.value.startsWith(JSDOC_OPENER) &&
    comment.loc !== undefined &&
    comment.loc !== null
  )
}

// No JSDoc or TSDoc: names and types say what the code does, and a plain comment says why when it
// is not obvious (CLAUDE.md, "Comments and docs").
const noJsdoc: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow JSDoc and TSDoc blocks' },
    messages: {
      jsdoc:
        'No JSDoc: let the names and types speak; a plain comment only says why when it is not obvious.',
    },
    schema: [],
  },
  create: (context) => ({
    Program: () => {
      for (const comment of context.sourceCode.getAllComments().filter(isJsdoc)) {
        context.report({ loc: comment.loc, messageId: 'jsdoc' })
      }
    },
  }),
}

// The project conventions no published rule covers, as a local ESLint plugin.
export const conventions: ESLint.Plugin = {
  meta: { name: 'conventions' },
  rules: { 'no-jsdoc': noJsdoc },
}
