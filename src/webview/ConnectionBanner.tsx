import type { ReactElement } from 'react'

import { connectionText } from '../core/results/panel-connection.ts'
import type { PanelConnection } from '../core/results/protocol.ts'

// Where the results come from, above the tabs: production stands out.
export const ConnectionBanner = ({
  connection,
}: {
  readonly connection: PanelConnection
}): ReactElement => (
  <div
    role="note"
    aria-label="Connection"
    className={connection.isProduction ? 'connection-banner production' : 'connection-banner'}
  >
    {connection.isProduction
      ? `Production: ${connectionText(connection)}`
      : connectionText(connection)}
  </div>
)
