import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getPlanning, setPlanning, usePlanning } from '../lib/planningConfig'
import { DEFAULT_CALENDAR_APPEARANCE, EVENT_IDS, eventBackground, normalizeCalendarAppearance, type CalendarAppearance, type EventId } from '../lib/calendarAppearance'

const LABELS: Record<EventId, string> = { VAC: 'Vacaciones', PERM: 'Permisos', FOR: 'Formación', DESCANSO: 'Descanso' }

export default function CalendarAppearanceSettings({ demo }: { demo: boolean }) {
  const planning = usePlanning()
  const [draft, setDraft] = useState<CalendarAppearance>(() => normalizeCalendarAppearance(planning.calendar_appearance))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => setDraft(normalizeCalendarAppearance(planning.calendar_appearance)), [planning.calendar_appearance])

  const change = (id: EventId, changes: Partial<CalendarAppearance[EventId]>) => {
    setDraft(current => ({ ...current, [id]: { ...current[id], ...changes } }))
    setMessage('')
  }
  async function save() {
    setBusy(true)
    setMessage('')
    try {
      if (demo) {
        setPlanning({ ...getPlanning(), calendar_appearance: draft, updated_at: new Date().toISOString() })
      } else {
        const { data, error } = await supabase!.from('et_planning_settings')
          .update({ calendar_appearance: draft }).eq('id', 1).eq('updated_at', planning.updated_at).select('*')
        if (error) throw error
        if (!data?.length) throw new Error('La configuración ha cambiado. Recarga los ajustes e inténtalo otra vez.')
        setPlanning(data[0])
      }
      setMessage('Colores guardados para todo el equipo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se han podido guardar los colores.')
    } finally { setBusy(false) }
  }

  return <section className="panel calendar-appearance-settings">
    <h2>Colores del calendario</h2>
    <p>Configuración exclusiva de supervisión. Los cambios guardados se verán en el cuadrante de todo el equipo.</p>
    <div className="calendar-appearance-list">{EVENT_IDS.map(id => <div className="calendar-appearance-item" key={id}>
      <strong>{LABELS[id]}</strong>
      <div className="calendar-appearance-controls">
        <label>Color <input type="color" value={draft[id].color} aria-label={`Color de ${LABELS[id]}`} onChange={event => change(id, { color: event.target.value })}/></label>
        <label>Intensidad ({draft[id].intensity}%) <input type="range" min="0" max="100" step="5" value={draft[id].intensity} onChange={event => change(id, { intensity: Number(event.target.value) })}/></label>
        <label>Estilo <select value={draft[id].pattern} onChange={event => change(id, { pattern: event.target.value as CalendarAppearance[EventId]['pattern'] })}><option value="solid">Sólido</option><option value="stripes">Rayas</option><option value="dots">Puntos</option></select></label>
      </div>
      <span className="calendar-appearance-preview" style={{ background: eventBackground(draft[id]) }}>Vista previa · {LABELS[id]}</span>
    </div>)}</div>
    {message && <p className="form-message" role="status">{message}</p>}
    <div className="calendar-appearance-actions"><button type="button" className="soft-button" disabled={busy} onClick={() => { setDraft(structuredClone(DEFAULT_CALENDAR_APPEARANCE)); setMessage('Valores originales preparados. Pulsa Guardar para aplicarlos.') }}>Restablecer valores</button>
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar colores para todos'}</button></div>
  </section>
}
