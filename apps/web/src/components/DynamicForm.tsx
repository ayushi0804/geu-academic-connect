import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, errMsg, uploadFile } from '@/lib/api';
import { toLocalInput, fmtSize } from '@/lib/utils';
import { Button, Input, Label, ProgressBar, Select, Textarea } from './ui';

export interface Field {
  name: string; label: string;
  type: 'text' | 'email' | 'textarea' | 'number' | 'date' | 'datetime' | 'time' | 'select' | 'ref' | 'checkbox' | 'tags' | 'multiselect' | 'multiref' | 'file';
  required?: boolean; options?: { value: string; label: string }[]; endpoint?: string; optionLabel?: (item: any) => string; optionQuery?: Record<string, unknown>; optionValue?: (item: any) => string; fileSubject?: string;
  min?: number; max?: number; maxLength?: number; minLength?: number; step?: number; placeholder?: string; help?: string; pattern?: RegExp; patternMessage?: string;
  filePurpose?: string; fileSubjectField?: string; default?: any; hideOnEdit?: boolean; hideOnCreate?: boolean; readOnlyOnEdit?: boolean;
}

/** Builds a Zod schema from field configs (values are kept as strings/booleans/arrays in the form and converted by toPayload). */
export function buildSchema(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === 'checkbox') { shape[f.name] = z.boolean().optional(); continue; }
    if (f.type === 'multiselect' || f.type === 'multiref') { shape[f.name] = f.required ? z.array(z.string()).min(1, 'Select at least one') : z.array(z.string()).optional(); continue; }
    let s: z.ZodTypeAny = z.string({ required_error: 'Required' }).trim();
    if (f.type === 'email') s = (s as z.ZodString).email('Enter a valid email address');
    if (f.maxLength) s = (s as z.ZodString).max(f.maxLength, `At most ${f.maxLength} characters`);
    if (f.minLength) s = (s as z.ZodString).min(f.minLength, `At least ${f.minLength} characters`);
    if (f.pattern) s = (s as z.ZodString).regex(f.pattern, f.patternMessage ?? 'Invalid format');
    if (f.type === 'number') {
      s = (s as z.ZodString).refine((v) => v === '' || !Number.isNaN(Number(v)), 'Enter a number')
        .refine((v) => v === '' || f.min === undefined || Number(v) >= f.min, `Must be at least ${f.min}`)
        .refine((v) => v === '' || f.max === undefined || Number(v) <= f.max, `Must be at most ${f.max}`);
    }
    shape[f.name] = f.required ? (s as z.ZodString).refine((v: string) => v.length > 0, 'Required') : s.optional();
  }
  return z.object(shape);
}

export function toPayload(fields: Field[], v: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const f of fields) {
    const x = v[f.name];
    if (f.type === 'checkbox') out[f.name] = !!x;
    else if (f.type === 'multiselect' || f.type === 'multiref') out[f.name] = x ?? [];
    else if (x === '' || x === undefined || x === null) continue;
    else if (f.type === 'number') out[f.name] = Number(x);
    else if (f.type === 'tags') out[f.name] = String(x).split(',').map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'datetime') out[f.name] = new Date(x).toISOString();
    else out[f.name] = x;
  }
  return out;
}

export function toFormValues(fields: Field[], item?: Record<string, any>) {
  const v: Record<string, any> = {};
  for (const f of fields) {
    const x = item?.[f.name];
    if (f.type === 'checkbox') v[f.name] = x ?? f.default ?? false;
    else if (f.type === 'multiselect') v[f.name] = x ?? f.default ?? [];
    else if (f.type === 'multiref') v[f.name] = (x ?? []).map((e: any) => e?._id ?? e);
    else if (x === undefined || x === null) v[f.name] = f.default !== undefined ? String(f.default) : '';
    else if (f.type === 'ref' || f.type === 'file') v[f.name] = x?._id ?? x;
    else if (f.type === 'date') v[f.name] = String(x).slice(0, 10);
    else if (f.type === 'datetime') v[f.name] = toLocalInput(x);
    else if (f.type === 'tags') v[f.name] = Array.isArray(x) ? x.join(', ') : x;
    else v[f.name] = String(x);
  }
  return v;
}

function useOptions(f: Field) {
  const q = useQuery({ queryKey: ['options', f.endpoint, f.optionQuery ?? {}], enabled: !!f.endpoint, staleTime: 60_000, queryFn: async () => (await api<any[]>(f.endpoint!, { query: { limit: 100, ...f.optionQuery } })).data });
  const label = f.optionLabel ?? ((i: any) => i.name ?? i.label ?? i.title ?? i._id);
  const mapped = f.endpoint ? (q.data ?? []).map((i: any) => ({ value: f.optionValue ? f.optionValue(i) : i._id, label: label(i) })) : (f.options ?? []);
  return { options: mapped.filter((o: any, idx: number) => mapped.findIndex((x: any) => x.value === o.value) === idx), loading: q.isLoading };
}

