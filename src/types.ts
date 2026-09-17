export type DayStatus = 'normal' | 'folga' | 'feriado'

export type DayCalculation = {
  date: string
  isoDate: string
  weekday: string
  marks: string[]
  workedMinutes: number
  targetMinutes: number
  balanceMinutes: number
  incomplete: boolean
  status: DayStatus
  automaticStatus?: boolean
  manualAdjusted?: boolean
  rawText?: string
}

export type WeekCalculation = {
  index: number
  label: string
  startDate: string
  endDate: string
  workedMinutes: number
  targetMinutes: number
  balanceMinutes: number
}

export type WorkCalculation = {
  weeklyTargetMinutes: number
  monthlyTargetMinutes: number
  scheduledTargetMinutes: number
  totalWorkedMinutes: number
  monthlyBalanceMinutes: number
  scheduledBalanceMinutes: number
  weeks: WeekCalculation[]
  days: DayCalculation[]
  incompleteDays: number
  source: 'REP_COORDINATES' | 'REP_ROW_FALLBACK' | 'OCR_TEXT' | 'UNAVAILABLE'
}

export type SplitResult = {
  id: string
  employeeName: string
  employeeCode: string
  periodStart: string
  periodEnd: string
  monthLabel: string
  folderName: string
  fileName: string
  sourceFileName: string
  pageNumber: number
  bytes: Uint8Array
  usedOcr: boolean
  calculation: WorkCalculation
  warning?: string
  registeredAt: string
}

export type ProcessingProgress = {
  value: number
  label: string
}
