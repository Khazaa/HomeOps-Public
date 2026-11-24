import type { AuditEvent, Resource } from './types';

export type RemoteDiagnosticEntry = { at: string; level: 'info' | 'error'; message: string; details?: Record<string, unknown> };

const sensitiveKey = /secret|password|private.?key|token|authorization|cookie/i;
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redact(entry)]));
  return value;
}

export function diagnosticFilename(resource: Resource) {
  const safeName = resource.name.replace(/[^a-z0-9äöüß_-]+/gi, '-').replace(/^-|-$/g, '') || 'ressource';
  return `homeops-${safeName}-diagnose-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
}

export function formatRemoteDiagnostics(resource: Resource, entries: RemoteDiagnosticEntry[], auditEvents: AuditEvent[], version: string, userAgent: string) {
  const target = `${String(resource.config.host ?? '')}:${String(resource.config.port ?? '')}`;
  const authentication = resource.credentialId ? 'globales Credential' : resource.hasLocalSecret ? 'ressourceneigenes Secret' : 'Eingabe beim Verbinden';
  const lines = ['HomeOps Hub – Verbindungsdiagnose', `Erstellt: ${new Date().toISOString()}`, `Version: ${version}`, `Ressource: ${resource.name} (${resource.id})`, `Protokoll: ${resource.type.toUpperCase()}`, `Ziel: ${target}`, `Authentifizierung: ${authentication}`, `Browser: ${userAgent}`, '', 'Browser-/Tunnelereignisse:'];
  if (!entries.length) lines.push('- Keine Ereignisse aufgezeichnet.');
  for (const entry of entries) lines.push(`[${entry.at}] ${entry.level.toUpperCase()} ${entry.message}${entry.details ? ` ${JSON.stringify(redact(entry.details))}` : ''}`);
  lines.push('', 'Backend-Audit (neueste zuerst):');
  if (!auditEvents.length) lines.push('- Keine Audit-Einträge für diese Ressource gefunden.');
  for (const event of auditEvents) lines.push(`[${event.createdAt}] ${event.ok ? 'OK' : 'FEHLER'} ${event.code} (${event.protocol.toUpperCase()})`);
  lines.push('', 'Hinweis: Passwörter, Private Keys, Tokens und Cookies werden nicht in diese Datei aufgenommen.');
  return lines.join('\n');
}
