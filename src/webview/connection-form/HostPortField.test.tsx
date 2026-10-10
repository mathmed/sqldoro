import { describe, expect, it } from 'vitest'

import {
  issueOf,
  openForm,
  textField,
  typeAndLeave,
  typeIn,
} from '../../../test/webview/connection-form.ts'

function box(): HTMLElement | null {
  return textField('Host').parentElement
}

describe('the host and the port', () => {
  it('should sit in one box, the port after a colon', () => {
    openForm()

    expect(box()?.textContent).toBe(':')
    expect(box()?.className).toBe('input-box host-port')
    expect(textField('Host').placeholder).toBe('localhost')
    expect(textField('Port').getAttribute('inputmode')).toBe('numeric')
    expect(textField('Port').getAttribute('aria-required')).toBe('true')
  })

  it('should check each part on its own, and show both problems under the box', () => {
    openForm()

    typeAndLeave(textField('Host'), '')
    expect(issueOf(textField('Host'))).toBe('Enter the host name or IP address of the server')
    expect(issueOf(textField('Port'))).toBeNull()
    expect(box()?.className).toBe('input-box host-port invalid')
    typeAndLeave(textField('Port'), '70000')

    expect(issueOf(textField('Port'))).toBe('The port must be a whole number from 1 to 65535')
    const issues = [...document.querySelectorAll('.field-issue')].map((issue) => issue.textContent)
    expect(issues).toStrictEqual([
      'Enter the host name or IP address of the server',
      'The port must be a whole number from 1 to 65535',
    ])
    typeIn(textField('Host'), 'db')
    expect(issueOf(textField('Host'))).toBeNull()
    expect(box()?.className).toBe('input-box host-port invalid')
  })

  it('should treat a port that is not a whole number from 1 to 65535 as no port', () => {
    openForm()
    const port = textField('Port')

    typeAndLeave(port, '70000')
    expect(port.value).toBe('70000')
    typeIn(port, '')
    expect(port.value).toBe('')
    typeIn(port, '0543')
    expect(port.value).toBe('0543')
    expect(issueOf(port)).toBeNull()
    expect(box()?.className).toBe('input-box host-port')
  })
})
