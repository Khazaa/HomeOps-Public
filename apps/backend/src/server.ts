import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { contentSecurityPolicy } from './csp.js';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import staticPlugin from '@fastify/static';
import argon2 from 'argon2';
import { z } from 'zod';
import GuacamoleLite from 'guacamole-lite';
import { loadConfig } from './config.js';
import { createDb, migrate } from './db.js';
import { decryptSecret, encryptSecret, isSafeHost, randomToken, sha256 } from './security.js';
import { expandPrivateCidr, scanPrivateNetwork } from './network-scan.js';
import { scanPorts, startScheduledScanner, validTimezone } from './scheduled-scan.js';
import { applyRdpSettings, RDP_KEYBOARD_LAYOUTS, remoteUsername } from './remote-settings.js';
import { buildProxyTarget, proxyBasePath, proxyRequestCookies, requestProxyTarget, rewriteProxyCss, rewriteProxyHtml, rewriteProxyLocation, rewriteProxySetCookies } from './web-proxy.js';
import { attachSshTunnel, SshTicketStore } from './ssh-tunnel.js';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const app = Fastify({ logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'body.password', 'body.currentPassword', 'body.newPassword', 'body.secret'] }, trustProxy: config.TRUST_PROXY });
const sshTickets = new SshTicketStore();
await app.register(cookie);
await app.register(helmet, { contentSecurityPolicy });
await app.register(rateLimit, { global: false });
await app.register(sensible);
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer', bodyLimit: 1024 * 1024 }, (_request, body, done) => done(null, body));

const credentials = z.object({ username: z.string().min(3).max(64), password: z.string().min(8).max(512) });
const categoryInput = z.object({ name: z.string().min(1).max(80), icon: z.string().max(50).default('folder'), position: z.number().int().min(0).default(0) });
const baseResource = { name: z.string().min(1).max(120), notes:z.string().max(4000).default(''), tags:z.array(z.string().trim().min(1).max(40)).max(20).default([]), categoryId: z.string().uuid().nullable().optional(), icon: z.string().max(50).default('link'), position: z.number().int().min(0).default(0), enabled: z.boolean().default(true), secret: z.string().min(1).max(16384).optional(), credentialId: z.string().uuid().nullable().optional() };
const resourceInput = z.discriminatedUnion('type', [
  z.object({ ...baseResource, type: z.literal('web'), config: z.object({ url: z.string().url().refine(v => { const url=new URL(v);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password; }), mode: z.enum(['embedded','external','auto','proxy']).default('auto'), authType:z.enum(['none','basic']).default('none'), ignoreCertificate:z.boolean().default(false), sandbox: z.string().default('allow-forms allow-modals allow-popups allow-scripts allow-same-origin') }) }),
  z.object({ ...baseResource, type: z.literal('ssh'), config: z.object({ host: z.string().refine(isSafeHost), port: z.number().int().min(1).max(65535).default(22), username: z.string().max(128).default(''), authType: z.enum(['password','private_key']).default('password'), verifyHostKey: z.boolean().default(true), hostKeyFingerprint: z.string().max(512).default('') }).superRefine((value,ctx)=>{if(value.verifyHostKey&&value.hostKeyFingerprint.length<16)ctx.addIssue({code:'custom',path:['hostKeyFingerprint'],message:'SSH host key is required when verification is enabled'});}) }),
  z.object({ ...baseResource, type: z.literal('rdp'), config: z.object({ host: z.string().refine(isSafeHost), port: z.number().int().min(1).max(65535).default(3389), username: z.string().max(128).default(''), domain: z.string().max(128).optional(), security: z.enum(['any','nla','tls','rdp']).default('nla'), keyboardLayout: z.enum(RDP_KEYBOARD_LAYOUTS).default('en-us-qwerty'), ignoreCertificate: z.boolean().default(false) }) })
]);
const resourceUpdate = z.object({ name:z.string().min(1).max(120), notes:z.string().max(4000), tags:z.array(z.string().trim().min(1).max(40)).max(20), categoryId:z.string().uuid().nullable(), icon:z.string().max(50), position:z.number().int().min(0), enabled:z.boolean(), secret:z.string().min(1).max(16384), credentialId:z.string().uuid().nullable(), config:z.record(z.string(),z.unknown()) }).partial();
const credentialInput=z.object({name:z.string().trim().min(1).max(120),username:z.string().trim().min(1).max(128),kind:z.enum(['password','private_key']),secret:z.string().min(1).max(16384),expiresAt:z.string().datetime().nullable().default(null)});

