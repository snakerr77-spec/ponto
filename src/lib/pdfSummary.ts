import { StandardFonts, rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'
import type { DayCalculation, WorkCalculation } from '../types'
import { minutesToClock, signedClock } from './calculation'

type SummaryMeta = {
  employeeName: string
  employeeCode: string
  periodStart: string
  periodEnd: string
  sourceFileName: string
}

const BLACK = rgb(0.035, 0.037, 0.043)
const GRAPHITE = rgb(0.10, 0.11, 0.125)
const SILVER = rgb(0.48, 0.51, 0.56)
const LIGHT_SILVER = rgb(0.83, 0.84, 0.87)
const BORDER = rgb(0.82, 0.83, 0.86)
const PANEL = rgb(0.965, 0.97, 0.978)
const WHITE = rgb(1, 1, 1)
const GREEN = rgb(0.10, 0.50, 0.31)
const RED = rgb(0.76, 0.17, 0.21)

function safeText(value: string) {
  return value
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size: number,
  color = BLACK,
) {
  page.drawText(safeText(value), { x, y, size, font, color })
}

function fitText(font: PDFFont, value: string, maxWidth: number, size: number) {
  const clean = safeText(value)
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean

  let output = clean
  while (output.length > 1 && font.widthOfTextAtSize(`${output}...`, size) > maxWidth) {
    output = output.slice(0, -1)
  }
  return `${output}...`
}

function drawLabelValue(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  x: number,
  y: number,
  label: string,
  value: string,
  maxWidth: number,
) {
  drawText(page, font, label.toUpperCase(), x, y + 16, 6.3, SILVER)
  drawText(page, bold, fitText(bold, value || '-', maxWidth, 9.4), x, y, 9.4, GRAPHITE)
}

function drawMetric(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  note: string,
  valueColor = BLACK,
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: WHITE,
    borderColor: BORDER,
    borderWidth: 0.7,
  })

  drawText(page, font, label.toUpperCase(), x + 11, y + height - 18, 6, SILVER)
  drawText(page, bold, value, x + 11, y + height - 42, 16, valueColor)
  drawText(page, font, fitText(font, note, width - 22, 5.7), x + 11, y + 10, 5.7, SILVER)
}

function statusText(day: DayCalculation) {
  if (day.weekday === 'Dom') return 'FOLGA'
  if (day.status === 'feriado') return 'FERIADO'
  if (day.status === 'folga') return 'FOLGA'
  if (day.manualAdjusted) return 'AJUSTADO'
  if (day.incomplete) return 'REVISAR'
  return 'NORMAL'
}

function statusColor(day: DayCalculation) {
  if (day.weekday === 'Dom' || day.status === 'folga') return SILVER
  if (day.status === 'feriado') return rgb(0.42, 0.34, 0.10)
  if (day.incomplete) return RED
  if (day.manualAdjusted) return rgb(0.24, 0.37, 0.58)
  return GRAPHITE
}

function drawDailyTable(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  days: DayCalculation[],
  x: number,
  topY: number,
  width: number,
  maxRows = 16,
) {
  const rowHeight = 17
  const headerHeight = 19
  const tableDays = days.slice(0, maxRows)
  const tableHeight = headerHeight + tableDays.length * rowHeight
  const bottomY = topY - tableHeight

  page.drawRectangle({ x, y: bottomY, width, height: tableHeight, color: WHITE, borderColor: BORDER, borderWidth: 0.7 })
  page.drawRectangle({ x, y: topY - headerHeight, width, height: headerHeight, color: PANEL })

  const cols = [0, 48, 100, width - 132, width - 73, width]
  const headings = ['Dia', 'Status', 'Marcacoes REP', 'Trab.', 'Saldo']

  for (let i = 0; i < headings.length; i++) {
    drawText(page, bold, headings[i], x + cols[i] + 6, topY - 13, 5.7, SILVER)
  }

  for (let i = 1; i < cols.length - 1; i++) {
    page.drawLine({
      start: { x: x + cols[i], y: bottomY },
      end: { x: x + cols[i], y: topY },
      thickness: 0.35,
      color: BORDER,
    })
  }

  tableDays.forEach((day, index) => {
    const y = topY - headerHeight - rowHeight * (index + 1)
    if (index % 2 === 1) {
      page.drawRectangle({ x, y, width, height: rowHeight, color: rgb(0.988, 0.989, 0.992) })
    }

    page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness: 0.28,
      color: BORDER,
    })

    drawText(page, bold, `${day.weekday} ${day.date}`, x + 6, y + 5.3, 5.9, GRAPHITE)
    drawText(page, bold, statusText(day), x + cols[1] + 6, y + 5.3, 5.1, statusColor(day))

    const marks = day.weekday === 'Dom'
      ? 'FOLGA'
      : day.marks.length
        ? day.marks.join('  ')
        : day.status === 'normal'
          ? '-'
          : statusText(day)

    drawText(page, font, fitText(font, marks, cols[3] - cols[2] - 12, 5.8), x + cols[2] + 6, y + 5.3, 5.8, GRAPHITE)
    drawText(page, font, minutesToClock(day.workedMinutes), x + cols[3] + 7, y + 5.3, 5.8, GRAPHITE)
    drawText(page, bold, signedClock(day.balanceMinutes), x + cols[4] + 7, y + 5.3, 5.8, day.balanceMinutes >= 0 ? GREEN : RED)
  })

  return bottomY
}

