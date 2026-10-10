import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ValidationIssue } from '../../core/connection/validation.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { FormField } from './field-kinds.ts'
import { FORM_FIELDS } from './fields.ts'
import type { FormDraft } from './form-draft.ts'

export interface FormContext {
  readonly title: string
  readonly engines: EngineRegistry
  readonly validate: (connection: ConnectionConfig) => readonly ValidationIssue[]
  readonly test: (draft: FormDraft) => Promise<void>
}

const Action = {
  Save: 'save',
  Test: 'test',
  Edit: 'edit',
} as const

type Action = (typeof Action)[keyof typeof Action]

interface FormItem extends vscode.QuickPickItem {
  readonly action?: Action
  readonly field?: FormField
}

interface Step {
  readonly draft: FormDraft
  readonly isDone: boolean
}

// A form on top of a quick pick: each field shows its value and problems, and opens its own prompt.
// Resolves with the draft to save, or undefined when the user dismissed the form.
export async function runConnectionForm(
  draft: FormDraft,
  context: FormContext,
): Promise<FormDraft | undefined> {
  const issues = context.validate(draft.connection)
  const picked = await vscode.window.showQuickPick(formItems(draft, issues, context.engines), {
    title: context.title,
    placeHolder: 'Select a field to change it, then save',
    ignoreFocusOut: true,
  })
  if (picked === undefined) {
    return undefined
  }
  const step = await perform(picked, draft, { issues, context })
  return step.isDone ? step.draft : runConnectionForm(step.draft, context)
}

async function perform(
  item: FormItem,
  draft: FormDraft,
  { issues, context }: { issues: readonly ValidationIssue[]; context: FormContext },
): Promise<Step> {
  if (item.action === Action.Save) {
    return save(draft, issues)
  }
  if (item.action === Action.Test) {
    await context.test(draft)
    return { draft, isDone: false }
  }
  const changed = await item.field?.edit(draft, context.engines)
  return { draft: changed ?? draft, isDone: false }
}

function save(draft: FormDraft, issues: readonly ValidationIssue[]): Step {
  const [issue] = issues
  if (issue === undefined) {
    return { draft, isDone: true }
  }
  void vscode.window.showErrorMessage(`Fix the connection before saving it: ${issue.message}`)
  return { draft, isDone: false }
}

function formItems(
  draft: FormDraft,
  issues: readonly ValidationIssue[],
  engines: EngineRegistry,
): FormItem[] {
  const fields = FORM_FIELDS.filter((field) => field.isVisible(draft.connection))
  const sections = [...new Set(fields.map((field) => field.section))]
  return [
    {
      label: '$(check) Save',
      action: Action.Save,
      detail: issues.length === 0 ? '' : '$(warning) Some fields need attention',
    },
    { label: '$(plug) Test Connection', action: Action.Test },
    ...sections.flatMap((section) => [
      { label: section, kind: vscode.QuickPickItemKind.Separator },
      ...fields
        .filter((field) => field.section === section)
        .map((field) => fieldItem(field, draft, { issues, engines })),
    ]),
  ]
}

function fieldItem(
  field: FormField,
  draft: FormDraft,
  { issues, engines }: { issues: readonly ValidationIssue[]; engines: EngineRegistry },
): FormItem {
  const problems = issues
    .filter((issue) => field.issueFields.includes(issue.field))
    .map((issue) => issue.message)
  return {
    label: field.label,
    description: field.describe(draft, engines),
    detail: problems.length === 0 ? '' : `$(warning) ${problems.join('; ')}`,
    action: Action.Edit,
    field,
  }
}
