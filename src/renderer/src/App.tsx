import { useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Toaster } from './components/Toaster'
import { Home } from './screens/Home'
import { Recordings } from './screens/Recordings'
import { Clips } from './screens/Clips'
import { Library } from './screens/Library'
import { Settings } from './screens/Settings'
import { Upgrade } from './screens/Upgrade'
import { useApp } from './state/AppContext'
import type { Route } from './routes'
import './App.css'

export default function App(): JSX.Element {
  const { ready } = useApp()
  const [route, setRoute] = useState<Route>('home')

  // Ctrl+1..6 jumps between screens, which is what people expect from a
  // keyboard-driven desktop app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.target instanceof HTMLInputElement) return
      const routes: Route[] = ['home', 'recordings', 'clips', 'library', 'settings', 'upgrade']
      const index = Number(e.key) - 1
      if (index >= 0 && index < routes.length) {
        e.preventDefault()
        setRoute(routes[index])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) {
    return (
      <div className="app">
        <TitleBar />
        <div className="boot">
          <div className="boot__mark" />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="app__body">
        <Sidebar route={route} onNavigate={setRoute} />
        {/* Keying on the route restarts the enter animation on every change. */}
        <main className="app__main" key={route}>
          {route === 'home' && <Home onNavigate={setRoute} />}
          {route === 'recordings' && <Recordings />}
          {route === 'clips' && <Clips />}
          {route === 'library' && <Library />}
          {route === 'settings' && <Settings />}
          {route === 'upgrade' && <Upgrade />}
        </main>
      </div>
      <Toaster />
    </div>
  )
}
