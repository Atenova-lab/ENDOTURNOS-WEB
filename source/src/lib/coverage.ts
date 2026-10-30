import { isAbsence, workingIntervals } from './absences'
import { addDays, differenceInCalendarWeeks, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns'
import { getPlanning } from './planningConfig'
import type { Assignment, Consultation, CoverageRule, ShiftRequest, CoverageException } from '../types'
import { defaultCoverageRules, hasAbsence, overlaps } from './scheduling'

export interface CoverageIssue {
  id: string; date: string; consultationId: string; title: string; detail: string
  severity: 'warning' | 'critical'; startTime: string; endTime: string
  kind: 'shortage' | 'suspended'; ruleId: string; ruleSnapshot: CoverageRule; exceptionRule?: CoverageRule
}
const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const isOpen = (date: string, rule: CoverageRule) => date >= rule.valid_from && date <= rule.valid_until && !rule.suspensions.some(s => date >= s.from && date <= s.to)
export const requiredForAlert = (rule: CoverageRule) => rule.fallback_min_staff !== undefined && Number.isInteger(rule.fallback_min_staff) && rule.fallback_min_staff >= 0 && rule.fallback_min_staff < rule.min_staff ? rule.fallback_min_staff : rule.min_staff
export function minimumCoverage(rows: Assignment[], start: string, end: string): number {
  const points = [...new Set([start, end, ...rows.flatMap(a => [a.start_time.slice(0,5), a.end_time.slice(0,5)])])].filter(p => p >= start && p <= end).sort()
  return Math.min(...points.slice(0,-1).map((p,i) => new Set(rows.filter(a => a.start_time.slice(0,5) <= p && a.end_time.slice(0,5) >= points[i+1]).map(a => a.professional_id)).size))
}
export function buildCoverageIssues(assignments: Assignment[], consultations: Consultation[], requests: ShiftRequest[] = [], from = getPlanning().start_date, until = getPlanning().end_date, exceptions: CoverageException[] = [], holidays = getPlanning().holidays): CoverageIssue[] {
  const issues: CoverageIssue[] = []
  for (const c of consultations.filter(c => c.active && !isAbsence(c.id))) {
    for (const rule of c.coverage_rules ?? defaultCoverageRules(c.id)) {
      const ids = [c.id, ...(rule.alternatives ?? [])]
      const minimum = requiredForAlert(rule)
      const candidates: string[] = []
      for (let d = parseISO(from); iso(d) <= until; d = addDays(d,1)) {
        const date = iso(d)
        if (holidays[date] || !rule.weekdays.includes(getDay(d)) || !isOpen(date,rule)) continue
        const week = differenceInCalendarWeeks(d, parseISO(rule.anchor_date), {weekStartsOn:1})
        if (!rule.monthly && ((week % rule.every_weeks) + rule.every_weeks) % rule.every_weeks !== 0) continue
        candidates.push(date)
      }
      const coverage = (date: string) => minimumCoverage(workingIntervals(assignments).filter(a => ids.includes(a.consultation_id) && a.work_date === date && !hasAbsence(a.professional_id,date,requests)), rule.start_time, rule.end_time)
      const report = (date: string, count: number, monthly = false) => {
        const plantOne = c.id === 'PLANTA' && count === 1
        const exceptionRule = plantOne && rule.min_staff===2 && !rule.monthly && !rule.alternatives?.length ? rule : undefined
        if(exceptionRule && exceptions.some(e=>!e.revoked_at&&e.work_date===date&&e.consultation_id===c.id&&e.rule_id===rule.id&&sameCoverageRule(e.rule_snapshot,rule)))return
        const label = rule.alternatives?.length ? [c.short_label,...rule.alternatives.map(id => consultations.find(c => c.id === id)?.short_label ?? id)].join('/') : c.label
        const reducedNote = minimum < rule.min_staff ? ` · Objetivo ${rule.min_staff}; mínimo permitido ${minimum}` : ''
        issues.push({ id:`${date}-${rule.id}`,date,consultationId:c.id,ruleId:rule.id,ruleSnapshot:rule,exceptionRule,startTime:rule.start_time,endTime:rule.end_time,kind:'shortage',severity:count===0?'critical':'warning',title:plantOne?'Planta con una sola enfermera':monthly?`${label} mensual sin cobertura suficiente`:count===0?`${label} sin cubrir`:`${label}: cobertura insuficiente`,detail:`${count}/${minimum} profesionales mínimos · ${rule.start_time}–${rule.end_time}${monthly?' · Una sesión al mes':''}${reducedNote}${plantOne?'. Siempre que sea posible debe haber dos enfermeras.':''}`})
      }
      if (rule.monthly) {
        for(let d=startOfMonth(parseISO(from)); iso(d)<=until; d=addDays(endOfMonth(d),1)) {
          const dates=candidates.filter(date=>date.startsWith(format(d,'yyyy-MM')))
          if(dates.length && !dates.some(date=>coverage(date)>=minimum)) report(dates[0],Math.max(...dates.map(coverage)),true)
        }
      } else candidates.forEach(date=>{const count=coverage(date);if(count<minimum)report(date,count)})
      for(const a of assignments) if (a.consultation_id===c.id && a.work_date>=from && a.work_date<=until && rule.suspensions.some(s=>a.work_date>=s.from&&a.work_date<=s.to) && overlaps(a.start_time,a.end_time,rule.start_time,rule.end_time)) {
        if(issues.some(i=>i.id===`${a.id}-suspended`))continue
        issues.push({id:`${a.id}-suspended`,date:a.work_date,consultationId:c.id,ruleId:rule.id,ruleSnapshot:rule,startTime:a.start_time.slice(0,5),endTime:a.end_time.slice(0,5),kind:'suspended',severity:'warning',title:`Turno en periodo suspendido: ${c.label}`,detail:`${a.start_time.slice(0,5)}–${a.end_time.slice(0,5)} · Revisa o elimina esta asignación.`,})
      }
    }
  }
  return issues.sort((a,b)=> (a.severity===b.severity?0:a.severity==='critical'?-1:1)||a.date.localeCompare(b.date)||a.title.localeCompare(b.title))
}

function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}'
 return JSON.stringify(value)
}
export const sameCoverageRule=(a:CoverageRule,b:CoverageRule)=>canonical(a)===canonical(b)