function FileField({ f, value, onChange, subject, invalid }: { f: Field; value: string; onChange: (v: string) => void; subject?: string; invalid: boolean }) {
  const [state, setState] = useState<{ name?: string; pct: number; error?: string; busy: boolean }>({ pct: 0, busy: false });
  return (
    <div>
      <input id={f.name} type="file" aria-invalid={invalid} className="field file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm" disabled={state.busy}
        onChange={async (e) => {
          const file = e.target.files?.[0]; if (!file) return;
          setState({ name: file.name, pct: 0, busy: true });
          try { const r = await uploadFile(file, f.filePurpose ?? 'material', subject, (pct) => setState((s) => ({ ...s, pct }))); onChange(r.id); setState({ name: `${r.originalName} (${fmtSize(r.size)})`, pct: 100, busy: false }); }
          catch (err) { onChange(''); setState({ name: file.name, pct: 0, busy: false, error: errMsg(err) }); }
        }} />
      {state.busy && <div className="mt-2"><ProgressBar value={state.pct} /></div>}
      {state.name && !state.busy && !state.error && <p className="mt-1 text-xs text-success">Uploaded: {state.name}</p>}
      {state.error && <p role="alert" className="mt-1 text-xs text-danger">{state.error}</p>}
      {f.filePurpose !== 'avatar' && f.fileSubjectField && !subject && <p className="mt-1 text-xs text-muted-fg">Select a subject first.</p>}
    </div>
  );
}

function RefInput({ f, reg, invalid, id }: { f: Field; reg: any; invalid: boolean; id: string }) {
  const { options, loading } = useOptions(f);
  return (
    <Select id={id} aria-invalid={invalid} {...reg} disabled={loading}>
      <option value="">{loading ? 'Loading…' : f.placeholder ?? 'Select…'}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}
function MultiInput({ f, value, onChange }: { f: Field; value: string[]; onChange: (v: string[]) => void }) {
  const { options } = useOptions(f);
  return (
    <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-border p-2">
      {options.length === 0 && <span className="text-xs text-muted-fg">No options</span>}
      {options.map((o) => {
        const on = (value ?? []).includes(o.value);
        return <label key={o.value} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
          <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o.value) : [...(value ?? []), o.value])} />{o.label}</label>;
      })}
    </div>
  );
}

export function DynamicForm({ fields, initial, onSubmit, submitLabel = 'Save', onCancel, loading, editing }: { fields: Field[]; initial?: Record<string, any>; onSubmit: (payload: Record<string, any>) => void | Promise<void>; submitLabel?: string; onCancel?: () => void; loading?: boolean; editing?: boolean }) {
  const visible = fields.filter((f) => !(editing && f.hideOnEdit) && !(!editing && f.hideOnCreate));
  // Read-only-on-edit fields are displayed (disabled) but never validated or submitted
  const submitFields = visible.filter((f) => !(editing && f.readOnlyOnEdit));
  const form = useForm({ resolver: zodResolver(buildSchema(submitFields)), defaultValues: toFormValues(visible, initial) });
  const { register, control, handleSubmit, formState: { errors }, watch } = form;
  return (
    <form noValidate onSubmit={handleSubmit((v) => onSubmit(toPayload(submitFields, v)))} className="grid gap-4 sm:grid-cols-2">
      {visible.map((f) => {
        const err = (errors as any)[f.name]?.message as string | undefined;
        const wide = f.type === 'textarea' || f.type === 'multiselect' || f.type === 'multiref' || f.type === 'file' || f.type === 'tags';
        const disabled = !!(editing && f.readOnlyOnEdit);
        return (
          <div key={f.name} className={wide ? 'sm:col-span-2' : ''}>
            {f.type !== 'checkbox' && <Label htmlFor={f.name} required={f.required}>{f.label}</Label>}
            {f.type === 'textarea' ? <Textarea id={f.name} aria-invalid={!!err} maxLength={f.maxLength} placeholder={f.placeholder} {...register(f.name)} />
              : f.type === 'select' ? <Select id={f.name} aria-invalid={!!err} disabled={disabled} {...register(f.name)}><option value="">{f.placeholder ?? 'Select…'}</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
              : f.type === 'ref' ? <RefInput f={f} id={f.name} reg={register(f.name)} invalid={!!err} />
              : f.type === 'checkbox' ? <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" {...register(f.name)} />{f.label}</label>
              : f.type === 'multiselect' || f.type === 'multiref' ? <Controller control={control} name={f.name} render={({ field }) => <MultiInput f={f} value={field.value} onChange={field.onChange} />} />
              : f.type === 'file' ? <Controller control={control} name={f.name} render={({ field }) => <FileField f={f} value={field.value} onChange={field.onChange} invalid={!!err} subject={f.fileSubject ?? (f.fileSubjectField ? (watch(f.fileSubjectField) as string) : undefined)} />} />
              : <Input id={f.name} aria-invalid={!!err} disabled={disabled} placeholder={f.placeholder} step={f.step} min={f.type === 'number' ? f.min : undefined} max={f.type === 'number' ? f.max : undefined}
                  type={{ text: 'text', email: 'email', number: 'number', date: 'date', datetime: 'datetime-local', time: 'time', tags: 'text' }[f.type as string] ?? 'text'} {...register(f.name)} />}
            {f.help && !err && <p className="mt-1 text-xs text-muted-fg">{f.help}</p>}
            {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
          </div>
        );
      })}
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={loading}>{submitLabel}</Button>
      </div>
    </form>
  );
}
