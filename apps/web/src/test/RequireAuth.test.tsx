import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/components/RequireAuth';

const auth = vi.hoisted(() => ({ value: { user: null as any, loading: false } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => auth.value }));

const renderAt = (roles?: any[]) => render(
  <MemoryRouter initialEntries={['/secret']}>
    <Routes><Route path="/login" element={<p>login page</p>} /><Route path="/secret" element={<RequireAuth roles={roles}><p>secret content</p></RequireAuth>} /></Routes>
  </MemoryRouter>,
);

describe('<RequireAuth />', () => {
  beforeEach(() => { auth.value = { user: null, loading: false }; });
  it('redirects anonymous users to the login page', () => { renderAt(); expect(screen.getByText('login page')).toBeInTheDocument(); });
  it('shows a loading state while the session is checked', () => { auth.value = { user: null, loading: true }; renderAt(); expect(screen.getByRole('status')).toBeInTheDocument(); });
  it('renders content for permitted roles', () => { auth.value = { user: { role: 'admin' }, loading: false }; renderAt(['admin']); expect(screen.getByText('secret content')).toBeInTheDocument(); });
  it('blocks users whose role is not allowed', () => {
    auth.value = { user: { role: 'student' }, loading: false }; renderAt(['admin']);
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(screen.getByText('You don’t have access')).toBeInTheDocument();
  });
});
