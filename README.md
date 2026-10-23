# GEU Academic Connect

A full-stack university management and student-engagement platform with four role-based portals: **Student, Faculty, Administrator, and Placement Officer**.

> **Important:** This is a fictional demo and portfolio project. It is not an official Graphic Era University (GEU) product and is not endorsed by GEU. It uses no university logos and contains fictional demo data. Grading rules, attendance rules, and placement figures are configurable demo defaults, not official university policies.

## Tech Stack

**Frontend**
- React 18
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- React Hook Form and Zod
- Recharts
- Vitest and React Testing Library

**Backend**
- Node.js
- Express
- TypeScript
- MongoDB and Mongoose
- Zod validation
- JWT authentication using HTTP-only cookies
- bcrypt password hashing
- Vitest and Supertest

---

## Verification Status

The project has been installed, tested, built, and manually checked in a local development environment.

| Check | Result |
|---|---|
| Dependency installation (`npm install`) | Completed |
| Backend automated tests | Passed — 58 tests |
| Frontend automated tests | Passed — 23 tests |
| Total automated tests | **81/81 passed** |
| Production build (`npm run build`) | Successful |
| Admin login and dashboard | Manually checked |
| Student login and dashboard | Manually checked |
| Faculty login and dashboard | Manually checked |
| Student attendance, results, assignments, and placements pages | Data visibility checked |
| Faculty attendance persistence | Saved attendance remained after refreshing |
| Responsive layout | Basic mobile viewport checked; further device and page testing remains useful |
| `npm run typecheck` and `npm run lint` | Not independently verified |
| Production deployment | Not yet verified |

### Known Build Note

The production build completes successfully. Vite reports that the main JavaScript bundle exceeds its configured warning threshold. Code splitting and lazy loading may help reduce the initial download size.

Local checks do not guarantee that every possible workflow, device size, or production security control has been verified.

---

## Features

### Authentication and Security
- Role-based authentication for students, faculty, administrators, and placement officers.
- Invitation-based account activation.
- bcrypt password hashing.
- HTTP-only session cookies.
- Session revocation using token versioning.
- Password-reset tokens with expiry and single-use validation.
- Rate limiting and account lockout after repeated failures.
- Helmet security headers and CORS configuration.
- CSRF protection for cookie-authenticated state-changing requests.
- Zod request validation and protection against unwanted fields.
- Audit logging.
- Server-side authorization for protected operations.

### Student Portal
- Student dashboard with academic information.
- CGPA/SGPA and results.
- Subject-wise attendance and attendance trends.
- Assignments and submissions.
- Timetable and academic calendar.
- Notices and notifications.
- Placement opportunities and applications.
- Interview and offer information.
- Deadline reminders and activity information.

### Faculty Portal
- Assigned classes and student lists.
- Attendance marking and attendance history.
- Assignment creation and submission management.
- Assignment grading and feedback.
- Assessment and marks entry.
- Results publishing and unpublishing.
- Class performance analytics.
- CSV exports.
- Notices and academic information.

### Administrator Portal
- User management and role/status updates.
- Departments and academic programs.
- Academic years and semesters.
- Subject management.
- Faculty allocation and enrollment.
- Timetable management with conflict detection.
- Academic events and notices.
- Audit logs.
- Configurable academic thresholds and grading policies.
- Analytics and CSV reports.

### Placement Portal
- Company and recruiter management.
- Placement drives and opportunities.
- Eligibility based on CGPA, semester, and department.
- Student applications and application-status transitions.
- Interview scheduling and offers.
- Placement analytics, including application funnels and package information.
- CSV exports.

### Cross-Cutting Features
- Authorization-aware global search.
- In-app notifications and unread counts.
- Deadline reminders.
- Private file storage with permission-checked downloads.
- Light and dark themes.
- Responsive, collapsible sidebar.
- OpenAPI documentation at `/api/docs`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for architecture, data models, API structure, security design, and calculation rules.

---

## Quick Start — Windows PowerShell

### 1. Prerequisites

Install the following:

- **Node.js 20 or newer**
- **MongoDB 6, 7, or 8**, installed locally, running in Docker, or hosted through MongoDB Atlas.

Verify the installed versions:

```powershell
node -v
npm -v
```

### 2. Configure MongoDB

Choose one option.

**Option A — Local MongoDB on Windows**

Install MongoDB Community Server and enable installation as a Windows service.

Check its status:

```powershell
Get-Service MongoDB
```

If the service is stopped, start it in an elevated PowerShell terminal:

```powershell
Start-Service MongoDB
```

Example connection string:

```text
mongodb://127.0.0.1:27017/geu_academic_connect
```

**Option B — Docker**

If Docker is installed and running:

