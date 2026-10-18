import { AST_NODE_TYPES, simpleTraverse, type TSESTree } from '@typescript-eslint/typescript-estree'

import {
  CONTEXT_SKIP,
  type SuppressionKind,
  TEST_ALIASES,
  TEST_FUNCTIONS,
  TEST_MODIFIERS,
} from './kinds.ts'

export interface Marker {
  readonly line: number
  readonly kind: SuppressionKind
}

// it.skip, describe.only, test.skipIf(...), test.concurrent.fails, xit(...), context.skip()...
export function testMarkers(program: TSESTree.Program): Marker[] {
  const markers: Marker[] = []
  simpleTraverse(program, {
    enter: (node) => {
      const kind = markerKind(node)
      if (kind !== undefined) {
        markers.push({ line: node.loc.start.line, kind })
      }
    },
  })
  return markers
}

function markerKind(node: TSESTree.Node): SuppressionKind | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return modifierKind(node)
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return callKind(node.callee)
  }
  return undefined
}

function modifierKind(node: TSESTree.MemberExpression): SuppressionKind | undefined {
  const modifier = propertyName(node)
  if (modifier === undefined || !TEST_FUNCTIONS.has(rootName(node.object))) {
    return undefined
  }
  return TEST_MODIFIERS.get(modifier)
}

function callKind(callee: TSESTree.Expression): SuppressionKind | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return TEST_ALIASES.get(callee.name)
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || propertyName(callee) !== CONTEXT_SKIP) {
    return undefined
  }
  return TEST_FUNCTIONS.has(rootName(callee.object)) ? undefined : TEST_MODIFIERS.get(CONTEXT_SKIP)
}

function propertyName(node: TSESTree.MemberExpression): string | undefined {
  return !node.computed && node.property.type === AST_NODE_TYPES.Identifier
    ? node.property.name
    : undefined
}

// The identifier a chain of member accesses and calls starts from: `it` in it.concurrent.skip and
// `describe` in describe.each(cases).skip.
function rootName(node: TSESTree.Node): string {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return rootName(node.object)
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return rootName(node.callee)
  }
  return ''
}
