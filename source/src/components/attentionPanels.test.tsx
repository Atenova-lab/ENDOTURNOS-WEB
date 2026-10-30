// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
import {NotificationsPanel,CoverageIssuesPanel} from './AttentionPanels'
import type {CoverageIssue} from '../lib/coverage'
let root:Root;let host:HTMLDivElement
async function render(node:React.ReactNode){(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(node))}
async function click(text:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>button!.click())}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove()})
it('separates unread broadcasts and request responses and opens the exact request',async()=>{
 const onRequest=vi.fn(),onBroadcasts=vi.fn()
 const requests=[{id:'r1',professional_id:'p',request_type:'vacation' as const,date_from:'2026-10-05',date_to:'2026-10-06',details:'',status:'approved' as const,created_at:'2026-10-01T08:00:00Z'}]
 await render(<NotificationsPanel broadcasts={[{id:'b',title:'Aviso de prueba',message:'',created_by:'s',created_at:'2026-10-01T08:00:00Z',et_broadcast_recipients:[]}]} requests={requests} onRequest={onRequest} onBroadcasts={onBroadcasts}/> )
 expect([...host.querySelectorAll('.personal-count')].map(e=>e.textContent)).toEqual(['1','1'])
 expect(host.textContent).toContain('Vacaciones · Aprobada')
 await act(async()=>host.querySelector<HTMLButtonElement>('.personal-request-list button')!.click());expect(onRequest).toHaveBeenCalledWith('r1')
 await click('Leer avisos');expect(onBroadcasts).toHaveBeenCalledOnce()
 expect(requests[0].status).toBe('approved')
})
it('filters incidents and opens coverage or suspended-shift review with the matching date and consultation',async()=>{
 const issue:CoverageIssue={id:'a',date:'2026-10-05',consultationId:'EN1',title:'EN1 sin cubrir',detail:'0/1',severity:'critical',startTime:'08:00',endTime:'15:00',kind:'shortage',ruleId:'r',ruleSnapshot:{} as CoverageIssue['ruleSnapshot']}
 const suspended:CoverageIssue={...issue,id:'b',date:'2026-11-05',severity:'warning',title:'Turno suspendido',kind:'suspended'}
 const onAssign=vi.fn(),onCalendar=vi.fn()
 await render(<CoverageIssuesPanel issues={[issue,suspended]} onAssign={onAssign} onCalendar={onCalendar}/> )
 await click('Buscar cobertura');expect(onAssign).toHaveBeenCalledWith({date:issue.date,consultationId:'EN1',startTime:'08:00',endTime:'15:00',findCoverage:true})
 await act(async()=>{const select=host.querySelector('select')!;select.value='2026-11';select.dispatchEvent(new Event('change',{bubbles:true}))})
 expect(host.querySelectorAll('.priority-item')).toHaveLength(1)
 await click('Revisar turno');expect(onAssign).toHaveBeenLastCalledWith({date:suspended.date,consultationId:'EN1',startTime:'08:00',endTime:'15:00',findCoverage:false})
 await click('Ver día');expect(onCalendar).toHaveBeenCalledWith(suspended.date)
 await act(async()=>{const select=host.querySelectorAll('select')[1];select.value='critical';select.dispatchEvent(new Event('change',{bubbles:true}))})
 expect(host.textContent).toContain('No hay incidencias con estos filtros')
})
