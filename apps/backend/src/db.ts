import pg from 'pg';
export const createDb = (connectionString: string) => new pg.Pool({ connectionString, max: 10 });
export async function migrate(db: pg.Pool): Promise<void> {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text UNIQUE NOT NULL, password_hash text NOT NULL, role text NOT NULL CHECK (role IN ('admin','user')), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf_hash text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, icon text NOT NULL DEFAULT 'folder', position integer NOT NULL DEFAULT 0, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, payload text NOT NULL, key_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS credentials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name text NOT NULL, username text NOT NULL, kind text NOT NULL CHECK (kind IN ('password','private_key')), payload text NOT NULL, key_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,name));
    ALTER TABLE credentials ADD COLUMN IF NOT EXISTS username text NOT NULL DEFAULT '';
    UPDATE credentials SET username=name WHERE username='';
    ALTER TABLE credentials ADD COLUMN IF NOT EXISTS expires_at timestamptz;
    CREATE TABLE IF NOT EXISTS resources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text NOT NULL CHECK (type IN ('web','ssh','rdp')), name text NOT NULL, category_id uuid REFERENCES categories(id) ON DELETE SET NULL, icon text NOT NULL DEFAULT 'link', position integer NOT NULL DEFAULT 0, enabled boolean NOT NULL DEFAULT true, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, config jsonb NOT NULL DEFAULT '{}', secret_id uuid REFERENCES secrets(id) ON DELETE SET NULL, credential_id uuid REFERENCES credentials(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE resources ADD COLUMN IF NOT EXISTS credential_id uuid REFERENCES credentials(id) ON DELETE SET NULL;
    ALTER TABLE resources ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
    ALTER TABLE resources ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
    CREATE TABLE IF NOT EXISTS resource_permissions (resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, permission text NOT NULL CHECK (permission IN ('use','manage')), PRIMARY KEY(resource_id,user_id));
    CREATE TABLE IF NOT EXISTS user_preferences (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS network_scan_settings (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, enabled boolean NOT NULL DEFAULT false, cidr text NOT NULL DEFAULT '192.168.1.0/24', scan_web boolean NOT NULL DEFAULT true, scan_ssh boolean NOT NULL DEFAULT true, scan_rdp boolean NOT NULL DEFAULT true, custom_ports integer[] NOT NULL DEFAULT '{}', run_time text NOT NULL DEFAULT '03:00', timezone text NOT NULL DEFAULT 'Europe/Berlin', last_run_at timestamptz, last_error text, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS network_scan_discoveries (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, ip text NOT NULL, hostname text, port integer NOT NULL, service text NOT NULL, suggested_type text NOT NULL, scheme text NOT NULL, discovered_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,ip,port));
    CREATE INDEX IF NOT EXISTS network_scan_discoveries_user_idx ON network_scan_discoveries(user_id,discovered_at DESC);
    CREATE TABLE IF NOT EXISTS connection_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, resource_id uuid REFERENCES resources(id) ON DELETE SET NULL, resource_name text NOT NULL, protocol text NOT NULL CHECK (protocol IN ('ssh','rdp')), ok boolean NOT NULL DEFAULT false, code text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS connection_audit_user_created_idx ON connection_audit(user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at); CREATE INDEX IF NOT EXISTS resources_owner_idx ON resources(owner_id); CREATE INDEX IF NOT EXISTS credentials_owner_idx ON credentials(owner_id);
  `);
}
