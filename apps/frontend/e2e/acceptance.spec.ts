import { expect, test, type Page } from '@playwright/test';

const password = process.env.HOMEOPS_TEST_PASSWORD;
const noAccessPassword = process.env.HOMEOPS_NOACCESS_PASSWORD;
const sshPassword = process.env.HOMEOPS_TEST_SSH_PASSWORD;
test.skip(!password || !sshPassword, 'HOMEOPS_TEST_PASSWORD and HOMEOPS_TEST_SSH_PASSWORD are required');

async function login(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'HomeOps Hub' })).toBeVisible();
  await page.getByLabel('Benutzername').fill('admin');
  await page.getByLabel('Passwort').fill(password!);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByPlaceholder('Suchen …')).toBeVisible();
}

test('A-01–A-11/A-15/A-17 persistent Web, SSH and RDP tabs', async ({ page, baseURL }) => {
  expect((await page.request.get('/api/v1/resources')).status()).toBe(401);
  await login(page);

  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'homeops_csrf')?.value;
  expect(csrf).toBeTruthy();
  const headers = { 'x-csrf-token': csrf!, origin: baseURL! };
  const api = page.context().request;
  const categoriesResponse = await api.get('/api/v1/categories');
  expect(categoriesResponse.ok()).toBeTruthy();
  const categories = await categoriesResponse.json();
  const category = categories.find((entry: { name: string }) => entry.name === 'Acceptance');
  expect(category).toBeTruthy();

  const resources = await (await api.get('/api/v1/resources')).json();
  for (const resource of resources) {
    expect(resource).not.toHaveProperty('secret');
    expect(resource.config).not.toHaveProperty('password');
    expect(resource.config).not.toHaveProperty('private-key');
  }
  if (!resources.some((entry: { name: string }) => entry.name === 'Web Fixture')) {
    const created = await api.post('/api/v1/resources', {
      headers,
      data: {
        type: 'web', name: 'Web Fixture', categoryId: category.id, icon: 'link', position: 0, enabled: true,
        config: { url: `${baseURL}/fixture.html`, mode: 'embedded', sandbox: 'allow-forms allow-scripts allow-same-origin' }
      }
    });
    expect(created.ok()).toBeTruthy();
    await page.reload();
  }

  const fixtureRow = page.locator('.resource').filter({ hasText: 'Web Fixture' });
  await fixtureRow.getByRole('button', { name: /Web Fixture/ }).click();
  const frames = page.locator('iframe[title="Web Fixture"]');
  await frames.nth(0).contentFrame().locator('#state-input').fill('erstes Formular');
  await frames.nth(0).evaluate(element => element.setAttribute('data-identity', 'original'));

  await fixtureRow.getByLabel('Aktionen').click();
  await fixtureRow.getByRole('button', { name: 'Weiteren Tab öffnen' }).click();
  await expect(frames).toHaveCount(2);
  await frames.nth(1).contentFrame().locator('#state-input').fill('zweites Formular');
  await page.locator('.tabs').getByRole('button', { name: /Web Fixture/ }).nth(0).click();
  await expect(frames.nth(0).contentFrame().locator('#state-input')).toHaveValue('erstes Formular');
  await expect(frames.nth(1).contentFrame().locator('#state-input')).toHaveValue('zweites Formular');
  await expect(frames.nth(0)).toHaveAttribute('data-identity', 'original');
  await page.locator('.tabs').getByRole('button', { name: /Web Fixture/ }).nth(0).click({ button: 'right' });
  const tabMenu = page.getByRole('menu', { name: /Aktionen für Web Fixture/ });
  await expect(tabMenu).toBeVisible();
  await tabMenu.getByRole('menuitem', { name: 'Tab neu laden' }).click();
  await expect(frames.nth(0).contentFrame().locator('#state-input')).toHaveValue('');
  await expect(frames.nth(1).contentFrame().locator('#state-input')).toHaveValue('zweites Formular');
  await expect(frames.nth(0)).not.toHaveAttribute('data-identity', 'original');

  const sshRow = page.locator('.resource').filter({ hasText: 'Acceptance SSH' });
  expect(await sshRow.locator('svg.icon').count()).toBeGreaterThanOrEqual(2);
  const [resourceBox, groupBox, resourceActionBox] = await Promise.all([
    page.getByRole('button', { name: 'Ressource', exact: true }).boundingBox(),
    page.getByRole('button', { name: 'Gruppe', exact: true }).boundingBox(),
    sshRow.getByLabel('Aktionen').boundingBox()
  ]);
  expect(Math.abs(resourceBox!.width - groupBox!.width)).toBeLessThan(2);
  expect(groupBox!.y).toBeGreaterThan(resourceActionBox!.y);
  await fixtureRow.getByLabel('Aktionen').click();
  await expect(fixtureRow.locator('details.resource-menu')).toHaveAttribute('open', '');
  await sshRow.getByLabel('Aktionen').click();
  await expect(fixtureRow.locator('details.resource-menu')).not.toHaveAttribute('open', '');
  await expect(sshRow.locator('details.resource-menu')).toHaveAttribute('open', '');
  await page.getByPlaceholder('Suchen …').click();
  await expect(sshRow.locator('details.resource-menu')).not.toHaveAttribute('open', '');
  await sshRow.getByLabel('Aktionen').click();
  await sshRow.getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(page.getByRole('status')).toContainText('Acceptance SSH: Zielport erreichbar.');
  await page.getByLabel('Theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  let protocolColors = await Promise.all(['web', 'ssh', 'rdp'].map(type => page.locator(`.icon-${type}`).first().evaluate(element => getComputedStyle(element).color)));
  expect(new Set(protocolColors).size).toBe(3);
  let menuStyle = await sshRow.getByLabel('Aktionen').evaluate(element => ({ border: getComputedStyle(element).borderStyle, color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  expect(menuStyle.border).toBe('solid');
  expect(menuStyle.color).not.toBe(menuStyle.background);
  await page.getByLabel('Theme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  protocolColors = await Promise.all(['web', 'ssh', 'rdp'].map(type => page.locator(`.icon-${type}`).first().evaluate(element => getComputedStyle(element).color)));
  expect(new Set(protocolColors).size).toBe(3);
  menuStyle = await sshRow.getByLabel('Aktionen').evaluate(element => ({ border: getComputedStyle(element).borderStyle, color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  expect(menuStyle.border).toBe('solid');
  expect(menuStyle.color).not.toBe(menuStyle.background);
  expect(await page.locator('.theme-control').evaluate(element => element.getBoundingClientRect().left / window.innerWidth)).toBeGreaterThan(0.55);
  const acceptanceHeading = page.getByRole('heading', { name: 'Acceptance' });
  await acceptanceHeading.getByRole('button', { name: 'Gruppe Acceptance einklappen' }).click();
  await expect(sshRow).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('homeops.collapsedGroups') ?? '[]'))).toContain(category.id);
  await acceptanceHeading.getByRole('button', { name: 'Gruppe Acceptance ausklappen' }).click();
  await expect(sshRow).toBeVisible();
  await acceptanceHeading.locator('..').getByRole('button', { name: 'Sortierung aktivieren' }).click();
  await expect(sshRow.getByRole('button', { name: 'Nach oben' })).toBeVisible();
  await acceptanceHeading.locator('..').getByRole('button', { name: 'Sortierung beenden' }).click();
  await sshRow.getByRole('button', { name: /Acceptance SSH/ }).click();
  let panel = page.locator('.tab-panel:not([hidden])');
  await expect(panel.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 30_000 });
  const sshTab = page.locator('.tabs').getByRole('button', { name: /Acceptance SSH/ });
  const sshIndexBeforeMove = await sshTab.evaluate(element => Array.from(element.parentElement!.children).indexOf(element));
  await sshTab.click({ button: 'right' });
  await page.getByRole('menu', { name: /Aktionen für Acceptance SSH/ }).getByRole('menuitem', { name: 'Nach links' }).click();
  await expect.poll(() => sshTab.evaluate(element => Array.from(element.parentElement!.children).indexOf(element))).toBe(sshIndexBeforeMove - 1);
  await panel.locator('.remote-display').click();
  await page.keyboard.type('cd /tmp');
  await page.keyboard.press('Enter');
  await page.keyboard.type('pwd');
  await page.keyboard.press('Enter');
  await page.keyboard.type('uname -a');
  await page.keyboard.press('Enter');
  await expect(panel.locator('canvas').first()).toBeVisible();
  await panel.screenshot({ path: 'test-results/ssh-connected.png' });
  await panel.locator('.remote-display').evaluate(element => element.setAttribute('data-session-identity', 'ssh-original'));

  await page.getByRole('button', { name: /Acceptance RDP/ }).click();
  panel = page.locator('.tab-panel:not([hidden])');
  await expect(panel.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(panel.locator('canvas').first()).toBeVisible();
  await panel.locator('.remote-display').click({ position: { x: 120, y: 120 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3_000);
  await expect.poll(() => panel.locator('.remote-display').evaluate(element => {
    const display = element.firstElementChild;
    if (!display) return 0;
    const hostRect = element.getBoundingClientRect();
    const displayRect = display.getBoundingClientRect();
    return Math.min(displayRect.width / hostRect.width, displayRect.height / hostRect.height);
  })).toBeGreaterThan(0.9);
  await panel.screenshot({ path: 'test-results/rdp-connected.png' });
  await panel.locator('.remote-display').evaluate(element => element.setAttribute('data-session-identity', 'rdp-original'));

  await page.locator('.tabs').getByRole('button', { name: /Acceptance SSH/ }).click();
  panel = page.locator('.tab-panel:not([hidden])');
  await expect(panel.getByText('Verbunden', { exact: true })).toBeVisible();
  await expect(panel.locator('[data-session-identity="ssh-original"]')).toHaveCount(1);
  await page.locator('.tabs').getByRole('button', { name: /Acceptance RDP/ }).click();
  panel = page.locator('.tab-panel:not([hidden])');
  await expect(panel.getByText('Verbunden', { exact: true })).toBeVisible();
  await expect(panel.locator('[data-session-identity="rdp-original"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Ressource' }).click();
  const editorWhileConnected = page.getByRole('heading', { name: 'Ressource anlegen' }).locator('..');
  await editorWhileConnected.getByLabel('Typ').selectOption('ssh');
  await editorWhileConnected.getByLabel('Name').fill('Eingabe trotz RDP');
  await editorWhileConnected.getByLabel('Host', { exact: true }).fill('192.0.2.10');
  await expect(editorWhileConnected.getByLabel('Name')).toHaveValue('Eingabe trotz RDP');
  await expect(editorWhileConnected.getByLabel('Host', { exact: true })).toHaveValue('192.0.2.10');
  await editorWhileConnected.getByRole('button', { name: 'Abbrechen' }).click();

  await page.getByRole('heading', { name: 'Ohne Kategorie' }).getByRole('button', { name: 'Gruppe Ohne Kategorie einklappen' }).click();
  const tabOrderBeforeReload = await page.locator('.tabs > button > span').allTextContents();
  await page.reload();
  await expect(page.locator('.tabs').getByRole('button', { name: /Acceptance SSH/ })).toBeVisible();
  await expect(page.locator('.tabs').getByRole('button', { name: /Acceptance RDP/ })).toBeVisible();
  await expect.poll(() => page.locator('.tabs > button > span').allTextContents()).toEqual(tabOrderBeforeReload);
  const uncategorizedToggle = page.getByRole('heading', { name: 'Ohne Kategorie' }).getByRole('button', { name: 'Gruppe Ohne Kategorie ausklappen' });
  await expect(uncategorizedToggle).toHaveAttribute('aria-expanded', 'false');
  await uncategorizedToggle.click();
  await page.locator('.tabs').getByRole('button', { name: /Acceptance SSH/ }).click();
  await expect(page.locator('.tab-panel:not([hidden])').getByText('Getrennt', { exact: true })).toBeVisible();
  const separator = page.getByRole('separator', { name: 'Breite der Seitenleiste' });
  const previousWidth = Number(await separator.getAttribute('aria-valuenow'));
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', String(previousWidth + 16));
  const temporaryPassword = 'HomeOps-Temporary-Password-2026';
  const changePassword = async (currentPassword: string, newPassword: string) => {
    await page.getByRole('button', { name: 'Kennwort ändern' }).click();
    const dialog = page.getByRole('heading', { name: 'Kennwort ändern' }).locator('..');
    await dialog.getByLabel('Aktuelles Kennwort').fill(currentPassword);
    await dialog.getByLabel('Neues Kennwort', { exact: true }).fill(newPassword);
    await dialog.getByLabel('Neues Kennwort bestätigen').fill(newPassword);
    await dialog.getByRole('button', { name: 'Kennwort speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Kennwort ändern' })).toHaveCount(0);
  };
  await changePassword(password!, temporaryPassword);
  let passwordRestored = false;
  try {
    const oldPasswordRejected = await api.post('/api/v1/auth/change-password', { headers, data: { currentPassword: password, newPassword: 'HomeOps-Should-Not-Be-Used-2026' } });
    expect(oldPasswordRejected.status()).toBe(401);
    await changePassword(temporaryPassword, password!);
    passwordRestored = true;
  } finally {
    if (!passwordRestored) await api.post('/api/v1/auth/change-password', { headers, data: { currentPassword: temporaryPassword, newPassword: password } });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Ressource' })).toBeVisible();
  await expect(page.getByPlaceholder('Suchen …')).toBeVisible();
  await page.getByRole('button', { name: 'Ressource' }).click();
  await expect(page.getByRole('heading', { name: 'Ressource anlegen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speichern' })).toBeVisible();
  await page.getByLabel('Typ').selectOption('ssh');
  await page.getByLabel('SSH Host-Key prüfen (empfohlen)').uncheck();
  await expect(page.getByRole('alert')).toContainText('Identität des SSH-Servers');
  await expect(page.getByLabel('SSH Host-Key (known_hosts-Format)')).toHaveCount(0);
});
test('A-03/A-06/A-09 CRUD, safe external mode and SSH host-key rejection', async ({ page, baseURL }) => {
  await login(page);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'homeops_csrf')?.value;
  expect(csrf).toBeTruthy();
  const headers = { 'x-csrf-token': csrf!, origin: baseURL! };
  const api = page.context().request;

  const unverifiedSsh = await api.post('/api/v1/resources', { headers, data: {
    type: 'ssh', name: 'SSH without host key', categoryId: null, icon: 'link', position: 100, enabled: true,
    config: { host: 'test-ssh', port: 2222, username: 'homeops-test', authType: 'password', verifyHostKey: false, hostKeyFingerprint: '' }
  } });
  expect(unverifiedSsh.ok()).toBeTruthy();
  const unverifiedSshResource = await unverifiedSsh.json();
  try {
    await page.reload();
    const sshWithoutSecretRow = page.locator('.resource').filter({ hasText: 'SSH without host key' });
    await sshWithoutSecretRow.getByLabel('Aktionen').click();
    await sshWithoutSecretRow.getByRole('button', { name: 'Bearbeiten' }).click();
    const sshEditor = page.getByRole('heading', { name: 'Ressource bearbeiten' }).locator('..');
    await expect(sshEditor.getByLabel('Typ')).toBeDisabled();
    await expect(sshEditor.getByText('Der Ressourcentyp kann nach dem Anlegen nicht geändert werden.')).toBeVisible();
    await sshEditor.getByLabel('Passwort (optional)').fill(sshPassword!);
    await sshEditor.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Ressource bearbeiten' })).toHaveCount(0);
    const updatedSsh = (await (await api.get('/api/v1/resources')).json()).find((entry: { id: string }) => entry.id === unverifiedSshResource.id);
    expect(updatedSsh.hasSecret).toBe(true);
    const storedSecretTicket = await api.post(`/api/v1/resources/${unverifiedSshResource.id}/connect`, { headers, data: { width: 800, height: 600 } });
    expect(storedSecretTicket.ok()).toBeTruthy();
  } finally {
    expect((await api.delete(`/api/v1/resources/${unverifiedSshResource.id}`, { headers })).ok()).toBeTruthy();
  }

  const credentialResponse = await api.post('/api/v1/credentials', { headers, data: { name: 'Acceptance Shared Password', username: 'acceptance', kind: 'password', secret: sshPassword } });
  expect(credentialResponse.ok()).toBeTruthy();
  const sharedCredential = await credentialResponse.json();
  expect(sharedCredential).not.toHaveProperty('secret');
  expect(sharedCredential).not.toHaveProperty('payload');
  expect(sharedCredential.username).toBe('acceptance');
  const credentialResourceResponse = await api.post('/api/v1/resources', { headers, data: {
    type: 'ssh', name: 'SSH with shared credential', categoryId: null, icon: 'link', position: 101, enabled: true, credentialId: sharedCredential.id,
    config: { host: 'test-ssh', port: 2222, username: 'homeops-test', authType: 'password', verifyHostKey: false, hostKeyFingerprint: '' }
  } });
  expect(credentialResourceResponse.ok()).toBeTruthy();
  const credentialResource = await credentialResourceResponse.json();
  try {
    expect(credentialResource.credentialId).toBe(sharedCredential.id);
    expect(credentialResource.hasSecret).toBe(true);
    expect(credentialResource.hasLocalSecret).toBe(false);
    expect((await api.post(`/api/v1/resources/${credentialResource.id}/connect`, { headers, data: { width: 800, height: 600 } })).ok()).toBeTruthy();
    await page.reload();
    const sharedCredentialRow = page.locator('.resource').filter({ hasText: 'SSH with shared credential' });
    await sharedCredentialRow.getByLabel('Aktionen').click();
    await sharedCredentialRow.getByRole('button', { name: 'Bearbeiten' }).click();
    const credentialSelect = page.getByRole('heading', { name: 'Ressource bearbeiten' }).locator('..').getByLabel('Anmeldequelle');
    await expect(credentialSelect).toHaveValue(sharedCredential.id);
    await expect(credentialSelect.locator(`option[value="${sharedCredential.id}"]`)).toHaveText('Acceptance Shared Password');
    await page.getByRole('heading', { name: 'Ressource bearbeiten' }).locator('..').getByRole('button', { name: 'Abbrechen' }).click();
  } finally {
    expect((await api.delete(`/api/v1/resources/${credentialResource.id}`, { headers })).ok()).toBeTruthy();
    expect((await api.delete(`/api/v1/credentials/${sharedCredential.id}`, { headers })).ok()).toBeTruthy();
  }

  const categoryCreated = await api.post('/api/v1/categories', { headers, data: { name: 'Category Acceptance', icon: 'folder', position: 99 } });
  expect(categoryCreated.ok()).toBeTruthy();
  const temporaryCategory = await categoryCreated.json();
  await page.reload();
  let categoryHeading = page.getByRole('heading', { name: 'Category Acceptance' });
  await expect(categoryHeading).toBeVisible();
  page.once('dialog', dialog => dialog.accept('Category Acceptance Updated'));
  await categoryHeading.locator('..').getByRole('button', { name: 'Gruppe umbenennen' }).click();
  categoryHeading = page.getByRole('heading', { name: 'Category Acceptance Updated' });
  await expect(categoryHeading).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await categoryHeading.locator('..').getByRole('button', { name: 'Gruppe löschen' }).click();
  await expect(categoryHeading).toHaveCount(0);
  expect((await api.get('/api/v1/categories')).ok()).toBeTruthy();
  expect((await (await api.get('/api/v1/categories')).json()).some((entry: { id: string }) => entry.id === temporaryCategory.id)).toBeFalsy();

  const created = await api.post('/api/v1/resources', {
    headers,
    data: {
      type: 'web', name: 'CRUD Acceptance', categoryId: null, icon: 'link', position: 99, enabled: true,
      config: { url: 'https://example.com', mode: 'external', sandbox: 'allow-forms allow-scripts' }
    }
  });
  expect(created.status()).toBe(200);
  const temporary = await created.json();
  try {
    await page.reload();
    const originalRow = page.locator('.resource').filter({ hasText: 'CRUD Acceptance' });
    await originalRow.getByLabel('Aktionen').click();
    await originalRow.getByRole('button', { name: 'Bearbeiten' }).click();
    const editor = page.getByRole('heading', { name: 'Ressource bearbeiten' }).locator('..');
    await editor.getByLabel('Name').fill('CRUD Acceptance Updated');
    await editor.getByLabel('URL').fill('https://example.org');
    await editor.getByLabel('Einbettungsmodus').selectOption('external');
    await editor.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Ressource bearbeiten' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /CRUD Acceptance Updated/ })).toBeVisible();
    const persisted = (await (await api.get('/api/v1/resources')).json()).find((entry: { id: string }) => entry.id === temporary.id);
    expect(persisted.name).toBe('CRUD Acceptance Updated');
    expect(persisted.config.url).toBe('https://example.org');
    await page.getByRole('button', { name: 'Ressource' }).click();
    const nextEditor = page.getByRole('heading', { name: 'Ressource anlegen' }).locator('..');
    await nextEditor.getByLabel('Name').fill('Direkt danach editierbar');
    await expect(nextEditor.getByLabel('Name')).toHaveValue('Direkt danach editierbar');
    await nextEditor.getByRole('button', { name: 'Abbrechen' }).click();
    await page.getByRole('button', { name: /CRUD Acceptance Updated/ }).click();
    const panel = page.locator('.tab-panel:not([hidden])');
    await expect(panel.getByText('Diese Ressource ist für externe Anzeige konfiguriert.')).toBeVisible();
    await expect(panel.locator('iframe')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'In neuem Browser-Tab öffnen' })).toBeVisible();
  } finally {
    expect((await api.delete(`/api/v1/resources/${temporary.id}`, { headers })).ok()).toBeTruthy();
  }

  const resources = await (await api.get('/api/v1/resources')).json();
  const ssh = resources.find((entry: { name: string }) => entry.name === 'Acceptance SSH');
  expect(ssh).toBeTruthy();
  const wrongConfig = { ...ssh.config, hostKeyFingerprint: '[test-ssh]:2222 ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBF7vL2sF4vHnYcDjmTzBcUdQJ9l8s3yQYfPNr5zA5QqX1kzYex9W4q5S4nQjZdQmYHk5mGgK8pQzAqgPC8E=' };
  try {
    expect((await api.patch(`/api/v1/resources/${ssh.id}`, { headers, data: { config: wrongConfig } })).ok()).toBeTruthy();
    await page.reload();
    await page.getByRole('button', { name: /Acceptance SSH/ }).click();
    const panel = page.locator('.tab-panel:not([hidden])');
    await panel.getByRole('button', { name: 'Verbinden' }).click();
    await expect(panel.getByText('Fehler', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByText('Verbunden', { exact: true })).toHaveCount(0);
  } finally {
    expect((await api.patch(`/api/v1/resources/${ssh.id}`, { headers, data: { config: ssh.config } })).ok()).toBeTruthy();
  }
});

test('A-16 logout invalidates REST and WebSocket access', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /Acceptance SSH/ }).click();
  let panel = page.locator('.tab-panel:not([hidden])');
  await expect(panel.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Acceptance RDP/ }).click();
  panel = page.locator('.tab-panel:not([hidden])');
  await expect(panel.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
  expect((await page.request.get('/api/v1/resources')).status()).toBe(401);

  const socketResult = await page.evaluate(() => new Promise<string>(resolve => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${location.host}/api/v1/tunnel?token=invalid`);
    socket.onopen = () => resolve('opened');
    socket.onerror = () => resolve('rejected');
    socket.onclose = () => resolve('rejected');
    setTimeout(() => resolve('timeout'), 5_000);
  }));
  expect(socketResult).toBe('rejected');
  const sshSocketResult = await page.evaluate(() => new Promise<string>(resolve => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${location.host}/api/v1/tunnel?transport=ssh&token=invalid`);
    socket.onopen = () => resolve('opened');
    socket.onerror = () => resolve('rejected');
    socket.onclose = () => resolve('rejected');
    setTimeout(() => resolve('timeout'), 5_000);
  }));
  expect(sshSocketResult).toBe('rejected');
});

test('A-12 object authorization denies an unprivileged user', async ({ page, baseURL }) => {
  test.skip(!noAccessPassword, 'HOMEOPS_NOACCESS_PASSWORD is required');
  await login(page);
  const resources = await (await page.context().request.get('/api/v1/resources')).json();
  const protectedResource = resources.find((entry: { name: string }) => entry.name === 'Acceptance SSH');
  expect(protectedResource).toBeTruthy();
  await page.getByRole('button', { name: 'Logout' }).click();

  await page.getByLabel('Benutzername').fill('acceptance-noaccess');
  await page.getByLabel('Passwort').fill(noAccessPassword!);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByPlaceholder('Suchen …')).toBeVisible();
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'homeops_csrf')?.value;
  expect(csrf).toBeTruthy();
  const headers = { 'x-csrf-token': csrf!, origin: baseURL! };
  expect((await page.context().request.post(`/api/v1/resources/${protectedResource.id}/test`, { headers })).status()).toBe(404);
  expect((await page.context().request.post(`/api/v1/resources/${protectedResource.id}/connect`, { headers, data: {} })).status()).toBe(404);
});
