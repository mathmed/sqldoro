// The color VS Code gives a theme color id (charts.red), as a CSS value: the webviews get every
// color of the theme as a CSS variable.
export function themeColor(id: string): string {
  return `var(--vscode-${id.replaceAll('.', '-')})`
}
