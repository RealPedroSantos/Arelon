import { useCallback, useEffect, useState } from 'react'
import { useStore, type ServerConfig } from '../store'
import { authenticate, getXtreamErrorMessage } from '../api/xtream'
import { moveFocus, useRemote } from '../hooks/useRemote'
import { Keyboard } from '../components/Keyboard'
import { getServerCount } from '../lib/pool'
import { getDefaultSharedAdminConfig } from '../lib/adminConfig'

type Field = 'username' | 'password'

const MASTER_USERNAME = (import.meta.env.VITE_MASTER_USERNAME || 'master').trim()
const MASTER_PASSWORD = import.meta.env.VITE_MASTER_PASSWORD || 'master123'

const STATES = [
  { uf: 'Todos', name: 'Todos os Estados' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
  { uf: 'AC', name: 'Acre' },
]

export function LoginScreen() {
  const server = useStore((s) => s.server)
  const setServer = useStore((s) => s.setServer)
  const setAuthenticated = useStore((s) => s.setAuthenticated)
  const setAdminAuthenticated = useStore((s) => s.setAdminAuthenticated)
  const setSelectedState = useStore((s) => s.setSelectedState)

  const testAccount = getDefaultSharedAdminConfig().testAccount
  const [username, setUsername] = useState(server?.username ?? testAccount.username)
  const [password, setPassword] = useState(server?.password ?? testAccount.password)
  const [activeField, setActiveField] = useState<Field>('username')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [showStateModal, setShowStateModal] = useState(false)
  const [tempServer, setTempServer] = useState<ServerConfig | null>(null)

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return
    if (showStateModal) {
      if (cmd === 'UP' || cmd === 'DOWN' || cmd === 'LEFT' || cmd === 'RIGHT') {
        moveFocus(cmd)
      } else if (cmd === 'ENTER') {
        (document.activeElement as HTMLElement)?.click()
      } else if (cmd === 'BACK') {
        setShowStateModal(false)
      }
      return
    }
    if (cmd === 'BACK' && activeField === 'password') setActiveField('username')
  }, true, { allowWhenModal: true })

  // Autofoco no primeiro item do modal de estados
  useEffect(() => {
    if (showStateModal) {
      setTimeout(() => {
        const firstBtn = document.querySelector('.state-btn') as HTMLElement
        firstBtn?.focus()
      }, 100)
    }
  }, [showStateModal])

  const selectStateAndFinish = useCallback((uf: string) => {
    setSelectedState(uf === 'Todos' ? null : uf)
    if (tempServer) {
      setServer(tempServer)
    }
    setAuthenticated(true)
  }, [tempServer, setServer, setAuthenticated, setSelectedState])

  const handleLogin = useCallback(async () => {
    const trimmedUsername = username.trim()
    const trimmedPassword = password.trim()

    if (!trimmedUsername || !trimmedPassword) {
      setError('Preencha usuário e senha.')
      setActiveField('username')
      return
    }

    if (trimmedUsername === MASTER_USERNAME && trimmedPassword === MASTER_PASSWORD) {
      setError('')
      setAdminAuthenticated(true)
      return
    }

    setLoading(true)
    setError('')
    try {
      const activeServerUrl = await authenticate(trimmedUsername, trimmedPassword)
      if (activeServerUrl) {
        setTempServer({ username: trimmedUsername, password: trimmedPassword, activeServer: activeServerUrl })
        setShowStateModal(true)
      } else {
        setError('Usuário ou senha inválidos.')
        setActiveField('username')
        setPassword('')
      }
    } catch (error) {
      setError(getXtreamErrorMessage(error))
      setActiveField('username')
    } finally {
      setLoading(false)
    }
  }, [password, setAdminAuthenticated, username])

  const handleDone = useCallback(() => {
    if (activeField === 'username') setActiveField('password')
    else void handleLogin()
  }, [activeField, handleLogin])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === 'Enter') {
        event.preventDefault()
        handleDone()
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        if (activeField === 'username') setUsername((value) => value.slice(0, -1))
        else setPassword((value) => value.slice(0, -1))
        return
      }

      if (event.key.length === 1) {
        event.preventDefault()
        if (activeField === 'username') setUsername((value) => value + event.key)
        else setPassword((value) => value + event.key)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeField, handleDone])

  const currentValue = activeField === 'username' ? username : password
  const currentSetter = activeField === 'username' ? setUsername : setPassword

  return (
    <div className="login-page">
      {/* Background overlay (real element - reliable on Tizen 6.5) */}
      <div className="login-bg-overlay" />

      {/* Top: brand + credential fields */}
      <div className="login-top">
        <img
          className="login-brand"
          src="assets/arelon/logo-arelon-padrao.png"
          alt="Arelon"
        />
        <p className="login-tagline">TV ao vivo, filmes e séries na sua Samsung TV</p>

        <div className="login-fields">
          <div
            className={`login-field ${activeField === 'username' ? 'login-field--active' : ''}`}
            onClick={() => setActiveField('username')}
          >
            <span className="login-field-label">Usuário</span>
            <span className="login-field-value">{username || '—'}</span>
          </div>

          <div
            className={`login-field ${activeField === 'password' ? 'login-field--active' : ''}`}
            onClick={() => setActiveField('password')}
          >
            <span className="login-field-label">Senha</span>
            <span className="login-field-value">{'•'.repeat(password.length) || '—'}</span>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}
        {loading && (
          <div className="login-loading">Conectando a {getServerCount()} servidores…</div>
        )}
      </div>

      {/* Bottom: full-width keyboard */}
      <div className="login-keyboard">
        <Keyboard
          label={activeField === 'username' ? 'Usuário' : 'Senha'}
          value={currentValue}
          masked={activeField === 'password'}
          onChange={currentSetter}
          onDone={handleDone}
          doneLabel={activeField === 'password' ? 'Login' : '→'}
        />
      </div>

      {showStateModal && (
        <div className="modal-overlay modal-overlay--state">
          <div className="modal-content modal-content--state">
            <h2>Selecione seu Estado</h2>
            <p>Os canais ao vivo locais serão filtrados de acordo com sua região para evitar poluição visual.</p>
            <div className="state-grid">
              {STATES.map((st) => (
                <button
                  key={st.uf}
                  className="state-btn"
                  data-focusable="true"
                  onClick={() => selectStateAndFinish(st.uf)}
                >
                  <span className="state-uf">{st.uf}</span>
                  <span className="state-name">{st.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
