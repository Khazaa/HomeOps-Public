import crypto from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2';
import { WebSocket, WebSocketServer } from 'ws';

export interface SshTicket {
  userId: string;
  auditId: string;
  expiresAt: number;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'private_key';
  secret: string;
  verifyHostKey: boolean;
  hostKey: string;
  cols: number;
  rows: number;
}

export class SshTicketStore {
  private readonly tickets = new Map<string, SshTicket>();

  issue(ticket: Omit<SshTicket, 'expiresAt'>, ttlMs = 30_000) {
    const token = crypto.randomBytes(32).toString('base64url');
    this.tickets.set(token, { ...ticket, expiresAt: Date.now() + ttlMs });
    const timer = setTimeout(() => this.tickets.delete(token), ttlMs + 1_000);
    timer.unref();
    return token;
  }

  consume(token: string, userId: string) {
    const ticket = this.tickets.get(token);
    this.tickets.delete(token);
    if (!ticket || ticket.userId !== userId || ticket.expiresAt < Date.now()) return undefined;
    return ticket;
  }
}

export function knownHostKeyMatches(expected: string, actual: Buffer) {
  const fields = expected.trim().split(/\s+/);
  const encoded = fields.length >= 3 ? fields[2] : fields.at(-1);
  if (!encoded) return false;
  let expectedKey: Buffer;
  try { expectedKey = Buffer.from(encoded, 'base64'); }
  catch { return false; }
  return expectedKey.length === actual.length && crypto.timingSafeEqual(expectedKey, actual);
}

type UpgradeIdentity = { userId: string };
type TunnelDependencies = {
  origin: string;
  tickets: SshTicketStore;
  authenticate(request: IncomingMessage): Promise<UpgradeIdentity | undefined>;
  updateAudit(auditId: string, userId: string, ok: boolean, code: string): Promise<void>;
  log: { warn(data: unknown, message: string): void };
};

export function isSshTunnelRequest(url: URL) {
  return (url.pathname === '/api/v1/tunnel' && url.searchParams.get('transport') === 'ssh') || url.pathname === '/api/v1/tunnel/ssh' || url.pathname === '/api/v1/ssh';
}

function send(socket: WebSocket, message: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function closeUpgrade(socket: Duplex, status = '403 Forbidden') {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function attachSshTunnel(server: HttpServer | undefined, dependencies: TunnelDependencies) {
  const webSockets = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });

  const accepts = (request: IncomingMessage) => isSshTunnelRequest(new URL(request.url ?? '/', 'http://local'));
  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://local');
    if (!isSshTunnelRequest(url)) return;
    void (async () => {
      try {
        if (request.headers.origin !== dependencies.origin) return closeUpgrade(socket);
        const identity = await dependencies.authenticate(request);
        const token = url.searchParams.get('token');
        const ticket = identity && token ? dependencies.tickets.consume(token, identity.userId) : undefined;
        if (!identity || !ticket) return closeUpgrade(socket);
        webSockets.handleUpgrade(request, socket, head, webSocket => {
          webSockets.emit('connection', webSocket, request, ticket);
        });
      } catch (error) {
        dependencies.log.warn({ reason: error instanceof Error ? error.message : 'unknown' }, 'Rejected SSH WebSocket');
        closeUpgrade(socket);
      }
    })();
  };
  server?.on('upgrade', (request, socket, head) => handleUpgrade(request, socket, head));

  webSockets.on('connection', (webSocket: WebSocket, _request: IncomingMessage, ticket: SshTicket) => {
    const ssh = new Client();
    let channel: ClientChannel | undefined;
    let finished = false;
    const finishAudit = (ok: boolean, code: string) => {
      if (finished) return;
      finished = true;
      void dependencies.updateAudit(ticket.auditId, ticket.userId, ok, code);
    };
    const fail = (code: string, message: string) => {
      send(webSocket, { type: 'error', code, message });
      finishAudit(false, code);
      webSocket.close(1011, code);
      ssh.end();
    };

    void dependencies.updateAudit(ticket.auditId, ticket.userId, false, 'SSH_TUNNEL_OPENED');
    webSocket.on('message', raw => {
      const payload = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      if (payload.byteLength > 128 * 1024) return fail('SSH_MESSAGE_TOO_LARGE', 'SSH-Eingabe ist zu groß.');
      try {
        const message = JSON.parse(payload.toString()) as { type?: unknown; data?: unknown; cols?: unknown; rows?: unknown };
        if (message.type === 'data' && typeof message.data === 'string' && message.data.length <= 65_536) channel?.write(message.data);
        else if (message.type === 'resize' && Number.isInteger(message.cols) && Number.isInteger(message.rows)) {
          const cols = Number(message.cols); const rows = Number(message.rows);
          if (cols >= 2 && cols <= 1_000 && rows >= 1 && rows <= 1_000) channel?.setWindow(rows, cols, 0, 0);
        }
      } catch { send(webSocket, { type: 'error', code: 'SSH_MESSAGE_INVALID', message: 'Ungültige SSH-Nachricht.' }); }
    });
    webSocket.once('close', () => { channel?.close(); ssh.end(); });
    webSocket.once('error', () => ssh.end());

    ssh.on('ready', () => {
      ssh.shell({ term: 'xterm-256color', cols: ticket.cols, rows: ticket.rows }, (error, stream) => {
        if (error) return fail('SSH_SHELL_FAILED', 'Die interaktive SSH-Shell konnte nicht geöffnet werden.');
        channel = stream;
        stream.setEncoding('utf8');
        stream.on('data', (data: string) => send(webSocket, { type: 'data', data }));
        stream.stderr.setEncoding('utf8');
        stream.stderr.on('data', (data: string) => send(webSocket, { type: 'data', data }));
        stream.once('close', () => { send(webSocket, { type: 'exit' }); webSocket.close(1000, 'SSH session ended'); ssh.end(); });
        finishAudit(true, 'SSH_CONNECTED');
        send(webSocket, { type: 'ready' });
      });
    });
    ssh.on('error', error => {
      dependencies.log.warn({ resource: ticket.auditId, level: error.level }, 'SSH connection failed');
      fail(error.level === 'client-authentication' ? 'SSH_AUTH_FAILED' : 'SSH_CONNECTION_FAILED', error.level === 'client-authentication' ? 'SSH-Anmeldung fehlgeschlagen.' : 'SSH-Verbindung fehlgeschlagen.');
    });

    const connection: ConnectConfig = {
      host: ticket.host,
      port: ticket.port,
      username: ticket.username,
      readyTimeout: 15_000,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
      ...(ticket.authType === 'private_key' ? { privateKey: ticket.secret } : { password: ticket.secret }),
      ...(ticket.verifyHostKey ? { hostVerifier: (key: Buffer) => knownHostKeyMatches(ticket.hostKey, key) } : {})
    };
    ssh.connect(connection);
  });

  return { webSockets, accepts, handleUpgrade };
}
