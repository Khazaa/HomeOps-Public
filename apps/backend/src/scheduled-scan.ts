import type pg from 'pg';
import type { ScanResult } from './network-scan.js';
import { scanPrivateNetwork } from './network-scan.js';

export type NetworkScanSchedule = {
  enabled: boolean; cidr: string; web: boolean; ssh: boolean; rdp: boolean; ports: number[];
  runTime: string; timezone: string; lastRunAt: string | null; lastError: string | null;
};

export function validTimezone(timezone: string) {
  try { new Intl.DateTimeFormat('de-DE', { timeZone: timezone }).format(); return true; }
  catch { return false; }
}

function localParts(date: Date, timezone: string) {
  const entries = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]);
  return Object.fromEntries(entries) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}

export function scheduleDue(runTime: string, timezone: string, lastRunAt: Date | null, now = new Date()) {
  const current = localParts(now, timezone); const today = `${current.year}-${current.month}-${current.day}`;
  if (`${current.hour}:${current.minute}` < runTime) return false;
  if (!lastRunAt) return true;
  const previous = localParts(lastRunAt, timezone);
  return `${previous.year}-${previous.month}-${previous.day}` !== today;
}

export function scanPorts(schedule: Pick<NetworkScanSchedule, 'web' | 'ssh' | 'rdp' | 'ports'>) {
  return [...new Set([...(schedule.web ? [80, 443, 8080, 8443] : []), ...(schedule.ssh ? [22] : []), ...(schedule.rdp ? [3389] : []), ...schedule.ports])].sort((a, b) => a - b);
}

export async function storeDiscoveries(db: pg.Pool, userId: string, results: ScanResult[]) {
  for (const result of results) await db.query(`INSERT INTO network_scan_discoveries(user_id,ip,hostname,port,service,suggested_type,scheme,discovered_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(user_id,ip,port) DO UPDATE SET hostname=$3,service=$5,suggested_type=$6,scheme=$7,discovered_at=now()`, [userId, result.ip, result.hostname, result.port, result.service, result.suggestedType, result.scheme]);
}

export function startScheduledScanner(db: pg.Pool, logger: { info: (value: unknown, message?: string) => void; error: (value: unknown, message?: string) => void }) {
  let running = false;
  const run = async () => {
    if (running) return; running = true;
    try {
      const schedules = await db.query('SELECT * FROM network_scan_settings WHERE enabled');
      for (const row of schedules.rows) {
        if (!scheduleDue(row.run_time, row.timezone, row.last_run_at, new Date())) continue;
        await db.query('UPDATE network_scan_settings SET last_run_at=now(),last_error=NULL WHERE user_id=$1', [row.user_id]);
        try {
          const ports = scanPorts({ web: row.scan_web, ssh: row.scan_ssh, rdp: row.scan_rdp, ports: row.custom_ports });
          const results = await scanPrivateNetwork(row.cidr, ports);
          await storeDiscoveries(db, row.user_id, results);
          logger.info({ userId: row.user_id, discoveries: results.length }, 'Scheduled network scan completed');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'SCAN_FAILED';
          await db.query('UPDATE network_scan_settings SET last_error=$1 WHERE user_id=$2', [message, row.user_id]);
          logger.error({ userId: row.user_id, error: message }, 'Scheduled network scan failed');
        }
      }
    } finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, 60_000); timer.unref();
  setTimeout(() => { void run(); }, 5_000).unref();
  return () => clearInterval(timer);
}
