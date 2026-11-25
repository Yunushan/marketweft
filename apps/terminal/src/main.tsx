import { createRoot } from 'react-dom/client'
import { App } from './App'
import { loadMarketCore } from './market-core'
import './styles.css'

const root = createRoot(document.getElementById('root')!)
async function start() {
  root.render(
    <main className="startup" role="status">
      Opening MarketWeft…
    </main>,
  )
  try {
    const core = await loadMarketCore()
    root.render(<App core={core} />)
  } catch (error) {
    root.render(
      <main className="startup">
        <h1>Unable to open MarketWeft</h1>
        <p role="alert">
          {error instanceof Error
            ? error.message
            : 'The calculation engine could not start.'}
        </p>
        <button className="primary" onClick={start}>
          Try again
        </button>
      </main>,
    )
  }
}
void start()
