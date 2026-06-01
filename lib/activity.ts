import type { SupabaseClient } from '@supabase/supabase-js'

export async function logActivity({
  supabase,
  action,
  module,
  record_id,
  record_label,
  details,
  company_id,
}: {
  supabase:      SupabaseClient
  action:        string
  module:        string
  record_id?:    string
  record_label?: string
  details?:      object
  company_id?:   string
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let cid = company_id
    if (!cid) {
      const { data } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .single()
      cid = data?.company_id
    }

    await supabase.from('activity_logs').insert({
      company_id:   cid,
      user_id:      user.id,
      user_email:   user.email,
      action,
      module,
      record_id,
      record_label,
      details,
    })
  } catch (e) {
    console.error('[activity]', e)
  }
}
