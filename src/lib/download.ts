import JSZip from 'jszip'
import type { SplitResult } from '../types'
import { minutesToClock } from './calculation'

function bytesToBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'application/pdf' })
}

export function downloadResult(result: SplitResult) {
  const blob = bytesToBlob(result.bytes)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = result.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvEscape(value: string | number) {
  const text = String(value ?? '')
  if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export async function downloadZip(
  results: SplitResult[],
  onProgress?: (value: number) => void,
  zipName = 'KERN_Folhas_de_Ponto_Calculadas.zip',
) {
  const zip = new JSZip()

  const rows = [
    [
      'nome',
      'codigo',
      'periodo_inicio',
      'periodo_fim',
      'mes',
      'trabalhado_rep',
      'horas_normais_220h',
      'saldo_mensal',
      'situacao',
      'dias_incompletos',
      'arquivo_origem',
      'pagina',
      'arquivo_saida',
    ],
  ]

  for (const item of results) {
    const folder = zip.folder(item.folderName) || zip
    folder.file(item.fileName, item.bytes)

    const balance = item.calculation.monthlyBalanceMinutes
    rows.push([
      item.employeeName,
      item.employeeCode,
      item.periodStart,
      item.periodEnd,
      item.monthLabel,
      minutesToClock(item.calculation.totalWorkedMinutes),
      minutesToClock(item.calculation.monthlyTargetMinutes),
      `${balance >= 0 ? '+' : '-'}${minutesToClock(balance)}`,
      balance > 0 ? 'HORAS A MAIS' : balance < 0 ? 'DEVENDO HORAS' : 'META ATINGIDA',
      String(item.calculation.incompleteDays),
      item.sourceFileName,
      String(item.pageNumber),
      item.fileName,
    ])
  }

  const csv = rows.map((row) => row.map(csvEscape).join(';')).join('\n')
  zip.file('indice_calculos.csv', '\ufeff' + csv)

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => onProgress?.(Math.round(metadata.percent)),
  )

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
