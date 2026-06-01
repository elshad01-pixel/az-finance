-- 044: Activity logs — audit trail for all user actions

CREATE TABLE IF NOT EXISTS activity_logs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID        REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id),
  user_email  TEXT,
  user_role   TEXT,
  action      TEXT        NOT NULL,
  module      TEXT        NOT NULL,
  record_id   TEXT,
  record_label TEXT,
  details     JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_activity_logs" ON activity_logs
  FOR ALL USING (company_id = get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_activity_logs_company
  ON activity_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user
  ON activity_logs(user_id, created_at DESC);
