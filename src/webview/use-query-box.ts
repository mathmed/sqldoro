import { useEffect, useState } from 'react'

import {
  boxCap,
  boxHeight,
  type BoxPlace,
  boxText,
  hasBox,
  isBoxShown,
  originStep,
  type QueryMode,
  toggleBox,
  WHERE_MODE,
  withDraft,
  withoutDraft,
} from '../core/grid/query-mode.ts'
import type { ResultsState } from '../core/grid/results-state.ts'
import { type ResultTab, TabStatus, WebviewMessageType } from '../core/results/protocol.ts'
import { boxQuery } from '../core/results/query-box.ts'
import type { ResultsApi } from './results-api.ts'
import { useQueryShortcut } from './use-query-shortcut.ts'
import { lexicalOf } from './where-source.ts'

// How tall the text of the query box is, and how the user changes it by dragging its edge.
export interface BoxSize {
  readonly height: number
  readonly isResizing: boolean
  // While the edge is dragged.
  readonly resize: (height: number) => void
  // Where it was let go: the height is kept for the table panels of the workspace.
  readonly keep: (height: number) => void
}

// The query box of a table panel as the view shows it, and what its parts do.
export interface QueryBoxView {
  readonly isShown: boolean
  readonly text: string
  // Whether the box holds something the user wrote, which reverting gives up.
  readonly hasDraft: boolean
  // Why the text cannot run, until it changes; empty otherwise.
  readonly problem: string
  readonly isRunning: boolean
  readonly toggle: () => void
  readonly edit: (text: string) => void
  readonly revert: () => void
  // Runs the selected text, or all of it without a selection.
  readonly run: (selection: string) => void
  readonly cancel: () => void
  readonly openInEditor: () => void
  readonly size: BoxSize
}

interface BoxSources {
  readonly tab: ResultTab | undefined
  // The tab the view waits for while the result of before stays on screen.
  readonly incoming: ResultTab | undefined
  readonly state: ResultsState
}

// The box lives with the panel, not with a tab: what the user wrote stays while results come and go.
// Ctrl+Shift+E toggles it.
export function useQueryBox(api: ResultsApi, sources: BoxSources): QueryBoxView {
  const [mode, setMode] = useState<QueryMode>(WHERE_MODE)
  const [problem, setProblem] = useState('')
  const place: BoxPlace = { tab: sources.tab, crumbs: sources.state.crumbs }
  const text = boxText(mode, place)
  const isRunning = [sources.tab, sources.incoming].some((tab) => tab?.status === TabStatus.Running)
  const actions = modeActions(api, { mode, setMode, place, setProblem })
  useQueryShortcut(hasBox(sources.tab), actions.toggle)
  return {
    isShown: isBoxShown(mode, sources.tab),
    text,
    hasDraft: mode.drafts.has(originStep(place)),
    problem,
    isRunning,
    ...actions,
    ...runActions(api, { text, isRunning, sources, setProblem }),
    size: useBoxSize(api, text, sources.state.queryBox.height),
  }
}

interface ModeSources {
  readonly mode: QueryMode
  readonly setMode: (mode: QueryMode) => void
  readonly place: BoxPlace
  readonly setProblem: (problem: string) => void
}

// Closing the box on the result of a query shows the rows it was run from again.
function modeActions(
  api: ResultsApi,
  { mode, setMode, place, setProblem }: ModeSources,
): Pick<QueryBoxView, 'edit' | 'revert' | 'toggle'> {
  return {
    toggle: () => {
      const { mode: next, goTo } = toggleBox(mode, place)
      setMode(next)
      if (goTo !== null) {
        api.postMessage({ type: WebviewMessageType.GoToStep, step: goTo })
      }
    },
    edit: (text) => {
      setMode(withDraft(mode, place, text))
      setProblem('')
    },
    revert: () => {
      setMode(withoutDraft(mode, place))
      setProblem('')
    },
  }
}

interface RunSources {
  readonly text: string
  readonly isRunning: boolean
  readonly sources: BoxSources
  readonly setProblem: (problem: string) => void
}

// One statement runs at a time: a box with none, or with more, says so at once.
function runActions(
  api: ResultsApi,
  { text, isRunning, sources, setProblem }: RunSources,
): Pick<QueryBoxView, 'cancel' | 'openInEditor' | 'run'> {
  return {
    run: (selection) => {
      const sql = selection.trim() === '' ? text : selection
      const checked = boxQuery(sql, lexicalOf(sources.state.sql))
      setProblem('problem' in checked ? checked.problem : '')
      if (!('problem' in checked) && !isRunning) {
        api.postMessage({ type: WebviewMessageType.RunQuery, sql })
      }
    },
    cancel: () => {
      api.postMessage({ type: WebviewMessageType.Cancel })
    },
    openInEditor: () => {
      api.postMessage({ type: WebviewMessageType.OpenSqlInEditor, sql: text })
    },
  }
}

// The box grows with its text up to the height the user chose (kept for the workspace by the
// host), within its bounds; while its edge is dragged, it follows the pointer.
function useBoxSize(api: ResultsApi, text: string, kept: number | null): BoxSize {
  const panelHeight = usePanelHeight()
  const [chosen, setChosen] = useState<number | null>(null)
  const [dragged, setDragged] = useState<number | null>(null)
  const cap = boxCap(chosen ?? kept, panelHeight)
  return {
    height: dragged === null ? boxHeight(text, cap) : boxCap(dragged, panelHeight),
    isResizing: dragged !== null,
    resize: setDragged,
    keep: (height) => {
      const next = boxCap(height, panelHeight)
      setDragged(null)
      setChosen(next)
      api.postMessage({ type: WebviewMessageType.SetQueryHeight, height: next })
    },
  }
}

// The height of the panel, as the window of the webview is.
function usePanelHeight(): number {
  const [height, setHeight] = useState(window.innerHeight)
  useEffect(() => {
    const onResize = (): void => {
      setHeight(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])
  return height
}
