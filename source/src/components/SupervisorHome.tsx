import { usePlanning, clampDate, periodLabel, planningMonths } from '../lib/planningConfig'
import { memo, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Megaphone, Plus, Users } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Assignment, Consultation, ShiftRequest, Staff } from '../types'
import type { CoverageIssue } from '../lib/coverage'
import ReviewIssueButton from './ReviewIssueButton'
import { hasAbsence, overlaps } from '../lib/scheduling'
import type { ShiftSelection } from './ShiftEditor'
export default memo(function SupervisorHome({onException,onReview,staff,consultations,assignments,requests,issues,profile,onAssign,onCalendar,onRequest,onBroadcast,onTeam}:{onException?:(issue:CoverageIssue)=>void;onReview?:(issue:CoverageIssue)=>Promise<string|null>;staff:Staff[];consultations:Consultation[];assignments:Assignment[];requests:ShiftRequest[];issues:CoverageIssue[];profile:Staff;onAssign:(s:ShiftSelection)=>void;onCalendar:(date:string)=>void;onRequest:(id?:string)=>void;onBroadcast:()=>void;onTeam:()=>void}) {
 const planning=usePlanning(); const {start_date:ROTA_START,end_date:ROTA_END,holidays:HOLIDAYS}=planning
 const today=format(new Date(),'yyyy-MM-dd')
 const currentMonth=today.slice(0,7)
 const [date,setDate]=useState(today)
 const [scope,setScope]=useState(()=>planningMonths().includes(currentMonth)?currentMonth:'all')
 const [expanded,setExpanded]=useState(false)
 const pending=useMemo(()=>requests.filter(r=>r.status==='pending'&&r.created_by!==profile.user_id),[requests,profile.user_id])
 const activeIssues=useMemo(()=>issues.filter(i=>i.date>=today&&(scope==='all'||i.date.startsWith(scope))),[issues,scope,today])
 const professionals=useMemo(()=>staff.filter(s=>s.active&&s.role==='professional'),[staff])
 const dayAssignments=useMemo(()=>assignments.filter(a=>a.work_date===date),[assignments,date])
 const conflictDetails=useMemo(()=>{
  const details=new Map<string,string[]>()
  const groups=new Map<string,Assignment[]>()
  for(const a of assignments){
   if(a.work_date<today)continue
   const key=`${a.professional_id}|${a.work_date}`
   const rows=groups.get(key)
   if(rows)rows.push(a);else groups.set(key,[a])
  }
  const consultationLabel=new Map(consultations.map(c=>[c.id,c.label]))
  for(const rows of groups.values()){
   for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    const a=rows[i],b=rows[j]
    if(!overlaps(a.start_time,a.end_time,b.start_time,b.end_time))continue
    const aText=`Coincide con ${consultationLabel.get(b.consultation_id)??b.consultation_id} (${b.start_time.slice(0,5)}–${b.end_time.slice(0,5)}).`
    const bText=`Coincide con ${consultationLabel.get(a.consultation_id)??a.consultation_id} (${a.start_time.slice(0,5)}–${a.end_time.slice(0,5)}).`
    details.set(a.id,[...(details.get(a.id)??[]),aText])
    details.set(b.id,[...(details.get(b.id)??[]),bText])
   }
  }
  const absences=requests.filter(r=>r.status==='approved'&&['vacation','permission'].includes(r.request_type))
  for(const a of assignments){
   if(a.work_date<today)continue
   if(absences.some(r=>r.professional_id===a.professional_id&&r.date_from<=a.work_date&&r.date_to>=a.work_date)){
    details.set(a.id,[...(details.get(a.id)??[]),'Tiene vacaciones o un permiso aprobado para ese día. Revisa su disponibilidad.'])
   }
  }
  return details
 },[assignments,consultations,requests,today])
 const conflicts=useMemo(()=>assignments.filter(a=>conflictDetails.has(a.id)),[assignments,conflictDetails])
 const staffById=useMemo(()=>new Map(staff.map(s=>[s.id,s])),[staff])
 const staffByUserId=useMemo(()=>new Map(staff.filter(s=>s.user_id).map(s=>[s.user_id!,s])),[staff])
 const consultationById=useMemo(()=>new Map(consultations.map(c=>[c.id,c])),[consultations])
 const dayAssignmentsByProfessional=useMemo(()=>{const map=new Map<string,Assignment[]>();for(const a of dayAssignments){const rows=map.get(a.professional_id);if(rows)rows.push(a);else map.set(a.professional_id,[a])}return map},[dayAssignments])
 const issueAction=(i:CoverageIssue)=>onAssign({date:i.date,consultationId:i.consultationId,startTime:i.startTime,endTime:i.endTime,findCoverage:i.kind==='shortage'})
 const queue = [
  ...activeIssues.map(i=>({id:`coverage-${i.id}`,date:i.date,level:i.severity==='critical'?0:1,title:i.title,detail:i.detail,action:i.kind==='suspended'?'Revisar turno':'Buscar cobertura',exceptionIssue:i.exceptionRule?i:undefined,reviewIssue:i,run:()=>issueAction(i)})),
  ...conflicts.filter(a=>scope==='all'||a.work_date.startsWith(scope)).map(a=>({id:`conflict-${a.id}`,date:a.work_date,level:1,title:`Conflicto · ${staffById.get(a.professional_id)?.display_name??'Profesional'}`,detail:(conflictDetails.get(a.id)??[]).join(' '),action:'Revisar turno',exceptionIssue:undefined,reviewIssue:undefined,run:()=>onAssign({date:a.work_date,personId:a.professional_id})})),
  ...pending.filter(r=>scope==='all'||r.date_from.startsWith(scope)).map(r=>({id:`request-${r.id}`,date:r.date_from,level:1,title:`Solicitud · ${(r.created_by?staffByUserId.get(r.created_by)?.display_name:undefined)??staffById.get(r.professional_id)?.display_name??'Profesional'}`,detail:r.details,action:'Revisar solicitud',exceptionIssue:undefined,reviewIssue:undefined,run:()=>onRequest(r.id)})),
 ].sort((a,b)=>a.level-b.level||a.date.localeCompare(b.date)||a.title.localeCompare(b.title))
 return <section className="content-section supervisor-home"><div className="section-heading"><div><span className="eyebrow">Tu centro de trabajo</span><h1>Mi equipo hoy</h1><p>Lo importante primero. Resuelve cada pendiente desde aquí.</p></div><button className="primary" onClick={()=>onCalendar(clampDate(date))}><CalendarDays size={18}/> Ver mes completo</button></div>
 <div className="home-metrics"><button onClick={()=>document.getElementById('coverage-priorities')?.scrollIntoView({behavior:'smooth'})}><span className="metric-icon critical"><AlertTriangle/></span><strong>{queue.filter(i=>i.level===0).length}</strong><span>Urgentes</span></button><button onClick={()=>document.getElementById('coverage-priorities')?.scrollIntoView({behavior:'smooth'})}><span className="metric-icon warning"><Users/></span><strong>{queue.filter(i=>i.level===1).length}</strong><span>Por revisar</span></button><button onClick={()=>onRequest()}><span className="metric-icon"><CalendarDays/></span><strong>{pending.length}</strong><span>Solicitudes pendientes</span></button></div>
 <div className="quick-actions"><button className="soft-button" onClick={()=>onAssign({date:clampDate(date)})}><Plus size={17}/> Asignar turno</button><button className="soft-button" onClick={onBroadcast}><Megaphone size={17}/> Escribir aviso</button><button className="soft-button" onClick={onTeam}><Users size={17}/> Equipo</button></div>
 <div className="dashboard-columns"><section className="panel priorities" id="coverage-priorities"><div className="section-heading"><div><h2>Pendientes de resolver <span className="queue-count">{queue.length}</span></h2><p>Cobertura, conflictos y solicitudes en una sola lista, ordenados por prioridad y fecha.</p></div><label className="scope-filter">Periodo<select value={scope} onChange={e=>{setScope(e.target.value);setExpanded(false)}}><option value="all">Todo el periodo</option>{planningMonths().map(m=><option key={m} value={m}>{format(parseISO(m+'-01'),'MMMM yyyy',{locale:es})}</option>)}</select></label></div>
 {queue.slice(0,expanded?queue.length:8).map(item=><article className={`priority-item ${item.level===0?'critical':'warning'}`} key={item.id}>{item.level===0?<AlertTriangle size={19}/>:<CalendarDays size={19}/>}<div><span className={`queue-level ${item.level===0?'urgent':'review'}`}>{item.level===0?'Urgente':'Revisar'}</span><strong>{item.title}</strong><small>{format(parseISO(item.date),'EEE d MMM',{locale:es})} · {item.detail}</small></div><button className="soft-button" onClick={item.run}>{item.action}<ArrowRight size={15}/></button>{item.exceptionIssue&&onException&&<button className="soft-button" onClick={()=>onException(item.exceptionIssue!)}>Añadir excepción</button>}{item.reviewIssue&&onReview&&<ReviewIssueButton issue={item.reviewIssue} onReview={onReview}/>}</article>)}{queue.length>8&&<button className="text-button inline" onClick={()=>setExpanded(!expanded)}>{expanded?'Mostrar menos':`Ver los ${queue.length} pendientes`}</button>}
 {!queue.length&&<p className="all-clear"><CheckCircle2 size={18}/> No hay pendientes en este periodo.</p>}
 </section><section className="panel day-team"><div className="section-heading"><div><h2>{date===today?'Hoy en el equipo':'Equipo del día'}</h2><p>{format(parseISO(date),"EEEE d 'de' MMMM",{locale:es})}</p></div><label>Día<input type="date" required value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/></label></div>{date<ROTA_START||date>ROTA_END?<p className="helper">El cuadrante disponible abarca {periodLabel()}. Elige un día de ese periodo para consultarlo.</p>:professionals.map(p=>{const personAssignments=dayAssignmentsByProfessional.get(p.id)??[];return <article className="day-person" key={p.id}><strong>{p.display_name}</strong><div>{hasAbsence(p.id,date,requests)?<span className="absence-label">Ausencia aprobada</span>:null}{personAssignments.map(a=><span className="day-shift" key={a.id}><i style={{background:consultationById.get(a.consultation_id)?.color}}/>{consultationById.get(a.consultation_id)?.short_label} · {a.start_time.slice(0,5)}–{a.end_time.slice(0,5)}</span>)}{!personAssignments.length&&<small>Sin turno asignado</small>}</div><button className="text-button inline" onClick={()=>onAssign({date,personId:p.id})}>Gestionar</button></article>})}</section></div>
 </section>
})
