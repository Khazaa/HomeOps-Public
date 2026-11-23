import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ logout: vi.fn(), me: vi.fn() }));

vi.mock('../src/api', () => ({
  api: {
    me: mocks.me,
    resources: vi.fn().mockResolvedValue([]),
    categories: vi.fn().mockResolvedValue([]),
    credentials: vi.fn().mockResolvedValue([]),
    preferences: vi.fn().mockResolvedValue({ data: {} }),
    savePreferences: vi.fn().mockResolvedValue({ data: {} }),
    logout: mocks.logout
  }
}));

import { App } from '../src/App';

beforeEach(() => {
  mocks.logout.mockReset();
  mocks.me.mockReset().mockResolvedValue({ user: { id: 'user-a', username: 'admin', role: 'admin' } });
  localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  });
});
afterEach(cleanup);

test('shows a visible error when logout is rejected', async () => {
  mocks.logout.mockRejectedValueOnce(new Error('ORIGIN_INVALID'));
  render(<App />);

  await screen.findByPlaceholderText('Suchen …');
  fireEvent.click(screen.getByRole('button', { name: 'Benutzermenü' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Logout fehlgeschlagen: APP_ORIGIN stimmt nicht mit der Browseradresse überein.'));
  expect(screen.queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument();
});

test('shows an empty focused username field on login', async () => {
  mocks.me.mockRejectedValueOnce(new Error('UNAUTHORIZED'));
  render(<App />);
  const username = await screen.findByLabelText('Benutzername');
  expect(username).toHaveValue('');
  expect(username).toHaveFocus();
});

test('returns to login after the server confirms logout', async () => {
  mocks.logout.mockResolvedValueOnce({ ok: true });
  render(<App />);

  await screen.findByPlaceholderText('Suchen …');
  fireEvent.click(screen.getByRole('button', { name: 'Benutzermenü' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));

  expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeVisible();
});

test('shows the build version in the info dialog', async () => {
  render(<App />);

  await screen.findByPlaceholderText('Suchen …');
  fireEvent.click(screen.getByRole('button', { name: 'Benutzermenü' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Info' }));

  const dialog = await screen.findByRole('dialog', { name: 'HomeOps Hub' });
  expect(dialog).toHaveTextContent(/Version (development|test)/);
  expect(screen.getByRole('link', { name: 'Repository auf GitHub' })).toHaveAttribute('href', 'https://github.com/Khazaa/HomeOps-Public');
});
