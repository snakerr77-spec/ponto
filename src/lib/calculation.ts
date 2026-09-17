import type { DayCalculation, DayStatus, WeekCalculation, WorkCalculation } from '../types'

export const WEEKLY_TARGET_MINUTES = 44 * 60
export const MONTHLY_TARGET_MINUTES = 220 * 60

export type PositionedText = {
  text: string
  x: number
  y: number
  width: number
}

type ParsedDate = {
  day: number
  month: number
  year: number
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function minutesToClock(minutes: number) {
  const abs = Math.abs(Math.round(minutes))
  return `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

export function signedClock(minutes: number) {
  if (minutes === 0) return '00:00'
  return `${minutes > 0 ? '+' : '-'}${minutesToClock(minutes)}`
}

export function balanceLabel(minutes: number) {
  if (minutes === 0) return 'Meta atingida'
  return minutes > 0 ? `Extra ${minutesToClock(minutes)}` : `Faltam ${minutesToClock(minutes)}`
}

function parsePeriodDate(value: string): ParsedDate | null {
  const match = value.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  let year = Number(match[3])
  if (year < 100) year += 2000
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return { day, month, year }
}

function parseDayMonth(value: string, year: number): ParsedDate | null {
  const match = value.match(/(\d{1,2})[\/.-](\d{1,2})/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return { day, month, year }
}

function toUtc(date: ParsedDate) {
  return Date.UTC(date.year, date.month - 1, date.day)
}

function fromUtc(ms: number): ParsedDate {
  const value = new Date(ms)
  return { day: value.getUTCDate(), month: value.getUTCMonth() + 1, year: value.getUTCFullYear() }
}

function addDays(date: ParsedDate, days: number) {
  return fromUtc(toUtc(date) + days * 86400000)
}

function formatDate(date: ParsedDate, withYear = false) {
  return withYear ? `${pad2(date.day)}/${pad2(date.month)}/${date.year}` : `${pad2(date.day)}/${pad2(date.month)}`
}

function isoDate(date: ParsedDate) {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`
}

function weekdayName(date: ParsedDate) {
  return WEEKDAYS[new Date(toUtc(date)).getUTCDay()]
}

function targetForDate(date: ParsedDate, status: DayStatus) {
  if (status === 'folga' || status === 'feriado') return 0
  const day = new Date(toUtc(date)).getUTCDay()
  if (day === 0) return 0
  if (day === 6) return 4 * 60
  return 8 * 60
}

function timeToMinutes(value: string) {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function calculateWorkedMinutes(marks: string[]) {
  let total = 0
  for (let i = 0; i + 1 < marks.length; i += 2) {
    const start = timeToMinutes(marks[i])
    let end = timeToMinutes(marks[i + 1])
    if (end < start) end += 24 * 60
    total += end - start
  }
  return total
}

function extractTimes(value: string) {
  const matches = value.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g) || []
  return matches.map((time) => {
    const [h, m] = time.split(':')
    return `${pad2(Number(h))}:${m}`
  })
}

function trimRepSequence(times: string[]) {
  if (times.length <= 6) return times
  const first = times[0]
  for (let i = 2; i < times.length; i++) {
    if (times[i] === first) return times.slice(0, i)
  }
  return times.slice(0, 6)
}

function statusFromRow(rowText: string, date: ParsedDate): { status: DayStatus; automatic: boolean } {
  const day = new Date(toUtc(date)).getUTCDay()
  if (day === 0) return { status: 'folga', automatic: true }
  if (/\bFERIADO\b/i.test(rowText)) return { status: 'feriado', automatic: true }
  if (/\bFOL(?:GA)?\b/i.test(rowText)) return { status: 'folga', automatic: true }
  return { status: 'normal', automatic: false }
}

function buildDay(dateText: string, year: number, marks: string[], rowText: string): DayCalculation | null {
  const parsed = parseDayMonth(dateText, year)
  if (!parsed) return null
  const state = statusFromRow(rowText, parsed)
  const sunday = new Date(toUtc(parsed)).getUTCDay() === 0
  const effectiveMarks = sunday ? [] : marks
  const workedMinutes = sunday ? 0 : calculateWorkedMinutes(effectiveMarks)
  const targetMinutes = targetForDate(parsed, state.status)
  return {
    date: formatDate(parsed),
    isoDate: isoDate(parsed),
    weekday: weekdayName(parsed),
    marks: effectiveMarks,
    workedMinutes,
    targetMinutes,
    balanceMinutes: workedMinutes - targetMinutes,
    incomplete: !sunday && effectiveMarks.length % 2 !== 0,
    status: state.status,
    automaticStatus: state.automatic,
    rawText: rowText,
  }
}

function mondayOf(date: ParsedDate) {
  const dow = new Date(toUtc(date)).getUTCDay()
  const diff = dow === 0 ? -6 : 1 - dow
  return addDays(date, diff)
}

function rebuildWeeks(days: DayCalculation[]): WeekCalculation[] {
  const groups = new Map<string, { start: ParsedDate; days: DayCalculation[] }>()
  for (const day of days) {
    const parsed = parsePeriodDate(`${day.date}/${day.isoDate.slice(0, 4)}`)
    if (!parsed) continue
    const start = mondayOf(parsed)
    const key = isoDate(start)
    const current = groups.get(key) || { start, days: [] }
    current.days.push(day)
    groups.set(key, current)
  }

  return Array.from(groups.values())
    .sort((a, b) => toUtc(a.start) - toUtc(b.start))
    .map((group, index) => {
      const end = addDays(group.start, 6)
      const workedMinutes = group.days.reduce((sum, day) => sum + day.workedMinutes, 0)
      const targetMinutes = group.days.reduce((sum, day) => sum + day.targetMinutes, 0)
      return {
        index: index + 1,
        label: `Semana ${index + 1}`,
        startDate: formatDate(group.start, true),
        endDate: formatDate(end, true),
        workedMinutes,
        targetMinutes,
        balanceMinutes: workedMinutes - targetMinutes,
      }
    })
}

function finishCalculation(days: DayCalculation[], source: WorkCalculation['source']): WorkCalculation {
  const sorted = [...days].sort((a, b) => a.isoDate.localeCompare(b.isoDate))
  const totalWorkedMinutes = sorted.reduce((sum, day) => sum + day.workedMinutes, 0)
  const scheduledTargetMinutes = sorted.reduce((sum, day) => sum + day.targetMinutes, 0)
  return {
    weeklyTargetMinutes: WEEKLY_TARGET_MINUTES,
    monthlyTargetMinutes: MONTHLY_TARGET_MINUTES,
    scheduledTargetMinutes,
    totalWorkedMinutes,
    monthlyBalanceMinutes: totalWorkedMinutes - MONTHLY_TARGET_MINUTES,
    scheduledBalanceMinutes: totalWorkedMinutes - scheduledTargetMinutes,
    weeks: rebuildWeeks(sorted),
    days: sorted,
    incompleteDays: sorted.filter((day) => day.incomplete).length,
    source,
  }
}

function emptyCalculation(): WorkCalculation {
  return finishCalculation([], 'UNAVAILABLE')
}

function findRepBoundary(items: PositionedText[]) {
  const full = items.find((item) => /marca[cç][oõ]es\s+reg\.?\s+no\s+rep/i.test(item.text))
  if (full) return full.x + full.width + 18

  const repCandidates = items.filter((item) => /^REP$/i.test(item.text.trim()))
  for (const rep of repCandidates) {
    const sameLine = items.filter((item) => Math.abs(item.y - rep.y) <= 4)
    if (sameLine.some((item) => /marca[cç][oõ]es/i.test(item.text)) || sameLine.some((item) => /reg\.?/i.test(item.text))) {
      return rep.x + rep.width + 18
    }
  }

  return null
}

function dateCandidate(text: string) {
  const match = text.match(/(?:^|\s)(\d{1,2}\/\d{1,2})(?!\/)(?:\s|$)/)
  return match?.[1] || null
}

export function calculateFromRepColumn(
  items: PositionedText[],
  periodStart: string,
  periodEnd: string,
): WorkCalculation {
  const period = parsePeriodDate(periodStart) || parsePeriodDate(periodEnd)
  if (!period) return emptyCalculation()

  const repRightBoundary = findRepBoundary(items)
  const candidates = items
    .map((item) => ({ item, date: dateCandidate(item.text) }))
    .filter((entry): entry is { item: PositionedText; date: string } => Boolean(entry.date))

  const uniqueRows = new Map<string, { item: PositionedText; date: string }>()
  for (const entry of candidates) {
    const key = `${entry.date}:${Math.round(entry.item.y)}`
    if (!uniqueRows.has(key)) uniqueRows.set(key, entry)
  }

  const days: DayCalculation[] = []
  let usedCoordinateColumn = false

  for (const { item: dateItem, date } of uniqueRows.values()) {
    const row = items
      .filter((item) => Math.abs(item.y - dateItem.y) <= 3.4)
      .sort((a, b) => a.x - b.x)

    const rowText = row.map((item) => item.text).join(' ')
    let marks: string[] = []

    if (repRightBoundary != null) {
      const repItems = row.filter((item) => item.x > dateItem.x + dateItem.width - 2 && item.x < repRightBoundary)
      marks = trimRepSequence(repItems.flatMap((entry) => extractTimes(entry.text)))
      if (marks.length) usedCoordinateColumn = true
    }

    if (!marks.length) {
      const dateIndex = rowText.indexOf(date)
      const afterDate = dateIndex >= 0 ? rowText.slice(dateIndex + date.length) : rowText
      marks = trimRepSequence(extractTimes(afterDate))
    }

    const day = buildDay(date, period.year, marks, rowText)
    if (day) days.push(day)
  }

  if (!days.length) return emptyCalculation()
  return finishCalculation(days, usedCoordinateColumn ? 'REP_COORDINATES' : 'REP_ROW_FALLBACK')
}

export function calculateFromPlainText(text: string, periodStart: string, periodEnd: string): WorkCalculation {
  const period = parsePeriodDate(periodStart) || parsePeriodDate(periodEnd)
  if (!period) return emptyCalculation()

  const lines = text.replace(/\r/g, '').split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const days: DayCalculation[] = []
  for (const line of lines) {
    const dateMatch = line.match(/\b(\d{1,2}\/\d{1,2})(?!\/)\b/)
    if (!dateMatch) continue
    const date = dateMatch[1]
    const afterDate = line.slice((dateMatch.index || 0) + date.length)
    const marks = trimRepSequence(extractTimes(afterDate))
    const day = buildDay(date, period.year, marks, line)
    if (day) days.push(day)
  }

  if (!days.length) return emptyCalculation()
  return finishCalculation(days, 'OCR_TEXT')
}

export function setDayStatus(calculation: WorkCalculation, iso: string, status: DayStatus): WorkCalculation {
  const days = calculation.days.map((day) => {
    if (day.isoDate !== iso || day.weekday === 'Dom') return day
    const parsed = parsePeriodDate(`${day.date}/${day.isoDate.slice(0, 4)}`)
    if (!parsed) return day
    const targetMinutes = targetForDate(parsed, status)
    return {
      ...day,
      status,
      automaticStatus: false,
      targetMinutes,
      balanceMinutes: day.workedMinutes - targetMinutes,
    }
  })
  return finishCalculation(days, calculation.source)
}

function normalizeMark(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 3) return ''
  const padded = digits.length === 3 ? `0${digits}` : digits.slice(0, 4)
  const hours = Number(padded.slice(0, 2))
  const minutes = Number(padded.slice(2, 4))
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) return ''
  return `${pad2(hours)}:${pad2(minutes)}`
}

export function setDayMarks(calculation: WorkCalculation, iso: string, marks: string[]): WorkCalculation {
  const days = calculation.days.map((day) => {
    if (day.isoDate !== iso || day.weekday === 'Dom') return day
    const parsed = parsePeriodDate(`${day.date}/${day.isoDate.slice(0, 4)}`)
    if (!parsed) return day
    const normalized = marks.map(normalizeMark).filter(Boolean).slice(0, 6)
    const workedMinutes = calculateWorkedMinutes(normalized)
    const targetMinutes = targetForDate(parsed, day.status)
    return {
      ...day,
      marks: normalized,
      workedMinutes,
      targetMinutes,
      balanceMinutes: workedMinutes - targetMinutes,
      incomplete: normalized.length % 2 !== 0,
      manualAdjusted: true,
    }
  })
  return finishCalculation(days, calculation.source)
}

export function countManualAdjustments(calculation: WorkCalculation) {
  return calculation.days.filter((day) => day.manualAdjusted).length
}
