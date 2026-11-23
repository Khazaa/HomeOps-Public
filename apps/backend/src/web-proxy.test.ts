import { describe, expect, it } from 'vitest';
import { buildProxyTarget, isPrivateAddress, rewriteProxyHtml, rewriteProxyLocation } from './web-proxy.js';

describe('web basic auth proxy', () => {
  it('accepts LAN addresses and rejects loopback, link-local metadata and public targets', () => {
    expect(isPrivateAddress('192.168.50.10')).toBe(true);
    expect(isPrivateAddress('10.2.3.4')).toBe(true);
    expect(isPrivateAddress('172.31.4.5')).toBe(true);
    expect(isPrivateAddress('127.0.0.1')).toBe(false);
    expect(isPrivateAddress('169.254.169.254')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('keeps every proxied request on the configured origin', () => {
    expect(buildProxyTarget('http://192.168.50.10/admin/', '', '?view=1').href).toBe('http://192.168.50.10/admin/?view=1');
    expect(buildProxyTarget('http://192.168.50.10/admin/', 'assets/app.js', '?v=2').href).toBe('http://192.168.50.10/assets/app.js?v=2');
  });

  it('rewrites same-origin links and leaves external links untouched', () => {
    const target = new URL('http://192.168.50.10/admin/index.html');
    const html = '<html><head></head><body><img src="/logo.png"><a href="settings">Settings</a><a href="https://example.com/">External</a></body></html>';
    const rewritten = rewriteProxyHtml(html, target, '/proxy/');
    expect(rewritten).toContain('<base href="/proxy/admin/">');
    expect(rewritten).toContain('src="/proxy/logo.png"');
    expect(rewritten).toContain('href="/proxy/admin/settings"');
    expect(rewritten).toContain('href="https://example.com/"');
  });

  it('blocks cross-origin redirects from receiving credentials', () => {
    const target = new URL('http://192.168.50.10/');
    expect(rewriteProxyLocation('/login', target, '/proxy/')).toBe('/proxy/login');
    expect(rewriteProxyLocation('http://192.168.50.11/login', target, '/proxy/')).toBeNull();
  });
});