function sessionCookieOptions() { return { path: '/', httpOnly: true, sameSite: 'strict' as const, secure: config.COOKIE_SECURE, maxAge: config.SESSION_TTL_HOURS * 3600 }; }
async function authenticate(request: FastifyRequest): Promise<void> {
  const raw = request.cookies.homeops_session;
  if (!raw) throw app.httpErrors.unauthorized('AUTH_REQUIRED');
  const result = await db.query(`SELECT u.id,u.username,u.role,s.csrf_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`, [sha256(raw)]);
  if (!result.rowCount) throw app.httpErrors.unauthorized('SESSION_EXPIRED');
  request.authUser = { id: result.rows[0].id, username: result.rows[0].username, role: result.rows[0].role, csrfHash: result.rows[0].csrf_hash };
}
async function requireCsrf(request: FastifyRequest): Promise<void> {
  const token = request.headers['x-csrf-token'];
  if (typeof token !== 'string' || !request.authUser || sha256(token) !== request.authUser.csrfHash) throw app.httpErrors.forbidden('CSRF_INVALID');
  const origin = request.headers.origin;
  if (origin && origin !== config.APP_ORIGIN) {
    request.log.warn({ origin, expectedOrigin: config.APP_ORIGIN }, 'Rejected request origin');
    throw app.httpErrors.forbidden('ORIGIN_INVALID');
  }
}
async function ownedResource(id: string, userId: string) {
  const result = await db.query(`SELECT r.* FROM resources r LEFT JOIN resource_permissions p ON p.resource_id=r.id AND p.user_id=$2 WHERE r.id=$1 AND r.enabled AND (r.owner_id=$2 OR p.permission IN ('use','manage'))`, [id, userId]);
  if (!result.rowCount) throw app.httpErrors.notFound('RESOURCE_NOT_FOUND');
  return result.rows[0];
}
const cleanResource = (row: Record<string, unknown>) => ({ id: row.id, type: row.type, name: row.name, notes:row.notes??'', tags:row.tags??[], categoryId: row.category_id, icon: row.icon, position: row.position, enabled: row.enabled, config: row.config, hasSecret: Boolean(row.secret_id||row.credential_id), hasLocalSecret:Boolean(row.secret_id), credentialId:row.credential_id??null });
const cleanCredential=(row:Record<string,unknown>)=>({id:row.id,name:row.name,username:row.username,kind:row.kind,expiresAt:row.expires_at??null,createdAt:row.created_at,updatedAt:row.updated_at});
async function validateCredentialAssignment(ownerId:string,type:string,resourceConfig:Record<string,unknown>,credentialId:string|null|undefined){
  if(type==='web'&&resourceConfig.authType==='basic'&&!credentialId)throw app.httpErrors.badRequest('CREDENTIAL_REQUIRED');
  if(!credentialId)return;
  if(type==='web'&&resourceConfig.authType!=='basic')throw app.httpErrors.badRequest('WEB_CREDENTIAL_NOT_ALLOWED');
  const credential=(await db.query('SELECT kind,expires_at FROM credentials WHERE id=$1 AND owner_id=$2',[credentialId,ownerId])).rows[0];
  if(!credential)throw app.httpErrors.badRequest('CREDENTIAL_NOT_FOUND');
  if(credential.expires_at&&new Date(credential.expires_at)<=new Date())throw app.httpErrors.badRequest('CREDENTIAL_EXPIRED');
  const expected=type==='ssh'&&resourceConfig.authType==='private_key'?'private_key':'password';
  if(credential.kind!==expected)throw app.httpErrors.badRequest('CREDENTIAL_TYPE_MISMATCH');
}

app.get('/health', async () => { await db.query('SELECT 1'); return { status: 'ok' }; });
app.post('/api/v1/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute', ban: 3 } } }, async (request, reply) => {
  const body = credentials.parse(request.body); const result = await db.query('SELECT id,username,password_hash,role,active FROM users WHERE username=$1', [body.username]);
  const user = result.rows[0]; if (!user || !user.active || !(await argon2.verify(user.password_hash, body.password))) throw app.httpErrors.unauthorized('INVALID_CREDENTIALS');
  const session = randomToken(); const csrf = randomToken(); const expires = new Date(Date.now() + config.SESSION_TTL_HOURS * 3_600_000);
  await db.query('DELETE FROM sessions WHERE expires_at<=now()');
  await db.query('INSERT INTO sessions(token_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,$4)', [sha256(session), user.id, sha256(csrf), expires]);
  reply.setCookie('homeops_session', session, sessionCookieOptions());
  reply.setCookie('homeops_csrf', csrf, { path: '/', httpOnly: false, sameSite: 'strict', secure: config.COOKIE_SECURE, maxAge: config.SESSION_TTL_HOURS * 3600 });
  return { user: { id: user.id, username: user.username, role: user.role } };
});
app.get('/api/v1/auth/me', { preHandler: authenticate }, async request => ({ user: request.authUser && { id: request.authUser.id, username: request.authUser.username, role: request.authUser.role } }));
app.post('/api/v1/auth/logout', { preHandler: [authenticate, requireCsrf] }, async (request, reply) => { await db.query('DELETE FROM sessions WHERE token_hash=$1', [sha256(request.cookies.homeops_session!)]); reply.clearCookie('homeops_session', { path: '/' }); reply.clearCookie('homeops_csrf', { path: '/' }); return { ok: true }; });
app.post('/api/v1/auth/change-password', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, preHandler: [authenticate, requireCsrf] }, async request => {
  const body=z.object({currentPassword:z.string().min(1).max(512),newPassword:z.string().min(12).max(512)}).parse(request.body);
  const current=(await db.query('SELECT password_hash FROM users WHERE id=$1 AND active',[request.authUser!.id])).rows[0];
  if(!current || !(await argon2.verify(current.password_hash,body.currentPassword))) throw app.httpErrors.unauthorized('INVALID_CURRENT_PASSWORD');
  if(await argon2.verify(current.password_hash,body.newPassword)) throw app.httpErrors.badRequest('PASSWORD_UNCHANGED');
  const nextHash=await argon2.hash(body.newPassword,{type:argon2.argon2id}); const currentSessionHash=sha256(request.cookies.homeops_session!); const client=await db.connect();
  try { await client.query('BEGIN'); await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[nextHash,request.authUser!.id]); await client.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[request.authUser!.id,currentSessionHash]); await client.query('COMMIT'); return {ok:true}; }
  catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
});

