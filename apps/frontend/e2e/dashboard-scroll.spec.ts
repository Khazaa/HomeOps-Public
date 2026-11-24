import { expect, test } from '@playwright/test';

test('dashboard exposes a visible indicator and scrolls in a real browser', async ({ page }) => {
  const resources = Array.from({ length: 26 }, (_, index) => ({
    id: `resource-${index}`,
    type: index % 3 === 0 ? 'rdp' : index % 3 === 1 ? 'ssh' : 'web',
    name: `Resource ${index + 1}`,
    notes: '',
    tags: [],
    categoryId: null,
    icon: 'link',
    position: index,
    enabled: true,
    hasSecret: false,
    hasLocalSecret: false,
    credentialId: null,
    config: index % 3 === 2 ? { url: `http://192.168.23.${index + 1}` } : { host: `192.168.23.${index + 1}`, port: index % 3 === 0 ? 3389 : 22 }
  }));
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/auth/me') return route.fulfill({ json: { user: { id: 'user-a', username: 'admin', role: 'admin' } } });
    if (pathname === '/api/v1/resources') return route.fulfill({ json: resources });
    if (pathname === '/api/v1/categories' || pathname === '/api/v1/credentials') return route.fulfill({ json: [] });
    if (pathname === '/api/v1/preferences') return route.fulfill({ json: { data: { recentResourceIds: resources.slice(0, 8).map(resource => resource.id) } } });
    if (pathname.endsWith('/test')) return route.fulfill({ json: { ok: true, code: 'OK', message: 'Erreichbar' } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1180, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  const area = page.locator('#homeops-dashboard');
  await expect(area).toBeVisible();
  const measurements = await area.evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight }));
  expect(measurements.scroll).toBeGreaterThan(measurements.client);
  await expect(page.getByRole('scrollbar', { name: 'Übersicht scrollen' })).toBeVisible();
  await area.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => area.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
});
