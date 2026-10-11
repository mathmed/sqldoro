import { type ReactElement, useRef, useState } from 'react'

import type { Crumb } from '../core/navigation/history.ts'
import { connectionText } from '../core/results/panel-connection.ts'
import { type PanelConnection, WebviewMessageType } from '../core/results/protocol.ts'
import { Icon, IconName } from './icons.tsx'
import { placeUnder, type PopupPlace, useDismiss } from './popup.ts'
import type { ResultsApi } from './results-api.ts'
import { themeColor } from './theme-color.ts'
import { goToStep, stepAt } from './use-trail-keys.ts'

interface PanelHeaderProps {
  readonly api: ResultsApi
  readonly connection: PanelConnection | null
  readonly crumbs: readonly Crumb[]
}

const READ_ONLY =
  'sqldoro and the database session refuse anything that writes on this connection: its rows cannot be edited.'

// Above the results: the trail of a table panel reached by navigation (with back and forward), the
// connection with its color, production standing out, and a lock when it is read-only.
export const PanelHeader = ({ api, connection, crumbs }: PanelHeaderProps): ReactElement | null => {
  const hasTrail = crumbs.length > 1
  if (connection === null && !hasTrail) {
    return null
  }
  return (
    <div className="panel-header">
      {hasTrail ? <Trail api={api} crumbs={crumbs} /> : <span className="header-fill" />}
      {connection === null ? null : <ConnectionChip api={api} connection={connection} />}
    </div>
  )
}

const Trail = ({
  api,
  crumbs,
}: {
  readonly api: ResultsApi
  readonly crumbs: readonly Crumb[]
}): ReactElement => (
  <nav className="trail" aria-label="Trail">
    <TrailButton api={api} crumbs={crumbs} offset={-1} />
    <TrailButton api={api} crumbs={crumbs} offset={1} />
    <ol className="crumbs">
      {crumbs.map((crumb) => (
        <li key={crumb.id}>
          <CrumbItem api={api} crumb={crumb} />
        </li>
      ))}
    </ol>
  </nav>
)

// The step shown, or a step to go back (or forward) to.
const CrumbItem = ({
  api,
  crumb,
}: {
  readonly api: ResultsApi
  readonly crumb: Crumb
}): ReactElement =>
  crumb.isCurrent ? (
    <span className="crumb current" aria-current="page">
      {crumb.label}
    </span>
  ) : (
    <button
      type="button"
      className="crumb"
      onClick={() => {
        goToStep(api, crumb)
      }}
    >
      {crumb.label}
    </button>
  )

interface TrailButtonProps {
  readonly api: ResultsApi
  readonly crumbs: readonly Crumb[]
  readonly offset: number
}

const TrailButton = ({ api, crumbs, offset }: TrailButtonProps): ReactElement => {
  const step = stepAt(crumbs, offset)
  const isBack = offset < 0
  return (
    <button
      type="button"
      className="tool-button"
      aria-label={isBack ? 'Back' : 'Forward'}
      title={isBack ? 'Back (Alt+Left)' : 'Forward (Alt+Right)'}
      disabled={step === undefined}
      onClick={() => {
        goToStep(api, step)
      }}
    >
      <Icon name={isBack ? IconName.Back : IconName.Forward} />
    </button>
  )
}

// "PROD · Shop" in the color of the connection; production in red, always.
const ConnectionChip = ({
  api,
  connection,
}: {
  readonly api: ResultsApi
  readonly connection: PanelConnection
}): ReactElement => (
  <span
    role="note"
    aria-label="Connection"
    className={connection.isProduction ? 'connection-chip production' : 'connection-chip'}
  >
    <span
      className="connection-dot"
      aria-hidden="true"
      style={
        connection.color === '' ? undefined : { backgroundColor: themeColor(connection.color) }
      }
    />
    {connectionText(connection)}
    {connection.isReadOnly ? <ReadOnlyLock api={api} /> : null}
  </span>
)

// The one place that says the connection is read-only: its tooltip explains, its popup offers to
// allow writes (a confirmed change of the connection of its own).
const ReadOnlyLock = ({ api }: { readonly api: ResultsApi }): ReactElement => {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [place, setPlace] = useState<PopupPlace>()
  const close = (): void => {
    setPlace(undefined)
  }
  useDismiss(anchorRef, place !== undefined, close)
  return (
    <span ref={anchorRef} className="menu-anchor">
      <button
        type="button"
        className="lock-badge"
        aria-label="Read-only"
        aria-haspopup="dialog"
        aria-expanded={place !== undefined}
        title={`Read-only: ${READ_ONLY}`}
        onClick={(event) => {
          setPlace(place === undefined ? placeUnder(event.currentTarget) : undefined)
        }}
      >
        <Icon name={IconName.Lock} />
        Read-only
      </button>
      {place === undefined ? null : <AllowWrites api={api} place={place} onClose={close} />}
    </span>
  )
}

interface AllowWritesProps {
  readonly api: ResultsApi
  readonly place: PopupPlace
  readonly onClose: () => void
}

const AllowWrites = ({ api, place, onClose }: AllowWritesProps): ReactElement => (
  <div role="dialog" aria-label="Read-only" className="popover" style={place}>
    <p className="popover-text">{READ_ONLY}</p>
    <span className="popover-actions">
      <button
        type="button"
        className="primary"
        onClick={() => {
          onClose()
          api.postMessage({ type: WebviewMessageType.AllowWrites })
        }}
      >
        Allow Writes…
      </button>
    </span>
  </div>
)
