import { usePlanning } from '../lib/planningConfig'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import type { Assignment, Consultation, CoverageProfile, ShiftRequest, Staff } from '../types'
import { isScheduledRestDay } from '../lib/cadences'
import { absenceAppearance, isAbsence } from '../lib/absences'
import type { ShiftSelection } from './ShiftEditor'

export default function AgendaView({ date, today, staff, assignments, consultations, requests, coverageProfiles, isSupervisor, onDate, onSelect, onMove }: {
 date:string; today:string; staff:Staff[]; assignments:Assignment[]; consultations:Consultation[]; requests:ShiftRequest[]; coverageProfiles:CoverageProfile[]; isSupervisor:boolean
 onDate:(date:string)=>void; onMove:(days:number)=>void; onSelect:(selection:ShiftSelection)=>void
}) {
 const planning=usePlanning(); const {start_date:ROTA_START,end_date:ROTA_END,holidays:HOLIDAYS}=planning
 return <section className="agenda-view" aria-label="Agenda diaria">
  <div className="agenda-date-bar"><label><CalendarDays size={18}/> Día<input aria-label="Día de la agenda" type="date" value={date} onChange={e=>{if(e.target.value)onDate(e.target.value)}}/></label><button className="soft-button" disabled={date===today} title="Ir al día de hoy" onClick={()=>onDate(today)}>Hoy</button></div>
  <div className="agenda-day-heading"><button className="soft-button" aria-label="Día anterior" onClick={()=>onMove(-1)}><ChevronLeft size={20}/></button><div aria-live="polite"><span>{date===today?'Hoy':format(parseISO(date),'EEEE',{locale:es})}</span><h2>{format(parseISO(date),"d 'de' MMMM",{locale:es})}</h2>{HOLIDAYS[date]&&<small className="agenda-holiday">Festivo · {HOLIDAYS[date]}</small>}</div><button className="soft-button" aria-label="Día siguiente" onClick={()=>onMove(1)}><ChevronRight size={20}/></button></div>
  {(date<ROTA_START||date>ROTA_END)&&<p className="helper">Este día está fuera del periodo de planificación; puedes consultarlo. Para asignar turnos, amplía el periodo en Configuración.</p>}
  <div className="agenda-people">{staff.map(person=>{
   const shifts=assignments.filter(a=>a.professional_id===person.id&&a.work_date===date).sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.end_time.localeCompare(b.end_time))
   const scheduledRest=date>='2026-11-01'&&!shifts.some(a=>!isAbsence(a.consultation_id))&&isScheduledRestDay(coverageProfiles.find(p=>p.staff_id===person.id),date)
   const absence=requests.find(r=>r.professional_id===person.id&&r.status==='approved'&&['vacation','permission'].includes(r.request_type)&&r.date_from<=date&&r.date_to>=date)
   return <article className={`agenda-person ${scheduledRest&&!absence?'agenda-rest':''}`} key={person.id}><header><h3>{person.display_name}</h3>{isSupervisor&&<button className="text-button inline" onClick={()=>onSelect({date,personId:person.id})}>{shifts.length?'Gestionar':'Asignar'}</button>}</header>
    {absence&&<p className="agenda-absence">{absence.request_type==='vacation'?'Vacaciones aprobadas':'Permiso aprobado'}</p>}
    {shifts.map(shift=>{const consultation=consultations.find(c=>c.id===shift.consultation_id);const special=isAbsence(shift.consultation_id)?absenceAppearance(shift.consultation_id):null;return <button key={shift.id} title={shift.notes?.trim()?`Nota: ${shift.notes.trim()}`:undefined} className={`agenda-shift ${special?`agenda-absence-${special.className}`:''} ${shift.notes?.trim()?'has-note':''}`} onClick={()=>onSelect({date,personId:person.id,consultationId:shift.consultation_id})} aria-label={`${person.display_name}: ${special?.label??consultation?.label??shift.consultation_id}${shift.is_extra?' (extra)':''}, ${shift.start_time.slice(0,5)} a ${shift.end_time.slice(0,5)}${shift.notes?.trim()?`. Nota: ${shift.notes.trim()}`:''}`}><span className="agenda-consultation-color" style={{background:special?.color??consultation?.color??'#50755a'}}/><span><strong>{special?.label??consultation?.label??shift.consultation_id}{special?.symbol&&` (${special.symbol})`}{shift.is_extra?' *':''}</strong><span className="agenda-time"><Clock3 size={15}/>{shift.start_time.slice(0,5)}–{shift.end_time.slice(0,5)}{shift.provisional&&<small>Provisional</small>}</span></span><ChevronRight size={18}/></button>})}
    {!shifts.length&&<p className="agenda-empty">{scheduledRest&&!absence?'Descanso':'Sin turno asignado'}</p>}
   </article>
  })}{!staff.length&&<p className="all-clear">No hay profesionales en esta selección.</p>}</div>
 </section>
}
