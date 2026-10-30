import {addDays,differenceInCalendarWeeks,getDay,parseISO,startOfWeek,format} from 'date-fns'
import type {CoverageProfile,WorkCadence} from '../types'

export function cadenceMatches(r:WorkCadence,date:string){
 return date>=r.valid_from&&date<=r.valid_until&&r.weekdays.includes(getDay(parseISO(date)))&&r.every_weeks>0&&differenceInCalendarWeeks(parseISO(date),parseISO(r.anchor_date),{weekStartsOn:1})%r.every_weeks===0
}
export function restsOn(profile:CoverageProfile|undefined,date:string,start:string,end:string){
 return !!profile?.work_cadences?.some(r=>r.kind==='rest'&&cadenceMatches(r,date)&&r.start_time.slice(0,5)<end.slice(0,5)&&r.end_time.slice(0,5)>start.slice(0,5))
}
// Subtract rests from each working window. Legacy rules without kind mean work.
export function cadenceIntervals(profile:CoverageProfile|undefined,date:string){
 const active=profile?.work_cadences?.filter(r=>cadenceMatches(r,date))??[]
 let intervals=[...new Map(active.filter(r=>r.kind!=='rest').map(r=>[`${r.start_time.slice(0,5)}-${r.end_time.slice(0,5)}`,{start_time:r.start_time.slice(0,5),end_time:r.end_time.slice(0,5)}])).values()]
 for(const r of active.filter(r=>r.kind==='rest')){
  const start=r.start_time.slice(0,5),end=r.end_time.slice(0,5)
  intervals=intervals.flatMap(p=>end<=p.start_time||start>=p.end_time?[p]:[
   ...(start>p.start_time?[{start_time:p.start_time,end_time:start}]:[]),
   ...(end<p.end_time?[{start_time:end,end_time:p.end_time}]:[])
  ])
 }
 return intervals
}

// A day without work is a scheduled rest when the professional has an active
// work cadence elsewhere in the same week. Explicit rest rules also count.
export function isScheduledRestDay(profile:CoverageProfile|undefined,date:string){
 if(!profile?.work_cadences?.length)return false
 if(restsOn(profile,date,'00:00','23:59'))return true
 const weekday=getDay(parseISO(date))
 if(weekday===0||weekday===6||cadenceIntervals(profile,date).length)return false
 const monday=startOfWeek(parseISO(date),{weekStartsOn:1})
 return Array.from({length:7},(_,i)=>format(addDays(monday,i),'yyyy-MM-dd'))
  .some(day=>cadenceIntervals(profile,day).length>0)
}
