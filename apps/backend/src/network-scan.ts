import dns from 'node:dns/promises';
import net from 'node:net';

export type ScanService = 'web' | 'ssh' | 'rdp' | 'unknown';
export type ScanResult = { ip: string; hostname: string | null; port: number; service: ScanService; suggestedType: 'web' | 'ssh' | 'rdp'; scheme: 'http' | 'https' };
const ipToNumber = (ip: string) => ip.split('.').reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
const numberToIp = (value: number) => [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');
function isPrivate(value: number) { return (value >= ipToNumber('10.0.0.0') && value <= ipToNumber('10.255.255.255')) || (value >= ipToNumber('172.16.0.0') && value <= ipToNumber('172.31.255.255')) || (value >= ipToNumber('192.168.0.0') && value <= ipToNumber('192.168.255.255')); }
export function expandPrivateCidr(cidr: string) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/.exec(cidr.trim()); if (!match) throw new Error('CIDR_INVALID');
  const octets = match[1]!.split('.').map(Number); if (octets.some(value => value > 255)) throw new Error('CIDR_INVALID');
  const prefix = Number(match[2]); if (prefix < 23) throw new Error('CIDR_TOO_LARGE');
  const input = ipToNumber(match[1]!); const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0; const network = (input & mask) >>> 0; const size = 2 ** (32 - prefix);
  if (!isPrivate(network) || !isPrivate((network + size - 1) >>> 0)) throw new Error('CIDR_NOT_PRIVATE');
  const first = size > 2 ? 1 : 0; const last = size > 2 ? size - 1 : size;
  return Array.from({ length: last - first }, (_, index) => numberToIp((network + first + index) >>> 0));
}
export function serviceForPort(port: number): Pick<ScanResult, 'service' | 'suggestedType' | 'scheme'> {
  if ([80, 3000, 8000, 8080].includes(port)) return { service: 'web', suggestedType: 'web', scheme: 'http' };
  if ([443, 8443].includes(port)) return { service: 'web', suggestedType: 'web', scheme: 'https' };
  if (port === 22) return { service: 'ssh', suggestedType: 'ssh', scheme: 'http' };
  if (port === 3389) return { service: 'rdp', suggestedType: 'rdp', scheme: 'http' };
  return { service: 'unknown', suggestedType: 'web', scheme: 'http' };
}
function portOpen(ip: string, port: number, timeoutMs: number) { return new Promise<boolean>(resolve => { const socket = net.createConnection({ host: ip, port }); let settled = false; const done = (open: boolean) => { if (settled) return; settled = true; socket.destroy(); resolve(open); }; socket.setTimeout(timeoutMs); socket.once('connect', () => done(true)); socket.once('timeout', () => done(false)); socket.once('error', () => done(false)); }); }
async function reverseName(ip: string) { try { const names = await Promise.race([dns.reverse(ip), new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('timeout')), 600))]); return names[0] ?? null; } catch { return null; } }
export async function scanPrivateNetwork(cidr: string, ports: number[], timeoutMs = 450) {
  const ips = expandPrivateCidr(cidr); const tasks = ips.flatMap(ip => ports.map(port => ({ ip, port }))); const open: Array<{ ip: string; port: number }> = []; let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(64, tasks.length) }, async () => { while (cursor < tasks.length) { const task = tasks[cursor++]; if (task && await portOpen(task.ip, task.port, timeoutMs)) open.push(task); } }));
  const names = new Map<string, string | null>(); await Promise.all([...new Set(open.map(item => item.ip))].map(async ip => names.set(ip, await reverseName(ip))));
  return open.sort((a, b) => ipToNumber(a.ip) - ipToNumber(b.ip) || a.port - b.port).map(item => ({ ...item, hostname: names.get(item.ip) ?? null, ...serviceForPort(item.port) } satisfies ScanResult));
}
