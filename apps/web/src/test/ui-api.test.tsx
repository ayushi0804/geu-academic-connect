import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, EmptyState, Pagination, StatusBadge } from '@/components/ui';
import { ApiError, api, errMsg } from '@/lib/api';
import { fmtSize, initials, pct, toLocalInput } from '@/lib/utils';

describe('utils', () => {
  it('formats values', () => {
    expect(pct(62.5)).toBe('62.5%'); expect(pct(null)).toBe('—'); expect(initials('Aarav Rawat Singh')).toBe('AR'); expect(fmtSize(2048)).toBe('2 KB'); expect(toLocalInput(null)).toBe('');
  });
});

describe('components', () => {
  it('Pagination disables boundaries and reports page changes', async () => {
    const onPage = vi.fn();
    render(<Pagination meta={{ page: 1, totalPages: 3, total: 25 }} onPage={onPage} />);
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Next page'));
    expect(onPage).toHaveBeenCalledWith(2);
  });
  it('EmptyState renders guidance and an action', () => {
    render(<EmptyState title="No notices" hint="Create one" action={<button>New</button>} />);
    expect(screen.getByText('No notices')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });
  it('ConfirmDialog calls onConfirm', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="Delete?" message="Sure?" confirmLabel="Delete" onConfirm={onConfirm} onClose={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
  });
  it('StatusBadge renders the status text', () => { render(<StatusBadge value="published" />); expect(screen.getByText('published')).toBeInTheDocument(); });
});

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks());
  const mockFetch = (status: number, body: unknown) => vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => body } as Response);
  it('unwraps the success envelope and sends the CSRF header + cookies', async () => {
    const f = mockFetch(200, { success: true, data: { a: 1 }, meta: { total: 1 } });
    const r = await api('/things', { query: { page: 2, q: '' } });
    expect(r.data).toEqual({ a: 1 }); expect(r.meta.total).toBe(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/things?page=2'); expect(init.credentials).toBe('include'); expect((init.headers as any)['X-Requested-With']).toBe('XMLHttpRequest');
  });
  it('turns error envelopes into ApiError with readable details', async () => {
    mockFetch(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid', details: [{ path: 'email', message: 'Invalid' }] } });
    const err = await api('/x', { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError); expect(err.status).toBe(400); expect(errMsg(err)).toContain('email – Invalid');
  });
  it('announces expired sessions', async () => {
    mockFetch(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Session expired' } });
    const h = vi.fn(); window.addEventListener('gac:unauthorized', h);
    await api('/notices').catch(() => undefined);
    expect(h).toHaveBeenCalled(); window.removeEventListener('gac:unauthorized', h);
  });
  it('reports network failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('failed'));
    await expect(api('/x')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
