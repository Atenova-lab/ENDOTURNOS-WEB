import PasswordRecovery, { RECOVERY_KEY, recoveryPending, clearRecovery } from './components/PasswordRecovery'
import { isAbsence } from './lib/absences'
import { getPlanning, usePlanning, setPlanning, DEFAULT_PLANNING, type PlanningConfig } from './lib/planningConfig'
import { EVENT_IDS, eventBackground, normalizeCalendarAppearance } from './lib/calendarAppearance'
import PlanningSettings from './components/PlanningSettings'
import CalendarAppearanceSettings from './components/CalendarAppearanceSettings'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { addDays, addMonths, endOfMonth, format, getDay, isSameDay, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Settings, Stethoscope, Home, History, AlertTriangle, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, CircleUserRound, ClipboardList, Clock3, FolderOpen, LogOut, Megaphone, Menu, Pencil, Plus, RefreshCw, Sparkles, Trash2, Users, Volume2, X } from 'lucide-react'
import { CONSULTATIONS, DEMO_STAFF, MASCOTS } from './data/constants'
import { buildDemoSchedule } from './data/demoSchedule'
import { buildCoverageIssues, sameCoverageRule, type CoverageIssue } from './lib/coverage'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { disablePush, enablePush, getPushSubscription, pushAvailable } from './lib/push'
import type { CoverageException, CoverageReview, RotaPublication, LockedMonth, CoverageProfile, AssignmentHistory, Assignment, Consultation, MascotKey, PersonalTask, RequestStatus, RequestType, ShiftRequest, Staff, StaffCategory, TeamBroadcast, ScheduledBroadcast } from './types'

import ConsultationManager from './components/ConsultationManager'
import SupervisorHome from './components/SupervisorHome'
import ProfessionalHome from './components/ProfessionalHome'
import { NotificationsPanel, CoverageIssuesPanel } from './components/AttentionPanels'
import { ExceptionDialog } from './components/CoverageExceptions'
import type { PublicationPreview } from './components/PublicationPanel'
import ShiftEditor, { type AssignmentDraft, type ShiftSelection } from './components/ShiftEditor'
import CalendarPanel from './components/CalendarPanel'
import RequestsPanel from './components/RequestsPanel'
import HistoryPanel from './components/HistoryPanel'
import CoveragePreferences from './components/CoveragePreferences'
import FoldersView from './components/FoldersView'
import type { CopyPreviewRow } from './lib/planning'

type View = 'home' | 'history' | 'calendar' | 'broadcasts' | 'requests' | 'tasks' | 'folders' | 'team' | 'consultations' | 'settings' | 'notifications' | 'incidents' | 'profile'
const todayIso = format(new Date(), 'yyyy-MM-dd')
const REQUEST_LABELS: Record<RequestType, string> = {
  vacation: 'Vacaciones', permission: 'Permiso', swap: 'Cambio con una compañera',
  preference: 'Día u horario preferente', correction: 'Corrección de una asignación',
}
const PERMANENT_DELETE_PROMPT = '¿seguro que quieres eliminar esto permanentemente?'

async function playBell() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return false
  const context = new AudioContextClass()
  try {
    if (context.state === 'suspended') await context.resume()
    if (context.state !== 'running') { await context.close(); return false }
    const start = context.currentTime
    ;[[659.25, 0], [880, 0.13]].forEach(([frequency, delay]) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start + delay)
      gain.gain.exponentialRampToValueAtTime(0.12, start + delay + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.24)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start + delay)
      oscillator.stop(start + delay + 0.25)
    })
    window.setTimeout(() => { void context.close() }, 550)
    return true
  } catch {
    await context.close().catch(() => undefined)
    return false
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [demo, setDemo] = useState(false)
  const [recovering,setRecovering]=useState(recoveryPending)
  const [recoveryError,setRecoveryError]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).has('error_code'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if(event==='PASSWORD_RECOVERY'&&next){sessionStorage.setItem(RECOVERY_KEY,next.user.id);setRecoveryError(false);setRecovering(true)}
      if(event==='SIGNED_OUT'){sessionStorage.removeItem(RECOVERY_KEY)}
    })
    supabase.auth.getSession().then(({data,error})=>{setSession(data.session);if(error)setRecoveryError(true);setLoading(false)}).catch(()=>{setRecoveryError(true);setLoading(false)})
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) return <Splash />
  if (recovering) return <PasswordRecovery valid={Boolean(session)&&!recoveryError} onClose={()=>{clearRecovery();setRecovering(false);setRecoveryError(false)}}/>
  if (!session && !demo) return <AuthScreen onDemo={() => setDemo(true)} />
  return <Workspace session={session} demo={demo} onExitDemo={() => setDemo(false)} />
}

function Splash() {
  return <main className="center-page"><div className="splash-mark"><img src={`${import.meta.env.BASE_URL}mascots/apple.png`} alt="" /><span>EndoTurnos</span></div></main>
}

