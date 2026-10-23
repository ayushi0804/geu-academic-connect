import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DynamicForm, buildSchema, toFormValues, toPayload, type Field } from '@/components/DynamicForm';

const fields: Field[] = [
  { name: 'title', label: 'Title', type: 'text', required: true, minLength: 3 },
  { name: 'marks', label: 'Marks', type: 'number', required: true, min: 0, max: 10 },
  { name: 'tags', label: 'Tags', type: 'tags' },
  { name: 'published', label: 'Published', type: 'checkbox' },
];

describe('buildSchema', () => {
  const schema = buildSchema(fields);
  it('requires required fields and enforces length and numeric bounds', () => {
    expect(schema.safeParse({ title: '', marks: '', tags: '', published: false }).success).toBe(false);
    expect(schema.safeParse({ title: 'ab', marks: '5', published: false }).success).toBe(false);
    expect(schema.safeParse({ title: 'abc', marks: '11', published: false }).success).toBe(false);
    expect(schema.safeParse({ title: 'abc', marks: 'x', published: false }).success).toBe(false);
    expect(schema.safeParse({ title: 'abc', marks: '7', tags: '', published: true }).success).toBe(true);
  });
});

describe('payload conversion', () => {
  it('converts strings to numbers, tags to arrays and drops empty optionals', () => {
    expect(toPayload(fields, { title: 'Hello', marks: '8', tags: 'a, b ,,c', published: true })).toEqual({ title: 'Hello', marks: 8, tags: ['a', 'b', 'c'], published: true });
    expect(toPayload(fields, { title: 'Hello', marks: '8', tags: '', published: false })).toEqual({ title: 'Hello', marks: 8, published: false });
  });
  it('maps API rows (populated refs, dates, arrays) back to form values', () => {
    const f: Field[] = [{ name: 'dept', label: 'D', type: 'ref' }, { name: 'due', label: 'Due', type: 'date' }, { name: 'skills', label: 'S', type: 'tags' }, { name: 'deps', label: 'X', type: 'multiref' }];
    expect(toFormValues(f, { dept: { _id: 'abc', name: 'CSE' }, due: '2026-03-04T10:00:00.000Z', skills: ['a', 'b'], deps: [{ _id: '1' }, '2'] })).toEqual({ dept: 'abc', due: '2026-03-04', skills: 'a, b', deps: ['1', '2'] });
  });
});

describe('<DynamicForm />', () => {
  it('shows validation errors and does not submit invalid data', async () => {
    const onSubmit = vi.fn();
    render(<DynamicForm fields={fields} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThanOrEqual(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('submits a typed payload when valid', async () => {
    const onSubmit = vi.fn();
    render(<DynamicForm fields={fields} onSubmit={onSubmit} submitLabel="Create" />);
    await userEvent.type(screen.getByLabelText(/Title/), 'Quiz 1');
    await userEvent.type(screen.getByLabelText(/Marks/), '9');
    await userEvent.click(screen.getByLabelText('Published'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ title: 'Quiz 1', marks: 9, published: true }));
  });
  it('does not require read-only fields when editing', async () => {
    const onSubmit = vi.fn();
    const f: Field[] = [{ name: 'email', label: 'Email', type: 'email', required: true, readOnlyOnEdit: true }, { name: 'name', label: 'Name', type: 'text', required: true }];
    render(<DynamicForm fields={f} editing initial={{ email: 'a@b.co', name: 'Old' }} onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/Email/)).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Old' }));
  });
});
