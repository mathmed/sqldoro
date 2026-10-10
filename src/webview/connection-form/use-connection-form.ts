import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'

import { receiveHostMessage } from '../../core/connection-form/form-messages.ts'
import {
  type FocusRequest,
  type FormState,
  type Submission,
  updateForm,
} from '../../core/connection-form/form-state.ts'
import { FormViewMessageType } from '../../core/connection-form/protocol.ts'
import { listenToHost } from '../host.ts'
import { FORM_CHANNEL, type FormApi } from './form-api.ts'
import { fieldId, type FormActions } from './form-view.ts'

export interface ConnectionForm {
  // Null until the extension sends what the form opens on.
  readonly state: FormState | null
  readonly actions: FormActions
}

// Listens to the extension (then tells it the form is ready), keeps the state of the form, sends
// each request once and moves the focus where the form asks. The typed secrets stay in this state:
// they reach the extension only inside a test, a save, a listing or an import.
export function useConnectionForm(api: FormApi): ConnectionForm {
  const [state, setState] = useState<FormState | null>(null)
  useEffect(
    () =>
      listenToHost(api, FORM_CHANNEL, (message) => {
        setState((current) => receiveHostMessage(current, message))
      }),
    [api],
  )
  useEffect(() => {
    api.postMessage({ type: FormViewMessageType.Ready })
  }, [api])
  useSubmission(api, state?.submission ?? null)
  useFocus(state?.focus ?? null)
  return { state, actions: formActions(api, setState) }
}

function useSubmission(api: FormApi, submission: Submission | null): void {
  useEffect(() => {
    if (submission !== null) {
      api.postMessage(submission)
    }
  }, [api, submission])
}

function useFocus(focus: FocusRequest | null): void {
  useEffect(() => {
    if (focus !== null) {
      document.getElementById(fieldId(focus.field))?.focus()
    }
  }, [focus])
}

function formActions(
  api: FormApi,
  setState: Dispatch<SetStateAction<FormState | null>>,
): FormActions {
  return {
    update: (change) => {
      setState((current) => updateForm(current, change))
    },
    browse: (field) => {
      api.postMessage({ type: FormViewMessageType.Browse, field })
    },
    cancel: () => {
      api.postMessage({ type: FormViewMessageType.Cancel })
    },
  }
}
