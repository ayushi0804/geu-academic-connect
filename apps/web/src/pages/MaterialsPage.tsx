import { useState } from 'react';
import { ResourcePage } from '@/components/ResourcePage';
import { Badge, PageHeader, Tabs } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';
import { DownloadBtn } from './AssignmentsPage';
import type { Field } from '@/components/DynamicForm';

const CATS = ['lecture', 'notes', 'reference', 'lab', 'previous-paper', 'other'].map((c) => ({ value: c, label: c.replace('-', ' ') }));

export function MaterialsPage() {
  const { user } = useAuth();
  const staff = user?.role !== 'student';
  const fields: Field[] = [
    { name: 'subject', label: 'Subject', type: 'ref', required: true, endpoint: '/faculty-assignments', optionValue: (i) => i.subject._id, optionLabel: (i) => `${i.subject.code} · ${i.subject.name}` },
    { name: 'title', label: 'Title', type: 'text', required: true, minLength: 2, maxLength: 160 }, { name: 'category', label: 'Category', type: 'select', required: true, options: CATS, default: 'lecture' },
    { name: 'description', label: 'Description', type: 'textarea', maxLength: 1000 }, { name: 'file', label: 'File', type: 'file', required: true, filePurpose: 'material', fileSubjectField: 'subject' },
  ];
  return (
    <>
      <PageHeader title="Learning materials" description="Subject-wise resource library. Downloads are permission-checked on the server." />
      <ResourcePage endpoint="/materials" noun="material" canCreate={staff} canDelete={staff} fields={fields} emptyHint={staff ? 'Upload notes, slides or references for your subjects.' : 'Your faculty will upload materials for your enrolled subjects.'}
        filters={[{ key: 'subject', label: 'Subject', endpoint: '/subjects', optionLabel: (s) => s.code }, { key: 'category', label: 'Category', options: CATS }]}
        columns={[{ key: 'title', label: 'Title', render: (r) => <div><p className="font-medium">{r.title}</p>{r.description && <p className="max-w-md truncate text-xs text-muted-fg">{r.description}</p>}</div> }, { key: 'subject', label: 'Subject', render: (r) => r.subject?.code },
          { key: 'category', label: 'Category', render: (r) => <Badge>{String(r.category).replace('-', ' ')}</Badge> }, { key: 'uploadedBy', label: 'By', render: (r) => r.uploadedBy?.name }, { key: 'createdAt', label: 'Added', render: (r) => fmtDate(r.createdAt) },
          { key: 'file', label: 'File', render: (r) => r.file && <DownloadBtn id={r.file._id} name={r.file.originalName} /> }]} />
    </>
  );
}

export function DirectoryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('faculty');
  const canStudents = user?.role === 'faculty' || user?.role === 'admin';
  return (
    <>
      <PageHeader title="Directory" description={canStudents ? 'Faculty directory, plus students you teach (faculty) or all students (admins).' : 'Find faculty members and their departments.'} />
      {canStudents && <Tabs tabs={[{ id: 'faculty', label: 'Faculty' }, { id: 'student', label: 'Students' }]} value={tab} onChange={setTab} />}
      <ResourcePage key={tab} endpoint="/users/directory" noun={tab} baseQuery={{ role: tab }} filters={[{ key: 'department', label: 'Department', endpoint: '/departments', optionLabel: (d) => d.code }]}
        columns={tab === 'faculty'
          ? [{ key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> }, { key: 'designation', label: 'Designation' }, { key: 'department', label: 'Department', render: (r) => r.department?.name }, { key: 'email', label: 'Email' }]
          : [{ key: 'idNumber', label: 'ID', render: (r) => <span className="font-mono text-xs">{r.idNumber}</span> }, { key: 'name', label: 'Name', render: (r) => <span className="font-medium">{r.name}</span> }, { key: 'department', label: 'Department', render: (r) => r.department?.code }, { key: 'semester', label: 'Sem' }, { key: 'section', label: 'Sec' }]} />
    </>
  );
}
