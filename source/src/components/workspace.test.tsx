// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../App'
vi.mock('../lib/supabase',()=>({supabase:null,isSupabaseConfigured:false}))
let root:Root
let host:HTMLDivElement
const button=(text:string)=>{const b=[...host.querySelectorAll('button')].find(e=>e.textContent?.trim()===text);if(!b)throw Error(`Button not found: ${text}`);return b}
const click=async(text:string)=>{await act(async()=>button(text).click())}
const choose=async(el:HTMLSelectElement,value:string)=>{await act(async()=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))})}
const change=async(el:HTMLInputElement|HTMLTextAreaElement,value:string)=>{await act(async()=>{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))})}
const label=(text:string)=>{const l=[...host.querySelectorAll('label')].find(e=>e.firstChild?.textContent?.trim()===text);if(!l)throw Error(`Label not found ${text}`);return l.querySelector('input,textarea,select')!}
async function enter(){(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;window.scrollTo=vi.fn();Element.prototype.scrollIntoView=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<App/>));await click('Ver demostración interactiva')}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();vi.restoreAllMocks()})
describe('workspace interactions',()=>{
 it('opens supervisor home, full calendar, tasks with focus, and history',async()=>{await enter();expect(host.textContent).toContain('Mi equipo hoy');await click('Ver mes completo');expect(host.querySelectorAll('.day-head')).toHaveLength(31);await click('Añadir tarea');expect(document.activeElement).toBe(host.querySelector('.task-composer input'));await click('Historial');expect(host.textContent).toContain('Historial del cuadrante');await click('Equipo');expect(host.querySelectorAll('.person-card').length).toBeGreaterThan(0);expect(host.querySelector('.consultation-manager')).toBeNull();await click('Consultas');expect(host.querySelectorAll('.consultation-cards article')).toHaveLength(12);expect(host.querySelector('.team-grid')).toBeNull();await click('Configuración');expect(host.querySelectorAll('.settings-holidays li')).toHaveLength(7);await click('Gestionar consultas');expect(host.querySelector('.consultation-manager')).not.toBeNull();await click('Configuración');await click('Abrir mi ficha');expect(host.textContent).toContain('Mi ficha personal')})
 it('edits consultation coverage without changing existing shifts',async()=>{await enter();await click('Consultas');await click('Editar');await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.textContent).toContain('Selecciona un profesional preferente.');await choose(label('Profesional preferente (obligatorio)') as HTMLSelectElement,'demo-0001');await act(async()=>{host.querySelectorAll<HTMLInputElement>('.secondary-picker input')[0].click()});await act(async()=>{host.querySelectorAll<HTMLInputElement>('.secondary-picker input')[1].click()});expect(host.querySelectorAll('.secondary-picker input:checked')).toHaveLength(2);await change(label('Nombre') as HTMLInputElement,'Planta revisada');await change(label('Profesionales necesarios') as HTMLInputElement,'3');await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('[role="dialog"]')).toBeNull();expect(host.textContent).toContain('Planta revisada');await click('Inicio');expect(host.textContent).toContain('Planta revisada: cobertura insuficiente')})
 it('requires a reviewed exception for conflicting shifts and records undo',async()=>{await enter();await click('Asignar turno');await choose(label('Profesional') as HTMLSelectElement,'demo-0001');await choose(label('Turno o ausencia') as HTMLSelectElement,'HDD');const conflict=host.querySelector('.conflict-box');expect(conflict).not.toBeNull();expect(button('Añadir turno').disabled).toBe(true);await change(label('Motivo de la excepción') as HTMLTextAreaElement,'Cobertura revisada y excepcional');await act(async()=>host.querySelector<HTMLInputElement>('.conflict-box .checkbox-label input')!.click());expect(button('Añadir turno').disabled).toBe(false);await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.textContent).toContain('Asignación guardada.');await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Cerrar panel"]')!.click());await click('Historial');expect(host.textContent).toContain('Turno añadido');vi.spyOn(window,'confirm').mockReturnValue(true);await click('Deshacer cambio');expect(host.textContent).toContain('Cambio deshecho.')})
 it('undoes a saved shift directly from the monthly rota',async()=>{
  await enter();await click('Cuadrante');expect(button('Deshacer último cambio').disabled).toBe(true)
  await click('Asignar turno');await choose(label('Profesional') as HTMLSelectElement,'demo-0001')
  await choose(label('Turno o ausencia') as HTMLSelectElement,'HDD')
  if(host.querySelector('.conflict-box')){await change(label('Motivo de la excepción') as HTMLTextAreaElement,'Cobertura revisada y excepcional');await act(async()=>host.querySelector<HTMLInputElement>('.conflict-box .checkbox-label input')!.click())}
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Cerrar panel"]')!.click())
  expect(button('Deshacer último cambio').disabled).toBe(false)
  vi.spyOn(window,'confirm').mockReturnValue(true);await click('Deshacer último cambio')
  expect(host.textContent).toContain('Último cambio deshecho')
  expect(button('Deshacer último cambio').disabled).toBe(true)
  await click('Historial');expect(host.textContent).toContain('Turno eliminado')
 })
 it('separates supervisor sent requests from the inbox',async()=>{await enter();await click('Solicitudes');await click('Nueva solicitud');await change(label('Detalle') as HTMLTextAreaElement,'Solicitud de prueba a una profesional');await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.textContent).toContain('Enviadas (1)');expect(host.querySelectorAll('.request-card')).toHaveLength(1);expect(host.querySelector('.request-route')?.textContent).toContain('Para:');await click('Recibidas (0)');expect(host.querySelectorAll('.request-card')).toHaveLength(0)})
 it('saves and reorders a professional coverage profile from the team card',async()=>{await enter();await click('Equipo');await click('Ver ficha personal');await choose(label('Añadir consulta') as HTMLSelectElement,'EN1');await click('Añadir');await choose(label('Añadir consulta') as HTMLSelectElement,'NUTRICION');await click('Añadir');await choose(label('Añadir consulta') as HTMLSelectElement,'PLANTA');await click('Añadir');await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Subir PLANTA"]')!.click());await click('Añadir franja de disponibilidad');await click('Guardar consultas y cadencias');expect(host.textContent).toContain('Franja 1');expect([...host.querySelectorAll('.preference-list li strong')].map(e=>e.textContent)).toEqual(['EN1','Planta','Nutrición']);expect(host.textContent).toContain('Consultas y cadencias guardadas.')})
 it('opens the absence calendar and copy preview from the rota',async()=>{await enter();await click('Cuadrante');await click('Ver ausencias');expect(host.querySelectorAll('.absence-day')).toHaveLength(30);await click('Volver al cuadrante');await change(host.querySelector<HTMLInputElement>('[aria-label="Elegir mes"]')!,'2026-10');await click('Copiar semana o selección');expect(host.querySelector('[aria-label="Copiar turnos"]')).not.toBeNull();expect(host.textContent).toContain('bloqueados');expect(host.textContent).toContain('confirma la cadencia')})

 it('keeps coverage counts out of notifications and routes each header action separately',async()=>{
  await enter()
  const notifications=host.querySelector<HTMLButtonElement>('.attention-button.messages')!
  const coverage=host.querySelector<HTMLButtonElement>('.attention-button.coverage')!
  expect(notifications.getAttribute('aria-label')).toBe('Notificaciones: 0 sin leer')
  expect(notifications.querySelector('b')).toBeNull()
  expect(Number(coverage.querySelector('b')!.textContent)).toBeGreaterThan(0)
  await act(async()=>notifications.click());expect(host.querySelector('.notifications-page')).not.toBeNull();expect(host.querySelector('.coverage-issues-page')).toBeNull();expect(host.textContent).toContain('No tienes notificaciones sin leer')
  await act(async()=>coverage.click());expect(host.querySelector('.coverage-issues-page')).not.toBeNull();expect(host.querySelector('.notifications-page')).toBeNull()
  await click('Buscar cobertura');expect(host.querySelector('[aria-label="Cerrar panel"]')).not.toBeNull()
 })

 it('resolves a Planta warning with a reason and can restore it from the exception register',async()=>{
  await enter();await act(async()=>host.querySelector<HTMLButtonElement>('.attention-button.coverage')!.click())
  const before=Number(host.querySelector('.attention-button.coverage b')!.textContent)
  await choose(label('Tipo de incidencia') as HTMLSelectElement,'warning')
  await click('Añadir excepción')
  expect(button('Guardar excepción y resolver').disabled).toBe(true)
  await change(label('Motivo de la excepción') as HTMLTextAreaElement,'No hay otra enfermera disponible para esta franja')
  await act(async()=>host.querySelector('[aria-labelledby="exception-title"] form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  expect(host.querySelector('[aria-labelledby="exception-title"]')).toBeNull()
  expect(Number(host.querySelector('.attention-button.coverage b')!.textContent)).toBe(before-1)
  expect(host.querySelector('.exception-register')!.textContent).toContain('No hay otra enfermera disponible')
  vi.spyOn(window,'confirm').mockReturnValue(true);await click('Retirar excepción')
  expect(Number(host.querySelector('.attention-button.coverage b')!.textContent)).toBe(before)
  expect(host.querySelector('.exception-register')!.textContent).toContain('Retirada')
 })

 it('extends the period into the next year, persists a holiday and opens its month',async()=>{
  await enter();await click('Configuración')
  await change(label('Último mes') as HTMLInputElement,'2027-02')
  await change(label('Fecha del festivo') as HTMLInputElement,'2027-01-06')
  await change(label('Nombre del festivo') as HTMLInputElement,'Festivo de prueba')
  await click('Añadir festivo');await act(async()=>host.querySelector('form.planning-settings')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  expect(host.textContent).toContain('Periodo y festivos guardados')
  await click('Cuadrante');const month=host.querySelector<HTMLInputElement>('[aria-label="Elegir mes"]')!;expect(month.max).toBe('')
  await change(month,'2027-01');expect(host.querySelectorAll('.day-head')).toHaveLength(31);expect(host.textContent).toContain('Sin reglas vigentes este mes')
  expect(host.querySelector('.day-head[title*="Festivo de prueba"]')).not.toBeNull()
  await click('Configuración');expect((label('Último mes') as HTMLInputElement).value).toBe('2027-02');expect(host.textContent).toContain('Festivo de prueba')
 })

})