function AuthScreen({ onDemo }: { onDemo: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [mascot, setMascot] = useState<MascotKey>('apple')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage(''); setBusy(true)
    if (!supabase) { setMessage('La conexión segura todavía no está configurada. Puedes abrir la demostración.'); setBusy(false); return }
    try {
      if(mode==='reset'){
        const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}${import.meta.env.BASE_URL}`})
        setMessage(error ? error.status===429 ? 'Espera unos minutos antes de pedir otro enlace.' : 'No se ha podido enviar el enlace. Inténtalo de nuevo en unos minutos.' : 'Si ese correo tiene una cuenta, recibirás un enlace para cambiar tu contraseña. Revisa también la carpeta de spam.')
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email:email.trim(), password })
        if (error) setMessage('No hemos podido iniciar sesión. Revisa el correo y la contraseña.')
      } else {
        const { error } = await supabase.auth.signUp({
          email:email.trim(), password,
          options:{emailRedirectTo:`${window.location.origin}${import.meta.env.BASE_URL}`,data:{full_name:name,username,mascot_key:mascot}},
        })
        setMessage(error ? error.message : 'Registro enviado. Revisa tu correo si se solicita confirmación.')
      }
    }catch{setMessage('No se ha podido conectar. Comprueba tu conexión e inténtalo de nuevo.')}
    finally{setBusy(false)}
  }

  return <main className="auth-page">
    <section className="auth-story">
      <div className="brand-pill"><Sparkles size={16} /> EndoTurnos</div>
      <h1>El cuadrante,<br /><em>sin enredos.</em></h1>
      <p>Turnos, solicitudes y tareas del equipo de Endonutrición, siempre al día.</p>
      <div className="mascot-cluster">{MASCOTS.map((m, i) => <img key={m.key} src={m.src} alt={m.name} style={{ '--i': i } as React.CSSProperties} />)}</div>
    </section>
    <section className="auth-card">
      <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} disabled={busy} onClick={() => {setMode('login');setMessage('');setPassword('')}}>Entrar</button><button className={mode === 'signup' ? 'active' : ''} disabled={busy} onClick={() => {setMode('signup');setMessage('');setPassword('')}}>Registrarme</button></div>
      <div className="auth-heading"><h2>{mode==='reset'?'Recuperar contraseña':mode === 'login' ? '¡Hola de nuevo!' : 'Crea tu espacio'}</h2><p>{mode==='reset'?'Introduce el correo con el que registraste tu propia cuenta. Te enviaremos un enlace para elegir una contraseña nueva.':mode === 'login' ? 'Accede con tu correo y contraseña.' : 'Elige también quién te dará la bienvenida.'}</p></div>
      <form onSubmit={submit}>
        {mode === 'signup' && <><label>Nombre completo<input required value={name} onChange={e => setName(e.target.value)} placeholder="Nombre Apellidos" /></label><label>Nombre de usuario<input required value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} placeholder="usuario" /></label></>}
        <label>Usuario (correo)<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@hospital.es" /></label>
        {mode!=='reset'&&<label>Contraseña<input required minLength={8} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" /></label>}
        {mode === 'signup' && <MascotPicker value={mascot} onChange={setMascot} compact />}
        {message && <p className="form-message" role="status">{message}</p>}
        <button className="primary wide" disabled={busy}>{busy ? <RefreshCw className="spin" size={18} /> : mode==='reset'?'Enviar enlace de recuperación':mode === 'login' ? 'Entrar en EndoTurnos' : 'Crear mi cuenta'}</button>
      </form>
      {mode==='login'&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setMode('reset');setMessage('');setPassword('')}}>¿Has olvidado tu contraseña?</button>}
      {mode==='reset'&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setMode('login');setMessage('')}}>Volver al acceso</button>}
      {!isSupabaseConfigured && <button className="text-button" onClick={onDemo}>Ver demostración interactiva</button>}
    </section>
  </main>
}

function Workspace({ session, demo, onExitDemo }: { session: Session | null; demo: boolean; onExitDemo: () => void }) {
  const planning=usePlanning()
  useEffect(()=>{
    const appearance=normalizeCalendarAppearance(planning.calendar_appearance)
    EVENT_IDS.forEach(id=>document.documentElement.style.setProperty(`--absence-bg-${id.toLowerCase()}`,eventBackground(appearance[id])))
    return ()=>EVENT_IDS.forEach(id=>document.documentElement.style.removeProperty(`--absence-bg-${id.toLowerCase()}`))
  },[planning.calendar_appearance])
  const loadSequence=useRef(0)
  useEffect(()=>{if(demo)setPlanning(DEFAULT_PLANNING)},[demo])
  const [currentDay,setCurrentDay]=useState(()=>format(new Date(),'yyyy-MM-dd'))
  useEffect(()=>{const refresh=()=>setCurrentDay(format(new Date(),'yyyy-MM-dd'));const timer=window.setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}},[])
  const [staff, setStaff] = useState<Staff[]>(demo ? DEMO_STAFF : [])
  const [consultations, setConsultations] = useState<Consultation[]>(demo ? CONSULTATIONS : [])
  const [assignments, setAssignments] = useState<Assignment[]>(demo ? buildDemoSchedule : [])
  const [publishedAssignments, setPublishedAssignments] = useState<Assignment[]>(demo ? buildDemoSchedule : [])
  const [publications, setPublications] = useState<RotaPublication[]>([])
  const [lockedMonths, setLockedMonths] = useState<LockedMonth[]>([])
  const [requests, setRequests] = useState<ShiftRequest[]>([])
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [broadcasts, setBroadcasts] = useState<TeamBroadcast[]>([])
  const [scheduledBroadcasts, setScheduledBroadcasts] = useState<ScheduledBroadcast[]>([])
  const [view, setView] = useState<View>(() => { const params=new URLSearchParams(window.location.search); return params.has('carpeta')?'folders':params.has('avisos')?'broadcasts':'home' })
  const navigate = useCallback((next: View) => {
    setView(next)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(null)
  const [coverageExceptions,setCoverageExceptions]=useState<CoverageException[]>([])
  const [coverageReviews,setCoverageReviews]=useState<CoverageReview[]>([])
  const [exceptionIssue,setExceptionIssue]=useState<CoverageIssue|null>(null)
  const [coverageProfiles, setCoverageProfiles] = useState<CoverageProfile[]>([])
  const [history, setHistory] = useState<AssignmentHistory[]>([])
  const [shiftSelection, setShiftSelection] = useState<ShiftSelection | null>(null)
  const [requestFocus, setRequestFocus] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [taskComposerNonce, setTaskComposerNonce] = useState(0)
  const [mobileNav, setMobileNav] = useState(false)
  const [syncedAt, setSyncedAt] = useState<Date>(new Date())
  const [dataLoaded, setDataLoaded] = useState(demo)
  const [profile, setProfile] = useState<Staff | null>(demo ? { ...DEMO_STAFF[0], role: 'supervisor', user_id: 'demo' } : null)
  const previousUnread = useRef<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    if (!supabase || demo || !session) return
    const sequence=++loadSequence.current
    const s = await supabase.from('et_staff').select('*').order('display_name')
    if(s.error){setLoadError('No se han podido cargar los datos. Pulsa Reintentar.');return}
    if(!s.data?.some(p=>p.user_id===session.user.id)){setProfile(null);setDataLoaded(true);return}
    const configResult=await supabase.from('et_planning_settings').select('*').eq('id',1).single()
    if(configResult.error||!configResult.data){setLoadError('No se ha podido cargar el periodo de planificación. Pulsa Reintentar.');return}
    const storedConfig=configResult.data as PlanningConfig
    const config=storedConfig.start_date==='2026-10-01'&&storedConfig.end_date==='2026-12-31'?{...storedConfig,start_date:'2026-01-01',end_date:'2026-12-31'}:storedConfig
    const readAssignments=async(table:string)=>{const rows:Assignment[]=[];for(let offset=0;;offset+=500){const result=await supabase!.from(table).select('*').order('id').range(offset,offset+499);if(result.error)return {data:null,error:result.error};rows.push(...result.data as Assignment[]);if(result.data.length<500)return {data:rows,error:null}}}
    const supervisor = s.data?.find(p => p.user_id === session.user.id)?.role === 'supervisor'
    const [c, a, r, t, b, h, cp, pub, published, exceptions, reviews, scheduled, locks] = await Promise.all([
      supabase.from('et_consultations').select('*').eq('active', true).order('sort_order'),
      readAssignments(supervisor ? 'et_assignments' : 'et_published_assignments'),
      supabase.from('et_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('et_tasks').select('*').order('task_date'),
      supabase.from('et_broadcasts').select('id,title,message,created_by,created_at,et_broadcast_recipients(staff_id,read_at)').order('created_at', { ascending: false }),
      supabase.from('et_assignment_history').select('*').order('changed_at', { ascending: false }).limit(100),
      supabase.from('et_staff_coverage').select('*'),
      supabase.from('et_rota_publications').select('*'),
      readAssignments('et_published_assignments'),
      supervisor ? supabase.from('et_coverage_exceptions').select('*').order('created_at',{ascending:false}) : Promise.resolve({data:[],error:null}),
      supervisor ? supabase.from('et_coverage_reviews').select('*').order('reviewed_at',{ascending:false}) : Promise.resolve({data:[],error:null}),
      supervisor ? supabase.from('et_scheduled_broadcasts').select('*').order('next_run_at') : Promise.resolve({data:[],error:null}),
      supabase.from('et_locked_months').select('*'),
    ])
    if(sequence!==loadSequence.current)return
    const failed = [s,c,a,r,t,b,h,cp,pub,published,exceptions,reviews,scheduled,locks].find(result => result.error)
    if (failed?.error) { setLoadError('No se han podido actualizar todos los datos. Pulsa Reintentar.'); return }
    setLoadError('')
    setPlanning(config)
    setCoverageExceptions((exceptions.data??[]) as CoverageException[])
    setCoverageReviews((reviews.data??[]) as CoverageReview[])
    setScheduledBroadcasts((scheduled.data??[]) as ScheduledBroadcast[])
    setPublications((pub.data??[]) as RotaPublication[])
    setLockedMonths((locks.data??[]) as LockedMonth[])
    setPublishedAssignments((published.data??[]) as Assignment[])
    if (cp.data) setCoverageProfiles(cp.data as CoverageProfile[])
    if (h.data) setHistory(h.data as AssignmentHistory[])
    if (s.data) { setStaff(s.data as Staff[]); setProfile((s.data as Staff[]).find(p => p.user_id === session.user.id) ?? null) }
    if (c.data) setConsultations(c.data as Consultation[])
    if (a.data) setAssignments(a.data as Assignment[])
    if (r.data) setRequests(r.data as ShiftRequest[])
    if (t.data) setTasks(t.data as PersonalTask[])
    if (b.data) setBroadcasts(b.data as TeamBroadcast[])
    setSyncedAt(new Date())
    setDataLoaded(true)
  }, [demo, session])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    if (!supabase || demo || !session) return
    const client = supabase
    const channel = client.channel('endoturnos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_assignments' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_published_assignments' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_rota_publications' }, loadData)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'et_locked_months' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_coverage_exceptions' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_coverage_reviews' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_planning_settings' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_consultations' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_staff' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_staff_coverage' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_assignment_history' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_requests' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_tasks' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_broadcasts' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_broadcast_recipients' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_scheduled_broadcasts' }, loadData)
      .subscribe()
    return () => { client.removeChannel(channel) }
  }, [demo, loadData, session])

  const broadcastNotificationIds = useMemo(() => profile ? broadcasts.filter(b => b.et_broadcast_recipients.some(r => r.staff_id === profile.id && !r.read_at)).map(b => b.id) : [], [broadcasts, profile])
  const requestNotificationIds = useMemo(() => profile ? requests.filter(request => profile.role === 'supervisor'
    ? !request.supervisor_seen_at
    : request.professional_id === profile.id && !request.professional_seen_at).map(request => request.id) : [], [profile, requests])
  const notificationIds = useMemo(() => [...broadcastNotificationIds.map(id => `broadcast:${id}`), ...requestNotificationIds.map(id => `request:${id}`)], [broadcastNotificationIds, requestNotificationIds])
  const coverageIssues = useMemo(() => profile?.role === 'supervisor'
    ? buildCoverageIssues(assignments, consultations, requests, undefined, undefined, coverageExceptions).filter(issue=>!coverageReviews.some(review=>!review.reopened_at&&review.issue_id===issue.id&&sameCoverageRule(review.rule_snapshot,issue.ruleSnapshot)))
    : [], [assignments, consultations, coverageExceptions, coverageReviews, profile?.role, requests])
  useEffect(() => {
    if (!dataLoaded) return
    const current = new Set(notificationIds)
    const hasNew = notificationIds.some(id => !previousUnread.current.has(id))
    let cancelled = false
    let retry: (() => void) | undefined
    if (hasNew) {
      void playBell().then(played => {
        if (played || cancelled) return
        retry = () => { void playBell(); window.removeEventListener('pointerdown', retry!); window.removeEventListener('keydown', retry!) }
        window.addEventListener('pointerdown', retry, { once: true })
        window.addEventListener('keydown', retry, { once: true })
      })
    }
    previousUnread.current = current
    return () => { cancelled = true; if (retry) { window.removeEventListener('pointerdown', retry); window.removeEventListener('keydown', retry) } }
  }, [dataLoaded, notificationIds.join('|')])

  if (!dataLoaded) return loadError ? <main className="center-page"><section className="panel"><p>{loadError}</p><button className="primary" onClick={loadData}>Reintentar</button></section></main> : <Splash />
  if (!profile && !demo) return <PendingAccess onLogout={() => supabase?.auth.signOut()} />
  const activeProfile = profile!
  const isSupervisor = activeProfile.role === 'supervisor'
  const mascot = MASCOTS.find(m => m.key === activeProfile.mascot_key) ?? MASCOTS[0]
  const todayAssignments = assignments.filter(a => a.professional_id === activeProfile.id && a.work_date === todayIso)
  const unreadBroadcasts = broadcastNotificationIds.length
  const unreadRequests = requestNotificationIds.length
  const unreadTotal = unreadBroadcasts + unreadRequests
  const nav = [
    ['home', Home, 'Inicio'],
    ['calendar', CalendarDays, 'Cuadrante'], ['broadcasts', Megaphone, 'Avisos'], ['requests', Bell, 'Solicitudes'], ['tasks', ClipboardList, 'Mis tareas'], ['folders', FolderOpen, 'Mi carpeta'], ['profile', CircleUserRound, 'Mi ficha'],
    ...(isSupervisor ? [['team', Users, 'Equipo'], ['consultations', Stethoscope, 'Consultas'], ['settings', Settings, 'Configuración'], ['history', History, 'Historial']] : []),
  ] as Array<[View, typeof CalendarDays, string]>

  const addHistory = (before: Assignment | null, after: Assignment | null) => setHistory(rows => [{id:crypto.randomUUID(), assignment_id:(after??before)!.id,action:!before?'INSERT':!after?'DELETE':'UPDATE',actor_name:activeProfile.display_name,changed_at:new Date().toISOString(),before_data:before,after_data:after},...rows])
  const saveAssignment = async (next: AssignmentDraft|AssignmentDraft[]): Promise<string | null> => {
    const rows=Array.isArray(next)?next:[next]
    const blockedRow=rows.find(item=>lockedMonths.some(m=>m.month===item.work_date.slice(0,7)+'-01'))
    if(blockedRow)return `El mes ${blockedRow.work_date.slice(0,7)} está bloqueado permanentemente. La recurrencia no ha realizado cambios.`
    if (demo) {
      setAssignments(prev=>{
        let out=[...prev]
        for(const item of rows){const before=out.find(a=>a.id===item.id)??null;const row={...item,id:item.id??crypto.randomUUID(),updated_at:new Date().toISOString()} as Assignment;out=before?out.map(a=>a.id===row.id?row:a):[...out,row];addHistory(before,row)}
        return out
      })
      return null
    }
    for(const item of rows){
      const {error}=await supabase!.rpc('et_save_assignment',{p_data:item,p_id:item.id??null,p_expected_updated_at:item.updated_at??null})
      if(error){await loadData();return error.code==='23505'?'Ya existe una ausencia o turno para esta persona en alguno de los días seleccionados. Revisa el periodo.':error.message}
    }
    await loadData();return null
  }
  const removeAssignment = async (a: Assignment): Promise<string | null> => {
    if (demo) {setAssignments(prev=>prev.filter(row=>row.id!==a.id));addHistory(a,null);return null}
    const {error}=await supabase!.rpc('et_delete_assignment',{p_id:a.id,p_expected_updated_at:a.updated_at});if(error)return error.message;await loadData();return null
  }
  const clearMonthAssignments = async (month:string,preserveConsultationIds:string[]=[]): Promise<string | null> => {
    const keep=new Set(preserveConsultationIds)
    const rows=assignments.filter(a=>a.work_date.startsWith(month)&&!keep.has(a.consultation_id))
    if(!rows.length)return null
    if(demo){setAssignments(current=>current.filter(a=>!a.work_date.startsWith(month)||keep.has(a.consultation_id)));rows.forEach(a=>addHistory(a,null));return null}
    for(const row of rows){const {error}=await supabase!.rpc('et_delete_assignment',{p_id:row.id,p_expected_updated_at:row.updated_at});if(error){await loadData();return `No se ha podido borrar el mes: ${error.message}`}}
    await loadData();return null
  }
  const restoreMonthAssignments = async (rows:Assignment[]): Promise<string | null> => {
    if(!rows.length)return null
    if(demo){const restored=rows.map(({id:_,updated_at:__,...row})=>({...row,id:crypto.randomUUID(),updated_at:new Date().toISOString()} as Assignment));setAssignments(current=>[...current,...restored]);restored.forEach(a=>addHistory(null,a));return null}
    for(const original of rows){const {id:_,updated_at:__,...draft}=original;const {error}=await supabase!.rpc('et_save_assignment',{p_data:draft,p_id:null,p_expected_updated_at:null});if(error){await loadData();return `No se ha podido restaurar todo el mes: ${error.message}`}}
    await loadData();return null
  }
  const undoAssignment = async (h: AssignmentHistory, reason: string | null): Promise<string | null> => {
    if(demo){const current=assignments.find(a=>a.id===h.assignment_id)??null;const restored=h.before_data?{...h.before_data,override_reason:reason}:null;setAssignments(rows=>[...rows.filter(a=>a.id!==h.assignment_id),...(restored?[restored]:[])]);addHistory(current,restored);return null}
    const {error}=await supabase!.rpc('et_undo_assignment',{p_history_id:h.id,p_reason:reason});if(error)return error.message;await loadData();return null
  }
  const copyAssignments = async (rows: CopyPreviewRow[], reviewed: boolean): Promise<string | null> => {
    if(demo){const next=rows.map(r=>({...r.target,id:crypto.randomUUID(),updated_at:new Date().toISOString()}));setAssignments(items=>[...items,...next]);next.forEach(a=>addHistory(null,a));return null}
    const {error}=await supabase!.rpc('et_copy_assignments',{p_rows:rows.map(r=>({source_id:r.source.id,source_updated_at:r.source.updated_at,target_date:r.target.work_date,accept_review:reviewed}))});if(error)return error.message;await loadData();return null
  }
  const lockMonth = async (month:string):Promise<string|null> => {
    if(demo){
      setLockedMonths(rows=>[...rows,{month:month+'-01',locked_at:new Date().toISOString(),locked_by:'demo'}])
      return null
    }
    const {error}=await supabase!.from('et_locked_months').insert({month:month+'-01',locked_by:session!.user.id})
    if(error)return error.message
    await loadData()
    return null
  }
  const publishRota = async (month:string, preview:PublicationPreview):Promise<string|null> => {
    if(demo){setPublishedAssignments(rows=>[...rows.filter(a=>!a.work_date.startsWith(month)),...assignments.filter(a=>a.work_date.startsWith(month))]);setPublications(rows=>[...rows.filter(p=>p.month!==month+'-01'),{month:month+'-01',published_at:new Date().toISOString(),version:(rows.find(p=>p.month===month+'-01')?.version??0)+1,initial_snapshot:false}]);return null}
    const {error}=await supabase!.rpc('et_publish_rota',{p_month:month+'-01',p_fingerprint:preview.fingerprint})
    if(error)throw new Error(error.message)
    await loadData()
    return null
  }
  const saveCoverageException=async(issue:CoverageIssue,reason:string):Promise<string|null>=>{
    const current=buildCoverageIssues(assignments,consultations,requests).find(i=>i.id===issue.id)
    if(!issue.exceptionRule||!current?.exceptionRule||!sameCoverageRule(current.exceptionRule,issue.exceptionRule))return 'La cobertura ha cambiado. Cierra esta revisión y actualiza los datos.'
    const content={work_date:issue.date,consultation_id:issue.consultationId,rule_id:issue.ruleId,rule_snapshot:issue.exceptionRule,reason}
    if(demo){setCoverageExceptions(rows=>[{...content,id:crypto.randomUUID(),created_by:activeProfile.user_id??'demo',created_by_name:activeProfile.display_name,created_at:new Date().toISOString(),revoked_at:null},...rows]);return null}
    const {data,error}=await supabase!.from('et_coverage_exceptions').insert(content).select('*').single()
    if(error)return error.code==='23505'?'Ya hay una excepción para esta franja. Revísala en Cobertura → Excepciones de Planta.':error.message
    if(!data)return 'No se ha podido confirmar la excepción.'
    setCoverageExceptions(rows=>[data as CoverageException,...rows.filter(e=>e.id!==data.id)]);await loadData();return null
  }
  const revokeCoverageException=async(id:string):Promise<string|null>=>{
    if(demo){setCoverageExceptions(rows=>rows.map(e=>e.id===id?{...e,revoked_at:new Date().toISOString()}:e));return null}
    const {data,error}=await supabase!.from('et_coverage_exceptions').update({revoked_at:new Date().toISOString()}).eq('id',id).is('revoked_at',null).select('*')
    if(error)return error.message
    if(!data?.length){await loadData();return 'La excepción ya ha cambiado. Se han actualizado los datos.'}
    setCoverageExceptions(rows=>rows.map(e=>e.id===id?data[0] as CoverageException:e));await loadData();return null
  }
  const reviewCoverageIssue=async(issue:CoverageIssue):Promise<string|null>=>{
    const current=buildCoverageIssues(assignments,consultations,requests,undefined,undefined,coverageExceptions).find(i=>i.id===issue.id)
    if(!current||!sameCoverageRule(current.ruleSnapshot,issue.ruleSnapshot))return 'La incidencia ha cambiado. Actualiza el cuadrante antes de revisarla.'
    const content={issue_id:issue.id,work_date:issue.date,consultation_id:issue.consultationId,rule_id:issue.ruleId,rule_snapshot:issue.ruleSnapshot}
    if(demo){setCoverageReviews(rows=>[{...content,id:crypto.randomUUID(),created_by:activeProfile.user_id??'demo',created_by_name:activeProfile.display_name,reviewed_at:new Date().toISOString(),reopened_at:null},...rows]);return null}
    const {data,error}=await supabase!.from('et_coverage_reviews').insert(content).select('*').single()
    if(error)return error.code==='23505'?'La incidencia ya se había revisado. Actualiza los datos.':error.message
    if(!data)return 'No se ha podido guardar la revisión.'
    setCoverageReviews(rows=>[data as CoverageReview,...rows]);await loadData();return null
  }
  const reopenCoverageIssue=async(id:string):Promise<string|null>=>{
    if(demo){setCoverageReviews(rows=>rows.map(r=>r.id===id?{...r,reopened_at:new Date().toISOString()}:r));return null}
    const {data,error}=await supabase!.from('et_coverage_reviews').update({reopened_at:new Date().toISOString()}).eq('id',id).is('reopened_at',null).select('*')
    if(error)return error.message
    if(!data?.length){await loadData();return 'La revisión ya ha cambiado. Se han actualizado los datos.'}
    setCoverageReviews(rows=>rows.map(r=>r.id===id?data[0] as CoverageReview:r));await loadData();return null
  }
  const savePlanning=async(next:PlanningConfig):Promise<string|null>=>{
    if(demo){setPlanning({...next,updated_at:new Date().toISOString()});setCalendarFocusDate(null);setShiftSelection(null);return null}
    const {data,error}=await supabase!.from('et_planning_settings').update({start_date:next.start_date,end_date:next.end_date,holidays:next.holidays}).eq('id',1).eq('updated_at',next.updated_at).select('*')
    if(error)return error.message
    if(!data?.length)return 'La configuración ha cambiado en otra sesión. Pulsa Recargar configuración antes de guardar.'
    setCalendarFocusDate(null);setShiftSelection(null);setExceptionIssue(null);await loadData();return null
  }
  const mobileItems = nav.filter(([key])=>['home','calendar','broadcasts','requests','profile'].includes(key))
  const openCalendar = (date:string) => {setCalendarFocusDate(date);setView('calendar')}
  const openRequest = (id?:string) => {setRequestFocus(id??null);setView('requests')}

  return <div className="app-shell">
    <aside id="main-menu" className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><span className="brand-icon"><Clock3 /></span><div><strong>EndoTurnos</strong><small>Endonutrición</small></div></div>
      <nav aria-label="Menú principal">{nav.map(([key, Icon, label]) => <button key={key} aria-current={view===key?'page':undefined} className={view === key ? 'active' : ''} onClick={() => { navigate(key); setMobileNav(false) }}><Icon size={19} />{label}{key === 'broadcasts' && unreadBroadcasts > 0 && <b>{unreadBroadcasts}</b>}{key === 'requests' && unreadRequests > 0 && <b>{unreadRequests}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="mini-profile"><img src={mascot.src} alt="" /><div><strong>{activeProfile.display_name}</strong><small>{isSupervisor ? 'Supervisora' : 'Profesional'}</small></div></div><button className="icon-button" title="Cerrar sesión" onClick={() => demo ? onExitDemo() : supabase?.auth.signOut()}><LogOut size={18} /></button></div>
    </aside>
    {mobileNav&&<button className="mobile-menu-backdrop" aria-label="Cerrar menú" onClick={()=>setMobileNav(false)}/>}
    <main className={`main-content ${isSupervisor ? 'supervisor-workspace' : ''} view-${view} ${view==='calendar'?'calendar-screen':''}`}>
      {loadError && <div role="alert" className="form-message">{loadError}<button className="soft-button" onClick={loadData}>Reintentar</button></div>}
      <header className="topbar"><button aria-label="Abrir menú" aria-expanded={mobileNav} aria-controls="main-menu" className="menu-button" onClick={() => setMobileNav(v => !v)}><Menu /></button><div className="sync"><span></span>Actualizado al instante · {format(syncedAt, 'HH:mm')}</div><div className="top-actions"><button className="attention-button messages" aria-label={`Notificaciones: ${unreadTotal} sin leer`} aria-current={view==='notifications'?'page':undefined} onClick={()=>navigate('notifications')}><Bell size={19}/><span>Notificaciones</span>{unreadTotal>0&&<b>{unreadTotal}</b>}</button>{isSupervisor&&<button className="attention-button coverage" aria-label={`Cobertura: ${coverageIssues.length} incidencias`} aria-current={view==='incidents'?'page':undefined} onClick={()=>navigate('incidents')}><AlertTriangle size={19}/><span>Cobertura</span><b>{coverageIssues.length}</b></button>}<button className="avatar-button" title="Mi perfil" onClick={() => navigate('profile')}><img src={mascot.src} alt={mascot.name} /></button></div></header>
      {(isSupervisor||view!=='home')&&<Welcome profile={activeProfile} mascot={mascot} todayAssignments={todayAssignments} consultations={consultations} onAddTask={() => { setTaskComposerNonce(value => value + 1); setView('tasks') }} />}
      {isSupervisor && view !== 'home' && view !== 'incidents' && coverageIssues.length > 0 && <CoverageAlert issues={coverageIssues} onOpen={() => setView('incidents')} />}
      {unreadTotal > 0 && view!=='notifications' && (isSupervisor||view!=='home') && <div className="notification-strip" aria-label="Notificaciones nuevas">{unreadBroadcasts > 0 && view !== 'broadcasts' && <button className="unread-banner" onClick={() => setView('broadcasts')}><Megaphone size={18} /><span>{unreadBroadcasts === 1 ? '1 aviso nuevo' : `${unreadBroadcasts} avisos nuevos`}</span><strong>Ver avisos</strong></button>}{unreadRequests > 0 && view !== 'requests' && <button className="unread-banner request-alert" onClick={() => setView('requests')}><Bell size={18} /><span>{unreadRequests === 1 ? '1 novedad en solicitudes' : `${unreadRequests} novedades en solicitudes`}</span><strong>Ver solicitudes</strong></button>}</div>}
      {view === 'home' && <HomeTaskStrip tasks={tasks} profile={activeProfile} demo={demo} onChange={setTasks} reload={loadData} onOpenTasks={() => { setTaskComposerNonce(value => value + 1); setView('tasks') }} />}
      {view === 'home' && isSupervisor && <div className="publication-panel draft"><div><div><strong>Planificación en borrador</strong><p>Los cambios que guardes solo los verá el equipo cuando publiques el mes.</p></div></div><button className="soft-button" onClick={()=>openCalendar(calendarFocusDate??planning.start_date)}>Revisar publicación</button></div>}
      {view === 'home' && isSupervisor && <SupervisorHome onReview={reviewCoverageIssue} onException={setExceptionIssue} staff={staff} consultations={consultations} assignments={assignments} requests={requests} issues={coverageIssues} profile={activeProfile} onAssign={setShiftSelection} onCalendar={openCalendar} onRequest={openRequest} onBroadcast={()=>setView('broadcasts')} onTeam={()=>setView('team')} />}
      {view === 'home' && !isSupervisor && <ProfessionalHome profile={activeProfile} publishedAssignments={publishedAssignments} consultations={consultations} requests={requests} broadcasts={broadcasts} today={currentDay} onCalendar={openCalendar} onBroadcasts={()=>setView('broadcasts')} onRequest={openRequest}/> }
      {view === 'calendar' && <CalendarPanel onReview={reviewCoverageIssue} history={history} onUndo={undoAssignment} suggestionContext={{staff,consultations,assignments,requests,profiles:coverageProfiles,exceptions:coverageExceptions,planning,fingerprint:'demo'}} onSuggestionSaved={async rows=>{if(demo){const added=rows.map(a=>({...a,id:crypto.randomUUID(),updated_at:new Date().toISOString()}));setAssignments(current=>[...current,...added]);added.forEach(a=>addHistory(null,a))}else await loadData()}} onConsultations={()=>setView('consultations')} key={planning.start_date+planning.end_date} onException={setExceptionIssue} demo={demo} publications={publications} publishedAssignments={publishedAssignments} lockedMonths={lockedMonths} onLock={lockMonth} onPublish={publishRota} onClearMonth={clearMonthAssignments} onRestoreMonth={restoreMonthAssignments} staff={staff.filter(s=>s.active&&s.role==='professional')} assignments={assignments} consultations={consultations} profile={activeProfile} isSupervisor={isSupervisor} issues={coverageIssues} focusDate={calendarFocusDate} onSelect={setShiftSelection} requests={requests} coverageProfiles={coverageProfiles} syncedAt={syncedAt} onCopy={copyAssignments} onRequest={id=>openRequest(id)} />}
      {view === 'notifications' && <NotificationsPanel broadcasts={broadcasts.filter(b=>broadcastNotificationIds.includes(b.id))} requests={requests.filter(r=>requestNotificationIds.includes(r.id))} onBroadcasts={()=>setView('broadcasts')} onRequest={openRequest}/>}
      {view === 'incidents' && isSupervisor && <CoverageIssuesPanel onReview={reviewCoverageIssue} onReopen={reopenCoverageIssue} reviews={coverageReviews} onException={setExceptionIssue} exceptions={coverageExceptions} onRevoke={revokeCoverageException} issues={coverageIssues} onAssign={setShiftSelection} onCalendar={openCalendar}/>}
      {view === 'broadcasts' && <BroadcastsView broadcasts={broadcasts} scheduled={scheduledBroadcasts} staff={staff} profile={activeProfile} isSupervisor={isSupervisor} demo={demo} onChange={setBroadcasts} onScheduledChange={setScheduledBroadcasts} reload={loadData} />}
      {view === 'requests' && <RequestsPanel consultations={consultations} publishedAssignments={publishedAssignments} onCalendar={openCalendar} onReassign={assignment=>setShiftSelection({date:assignment.work_date,personId:assignment.professional_id,consultationId:assignment.consultation_id,startTime:assignment.start_time,endTime:assignment.end_time,assignmentId:assignment.id,findCoverage:true})} requests={requests} unreadIds={requestNotificationIds} staff={staff} profile={activeProfile} isSupervisor={isSupervisor} demo={demo} onChange={setRequests} reload={loadData} assignments={assignments} focusId={requestFocus} />}
      {view === 'history' && isSupervisor && <HistoryPanel history={history} staff={staff} consultations={consultations} assignments={assignments} requests={requests} onUndo={undoAssignment} />}
      {exceptionIssue && <ExceptionDialog issue={exceptionIssue} onClose={()=>setExceptionIssue(null)} onSave={reason=>saveCoverageException(exceptionIssue,reason)}/> }
      {shiftSelection && <ShiftEditor selection={shiftSelection} staff={staff} assignments={assignments} requests={requests} consultations={consultations} editable={isSupervisor&&!lockedMonths.some(m=>m.month===shiftSelection.date.slice(0,7)+'-01')} locked={lockedMonths.some(m=>m.month===shiftSelection.date.slice(0,7)+'-01')} coverageProfiles={coverageProfiles} onClose={()=>setShiftSelection(null)} onSave={saveAssignment} onRemove={removeAssignment} />}
      {view === 'tasks' && <TasksView tasks={tasks} profile={activeProfile} demo={demo} focusNonce={taskComposerNonce} onChange={setTasks} reload={loadData} />}
      {view === 'folders' && <FoldersView profile={activeProfile} staff={staff} demo={demo} />}
      {view === 'team' && isSupervisor && <TeamView coverageProfiles={coverageProfiles} onCoverageChange={setCoverageProfiles} staff={staff} consultations={consultations} demo={demo} onChange={setStaff} reload={loadData} />}
      {view === 'consultations' && isSupervisor && <section className="content-section"><div className="section-heading"><div><span className="eyebrow">Administración</span><h1>Consultas</h1><p>Gestiona horarios, profesionales necesarios y periodos de suspensión de cada consulta.</p></div></div><ConsultationManager staff={staff} consultations={consultations.filter(c=>!isAbsence(c.id))} demo={demo} onChange={setConsultations} reload={loadData} /></section>}
      {view === 'settings' && isSupervisor && <SettingsView demo={demo} onNavigate={setView} onSave={savePlanning} />}
      {view === 'profile' && <ProfileView coverageProfile={coverageProfiles.find(p=>p.staff_id===activeProfile.id)} onCoverageChange={setCoverageProfiles} consultations={consultations} profile={activeProfile} demo={demo} onUpdated={(key) => { setProfile(p => p ? { ...p, mascot_key: key } : p); setStaff(p => p.map(s => s.id === activeProfile.id ? { ...s, mascot_key: key } : s)) }} reload={loadData} />}
    </main>
    <nav className="mobile-bottom-nav" aria-label="Navegación principal móvil">{mobileItems.map(([key,Icon,label])=>{
      const active=view===key
      const count=key==='broadcasts'?unreadBroadcasts:key==='requests'?unreadRequests:0
      return <button key={key} className={active?'active':''} aria-current={active?'page':undefined} onClick={()=>{navigate(key);setMobileNav(false);if(key==='requests')setRequestFocus(null)}}><span><Icon size={21}/>{count>0&&<b aria-label={`${count} sin leer`}>{count>99?'99+':count}</b>}</span><small>{label}</small></button>
    })}</nav>
  </div>
}

function Welcome({ profile, mascot, todayAssignments, consultations, onAddTask }: { profile: Staff; mascot: (typeof MASCOTS)[number]; todayAssignments: Assignment[]; consultations: Consultation[]; onAddTask: () => void }) {
  const summary = todayAssignments.length ? todayAssignments.map(a => `${consultations.find(c => c.id === a.consultation_id)?.label ?? a.consultation_id} · ${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}`).join(' · ') : 'Hoy no tienes consulta asignada.'
  return <section className="welcome-card"><img src={mascot.src} alt={mascot.name} /><div><span>{mascot.greeting}</span><h2>Hola, {profile.display_name.split(' ')[0].toLocaleLowerCase('es').replace(/^./, s => s.toUpperCase())}</h2><p>{profile.role === 'supervisor' ? 'Tu equipo, sus turnos y lo pendiente de resolver.' : <><strong>Hoy:</strong> {summary}</>}</p></div><button className="soft-button" onClick={onAddTask}><Plus size={17} /> Añadir tarea</button></section>
}

function CoverageAlert({ issues, onOpen }: { issues: CoverageIssue[]; onOpen: (date: string) => void }) {
  const critical = issues.filter(issue => issue.severity === 'critical').length
  const first = issues[0]
  return <button className="coverage-banner" onClick={() => onOpen(first.date)}><span className="coverage-banner-icon"><AlertTriangle size={20} /></span><span><strong>{issues.length} {issues.length === 1 ? 'incidencia de cobertura' : 'incidencias de cobertura'}</strong><small>{critical ? `${critical} consultas sin cubrir. ` : ''}{first.title} · {format(parseISO(first.date), 'd MMM', { locale: es })}</small></span><b>Ver cobertura</b></button>
}

function BroadcastsView({ broadcasts, scheduled, staff, profile, isSupervisor, demo, onChange, onScheduledChange, reload }: { broadcasts: TeamBroadcast[]; scheduled: ScheduledBroadcast[]; staff: Staff[]; profile: Staff; isSupervisor: boolean; demo: boolean; onChange: React.Dispatch<React.SetStateAction<TeamBroadcast[]>>; onScheduledChange: React.Dispatch<React.SetStateAction<ScheduledBroadcast[]>>; reload: () => void }) {
  const professionals = staff.filter(person => person.role === 'professional' && person.active)
  const weekdays = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
  const [title, setTitle] = useState('Recordatorio')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(professionals.map(person => person.id)))
  const [feedback, setFeedback] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deliveryMode, setDeliveryMode] = useState<'now'|'scheduled'>('now')
  const [recurrence, setRecurrence] = useState<'once'|'weekly'>('once')
  const [scheduledDate, setScheduledDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [scheduledTime, setScheduledTime] = useState('08:00')
  const [weekday, setWeekday] = useState(getDay(new Date()))

  const toggleRecipient = (id: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const selectEveryone = () => setSelected(new Set(professionals.map(person => person.id)))
  const resetForm = () => {
    setEditingId(null); setTitle('Recordatorio'); setMessage(''); setSelected(new Set(professionals.map(person => person.id))); setDeliveryMode('now'); setRecurrence('once'); setScheduledDate(format(addDays(new Date(),1),'yyyy-MM-dd')); setScheduledTime('08:00'); setWeekday(getDay(new Date()))
  }
  const editBroadcast = (item: TeamBroadcast) => { setEditingId(item.id); setDeliveryMode('now'); setTitle(item.title); setMessage(item.message); setSelected(new Set(item.et_broadcast_recipients.map(recipient => recipient.staff_id))); setFeedback(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const nextWeeklyIso = (targetWeekday:number,time:string) => {
    const now=new Date(); const next=new Date(now); const parts=time.split(':').map(Number)
    next.setHours(parts[0]||0,parts[1]||0,0,0)
    const days=(targetWeekday-next.getDay()+7)%7
    next.setDate(next.getDate()+days)
    if(next<=now) next.setDate(next.getDate()+7)
    return next.toISOString()
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setFeedback('')
    let pushFailed = false
    const recipientIds = [...selected]
    if (!recipientIds.length) { setFeedback('Elige al menos a una persona.'); return }

    if (!editingId && deliveryMode === 'scheduled') {
      let scheduledFor: string | null = null
      if (recurrence === 'once') {
        const candidate = new Date(scheduledDate + 'T' + scheduledTime + ':00')
        if (Number.isNaN(candidate.getTime()) || candidate <= new Date()) { setFeedback('Elige una fecha y hora futuras.'); return }
        scheduledFor = candidate.toISOString()
      }
      if (demo) {
        const nextRun = recurrence === 'once' ? scheduledFor! : nextWeeklyIso(weekday, scheduledTime)
        const row: ScheduledBroadcast = { id:crypto.randomUUID(), title:title.trim()||'Recordatorio', message:message.trim(), recipient_ids:recipientIds, schedule_type:recurrence, scheduled_for:recurrence==='once'?scheduledFor:null, weekday:recurrence==='weekly'?weekday:null, local_time:recurrence==='weekly'?scheduledTime+':00':null, timezone:'Europe/Madrid', next_run_at:nextRun, active:true, created_by:profile.user_id??'demo', created_at:new Date().toISOString(), updated_at:new Date().toISOString(), last_sent_at:null }
        onScheduledChange(rows => [...rows,row].sort((a,b)=>a.next_run_at.localeCompare(b.next_run_at)))
      } else {
        const { error } = await supabase!.rpc('et_create_scheduled_broadcast', {
          p_title: title,
          p_message: message,
          p_recipient_ids: recipientIds,
          p_schedule_type: recurrence,
          p_scheduled_for: recurrence === 'once' ? scheduledFor : null,
          p_weekday: recurrence === 'weekly' ? weekday : null,
          p_local_time: recurrence === 'weekly' ? scheduledTime + ':00' : null,
        })
        if (error) { setFeedback(error.message || 'No se ha podido programar el aviso.'); return }
        await reload()
      }
      resetForm()
      setFeedback(recurrence === 'weekly' ? 'Aviso recurrente programado correctamente.' : 'Aviso programado correctamente.')
      return
    }

    if (demo) {
      if (editingId) onChange(current => current.map(item => item.id === editingId ? { ...item, title: title.trim(), message: message.trim(), et_broadcast_recipients: recipientIds.map(staff_id => ({ staff_id, read_at: null })) } : item))
      else { const next: TeamBroadcast = { id: crypto.randomUUID(), title: title.trim() || 'Recordatorio', message: message.trim(), created_by: profile.user_id ?? 'demo', created_at: new Date().toISOString(), et_broadcast_recipients: recipientIds.map(staff_id => ({ staff_id, read_at: null })) }; onChange(current => [next, ...current]) }
    } else {
      const { data: createdId, error } = editingId
        ? await supabase!.rpc('et_update_broadcast', { p_broadcast_id: editingId, p_title: title, p_message: message, p_recipient_ids: recipientIds })
        : await supabase!.rpc('et_create_broadcast', { p_title: title, p_message: message, p_recipient_ids: recipientIds })
      if (error) { setFeedback('No se ha podido enviar el aviso. Inténtalo de nuevo.'); return }
      if (!editingId && createdId) {
        const { data: pushResult, error: pushError } = await supabase!.functions.invoke('et-send-push', { body: { broadcastId: createdId } })
        if (pushError || pushResult?.error || pushResult?.failed) pushFailed = true
      }
      await reload()
    }
    resetForm()
    if (pushFailed) setFeedback('El aviso se ha guardado, pero no se han podido enviar las notificaciones push.')
  }
  const markRead = async (broadcastId: string) => {
    if (demo) onChange(current => current.map(item => item.id === broadcastId ? { ...item, et_broadcast_recipients: item.et_broadcast_recipients.map(recipient => recipient.staff_id === profile.id ? { ...recipient, read_at: new Date().toISOString() } : recipient) } : item))
    else { await supabase!.from('et_broadcast_recipients').update({ read_at: new Date().toISOString() }).eq('broadcast_id', broadcastId).eq('staff_id', profile.id); await reload() }
  }
  const removeBroadcast = async (broadcastId: string) => {
    if (!window.confirm(PERMANENT_DELETE_PROMPT)) return
    if (demo) onChange(current => current.filter(item => item.id !== broadcastId))
    else {
      const { error } = isSupervisor
        ? await supabase!.from('et_broadcasts').delete().eq('id', broadcastId)
        : await supabase!.from('et_broadcast_recipients').delete().eq('broadcast_id', broadcastId).eq('staff_id', profile.id)
      if (!error) await reload()
    }
    if (editingId === broadcastId) resetForm()
  }
  const removeScheduled = async (id:string) => {
    if (!window.confirm('¿Eliminar este aviso programado?')) return
    if (demo) onScheduledChange(rows=>rows.filter(item=>item.id!==id))
    else { const {error}=await supabase!.from('et_scheduled_broadcasts').delete().eq('id',id); if(error){setFeedback('No se ha podido eliminar el aviso programado.');return} await reload() }
  }
  const activeSchedules=scheduled.filter(item=>item.active)

  return <section className="content-section">
    <div className="section-heading"><div><span className="eyebrow">Comunicación del equipo</span><h1>Avisos y recordatorios</h1><p>Envía un aviso ahora o déjalo programado para una fecha concreta o de forma semanal.</p></div><button className="soft-button" onClick={playBell}><Volume2 size={17} /> Probar campanita</button></div>
    {isSupervisor && <form className={'panel broadcast-form '+(editingId ? 'editing' : '')} onSubmit={submit}>
      <div className="request-form-heading"><div><h2><Megaphone /> {editingId ? 'Editar aviso' : 'Nuevo aviso'}</h2><p>Selecciona a todo el equipo o sólo a las personas que deban recibirlo.</p></div>{editingId && <button type="button" className="text-button inline" onClick={resetForm}><X size={16} /> Cancelar</button>}</div>
      <div className="broadcast-fields"><label>Título<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Mensaje<textarea required minLength={3} maxLength={1200} value={message} onChange={event => setMessage(event.target.value)} placeholder="Escribe aquí el recordatorio…" /></label></div>
      <div className="recipient-heading"><strong>Destinatarios · {selected.size}</strong><button type="button" className="text-button inline" onClick={selectEveryone}>Todo el equipo</button></div>
      <div className="recipient-picker">{professionals.map(person => <label key={person.id} className={selected.has(person.id) ? 'selected' : ''}><input type="checkbox" checked={selected.has(person.id)} onChange={() => toggleRecipient(person.id)} /><img src={MASCOTS.find(mascot => mascot.key === person.mascot_key)?.src} alt="" /><span>{person.display_name}</span></label>)}</div>
      {!editingId && <div className="delivery-planner">
        <span className="field-label">¿Cuándo se envía?</span>
        <div className="delivery-choice"><button type="button" className={deliveryMode==='now'?'active':''} onClick={()=>setDeliveryMode('now')}><Megaphone size={16}/> Ahora</button><button type="button" className={deliveryMode==='scheduled'?'active':''} onClick={()=>setDeliveryMode('scheduled')}><CalendarDays size={16}/> Programar</button></div>
        {deliveryMode==='scheduled' && <div className="schedule-box">
          <div className="schedule-type-row"><label className={recurrence==='once'?'selected':''}><input type="radio" checked={recurrence==='once'} onChange={()=>setRecurrence('once')}/> Una sola vez</label><label className={recurrence==='weekly'?'selected':''}><input type="radio" checked={recurrence==='weekly'} onChange={()=>setRecurrence('weekly')}/> Repetir cada semana</label></div>
          <div className="schedule-grid">{recurrence==='once' ? <><label>Fecha<input type="date" min={todayIso} value={scheduledDate} onChange={e=>setScheduledDate(e.target.value)}/></label><label>Hora<input type="time" value={scheduledTime} onChange={e=>setScheduledTime(e.target.value)}/></label></> : <><label>Día de la semana<select value={weekday} onChange={e=>setWeekday(Number(e.target.value))}>{weekdays.map((day,index)=><option key={day} value={index}>{day.charAt(0).toUpperCase()+day.slice(1)}</option>)}</select></label><label>Hora<input type="time" value={scheduledTime} onChange={e=>setScheduledTime(e.target.value)}/></label></>}</div>
          <small>Se enviará automáticamente en horario peninsular (Europe/Madrid), aunque Guadalupe no tenga EndoTurnos abierto.</small>
        </div>}
      </div>}
      {feedback && <p className="form-message">{feedback}</p>}
      <button className="primary" disabled={!message.trim() || !selected.size}>{editingId ? <Pencil size={17} /> : deliveryMode==='scheduled' ? <CalendarDays size={17}/> : <Megaphone size={17} />} {editingId ? 'Guardar cambios' : deliveryMode==='scheduled' ? 'Programar aviso' : 'Enviar aviso'}</button>
    </form>}
    {isSupervisor && activeSchedules.length>0 && <section className="scheduled-broadcasts"><div className="scheduled-heading"><div><span className="eyebrow">Automáticos</span><h2>Avisos programados</h2></div><span>{activeSchedules.length} activos</span></div><div className="scheduled-grid">{activeSchedules.map(item=>{const recipients=item.recipient_ids.map(id=>staff.find(person=>person.id===id)?.display_name).filter(Boolean);return <article className="panel scheduled-card" key={item.id}><div className="scheduled-card-icon"><CalendarDays/></div><div><div className="scheduled-meta"><strong>{item.schedule_type==='weekly'?'Semanal':'Una vez'}</strong><span>Próximo: {format(parseISO(item.next_run_at),"EEE d MMM · HH:mm",{locale:es})}</span></div><h3>{item.title}</h3><p>{item.message}</p><small>{item.schedule_type==='weekly'?'Cada '+weekdays[item.weekday??0]+' a las '+(item.local_time??'').slice(0,5):'Fecha programada · '+format(parseISO(item.next_run_at),"d MMM yyyy · HH:mm",{locale:es})}</small><small>Para: {recipients.length===professionals.length?'todo el equipo':recipients.join(', ')}</small></div><button type="button" className="icon-action delete" title="Eliminar programación" onClick={()=>removeScheduled(item.id)}><Trash2 size={16}/></button></article>})}</div></section>}
    <div className="broadcast-list">{broadcasts.map(item => { const ownRecipient = item.et_broadcast_recipients.find(recipient => recipient.staff_id === profile.id); const unread = Boolean(ownRecipient && !ownRecipient.read_at); const recipients = item.et_broadcast_recipients.map(recipient => staff.find(person => person.id === recipient.staff_id)?.display_name).filter(Boolean); return <article className={'panel broadcast-card '+(unread ? 'unread' : '')} key={item.id}><div className="broadcast-icon"><Bell /></div><div><div className="broadcast-meta"><span>{unread ? 'Nuevo' : 'Aviso'}</span><time>{format(parseISO(item.created_at), "d MMM · HH:mm", { locale: es })}</time></div><h2>{item.title}</h2><p>{item.message}</p>{isSupervisor && <small>Para: {recipients.length === professionals.length ? 'todo el equipo' : recipients.join(', ')}</small>}</div><div className="card-actions">{unread && <button className="soft-button" onClick={() => markRead(item.id)}><Check size={16} /> Leído</button>}{isSupervisor && <button className="icon-action edit" title="Editar aviso" onClick={() => editBroadcast(item)}><Pencil size={16} /> Editar</button>}<button className="icon-action delete" title={isSupervisor ? 'Eliminar aviso para todos' : 'Eliminar aviso'} onClick={() => removeBroadcast(item.id)}><Trash2 size={16} /> Eliminar</button></div></article> })}{!broadcasts.length && <div className="empty-state panel"><Megaphone /><p>Todavía no hay avisos.</p></div>}</div>
  </section>
}

// Personal task styling is persisted so the same post-it appears on every device.
function taskFont(font: PersonalTask['font_family']) {
  return font === 'fraunces' ? "'Fraunces', serif" : font === 'caveat' ? "'Caveat', cursive" : font === 'dm-sans' ? "'DM Sans', sans-serif" : "'Nunito', sans-serif"
}

function taskStyle(task: PersonalTask): React.CSSProperties {
  return {
    fontFamily: taskFont(task.font_family ?? 'nunito'),
    fontWeight: task.is_bold ? 700 : 500,
    fontStyle: task.is_italic ? 'italic' : 'normal',
    textDecoration: task.is_underline ? 'underline' : 'none',
  }
}

function HomeTaskStrip({ tasks, profile, demo, onChange, reload, onOpenTasks }: { tasks: PersonalTask[]; profile: Staff; demo: boolean; onChange: React.Dispatch<React.SetStateAction<PersonalTask[]>>; reload: () => void; onOpenTasks: () => void }) {
  const own = tasks.filter(task => task.professional_id === profile.id).sort((a,b) => a.task_date.localeCompare(b.task_date))
  const pending = own.filter(task => !task.completed)
  const visible = (pending.length ? pending : own).slice(0, 6)
  const toggle = async (task: PersonalTask) => {
    if (demo) onChange(rows => rows.map(row => row.id === task.id ? { ...row, completed: !row.completed } : row))
    else { await supabase?.from('et_tasks').update({ completed: !task.completed }).eq('id', task.id); await reload() }
  }
  return <section className="home-task-strip" aria-label="Mis tareas">
    <div className="home-task-heading"><div><span className="eyebrow">Mis recordatorios</span><h2>Post-its de tareas</h2></div><button className="soft-button" onClick={onOpenTasks}><Plus size={16}/> Añadir tarea</button></div>
    {visible.length ? <div className="home-postits">{visible.map((task,index)=><article key={task.id} className={'mini-postit '+(task.note_color??'yellow')+(task.completed?' done':'')} style={{'--tilt':`${[-1.2,.7,-.5,1,-.8,.4][index%6]}deg`} as React.CSSProperties}>
      <span className="pushpin" aria-hidden="true"/>
      <div className="postit-topline"><input aria-label={'Completar '+task.title} type="checkbox" checked={task.completed} onChange={()=>toggle(task)}/><time>{format(parseISO(task.task_date),'d MMM',{locale:es})}</time></div>
      <strong style={taskStyle(task)}>{task.title}</strong>
      {task.details && <p style={taskStyle(task)}>{task.details}</p>}
    </article>)}</div> : <button className="empty-postit" onClick={onOpenTasks}><span className="pushpin" aria-hidden="true"/><Plus size={18}/><span>Añade tu primera tarea</span></button>}
  </section>
}

function TasksView({ tasks, profile, demo, focusNonce, onChange, reload }: { tasks: PersonalTask[]; profile: Staff; demo: boolean; focusNonce: number; onChange: React.Dispatch<React.SetStateAction<PersonalTask[]>>; reload: () => void }) {
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [date, setDate] = useState(todayIso)
  const [color, setColor] = useState<PersonalTask['note_color']>('yellow')
  const [fontFamily, setFontFamily] = useState<PersonalTask['font_family']>('nunito')
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)
  const [underline, setUnderline] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const taskInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focusNonce > 0) { taskInput.current?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }) } }, [focusNonce])
  const own = tasks.filter(t => t.professional_id === profile.id).sort((a,b) => a.task_date.localeCompare(b.task_date))
  const reset = () => { setTitle(''); setDetails(''); setDate(todayIso); setColor('yellow'); setFontFamily('nunito'); setBold(false); setItalic(false); setUnderline(false); setCompleted(false); setEditingId(null) }
  const payload = () => ({ task_date: date, title: title.trim(), details: details.trim(), note_color: color, font_family: fontFamily, is_bold: bold, is_italic: italic, is_underline: underline, completed })
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = payload()
    if (editingId) {
      if (demo) onChange(rows => rows.map(task => task.id === editingId ? { ...task, ...content } : task))
      else { await supabase?.from('et_tasks').update(content).eq('id', editingId); await reload() }
    } else {
      const row = { professional_id: profile.id, ...content }
      if (demo) onChange(rows => [...rows, { ...row, id: crypto.randomUUID() }])
      else { await supabase?.from('et_tasks').insert(row); await reload() }
    }
    reset()
  }
  const editTask = (task: PersonalTask) => {
    setEditingId(task.id); setTitle(task.title); setDetails(task.details??''); setDate(task.task_date); setColor(task.note_color??'yellow'); setFontFamily(task.font_family??'nunito'); setBold(Boolean(task.is_bold)); setItalic(Boolean(task.is_italic)); setUnderline(Boolean(task.is_underline)); setCompleted(task.completed); window.scrollTo({ top: 0, behavior: 'smooth' }); window.setTimeout(()=>taskInput.current?.focus(),250)
  }
  const removeTask = async (id: string) => { if (!window.confirm(PERMANENT_DELETE_PROMPT)) return; if (demo) onChange(rows => rows.filter(task => task.id !== id)); else { await supabase?.from('et_tasks').delete().eq('id', id); await reload() } if (editingId === id) reset() }
  const toggle = async (task: PersonalTask) => { if (demo) onChange(rows => rows.map(row => row.id === task.id ? { ...row, completed: !row.completed } : row)); else { await supabase?.from('et_tasks').update({ completed: !task.completed }).eq('id', task.id); await reload() } }
  const preview: PersonalTask = { id:'preview', professional_id:profile.id, task_date:date, title:title||'Así se verá tu tarea', details:details||'Puedes escribir varias líneas y párrafos.', completed, note_color:color, font_family:fontFamily, is_bold:bold, is_italic:italic, is_underline:underline }
  return <section className="content-section tasks-postit-page">
    <div className="section-heading"><div><span className="eyebrow">Tu recordatorio personal</span><h1>Mis tareas</h1><p>Crea post-its a tu gusto. Sólo tú puedes verlos, editarlos y eliminarlos.</p></div></div>
    <form className={'task-composer postit '+color+(editingId?' editing':'')} onSubmit={save}>
      <span className="pushpin large" aria-hidden="true"/>
      <div className="task-composer-head"><div><span className="eyebrow">{editingId?'Editando post-it':'Nuevo post-it'}</span><h2>{editingId?'Editar tarea':'Añadir tarea'}</h2></div>{editingId&&<button type="button" className="icon-action edit" title="Cancelar edición" onClick={reset}><X size={17}/></button>}</div>
      <label>Título<input ref={taskInput} required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Revisar analíticas"/></label>
      <label>Descripción<textarea maxLength={1500} value={details} onChange={e=>setDetails(e.target.value)} placeholder={'Escribe aquí todo lo que necesites…\n\nPuedes separar el texto en varios párrafos.'}/></label>
      <div className="task-format-row">
        <div><span className="field-label">Formato</span><div className="format-buttons"><button type="button" aria-pressed={bold} className={bold?'active':''} onClick={()=>setBold(v=>!v)}><b>B</b></button><button type="button" aria-pressed={italic} className={italic?'active':''} onClick={()=>setItalic(v=>!v)}><i>I</i></button><button type="button" aria-pressed={underline} className={underline?'active':''} onClick={()=>setUnderline(v=>!v)}><u>U</u></button></div></div>
        <label>Tipo de letra<select value={fontFamily} onChange={e=>setFontFamily(e.target.value as PersonalTask['font_family'])}><option value="nunito">Nunito</option><option value="dm-sans">DM Sans</option><option value="fraunces">Fraunces</option><option value="caveat">Manuscrita</option></select></label>
        <label>Fecha<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      </div>
      <div className="color-picker"><span className="field-label">Color del post-it</span><div>{(['yellow','rose','sage','blue','lavender','cream'] as PersonalTask['note_color'][]).map(name=><button key={name} type="button" aria-label={'Color '+name} aria-pressed={color===name} className={'color-swatch '+name+(color===name?' selected':'')} onClick={()=>setColor(name)}/>)}</div></div>
      <div className="composer-bottom"><label className="task-completed-check"><input type="checkbox" checked={completed} onChange={e=>setCompleted(e.target.checked)}/><span>Marcar como completada</span></label><div className={'task-preview mini-postit '+color+(completed?' done':'')}><span className="pushpin" aria-hidden="true"/><strong style={taskStyle(preview)}>{preview.title}</strong><p style={taskStyle(preview)}>{preview.details}</p></div></div>
      <button className="primary task-save"><Check size={17}/> {editingId?'Guardar cambios':'Guardar tarea'}</button>
    </form>
    <div className="task-board">{own.map((task,index)=><article className={'task-postit '+(task.note_color??'yellow')+(task.completed?' done':'')} style={{'--tilt':`${[-.7,.45,-.35,.65][index%4]}deg`} as React.CSSProperties} key={task.id}>
      <span className="pushpin" aria-hidden="true"/>
      <div className="postit-topline"><input aria-label={'Completar '+task.title} type="checkbox" checked={task.completed} onChange={()=>toggle(task)}/><time>{format(parseISO(task.task_date),"d MMM yyyy",{locale:es})}</time></div>
      <h3 style={taskStyle(task)}>{task.title}</h3>{task.details&&<p style={taskStyle(task)}>{task.details}</p>}
      <div className="postit-actions"><button className="icon-action edit" title="Editar tarea" onClick={()=>editTask(task)}><Pencil size={15}/></button><button className="icon-action delete" title="Eliminar tarea" onClick={()=>removeTask(task.id)}><Trash2 size={15}/></button></div>
    </article>)}{!own.length&&<div className="empty-state panel"><ClipboardList/><p>Añade tu primera tarea.</p></div>}</div>
  </section>
}

// Staff categories are persisted per profile for scoped team management.
function staffCategoryLabel(category?: StaffCategory) {
  return ({ nursing: 'Enfermería', tcae: 'TCAE', administrative: 'Administrativa', endocrinology: 'Endocrino' } as Record<StaffCategory, string>)[category ?? 'nursing']
}

function TeamView({ coverageProfiles, onCoverageChange, staff, consultations, demo, onChange, reload }: { coverageProfiles: CoverageProfile[]; onCoverageChange: React.Dispatch<React.SetStateAction<CoverageProfile[]>>; staff: Staff[]; consultations: Consultation[]; demo: boolean; onChange: React.Dispatch<React.SetStateAction<Staff[]>>; reload: () => void }) {
  const [selectedPerson, setSelectedPerson] = useState<Staff | null>(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Staff['role']>('professional')
  const [category, setCategory] = useState<StaffCategory>('nursing')
  const [mascot, setMascot] = useState<MascotKey>('apple')
  const [pendingAccounts, setPendingAccounts] = useState<Array<{ user_id: string; email: string; full_name: string | null; username: string | null; created_at: string }>>([])
  const [teamFeedback, setTeamFeedback] = useState('')
  const [teamMascot, setTeamMascot] = useState<MascotKey>('apple')
  const [teamMascotBusy, setTeamMascotBusy] = useState(false)

  const loadPendingAccounts = useCallback(async () => {
    if (demo || !supabase) return
    const { data, error } = await supabase.rpc('et_list_unlinked_accounts')
    if (error) {
      setTeamFeedback('No se han podido cargar las cuentas pendientes.')
      return
    }
    setPendingAccounts((data ?? []) as typeof pendingAccounts)
  }, [demo])

  useEffect(() => { void loadPendingAccounts() }, [loadPendingAccounts])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setTeamFeedback('')
    const id = crypto.randomUUID()
    const row = { id, display_name: name.toUpperCase(), username, role, category, mascot_key: mascot, active: true, weekly_minutes: role === 'supervisor' ? 0 : 2100, user_id: null }
    if (demo) onChange(p => [...p, row])
    else {
      const { error } = await supabase!.from('et_staff').insert(row)
      if (error) {
        setTeamFeedback('No se ha podido añadir el perfil. Revisa que el usuario no esté repetido.')
        return
      }
      await supabase!.from('et_invitations').insert({ email: email.toLowerCase(), staff_id: id })
      await reload()
      await loadPendingAccounts()
    }
    setName('')
    setUsername('')
    setEmail('')
    setRole('professional')
    setCategory('nursing')
  }

  const linkAccount = async (person: Staff, userId: string) => {
    if (demo) return
    setTeamFeedback('')
    const { error } = await supabase!.rpc('et_link_account', { p_staff_id: person.id, p_user_id: userId })
    if (error) {
      setTeamFeedback(error.message)
      return
    }
    await reload()
    await loadPendingAccounts()
    setTeamFeedback('Cuenta vinculada con ' + person.display_name + '.')
  }

  const removePerson = async (person: Staff) => {
    if (!window.confirm('¿Eliminar permanentemente el perfil de ' + person.display_name + '? Esta opción solo se permite si todavía no tiene una cuenta vinculada ni datos de trabajo asociados.')) return
    setTeamFeedback('')
    if (demo) {
      onChange(rows => rows.filter(row => row.id !== person.id))
      return
    }
    const { error } = await supabase!.rpc('et_delete_staff_profile', { p_staff_id: person.id })
    if (error) {
      setTeamFeedback(error.message)
      return
    }
    if (selectedPerson?.id === person.id) setSelectedPerson(null)
    await reload()
    await loadPendingAccounts()
    setTeamFeedback('Perfil de ' + person.display_name + ' eliminado.')
  }

  const toggleActive = async (person: Staff) => {
    setTeamFeedback('')
    if (demo) {
      onChange(rows => rows.map(row => row.id === person.id ? { ...row, active: !row.active } : row))
      return
    }
    const { error } = await supabase!.rpc('et_set_staff_active', { p_staff_id: person.id, p_active: !person.active })
    if (error) {
      setTeamFeedback(error.message)
      return
    }
    await reload()
    setTeamFeedback(person.active ? person.display_name + ' ha quedado fuera del equipo activo.' : person.display_name + ' vuelve a estar activo.')
  }

  const openPerson = (person: Staff) => {
    setSelectedPerson(person)
    setTeamMascot(person.mascot_key)
    setTeamFeedback('')
  }

  const savePersonMascot = async () => {
    if (!selectedPerson || teamMascotBusy) return
    setTeamMascotBusy(true)
    setTeamFeedback('')
    if (demo) {
      onChange(rows => rows.map(row => row.id === selectedPerson.id ? { ...row, mascot_key: teamMascot } : row))
      setSelectedPerson(person => person ? { ...person, mascot_key: teamMascot } : person)
      setTeamFeedback('Mascota actualizada para ' + selectedPerson.display_name + '.')
      setTeamMascotBusy(false)
      return
    }
    const { error } = await supabase!.rpc('et_set_staff_mascot', { p_staff_id: selectedPerson.id, p_mascot: teamMascot })
    if (error) {
      setTeamFeedback(error.message)
      setTeamMascotBusy(false)
      return
    }
    await reload()
    setSelectedPerson(person => person ? { ...person, mascot_key: teamMascot } : person)
    setTeamFeedback('Mascota actualizada para ' + selectedPerson.display_name + '.')
    setTeamMascotBusy(false)
  }

  return <section className="content-section">
    <div className="section-heading"><div><span className="eyebrow">Administración</span><h1>Equipo</h1><p>Vincula las cuentas registradas con su ficha, edita coberturas y gestiona quién forma parte del equipo.</p></div></div>
    {teamFeedback && <p className="form-message">{teamFeedback}</p>}

    {!demo && pendingAccounts.length > 0 && <section className="panel">
      <div className="request-form-heading"><div><h2><Users /> Cuentas pendientes de vincular</h2><p>Estas personas ya se han registrado. Elige la ficha correcta para darles acceso sin crear un perfil duplicado.</p></div></div>
      <div className="broadcast-list">
        {pendingAccounts.map(account => <article className="broadcast-card" key={account.user_id}>
          <div><h3>{account.full_name || account.email}</h3><p>{account.email}{account.username ? ' · @' + account.username : ''}</p></div>
          <div className="card-actions">
            <select aria-label={'Vincular ' + account.email} defaultValue="" onChange={event => {
              const person = staff.find(row => row.id === event.target.value)
              if (person) void linkAccount(person, account.user_id)
              event.currentTarget.value = ''
            }}>
              <option value="" disabled>Vincular con…</option>
              {staff.filter(person => !person.user_id && person.active).map(person => <option key={person.id} value={person.id}>{person.display_name} · @{person.username}</option>)}
            </select>
          </div>
        </article>)}
      </div>
    </section>}


    <div className="team-grid">{staff.map(s => <article className={'person-card' + (s.active ? '' : ' inactive')} key={s.id}>
      <img src={MASCOTS.find(m => m.key === s.mascot_key)?.src} alt="" />
      <div>
        <h3>{s.display_name}</h3>
        <p>@{s.username}</p>
        <span>{s.role === 'supervisor' ? 'Supervisora' : 'Profesional'} · {staffCategoryLabel(s.category)} · {s.user_id ? 'Acceso activo' : 'Sin cuenta vinculada'}{!s.active ? ' · Baja del equipo' : ''}</span>
        <div className="inline-actions">
          <button className="soft-button" onClick={() => openPerson(s)}>Ver ficha personal</button>
          {!s.user_id && s.role !== 'supervisor' && <button className="icon-action delete" title="Eliminar perfil" onClick={() => void removePerson(s)}><Trash2 size={15} /> Eliminar</button>}
          {s.role !== 'supervisor' && <button className="icon-action edit" title={s.active ? 'Desactivar perfil' : 'Reactivar perfil'} onClick={() => void toggleActive(s)}>{s.active ? 'Desactivar' : 'Reactivar'}</button>}
        </div>
      </div>
    </article>)}</div>

    {selectedPerson && <div className="modal-backdrop"><div className="modal wide-modal" role="dialog" aria-modal="true" aria-label="Ficha de profesional"><button className="modal-close" aria-label="Cerrar ficha" onClick={() => setSelectedPerson(null)}><X /></button><span className="eyebrow">{selectedPerson.role==='supervisor'?'Supervisión':'Ficha profesional'} · {staffCategoryLabel(selectedPerson.category)}</span><h2>{selectedPerson.display_name}</h2><section className="team-mascot-editor"><div><strong>Mascota del perfil</strong><p className="helper">Como supervisora puedes cambiarla cuando quieras. La persona también podrá volver a elegir otra desde su propia ficha.</p></div><div className="profile-preview compact-team-mascot"><img src={(MASCOTS.find(m=>m.key===teamMascot)??MASCOTS[0]).src} alt={(MASCOTS.find(m=>m.key===teamMascot)??MASCOTS[0]).name}/></div><MascotPicker value={teamMascot} onChange={setTeamMascot} compact/><button className="primary" disabled={teamMascotBusy||teamMascot===selectedPerson.mascot_key} onClick={()=>void savePersonMascot()}>{teamMascotBusy?'Guardando…':'Guardar mascota'}</button></section>{selectedPerson.role==='professional'&&<CoveragePreferences key={selectedPerson.id} person={selectedPerson} consultations={consultations.filter(c=>!isAbsence(c.id))} profile={coverageProfiles.find(p => p.staff_id === selectedPerson.id)} demo={demo} onChange={onCoverageChange} reload={reload} />}</div></div>}

    <form className="panel add-person" onSubmit={add}>
      <h2><CircleUserRound /> Añadir perfil</h2>
      <p>Úsalo para incorporar a alguien que todavía no se haya registrado. Si ya aparece arriba como cuenta pendiente, vincúlala en lugar de crear otro perfil.</p>
      <div className="form-grid">
        <label>Nombre<input required value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Usuario<input required value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} /></label>
        <label>Correo de acceso<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Tipo de perfil<select value={role} onChange={e => setRole(e.target.value as Staff['role'])}><option value="professional">Profesional</option><option value="supervisor">Supervisora / Jefa</option></select></label><label>Colectivo<select value={category} onChange={e => setCategory(e.target.value as StaffCategory)}><option value="nursing">Enfermería</option><option value="tcae">TCAE</option><option value="administrative">Administrativa</option><option value="endocrinology">Endocrino</option></select></label>
      </div>
      <MascotPicker value={mascot} onChange={setMascot} compact />
      <button className="primary"><Plus /> Añadir e invitar</button>
    </form>
  </section>
}

function SettingsView({demo,onNavigate,onSave}:{demo:boolean;onNavigate:(view:View)=>void;onSave:(config:PlanningConfig)=>Promise<string|null>}) {
  return <section className="content-section"><div className="section-heading"><div><span className="eyebrow">Administración</span><h1>Configuración</h1><p>Consulta las condiciones actuales de planificación y accede a los ajustes de tu perfil.</p></div></div>
    <div className="settings-grid">
      <PlanningSettings onSave={onSave}/>
      <CalendarAppearanceSettings demo={demo}/>
      <section className="panel"><h2><Check size={20}/> Publicación del cuadrante</h2><p>Los cambios se guardan en borrador. El equipo ve la última versión publicada de cada mes.</p><p className="helper">Revisa la cobertura y publica desde el cuadrante cuando esté listo.</p><button className="soft-button" onClick={()=>onNavigate('history')}>Ver historial de cambios</button></section>

      <section className="panel"><h2><Settings size={20}/> Otros ajustes</h2><div className="settings-shortcuts"><div><strong>Horarios y cobertura</strong><p>Las reglas, cadencias y suspensiones están en Consultas.</p><button className="soft-button" onClick={()=>onNavigate('consultations')}>Gestionar consultas</button></div><div><strong>Tu ficha personal</strong><p>Consulta tu perfil y cambia tu mascota.</p><button className="soft-button" onClick={()=>onNavigate('profile')}>Abrir mi ficha</button></div></div></section>
    </div>
  </section>
}

function PushSettings({ userId, demo }: { userId?: string | null; demo: boolean }) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!demo && pushAvailable()) void getPushSubscription().then(subscription => setEnabled(Boolean(subscription))).catch(() => undefined)
  }, [demo])
  if (demo || !userId) return null
  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone)
  const toggle = async () => {
    setBusy(true); setMessage('')
    try {
      if (enabled) { await disablePush(); setEnabled(false); setMessage('Notificaciones desactivadas en este dispositivo.') }
      else { await enablePush(userId); setEnabled(true); setMessage('Recibirás los avisos de Guadalupe en este dispositivo.') }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se han podido cambiar las notificaciones.') }
    finally { setBusy(false) }
  }
  return <div className="panel push-settings"><div><h2><Bell size={19} /> Avisos en el móvil</h2><p>Recibe una notificación cuando Guadalupe te envíe un aviso, incluso con EndoTurnos cerrado.</p>{iphone && !standalone && <p>En iPhone: abre esta página en Safari, toca Compartir → Añadir a pantalla de inicio y entra desde el nuevo icono.</p>}{!pushAvailable() && <p>Este navegador no admite notificaciones push. Usa Safari en iPhone o Chrome en Android.</p>}{message && <p role="status" className="form-message">{message}</p>}</div><button className="soft-button" onClick={toggle} disabled={busy || !pushAvailable() || (iphone && !standalone)}>{busy ? 'Un momento…' : enabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}</button></div>
}

function ProfileView({ coverageProfile, onCoverageChange, consultations, profile, demo, onUpdated, reload }: { coverageProfile?: CoverageProfile; onCoverageChange: React.Dispatch<React.SetStateAction<CoverageProfile[]>>; consultations: Consultation[]; profile: Staff; demo: boolean; onUpdated: (key: MascotKey) => void; reload: () => void }) {
  const [personalTab, setPersonalTab] = useState<'coverage'|'mascot'>(profile.role==='professional'?'coverage':'mascot')
  const [mascot, setMascot] = useState<MascotKey>(profile.mascot_key)
  const [saved, setSaved] = useState(false)
  const save = async () => {
    if (!demo) {
      const { error } = await supabase!.rpc('et_set_staff_mascot', { p_staff_id: profile.id, p_mascot: mascot })
      if (error) return
      await reload()
    }
    onUpdated(mascot); setSaved(true); window.setTimeout(() => setSaved(false), 2200)
  }
  const selected = MASCOTS.find(m => m.key === mascot) ?? MASCOTS[0]
  return <section className="content-section"><div className="section-heading"><div><span className="eyebrow">Tu espacio</span><h1>Mi ficha personal</h1><p>Tu mascota y las consultas que puedes cubrir.</p></div></div>{profile.role === 'professional' && <PushSettings userId={profile.user_id} demo={demo} />}{profile.role==='professional'&&<div className="segmented personal-tabs"><button className={personalTab==='coverage'?'active':''} onClick={()=>setPersonalTab('coverage')}>Mis consultas</button><button className={personalTab==='mascot'?'active':''} onClick={()=>setPersonalTab('mascot')}>Mi mascota</button></div>}{personalTab==='coverage'&&profile.role==='professional'?<CoveragePreferences person={profile} consultations={consultations.filter(c=>!isAbsence(c.id))} profile={coverageProfile} demo={demo} onChange={onCoverageChange} reload={reload}/>:<div className="profile-layout"><div className="panel profile-preview"><img src={selected.src} alt={selected.name} /><span>{selected.greeting}</span><h2>{profile.display_name}</h2><p>@{profile.username} · {profile.role === 'supervisor' ? 'Supervisora / Jefa' : 'Profesional'} · {staffCategoryLabel(profile.category)}</p></div><div className="panel"><h2>Elige tu compañera</h2><MascotPicker value={mascot} onChange={setMascot} /><button className="primary" onClick={save}>{saved ? <><Check /> Guardado</> : 'Guardar mascota'}</button></div></div>}</section>
}

function MascotPicker({ value, onChange, compact = false }: { value: MascotKey; onChange: (m: MascotKey) => void; compact?: boolean }) {
  return <fieldset className={`mascot-picker ${compact ? 'compact' : ''}`}><legend>Elige tu mascota</legend><div>{MASCOTS.map(m => <button type="button" key={m.key} className={value === m.key ? 'selected' : ''} onClick={() => onChange(m.key)}><img src={m.src} alt="" /><span>{m.name}</span>{value === m.key && <Check size={15} />}</button>)}</div></fieldset>
}

function PendingAccess({ onLogout }: { onLogout: () => void }) {
  return <main className="center-page"><section className="pending-card"><img src={`${import.meta.env.BASE_URL}mascots/puffin.png`} alt="" /><h1>Tu acceso está casi listo</h1><p>La supervisora debe vincular tu cuenta con la plantilla antes de mostrarte el cuadrante.</p><button className="soft-button" onClick={onLogout}><LogOut /> Cerrar sesión</button></section></main>
}

export default App
