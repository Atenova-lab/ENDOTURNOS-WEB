// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import UndoLastChange from './UndoLastChange'
import type { Assignment, AssignmentHistory } from '../types'

let host: HTMLDivElement
let root: Root
const row: Assignment = { id: 'a', professional_id: 'p', consultation_id: 'EN1', work_date: '2026-10-02', start_time: '08:00', end_time: '15:00', provisional: false }
const change = (id: string, before: Assignment | null, after: Assignment | null): AssignmentHistory => ({ id, assignment_id: (after ?? before)!.id, before_data: before, after_data: after, action: !before ? 'INSERT' : !after ? 'DELETE' : 'UPDATE', actor_name: 'Supervisora', changed_at: '2026-10-28T10:00:00Z' })
const onUndo = vi.fn().mockResolvedValue(null)
const props = { month: '2026-10', history: [change('h1', null, row)], assignments: [row], staff: [], consultations: [], requests: [], lockedMonths: [], onUndo }
const button = () => host.querySelector('button')!
async function render(overrides: Partial<React.ComponentProps<typeof UndoLastChange>> = {}) {
  await act(async () => root.render(<UndoLastChange {...props} {...overrides}/>))
}
async function click() { await act(async () => button().click()) }
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  onUndo.mockReset().mockResolvedValue(null)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

it.each([
  ['alta', null, row],
  ['edición', row, { ...row, consultation_id: 'HDD' }],
  ['borrado', row, null],
] as const)('restores the last %s in the selected month and confirms the result', async (_, before, after) => {
  const selected = change('selected', before, after)
  await render({ history: [change('other-month', null, { ...row, id: 'b', work_date: '2026-11-02' }), selected] })
  await click()
  expect(onUndo).toHaveBeenCalledWith(selected, null)
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Antes:'))
  expect(host.textContent).toContain('Último cambio deshecho')
})

it('does not undo the restoration itself and enables a subsequent edit', async () => {
  await render(); await click()
  const restoration = change('restore', row, null)
  await render({ history: [restoration, ...props.history], assignments: [] })
  expect(button().disabled).toBe(true)
  await click(); expect(onUndo).toHaveBeenCalledTimes(1)
  await render({ history: [change('new-edit', null, row), restoration, ...props.history] })
  expect(button().disabled).toBe(false)
})

it('handles a restoration received before the callback completes', async () => {
  let finish!: (error: string | null) => void
  onUndo.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await render(); await click()
  await render({ history: [change('restore', row, null), ...props.history], assignments: [] })
  await act(async () => finish(null))
  expect(button().disabled).toBe(true)
  await render({ history: [change('new', null, row), change('restore', row, null), ...props.history] })
  expect(button().disabled).toBe(false)
})

it('disables empty months, closed months and changes superseded in another month', async () => {
  await render({ history: [] }); expect(button().disabled).toBe(true)
  const moved = { ...row, work_date: '2026-11-02' }
  await render({ history: [change('move', row, moved)], lockedMonths: [{ month: '2026-11-01', locked_at: '', locked_by: 'u' }] })
  expect(button().disabled).toBe(true)
  await render({ history: [change('later', moved, { ...moved, notes: 'Nuevo' }), change('move', row, moved)] })
  expect(button().disabled).toBe(true)
  expect(onUndo).not.toHaveBeenCalled()
})

it('requires a reason for conflicts, respects cancellation and preserves errors for retry', async () => {
  const deleted = change('deleted', row, null)
  const overlapping = { ...row, id: 'overlap', consultation_id: 'HDD' }
  vi.spyOn(window, 'prompt').mockReturnValue('no')
  await render({ history: [deleted], assignments: [overlapping] }); await click()
  expect(onUndo).not.toHaveBeenCalled()
  vi.mocked(window.prompt).mockReturnValue('Cobertura excepcional revisada')
  vi.mocked(window.confirm).mockReturnValue(false); await click(); expect(onUndo).not.toHaveBeenCalled()
  vi.mocked(window.confirm).mockReturnValue(true)
  onUndo.mockResolvedValue('Hay cambios posteriores en este turno.'); await click()
  expect(onUndo).toHaveBeenCalledWith(deleted, 'Cobertura excepcional revisada')
  expect(host.textContent).toContain('Hay cambios posteriores')
  expect(button().disabled).toBe(false)
})

it('blocks repeated taps while saving and recovers from a network failure', async () => {
  let fail!: (reason: Error) => void
  onUndo.mockImplementation(() => new Promise((_, reject) => { fail = reject }))
  await render(); await click(); await click()
  expect(onUndo).toHaveBeenCalledTimes(1)
  expect(button().disabled).toBe(true)
  await act(async () => fail(new Error('offline')))
  expect(button().disabled).toBe(false)
  expect(host.textContent).toContain('No se ha podido confirmar')
})
