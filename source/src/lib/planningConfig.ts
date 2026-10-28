import { useSyncExternalStore } from 'react'
import { addMonths, endOfMonth, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { HOLIDAYS } from '../data/constants'
import type { CalendarAppearance } from './calendarAppearance'
export interface PlanningConfig {id:number;start_date:string;end_date:string;holidays:Record<string,string>;calendar_appearance?:CalendarAppearance;updated_at:string}
export const DEFAULT_PLANNING:PlanningConfig={id:1,start_date:'2026-01-01',end_date:'2026-12-31',holidays:HOLIDAYS,updated_at:''}
let current:PlanningConfig=DEFAULT_PLANNING
const listeners=new Set<()=>void>()
export const getPlanning=()=>current
export function setPlanning(config:PlanningConfig){current=config;listeners.forEach(fn=>fn())}
export const usePlanning=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},getPlanning)
export const clampDate=(date:string,config=getPlanning())=>date<config.start_date?config.start_date:date>config.end_date?config.end_date:date
export const periodLabel=(config=getPlanning())=>format(parseISO(config.start_date),'MMMM yyyy',{locale:es})+' – '+format(parseISO(config.end_date),'MMMM yyyy',{locale:es})
export function planningMonths(config=getPlanning()){const months:string[]=[];for(let d=parseISO(config.start_date);format(d,'yyyy-MM-dd')<=config.end_date;d=addMonths(d,1))months.push(format(d,'yyyy-MM'));return months}
export function monthRange(first:string,last:string){return {start_date:first+'-01',end_date:format(endOfMonth(parseISO(last+'-01')),'yyyy-MM-dd')}}
export function validatePlanning(config:PlanningConfig){
 if(!/^\d{4}-\d{2}-01$/.test(config.start_date)||!/^\d{4}-\d{2}-\d{2}$/.test(config.end_date)||config.end_date<config.start_date||config.end_date>=format(addMonths(parseISO(config.start_date),24),'yyyy-MM-dd'))return 'Selecciona un periodo de entre 1 y 24 meses.'
 return null
}