```powershell
docker run -d --name geu-mongo -p 27017:27017 -v geu-mongo-data:/data/db mongo:7
```

**Option C — MongoDB Atlas**

1. Create a MongoDB Atlas cluster.
2. Create a database user.
3. Configure network access for your development environment.
4. Copy the connection string and use it as `MONGODB_URI`.

Never commit database credentials or connection strings containing passwords.

### 3. Install Dependencies

Open PowerShell in the project root:

```powershell
npm install
```

### 4. Configure Environment Variables

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

Generate a strong JWT secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Open the environment file:

```powershell
notepad .env
```

Configure the required variables using your own local values.

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Strong, randomly generated secret of at least 32 characters |
| `ADMIN_EMAIL` | Initial administrator email |
| `ADMIN_PASSWORD` | Initial administrator password |
| `ADMIN_NAME` | Initial administrator display name |
| `SEED_DEMO_PASSWORD` | Shared password for newly created fictional demo accounts |
| `CLIENT_ORIGIN` | Allowed frontend origin; normally `http://localhost:5173` locally |
| `UPLOAD_DIR` | Private upload storage directory |
| `MAX_FILE_MB` | Maximum permitted upload size |
| `COOKIE_SECURE` | Cookie security setting; enable for HTTPS production deployments |
| `SMTP_*` | Optional SMTP configuration for email delivery |

Keep `.env` private. Do not share its contents or upload it to a public repository.

### 5. Create the Initial Administrator

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` in `.env`, then run:

```powershell
npm run seed
```

The seed command creates the initial administrator if one does not already exist. If the account already exists, its password is left unchanged.

Use a strong password and change it after the first login if the application's account settings support doing so.

### 6. Load Fictional Demo Data

To create the demo users and academic records, configure `SEED_DEMO_PASSWORD` in `.env` and run:

```powershell
npm run seed:demo
```

The demo seed creates fictional records such as:

- 3 departments and 10 subjects.
- 6 faculty accounts and 1 placement officer.
- 26 student accounts.
- Timetable entries and attendance records.
- Assessments and published results.
- Assignments, submissions, and learning materials.
- Notices and academic events.
- Companies, placement opportunities, applications, interviews, and offers.
- Notifications and audit records.

The seed script does not overwrite passwords for existing accounts. Its activity-data seed marker also prevents the main demo activity data from being seeded repeatedly.

### Demo Login Accounts

All newly created demo users share the password configured through `SEED_DEMO_PASSWORD`. An account that already existed may retain a different password.

| Role | Example email |
|---|---|
| Administrator | The `ADMIN_EMAIL` configured in `.env` |
| Faculty | `faculty1@demo.geu-academic-connect.example` through `faculty6@demo.geu-academic-connect.example` |
| Placement Officer | `placement1@demo.geu-academic-connect.example` |
| Students | `student01@demo.geu-academic-connect.example` through `student26@demo.geu-academic-connect.example` |

The `demo.geu-academic-connect.example` domain is reserved for examples; these are local demo accounts, not real university email addresses.

### 7. Run the Application

The project contains separate frontend and backend applications.

Start the backend in the first terminal:

```powershell
npm run dev -w apps/api
```

Start the frontend in a second terminal:

```powershell
npm run dev -w apps/web
```

Keep both terminals running.

Open the frontend:

- Web application: `http://localhost:5173`
- API base: `http://localhost:5000/api/v1`
- API health endpoint: `http://localhost:5000/api/health`
- API documentation: `http://localhost:5000/api/docs`

If your local configuration uses a different port or API prefix, follow the values configured in the project.

---

## Testing and Quality

Run the automated test suites from the project root:

```powershell
npm test
```

The verified test results for the current project state are:

- Backend: 58 tests passed.
- Frontend: 23 tests passed.
- Total: **81 tests passed**.

Other available quality commands include:

```powershell
npm run typecheck
npm run lint
npm run build
npm run format
```

The production build has completed successfully in the local environment. The typecheck and lint commands have not been independently verified as separate commands.

### Test Coverage

The automated suites include checks for areas such as:

- Authentication, login failures, session cookies, logout, and session revocation.
- Password-reset and invitation flows.
- Role-based access control and student-data isolation.
- Faculty subject restrictions.
- Attendance creation, editing, calculations, and duplicate prevention.
- Assignment deadlines, submissions, grading limits, and resubmission rules.
- File validation and download permissions.
- Marks validation, published versus draft results, and CGPA calculations.
- Placement eligibility, duplicate applications, and application-status transitions.
- Notice audiences, notification privacy, and read state.
- Input validation, malformed JSON, mass-assignment protection, and timetable conflicts.
- Frontend forms, route guards, pagination, dialogs, and API-client behavior.

