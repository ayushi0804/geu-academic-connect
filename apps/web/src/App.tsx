import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RequireAuth } from './components/RequireAuth';
import { useAuth, type Role } from './lib/auth';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { AttendancePage } from './pages/AttendancePage';
import { AuditLogsPage, SettingsPage } from './pages/AdminSystemPages';
import { AcademicsPage, AllocationsPage, UsersPage, TimetableManagerPage } from './pages/AdminPages';
import { ForgotPasswordPage, LoginPage, SetPasswordPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { DirectoryPage, MaterialsPage } from './pages/MaterialsPage';
import { NotFoundPage } from './pages/ErrorPages';
import { NoticesPage, NotificationsPage } from './pages/NoticesPage';
import { PlacementsPage } from './pages/PlacementsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { ResultsPage } from './pages/ResultsPage';
import { SearchPage } from './pages/SearchPage';
import { CalendarPage, TimetablePage } from './pages/TimetablePage';

const guard = (el: React.ReactNode, roles?: Role[]) => <RequireAuth roles={roles}><AppShell>{el}</AppShell></RequireAuth>;

export default function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={!loading && user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/" element={guard(<DashboardPage />)} />
      <Route path="/profile" element={guard(<ProfilePage />)} />
      <Route path="/search" element={guard(<SearchPage />)} />
      <Route path="/notices" element={guard(<NoticesPage />)} />
      <Route path="/notifications" element={guard(<NotificationsPage />)} />
      <Route path="/directory" element={guard(<DirectoryPage />)} />
      <Route path="/timetable" element={guard(<TimetablePage />, ['student', 'faculty', 'admin'])} />
      <Route path="/calendar" element={guard(<CalendarPage />, ['student', 'faculty', 'admin'])} />
      <Route path="/attendance" element={guard(<AttendancePage />, ['student', 'faculty', 'admin'])} />
      <Route path="/assignments" element={guard(<AssignmentsPage />, ['student', 'faculty', 'admin'])} />
      <Route path="/materials" element={guard(<MaterialsPage />, ['student', 'faculty', 'admin'])} />
      <Route path="/results" element={guard(<ResultsPage />, ['student', 'faculty'])} />
      <Route path="/placements" element={guard(<PlacementsPage />, ['student', 'placement', 'admin'])} />
      <Route path="/reports" element={guard(<ReportsPage />, ['admin', 'placement'])} />
      <Route path="/admin/users" element={guard(<UsersPage />, ['admin'])} />
      <Route path="/admin/academics" element={guard(<AcademicsPage />, ['admin'])} />
      <Route path="/admin/allocations" element={guard(<AllocationsPage />, ['admin'])} />
      <Route path="/admin/timetable" element={guard(<TimetableManagerPage />, ['admin'])} />
      <Route path="/admin/audit" element={guard(<AuditLogsPage />, ['admin'])} />
      <Route path="/admin/settings" element={guard(<SettingsPage />, ['admin'])} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