app.get('/api/v1/categories', { preHandler: authenticate }, async request => (await db.query('SELECT id,name,icon,position FROM categories WHERE owner_id=$1 ORDER BY position,name', [request.authUser!.id])).rows);
app.post('/api/v1/categories', { preHandler: [authenticate, requireCsrf] }, async request => { const b=categoryInput.parse(request.body); return (await db.query('INSERT INTO categories(name,icon,position,owner_id) VALUES($1,$2,$3,$4) RETURNING id,name,icon,position',[b.name,b.icon,b.position,request.authUser!.id])).rows[0]; });
app.patch('/api/v1/categories/:id', { preHandler: [authenticate, requireCsrf] }, async request => { const b=categoryInput.partial().parse(request.body); const id=z.string().uuid().parse((request.params as {id:string}).id); const current=(await db.query('SELECT * FROM categories WHERE id=$1 AND owner_id=$2',[id,request.authUser!.id])).rows[0]; if(!current) throw app.httpErrors.notFound(); return (await db.query('UPDATE categories SET name=$1,icon=$2,position=$3 WHERE id=$4 RETURNING id,name,icon,position',[b.name??current.name,b.icon??current.icon,b.position??current.position,id])).rows[0]; });
app.delete('/api/v1/categories/:id', { preHandler: [authenticate, requireCsrf] }, async request => { const id=z.string().uuid().parse((request.params as {id:string}).id); const r=await db.query('DELETE FROM categories WHERE id=$1 AND owner_id=$2',[id,request.authUser!.id]); if(!r.rowCount) throw app.httpErrors.notFound(); return {ok:true}; });

