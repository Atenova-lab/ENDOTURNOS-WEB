import { useEffect, useRef, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Assignment, AssignmentHistory, Consultation, LockedMonth, ShiftRequest, Staff } from '../types'
import { assignmentConflicts } from '../lib/scheduling'
import { usePlanning } from '../lib/planningConfig'

interface Props {
  month: string
  history: AssignmentHistory[]
  assignments: Assignment[]
  staff: Staff[]
  consultations: Consultation[]
  requests: ShiftRequest[]
  lockedMonths: LockedMonth[]
  disabled?: boolean
  onUndo: (change: AssignmentHistory, reason: string | null) => Promise<string | null>
}

export default function UndoLastChange({ month, history, assignments, staff, consultations, requests, lockedMonths, disabled, onUndo }: Props) {
  const planning = usePlanning()
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [message, setMessage] = useState('')
  const [undone, setUndone] = useState<Record<string, { source: string; restoration: string | null }>>({})
  const latest = history.find(change => [change.before_data, change.after_data].some(row => row?.work_date.startsWith(month)))

  // The restoration is also audited. Keep it from becoming a new "undo" that
  // would immediately reapply the change. A subsequent edit enables the button.
  useEffect(() => {
    setUndone(current => {
      let next = current
      for (const [assignmentId, checkpoint] of Object.entries(current)) {
        const row = history.find(change => change.assignment_id === assignmentId)
        if (!checkpoint.restoration && row && row.id !== checkpoint.source) {
          next = { ...next, [assignmentId]: { ...checkpoint, restoration: row.id } }
        }
      }
      return next
    })
  }, [history, undone])
  useEffect(() => { setMessage('') }, [month])

  const checkpoint = latest && undone[latest.assignment_id]
  const consumed = checkpoint && (latest.id === checkpoint.source || !checkpoint.restoration || latest.id === checkpoint.restoration)
  const affected = latest ? [latest.before_data, latest.after_data].filter((row): row is Assignment => row !== null) : []
  const locked = affected.some(row => lockedMonths.some(lock => lock.month === row.work_date.slice(0, 7) + '-01'))
  const outside = affected.some(row => row.work_date < planning.start_date || row.work_date > planning.end_date)
  const superseded = latest && history.find(change => change.assignment_id === latest.assignment_id)?.id !== latest.id
  const unavailable = disabled || busy || !latest || consumed || locked || outside || superseded

  const describe = (row: Assignment | null) => row
    ? `${staff.find(person => person.id === row.professional_id)?.display_name ?? 'Profesional'} · ${consultations.find(item => item.id === row.consultation_id)?.label ?? row.consultation_id} · ${format(parseISO(row.work_date), 'd MMM yyyy', { locale: es })} · ${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}${row.notes ? ` · ${row.notes}` : ''}`
    : 'Sin asignación'

  const undo = async () => {
    if (!latest || unavailable || saving.current) return
    let reason: string | null = latest.before_data?.override_reason ?? null
    const conflicts = latest.before_data ? assignmentConflicts(latest.before_data, assignments, requests, consultations) : []
    if (conflicts.length) {
      reason = window.prompt(`${conflicts.join('\n')}\n\nPara restaurar este turno como excepción, escribe el motivo (mínimo 5 caracteres).`)
      if (!reason || reason.trim().length < 5) return
      reason = reason.trim()
    }
    if (!window.confirm(`¿Deshacer el último cambio de este mes?\n\nAntes: ${describe(latest.before_data)}\nDespués: ${describe(latest.after_data)}\n\nQuedará: ${describe(latest.before_data)}\n\nSe guardará en el borrador del cuadrante.`)) return
    saving.current = true
    setBusy(true)
    setMessage('')
    try {
      const error = await onUndo(latest, reason)
      if (error) { setMessage(error); return }
      setUndone(current => ({ ...current, [latest.assignment_id]: { source: latest.id, restoration: null } }))
      setMessage('Último cambio deshecho. El borrador y la cobertura se han actualizado.')
    } catch {
      setMessage('No se ha podido confirmar la restauración. Actualiza el cuadrante antes de intentarlo de nuevo.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return <div className="quick-undo">
    <button type="button" className="soft-button" disabled={Boolean(unavailable)} onClick={() => void undo()}
      title={locked ? 'El cambio afecta a un mes cerrado.' : outside ? 'El cambio está fuera del periodo activo.' : consumed ? 'Cambio ya deshecho. Puedes seguir editando el cuadrante.' : superseded ? 'Este turno tiene cambios posteriores. Revisa el historial.' : latest ? `Último cambio: ${describe(latest.after_data ?? latest.before_data)}` : 'No hay cambios disponibles para deshacer en este mes.'}>
      <Undo2 size={17}/>{busy ? 'Deshaciendo…' : 'Deshacer último cambio'}
    </button>
    {message && <p role="status" className="form-message">{message}</p>}
  </div>
}
