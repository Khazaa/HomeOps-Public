import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const PROXY_TIMEOUT_MS = 10_000;

export type ProxyResponse = { statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer };

export function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    const first = parts[0] ?? -1;
    const second = parts[1] ?? -1;
    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  }
  if (!net.isIPv6(address)) return false;
  const normalized = address.toLowerCase();
  return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}

export async function resolvePrivateTarget(target: URL): Promise<{ address: string; family: 4 | 6 }> {
  const results = await dns.lookup(target.hostname, { all: true, verbatim: true });
  if (!results.length || results.some(result => !isPrivateAddress(result.address))) throw new Error('WEB_PROXY_LAN_TARGET_REQUIRED');
  const selected = results[0]!;
  return { address: selected.address, family: selected.family as 4 | 6 };
}

export function proxyBasePath(resourceId: string): string {
  return `/api/v1/resources/${encodeURIComponent(resourceId)}/web-proxy/`;
}

export function proxyRequestCookies(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const filtered = cookieHeader.split(';').map(value => value.trim()).filter(value => value && !/^(?:homeops_session|homeops_csrf)=/i.test(value));
  return filtered.length ? filtered.join('; ') : undefined;
}

export function rewriteProxySetCookies(values: string[] | undefined, proxyBase: string): string[] {
  return (values ?? []).flatMap(value => {
    const [pair, ...attributes] = value.split(';');
    const name = pair?.split('=', 1)[0]?.trim();
    if (!pair || !name || /^(?:homeops_session|homeops_csrf)$/i.test(name)) return [];
    const safeAttributes = attributes.map(attribute => attribute.trim()).filter(attribute => attribute && !/^(?:domain|path|samesite)=/i.test(attribute) && !/^secure$/i.test(attribute));
    return [[pair.trim(), ...safeAttributes, `Path=${proxyBase}`, 'SameSite=Lax'].join('; ')];
  });
}

export function buildProxyTarget(configuredUrl: string, proxiedPath: string, query = ''): URL {
  const configured = new URL(configuredUrl);
  if (!proxiedPath) {
    configured.search = query;
    return configured;
  }
  return new URL(`/${proxiedPath}${query}`, configured.origin);
}

function proxiedUrl(value: string, target: URL, proxyBase: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#') || /^(?:data|blob|javascript|mailto|tel):/i.test(trimmed)) return value;
  try {
    const resolved = new URL(trimmed, target);
    if (resolved.origin !== target.origin) return value;
    return `${proxyBase}${resolved.pathname.replace(/^\//, '')}${resolved.search}${resolved.hash}`;
  } catch { return value; }
}

export function rewriteProxyHtml(html: string, target: URL, proxyBase: string): string {
  const rewritten = html
    .replace(/(<meta\b[^>]*http-equiv=["']?content-security-policy["']?[^>]*>)/gi, '')
    .replace(/\b(src|href|action|poster)=(['"])(.*?)\2/gi, (_match, attribute: string, quote: string, value: string) => `${attribute}=${quote}${proxiedUrl(value, target, proxyBase)}${quote}`)
    .replace(/\b(src|href|action|poster)=([^\s"'<>]+)/gi, (_match, attribute: string, value: string) => `${attribute}=${proxiedUrl(value, target, proxyBase)}`)
    .replace(/url\((['"]?)(.*?)\1\)/gi, (_match, quote: string, value: string) => `url(${quote}${proxiedUrl(value, target, proxyBase)}${quote})`);
  const targetDirectory = target.pathname.endsWith('/') ? target.pathname : target.pathname.replace(/[^/]*$/, '');
  const base = `<base href="${proxyBase}${targetDirectory.replace(/^\//, '')}">`;
  return /<head\b[^>]*>/i.test(rewritten) ? rewritten.replace(/<head\b[^>]*>/i, match => `${match}${base}`) : `${base}${rewritten}`;
}

export function rewriteProxyCss(css: string, target: URL, proxyBase: string): string {
  return css.replace(/url\((['"]?)(.*?)\1\)/gi, (_match, quote: string, value: string) => `url(${quote}${proxiedUrl(value, target, proxyBase)}${quote})`);
}

export function rewriteProxyLocation(location: string, target: URL, proxyBase: string): string | null {
  const resolved = new URL(location, target);
  return resolved.origin === target.origin ? `${proxyBase}${resolved.pathname.replace(/^\//, '')}${resolved.search}${resolved.hash}` : null;
}

export async function requestProxyTarget(target: URL, method: string, options: { username?: string; password?: string; cookie?: string; ignoreCertificate?: boolean } = {}, body?: Buffer, contentType?: string): Promise<ProxyResponse> {
  const resolved = await resolvePrivateTarget(target);
  const transport = target.protocol === 'https:' ? https : http;
  const authorization = options.username !== undefined && options.password !== undefined ? `Basic ${Buffer.from(`${options.username}:${options.password}`, 'utf8').toString('base64')}` : undefined;
  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method,
      rejectUnauthorized: options.ignoreCertificate !== true,
      headers: {
        accept: '*/*',
        'accept-encoding': 'identity',
        ...(authorization ? { authorization } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
        origin: target.origin,
        referer: target.href,
        'user-agent': 'HomeOps-WebProxy/1.0',
        ...(contentType ? { 'content-type': contentType } : {}),
        ...(body?.length ? { 'content-length': String(body.length) } : {})
      },
      lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family)
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) response.destroy(new Error('WEB_PROXY_RESPONSE_TOO_LARGE'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ statusCode: response.statusCode ?? 502, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.setTimeout(PROXY_TIMEOUT_MS, () => request.destroy(new Error('WEB_PROXY_TIMEOUT')));
    request.on('error', reject);
    request.end(body);
  });
}

export async function requestBasicAuthTarget(target: URL, method: string, username: string, password: string, body?: Buffer, contentType?: string): Promise<ProxyResponse> {
  return requestProxyTarget(target, method, { username, password }, body, contentType);
}
