// No <StrictMode>: in development it runs every effect twice, which would record a second Flagsmith exposure for
// the same identity in the Development environment. The integration tests cover effect behaviour instead.
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(<App />)
