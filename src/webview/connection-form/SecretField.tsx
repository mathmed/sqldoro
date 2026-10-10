import { type ReactElement, useState } from 'react'

import { SecretState, secretState, typedSecret } from '../../core/connection-form/draft.ts'
import { keepSecret, removeSecret, typeSecret } from '../../core/connection-form/form-state.ts'
import type { SecretKind } from '../../core/connection/secrets.ts'
import { Icon, IconName } from '../icons.tsx'
import { describedBy, FieldFrame, LinkButton } from './controls.tsx'
import type { FieldSpec, FormView } from './form-view.ts'

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
const STORAGE_HELP = "Saved in VS Code's secret storage"

function placeholderOf(view: FormView, kind: SecretKind, emptyText: string): string {
  const { draft } = view.state
  switch (secretState(draft, kind)) {
    case SecretState.Held:
      return draft.urlSecrets.has(kind) ? FROM_URL : SAVED
    case SecretState.Removed:
      return REMOVED
    default:
      return emptyText
  }
}

// A password or passphrase: the input shows only what is typed here, never what the extension
// holds, so the eye only ever reveals that; clearing it keeps the held secret, and the link under
// it removes the secret on save.
export const SecretField = ({ view, kind, label, emptyText }: SecretFieldProps): ReactElement => {
  const spec: FieldSpec = { id: `secret-${kind}`, label, help: STORAGE_HELP }
  return (
    <FieldFrame spec={spec} after={<SecretLink view={view} kind={kind} label={label} />}>
      <SecretInput view={view} kind={kind} spec={spec} emptyText={emptyText} />
    </FieldFrame>
  )
}

interface SecretInputProps {
  readonly view: FormView
  readonly kind: SecretKind
  readonly spec: FieldSpec
  readonly emptyText: string
}

const SecretInput = ({ view, kind, spec, emptyText }: SecretInputProps): ReactElement => {
  const [isShown, setIsShown] = useState(false)
  return (
    <span className="input-box">
      <input
        id={spec.id}
        type={isShown ? 'text' : 'password'}
        autoComplete="new-password"
        spellCheck={false}
        value={typedSecret(view.state.draft, kind)}
        placeholder={placeholderOf(view, kind, emptyText)}
        {...describedBy(spec)}
        onChange={(event) => {
          view.actions.update((state) => typeSecret(state, kind, event.target.value))
        }}
      />
      <RevealButton
        name={spec.label.toLowerCase()}
        isShown={isShown}
        onToggle={() => {
          setIsShown(!isShown)
        }}
      />
    </span>
  )
}

interface RevealButtonProps {
  readonly name: string
  readonly isShown: boolean
  readonly onToggle: () => void
}

const RevealButton = ({ name, isShown, onToggle }: RevealButtonProps): ReactElement => (
  <button
    type="button"
    className="icon-button"
    aria-label={`Show the ${name}`}
    aria-pressed={isShown}
    onClick={onToggle}
  >
    <Icon name={isShown ? IconName.EyeClosed : IconName.Eye} />
  </button>
)

// A held secret can be removed, and a removal undone.
const SecretLink = ({
  view,
  kind,
  label,
}: Omit<SecretFieldProps, 'emptyText'>): ReactElement | null => {
  const { draft } = view.state
  if (!draft.heldSecrets.has(kind)) {
    return null
  }
  const name = `${draft.urlSecrets.has(kind) ? "the URL's" : 'saved'} ${label.toLowerCase()}`
  return secretState(draft, kind) === SecretState.Removed ? (
    <LinkButton
      text={`Keep ${name}`}
      onClick={() => {
        view.actions.update((state) => keepSecret(state, kind))
      }}
    />
  ) : (
    <LinkButton
      text={`Remove ${name}`}
      onClick={() => {
        view.actions.update((state) => removeSecret(state, kind))
      }}
    />
  )
}
