// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import CalendarPanel from './CalendarPanel'
import App from '../App'
import type { Staff } from '../types'
vi.mock('../lib/supabase',()=>({supabase:null,isSupabaseConfigured:false}))
let root:Root;let host:HTMLDivElement
async function render(component:React.ReactNode){(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));window.scrollTo=vi.fn();Element.prototype.scrollIntoView=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(component))}
const button=(name:string)=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===name||b.getAttribute('aria-label')===name);if(!b)throw Error(name);return b}
const click=async(name:string)=>{await act(async()=>button(name).click())}
async function date(value:string){await act(async()=>{const el=host.querySelector<HTMLInputElement>('[aria-label="Día de la agenda"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))})}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('defaults to agenda on mobile, crosses months and keeps the selected day between views',async()=>{
 const person:Staff={id:'p',user_id:'u',display_name:'Profesional de prueba',username:'test',role:'professional',mascot_key:'apple',active:true,weekly_minutes:2100};const select=vi.fn()
 await render(<CalendarPanel staff={[person]} assignments={[{id:'a',professional_id:'p',consultation_id:'EN1',work_date:'2026-11-01',start_time:'08:00',end_time:'15:00',provisional:false}]} consultations={[{id:'EN1',label:'Endocrinología 1',short_label:'EN1',color:'#307050',active:true}]} profile={person} isSupervisor={false} issues={[]} focusDate="2026-10-31" onSelect={select} requests={[]} coverageProfiles={[]} syncedAt={new Date()} onCopy={vi.fn()} onRequest={vi.fn()}/>)
 expect(host.querySelector('.agenda-view')).not.toBeNull();expect(host.querySelector('.month-matrix')).toBeNull()
 await click('Día siguiente');expect(host.querySelector<HTMLInputElement>('[aria-label="Día de la agenda"]')!.value).toBe('2026-11-01');expect(host.querySelector<HTMLInputElement>('[aria-label="Elegir mes"]')!.value).toBe('2026-11')
 await act(async()=>host.querySelector<HTMLButtonElement>('.agenda-shift')!.click());expect(select).toHaveBeenCalledWith({date:'2026-11-01',personId:'p',consultationId:'EN1'})
 expect(host.querySelector('.agenda-person header button')).toBeNull();expect(host.querySelector('.quick-undo')).toBeNull()
 await click('Mes');expect(host.querySelectorAll('.day-head')).toHaveLength(30);await click('Agenda');expect(host.querySelector<HTMLInputElement>('[aria-label="Día de la agenda"]')!.value).toBe('2026-11-01')
 await date('2026-12-31');await click('Día siguiente');expect(host.querySelector<HTMLInputElement>('[aria-label="Día de la agenda"]')!.value).toBe('2027-01-01');await date('2026-10-01');await click('Día anterior');expect(host.querySelector<HTMLInputElement>('[aria-label="Día de la agenda"]')!.value).toBe('2026-09-30')
})
it('opens the profile and agenda from mobile navigation and closes the secondary menu',async()=>{
 await render(<App/>);await click('Ver demostración interactiva')
 const nav=host.querySelector('.mobile-bottom-nav')!
 await act(async()=>[...nav.querySelectorAll('button')].find(b=>b.textContent==='Mi ficha')!.click());expect(host.textContent).toContain('Mi ficha personal');expect(nav.querySelector('[aria-current="page"]')!.textContent).toBe('Mi ficha')
 await act(async()=>[...nav.querySelectorAll('button')].find(b=>b.textContent==='Cuadrante')!.click());expect(host.querySelector('.agenda-view')).not.toBeNull()
 await click('Abrir menú');expect(host.querySelector('.sidebar.open')).not.toBeNull();await click('Cerrar menú');expect(host.querySelector('.sidebar.open')).toBeNull()
})
