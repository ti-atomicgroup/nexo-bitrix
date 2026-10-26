/**
 * Esquema inicial do Nexo v2. Convenções:
 * - ids TEXT (UUID); datas ISO 8601 em TEXT; booleanos INTEGER 0/1; listas e objetos em TEXT (JSON).
 * - Campos JSON têm o formato dos contratos em src/shared/contracts.ts.
 */
export const migration001 = {
  id: 1,
  name: "init",
  sql: `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE app_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','rh')),
  bitrix_user_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  bitrix_user_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  position TEXT,
  department TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL CHECK (source IN ('bitrix','manual','crm')),
  updated_at TEXT NOT NULL
);
CREATE INDEX people_name ON people(name COLLATE NOCASE);

CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('onboarding','offboarding')),
  name TEXT NOT NULL,
  profile TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE template_stages (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  release_mode TEXT NOT NULL CHECK (release_mode IN ('start','offset','after_previous')),
  release_offset_days INTEGER NOT NULL DEFAULT 0,
  release_offset_unit TEXT NOT NULL DEFAULT 'calendar' CHECK (release_offset_unit IN ('calendar','business'))
);
CREATE INDEX template_stages_template ON template_stages(template_id, position);

CREATE TABLE template_activities (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES template_stages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task','meeting','reading','delivery')),
  role TEXT NOT NULL CHECK (role IN ('rh','gestor','ti','colaborador','buddy','outro')),
  due_offset_days INTEGER NOT NULL DEFAULT 0,
  due_offset_unit TEXT NOT NULL DEFAULT 'calendar' CHECK (due_offset_unit IN ('calendar','business')),
  due_time TEXT NOT NULL DEFAULT '18:00',
  required INTEGER NOT NULL DEFAULT 1,
  visibility TEXT NOT NULL DEFAULT 'team' CHECK (visibility IN ('employee','team','hr')),
  requires_approval INTEGER NOT NULL DEFAULT 0,
  ledger_role TEXT CHECK (ledger_role IN ('revoke_and_collect')),
  checklist TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX template_activities_stage ON template_activities(stage_id, position);

CREATE TABLE journeys (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('onboarding','offboarding')),
  person_id TEXT NOT NULL REFERENCES people(id),
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  template_snapshot TEXT NOT NULL,
  anchor_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','paused','completed','cancelled')),
  offboarding_reason TEXT CHECK (offboarding_reason IN ('voluntary','involuntary')),
  participants TEXT NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL CHECK (source_type IN ('manual','trigger')),
  source_key TEXT UNIQUE,
  source_label TEXT,
  crm_binding TEXT,
  crm_url TEXT,
  link_token_hash TEXT UNIQUE,
  link_expires_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT
);
CREATE INDEX journeys_status ON journeys(status);
CREATE INDEX journeys_person ON journeys(person_id);

CREATE TABLE journey_activities (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  stage_position INTEGER NOT NULL,
  position INTEGER NOT NULL,
  template_activity_id TEXT,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  role TEXT NOT NULL,
  assignee_bitrix_id TEXT,
  assignee_name TEXT,
  due_at TEXT NOT NULL,
  required INTEGER NOT NULL,
  visibility TEXT NOT NULL,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  ledger_role TEXT,
  status TEXT NOT NULL CHECK (status IN ('locked','open','in_progress','awaiting_approval','done','cancelled')),
  checklist TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '[]',
  bitrix_task_id TEXT,
  bitrix_status INTEGER,
  bitrix_missing INTEGER NOT NULL DEFAULT 0,
  checklist_synced_at TEXT,
  sync_state TEXT NOT NULL DEFAULT 'local' CHECK (sync_state IN ('local','queued','synced','error','uncertain')),
  sync_error TEXT,
  released_at TEXT,
  done_at TEXT,
  done_source TEXT CHECK (done_source IN ('bitrix','nexo','link')),
  calendar_event_id TEXT,
  last_nudged_at TEXT
);
CREATE INDEX journey_activities_journey ON journey_activities(journey_id, stage_position, position);
CREATE INDEX journey_activities_status ON journey_activities(status);
CREATE INDEX journey_activities_task ON journey_activities(bitrix_task_id);

CREATE TABLE ledger_items (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  kind TEXT NOT NULL CHECK (kind IN ('access','equipment')),
  name TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('planned','active','return_requested','closed','waived')),
  source TEXT NOT NULL CHECK (source IN ('onboarding','manual')),
  granted_journey_id TEXT,
  granted_activity_id TEXT,
  granted_item_key TEXT,
  closing_journey_id TEXT,
  closing_activity_id TEXT,
  waived_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  granted_at TEXT,
  closed_at TEXT,
  UNIQUE (granted_activity_id, granted_item_key)
);
CREATE INDEX ledger_person ON ledger_items(person_id, status);

CREATE TABLE triggers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  journey_kind TEXT NOT NULL CHECK (journey_kind IN ('onboarding','offboarding')),
  entity_type_id INTEGER NOT NULL,
  category_id INTEGER,
  stage_id TEXT NOT NULL,
  stage_name TEXT,
  source_name TEXT,
  template_id TEXT NOT NULL,
  field_map TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  cursor INTEGER,
  last_run_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE detections (
  id TEXT PRIMARY KEY,
  trigger_id TEXT NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  entity_type_id INTEGER NOT NULL,
  entity_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  person_name TEXT,
  person_email TEXT,
  bitrix_user_id TEXT,
  suggested_date TEXT,
  crm_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','started','dismissed')),
  journey_id TEXT,
  detected_at TEXT NOT NULL,
  UNIQUE (trigger_id, entity_type_id, entity_id)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  dedupe_key TEXT UNIQUE,
  payload TEXT NOT NULL DEFAULT '{}',
  run_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX jobs_due ON jobs(status, run_at);

CREATE TABLE leases (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE operations (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('sending','confirmed','uncertain','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  result_id TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','system','link')),
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_entity ON audit_log(entity, entity_id);

CREATE TABLE api_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  method TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error_code TEXT,
  duration_ms INTEGER NOT NULL
);
`,
};
