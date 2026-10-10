import type { ReactElement } from 'react'

import { chooseEngine, engineOf } from '../../core/connection-form/form-flow.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import type { EngineOption } from '../../core/engine/engine.ts'
import { ImportLink, purposeOf } from './CardHeader.tsx'
import { fieldId, type FormView } from './form-view.ts'
import { DatabaseGlyph } from './icons.tsx'

const TITLE_ID = 'picker-title'

// The first screen of a new connection: a card for each registered engine, with its default port,
// and the way to import a connection string instead.
export const EnginePicker = ({ view }: { readonly view: FormView }): ReactElement => {
  const { engines } = view.state.setup
  const current = engineOf(view.state)
  const focusable = current ?? engines[0]
  return (
    <section className="card picker" aria-labelledby={TITLE_ID}>
      <header className="card-header">
        <div className="card-title">
          <h1 id={TITLE_ID}>{purposeOf(view.state.setup.mode)}</h1>
          <p className="card-subtitle">Choose the database to connect to</p>
        </div>
        <ImportLink view={view} />
      </header>
      <div className="engine-grid">
        {engines.map((engine) => (
          <EngineCard
            key={engine.id}
            engine={engine}
            isCurrent={engine === current}
            id={engine === focusable ? fieldId(ConnectionField.Engine) : undefined}
            onChoose={(chosen) => {
              view.actions.update((state) => chooseEngine(state, chosen))
            }}
          />
        ))}
      </div>
    </section>
  )
}

interface EngineCardProps {
  readonly engine: EngineOption
  readonly isCurrent: boolean
  // The card the form takes the user to: the engine of the connection, or the first one.
  readonly id: string | undefined
  readonly onChoose: (engine: EngineOption) => void
}

const EngineCard = ({ engine, isCurrent, id, onChoose }: EngineCardProps): ReactElement => (
  <button
    type="button"
    id={id}
    className={isCurrent ? 'engine-card current' : 'engine-card'}
    aria-current={isCurrent}
    onClick={() => {
      onChoose(engine)
    }}
  >
    <DatabaseGlyph />
    <span className="engine-name">{engine.displayName}</span>
    <span className="engine-port">Default port {engine.defaultPort}</span>
  </button>
)
