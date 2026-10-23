import { Router, Request } from 'express';
import { Model } from 'mongoose';
import { z, ZodObject, ZodRawShape } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from './audit';
import { asyncH, escapeRegex, isOid, ok, pageMeta, pageQuery, parseSort } from '../utils/http';
import { badRequest, conflict, notFound } from '../utils/errors';
import type { Role } from '../types';

type FilterKind = 'oid' | 'string' | 'number' | 'boolean';
export interface CrudOptions {
  path: string;
  model: Model<any>;
  resource: string; // used in audit actions, e.g. "department" => department.create
  create: ZodObject<ZodRawShape>;
  update?: ZodObject<ZodRawShape>;
  readRoles?: Role[]; // omitted => any authenticated user
  writeRoles: Role[];
  search?: string[];
  filters?: Record<string, FilterKind>;
  sortable?: string[];
  defaultSort?: Record<string, 1 | -1>;
  populate?: any;
  scope?: (req: Request) => Promise<Record<string, unknown>> | Record<string, unknown>; // extra row-level filter
  beforeSave?: (data: any, req: Request, existing?: any) => Promise<void>;
  afterSave?: (doc: any, req: Request, kind: 'create' | 'update') => Promise<void>;
  guardDelete?: (doc: any) => Promise<string | null>;
}

export function crudRoutes(router: Router, o: CrudOptions) {
  const read = o.readRoles ? [authenticate, requireRole(...o.readRoles)] : [authenticate];
  const write = [authenticate, requireRole(...o.writeRoles)];
  const updateSchema = o.update ?? o.create.partial();
  const pop = (q: any) => (o.populate ? q.populate(o.populate) : q);

  router.get(o.path, ...read, validate({ query: pageQuery.passthrough() }), asyncH(async (req, res) => {
    const { page, limit, q, sort, ...rest } = req.query as any;
    const filter: any = o.scope ? { ...(await o.scope(req)) } : {};
    for (const [k, kind] of Object.entries(o.filters ?? {})) {
      const v = rest[k];
      if (v === undefined || v === '') continue;
      if (typeof v !== 'string') throw badRequest(`Invalid filter ${k}`);
      if (kind === 'oid') { if (!isOid(v)) throw badRequest(`Invalid filter ${k}`); filter[k] = v; }
      else if (kind === 'number') { if (Number.isNaN(Number(v))) throw badRequest(`Invalid filter ${k}`); filter[k] = Number(v); }
      else if (kind === 'boolean') filter[k] = v === 'true';
      else filter[k] = v;
    }
    if (q && o.search?.length) filter.$or = o.search.map((f) => ({ [f]: new RegExp(escapeRegex(q), 'i') }));
    const sortBy = parseSort(sort, o.sortable ?? o.search ?? [], o.defaultSort ?? { createdAt: -1 });
    const [items, total] = await Promise.all([
      pop(o.model.find(filter).sort(sortBy).skip((page - 1) * limit).limit(limit)).lean(),
      o.model.countDocuments(filter),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }));

  router.get(`${o.path}/:id`, ...read, asyncH(async (req, res) => {
    if (!isOid(req.params.id)) throw notFound();
    const scope = o.scope ? await o.scope(req) : {};
    const doc = await pop(o.model.findOne({ _id: req.params.id, ...scope })).lean();
    if (!doc) throw notFound();
    ok(res, doc);
  }));

  router.post(o.path, ...write, validate({ body: o.create }), asyncH(async (req, res) => {
    if (o.beforeSave) await o.beforeSave(req.body, req);
    const doc = await o.model.create(req.body);
    if (o.afterSave) await o.afterSave(doc, req, 'create');
    await audit(req, `${o.resource}.create`, o.resource, doc._id, req.body);
    ok(res, await pop(o.model.findById(doc._id)).lean(), undefined, 201);
  }));

  router.patch(`${o.path}/:id`, ...write, validate({ body: updateSchema }), asyncH(async (req, res) => {
    if (!isOid(req.params.id)) throw notFound();
    const doc = await o.model.findById(req.params.id);
    if (!doc) throw notFound();
    if (o.beforeSave) await o.beforeSave(req.body, req, doc);
    doc.set(req.body);
    await doc.save();
    if (o.afterSave) await o.afterSave(doc, req, 'update');
    await audit(req, `${o.resource}.update`, o.resource, doc._id, req.body);
    ok(res, await pop(o.model.findById(doc._id)).lean());
  }));

  router.delete(`${o.path}/:id`, ...write, asyncH(async (req, res) => {
    if (!isOid(req.params.id)) throw notFound();
    const doc = await o.model.findById(req.params.id);
    if (!doc) throw notFound();
    const block = o.guardDelete ? await o.guardDelete(doc) : null;
    if (block) throw conflict(block);
    await doc.deleteOne();
    await audit(req, `${o.resource}.delete`, o.resource, doc._id);
    ok(res, { id: String(doc._id) });
  }));
}

export { z };
