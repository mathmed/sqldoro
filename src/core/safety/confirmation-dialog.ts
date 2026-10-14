import {
  type Confirmation,
  ConfirmationKind,
  ConfirmationStyle,
  connectionLabel,
  type GuardTarget,
  type TypedPart,
} from './guard.ts'

// The one modal dialog a run waits for: where it runs, every confirmation it needs, one per line,
// and the button that runs it. Cancel (or Escape) runs nothing.
export interface ConfirmationDialog {
  readonly message: string
  readonly detail: string
  readonly button: string
}

const RUN_ANYWAY = 'Run Anyway'

export function confirmationDialog(
  confirmations: readonly Confirmation[],
  target: Pick<GuardTarget, 'environment' | 'name'>,
): ConfirmationDialog {
  return {
    message: `Run on ${connectionLabel(target)}?`,
    detail: [
      ...confirmations.map((confirmation) => confirmation.reason),
      ...typedConfirmations(confirmations).map(
        (typed) => `Then type ${typed.expected} to confirm the ${typed.title}.`,
      ),
    ].join('\n'),
    button: buttonOf(confirmations),
  }
}

// What must be typed once the dialog is confirmed, in order: only the riskiest statements ask.
export function typedConfirmations(confirmations: readonly Confirmation[]): TypedPart[] {
  return confirmations.flatMap((confirmation) =>
    confirmation.style === ConfirmationStyle.Typed ? [confirmation] : [],
  )
}

// The production button names the connection; otherwise the button of the statements, when they
// agree on one.
function buttonOf(confirmations: readonly Confirmation[]): string {
  const production = confirmations.find(
    (confirmation) => confirmation.kind === ConfirmationKind.Production,
  )
  if (production !== undefined) {
    return production.button
  }
  const [only, ...others] = new Set(confirmations.map((confirmation) => confirmation.button))
  return only === undefined || others.length > 0 ? RUN_ANYWAY : only
}
