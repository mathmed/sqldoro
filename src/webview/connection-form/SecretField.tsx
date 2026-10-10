import type { ReactElement } from 'react'

import { SecretState, secretState, typedSecret } from '../../core/connection-form/draft.ts'
import { FormMode } from '../../core/connection-form/protocol.ts'
import type { SecretKind } from '../../core/connection/secrets.ts'
import { describedBy, FieldFrame } from './controls.tsx'
import type { FormView } from './form-view.ts'

interface SecretFieldProps {
  readonly view: FormView
  readonly kind: SecretKind
  readonly label: string
  // What the empty input says when the extension holds no such secret.
  readonly emptyText: string
}

const SAVED = 'Saved — type to replace'
const FROM_URL = 'From the URL — type to replace'
const REMOVED = 'Removed when you save — type to set a new one'

function placeholderOf(view: FormView, kind: SecretKind, emptyText: string): string {
  switch (secretState(view.state.draft, kind)) {
    case SecretState.Held:
      return view.state.setup.mode === FormMode.Edit ? SAVED : FROM_URL
    case SecretState.Removed:
      return REMOVED
    default:
      return emptyText
  }
}

// A password or passphrase: the input shows only what is typed here, never what the extension
// holds; clearing it keeps the held secret, and Remove deletes it on save.
export const SecretField = (props: SecretFieldProps): ReactElement => {
  const { view, kind, label, emptyText } = props
  const spec = { id: `secret-${kind}`, label }
  return (
    <FieldFrame spec={spec}>
      <span className="input-row">
        <input
          id={spec.id}
          type="password"
          autoComplete="new-password"
          value={typedSecret(view.state.draft, kind)}
          placeholder={placeholderOf(view, kind, emptyText)}
          {...describedBy(spec)}
          onChange={(event) => {
            view.actions.typeSecret(kind, event.target.value)
          }}
        />
        <SecretButton view={view} kind={kind} label={label} />
      </span>
    </FieldFrame>
  )
}

// A held secret can be removed, and a removal undone.
const SecretButton = ({
  view,
  kind,
  label,
}: Omit<SecretFieldProps, 'emptyText'>): ReactElement | null => {
  const name = label.toLowerCase()
  if (secretState(view.state.draft, kind) === SecretState.Removed) {
    return (
      <SmallButton
        text="Keep"
        label={`Keep the ${name}`}
        onClick={() => {
          view.actions.keepSecret(kind)
        }}
      />
    )
  }
  return view.state.draft.heldSecrets.has(kind) ? (
    <SmallButton
      text="Remove"
      label={`Remove the ${name}`}
      onClick={() => {
        view.actions.removeSecret(kind)
      }}
    />
  ) : null
}

interface SmallButtonProps {
  readonly text: string
  readonly label: string
  readonly onClick: () => void
}

const SmallButton = ({ text, label, onClick }: SmallButtonProps): ReactElement => (
  <button type="button" aria-label={label} onClick={onClick}>
    {text}
  </button>
)
