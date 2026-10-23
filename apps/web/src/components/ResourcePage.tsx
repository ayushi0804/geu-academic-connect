import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, toastError } from '@/lib/api';
import { useApi, useDebounced } from '@/lib/hooks';
import { DynamicForm, type Field } from './DynamicForm';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, Pagination, PageHeader, Select, SkeletonRows } from './ui';

export interface Column { key: string; label: string; sortable?: boolean; render?: (row: any) => ReactNode; className?: string }
export interface FilterDef { key: string; label: string; options?: { value: string; label: string }[]; endpoint?: string; optionLabel?: (i: any) => string }
export interface ResourceProps {
  title?: string; description?: string; endpoint: string; columns: Column[]; fields?: Field[]; filters?: FilterDef[]; baseQuery?: Record<string, unknown>;
  noun?: string; canCreate?: boolean; canEdit?: boolean | ((r: any) => boolean); canDelete?: boolean | ((r: any) => boolean); pageSize?: number; searchable?: boolean;
  rowActions?: (row: any, refetch: () => void) => ReactNode; headerActions?: ReactNode; emptyHint?: string; wide?: boolean; embedded?: boolean;
  defaultSort?: string; mapPayload?: (p: Record<string, any>, editing?: any) => Record<string, any>; onSaved?: (resp: any, kind: 'create' | 'update') => void;
  afterCreateNotice?: (resp: any) => ReactNode; transformInitial?: (row: any) => any; createDefaults?: Record<string, any>;
}

function FilterSelect({ f, value, onChange }: { f: FilterDef; value: string; onChange: (v: string) => void }) {
  const remote = useApi<any[]>(f.endpoint ?? '/__none__', { limit: 100 }, { enabled: !!f.endpoint });
  const opts = f.options ?? (remote.data?.data ?? []).map((i: any) => ({ value: i._id, label: f.optionLabel ? f.optionLabel(i) : i.name ?? i.label ?? i.code }));
  return <Select aria-label={f.label} value={value} onChange={(e) => onChange(e.target.value)} className="w-auto min-w-36"><option value="">{f.label}: all</option>{opts.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
}

/** Generic, API-backed list + create/edit/delete page used by most admin-style screens. */
export function ResourcePage(p: ResourceProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(p.defaultSort ?? '');
  const [fv, setFv] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const dq = useDebounced(q);
  const query = { page, limit: p.pageSize ?? 10, q: dq || undefined, sort: sort || undefined, ...fv, ...p.baseQuery };
  const list = useApi<any[]>(p.endpoint, query);
  const refresh = () => qc.invalidateQueries({ queryKey: [p.endpoint] });
  const noun = p.noun ?? 'record';

  const save = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const body = p.mapPayload ? p.mapPayload(payload, editing) : payload;
      return editing ? api(`${p.endpoint}/${editing._id}`, { method: 'PATCH', body }) : api(p.endpoint, { method: 'POST', body });
    },
    onSuccess: (r) => { toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} ${editing ? 'updated' : 'created'}`); const kind = editing ? 'update' : 'create'; setEditing(null); setCreating(false); refresh(); p.onSaved?.(r.data, kind); if (kind === 'create' && p.afterCreateNotice) setNotice(p.afterCreateNotice(r.data)); },
    onError: toastError,
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`${p.endpoint}/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success(`${noun} deleted`); setDeleting(null); refresh(); },
    onError: (e) => { toastError(e); setDeleting(null); },
  });

  const can = (v: boolean | ((r: any) => boolean) | undefined, r: any) => (typeof v === 'function' ? v(r) : !!v);
  const toggleSort = (k: string) => setSort((s) => (s === k ? `-${k}` : s === `-${k}` ? '' : k));
  const rows = list.data?.data ?? [];
  const hasActions = !!p.rowActions || p.canEdit || p.canDelete;
  const filtering = !!(dq || Object.values(fv).some(Boolean));

  const body = (
    <Card className="overflow-hidden">
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-border p-3">
        {p.searchable !== false && <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" /><Input aria-label={`Search ${noun}s`} placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" /></div>}
        {p.filters?.map((f) => <FilterSelect key={f.key} f={f} value={fv[f.key] ?? ''} onChange={(v) => { setFv((s) => ({ ...s, [f.key]: v })); setPage(1); }} />)}
        {p.headerActions}
        {p.canCreate && p.fields && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New {noun}</Button>}
      </div>
      {notice && <div className="border-b border-border bg-accent/10 p-3 text-sm">{notice}<button className="ml-3 underline" onClick={() => setNotice(null)}>Dismiss</button></div>}
      {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? (
        <EmptyState title={filtering ? 'No matches found' : `No ${noun}s yet`} hint={filtering ? 'Try a different search or clear the filters.' : p.emptyHint ?? `Create the first ${noun} to get started.`}
          action={!filtering && p.canCreate && p.fields ? <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New {noun}</Button> : undefined} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-border bg-muted/50"><tr>
              {p.columns.map((c) => (
                <th key={c.key} className="th" aria-sort={sort === c.key ? 'ascending' : sort === `-${c.key}` ? 'descending' : undefined}>
                  {c.sortable ? <button className="inline-flex items-center gap-1 uppercase" onClick={() => toggleSort(c.key)}>{c.label}{sort === c.key ? <ArrowUp className="h-3 w-3" /> : sort === `-${c.key}` ? <ArrowDown className="h-3 w-3" /> : null}</button> : c.label}
                </th>
              ))}
              {hasActions && <th className="th text-right">Actions</th>}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r: any) => (
                <tr key={r._id} className="hover:bg-muted/40">
                  {p.columns.map((c) => <td key={c.key} className={`td ${c.className ?? ''}`}>{c.render ? c.render(r) : String(r[c.key] ?? '—')}</td>)}
                  {hasActions && <td className="td"><div className="flex justify-end gap-1">
                    {p.rowActions?.(r, refresh)}
                    {can(p.canEdit, r) && p.fields && <Button variant="ghost" size="sm" aria-label={`Edit ${noun}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>}
                    {can(p.canDelete, r) && <Button variant="ghost" size="sm" aria-label={`Delete ${noun}`} onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-danger" /></Button>}
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={list.data?.meta} onPage={setPage} />
    </Card>
  );

  return (
    <>
      {!p.embedded && p.title && <PageHeader title={p.title} description={p.description} />}
      {body}
      {p.fields && (
        <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={`${editing ? 'Edit' : 'New'} ${noun}`} wide={p.wide}>
          <DynamicForm key={editing?._id ?? 'new'} fields={p.fields} initial={editing ? (p.transformInitial ? p.transformInitial(editing) : editing) : p.createDefaults} editing={!!editing} loading={save.isPending} onSubmit={(v) => save.mutate(v)} onCancel={() => { setCreating(false); setEditing(null); }} submitLabel={editing ? 'Save changes' : 'Create'} />
        </Modal>
      )}
      <ConfirmDialog open={!!deleting} danger title={`Delete ${noun}?`} message="This action cannot be undone. Records that are in use cannot be deleted." confirmLabel="Delete" loading={del.isPending} onConfirm={() => del.mutate(deleting._id)} onClose={() => setDeleting(null)} />
    </>
  );
}
