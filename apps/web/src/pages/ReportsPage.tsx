import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, CardHeader, PageHeader, Tabs } from '@/components/ui';
import { download, toastError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PlacementAnalytics } from './DashboardPage';

const EXPORTS = [
  { type: 'placement-applications', label: 'Placement applications', desc: 'Every student application with status and CGPA at application time.', roles: ['admin', 'placement'] },
  { type: 'offers', label: 'Offers & packages', desc: 'Offer records entered by the placement cell.', roles: ['admin', 'placement'] },
  { type: 'users', label: 'User directory', desc: 'All accounts with role, status and department.', roles: ['admin'] },
  { type: 'enrollments', label: 'Enrollments', desc: 'Student–subject enrollment records.', roles: ['admin'] },
];

export function ReportsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('analytics');
  return (
    <>
      <PageHeader title="Analytics & reports" description="Aggregated directly from database records. Attendance and result reports are exported per class from the Attendance and Results pages." actions={<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / save as PDF</Button>} />
      <Tabs tabs={[{ id: 'analytics', label: 'Placement analytics' }, { id: 'exports', label: 'CSV exports' }]} value={tab} onChange={setTab} />
      {tab === 'analytics' ? <PlacementAnalytics /> : (
        <div className="grid gap-4 md:grid-cols-2">{EXPORTS.filter((e) => e.roles.includes(user!.role)).map((e) => (
          <Card key={e.type}><CardHeader title={e.label} /><div className="flex items-center justify-between gap-3 p-5"><p className="text-sm text-muted-fg">{e.desc}</p><Button variant="outline" onClick={() => download(`/reports/${e.type}`, `${e.type}.csv`, { format: 'csv' }).catch(toastError)}><Download className="h-4 w-4" />CSV</Button></div></Card>))}</div>)}
    </>
  );
}
