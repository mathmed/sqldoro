// The text selected in a field, empty without a selection (or a field).
export function selectionOf(field: HTMLTextAreaElement | null): string {
  return field === null ? '' : field.value.slice(field.selectionStart, field.selectionEnd)
}
