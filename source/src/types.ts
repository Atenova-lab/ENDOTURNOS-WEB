export type Role = 'supervisor' | 'professional'
export type StaffCategory = 'nursing' | 'tcae' | 'administrative' | 'endocrinology'
export type MascotKey = 'apple' | 'flame' | 'puffin' | 'worm' | 'cat' | 'llama' | 'glucometer' | 'pineapple' | 'dumbbell' | 'yogurt' | 'toast' | 'avocado' | 'egg' | 'turnip' | 'thyroid' | 'broccoli' | 'strawberry' | 'measuring_tape'

export interface Staff {
  id: string
  user_id: string | null
  display_name: string
  username: string
  role: Role
  category?: StaffCategory
  mascot_key: MascotKey
  active: boolean
  weekly_minutes: number
  notes?: string | null
}

export interface Consultation {
  id: string
  label: string
  short_label: string
  color: string
  active: boolean
  default_start_time?: string
  default_end_time?: string
  preferred_staff_id?: string | null
  secondary_staff_ids?: string[]
  coverage_rules?: CoverageRule[] | null
}

export interface Assignment {
  id: string
  professional_id: string
  work_date: string
  consultation_id: string
  start_time: string
  end_time: string
  notes?: string | null
  provisional: boolean
  is_extra?: boolean
  override_reason?: string | null
  updated_at?: string
}

export type RequestType = 'vacation' | 'permission' | 'swap' | 'preference' | 'correction'
export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface ShiftRequest {
  id: string
  professional_id: string
  created_by?: string | null
  request_type: RequestType
  date_from: string
  date_to: string
  details: string
  status: RequestStatus
  supervisor_response?: string | null
  supervisor_seen_at?: string | null
  professional_seen_at?: string | null
  created_at: string
}

export interface PersonalTask {
  id: string
  professional_id: string
  task_date: string
  title: string
  completed: boolean
  details?: string
  note_color?: 'yellow' | 'rose' | 'sage' | 'blue' | 'lavender' | 'cream'
  font_family?: 'nunito' | 'dm-sans' | 'fraunces' | 'caveat'
  is_bold?: boolean
  is_italic?: boolean
  is_underline?: boolean
}

export interface BroadcastRecipient {
  staff_id: string
  read_at: string | null
}

export interface TeamBroadcast {
  id: string
  title: string
  message: string
  created_by: string
  created_at: string
  et_broadcast_recipients: BroadcastRecipient[]
}

export interface ScheduledBroadcast {
  id: string
  title: string
  message: string
  recipient_ids: string[]
  schedule_type: 'once' | 'weekly'
  scheduled_for: string | null
  weekday: number | null
  local_time: string | null
  timezone: string
  next_run_at: string
  active: boolean
  created_by: string
  created_at: string
  updated_at: string
  last_sent_at: string | null
}

export interface CoverageRule {
  id: string
  weekdays: number[]
  start_time: string
  end_time: string
  min_staff: number
  fallback_min_staff?: number
  every_weeks: number
  anchor_date: string
  monthly: boolean
  valid_from: string
  valid_until: string
  suspensions: { from: string; to: string }[]
  alternatives?: string[]
  preferred_staff_ids?: string[]
  secondary_staff_ids?: string[]
}
export interface AssignmentHistory {
  id: string
  assignment_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  actor_name: string
  changed_at: string
  before_data: Assignment | null
  after_data: Assignment | null
}

export interface WorkCadence {
 kind?:'work'|'rest'
 id:string; weekdays:number[]; start_time:string; end_time:string; every_weeks:number; anchor_date:string; valid_from:string; valid_until:string
}

export interface CoverageProfile {
  work_cadences?: WorkCadence[] | null
  staff_id: string
  consultation_ids: string[]
  updated_at?: string
}

export interface LockedMonth { month:string; locked_at:string; locked_by:string }

export interface RotaPublication {
 month: string
 published_at: string
 version: number
 initial_snapshot: boolean
}

export interface CoverageReview {
 id:string; issue_id:string; work_date:string; consultation_id:string; rule_id:string;
 rule_snapshot:CoverageRule; created_by:string; created_by_name:string;
 reviewed_at:string; reopened_at:string|null; reopened_by?:string|null
}
export interface CoverageException {
 id:string; work_date:string; consultation_id:string; rule_id:string; rule_snapshot:CoverageRule;
 reason:string; created_by:string; created_by_name:string; created_at:string; revoked_at:string|null; revoked_by?:string|null;
}
