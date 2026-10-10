import { withEngine, withImported } from '../connection/transitions.ts'
import { ConnectionField } from '../connection/validation.ts'
import type { EngineOption } from '../engine/engine.ts'
import { withConnection, withUrlSecrets } from './draft.ts'
import {
  changed,
  CLOSED_IMPORT,
  editConnection,
  FormControl,
  type FormState,
  FormStep,
  usesSsl,
} from './form-state.ts'
import { FormMode, FormViewMessageType, type ImportedDraft } from './protocol.ts'

// The registered engine of the connection, if it has one.
export function engineOf(state: FormState): EngineOption | undefined {
  return state.setup.engines.find((engine) => engine.id === state.draft.connection.engine)
}

// A new connection can change its engine; a saved one only when its engine is not registered.
export function canChangeEngine(state: FormState): boolean {
  return state.setup.mode === FormMode.New || engineOf(state) === undefined
}

// A new engine brings its default port unless the port was changed; the fields come next.
export function chooseEngine(state: FormState, engine: EngineOption): FormState {
  const chosen = editConnection(state, ConnectionField.Engine, (connection) =>
    withEngine(connection, engine, state.setup.engines),
  )
  return { ...chosen, step: FormStep.Details, focus: { field: FormControl.Name } }
}

// Back to the engines, with what was typed kept for the engine chosen next.
export function backToPicker(state: FormState): FormState {
  return canChangeEngine(state)
    ? { ...state, step: FormStep.Picker, focus: { field: FormControl.Engine } }
    : state
}

export function openImport(state: FormState): FormState {
  return {
    ...state,
    step: FormStep.Details,
    importer: { ...state.importer, isOpen: true },
    focus: { field: FormControl.ConnectionString },
  }
}

// Closing the input forgets what was typed in it: it may hold a password.
export function closeImport(state: FormState): FormState {
  return { ...state, importer: { ...CLOSED_IMPORT, warnings: state.importer.warnings } }
}

export function typeImport(state: FormState, text: string): FormState {
  return { ...state, importer: { ...state.importer, text, problem: '' } }
}

// Sends the connection string to the extension to read, once at a time.
export function applyImport(state: FormState): FormState {
  if (state.importer.isApplying) {
    return state
  }
  return {
    ...state,
    importer: { ...state.importer, isApplying: true, problem: '' },
    submission: { type: FormViewMessageType.Import, text: state.importer.text },
  }
}

// The connection string fills the fields it speaks for, and its secrets replace what was typed for
// them; the input closes, and the SSL settings open when it uses SSL.
export function receiveImport(state: FormState, imported: ImportedDraft): FormState {
  const connection = withImported(state.draft.connection, imported.connection)
  const draft = withUrlSecrets(
    withConnection(state.draft, connection),
    new Set(state.setup.heldSecrets),
    imported.urlSecrets,
  )
  const filled = {
    ...state,
    draft,
    step: FormStep.Details,
    isAdvancedOpen: state.isAdvancedOpen || usesSsl(connection.ssl),
    importer: { ...CLOSED_IMPORT, warnings: imported.warnings },
    focus: { field: FormControl.Name },
  }
  return changed(filled, null)
}

export function refuseImport(state: FormState, problem: string): FormState {
  return {
    ...state,
    importer: { ...state.importer, isOpen: true, isApplying: false, problem },
    focus: { field: FormControl.ConnectionString },
  }
}

export function toggleAdvanced(state: FormState): FormState {
  return { ...state, isAdvancedOpen: !state.isAdvancedOpen }
}

// Opens the SSL settings and takes the user to the SSL mode.
export function openAdvanced(state: FormState): FormState {
  return { ...state, isAdvancedOpen: true, focus: { field: FormControl.SslMode } }
}
