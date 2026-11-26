import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachSshTunnel, isSshTunnelRequest, knownHostKeyMatches, SshTicketStore } from './ssh-tunnel.js';

describe('SSH tunnel path', () => {
  it('uses the established tunnel prefix and keeps the initial path as an alias', () => {
    expect(isSshTunnelRequest(new URL('https://homeops.test/api/v1/tunnel?transport=ssh&token=x'))).toBe(true);
    expect(isSshTunnelRequest(new URL('https://homeops.test/api/v1/tunnel/ssh?token=x'))).toBe(true);
    expect(isSshTunnelRequest(new URL('https://homeops.test/api/v1/ssh?token=x'))).toBe(true);
    expect(isSshTunnelRequest(new URL('https://homeops.test/api/v1/tunnel?token=x'))).toBe(false);
  });

  it('upgrades an authenticated SSH connection on the exact shared tunnel path', async () => {
    const server=createServer();
    const tickets=new SshTicketStore();
    const auditCodes:string[]=[];
    const tunnel=attachSshTunnel(undefined,{origin:'http://homeops.test',tickets,authenticate:async()=>({userId:'user-1'}),updateAudit:async(_auditId,_userId,_ok,code)=>{auditCodes.push(code);},log:{warn(){}}});
    server.on('upgrade',(request,socket,head)=>tunnel.accepts(request)?tunnel.handleUpgrade(request,socket,head):socket.destroy());
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Test server did not bind to TCP');
    const token=tickets.issue({userId:'user-1',auditId:'audit-1',host:'127.0.0.1',port:1,username:'test',authType:'password',secret:'test',verifyHostKey:false,hostKey:'',cols:80,rows:24});
    const socket=new WebSocket(`ws://127.0.0.1:${address.port}/api/v1/tunnel?transport=ssh&token=${token}`,{origin:'http://homeops.test'});
    try {
      await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
      expect(socket.readyState).toBe(WebSocket.OPEN);
      await new Promise(resolve=>setTimeout(resolve,10));
      expect(auditCodes).toContain('SSH_TUNNEL_OPENED');
    } finally {
      socket.close();
      await new Promise<void>(resolve=>server.close(()=>resolve()));
      tunnel.webSockets.close();
    }
  });
});

describe('SSH tunnel tickets', () => {
  const ticket = { userId: 'user-1', auditId: 'audit-1', host: 'server.lan', port: 22, username: 'root', authType: 'password' as const, secret: 'secret', verifyHostKey: true, hostKey: 'server.lan ssh-ed25519 AQID', cols: 80, rows: 24 };

  it('consumes a ticket exactly once and binds it to the user', () => {
    const store = new SshTicketStore();
    const token = store.issue(ticket);
    expect(store.consume(token, 'other-user')).toBeUndefined();
    expect(store.consume(token, 'user-1')).toBeUndefined();
  });

  it('returns the ticket to the intended user', () => {
    const store = new SshTicketStore();
    const token = store.issue(ticket);
    expect(store.consume(token, 'user-1')).toMatchObject(ticket);
    expect(store.consume(token, 'user-1')).toBeUndefined();
  });
});

describe('SSH host key verification', () => {
  it('compares the key blob from known_hosts in constant time', () => {
    expect(knownHostKeyMatches('[server.lan]:22 ssh-ed25519 AQIDBA==', Buffer.from([1, 2, 3, 4]))).toBe(true);
    expect(knownHostKeyMatches('[server.lan]:22 ssh-ed25519 AQIDBA==', Buffer.from([1, 2, 3, 5]))).toBe(false);
    expect(knownHostKeyMatches('invalid', Buffer.from([1, 2, 3, 4]))).toBe(false);
  });
});
