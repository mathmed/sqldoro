import { failListing, finishListing } from './form-databases.ts'
import { openImport, receiveImport, refuseImport } from './form-flow.ts'
import { chooseFile, type FormState, openForm, updateForm } from './form-state.ts'
import { finishTest, refuseSave } from './form-submit.ts'
import { type FormHostMessage, FormHostMessageType } from './protocol.ts'

type HostUpdate = Exclude<FormHostMessage, { readonly type: typeof FormHostMessageType.Open }>
type FlowUpdate = Exclude<
  HostUpdate,
  {
    readonly type:
      | typeof FormHostMessageType.File
      | typeof FormHostMessageType.SaveRefused
      | typeof FormHostMessageType.Tested
  }
>
type ListingUpdate = Extract<
  HostUpdate,
  {
    readonly type: typeof FormHostMessageType.Databases | typeof FormHostMessageType.DatabasesFailed
  }
>

// The form before it opens is null: only the message that opens it changes that.
export function receiveHostMessage(
  state: FormState | null,
  message: FormHostMessage,
): FormState | null {
  if (message.type === FormHostMessageType.Open) {
    return openForm(message.setup)
  }
  return updateForm(state, (open) => applyHostUpdate(open, message))
}

function applyHostUpdate(state: FormState, message: HostUpdate): FormState {
  switch (message.type) {
    case FormHostMessageType.File:
      return chooseFile(state, message.field, message.path)
    case FormHostMessageType.Tested:
      return finishTest(state, message.isSuccess, message.message)
    case FormHostMessageType.SaveRefused:
      return refuseSave(state, message.message, message.issues)
    default:
      return applyFlowUpdate(state, message)
  }
}

function applyFlowUpdate(state: FormState, message: FlowUpdate): FormState {
  switch (message.type) {
    case FormHostMessageType.ShowImport:
      return openImport(state)
    case FormHostMessageType.Imported:
      return receiveImport(state, message)
    case FormHostMessageType.ImportRefused:
      return refuseImport(state, message.message)
    default:
      return applyListingUpdate(state, message)
  }
}

function applyListingUpdate(state: FormState, message: ListingUpdate): FormState {
  return message.type === FormHostMessageType.Databases
    ? finishListing(state, message.names)
    : failListing(state, message.message)
}
