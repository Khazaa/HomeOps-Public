import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock('../src/api', () => ({
  api: {
    me: vi.fn().mockResolvedValue({ user: { id: 'user-a', username: 'admin', role: 'admin' } }),
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

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Logout fehlgeschlagen: ORIGIN_INVALID'));
  expect(screen.queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument();
});

test('returns to login after the server confirms logout', async () => {
  mocks.logout.mockResolvedValueOnce({ ok: true });
  render(<App />);

  await screen.findByPlaceholderText('Suchen …');
  fireEvent.click(screen.getByRole('button', { name: 'Benutzermenü' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));

  expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeVisible();
});
