import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, FileText, LoaderCircle, RotateCcw, UploadCloud, WandSparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { saveMirrors } from './lib/mirrorStore'
import { splitPointFiles } from './lib/splitter'
import type { ProcessingProgress } from './types'

type Props = {
  onOpenMirrors: () => void
  onRegistered?: () => void
}

function fileSummary(files: File[]) {
  if (!files.length) return 'PDFs de folha de ponto'
  if (files.length === 1) return files[0].name
  return `${files.length} arquivos selecionados`
}

export default function RegistryPanel({ onOpenMirrors, onRegistered }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<ProcessingProgress>({ value: 0, label: '' })
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [registered, setRegistered] = useState(0)

  function pickFiles(list: FileList | null) {
    if (!list) return
    const selected = Array.from(list).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    setFiles(selected)
    setError('')
    setRegistered(0)
    setProgress({ value: 0, label: '' })
  }

  async function process() {
    if (!files.length || processing) return
    setProcessing(true)
    setError('')
    setRegistered(0)
    setProgress({ value: 1, label: 'Preparando documentos' })

    try {
      const output = await splitPointFiles(files, setProgress)
      if (!output.length) {
        setError('Nenhum espelho foi encontrado nos PDFs selecionados.')
        return
      }
      setProgress({ value: 98, label: 'Registrando espelhos no navegador' })
      await saveMirrors(output)
      setRegistered(output.length)
      setProgress({ value: 100, label: `${output.length} espelho(s) registrado(s)` })
      onRegistered?.()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Não foi possível ler os PDFs.')
    } finally {
      setProcessing(false)
    }
  }

  function reset() {
    setFiles([])
    setError('')
    setRegistered(0)
    setProgress({ value: 0, label: '' })
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <main className="app-shell reader-only-shell">
      <section className="hero container reader-hero">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
          <h1 className="panel-hero-title">Leia o ponto real.<br /><em>Registre cada espelho.</em></h1>
        </motion.div>
      </section>

      <section className="workspace container reader-workspace">
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => pickFiles(e.target.files)} />

        <motion.div
          className={`dropzone reader-dropzone ${dragging ? 'dragging' : ''}`}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pickFiles(e.dataTransfer.files) }}
          onClick={() => !processing && inputRef.current?.click()}
          whileHover={{ y: -2 }}
        >
          <div className="drop-icon"><UploadCloud size={26} /></div>
          <div className="drop-copy">
            <strong>{files.length ? fileSummary(files) : 'Solte os PDFs de ponto aqui'}</strong>
            <span>{files.length ? `${files.length} arquivo(s) pronto(s) para leitura` : 'O Painel apenas lê e registra. O cálculo e as folgas ficam em Espelhos.'}</span>
          </div>
          <div className="drop-side"><FileText size={15} /> PDF</div>
        </motion.div>

        {!processing && files.length > 0 && registered === 0 && (
          <motion.div className="action-row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <button className="secondary" onClick={reset}><RotateCcw size={16} /> Limpar</button>
            <button className="primary" onClick={process}><WandSparkles size={18} /> Ler e registrar</button>
          </motion.div>
        )}

        <AnimatePresence>
          {processing && (
            <motion.div className="progress-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="progress-top">
                <span><LoaderCircle className="spin" size={17} /> {progress.label}</span>
                <b>{progress.value}%</b>
              </div>
              <div className="progress-track"><i style={{ width: `${Math.max(2, progress.value)}%` }} /></div>
              <small>As páginas são lidas uma por vez para manter a interface responsiva.</small>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <div className="error-box">{error}</div>}

        {registered > 0 && !processing && (
          <motion.div className="reader-success" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="reader-success-icon"><CheckCircle2 size={22} /></div>
            <div>
              <strong>{registered} espelho(s) registrado(s)</strong>
              <span>Agora abra Espelhos para conferir as marcações, adicionar folgas/feriados e gerar o PDF calculado.</span>
            </div>
            <button className="primary" onClick={onOpenMirrors}>Abrir Espelhos</button>
          </motion.div>
        )}
      </section>
    </main>
  )
}
