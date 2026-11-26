import { expect, test } from '@playwright/test';

const password = process.env.HOMEOPS_NOACCESS_PASSWORD;

test('finetuning interactions stay compact, unambiguous and persistent', async ({ page, baseURL }) => {
  test.skip(!password, 'HOMEOPS_NOACCESS_PASSWORD is required');
  await page.goto('/');
  await page.getByLabel('Benutzername').fill('acceptance-noaccess');
  await page.getByLabel('Passwort').fill(password!);
  await page.getByRole('button', { name: 'Anmelden' }).click();

  await expect(page.getByText('acceptance-noaccess', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
  expect((await page.request.get('/site.webmanifest')).ok()).toBeTruthy();
  expect((await page.request.get('/service-worker.js')).ok()).toBeTruthy();
  expect((await page.request.get('/pwa-192.png')).ok()).toBeTruthy();
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration()))).toBe(true);
  await expect(page.getByRole('button', { name: 'Zugangsdaten' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Benutzermenü' }).click();
  const menu = page.getByRole('menu', { name: 'Benutzermenü' });
  await expect(menu).toBeVisible();
  await expect(menu.getByLabel('Theme')).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Zugangsdaten' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Verbindungsverlauf' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Backup & Restore' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'App installieren' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Kennwort ändern' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Logout' })).toBeVisible();
  await menu.getByLabel('Theme').selectOption('light');
  await expect(menu).toBeHidden();
  const workspaceBar = page.getByRole('navigation', { name: 'Arbeitsbereiche' });
  await expect(workspaceBar.getByRole('button', { name: /Ablage/ })).toHaveAttribute('aria-current', 'page');
  await expect(workspaceBar.getByRole('button', { name: 'Arbeitsbereich anlegen' })).toBeVisible();
  await expect(workspaceBar.getByRole('button', { name: 'Arbeitsbereiche verwalten' })).toBeVisible();

  await page.keyboard.press('Control+K');
  await expect(page.getByLabel('Schnellstarter')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Schnellstarter')).toBeHidden();

  await page.getByRole('button', { name: 'Benutzermenü' }).click();
  await menu.getByRole('menuitem', { name: 'Zugangsdaten' }).click();
  await expect(page.getByLabel('Bezeichnung')).toBeVisible();
  await expect(page.getByLabel('Benutzername')).toBeVisible();
  await page.getByRole('button', { name: 'Schließen' }).click();

  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'homeops_csrf')?.value;
  expect(csrf).toBeTruthy();
  const api = page.context().request;
  const originalPreferences = await (await api.get('/api/v1/preferences')).json();
  const response = await api.post('/api/v1/credentials', {
    headers: { 'x-csrf-token': csrf!, origin: baseURL! },
    data: { name: 'Server A · root', username: 'root', kind: 'password', secret: 'Acceptance-only-secret' }
  });
  expect(response.ok()).toBeTruthy();
  const credential = await response.json();
  try {
    await page.reload();
    await page.getByRole('button', { name: 'Ressource', exact: true }).click();
    await page.getByLabel('Typ').selectOption('rdp');
    await expect(page.getByLabel('Anmeldequelle').locator('option[value="__new__"]')).toHaveText('＋ Neues globales Credential …');
    await page.getByLabel('Typ').selectOption('ssh');
    const select = page.getByLabel('Anmeldequelle');
    await expect(select.locator('option[value="__new__"]')).toHaveText('＋ Neu anlegen …');
    await expect(select.locator(`option[value="${credential.id}"]`)).toHaveText('Server A · root');
    await select.selectOption(credential.id);
    const username = page.getByRole('textbox', { name: 'Benutzer', exact: true });
    await expect(username).toHaveValue('root');
    await expect(username).toBeDisabled();
  } finally {
    await api.delete(`/api/v1/credentials/${credential.id}`, { headers: { 'x-csrf-token': csrf!, origin: baseURL! } });
  }

  const suffix = crypto.randomUUID().slice(0, 8);
  const globallyDeletedTag = `Global-${suffix}`;
  const sourceCategory = await (await api.post('/api/v1/categories', {
    headers: { 'x-csrf-token': csrf!, origin: baseURL! },
    data: { name: `Drag Source ${suffix}` }
  })).json();
  const targetCategory = await (await api.post('/api/v1/categories', {
    headers: { 'x-csrf-token': csrf!, origin: baseURL! },
    data: { name: `Drag Target ${suffix}` }
  })).json();
  const resource = await (await api.post('/api/v1/resources', {
    headers: { 'x-csrf-token': csrf!, origin: baseURL! },
    data: {
      type: 'web', name: `Drag Resource ${suffix}`, notes: `Notiz ${suffix}`, tags: [`Tag-${suffix}`, globallyDeletedTag], categoryId: sourceCategory.id, icon: 'link', position: 0, enabled: true,
      config: { url: `${baseURL}/fixture.html`, mode: 'embedded', sandbox: 'allow-forms allow-scripts allow-same-origin' }
    }
  })).json();
  const tagPeer = await (await api.post('/api/v1/resources', {
    headers: { 'x-csrf-token': csrf!, origin: baseURL! },
    data: {
      type: 'web', name: `Tag Peer ${suffix}`, notes: '', tags: [globallyDeletedTag], categoryId: targetCategory.id, icon: 'link', position: 0, enabled: true,
      config: { url: `${baseURL}/fixture.html`, mode: 'embedded', sandbox: 'allow-forms allow-scripts allow-same-origin' }
    }
  })).json();
  const duplicateResponse = await api.post(`/api/v1/resources/${resource.id}/duplicate`, { headers: { 'x-csrf-token': csrf!, origin: baseURL! } });
  expect(duplicateResponse.ok()).toBeTruthy();
  const duplicate = await duplicateResponse.json();
  expect(duplicate.name).toBe(`${resource.name} (Kopie)`);
  expect(duplicate.notes).toBe(resource.notes);
  expect(duplicate.tags).toEqual(resource.tags);
  expect(duplicate.credentialId).toBe(null);
  expect(duplicate.hasSecret).toBe(false);
  await api.delete(`/api/v1/resources/${duplicate.id}`, { headers: { 'x-csrf-token': csrf!, origin: baseURL! } });
  try {
    await page.reload();
    const sourceGroup = page.locator('section.resource-group').filter({ hasText: `Drag Source ${suffix}` });
    const sourceRow = sourceGroup.locator('.resource').filter({ hasText: `Drag Resource ${suffix}` });
    const recent = page.locator('section.smart-group').filter({ hasText: 'Zuletzt verwendet' });
    await sourceRow.locator('.resource-main').click();
    await expect(recent.getByRole('button', { name: 'Zuletzt verwendet ausklappen' })).toBeVisible();
    await expect(recent.locator('.resource')).toHaveCount(0);
    await recent.getByRole('button', { name: 'Zuletzt verwendet ausklappen' }).click();
    await expect(recent.locator('.resource').filter({ hasText: `Drag Resource ${suffix}` })).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('homeops.collapsedGroups') ?? '[]') as string[])).not.toContain('recent');
    await page.reload();
    await expect(recent.getByRole('button', { name: 'Zuletzt verwendet einklappen' })).toBeVisible();
    await recent.getByRole('button', { name: 'Zuletzt verwendet einklappen' }).click();
    await expect(recent.locator('.resource')).toHaveCount(0);
    await page.getByPlaceholder('Suchen …').fill(`Tag-${suffix}`);
    await expect(sourceRow).toBeVisible();
    await page.getByPlaceholder('Suchen …').fill('');
    await sourceRow.click({ button: 'right' });
    const resourceContextMenu = page.getByRole('menu', { name: `Aktionen für Drag Resource ${suffix}` });
    await expect(resourceContextMenu).toBeVisible();
    await expect(resourceContextMenu.getByRole('button', { name: 'Weiteren Tab öffnen' })).toBeVisible();
    await expect(resourceContextMenu.getByRole('button', { name: 'Ressource duplizieren' })).toBeVisible();
    await resourceContextMenu.getByLabel('Tags verwalten').click();
    await expect(resourceContextMenu.getByRole('checkbox', { name: `Tag-${suffix}` })).toBeChecked();
    const newTag = `Neu-${suffix}`;
    await resourceContextMenu.getByLabel('Neuen Tag anlegen').fill(newTag);
    await resourceContextMenu.getByRole('button', { name: 'Anlegen und zuweisen' }).click();
    await expect.poll(async () => {
      const list = await (await api.get('/api/v1/resources')).json();
      return list.find((entry: { id: string }) => entry.id === resource.id)?.tags;
    }).toContain(newTag);
    await expect(resourceContextMenu.getByRole('checkbox', { name: newTag })).toBeChecked();
    page.once('dialog', dialog => void dialog.accept());
    await resourceContextMenu.getByRole('button', { name: `Tag ${globallyDeletedTag} überall löschen` }).click();
    await expect.poll(async () => {
      const list = await (await api.get('/api/v1/resources')).json();
      return list.filter((entry: { id: string }) => [resource.id, tagPeer.id].includes(entry.id)).every((entry: { tags: string[] }) => !entry.tags.includes(globallyDeletedTag));
    }).toBe(true);
    await expect(resourceContextMenu.getByRole('checkbox', { name: globallyDeletedTag })).toHaveCount(0);
    await page.getByPlaceholder('Suchen …').click();
    await expect(resourceContextMenu).toBeHidden();
    const preferenceSaved = page.waitForResponse(response => response.url().endsWith('/api/v1/preferences') && response.request().method() === 'PUT');
    await sourceRow.getByLabel('Aktionen').click();
    await sourceRow.getByLabel('Tags verwalten').click();
    await expect(sourceRow.getByRole('checkbox', { name: `Tag-${suffix}` })).toBeChecked();
    await expect(sourceRow.getByRole('checkbox', { name: newTag })).toBeChecked();
    await sourceRow.getByRole('button', { name: 'Zu Favoriten hinzufügen' }).click();
    await preferenceSaved;
    const favorites = page.locator('section.smart-group').filter({ hasText: 'Favoriten' });
    await expect(favorites.locator('.resource').filter({ hasText: `Drag Resource ${suffix}` })).toBeVisible();
    await favorites.getByRole('button', { name: 'Favoriten einklappen' }).click();
    await expect(favorites.locator('.resource')).toHaveCount(0);
    await favorites.getByRole('button', { name: 'Favoriten ausklappen' }).click();
    await expect(favorites.locator('.resource').filter({ hasText: `Drag Resource ${suffix}` })).toBeVisible();
    await page.keyboard.press('Control+K');
    await page.getByLabel('Schnellstarter').fill(`Drag Resource ${suffix}`);
    await expect(page.locator('.command-results').getByRole('button', { name: new RegExp(`Drag Resource ${suffix}`) })).toBeVisible();
    await page.keyboard.press('Escape');
    const targetGroup = page.locator('section.resource-group').filter({ hasText: `Drag Target ${suffix}` });
    await targetGroup.getByRole('button', { name: `Gruppe Drag Target ${suffix} einklappen` }).click();
    const groupedSourceRow = page.locator('section.resource-group').filter({ hasText: `Drag Source ${suffix}` }).locator('.resource').filter({ hasText: `Drag Resource ${suffix}` });
    await groupedSourceRow.dragTo(targetGroup);
    await expect.poll(async () => {
      const list = await (await api.get('/api/v1/resources')).json();
      return list.find((entry: { id: string }) => entry.id === resource.id)?.categoryId;
    }).toBe(targetCategory.id);
    await targetGroup.getByRole('button', { name: `Gruppe Drag Target ${suffix} ausklappen` }).click();
    const movedRow = targetGroup.locator('.resource').filter({ hasText: `Drag Resource ${suffix}` });
    await expect(movedRow).toBeVisible();
    const uncategorized = page.locator('section.resource-group').filter({ hasText: 'Ohne Kategorie' });
    await uncategorized.getByRole('button', { name: 'Gruppe Ohne Kategorie einklappen' }).click();
    await movedRow.dragTo(uncategorized);
    await expect.poll(async () => {
      const list = await (await api.get('/api/v1/resources')).json();
      return list.find((entry: { id: string }) => entry.id === resource.id)?.categoryId;
    }).toBe(null);
    await uncategorized.getByRole('button', { name: 'Gruppe Ohne Kategorie ausklappen' }).click();
    await expect(uncategorized.locator('.resource').filter({ hasText: `Drag Resource ${suffix}` })).toBeVisible();
  } finally {
    await api.delete(`/api/v1/resources/${resource.id}`, { headers: { 'x-csrf-token': csrf!, origin: baseURL! } });
    await api.delete(`/api/v1/resources/${tagPeer.id}`, { headers: { 'x-csrf-token': csrf!, origin: baseURL! } });
    await api.delete(`/api/v1/categories/${sourceCategory.id}`, { headers: { 'x-csrf-token': csrf!, origin: baseURL! } });
    await api.delete(`/api/v1/categories/${targetCategory.id}`, { headers: { 'x-csrf-token': csrf!, origin: baseURL! } });
    await api.put('/api/v1/preferences', { headers: { 'x-csrf-token': csrf!, origin: baseURL! }, data: originalPreferences.data });
  }
});
