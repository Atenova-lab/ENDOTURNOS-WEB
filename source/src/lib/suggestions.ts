import {cadenceIntervals,restsOn} from './cadences'
// republish cadence-capacity fix
import { isAbsence, workingIntervals } from './absences'
import {addDays,differenceInCalendarWeeks,endOfMonth,format,getDay,parseISO,startOfWeek} from 'date-fns'
import type {Assignment,Consultation,CoverageException,CoverageProfile,CoverageRule,ShiftRequest,Staff} from '../types'
import type {PlanningConfig} from './planningConfig'
import {assignmentConflicts,defaultCoverageRules,hasAbsence} from './scheduling'
import {copyRuleCheck} from './planning'
import {buildCoverageIssues,minimumCoverage,sameCoverageRule,requiredForAlert} from './coverage'
export interface SuggestionContext {staff:Staff[];consultations:Consultation[];assignments:Assignment[];requests:ShiftRequest[];profiles:CoverageProfile[];exceptions:CoverageException[];planning:PlanningConfig;fingerprint:string}
export interface SuggestedShift extends Assignment {suggestion_reason:string;reference_exception?:boolean}
export function cadenceAllows(profile:CoverageProfile|undefined,date:string,start:string,end:string){
 return cadenceIntervals(profile,date).some(r=>r.start_time<=start.slice(0,5)&&r.end_time>=end.slice(0,5))
}
export const duration=(a:Pick<Assignment,'start_time'|'end_time'>)=>{const m=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return m(a.end_time)-m(a.start_time)}
export function weeklyLoad(person:string,date:string,rows:Assignment[]){const from=format(startOfWeek(parseISO(date),{weekStartsOn:1}),'yyyy-MM-dd');const to=format(addDays(parseISO(from),6),'yyyy-MM-dd');return rows.filter(a=>a.professional_id===person&&a.work_date>=from&&a.work_date<=to&&!isAbsence(a.consultation_id)).reduce((sum,a)=>sum+duration(a),0)}
export function cadenceWeekCapacity(profile:CoverageProfile|undefined,date:string){
 if(!profile?.work_cadences?.length)return 0
 const weekStart=startOfWeek(parseISO(date),{weekStartsOn:1})
 let minutes=0
 for(let i=0;i<7;i++){
  const iso=format(addDays(weekStart,i),'yyyy-MM-dd')
  minutes+=cadenceIntervals(profile,iso).reduce((sum,r)=>sum+duration(r),0)
 }
 return minutes
}
export function suggestMonth(month:string,ctx:SuggestionContext,onlyDate?:string){
 const {staff,consultations,assignments,requests,profiles,exceptions,planning}=ctx
 const from=month+'-01',until=format(endOfMonth(parseISO(from)),'yyyy-MM-dd')
 const warnings:string[]=[];const proposed:SuggestedShift[]=[];const working=[...assignments]
 if(from<planning.start_date||until>planning.end_date)return {proposed,warnings:['Amplía el periodo en Configuración antes de sugerir este mes.'],issues:[]}
 for(const a of assignments.filter(a=>a.work_date>=from&&a.work_date<=until&&!isAbsence(a.consultation_id))){
  if(restsOn(profiles.find(p=>p.staff_id===a.professional_id),a.work_date,a.start_time,a.end_time))warnings.push(`${staff.find(p=>p.id===a.professional_id)?.display_name??'Profesional'}: el turno existente del ${a.work_date} coincide con un descanso recurrente. Revísalo manualmente.`)
 }
 const configured=consultations.filter(c=>c.active&&!isAbsence(c.id))
 for(const p of staff.filter(p=>p.active&&p.role==='professional')){const profile=profiles.find(x=>x.staff_id===p.id);if(!profile?.consultation_ids.length||!profile.work_cadences?.length)warnings.push(`${p.display_name}: ficha de consultas o cadencias pendiente; no se propondrá.`)}
 type Slot={c:Consultation;r:CoverageRule;dates:string[];target:number}
 const slots:Slot[]=[]
 for(const c of configured){
  let open=false
  for(const r of c.coverage_rules??defaultCoverageRules(c.id)){
   const preferred=r.preferred_staff_ids??(c.preferred_staff_id?[c.preferred_staff_id]:[]);if(!preferred.length)warnings.push(`${c.label}: una regla no tiene profesional habitual; se usarán profesionales compatibles.`)
   const dates:string[]=[]
   for(let d=parseISO(from);format(d,'yyyy-MM-dd')<=until;d=addDays(d,1)){
    const date=format(d,'yyyy-MM-dd');if(onlyDate&&date!==onlyDate)continue;if(copyRuleCheck(c,date,r.start_time,r.end_time,consultations,planning).blocked.length||planning.holidays[date]||date<r.valid_from||date>r.valid_until||!r.weekdays.includes(getDay(d))||r.suspensions.some(s=>date>=s.from&&date<=s.to)||(!r.monthly&&differenceInCalendarWeeks(d,parseISO(r.anchor_date),{weekStartsOn:1})%r.every_weeks!==0))continue
    dates.push(date)
   }
   if(dates.length)open=true
   if(r.monthly&&dates.length)slots.push({c,r,dates,target:r.min_staff})
   else for(const date of dates){const exception=c.id==='PLANTA'&&r.min_staff===2&&!r.alternatives?.length&&exceptions.some(e=>!e.revoked_at&&e.work_date===date&&e.consultation_id===c.id&&e.rule_id===r.id&&sameCoverageRule(e.rule_snapshot,r));slots.push({c,r,dates:[date],target:exception?1:r.min_staff})}
  }
  if(!open)warnings.push(`${c.label}: sin franjas abiertas este mes; revisa la vigencia y las suspensiones.`)
 }
 const coverage=(s:Slot,date:string)=>minimumCoverage(workingIntervals(working).filter(a=>[s.c.id,...(s.r.alternatives??[])].includes(a.consultation_id)&&a.work_date===date&&!hasAbsence(a.professional_id,date,requests)),s.r.start_time,s.r.end_time)
 const profilePriority=(profile:CoverageProfile|undefined,consultationId:string)=>{const index=profile?.consultation_ids.indexOf(consultationId)??-1;return index<0?999:index}
 const preferredAbsent=(s:Slot,date:string)=>{const preferred=s.r.preferred_staff_ids??(s.c.preferred_staff_id?[s.c.preferred_staff_id]:[]);return preferred.length>0&&preferred.every(id=>hasAbsence(id,date,requests)||working.some(a=>a.professional_id===id&&a.work_date===date&&isAbsence(a.consultation_id)&&a.start_time<s.r.end_time&&a.end_time>s.r.start_time))}
 const substitutionAllowed=(s:Slot,date:string,id:string)=>{const secondary=s.r.secondary_staff_ids??s.c.secondary_staff_ids??[];return secondary.includes(id)&&!restsOn(profiles.find(p=>p.staff_id===id),date,s.r.start_time,s.r.end_time)&&preferredAbsent(s,date)}
 const available=(s:Slot,date:string)=>{const preferred=s.r.preferred_staff_ids??(s.c.preferred_staff_id?[s.c.preferred_staff_id]:[]);const secondary=s.r.secondary_staff_ids??s.c.secondary_staff_ids??[];const tier=(id:string)=>preferred.includes(id)?0:secondary.includes(id)?1:2;return staff.filter(p=>p.active&&p.role==='professional').map(person=>({person,profile:profiles.find(p=>p.staff_id===person.id)})).filter(({person,profile})=>profile?.consultation_ids.includes(s.c.id)&&(cadenceAllows(profile,date,s.r.start_time,s.r.end_time)||substitutionAllowed(s,date,person.id))&&!assignmentConflicts({professional_id:person.id,work_date:date,consultation_id:s.c.id,start_time:s.r.start_time,end_time:s.r.end_time,provisional:false},working,requests,consultations).length).sort((a,b)=>tier(a.person.id)-tier(b.person.id)||profilePriority(a.profile,s.c.id)-profilePriority(b.profile,s.c.id)||(weeklyLoad(a.person.id,date,working)/Math.max(a.person.weekly_minutes,cadenceWeekCapacity(a.profile,date))-weeklyLoad(b.person.id,date,working)/Math.max(b.person.weekly_minutes,cadenceWeekCapacity(b.profile,date)))||a.person.display_name.localeCompare(b.person.display_name,'es'))}
 const bestPersonalPriority=(s:Slot,date:string)=>Math.min(999,...available(s,date).map(({profile})=>profilePriority(profile,s.c.id)))
 const monthlyFixed:Slot[]=[]
 for(const s of slots.filter(s=>s.r.monthly)){
  if(s.dates.some(d=>coverage(s,d)>=s.target))continue
  const date=[...s.dates].sort((a,b)=>{
   const achievableA=Math.min(s.target,coverage(s,a)+available(s,a).length),achievableB=Math.min(s.target,coverage(s,b)+available(s,b).length)
   return achievableB-achievableA||bestPersonalPriority(s,a)-bestPersonalPriority(s,b)||available(s,a).length-available(s,b).length||a.localeCompare(b)
  })[0]
  if(date)monthlyFixed.push({...s,dates:[date]})
 }
 // Reserve mandatory coverage across all services before filling optional places.
 // A zero-minimum service must not take a candidate needed by a required service.
 const allocationSlots=[...slots.filter(s=>!s.r.monthly),...monthlyFixed]
 const minimumTarget=(s:Slot)=>Math.min(s.target,requiredForAlert(s.r))
 for(const mandatory of [true,false]){
 for(let level=1;level<=Math.max(0,...allocationSlots.map(s=>mandatory?minimumTarget(s):s.target));level++){
  const ordered=[...allocationSlots].filter(s=>(mandatory?minimumTarget(s):s.target)>=level).sort((a,b)=>{
   const da=a.dates[0],db=b.dates[0]
   return available(a,da).length-available(b,db).length
    ||bestPersonalPriority(a,da)-bestPersonalPriority(b,db)
    ||da.localeCompare(db)
    ||a.c.id.localeCompare(b.c.id)
  })
  for(const s of ordered)fill(s,s.dates[0],level)
 }
 }

 // Personal work cadences are hard constraints: every active cadence interval must
 // contain real work unless the professional has an approved/recorded absence.
 const cadenceCovered=(person:string,date:string,start:string,end:string)=>{
  const rows=working.filter(a=>a.professional_id===person&&a.work_date===date&&!isAbsence(a.consultation_id)&&a.start_time<end&&a.end_time>start).sort((a,b)=>a.start_time.localeCompare(b.start_time))
  let cursor=start
  for(const a of rows){
   if(a.end_time<=cursor)continue
   if(a.start_time>cursor)return false
   if(a.end_time>cursor)cursor=a.end_time
   if(cursor>=end)return true
  }
  return cursor>=end
 }
 const cadenceBlocked=(person:string,date:string,start:string,end:string)=>hasAbsence(person,date,requests)||working.some(a=>a.professional_id===person&&a.work_date===date&&isAbsence(a.consultation_id)&&a.start_time<end&&a.end_time>start)
 const ruleTier=(s:Slot,id:string)=>{const preferred=s.r.preferred_staff_ids??(s.c.preferred_staff_id?[s.c.preferred_staff_id]:[]);const secondary=s.r.secondary_staff_ids??s.c.secondary_staff_ids??[];return preferred.includes(id)?0:secondary.includes(id)?1:2}
 const rebalanceForMandatoryCadence=(person:Staff,profile:CoverageProfile,date:string,start:string,end:string,options:Slot[])=>{
  const shortages=slots.filter(s=>!s.r.monthly&&s.dates.includes(date)&&s.r.start_time>=start&&s.r.end_time<=end&&coverage(s,date)<s.target)
  const coveredOptions=options.filter(s=>coverage(s,date)>=s.target)
  for(const target of coveredOptions){
   const occupants=proposed.filter(row=>row.work_date===date&&row.consultation_id===target.c.id&&row.start_time===target.r.start_time&&row.end_time===target.r.end_time)
   for(const occupant of occupants){
    const mover=staff.find(p=>p.id===occupant.professional_id),moverProfile=profiles.find(p=>p.staff_id===occupant.professional_id)
    if(!mover||!moverProfile)continue
    const alternatives=shortages.filter(shortage=>moverProfile.consultation_ids.includes(shortage.c.id)&&cadenceAllows(moverProfile,date,shortage.r.start_time,shortage.r.end_time)&&ruleTier(shortage,mover.id)<2).filter(shortage=>{
     const next={professional_id:mover.id,work_date:date,consultation_id:shortage.c.id,start_time:shortage.r.start_time,end_time:shortage.r.end_time,provisional:false}
     return !assignmentConflicts(next,working.filter(a=>a.id!==occupant.id),requests,consultations).length
    }).sort((a,b)=>ruleTier(a,mover.id)-ruleTier(b,mover.id)||profilePriority(moverProfile,a.c.id)-profilePriority(moverProfile,b.c.id)||a.c.id.localeCompare(b.c.id))
    const shortage=alternatives[0]
    if(!shortage)continue
    occupant.consultation_id=shortage.c.id;occupant.start_time=shortage.r.start_time;occupant.end_time=shortage.r.end_time
    occupant.suggestion_reason=ruleTier(shortage,mover.id)===0?'Reequilibrio: profesional habitual para cubrir otra necesidad':'Reequilibrio: alternativa para cubrir otra necesidad'
    occupant.reference_exception=false
    return target
   }
  }
  return undefined
 }
 const addCadenceShift=(person:Staff,profile:CoverageProfile,date:string,start:string,end:string)=>{
  let guard=0
  while(!cadenceCovered(person.id,date,start,end)&&guard++<12){
   const options=slots.filter(s=>!s.r.monthly&&s.dates.includes(date)&&s.r.start_time>=start&&s.r.end_time<=end&&profile.consultation_ids.includes(s.c.id)).filter(s=>{
    const next={professional_id:person.id,work_date:date,consultation_id:s.c.id,start_time:s.r.start_time,end_time:s.r.end_time,provisional:false}
    return !assignmentConflicts(next,working,requests,consultations).length
   }).sort((a,b)=>{
    const needA=coverage(a,date)<a.target?0:1,needB=coverage(b,date)<b.target?0:1
    const prefA=(a.r.preferred_staff_ids??(a.c.preferred_staff_id?[a.c.preferred_staff_id]:[])).includes(person.id)?0:(a.r.secondary_staff_ids??a.c.secondary_staff_ids??[]).includes(person.id)?1:2
    const prefB=(b.r.preferred_staff_ids??(b.c.preferred_staff_id?[b.c.preferred_staff_id]:[])).includes(person.id)?0:(b.r.secondary_staff_ids??b.c.secondary_staff_ids??[]).includes(person.id)?1:2
    return needA-needB||prefA-prefB||profile.consultation_ids.indexOf(a.c.id)-profile.consultation_ids.indexOf(b.c.id)||a.r.start_time.localeCompare(b.r.start_time)
   })
   let chosen=options.find(s=>coverage(s,date)<s.target)
   if(!chosen&&options.length)chosen=rebalanceForMandatoryCadence(person,profile,date,start,end,options)??options[0]
   if(!chosen)break
   const row:SuggestedShift={id:`suggest-${proposed.length}`,professional_id:person.id,work_date:date,consultation_id:chosen.c.id,start_time:chosen.r.start_time,end_time:chosen.r.end_time,provisional:true,is_extra:false,override_reason:null,notes:null,suggestion_reason:'Cadencia obligatoria del profesional',reference_exception:false}
   proposed.push(row);working.push(row)
  }
  if(!cadenceCovered(person.id,date,start,end))warnings.push(`${person.display_name}: no se ha podido cubrir su cadencia obligatoria del ${date} (${start.slice(0,5)}–${end.slice(0,5)}). Revisa consultas compatibles, ausencias o solapamientos.`)
 }
 for(const person of staff.filter(p=>p.active&&p.role==='professional')){
  const profile=profiles.find(p=>p.staff_id===person.id)
  if(!profile?.work_cadences?.length)continue
  for(let d=parseISO(from);format(d,'yyyy-MM-dd')<=until;d=addDays(d,1)){
   const date=format(d,'yyyy-MM-dd')
   if(onlyDate&&date!==onlyDate)continue
   for(const cadence of cadenceIntervals(profile,date)){
    if(cadenceBlocked(person.id,date,cadence.start_time,cadence.end_time))continue
    addCadenceShift(person,profile,date,cadence.start_time,cadence.end_time)
   }
  }
 }
 function fill(s:Slot,date:string,target:number){
  while(coverage(s,date)<target){const candidate=available(s,date)[0];if(!candidate)break
   const preferred=s.r.preferred_staff_ids??(s.c.preferred_staff_id?[s.c.preferred_staff_id]:[]);const secondary=s.r.secondary_staff_ids??s.c.secondary_staff_ids??[];const referenceException=!preferred.includes(candidate.person.id)&&!secondary.includes(candidate.person.id);const substitution=substitutionAllowed(s,date,candidate.person.id)&&!cadenceAllows(candidate.profile,date,s.r.start_time,s.r.end_time);const reason=substitution?'Sustitución automática por ausencia/formación del profesional habitual':preferred.includes(candidate.person.id)?'Profesional habitual de esta regla':secondary.includes(candidate.person.id)?'Alternativa de esta regla':'Cobertura excepcional: no hay habitual/alternativa disponible';const row:SuggestedShift={id:`suggest-${proposed.length}`,professional_id:candidate.person.id,work_date:date,consultation_id:s.c.id,start_time:s.r.start_time,end_time:s.r.end_time,provisional:true,is_extra:false,override_reason:null,notes:null,suggestion_reason:reason,reference_exception:referenceException}
   proposed.push(row);working.push(row)
  }
 }
 proposed.sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.start_time.localeCompare(b.start_time)||a.consultation_id.localeCompare(b.consultation_id)||a.professional_id.localeCompare(b.professional_id))
 return {proposed,warnings,issues:buildCoverageIssues(working,consultations,requests,onlyDate??from,onlyDate??until,exceptions,planning.holidays)}
}
