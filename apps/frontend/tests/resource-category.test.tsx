import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createCategory: vi.fn(), deleteCategory: vi.fn(), createResource: vi.fn() }));

vi.mock('../src/api', () => ({
  api: {
    me: vi.fn().mockResolvedValue({ user: { id: 'user-a', username: 'admin', role: 'admin' } }),
    resources: vi.fn().mockResolvedValue([]), categories: vi.fn().mockResolvedValue([]), credentials: vi.fn().mockResolvedValue([]),
    preferences: vi.fn().mockResolvedValue({ data: {} }), savePreferences: vi.fn().mockResolvedValue({ data: {} }),
    createCategory: mocks.createCategory, deleteCategory: mocks.deleteCategory, createResource: mocks.createResource,
  },
}));

import { App } from '../src/App';

beforeEach(() => {
  mocks.createCategory.mockReset().mockResolvedValue({ id: 'category-new', name: 'Smart Home', icon: 'folder', position: 0 });
  mocks.deleteCategory.mockReset().mockResolvedValue({ ok: true });
  mocks.createResource.mockReset().mockResolvedValue({ id: 'resource-new' });
  localStorage.clear();
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
});
afterEach(cleanup);

async function fillResourceWithNewCategory() {
  render(<App />);
  await screen.findByPlaceholderText('Suchen …');
  fireEvent.click(screen.getByRole('button', { name: 'Ressource' }));
  const dialog = screen.getByRole('heading', { name: 'Ressource anlegen' }).closest('form')!;
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'ioBroker' } });
  fireEvent.change(within(dialog).getByLabelText('URL'), { target: { value: 'http://192.168.23.6:8081' } });
  fireEvent.change(within(dialog).getByLabelText('Gruppe'), { target: { value: '__new__' } });
  fireEvent.change(within(dialog).getByLabelText('Neue Gruppe'), { target: { value: 'Smart Home' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
}

describe('resource category creation', () => {
  it('creates and assigns a group while saving a resource', async () => {
    await fillResourceWithNewCategory();
    await waitFor(() => expect(mocks.createCategory).toHaveBeenCalledWith('Smart Home'));
    expect(mocks.createResource).toHaveBeenCalledWith(expect.objectContaining({ name: 'ioBroker', categoryId: 'category-new' }));
  });
  it('removes the new empty group if resource creation fails', async () => {
    mocks.createResource.mockRejectedValueOnce(new Error('Speichern fehlgeschlagen'));
    await fillResourceWithNewCategory();
    await waitFor(() => expect(mocks.deleteCategory).toHaveBeenCalledWith('category-new'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen');
  });
});

describe('RDP resource settings', () => {
  it('stores the selected Windows keyboard layout', async () => {
    render(<App />);
    await screen.findByPlaceholderText('Suchen …');
    fireEvent.click(screen.getByRole('button', { name: 'Ressource' }));
    const dialog = screen.getByRole('heading', { name: 'Ressource anlegen' }).closest('form')!;
    fireEvent.change(within(dialog).getByLabelText('Typ'), { target: { value: 'rdp' } });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Windows Server' } });
    fireEvent.change(within(dialog).getByLabelText('Host'), { target: { value: '192.168.23.10' } });
    fireEvent.change(within(dialog).getByLabelText('Tastaturlayout auf dem Windows-Ziel'), { target: { value: 'de-de-qwertz' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(mocks.createResource).toHaveBeenCalledWith(expect.objectContaining({
      type: 'rdp',
      config: expect.objectContaining({ keyboardLayout: 'de-de-qwertz' })
    })));
  });
});