The API tests use `mongodb-memory-server`. Its MongoDB binary may need to be downloaded the first time the tests run, requiring an internet connection. The test suite is designed to use an in-memory MongoDB instance rather than your normal application database.

---

## Production Build and Deployment

Build the frontend and backend:

```powershell
npm run build
```

Run the backend in production mode after configuring the production environment:

```powershell
$env:NODE_ENV = "production"
npm start
```

### Deployment Checklist

Before making the application publicly available:

1. Use a managed MongoDB database with restricted access.
2. Generate a unique production `JWT_SECRET`.
3. Set `NODE_ENV=production`.
4. Enable secure cookies with `COOKIE_SECURE=true` when serving over HTTPS.
5. Configure `CLIENT_ORIGIN` for the real frontend origin.
6. Keep `.env` and all production secrets out of source control.
7. Use HTTPS and a suitable process manager or container platform.
8. Configure persistent storage for uploaded files, or implement a cloud storage provider.
9. Configure appropriate CORS, rate limits, and database permissions.
10. Verify all role permissions and critical workflows in the deployed environment.

### Hosting Architecture

The frontend build is generated in `apps/web/dist`, while the backend build is generated in `apps/api/dist`.

The frontend can be hosted on a static hosting service or CDN. The backend needs a Node.js-compatible hosting environment and access to MongoDB.

For cookie-based authentication, configure the deployment so the frontend and API work with compatible origins and cookie settings. A same-site reverse proxy routing `/api` requests to the backend is one possible setup.

Uploaded files need persistent storage. The current local storage implementation can be replaced with a cloud provider by implementing the storage interface in `apps/api/src/services/files.ts`.

Production deployment has **not yet been verified** for this project.

---

## Troubleshooting

| Problem | Possible solution |
|---|---|
| `Invalid environment configuration` | Check `.env`, required variable names, and `JWT_SECRET` length. |
| `ECONNREFUSED` from MongoDB | Ensure the local MongoDB service or Docker container is running. |
| Login succeeds but API calls return `401` | Use the configured frontend origin and avoid mixing `localhost` with `127.0.0.1`. Check session-cookie settings. |
| `CSRF_REJECTED` | Custom API clients may need `X-Requested-With: XMLHttpRequest` on state-changing requests, unless using the supported Bearer-token flow. |
| Password-reset email does not arrive | Configure SMTP. Without SMTP, email delivery is unavailable; development flows may expose the reset link locally. |
| Administrator account cannot be created | Verify `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME`, then run `npm run seed`. |
| Demo seed reports missing `SEED_DEMO_PASSWORD` | Add the variable to `.env` and rerun `npm run seed:demo`. |
| Tests take time on first run | `mongodb-memory-server` may be downloading its MongoDB binary. |
| Port already in use | Check for an existing process or configure a different port. |
| Frontend cannot reach the API | Verify both development servers are running and check the Vite proxy and API configuration. |

---

## Security Notes

The project implements authentication and authorization mechanisms intended for a portfolio/demo application. Relevant implementation details are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Key areas include:

- bcrypt password hashing.
- HTTP-only session cookies and server-side session revocation.
- Role-based authorization.
- Rate limiting and account lockout.
- Input validation and rejection of unwanted query operators.
- File access permissions and upload validation.
- Audit logging and secret redaction.

These mechanisms still require appropriate configuration and verification before public deployment. Passing automated tests does not guarantee the absence of security vulnerabilities.

---

## Known Limitations

- MongoDB transactions are not used for all multi-document workflows. Unique indexes and idempotent operations are used in relevant seed and bulk-write paths.
- Email delivery requires SMTP configuration. Without it, invitations and password-reset emails are not sent normally.
- The OpenAPI document does not describe every request-body schema in detail.
- Report PDF output uses the browser's Print → Save as PDF functionality where provided; CSV exports are generated by the server.
- Date calculations use the institution's configured time-zone approach, including IST-related utilities.
- Uploaded files are not scanned by an antivirus engine. Add malware scanning before accepting untrusted uploads in a real production environment.
- Sessions use a finite cookie lifetime and can be revoked server-side; the project does not implement refresh-token rotation.
- The current frontend bundle triggers a Vite chunk-size warning. Further code splitting and lazy loading may improve initial loading performance.
- Responsive layouts have received basic local checks, but exhaustive testing across devices and browsers remains outstanding.
- Public production hosting and production security validation remain outstanding.

---

## Project Purpose

GEU Academic Connect demonstrates full-stack development skills across frontend design, backend APIs, database modeling, authentication, role-based access, academic workflows, automated testing, and deployment preparation.

It is intended for learning, demonstration, and portfolio use. All sample users, companies, academic records, and placement opportunities are fictional.