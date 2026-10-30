import { planningMonths, usePlanning } from '../lib/planningConfig'
import { ExceptionRegister } from './CoverageExceptions'
import type { CoverageException, CoverageReview } from '../types'
import ReviewIssueButton from './ReviewIssueButton'
import { useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, Megaphone } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ShiftRequest, TeamBroadcast } from '../types'
import type { CoverageIssue } from '../lib/coverage'
import type { ShiftSelection } from './ShiftEditor'

export function NotificationsPanel({broadcasts,requests,onBroadcasts,onRequest}:{broadcasts:TeamBroadcast[];requests:ShiftRequest[];onBroadcasts:()=>void;onRequest:(id?:string)=>void}) {
 const labels={vacation:'Vacaciones',permission:'Permiso',swap:'Cambio de turno',preference:'Preferencia',correction:'Corrección'}
 const statuses={pending:'Pendiente de resolver',approved:'Aprobada',rejected:'Rechazada'}
 return <section className="content-section notifications-page"><div className="section-heading"><div><span className="eyebrow">Mensajes y respuestas</span><h1>Notificaciones</h1><p>Avisos y novedades en solicitudes que todavía no has leído.</p></div></div>
  {broadcasts.length+requests.length===0&&<p className="all-clear"><CheckCircle2 size={18}/> Estás al día. No tienes notificaciones sin leer.</p>}
  <div className="attention-grid">
   <section className="panel"><h2><Megaphone size={20}/> Avisos sin leer <span className="personal-count">{broadcasts.length}</span></h2>{broadcasts.length?<ul className="personal-notice-list">{broadcasts.slice(0,5).map(b=><li key={b.id}><strong>{b.title}</strong><small>{format(parseISO(b.created_at),'d MMM · HH:mm',{locale:es})}</small></li>)}</ul>:<p>No hay avisos sin leer.</p>}{broadcasts.length>5&&<p className="helper">Se muestran los 5 más recientes.</p>}<button className="soft-button" onClick={onBroadcasts}>{broadcasts.length?'Leer avisos':'Ver todos los avisos'}</button></section>
   <section className="panel"><h2><Bell size={20}/> Novedades en solicitudes <span className="personal-count">{requests.length}</span></h2>{requests.length?<div className="personal-request-list">{requests.slice(0,5).map(r=><button key={r.id} onClick={()=>onRequest(r.id)}><span><strong>{labels[r.request_type]} · {statuses[r.status]}</strong><small>{format(parseISO(r.date_from),'d MMM',{locale:es})}{r.date_to!==r.date_from?` – ${format(parseISO(r.date_to),'d MMM',{locale:es})}`:''}</small></span><span>Ver</span></button>)}</div>:<p>No hay novedades sin leer en tus solicitudes.</p>}{requests.length>5&&<p className="helper">Se muestran las 5 más recientes.</p>}<button className="soft-button" onClick={()=>onRequest()}>Ver solicitudes</button></section>
  </div><p className="helper">Las solicitudes pueden seguir pendientes de resolver aunque ya las hayas leído.</p>
 </section>
}

