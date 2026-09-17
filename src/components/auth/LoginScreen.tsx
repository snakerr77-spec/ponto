import { motion } from 'framer-motion'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { FormEvent, useState } from 'react'
import GlitterWrap from '../ui/glitter-wrap'
import { MeshGradientSVG } from '../ui/shader-svg'

type LoginScreenProps = {
  onEnter: () => void
}

export function LoginScreen({ onEnter }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    onEnter()
  }

  return (
    <main className="login-screen login-v6">
      <div className="login-grid">
        <section className="login-form-side">
          <motion.div
            className="login-form-wrap"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: .5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="login-copy-block" aria-label="Leia o ponto real. Registre e confira cada hora.">
              <span className="login-copy-kicker">KERN REGISTRO</span>
              <h1>
                <span>Leia o ponto real.</span>
                <em>Registre e confira cada hora.</em>
              </h1>
              <p>Entre para ler o espelho, revisar folgas e completar batidas quando faltar ponto no REP.</p>
            </div>

            <form className="login-form" onSubmit={submit}>
              <label>
                <span>E-mail</span>
                <div className="field-shell">
                  <Mail size={16} />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="m@example.com" autoComplete="email" />
                </div>
              </label>

              <label>
                <span>Senha</span>
                <div className="field-shell">
                  <LockKeyhole size={16} />
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Password" autoComplete="current-password" />
                  <button type="button" className="eye-button" onClick={() => setShowPassword((value) => !value)} aria-label="Mostrar ou ocultar senha">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <button className="login-submit" type="submit">Entrar</button>
            </form>
          </motion.div>
        </section>

        <section className="login-art-side login-art-v6">
          <div className="login-glitter-layer" aria-hidden="true">
            <GlitterWrap
              particleCount={430}
              color1="#f5f5f7"
              color2="#9da3ae"
              color3="#8798ba"
              speed={3.2}
              density={76}
              starSize={11}
              focalDepth={14}
              turbulence={4}
              brightness={58}
              glitterIntensity={2}
              trailAmount={93}
              reverse={false}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <motion.div
            className="ghost-stage ghost-stage-v6"
            initial={{ opacity: 0, scale: .92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: .6, delay: .08, ease: [0.22, 1, 0.36, 1] }}
          >
            <MeshGradientSVG />
          </motion.div>
        </section>
      </div>
    </main>
  )
}
