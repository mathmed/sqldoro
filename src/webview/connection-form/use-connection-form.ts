import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'

import {
  editConnection,
  type FocusRequest,
  FormAction,
  type FormState,
  keepSecret,
  receiveHostMessage,
  removeSecret,
  selectTab,
  type Submission,
  submit,
  touchField,
  typeSecret,
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

type Update = (change: (state: FormState) => FormState) => void

// Listens to the extension (then tells it the form is ready), keeps the state of the form, sends
// each request once and moves the focus where the form asks. The typed secrets stay in this state:
// they reach the extension only inside a test or a save.
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
      const type =
        submission.action === FormAction.Save ? FormViewMessageType.Save : FormViewMessageType.Test
      api.postMessage({ type, draft: submission.draft })
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
  const update: Update = (change) => {
    setState((current) => updateForm(current, change))
  }
  return { ...draftActions(update), ...requestActions(api, update) }
}

// What changes the draft and the form.
function draftActions(update: Update): Omit<FormActions, 'browse' | 'cancel' | 'save' | 'test'> {
  return {
    edit: (field, change) => {
      update((state) => editConnection(state, field, change))
    },
    typeSecret: (kind, value) => {
      update((state) => typeSecret(state, kind, value))
    },
    removeSecret: (kind) => {
      update((state) => removeSecret(state, kind))
    },
    keepSecret: (kind) => {
      update((state) => keepSecret(state, kind))
    },
    touch: (field) => {
      update((state) => touchField(state, field))
    },
    selectTab: (tab) => {
      update((state) => selectTab(state, tab))
    },
  }
}

// What asks the extension: a test or a save goes once the form has checked the draft.
function requestActions(
  api: FormApi,
  update: Update,
): Pick<FormActions, 'browse' | 'cancel' | 'save' | 'test'> {
  return {
    browse: (field) => {
      api.postMessage({ type: FormViewMessageType.Browse, field })
    },
    test: () => {
      update((state) => submit(state, FormAction.Test))
    },
    save: () => {
      update((state) => submit(state, FormAction.Save))
    },
    cancel: () => {
      api.postMessage({ type: FormViewMessageType.Cancel })
    },
  }
}
