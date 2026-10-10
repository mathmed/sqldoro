// The connection form webview, rendered and opened as the extension would: what the user acts on,
// and what the webview sent the extension meanwhile.
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'

import type { FormSetup, FormViewMessage } from '../../src/core/connection-form/protocol.ts'
import { App } from '../../src/webview/connection-form/App.tsx'
import { formSetup } from '../fixtures/connection-form.ts'
import { type FakeVsCodeApi, fakeVsCodeApi, fromHost } from './vscode-api.ts'

export interface OpenedForm {
  readonly api: FakeVsCodeApi<FormViewMessage>
  // The messages of a type the webview sent, in order.
  readonly sent: (kind: string) => FormViewMessage[]
}

export function openForm(changes: Partial<FormSetup> = {}): OpenedForm {
  const api = fakeVsCodeApi<FormViewMessage>()
  render(createElement(App, { api }))
  fromHost({ type: 'open', setup: formSetup(changes) })
  return { api, sent: (kind) => api.posted().filter((message) => message.type === kind) }
}

// A text field by its label (without the mark of a required field).
export function textField(name: string): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('textbox', { name })
}

// A password field by its label.
export function secretInput(name: string): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(name, { selector: 'input' })
}

export function typeIn(input: HTMLElement, value: string): void {
  fireEvent.change(input, { target: { value } })
}

// Leaves a field: its problem shows from now on.
export function typeAndLeave(input: HTMLElement, value: string): void {
  typeIn(input, value)
  fireEvent.blur(input)
}

export function choose(name: string, value: string): void {
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } })
}

export function click(name: string | RegExp, role = 'button'): void {
  fireEvent.click(screen.getByRole(role, { name }))
}

export function tab(name: RegExp): HTMLElement {
  return screen.getByRole('tab', { name })
}

// The problem a field shows, if any.
export function issueOf(input: HTMLElement): string | null {
  const ids = (input.getAttribute('aria-describedby') ?? '').split(' ')
  const issue = ids.find((id) => id.endsWith('-issue')) ?? ''
  return document.getElementById(issue)?.textContent ?? null
}
