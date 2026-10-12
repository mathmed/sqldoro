import type { ReactElement } from 'react'

import { connectionText } from '../core/results/panel-connection.ts'
import type { PanelConnection } from '../core/results/protocol-parts.ts'

// Where the statements of the changes run, in their preview: production stands out.
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
