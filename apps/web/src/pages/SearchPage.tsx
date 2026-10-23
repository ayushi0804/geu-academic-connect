import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '@/components/ui';
import { useApi } from '@/lib/hooks';

const LABELS: Record<string, string> = { notices: 'Notices', subjects: 'Subjects', materials: 'Learning materials', assignments: 'Assignments', faculty: 'Faculty', opportunities: 'Placement opportunities' };

export function SearchPage() {
  const [sp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const [type, setType] = useState('');
  const res = useApi<Record<string, any[]>>('/search', { q, types: type || undefined }, { enabled: q.trim().length >= 2 });
  const groups = Object.entries(res.data?.data ?? {}).filter(([, v]) => v.length);
  return (
    <>
      <PageHeader title={q ? `Results for “${q}”` : 'Search'} description="Searches only what your account is allowed to see." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by category">{[['', 'All'], ...Object.entries(LABELS)].map(([k, l]) => <button key={k} aria-pressed={type === k} onClick={() => setType(k)} className={`rounded-full border px-3 py-1 text-sm ${type === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>{l}</button>)}</div>
      {q.trim().length < 2 ? <Card><EmptyState title="Type at least 2 characters" hint="Use the search box in the top bar." /></Card> : res.isLoading ? <Card><SkeletonRows /></Card> : res.isError ? <Card><ErrorState error={res.error} onRetry={() => res.refetch()} /></Card> : groups.length === 0 ? <Card><EmptyState icon={<SearchX className="h-5 w-5" />} title="No results" hint="Check the spelling or try fewer words. Private records you can’t access are never shown." /></Card> : (
        <div className="space-y-4">{groups.map(([k, items]) => <Card key={k}><div className="border-b border-border px-5 py-3 font-semibold">{LABELS[k]} <span className="text-sm font-normal text-muted-fg">({items.length})</span></div>
          <ul className="divide-y divide-border">{items.map((i) => <li key={i.id}><Link to={i.link} className="block px-5 py-3 text-sm hover:bg-muted"><span className="font-medium">{i.title}</span>{i.subtitle && <span className="ml-2 text-xs capitalize text-muted-fg">{i.subtitle}</span>}</Link></li>)}</ul></Card>)}</div>)}
    </>
  );
}