app.get('/api/v1/credentials', { preHandler: authenticate }, async request => (await db.query('SELECT id,name,username,kind,expires_at,created_at,updated_at FROM credentials WHERE owner_id=$1 ORDER BY name',[request.authUser!.id])).rows.map(cleanCredential));
app.post('/api/v1/credentials', { preHandler:[authenticate,requireCsrf] }, async request => {const body=credentialInput.parse(request.body);const row=(await db.query('INSERT INTO credentials(owner_id,name,username,kind,payload,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[request.authUser!.id,body.name,body.username,body.kind,encryptSecret(body.secret,config.MASTER_KEY),body.expiresAt])).rows[0];return cleanCredential(row);});
app.patch('/api/v1/credentials/:id', { preHandler:[authenticate,requireCsrf] }, async request => {const id=z.string().uuid().parse((request.params as {id:string}).id);const body=credentialInput.partial().parse(request.body);const current=(await db.query('SELECT * FROM credentials WHERE id=$1 AND owner_id=$2',[id,request.authUser!.id])).rows[0];if(!current)throw app.httpErrors.notFound();if(body.kind&&body.kind!==current.kind&&(await db.query('SELECT 1 FROM resources WHERE credential_id=$1 LIMIT 1',[id])).rowCount)throw app.httpErrors.badRequest('CREDENTIAL_KIND_IN_USE');const payload=body.secret?encryptSecret(body.secret,config.MASTER_KEY):current.payload;const row=(await db.query('UPDATE credentials SET name=$1,username=$2,kind=$3,payload=$4,expires_at=$5,updated_at=now() WHERE id=$6 RETURNING *',[body.name??current.name,body.username??current.username,body.kind??current.kind,payload,body.expiresAt===undefined?current.expires_at:body.expiresAt,id])).rows[0];return cleanCredential(row);});
app.delete('/api/v1/credentials/:id', { preHandler:[authenticate,requireCsrf] }, async request => {const id=z.string().uuid().parse((request.params as {id:string}).id);const result=await db.query('DELETE FROM credentials WHERE id=$1 AND owner_id=$2',[id,request.authUser!.id]);if(!result.rowCount)throw app.httpErrors.notFound();return {ok:true};});

app.get('/api/v1/resources', { preHandler: authenticate }, async request => (await db.query(`SELECT DISTINCT r.* FROM resources r LEFT JOIN resource_permissions p ON p.resource_id=r.id AND p.user_id=$1 WHERE r.owner_id=$1 OR p.permission IN ('use','manage') ORDER BY r.position,r.name`,[request.authUser!.id])).rows.map(cleanResource));
app.post('/api/v1/network/scan', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } }, preHandler: [authenticate, requireCsrf] }, async request => {
  const body=z.object({cidr:z.string().max(32),web:z.boolean().default(true),ssh:z.boolean().default(true),rdp:z.boolean().default(true),ports:z.array(z.number().int().min(1).max(65535)).max(16).default([])}).parse(request.body);
  const ports=[...new Set([...(body.web?[80,443,8080,8443]:[]),...(body.ssh?[22]:[]),...(body.rdp?[3389]:[]),...body.ports])].sort((a,b)=>a-b);
  if(!ports.length)throw app.httpErrors.badRequest('SCAN_PORTS_REQUIRED');
  try{return {results:await scanPrivateNetwork(body.cidr,ports)};}catch(error){const code=error instanceof Error&&/^CIDR_/.test(error.message)?error.message:'SCAN_FAILED';throw app.httpErrors.badRequest(code);}
});
const scanScheduleInput=z.object({enabled:z.boolean(),cidr:z.string().max(32),web:z.boolean(),ssh:z.boolean(),rdp:z.boolean(),ports:z.array(z.number().int().min(1).max(65535)).max(16),runTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),timezone:z.string().min(1).max(80)});
app.get('/api/v1/network/schedule', { preHandler:authenticate }, async request => {
  const row=(await db.query('SELECT * FROM network_scan_settings WHERE user_id=$1',[request.authUser!.id])).rows[0];
  return row?{enabled:row.enabled,cidr:row.cidr,web:row.scan_web,ssh:row.scan_ssh,rdp:row.scan_rdp,ports:row.custom_ports,runTime:row.run_time,timezone:row.timezone,lastRunAt:row.last_run_at,lastError:row.last_error}:{enabled:false,cidr:'192.168.1.0/24',web:true,ssh:true,rdp:true,ports:[],runTime:'03:00',timezone:'Europe/Berlin',lastRunAt:null,lastError:null};
});
app.put('/api/v1/network/schedule', { preHandler:[authenticate,requireCsrf] }, async request => {
  const body=scanScheduleInput.parse(request.body);try{expandPrivateCidr(body.cidr);}catch(error){throw app.httpErrors.badRequest(error instanceof Error?error.message:'CIDR_INVALID');}if(!scanPorts(body).length)throw app.httpErrors.badRequest('SCAN_PORTS_REQUIRED');if(!validTimezone(body.timezone))throw app.httpErrors.badRequest('TIMEZONE_INVALID');
  const row=(await db.query(`INSERT INTO network_scan_settings(user_id,enabled,cidr,scan_web,scan_ssh,scan_rdp,custom_ports,run_time,timezone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id) DO UPDATE SET enabled=$2,cidr=$3,scan_web=$4,scan_ssh=$5,scan_rdp=$6,custom_ports=$7,run_time=$8,timezone=$9,updated_at=now() RETURNING *`,[request.authUser!.id,body.enabled,body.cidr,body.web,body.ssh,body.rdp,body.ports,body.runTime,body.timezone])).rows[0];
  return {enabled:row.enabled,cidr:row.cidr,web:row.scan_web,ssh:row.scan_ssh,rdp:row.scan_rdp,ports:row.custom_ports,runTime:row.run_time,timezone:row.timezone,lastRunAt:row.last_run_at,lastError:row.last_error};
});
app.get('/api/v1/network/discoveries', { preHandler:authenticate }, async request => ({results:(await db.query('SELECT ip,hostname,port,service,suggested_type AS "suggestedType",scheme,discovered_at AS "discoveredAt" FROM network_scan_discoveries WHERE user_id=$1 ORDER BY discovered_at DESC,ip,port',[request.authUser!.id])).rows}));
app.delete('/api/v1/network/discoveries', { preHandler:[authenticate,requireCsrf] }, async request => {const entries=z.array(z.object({ip:z.string().max(45),port:z.number().int().min(1).max(65535)})).max(512).parse(request.body);for(const entry of entries)await db.query('DELETE FROM network_scan_discoveries WHERE user_id=$1 AND ip=$2 AND port=$3',[request.authUser!.id,entry.ip,entry.port]);return {ok:true};});
app.post('/api/v1/resources', { preHandler: [authenticate, requireCsrf] }, async request => {
  const b=resourceInput.parse(request.body);if(b.secret&&b.credentialId)throw app.httpErrors.badRequest('MULTIPLE_CREDENTIAL_SOURCES');await validateCredentialAssignment(request.authUser!.id,b.type,b.config,b.credentialId); const client=await db.connect(); try { await client.query('BEGIN'); let secretId=null; if(b.secret){ secretId=(await client.query('INSERT INTO secrets(owner_id,payload) VALUES($1,$2) RETURNING id',[request.authUser!.id,encryptSecret(b.secret,config.MASTER_KEY)])).rows[0].id; } const r=(await client.query('INSERT INTO resources(type,name,notes,tags,category_id,icon,position,enabled,owner_id,config,secret_id,credential_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[b.type,b.name,b.notes,b.tags,b.categoryId??null,b.icon,b.position,b.enabled,request.authUser!.id,b.config,secretId,b.credentialId??null])).rows[0]; await client.query('COMMIT'); return cleanResource(r); } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
});
app.patch('/api/v1/resources/:id', { preHandler: [authenticate, requireCsrf] }, async request => {
  const id=z.string().uuid().parse((request.params as {id:string}).id); const old=await ownedResource(id,request.authUser!.id); if(old.owner_id!==request.authUser!.id && request.authUser!.role!=='admin') throw app.httpErrors.forbidden(); const b=resourceUpdate.parse(request.body); let nextConfig=old.config;
  if(b.config) nextConfig=resourceInput.parse({type:old.type,name:b.name??old.name,categoryId:b.categoryId===undefined?old.category_id:b.categoryId,icon:b.icon??old.icon,position:b.position??old.position,enabled:b.enabled??old.enabled,credentialId:b.credentialId===undefined?old.credential_id:b.credentialId,config:b.config}).config;
  const nextCredentialId=b.credentialId===undefined?old.credential_id:b.credentialId;if(b.secret&&nextCredentialId)throw app.httpErrors.badRequest('MULTIPLE_CREDENTIAL_SOURCES');await validateCredentialAssignment(old.owner_id,old.type,nextConfig,nextCredentialId);
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    let secretId=old.secret_id;
    if(b.secret){
      const payload=encryptSecret(b.secret,config.MASTER_KEY);
      if(secretId) await client.query('UPDATE secrets SET payload=$1,updated_at=now() WHERE id=$2 AND owner_id=$3',[payload,secretId,old.owner_id]);
      else secretId=(await client.query('INSERT INTO secrets(owner_id,payload) VALUES($1,$2) RETURNING id',[old.owner_id,payload])).rows[0].id;
    }
    const updated=(await client.query('UPDATE resources SET name=$1,notes=$2,tags=$3,category_id=$4,icon=$5,position=$6,enabled=$7,config=$8,secret_id=$9,credential_id=$10,updated_at=now() WHERE id=$11 RETURNING *',[b.name??old.name,b.notes??old.notes,b.tags??old.tags,b.categoryId===undefined?old.category_id:b.categoryId,b.icon??old.icon,b.position??old.position,b.enabled??old.enabled,nextConfig,secretId,nextCredentialId,id])).rows[0];
    await client.query('COMMIT');
    return cleanResource(updated);
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});
app.delete('/api/v1/resources/:id', { preHandler: [authenticate, requireCsrf] }, async request => { const id=z.string().uuid().parse((request.params as {id:string}).id); const r=await db.query('DELETE FROM resources WHERE id=$1 AND (owner_id=$2 OR $3=true)',[id,request.authUser!.id,request.authUser!.role==='admin']); if(!r.rowCount) throw app.httpErrors.notFound(); return {ok:true}; });
app.delete('/api/v1/tags/:tag', { preHandler: [authenticate, requireCsrf] }, async request => {
  const tag=z.string().trim().min(1).max(40).parse((request.params as {tag:string}).tag);
  const result=await db.query('UPDATE resources SET tags=array_remove(tags,$1),updated_at=now() WHERE owner_id=$2 AND $1=ANY(tags) RETURNING id',[tag,request.authUser!.id]);
  return {ok:true,resourceIds:result.rows.map(row=>String(row.id))};
});
app.post('/api/v1/resources/:id/duplicate', { preHandler:[authenticate,requireCsrf] }, async request => {
  const source=await ownedResource(z.string().uuid().parse((request.params as {id:string}).id),request.authUser!.id);
  if(source.owner_id!==request.authUser!.id&&request.authUser!.role!=='admin')throw app.httpErrors.forbidden();
  const duplicateConfig=source.type==='web'&&source.config.authType==='basic'?{...source.config,authType:'none'}:source.config;
  const row=(await db.query(`INSERT INTO resources(type,name,notes,tags,category_id,icon,position,enabled,owner_id,config,secret_id,credential_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL) RETURNING *`,[source.type,`${source.name} (Kopie)`,source.notes,source.tags,source.category_id,source.icon,source.position+1,source.enabled,request.authUser!.id,duplicateConfig])).rows[0];
  return cleanResource(row);
});

app.post('/api/v1/resources/:id/test', { preHandler: [authenticate, requireCsrf] }, async request => { const resource=await ownedResource(z.string().uuid().parse((request.params as {id:string}).id),request.authUser!.id); if(resource.type==='web') return {ok:true,code:'WEB_URL_VALID',message:'URL validiert; iframe-Freigabe entscheidet der Zielserver im Browser.'}; const c=resource.config; const result=await new Promise<{ok:boolean;code:string;message:string}>(resolve=>{const socket=net.createConnection({host:c.host,port:c.port}); const done=(v:{ok:boolean;code:string;message:string})=>{socket.destroy();resolve(v)}; socket.setTimeout(3000); socket.once('connect',()=>done({ok:true,code:'TCP_REACHABLE',message:'Zielport erreichbar.'})); socket.once('timeout',()=>done({ok:false,code:'TIMEOUT',message:'Zeitüberschreitung beim Verbindungsaufbau.'})); socket.once('error',()=>done({ok:false,code:'UNREACHABLE',message:'Ziel nicht erreichbar.'}));}); return result; });

app.route({
  method: ['GET','POST','PUT','PATCH','DELETE'],
  url: '/api/v1/resources/:id/web-proxy/*',
  preHandler: authenticate,
  handler: async (request, reply) => {
    const params=z.object({id:z.string().uuid(),'*':z.string()}).parse(request.params);
    const resource=await ownedResource(params.id,request.authUser!.id);
    const basicAuth=resource.type==='web'&&resource.config.authType==='basic';
    if(resource.type!=='web'||(resource.config.mode!=='proxy'&&!basicAuth))throw app.httpErrors.notFound('WEB_PROXY_NOT_CONFIGURED');
    let username:string|undefined;let password:string|undefined;
    if(basicAuth){if(!resource.credential_id)throw app.httpErrors.badRequest('CREDENTIAL_REQUIRED');const credential=(await db.query('SELECT username,kind,payload,expires_at FROM credentials WHERE id=$1 AND owner_id=$2',[resource.credential_id,resource.owner_id])).rows[0];if(!credential||credential.kind!=='password')throw app.httpErrors.badRequest('CREDENTIAL_REQUIRED');if(credential.expires_at&&new Date(credential.expires_at)<=new Date())throw app.httpErrors.badRequest('CREDENTIAL_EXPIRED');username=credential.username;password=decryptSecret(credential.payload,config.MASTER_KEY);}
    const queryIndex=request.raw.url?.indexOf('?')??-1;
    const query=queryIndex>=0?request.raw.url!.slice(queryIndex):'';
    const target=buildProxyTarget(String(resource.config.url),params['*'],query);
    const body=request.body===undefined?undefined:Buffer.isBuffer(request.body)?request.body:Buffer.from(typeof request.body==='string'?request.body:JSON.stringify(request.body));
    try {
      const upstream=await requestProxyTarget(target,request.method,{username,password,cookie:proxyRequestCookies(request.headers.cookie),ignoreCertificate:resource.config.ignoreCertificate===true},body,request.headers['content-type']);
      const base=proxyBasePath(params.id);
      if(upstream.statusCode>=300&&upstream.statusCode<400&&upstream.headers.location){
        const location=rewriteProxyLocation(upstream.headers.location,target,base);
        if(!location)throw app.httpErrors.badGateway('WEB_PROXY_CROSS_ORIGIN_REDIRECT');
        reply.header('location',location);
      }
      if(upstream.statusCode===401||upstream.statusCode===403)return reply.code(502).type('text/plain; charset=utf-8').send('HTTP-Basic-Anmeldung fehlgeschlagen. Credential prüfen.');
      const contentType=String(upstream.headers['content-type']??'application/octet-stream');
      const targetCookies=rewriteProxySetCookies(upstream.headers['set-cookie'],base);if(targetCookies.length)reply.header('set-cookie',targetCookies);
      let responseBody:Buffer|string=upstream.body;
      if(contentType.includes('text/html'))responseBody=rewriteProxyHtml(upstream.body.toString('utf8'),target,base);
      else if(contentType.includes('text/css'))responseBody=rewriteProxyCss(upstream.body.toString('utf8'),target,base);
      reply.removeHeader('x-frame-options');
      reply.header('content-type',contentType);
      reply.header('cache-control','no-store');
      reply.header('content-security-policy',"default-src 'self' http: https: data: blob:; script-src 'self' http: https: 'unsafe-inline' 'unsafe-eval'; style-src 'self' http: https: 'unsafe-inline'; img-src 'self' http: https: data: blob:; connect-src 'self' http: https: ws: wss:; frame-ancestors 'self'");
      return reply.code(upstream.statusCode).send(responseBody);
    } catch(error) {
      request.log.warn({resourceId:params.id,reason:error instanceof Error?error.message:'unknown'},'Web proxy request failed');
      if(error&&typeof error==='object'&&'statusCode'in error)throw error;
      return reply.code(502).send({error:'WEB_PROXY_FAILED',message:error instanceof Error?error.message:'Proxy-Anfrage fehlgeschlagen.'});
    }
  }
});

function encryptGuacToken(value: unknown): string { const key=Buffer.from(config.GUAC_TOKEN_KEY.padEnd(32,'0').slice(0,32)); const iv=crypto.randomBytes(16); const cipher=crypto.createCipheriv('aes-256-cbc',key,iv); let encrypted=cipher.update(JSON.stringify(value),'utf8','base64'); encrypted+=cipher.final('base64'); return Buffer.from(JSON.stringify({iv:iv.toString('base64'),value:encrypted})).toString('base64'); }
function decryptGuacToken(token:string):any { const key=Buffer.from(config.GUAC_TOKEN_KEY.padEnd(32,'0').slice(0,32));const wrapped=JSON.parse(Buffer.from(token,'base64').toString('utf8'));const decipher=crypto.createDecipheriv('aes-256-cbc',key,Buffer.from(wrapped.iv,'base64'));let plain=decipher.update(wrapped.value,'base64','utf8');plain+=decipher.final('utf8');return JSON.parse(plain); }
const unusedTickets=new Set<string>();
app.post('/api/v1/resources/:id/connect', { preHandler: [authenticate, requireCsrf] }, async request => {
  const resource=await ownedResource(z.string().uuid().parse((request.params as {id:string}).id),request.authUser!.id);
  if(resource.type==='web') throw app.httpErrors.badRequest('NOT_REMOTE_RESOURCE');
  try {
    const body=z.object({secret:z.string().max(16384).optional(),credentialId:z.string().uuid().optional(),width:z.number().int().min(320).max(7680).default(1280),height:z.number().int().min(200).max(4320).default(720),cols:z.number().int().min(2).max(1000).default(80),rows:z.number().int().min(1).max(1000).default(24)}).parse(request.body??{});
    let secret=body.secret;let credentialUsername:string|undefined;
    const selectedCredentialId=body.credentialId??resource.credential_id;
    if(selectedCredentialId){const credentialOwner=body.credentialId?request.authUser!.id:resource.owner_id;const row=(await db.query('SELECT payload,username,kind,expires_at FROM credentials WHERE id=$1 AND owner_id=$2',[selectedCredentialId,credentialOwner])).rows[0];if(!row)throw app.httpErrors.badRequest('CREDENTIAL_NOT_FOUND');if(row.expires_at&&new Date(row.expires_at)<=new Date())throw app.httpErrors.badRequest('CREDENTIAL_EXPIRED');const expected=resource.type==='ssh'&&resource.config.authType==='private_key'?'private_key':'password';if(row.kind!==expected)throw app.httpErrors.badRequest('CREDENTIAL_TYPE_MISMATCH');if(!secret)secret=decryptSecret(row.payload,config.MASTER_KEY);credentialUsername=row.username||undefined;}
    if(!secret&&resource.secret_id){const row=(await db.query('SELECT payload FROM secrets WHERE id=$1 AND owner_id=$2',[resource.secret_id,resource.owner_id])).rows[0]; if(row) secret=decryptSecret(row.payload,config.MASTER_KEY);}
    const c=resource.config;const username=remoteUsername(resource.type,credentialUsername,c.username);
    if(!secret) throw app.httpErrors.badRequest('CREDENTIAL_REQUIRED');
    const audit=(await db.query('INSERT INTO connection_audit(user_id,resource_id,resource_name,protocol,ok,code) VALUES($1,$2,$3,$4,false,$5) RETURNING id',[request.authUser!.id,resource.id,resource.name,resource.type,'TICKET_ISSUED'])).rows[0];
    if(resource.type==='ssh'){
      const token=sshTickets.issue({userId:request.authUser!.id,auditId:audit.id,host:c.host,port:c.port,username,authType:c.authType,secret,verifyHostKey:c.verifyHostKey!==false,hostKey:c.hostKeyFingerprint??'',cols:body.cols,rows:body.rows});
      return {token,expiresIn:30,protocol:'ssh'};
    }
    const settings:Record<string,unknown>={hostname:c.host,port:String(c.port),username,password:secret,'ignore-cert':false,width:body.width,height:body.height,dpi:96,audio:['audio/L16'],image:['image/png','image/jpeg'],timezone:'Europe/Berlin'};
    applyRdpSettings(settings,c);
    const nonce=randomToken(18);unusedTickets.add(nonce);setTimeout(()=>unusedTickets.delete(nonce),31_000).unref();
    const token=encryptGuacToken({expiration:Date.now()+30_000,userId:request.authUser!.id,nonce,auditId:audit.id,connection:{type:resource.type,settings}});
    return {token,expiresIn:30,protocol:resource.type};
  } catch(error) {
    const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'CONNECT_FAILED';
    await db.query('INSERT INTO connection_audit(user_id,resource_id,resource_name,protocol,ok,code) VALUES($1,$2,$3,$4,false,$5)',[request.authUser!.id,resource.id,resource.name,resource.type,code]);
    throw error;
  }
});

app.get('/api/v1/audit', { preHandler:authenticate }, async request => ({events:(await db.query(`SELECT a.id,a.resource_id,a.resource_name,a.protocol,a.ok,a.code,a.created_at,u.username FROM connection_audit a JOIN users u ON u.id=a.user_id WHERE a.user_id=$1 ORDER BY a.created_at DESC LIMIT 200`,[request.authUser!.id])).rows.map(row=>({id:row.id,resourceId:row.resource_id,resourceName:row.resource_name,protocol:row.protocol,ok:row.ok,code:row.code,createdAt:row.created_at,username:row.username}))}));

app.get('/api/v1/preferences', { preHandler: authenticate }, async request => ({data:(await db.query('SELECT data FROM user_preferences WHERE user_id=$1',[request.authUser!.id])).rows[0]?.data??{}}));
app.put('/api/v1/preferences', { preHandler: [authenticate, requireCsrf] }, async request => {const data=z.record(z.string(),z.unknown()).parse(request.body);await db.query('INSERT INTO user_preferences(user_id,data) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET data=$2,updated_at=now()',[request.authUser!.id,data]);return {data};});

async function bootstrap() { await migrate(db); startScheduledScanner(db,app.log); if(config.ADMIN_INITIAL_PASSWORD){const found=await db.query('SELECT 1 FROM users LIMIT 1');if(!found.rowCount){await db.query('INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3)',[config.ADMIN_USERNAME,await argon2.hash(config.ADMIN_INITIAL_PASSWORD,{type:argon2.argon2id}), 'admin']);app.log.warn('Initial admin created; remove ADMIN_INITIAL_PASSWORD from the environment');}} const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../frontend/dist'); await app.register(staticPlugin,{root:publicDir,wildcard:false});app.setNotFoundHandler((request,reply)=>request.url.startsWith('/api/')?reply.code(404).send({error:'NOT_FOUND'}):reply.sendFile('index.html')); await app.listen({host:'0.0.0.0',port:config.PORT}); attachSshTunnel(app.server,{origin:config.APP_ORIGIN,tickets:sshTickets,authenticate:async request=>{const cookies=Object.fromEntries(String(request.headers.cookie??'').split(';').map(value=>{const [name,...parts]=value.trim().split('=');return [name,parts.join('=')];}));const session=cookies.homeops_session;if(!session)return undefined;const user=(await db.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()',[sha256(session)])).rows[0];return user?{userId:user.user_id}:undefined;},updateAudit:async(auditId,userId,ok,code)=>{await db.query('UPDATE connection_audit SET ok=$1,code=$2 WHERE id=$3 AND user_id=$4',[ok,code,auditId,userId]);},log:app.log}); const verifyClient=(info:any,done:(ok:boolean,code?:number,message?:string)=>void)=>{void(async()=>{try{if(info.origin!==config.APP_ORIGIN)throw new Error('origin');const cookies=Object.fromEntries(String(info.req.headers.cookie??'').split(';').map((v:string)=>v.trim().split('=')));const session=cookies.homeops_session;if(!session)throw new Error('session');const user=(await db.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()',[sha256(session)])).rows[0];if(!user)throw new Error('session');const token=new URL(info.req.url,'http://local').searchParams.get('token');if(!token)throw new Error('ticket');const ticket=decryptGuacToken(token);if(ticket.expiration<Date.now()||ticket.userId!==user.user_id||!unusedTickets.delete(ticket.nonce))throw new Error('ticket');if(ticket.auditId)await db.query('UPDATE connection_audit SET ok=true,code=$1 WHERE id=$2 AND user_id=$3',['TUNNEL_OPENED',ticket.auditId,user.user_id]);done(true)}catch(error){app.log.warn({reason:error instanceof Error?error.message:'unknown'},'Rejected Guacamole WebSocket');done(false,403,'Forbidden')}})()}; new GuacamoleLite({server:app.server,path:'/api/v1/tunnel',verifyClient}, {host:config.GUACD_HOST,port:config.GUACD_PORT}, {crypt:{cypher:'AES-256-CBC',key:config.GUAC_TOKEN_KEY.padEnd(32,'0').slice(0,32)}}, {processConnectionSettings:(settings:any,callback:any)=>settings.expiration<Date.now()?callback(new Error('Ticket expired')):callback(null,settings)}); }
bootstrap().catch(error=>{app.log.error(error);process.exit(1)});