function drawSignature(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  x: number,
  y: number,
  width: number,
  name: string,
) {
  page.drawRectangle({
    x,
    y,
    width,
    height: 68,
    color: WHITE,
    borderColor: BORDER,
    borderWidth: 0.7,
  })

  drawText(page, bold, 'CONFERENCIA E ASSINATURA', x + 12, y + 50, 6.2, SILVER)
  drawText(page, font, 'Assinatura do colaborador', x + 12, y + 36, 6, SILVER)

  const lineX = x + 12
  const lineW = width * 0.63
  page.drawLine({
    start: { x: lineX, y: y + 18 },
    end: { x: lineX + lineW, y: y + 18 },
    thickness: 0.7,
    color: GRAPHITE,
  })

  drawText(page, bold, fitText(bold, name || 'Colaborador', lineW, 7.2), lineX, y + 7, 7.2, GRAPHITE)

  const dateX = x + width - 142
  page.drawLine({
    start: { x: dateX, y: y + 18 },
    end: { x: x + width - 12, y: y + 18 },
    thickness: 0.7,
    color: GRAPHITE,
  })
  drawText(page, font, 'Data', dateX, y + 7, 5.7, SILVER)
}

export async function stampCalculationOnOriginal(
  pdf: PDFDocument,
  calculation: WorkCalculation,
  meta: SummaryMeta,
) {
  const original = pdf.getPage(0)
  const { width, height } = original.getSize()
  const page = pdf.addPage([width, height])

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.985, 0.986, 0.989) })

  const margin = Math.max(30, Math.min(46, width * 0.04))
  const contentW = width - margin * 2

  // Header
  const headerH = 62
  page.drawRectangle({ x: margin, y: height - margin - headerH, width: contentW, height: headerH, color: BLACK })
  drawText(page, bold, 'RESUMO DO ESPELHO DE PONTO', margin + 18, height - margin - 24, 11.1, WHITE)
  drawText(page, font, 'Conferencia de jornada, fechamento e assinatura', margin + 18, height - margin - 42, 6.4, LIGHT_SILVER)

  const periodText = `${meta.periodStart || '--/--/----'} a ${meta.periodEnd || '--/--/----'}`
  const periodWidth = font.widthOfTextAtSize(periodText, 6.5)
  drawText(page, font, periodText, margin + contentW - periodWidth - 18, height - margin - 33, 6.5, LIGHT_SILVER)

  // Employee identification
  const infoY = height - margin - headerH - 47
  drawLabelValue(page, font, bold, margin, infoY, 'Colaborador', meta.employeeName || 'Nao identificado', contentW * 0.44)
  drawLabelValue(page, font, bold, margin + contentW * 0.47, infoY, 'Codigo', meta.employeeCode || '-', contentW * 0.15)
  drawLabelValue(page, font, bold, margin + contentW * 0.67, infoY, 'Origem', meta.sourceFileName || 'PDF original', contentW * 0.31)

  const summaryY = infoY - 40
  page.drawRectangle({ x: margin, y: summaryY, width: contentW, height: 24, color: WHITE, borderColor: BORDER, borderWidth: 0.65 })
  const folgas = calculation.days.filter((day) => day.status === 'folga').length
  const feriados = calculation.days.filter((day) => day.status === 'feriado').length
  const domingos = calculation.days.filter((day) => day.weekday === 'Dom').length
  const ajustes = calculation.days.filter((day) => day.manualAdjusted).length
  const resumen = [
    `Dias ${calculation.days.length}`,
    `Folgas ${folgas}`,
    `Feriados ${feriados}`,
    `Domingos ${domingos}`,
    `Revisar ${calculation.incompleteDays}`,
    `Ajustes ${ajustes}`,
  ].join('  ·  ')
  drawText(page, bold, resumen, margin + 12, summaryY + 8, 6.2, GRAPHITE)

  if (calculation.source === 'UNAVAILABLE') {
    const warningY = infoY - 128
    page.drawRectangle({ x: margin, y: warningY, width: contentW, height: 72, color: WHITE, borderColor: BORDER, borderWidth: 0.7 })
    drawText(page, bold, 'MARCACOES REP NAO IDENTIFICADAS', margin + 16, warningY + 44, 12, RED)
    drawText(page, font, 'A folha original foi mantida intacta. Nenhum horario foi inventado.', margin + 16, warningY + 24, 7, GRAPHITE)
    drawSignature(page, font, bold, margin, margin, contentW, meta.employeeName)
    return
  }

  // Metrics
  const metricY = infoY - 118
  const gap = 10
  const metricW = (contentW - gap * 3) / 4
  const metricH = 70
  drawMetric(page, font, bold, margin, metricY, metricW, metricH, 'Trabalhado REP', minutesToClock(calculation.totalWorkedMinutes), 'soma das marcacoes validas')
  drawMetric(page, font, bold, margin + (metricW + gap), metricY, metricW, metricH, 'Meta do espelho', minutesToClock(calculation.scheduledTargetMinutes), 'folgas e feriados descontados')
  drawMetric(page, font, bold, margin + (metricW + gap) * 2, metricY, metricW, metricH, 'Referencia mensal', minutesToClock(calculation.monthlyTargetMinutes), 'carga contratual mensal')
  drawMetric(
    page,
    font,
    bold,
    margin + (metricW + gap) * 3,
    metricY,
    metricW,
    metricH,
    'Saldo do espelho',
    signedClock(calculation.scheduledBalanceMinutes),
    calculation.scheduledBalanceMinutes >= 0 ? 'horas acima da meta' : 'horas faltantes',
    calculation.scheduledBalanceMinutes >= 0 ? GREEN : RED,
  )

  // Weekly cards
  const weeklyTop = metricY - 26
  drawText(page, bold, 'FECHAMENTO SEMANAL', margin, weeklyTop, 6.6, SILVER)
  const weekY = weeklyTop - 55
  const weekCount = Math.max(1, Math.min(calculation.weeks.length, 5))
  const weekGap = 8
  const weekW = (contentW - weekGap * (weekCount - 1)) / weekCount

  calculation.weeks.slice(0, 5).forEach((week, index) => {
    const x = margin + index * (weekW + weekGap)
    page.drawRectangle({ x, y: weekY, width: weekW, height: 44, color: WHITE, borderColor: BORDER, borderWidth: 0.6 })
    drawText(page, bold, `SEMANA ${week.index}`, x + 8, weekY + 30, 5.7, SILVER)
    drawText(page, bold, minutesToClock(week.workedMinutes), x + 8, weekY + 14, 9.5, GRAPHITE)
    drawText(page, font, `meta ${minutesToClock(week.targetMinutes)}`, x + 58, weekY + 15, 5.2, SILVER)
    const balance = signedClock(week.balanceMinutes)
    const balanceWidth = bold.widthOfTextAtSize(balance, 6)
    drawText(page, bold, balance, x + weekW - balanceWidth - 8, weekY + 15, 6, week.balanceMinutes >= 0 ? GREEN : RED)
  })

  // Daily review in two columns
  const sectionTop = weekY - 24
  drawText(page, bold, 'CONFERENCIA DIARIA', margin, sectionTop, 6.6, SILVER)

  const signatureH = 68
  const signatureY = margin
  const dailyBottomLimit = signatureY + signatureH + 20
  const dailyTop = sectionTop - 10
  const availableDailyHeight = dailyTop - dailyBottomLimit
  const rowHeight = 17
  const headerHeight = 19
  const rowsPerColumn = Math.max(8, Math.floor((availableDailyHeight - headerHeight) / rowHeight))
  const maxDays = rowsPerColumn * 2
  const days = calculation.days.slice(0, maxDays)
  const columnGap = 12
  const columnW = (contentW - columnGap) / 2

  drawDailyTable(page, font, bold, days.slice(0, rowsPerColumn), margin, dailyTop, columnW, rowsPerColumn)
  if (days.length > rowsPerColumn) {
    drawDailyTable(page, font, bold, days.slice(rowsPerColumn), margin + columnW + columnGap, dailyTop, columnW, rowsPerColumn)
  }

  // Signature area
  drawSignature(page, font, bold, margin, signatureY, contentW, meta.employeeName)

  drawText(page, font, 'A pagina 1 permanece exatamente como o espelho original.', margin, 12, 5.2, SILVER)

  // Footer traceability
  const footer = `${calculation.days.length} dias · ${calculation.incompleteDays} para revisar · ${calculation.days.filter((day) => day.manualAdjusted).length} ajuste(s) manual(is)`
  const footerWidth = font.widthOfTextAtSize(safeText(footer), 5.2)
  drawText(page, font, footer, width - margin - footerWidth, 12, 5.2, SILVER)
}
