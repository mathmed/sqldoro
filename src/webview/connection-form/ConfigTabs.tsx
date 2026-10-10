import type { KeyboardEvent, ReactElement, ReactNode } from 'react'

import { ConfigTab, tabsWithIssues } from '../../core/connection-form/form-state.ts'
import { type ConnectionConfig, SslMode } from '../../core/connection/connection.ts'
import { steppedItem } from './arrow-keys.ts'
import type { FormView } from './form-view.ts'
import { MainTab } from './MainTab.tsx'
import { SshTab } from './SshTab.tsx'
import { SslTab } from './SslTab.tsx'

interface TabSpec {
  readonly tab: ConfigTab
  readonly label: string
  // Whether what the tab sets up is turned on.
  readonly isOn: (connection: ConnectionConfig) => boolean
}

const TABS: readonly TabSpec[] = [
  { tab: ConfigTab.Main, label: 'Main', isOn: () => false },
  { tab: ConfigTab.Ssl, label: 'SSL/TLS', isOn: ({ ssl }) => ssl.mode !== SslMode.Disable },
  { tab: ConfigTab.Ssh, label: 'SSH Tunnel', isOn: ({ ssh }) => ssh !== undefined },
]

function tabId(tab: ConfigTab): string {
  return `tab-${tab}`
}

function panelId(tab: ConfigTab): string {
  return `panel-${tab}`
}

// The settings under the engine, a tab each: a tab with a problem says so, and the SSL and SSH tabs
// say when they are on. The arrow keys move along the tabs.
export const ConfigTabs = ({ view }: { readonly view: FormView }): ReactElement => (
  <div className="config">
    <TabList view={view} />
    <TabPanel view={view} tab={ConfigTab.Main}>
      <MainTab view={view} />
    </TabPanel>
    <TabPanel view={view} tab={ConfigTab.Ssl}>
      <SslTab view={view} />
    </TabPanel>
    <TabPanel view={view} tab={ConfigTab.Ssh}>
      <SshTab view={view} />
    </TabPanel>
  </div>
)

const TabList = ({ view }: { readonly view: FormView }): ReactElement => {
  const withIssues = tabsWithIssues(view.issues)
  const active = TABS.findIndex(({ tab }) => tab === view.state.activeTab)
  const onKeyDown = (event: KeyboardEvent): void => {
    const next = steppedItem(TABS, event.key, active)
    if (next !== undefined) {
      event.preventDefault()
      view.actions.selectTab(next.tab)
      document.getElementById(tabId(next.tab))?.focus()
    }
  }
  return (
    <div role="tablist" aria-label="Settings" className="config-tabs" onKeyDown={onKeyDown}>
      {TABS.map((spec) => (
        <TabButton key={spec.tab} spec={spec} view={view} hasIssues={withIssues.has(spec.tab)} />
      ))}
    </div>
  )
}

interface TabButtonProps {
  readonly spec: TabSpec
  readonly view: FormView
  readonly hasIssues: boolean
}

const TabButton = ({ spec, view, hasIssues }: TabButtonProps): ReactElement => {
  const isActive = spec.tab === view.state.activeTab
  return (
    <button
      type="button"
      role="tab"
      id={tabId(spec.tab)}
      aria-selected={isActive}
      aria-controls={panelId(spec.tab)}
      tabIndex={isActive ? 0 : -1}
      className="config-tab"
      onClick={() => {
        view.actions.selectTab(spec.tab)
      }}
    >
      {spec.label}
      {spec.isOn(view.state.draft.connection) ? <span className="tab-on">on</span> : null}
      {hasIssues ? (
        <span className="tab-issue" role="img" aria-label="has problems">
          !
        </span>
      ) : null}
    </button>
  )
}

interface TabPanelProps {
  readonly view: FormView
  readonly tab: ConfigTab
  readonly children: ReactNode
}

// Every panel stays rendered: what is typed in one survives a switch to another.
const TabPanel = ({ view, tab, children }: TabPanelProps): ReactElement => (
  <div
    role="tabpanel"
    id={panelId(tab)}
    aria-labelledby={tabId(tab)}
    hidden={tab !== view.state.activeTab}
    className="field-grid"
  >
    {children}
  </div>
)
