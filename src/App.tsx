import { AnimatePresence, motion } from 'framer-motion'
import { FileText, LogOut, PanelLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BootScreen } from './components/auth/BootScreen'
import { LoginScreen } from './components/auth/LoginScreen'
import { MeshGradientSVG } from './components/ui/shader-svg'
import MirrorsPanel from './MirrorsPanel'
import RegistryPanel from './RegistryPanel'

type Screen = 'login' | 'boot' | 'panel'
type PanelSection = 'reader' | 'mirrors'

export default function App() {
  const [screen, setScreen] = useState<Screen>('login')
  const [section, setSection] = useState<PanelSection>('reader')
  const [, setRegistryVersion] = useState(0)

  useEffect(() => {
    if (screen !== 'boot') return
    const timer = window.setTimeout(() => setScreen('panel'), 4200)
    return () => window.clearTimeout(timer)
  }, [screen])

  function logout() {
    setSection('reader')
    setScreen('login')
  }

  return (
    <AnimatePresence mode="wait">
      {screen === 'login' && (
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <LoginScreen onEnter={() => setScreen('boot')} />
        </motion.div>
      )}

      {screen === 'boot' && (
        <motion.div key="boot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <BootScreen />
        </motion.div>
      )}

      {screen === 'panel' && (
        <motion.div key="panel" className="kern-panel-frame" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <aside className="kern-sidebar">
            <div className="sidebar-ghost"><MeshGradientSVG compact /></div>

            <nav className="sidebar-nav">
              <button className={section === 'reader' ? 'active' : ''} onClick={() => setSection('reader')}><PanelLeft size={16} /><span>Painel</span></button>
              <button className={section === 'mirrors' ? 'active' : ''} onClick={() => setSection('mirrors')}><FileText size={16} /><span>Espelhos</span></button>
            </nav>

            <button className="sidebar-logout" onClick={logout}><LogOut size={15} /><span>Sair</span></button>
          </aside>

          <div className="kern-panel-content">
            {section === 'reader' ? (
              <RegistryPanel
                onOpenMirrors={() => setSection('mirrors')}
                onRegistered={() => setRegistryVersion((value) => value + 1)}
              />
            ) : (
              <MirrorsPanel />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
