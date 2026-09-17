import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker, type Worker } from 'tesseract.js'
import type { ProcessingProgress, SplitResult } from '../types'
import { calculateFromPlainText, calculateFromRepColumn, type PositionedText } from './calculation'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function cleanText(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim()
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').replace(/\.+$/g, '').trim()
}

function parseDate(value: string) {
  const match = value.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  let year = Number(match[3])
  if (year < 100) year += 2000
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return { day, month, year }
}

function parseEmployee(text: string) {
  const normalized = cleanText(text)
  const codeBefore = normalized.match(/(\d{5,10})\s*Funcion[aá]rio\s*:/i)
  const afterLabel = normalized.match(
    /Funcion[aá]rio\s*:?\s*(?:(\d{1,10})\s*)?(.+?)(?=\s*(?:Cargo|Admiss[aã]o|Setor|PIS|CPF|Per\.?\s*de\s*Ref\.?|Emiss[aã]o)\s*:|$)/i,
  )
  let employeeCode = codeBefore?.[1] || afterLabel?.[1] || ''
  let employeeName = afterLabel?.[2] || ''
  employeeName = employeeName.replace(/^\d{1,10}\s+/, '').replace(/\s{2,}/g, ' ').trim()
  employeeCode = employeeCode.trim()
  return { employeeName, employeeCode }
}

function parsePeriod(text: string) {
  const normalized = cleanText(text)
  const patterns = [
    /Per\.?\s*de\s*Ref\.?\s*:?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s*(?:à|a|ate|até|-)\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
    /Per[ií]odo\s*:?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s*(?:à|a|ate|até|-)\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (!match) continue
    const start = parseDate(match[1])
    const end = parseDate(match[2])
    if (!start || !end) continue
    const monthName = MONTHS[start.month - 1]
    return {
      periodStart: match[1].replace(/[.-]/g, '/'),
      periodEnd: match[2].replace(/[.-]/g, '/'),
      monthLabel: `${monthName} ${start.year}`,
      folderName: `${monthName}_${start.year}`,
    }
  }
  return null
}

function fallbackMonthFromFileName(fileName: string) {
  const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  for (let i = 0; i < MONTHS.length; i++) {
    const month = MONTHS[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    if (normalized.includes(month)) {
      const yearMatch = normalized.match(/20\d{2}/)
      const year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear()
      return { periodStart: '', periodEnd: '', monthLabel: `${MONTHS[i]} ${year}`, folderName: `${MONTHS[i]}_${year}` }
    }
  }
  return null
}

async function pageNativeData(page: any) {
  const content = await page.getTextContent()
  const positioned: PositionedText[] = []
  const plain: string[] = []
  for (const item of content.items as any[]) {
    if (!('str' in item)) continue
    const text = String(item.str || '').trim()
    if (!text) continue
    plain.push(text)
    positioned.push({
      text,
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      width: Number(item.width || 0),
    })
  }
  return { text: plain.join(' '), positioned }
}

async function pageOcr(
  page: any,
  worker: Worker,
  onProgress: (progress: ProcessingProgress) => void,
  pageNumber: number,
  totalPages: number,
) {
  const original = page.getViewport({ scale: 1 })
  const targetWidth = 1800
  const scale = Math.max(1, Math.min(1.65, targetWidth / original.width))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Não foi possível preparar a página para OCR.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: context, viewport }).promise
  onProgress({
    value: Math.round(((pageNumber - 0.35) / totalPages) * 100),
    label: `OCR na página ${pageNumber} de ${totalPages}`,
  })
  const result = await worker.recognize(canvas)
  canvas.width = 1
  canvas.height = 1
  return result.data.text || ''
}

function buildName(name: string, monthLabel: string, pageNumber: number) {
  const safeName = sanitizeFileName(name || `Página ${String(pageNumber).padStart(2, '0')}`)
  const safeMonth = sanitizeFileName(monthLabel || 'Período não identificado')
  return `${safeName} - ${safeMonth}.pdf`
}

function uniqueName(base: string, seen: Map<string, number>) {
  const key = base.toLocaleLowerCase('pt-BR')
  const count = (seen.get(key) || 0) + 1
  seen.set(key, count)
  return count === 1 ? base : base.replace(/\.pdf$/i, ` (${count}).pdf`)
}

