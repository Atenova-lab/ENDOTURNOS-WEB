import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)

export const supabase = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Static browser-only app: recovery links can open in a different browser from the requester.
        // Implicit flow avoids the device-bound PKCE code verifier for emailed recovery links.
        flowType: 'implicit',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null
