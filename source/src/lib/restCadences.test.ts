import {describe,it,expect} from 'vitest'
import {cadenceIntervals,restsOn,isScheduledRestInterval} from './cadences'
import {cadenceAllows,cadenceWeekCapacity,suggestMonth, type SuggestionContext} from './suggestions'
import {DEFAULT_PLANNING} from './planningConfig'
import type {CoverageProfile,WorkCadence} from '../types'
const work:WorkCadence={id:'work',weekdays:[1,2,3,4,5],start_time:'08:00',end_time:'15:00',every_weeks:1,anchor_date:'2026-10-07',valid_from:'2026-10-01',valid_until:'9999-12-31'}
const rest:WorkCadence={...work,id:'rest',kind:'rest',weekdays:[3],start_time:'00:00',end_time:'23:59',every_weeks:4}
const profile:CoverageProfile={staff_id:'monica',consultation_ids:['X'],work_cadences:[work,rest]}
describe('recurring rest',()=>{
 it('blocks one Wednesday in four across month and year boundaries',()=>{
  for(const date of ['2026-10-07','2026-11-04','2026-12-02','2026-12-30','2027-01-27'])expect(cadenceAllows(profile,date,'08:00','15:00')).toBe(false)
  for(const date of ['2026-10-14','2026-10-21','2026-10-28','2026-10-08'])expect(cadenceAllows(profile,date,'08:00','15:00')).toBe(true)
  expect(cadenceWeekCapacity(profile,'2026-10-07')).toBe(1680)
  expect(cadenceWeekCapacity(profile,'2026-10-14')).toBe(2100)
 })
 it('subtracts only the rest interval and respects validity',()=>{
  const p={...profile,work_cadences:[work,{...rest,start_time:'10:00',end_time:'12:00',valid_until:'2026-10-31'}]}
  expect(cadenceIntervals(p,'2026-10-07')).toEqual([{start_time:'08:00',end_time:'10:00'},{start_time:'12:00',end_time:'15:00'}])
  expect(restsOn(p,'2026-10-07','12:00','15:00')).toBe(false)
  expect(cadenceAllows(p,'2026-11-04','08:00','15:00')).toBe(true)
  expect(cadenceIntervals({...p,work_cadences:[rest]},'2026-10-07')).toEqual([])
 })
 it('shades free afternoon bands even when the morning is worked',()=>{
  expect(isScheduledRestInterval(profile,'2026-11-05','08:00','15:00')).toBe(false)
  expect(isScheduledRestInterval(profile,'2026-11-05','15:00','20:00')).toBe(true)
  const afternoon={...profile,work_cadences:[{...work,start_time:'15:00',end_time:'20:00'}]}
  expect(isScheduledRestInterval(afternoon,'2026-11-05','08:00','15:00')).toBe(true)
  expect(isScheduledRestInterval(afternoon,'2026-11-05','15:00','20:00')).toBe(false)
  expect(isScheduledRestInterval(profile,'2026-11-07','15:00','20:00')).toBe(false)
 })
 it('does not assign rest as mandatory work or use a resting substitute; preserves existing shifts with a warning',()=>{
  const ctx:SuggestionContext={fingerprint:'test',planning:DEFAULT_PLANNING,staff:['monica','daniela'].map(id=>({id,user_id:null,display_name:id,username:id,role:'professional',active:true,weekly_minutes:2100,mascot_key:'apple'})),consultations:[{id:'X',label:'X',short_label:'X',color:'#123',active:true,coverage_rules:[{...work,weekdays:[3],min_staff:1,monthly:false,suspensions:[],preferred_staff_ids:['daniela'],secondary_staff_ids:['monica']}]}],profiles:[profile,{...profile,staff_id:'daniela',work_cadences:[work]}],assignments:[{id:'for',professional_id:'daniela',work_date:'2026-10-07',consultation_id:'FOR',start_time:'08:00',end_time:'20:00',provisional:false}],requests:[],exceptions:[]}
  const out=suggestMonth('2026-10',ctx)
  expect(out.proposed.filter(a=>a.professional_id==='monica'&&a.work_date==='2026-10-07')).toEqual([])
  expect(out.warnings.some(w=>w.includes('monica')&&w.includes('2026-10-07'))).toBe(false)
  expect(out.proposed.some(a=>a.professional_id==='monica'&&a.work_date==='2026-10-14')).toBe(true)
  ctx.assignments.push({id:'existing',professional_id:'monica',work_date:'2026-10-07',consultation_id:'X',start_time:'08:00',end_time:'15:00',provisional:false})
  expect(suggestMonth('2026-10',ctx).warnings.join()).toContain('coincide con un descanso recurrente')
  expect(ctx.assignments).toHaveLength(2)
 })
})
