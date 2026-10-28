import { usePlanning } from './planningConfig'

export const EVENT_IDS = ['VAC', 'PERM', 'FOR', 'DESCANSO'] as const
export type EventId = typeof EVENT_IDS[number]
export type Pattern = 'solid' | 'stripes' | 'dots'
export type EventAppearance = { color: string; intensity: number; pattern: Pattern }
export type CalendarAppearance = Record<EventId, EventAppearance>

export const DEFAULT_CALENDAR_APPEARANCE: CalendarAppearance = {
  VAC: { color: '#d8f1e5', intensity: 100, pattern: 'solid' },
  PERM: { color: '#eadcf0', intensity: 100, pattern: 'solid' },
  FOR: { color: '#ffe3c7', intensity: 100, pattern: 'solid' },
  DESCANSO: { color: '#e3e5e6', intensity: 100, pattern: 'solid' },
}

export function normalizeCalendarAppearance(value: unknown): CalendarAppearance {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(EVENT_IDS.map(id => {
    const candidate = data[id] && typeof data[id] === 'object' ? data[id] as Record<string, unknown> : {}
    const fallback = DEFAULT_CALENDAR_APPEARANCE[id]
    return [id, {
      color: typeof candidate.color === 'string' && /^#[0-9a-f]{6}$/i.test(candidate.color) ? candidate.color : fallback.color,
      intensity: typeof candidate.intensity === 'number' && Number.isFinite(candidate.intensity) ? Math.min(100, Math.max(0, Math.round(candidate.intensity))) : fallback.intensity,
      pattern: candidate.pattern === 'stripes' || candidate.pattern === 'dots' ? candidate.pattern : 'solid',
    }]
  })) as CalendarAppearance
}

export function eventBackground({ color, intensity, pattern }: EventAppearance): string {
  const mix = `color-mix(in srgb, ${color} ${intensity}%, white)`
  if (pattern === 'stripes') return `repeating-linear-gradient(135deg, transparent 0 6px, #ffffff88 6px 10px), ${mix}`
  if (pattern === 'dots') return `radial-gradient(circle, #ffffffbb 1.3px, transparent 1.6px) 0 0 / 9px 9px, ${mix}`
  return mix
}

export function useCalendarAppearance() {
  return normalizeCalendarAppearance(usePlanning().calendar_appearance)
}
