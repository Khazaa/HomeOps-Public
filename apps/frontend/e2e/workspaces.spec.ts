import { expect, test } from '@playwright/test';

const password = process.env.HOMEOPS_NOACCESS_PASSWORD;

test('workspace tabs group open resources without remounting them', async ({ page, baseURL }) => {
  test.skip(!password, 'HOMEOPS_NOACCESS_PASSWORD is required');
  await page.goto('/');
  await page.getByLabel('Benutzername').fill('acceptance-noaccess');
  await page.getByLabel('Passwort').fill(password!);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByPlaceholder('Suchen …')).toBeVisible();

  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'homeops_csrf')?.value;
  expect(csrf).toBeTruthy();
  const headers = { 'x-csrf-token': csrf!, origin: baseURL! };
  const api = page.context().request;
  const originalPreferences = await (await api.get('/api/v1/preferences')).json();
  const suffix = crypto.randomUUID().slice(0, 8);
  const resource = await (await api.post('/api/v1/resources', {
    headers,
    data: {
      type: 'web', name: `Workspace Resource ${suffix}`, notes: '', tags: [], categoryId: null, icon: 'link', position: 0, enabled: true,
      config: { url: `${baseURL}/fixture.html`, mode: 'embedded', sandbox: 'allow-forms allow-scripts allow-same-origin' }
    }
  })).json();

  try {
    await page.reload();
    const workspaceBar = page.getByRole('navigation', { name: 'Arbeitsbereiche' });
    const inbox = workspaceBar.getByRole('button', { name: /Ablage/ });
    await expect(inbox).toHaveAttribute('aria-current', 'page');
    const row = page.locator('section.resource-group').filter({ hasText: 'Ohne Kategorie' }).locator('.resource').filter({ hasText: resource.name });
    const recentSaved = page.waitForResponse(response => response.url().endsWith('/api/v1/preferences') && response.request().method() === 'PUT');
    await row.locator('.resource-main').click();
    await recentSaved;
    const frame = page.locator(`iframe[title="${resource.name}"]`);
    await frame.contentFrame().locator('#state-input').fill('bleibt erhalten');

    const workspaceName = `Monitoring ${suffix}`;
    const created = page.waitForResponse(response => response.url().endsWith('/api/v1/preferences') && response.request().method() === 'PUT');
    page.once('dialog', dialog => void dialog.accept(workspaceName));
    await workspaceBar.getByRole('button', { name: 'Arbeitsbereich anlegen' }).click();
    await created;
    const workspaceButton = workspaceBar.getByRole('button', { name: new RegExp(workspaceName) });
    await expect(workspaceButton).toHaveAttribute('aria-current', 'page');

    await inbox.click();
    const resourceTab = page.getByRole('navigation', { name: 'Ressourcen-Tabs' }).getByRole('button', { name: new RegExp(resource.name) });
    const moved = page.waitForResponse(response => response.url().endsWith('/api/v1/preferences') && response.request().method() === 'PUT');
    await resourceTab.dragTo(workspaceButton);
    await moved;
    await expect(workspaceButton).toHaveAttribute('aria-current', 'page');
    await expect(resourceTab).toBeVisible();
    await expect(frame.contentFrame().locator('#state-input')).toHaveValue('bleibt erhalten');
    await expect.poll(async () => {
      const stored = await (await api.get('/api/v1/preferences')).json();
      return stored.data.workspaces?.find((workspace: { name: string }) => workspace.name === workspaceName)?.resourceIds;
    }).toContain(resource.id);

    await inbox.click();
    await expect(resourceTab).toHaveCount(0);
    await workspaceButton.click();
    await expect(resourceTab).toBeVisible();
    await expect(frame.contentFrame().locator('#state-input')).toHaveValue('bleibt erhalten');
    await page.reload();
    await expect(workspaceButton).toHaveAttribute('aria-current', 'page');
    await expect(resourceTab).toBeVisible();

    await workspaceBar.getByRole('button', { name: 'Arbeitsbereiche verwalten' }).click();
    const manager = page.locator('.workspace-manager');
    const workspaceRow = manager.locator('.workspace-row').filter({ hasText: workspaceName });
    const renamedName = `Server ${suffix}`;
    const renamed = page.waitForResponse(response => response.url().endsWith('/api/v1/preferences') && response.request().method() === 'PUT');
    page.once('dialog', dialog => void dialog.accept(renamedName));
    await workspaceRow.getByRole('button', { name: 'Umbenennen' }).click();
    await renamed;
    await expect(manager.locator('.workspace-row').filter({ hasText: renamedName })).toBeVisible();
    const deleted = page.waitForResponse(response => response.url().endsWith('/api/v1/preferences') && response.request().method() === 'PUT');
    page.once('dialog', dialog => void dialog.accept());
    await manager.locator('.workspace-row').filter({ hasText: renamedName }).getByRole('button', { name: 'Löschen' }).click();
    await deleted;
    await manager.getByRole('button', { name: 'Schließen' }).click();
    await expect(workspaceBar.getByRole('button', { name: new RegExp(renamedName) })).toHaveCount(0);
    await expect(inbox).toHaveAttribute('aria-current', 'page');
    await expect(resourceTab).toBeVisible();
  } finally {
    await api.delete(`/api/v1/resources/${resource.id}`, { headers });
    await api.put('/api/v1/preferences', { headers, data: originalPreferences.data });
  }
});