export function CoverageIssuesPanel({issues,onAssign,onCalendar,onException,onReview,onReopen,reviews=[],exceptions=[],onRevoke}:{onException?:(issue:CoverageIssue)=>void;onReview?:(issue:CoverageIssue)=>Promise<string|null>;onReopen?:(id:string)=>Promise<string|null>;reviews?:CoverageReview[];exceptions?:CoverageException[];onRevoke?:(id:string)=>Promise<string|null>;issues:CoverageIssue[];onAssign:(selection:ShiftSelection)=>void;onCalendar:(date:string)=>void}) {
 usePlanning()
 const [month,setMonth]=useState('all')
 const [severity,setSeverity]=useState('all')
 const [limit,setLimit]=useState(20)
 const months=planningMonths()
 const filtered=issues.filter(i=>(month==='all'||i.date.startsWith(month))&&(severity==='all'||i.severity===severity))
 return <section className="content-section coverage-issues-page"><div className="section-heading"><div><span className="eyebrow">Planificación en borrador</span><h1>Incidencias de cobertura</h1><p>{issues.length} incidencias en el periodo disponible. Se actualizan al corregir los turnos o las reglas de cobertura.</p></div></div>
  <div className="panel"><div className="attention-filters"><label>Mes<select value={month} onChange={e=>{setMonth(e.target.value);setLimit(20)}}><option value="all">Todo el periodo</option>{months.map(m=><option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>)}</select></label><label>Tipo de incidencia<select value={severity} onChange={e=>{setSeverity(e.target.value);setLimit(20)}}><option value="all">Todas</option><option value="critical">Sin cobertura</option><option value="warning">Cobertura insuficiente o turnos suspendidos</option></select></label></div>
   <p role="status">{filtered.length} {filtered.length===1?'incidencia':'incidencias'} en esta selección.</p>
   {filtered.slice(0,limit).map(i=><article className={`priority-item ${i.severity}`} key={i.id}><AlertTriangle size={19}/><div><span className={`queue-level ${i.severity==='critical'?'urgent':'review'}`}>{i.severity==='critical'?'Sin cobertura':'Revisar'}</span><strong>{i.title}</strong><small>{format(parseISO(i.date),'EEE d MMM',{locale:es})} · {i.detail}</small></div><div className="attention-actions"><button className="soft-button" onClick={()=>onAssign({date:i.date,consultationId:i.consultationId,startTime:i.startTime,endTime:i.endTime,findCoverage:i.kind==='shortage'})}>{i.kind==='shortage'?'Buscar cobertura':'Revisar turno'}</button>{i.exceptionRule&&onException&&<button className="soft-button" onClick={()=>onException(i)}>Añadir excepción</button>}{onReview&&<ReviewIssueButton issue={i} onReview={onReview}/>}<button className="text-button inline" onClick={()=>onCalendar(i.date)}>Ver día</button></div></article>)}
   {filtered.length>limit&&<button className="soft-button" onClick={()=>setLimit(n=>n+20)}>Mostrar más incidencias</button>}
   {!filtered.length&&<p className="all-clear"><CheckCircle2 size={18}/>{issues.length?'No hay incidencias con estos filtros.':'No hay incidencias de cobertura en el periodo disponible.'}</p>}
  </div>{onReopen&&<ReviewedIncidents reviews={reviews.filter(r=>!r.reopened_at)} onReopen={onReopen}/>} {onRevoke&&<ExceptionRegister exceptions={exceptions} onRevoke={onRevoke}/>} 
 </section>
}

function ReviewedIncidents({reviews,onReopen}:{reviews:CoverageReview[];onReopen:(id:string)=>Promise<string|null>}){
 const [busy,setBusy]=useState<string|null>(null)
 const [error,setError]=useState('')
 return <details className="panel exception-register"><summary>Incidencias revisadas: sin cobertura necesaria ({reviews.length})</summary><p className="helper">La supervisora puede reabrir cualquiera de estas incidencias. Si cambia la regla de cobertura, la revisión anterior no oculta una nueva incidencia.</p>{error&&<p role="alert" className="form-message">{error}</p>}{!reviews.length&&<p>No hay incidencias marcadas como revisadas.</p>}{reviews.map(r=><article key={r.id}><div><strong>{format(parseISO(r.work_date),'d MMM yyyy',{locale:es})} · {r.consultation_id}</strong><p className="exception-reason">Incidencia revisada: sin cobertura necesaria</p><small>{r.created_by_name} · {format(parseISO(r.reviewed_at),'d MMM yyyy · HH:mm',{locale:es})}</small></div><button type="button" className="soft-button" disabled={busy!==null} onClick={async()=>{if(!window.confirm('¿Reabrir esta incidencia?'))return;setBusy(r.id);setError('');try{setError(await onReopen(r.id)??'')}catch{setError('No se ha podido reabrir la incidencia.')}finally{setBusy(null)}}}>{busy===r.id?'Reabriendo…':'Reabrir incidencia'}</button></article>)}</details>
}