export async function splitPointFiles(
  files: File[],
  onProgress: (progress: ProcessingProgress) => void,
): Promise<SplitResult[]> {
  const results: SplitResult[] = []
  const seenNames = new Map<string, number>()
  let pagesDone = 0
  let totalPages = 0
  const sources: Array<{ file: File; pdfjs: any; pdfLib: PDFDocument }> = []

  for (const file of files) {
    const buffer = await file.arrayBuffer()
    const pdfjs = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise
    const pdfLib = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true })
    totalPages += pdfjs.numPages
    sources.push({ file, pdfjs, pdfLib })
  }

  let ocrWorker: Worker | null = null

  try {
    for (const source of sources) {
      for (let index = 0; index < source.pdfjs.numPages; index++) {
        const pageNumber = index + 1
        const page = await source.pdfjs.getPage(pageNumber)
        onProgress({ value: Math.round((pagesDone / Math.max(totalPages, 1)) * 100), label: `Lendo ${source.file.name} · página ${pageNumber}/${source.pdfjs.numPages}` })

        const native = await pageNativeData(page)
        let text = native.text
        let employee = parseEmployee(text)
        let period = parsePeriod(text)
        let usedOcr = false
        let ocrText = ''

        if (!employee.employeeName || !period || native.positioned.length < 10) {
          if (!ocrWorker) {
            onProgress({ value: Math.max(1, Math.round((pagesDone / Math.max(totalPages, 1)) * 100)), label: 'Ativando OCR somente para a página necessária' })
            ocrWorker = await createWorker('por', 1)
          }
          ocrText = await pageOcr(page, ocrWorker, onProgress, pagesDone + 1, totalPages)
          usedOcr = true
          text = `${text}\n${ocrText}`
          employee = parseEmployee(text)
          period = parsePeriod(text)
        }

        if (!period) period = fallbackMonthFromFileName(source.file.name)
        const employeeName = employee.employeeName || `Página ${String(pageNumber).padStart(2, '0')}`
        const monthLabel = period?.monthLabel || 'Período não identificado'
        const folderName = period?.folderName || 'Periodo_nao_identificado'
        const fileName = uniqueName(buildName(employeeName, monthLabel, pageNumber), seenNames)

        let calculation = calculateFromRepColumn(native.positioned, period?.periodStart || '', period?.periodEnd || '')
        if (calculation.source === 'UNAVAILABLE' && ocrText) {
          calculation = calculateFromPlainText(ocrText, period?.periodStart || '', period?.periodEnd || '')
        }

        // Guarda somente a página original. O PDF calculado é gerado depois, em Espelhos.
        const output = await PDFDocument.create()
        const [copiedPage] = await output.copyPages(source.pdfLib, [index])
        output.addPage(copiedPage)
        const bytes = await output.save({ useObjectStreams: true })

        const warnings: string[] = []
        if (!employee.employeeName) warnings.push('Nome não identificado automaticamente.')
        if (!period) warnings.push('Período não identificado automaticamente.')
        if (calculation.source === 'UNAVAILABLE') warnings.push('Marcações REP não identificadas nesta página.')
        if (calculation.incompleteDays > 0) warnings.push(`${calculation.incompleteDays} dia(s) com quantidade ímpar de marcações.`)

        results.push({
          id: crypto.randomUUID(),
          employeeName,
          employeeCode: employee.employeeCode,
          periodStart: period?.periodStart || '',
          periodEnd: period?.periodEnd || '',
          monthLabel,
          folderName,
          fileName,
          sourceFileName: source.file.name,
          pageNumber,
          bytes,
          usedOcr,
          calculation,
          warning: warnings.length ? warnings.join(' ') : undefined,
          registeredAt: new Date().toISOString(),
        })

        pagesDone += 1
        page.cleanup()
        onProgress({ value: Math.round((pagesDone / Math.max(totalPages, 1)) * 100), label: `${pagesDone} de ${totalPages} espelhos lidos` })

        // Libera um frame entre páginas para evitar travar/escurecer a interface.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    }
  } finally {
    if (ocrWorker) await ocrWorker.terminate()
  }

  return results
}
