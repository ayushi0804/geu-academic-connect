# Architecture

```
geu-academic-connect/
├─ apps/
│  ├─ api/   Express + TypeScript + Mongoose
│  │  └─ src/{config,middleware,models,routes,services,utils,docs}, seed.ts, server.ts, app.ts
│  └─ web/   React + Vite + Tailwind
│     └─ src/{components,pages,lib,test}
└─ docs/
```

## API conventions
* Base path `/api/v1`. Success: `{ success: true, data, meta? }` (lists carry `meta: {page, limit, total, totalPages}`).
  Errors: `{ success: false, error: { code, message, details? } }` (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `DUPLICATE`, `RATE_LIMITED`, …).
* Route modules (`routes/*.ts`) hold HTTP concerns; shared business rules live in `services/` (`academics.ts` calculations, `access.ts` ownership/assignment checks,
  `notify.ts`, `audit.ts`, `files.ts`, `notices.ts`, `jobs.ts`). `services/crud.ts` is a small generic CRUD factory used for departments, programs, academic years,
  semesters, subjects, events, companies and drives.
* Middleware order: Helmet → CORS → JSON (1 MB) → cookies → logging → rate limit → `sanitize` (rejects `$`/`.` keys) → CSRF guard → routers → 404 → error handler.

## Data model (MongoDB / Mongoose)
`User` (role, status, department/program/semester/section, prefs) · `PasswordResetToken` (hashed, TTL) · `Department` · `Program` · `AcademicYear` · `Semester` ·
`Subject` · `FacultyAssignment` (unique subject+section+year) · `Enrollment` (unique student+subject+year) · `Timetable` · `AcademicEvent` ·
`Attendance` (unique subject+student+date; `history[]` audit trail) · `Assignment` · `Submission` (unique assignment+student) · `LearningMaterial` ·
`Assessment` · `Result` (unique assessment+student; `history[]`; `subject` denormalised, immutable) · `Notice` · `Notification` (unique user+dedupeKey) ·
`UploadedFile` · `Company` · `PlacementDrive` · `Opportunity` · `Application` (unique opportunity+student; status `history[]`) · `Interview` · `Offer` (unique per application) ·
`AuditLog` · `AppSettings` (singleton: thresholds, grading policy, current year).

Single sources of truth: attendance % and GPA are **always computed** from records, never stored. Result visibility is controlled only by `Assessment.status`.

## Roles & authorization
| Capability | Student | Faculty | Placement | Admin |
|---|---|---|---|---|
| Own dashboard, attendance, results, assignments | ✅ own only | – | – | – |
| Mark attendance / marks / assignments | – | assigned subject+section only | – | any (admin override) |
| Publish notices | – | students of own department | students | any audience |
| Placement management & resumes | apply/withdraw own | – | ✅ | ✅ |
| Users, academic setup, allocations, audit, settings | – | – | – | ✅ |

Checks are enforced in the API (`requireRole`, `assertTeaches`, `canViewStudent`, `canAccessFile`, scoped queries). The React route guard is only UX.

## Calculation rules (configurable in Admin → Configuration)
* **Attendance %** = `(present + late × lateWeight) / (present + late + absent) × 100`; **approved leave is excluded** from the denominator. Default `lateWeight = 0.5`, threshold 75 %.
* **Subject %** = `Σ(marks/max × weightage) / Σ(weightage)` over *published* assessments for which the student has a result.
* **Grade/points** come from the configurable grading policy (default 7-band demo scale, **not official GEU policy**).
* **SGPA/CGPA** = `Σ(points × credits) / Σ(credits)` per semester / overall.
* Attendance edit window: faculty can edit within N days (default 7); admins any date; future dates never.

## Security model
* Passwords: bcrypt (cost 12), complexity policy; reset/invite tokens: 256-bit random, stored as SHA-256, single-use (atomic `findOneAndUpdate`), expiring (1 h / 72 h).
* Sessions: JWT (`sub`, `tokenVersion`) in an HTTP-only, `SameSite=Lax`, `Secure` (prod) cookie; `tokenVersion` is bumped on password change, role change and deactivation, instantly revoking sessions.
* Brute force: global + auth-specific rate limits; account lock for 15 min after 5 failures; identical error for unknown user vs wrong password (dummy bcrypt compare).
* CSRF: state-changing requests need `X-Requested-With`; CORS allow-list with credentials.
* Injection: Zod on every body/query/param; `$`/`.` keys rejected; ObjectId strings validated; regex search inputs escaped; sort fields allow-listed.
* Mass assignment: Zod object schemas strip unknown keys; role/status only writable by admin endpoints.
* Files: random server-side names, extension allow-list per purpose, magic-byte check, size limit, stored outside any static route, downloads via authorised endpoint, `nosniff` via Helmet.
* Audit: sensitive actions recorded with actor/resource/metadata (keys matching pass|token|secret|hash are dropped).
* Production hygiene: no stack traces outside development, `.env` ignored, `.env.example` placeholders only, startup env validation.

## Notifications
Database-backed (`Notification`). Types: assignment, notice, marks, attendance, timetable, placement. Per-user per-type preferences. Background jobs (`services/jobs.ts`) dispatch scheduled notices,
send 24-hour deadline reminders (deduplicated) and clean orphan uploads. Email is sent only when `SMTP_*` is configured **and** the user opted in.
