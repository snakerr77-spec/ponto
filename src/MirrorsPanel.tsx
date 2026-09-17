import { PDFDocument } from 'pdf-lib'
import {
  CalendarDays,
  ChevronLeft,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { countManualAdjustments, minutesToClock, setDayMarks, setDayStatus, signedClock } from './lib/calculation'
import { deleteMirror, listMirrors, updateMirror } from './lib/mirrorStore'
import { stampCalculationOnOriginal } from './lib/pdfSummary'
import type { DayCalculation, DayStatus, SplitResult } from './types'

function copyBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

function downloadBytes(bytes: Uint8Array, name: string) {
  const copy = copyBytes(bytes)
  const blob = new Blob([copy.buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2500)
}

function previewBytes(bytes: Uint8Array) {
  const copy = copyBytes(bytes)
  const blob = new Blob([copy.buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function compactTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function asDraftMarks(day: DayCalculation) {
  return Array.from({ length: 6 }, (_, index) => day.marks[index] || '')
}

async function generateCalculatedPdf(item: SplitResult) {
  const input = copyBytes(item.bytes)
  const pdf = await PDFDocument.load(input, { ignoreEncryption: true })
  await stampCalculationOnOriginal(pdf, item.calculation, {
    employeeName: item.employeeName,
    employeeCode: item.employeeCode,
    periodStart: item.periodStart,
    periodEnd: item.periodEnd,
    sourceFileName: item.sourceFileName,
  })
  return pdf.save({ useObjectStreams: true })
}

function statusLabel(status: DayStatus) {
  if (status === 'folga') return 'Folga'
  if (status === 'feriado') return 'Feriado'
  return 'Normal'
}

export default function MirrorsPanel() {
  const [items, setItems] = useState<SplitResult[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editingIso, setEditingIso] = useState<string | null>(null)
  const [draftStatus, setDraftStatus] = useState<DayStatus>('normal')
  const [draftMarks, setDraftMarks] = useState<string[]>(['', '', '', '', '', ''])
  const editorRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId])
  const editingDay = useMemo(() => selected?.calculation.days.find((day) => day.isoDate === editingIso) || null, [selected, editingIso])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const values = await listMirrors()
      setItems(values)
      if (selectedId && !values.some((item) => item.id === selectedId)) setSelectedId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar os espelhos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  useEffect(() => {
    if (!editingIso) return
    const timer = window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const firstEmpty = editorRef.current?.querySelector<HTMLInputElement>('input[data-empty="true"]')
      const fallback = editorRef.current?.querySelector<HTMLInputElement>('input')
      ;(firstEmpty || fallback)?.focus()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [editingIso])

  function openEditor(day: DayCalculation) {
    if (day.weekday === 'Dom') return
    setEditingIso(day.isoDate)
    setDraftStatus(day.status)
    setDraftMarks(asDraftMarks(day))
  }

  function closeEditor() {
    setEditingIso(null)
    setDraftStatus('normal')
    setDraftMarks(['', '', '', '', '', ''])
  }

  async function saveEditor() {
    if (!selected || !editingIso) return
    let calculation = setDayMarks(selected.calculation, editingIso, draftMarks)
    calculation = setDayStatus(calculation, editingIso, draftStatus)
    const next = { ...selected, calculation }
    setItems((current) => current.map((item) => item.id === next.id ? next : item))
    setBusy(true)
    setError('')
    try {
      await updateMirror(next)
      closeEditor()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar o ajuste do dia.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(isoDate: string, status: DayStatus) {
    if (!selected) return
    const calculation = setDayStatus(selected.calculation, isoDate, status)
    const next = { ...selected, calculation }
    setItems((current) => current.map((item) => item.id === next.id ? next : item))
    try {
      await updateMirror(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar a alteração.')
    }
  }

  async function removeSelected() {
    if (!selected) return
    if (!window.confirm(`Excluir o espelho de ${selected.employeeName}?`)) return
    await deleteMirror(selected.id)
    setSelectedId(null)
    closeEditor()
    await refresh()
  }

  async function downloadCalculated(item: SplitResult) {
    setBusy(true)
    setError('')
    try {
      const bytes = await generateCalculatedPdf(item)
      const name = item.fileName.replace(/\.pdf$/i, ' - Calculado.pdf')
      downloadBytes(bytes, name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar o PDF calculado.')
    } finally {
      setBusy(false)
    }
  }

  async function previewCalculated(item: SplitResult) {
    setBusy(true)
    setError('')
    try {
      const bytes = await generateCalculatedPdf(item)
      previewBytes(bytes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir o PDF calculado.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <main className="app-shell mirrors-shell"><div className="mirrors-loading"><LoaderCircle className="spin" size={22} /> Carregando espelhos...</div></main>
  }

  if (selected) {
    const calc = selected.calculation
    return (
      <main className="app-shell mirrors-shell">
        <section className="container mirror-detail">
          <div className="mirror-detail-head">
            <button className="mirror-back" onClick={() => { setSelectedId(null); closeEditor() }}><ChevronLeft size={17} /> Espelhos</button>
            <div className="mirror-detail-actions">
              <button className="secondary" disabled={busy} onClick={() => previewCalculated(selected)}><Eye size={16} /> Ver PDF</button>
              <button className="primary" disabled={busy} onClick={() => downloadCalculated(selected)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} PDF calculado</button>
              <button className="danger-button" onClick={removeSelected}><Trash2 size={16} /> Excluir</button>
            </div>
          </div>

          <div className="mirror-title-block">
            <span>ESPELHO REGISTRADO</span>
            <h1>{selected.employeeName}</h1>
            <p>{selected.monthLabel} · {selected.periodStart || 'início não identificado'} a {selected.periodEnd || 'fim não identificado'}</p>
          </div>

          {error && <div className="error-box">{error}</div>}

          <div className="mirror-metrics mirror-metrics-refined">
            <div><span>Trabalhado REP</span><strong>{minutesToClock(calc.totalWorkedMinutes)}</strong><small>somatório das batidas lidas e ajustadas</small></div>
            <div><span>Meta do espelho</span><strong>{minutesToClock(calc.scheduledTargetMinutes)}</strong><small>domingos, folgas e feriados sem meta</small></div>
            <div><span>Referência mensal</span><strong>{minutesToClock(calc.monthlyTargetMinutes)}</strong><small>220h contratuais</small></div>
            <div className={calc.scheduledBalanceMinutes >= 0 ? 'positive' : 'negative'}><span>Saldo do espelho</span><strong>{signedClock(calc.scheduledBalanceMinutes)}</strong><small>{calc.scheduledBalanceMinutes >= 0 ? 'acima da meta do espelho' : 'abaixo da meta do espelho'}</small></div>
          </div>

          <div className="mirror-rules-note mirror-rules-grid">
            <CalendarDays size={17} />
            <div>
              <strong>Domingo é sempre Folga.</strong>
              <span>As batidas de domingo não entram na leitura. Se faltar ponto na volta do almoço ou em outra batida, use Ajustar dia e escolha os horários manualmente.</span>
            </div>
          </div>

          <div className="mirror-overview-grid">
            <div className="overview-card">
              <span>Dias para revisar</span>
              <strong>{calc.incompleteDays}</strong>
              <small>dias com quantidade ímpar de batidas</small>
            </div>
            <div className="overview-card">
              <span>Ajustes manuais</span>
              <strong>{countManualAdjustments(calc)}</strong>
              <small>dias com horários editados manualmente</small>
            </div>
            <div className="overview-card">
              <span>Folgas</span>
              <strong>{calc.days.filter((day) => day.status === 'folga').length}</strong>
              <small>inclui domingos automáticos</small>
            </div>
          </div>

          {editingDay && (
            <div className="day-editor-card" ref={editorRef}>
              <div className="day-editor-head">
                <div>
                  <span>AJUSTAR DIA</span>
                  <strong>{editingDay.weekday} · {editingDay.date}</strong>
                  <small>Complete o retorno do almoço ou qualquer batida faltante.</small>
                </div>
                <button className="day-editor-close" onClick={closeEditor}><X size={16} /></button>
              </div>

              <div className="day-editor-grid">
                <label>
                  <span>Status</span>
                  <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as DayStatus)}>
                    <option value="normal">Normal</option>
                    <option value="folga">Folga</option>
                    <option value="feriado">Feriado</option>
                  </select>
                </label>

                {['1ª entrada', '1ª saída', '2ª entrada', '2ª saída', 'Extra entrada', 'Extra saída'].map((label, index) => (
                  <label key={label}>
                    <span>{label}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:MM"
                      value={draftMarks[index]}
                      data-empty={draftMarks[index] ? undefined : "true"}
                      onChange={(e) => {
                        const next = [...draftMarks]
                        next[index] = compactTimeInput(e.target.value)
                        setDraftMarks(next)
                      }}
                    />
                  </label>
                ))}
              </div>

              <div className="day-editor-foot">
                <p>Exemplo: se faltou a volta do almoço, preencha a <strong>2ª entrada</strong> com o horário desejado e salve.</p>
                <div className="day-editor-actions">
                  <button className="secondary" onClick={closeEditor}>Cancelar</button>
                  <button className="primary" disabled={busy} onClick={saveEditor}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Salvar ajuste</button>
                </div>
              </div>
            </div>
          )}

          <div className="mirror-table-wrap">
            <table className="mirror-table mirror-table-refined">
              <thead>
                <tr>
                  <th>Dia</th><th>Status</th><th>Marcações Reg. no REP</th><th>Trabalhado</th><th>Meta do dia</th><th>Saldo</th><th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {calc.days.map((day) => {
                  const sunday = day.weekday === 'Dom'
                  return (
                    <tr key={day.isoDate} className={sunday ? 'sunday-row' : ''}>
                      <td>
                        <strong>{day.weekday}</strong>
                        <span>{day.date}</span>
                      </td>
                      <td>
                        {sunday ? (
                          <span className="status-pill folga">Folga</span>
                        ) : (
                          <select value={day.status} onChange={(e) => changeStatus(day.isoDate, e.target.value as DayStatus)}>
                            <option value="normal">Normal</option>
                            <option value="folga">Folga</option>
                            <option value="feriado">Feriado</option>
                          </select>
                        )}
                      </td>
                      <td className="marks-cell">
                        {sunday ? (
                          <em>FOLGA</em>
                        ) : day.marks.length ? (
                          <>
                            {day.marks.join(' · ')}
                            {day.manualAdjusted && <small className="marks-adjusted">ajuste manual</small>}
                          </>
                        ) : (
                          <em>{statusLabel(day.status).toUpperCase()}</em>
                        )}
                      </td>
                      <td>{minutesToClock(day.workedMinutes)}</td>
                      <td>{minutesToClock(day.targetMinutes)}</td>
                      <td className={day.balanceMinutes >= 0 ? 'balance-positive-text' : 'balance-negative-text'}>{signedClock(day.balanceMinutes)}</td>
                      <td>
                        {sunday ? (
                          <span className="table-muted">—</span>
                        ) : (
                          <button className="row-adjust-button" onClick={() => openEditor(day)}><PencilLine size={14} /> Ajustar</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="week-grid">
            {calc.weeks.map((week) => (
              <div className="week-card" key={week.index}>
                <span>{week.label}</span>
                <strong>{minutesToClock(week.workedMinutes)}</strong>
                <small>{week.startDate} · {week.endDate}</small>
                <em className={week.balanceMinutes >= 0 ? 'balance-positive-text' : 'balance-negative-text'}>{signedClock(week.balanceMinutes)}</em>
              </div>
            ))}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell mirrors-shell">
      <section className="container mirrors-home">
        <div className="mirrors-home-head">
          <div>
            <span>ESPELHOS</span>
            <h1>Registros lidos</h1>
            <p>Abra um espelho para conferir REP, definir folgas, completar batidas e gerar o PDF calculado.</p>
          </div>
          <button className="secondary" onClick={refresh}><RefreshCw size={16} /> Atualizar</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {!items.length ? (
          <div className="empty-mirrors"><FileText size={28} /><strong>Nenhum espelho registrado</strong><span>Use o Painel para ler um PDF primeiro.</span></div>
        ) : (
          <div className="mirror-list">
            {items.map((item) => (
              <button className="mirror-list-item" key={item.id} onClick={() => setSelectedId(item.id)}>
                <div className="mirror-list-icon"><FileText size={18} /></div>
                <div className="mirror-list-main"><strong>{item.employeeName}</strong><span>{item.monthLabel} · página {item.pageNumber}</span></div>
                <div className="mirror-list-metrics"><span>{minutesToClock(item.calculation.totalWorkedMinutes)} REP</span><b className={item.calculation.scheduledBalanceMinutes >= 0 ? 'balance-positive-text' : 'balance-negative-text'}>{signedClock(item.calculation.scheduledBalanceMinutes)}</b></div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
