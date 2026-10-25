# 🎓 GEU Academic Connect

### A Unified Academic Management Platform for Students, Faculty, Administrators & Placement Teams

<p align="center">
  <strong>Bringing Academic Activities, Attendance, Assessments, Assignments and Placements Together.</strong>
</p>

<p align="center">
  <a href="https://geu-academic-connect-web.onrender.com">🌐 Live Demo</a> •
  <a href="https://github.com/ayushi0804/geu-academic-connect">📂 GitHub Repository</a>
</p>

---

## 📌 About the Project

**GEU Academic Connect** is a web-based academic management platform designed to bring essential university activities into one centralized system. It provides separate dashboards and role-based functionality for administrators, students, faculty members, and placement officers.

The platform aims to simplify academic workflows, improve access to academic information, and reduce the need to manage different activities across disconnected systems.

From checking attendance and academic results to managing assignments, notices, timetables, and placement opportunities, GEU Academic Connect provides a unified interface for everyday academic activities.

## ✨ Key Features

### 👨‍💼 Admin Dashboard
- Centralized academic administration.
- Management of academic information and platform users.
- Access to administrative analytics and system information.
- Management of notices and institutional activities.

### 🎓 Student Portal
- View attendance records and attendance statistics.
- Access academic results and assessment marks.
- View class timetables and published notices.
- Access assignments, submissions, and learning materials.
- Explore placement opportunities and application status.
- Receive notifications related to academic activities.

### 👩‍🏫 Faculty Portal
- Access assigned classes and academic information.
- Manage student attendance.
- Work with assignments and student submissions.
- Manage assessment marks and academic results.
- Access faculty-related notices and notifications.

### 💼 Placement Management
- Explore placement opportunities and company information.
- View eligibility requirements for opportunities.
- Apply for eligible opportunities.
- Track application progress and placement-related updates.

### 🔐 Security & Access Control
- Role-based access for different user types.
- Protected routes and authenticated API requests.
- Secure, HTTP-only authentication cookies.
- Password hashing for stored user credentials.
- Separate access permissions for administrative, faculty, student, and placement functions.

### 📊 Academic Data & Insights
- Centralized access to academic records.
- Attendance, assessment, and assignment information.
- Timetable and academic notice management.
- Dashboard views tailored to user roles.

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express.js, TypeScript |
| Database | MongoDB, MongoDB Atlas |
| Authentication | JWT-based authentication, HTTP-only cookies |
| API | REST API |
| Deployment | Render |
| Version Control | Git, GitHub |

## 🏗️ System Architecture

```text
                 ┌────────────────────────┐
                 │       Web Browser      │
                 │  React + TypeScript    │
                 └────────────┬───────────┘
                              │
                         HTTPS / REST
                              │
                 ┌────────────▼───────────┐
                 │      Express API       │
                 │    Node.js + TS        │
                 │ Authentication & RBAC  │
                 └────────────┬───────────┘
                              │
                         Mongoose / DB
                              │
                 ┌────────────▼───────────┐
                 │     MongoDB Atlas      │
                 │ Academic Application   │
                 │         Data           │
                 └────────────────────────┘
```

The frontend communicates with the backend through REST API endpoints. The backend handles authentication, authorization, business logic, and database operations. MongoDB Atlas stores the application's persistent data.

## 🌐 Live Demo

**Try the deployed application:**

👉 https://geu-academic-connect-web.onrender.com

The application includes fictional demo accounts and sample academic data for demonstration purposes.

> **Note:** The backend is hosted on Render. If the service has been idle, the first request may take some time while the service starts.

## 🚀 Run Locally

### Prerequisites

Make sure the following are installed:

- Node.js and npm
- Git
- A MongoDB database, such as a local MongoDB instance or MongoDB Atlas account

### 1. Clone the Repository

```bash
git clone https://github.com/ayushi0804/geu-academic-connect.git
cd geu-academic-connect
```

### 2. Install Dependencies

Install the dependencies required by the project using the repository's package configuration.

```bash
npm install
```

If the repository uses separate frontend and backend packages, follow the relevant package scripts and setup instructions in those directories.

### 3. Configure Environment Variables

Create the required environment configuration files for the backend and frontend based on the project's existing environment examples and configuration code.

Typical configuration values may include:

```env
# Backend — use the actual variable names required by the project
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_strong_random_secret
CLIENT_ORIGIN=http://localhost:5173
```

```env
# Frontend
VITE_API_URL=http://localhost:8000
```

**Important:** These names are illustrative. Check the project's environment configuration for the exact variable names and backend port before running the application. Never commit real database credentials, JWT secrets, or passwords to GitHub.

### 4. Start the Application

Run the frontend and backend using the scripts defined in their respective `package.json` files.

For example, if the project defines these scripts:

```bash
# Start the backend
npm run dev
```

```bash
# Start the frontend in its own terminal
npm run dev
```

The actual commands depend on the package scripts configured in the repository.

## 📁 Project Structure

```text
geu-academic-connect/
├── apps/
│   ├── api/                  # Backend API
│   │   └── src/
│   │       ├── config/       # Environment configuration
│   │       ├── middleware/   # Authentication and access control
│   │       ├── models/       # Database models
│   │       ├── routes/       # API routes
│   │       ├── services/     # Application services
│   │       ├── utils/        # Utility functions
│   │       ├── app.ts        # Express application
│   │       └── seed.ts       # Database seed script
│   └── web/                  # Frontend application
│       └── src/
│           └── lib/
│               └── api.ts    # API client
├── package.json
├── README.md
└── ...
```

*This is a high-level overview; the exact directory and configuration files may differ slightly.*

## 🔒 Security & Demo Data

- Demo accounts use fictional academic identities.
- Do not use real student records or sensitive personal information in a public demonstration.
- Never publish production passwords, database connection strings, access tokens, or private environment variables.
- Use separate credentials for each demo role.
- Keep production secrets in the hosting provider's environment-variable settings.

## 🧪 Testing

The deployed application has been manually checked for:

- Admin, student, and faculty login.
- Role-specific dashboards.
- Access to displayed academic data.
- Basic role-based page access.
- Attendance, assessment, assignment, and related academic views.
- Session persistence and application navigation.

These checks represent manual verification of the tested workflows and do not imply that every possible edge case or automated test has been covered.

## 🎯 Project Objectives

- Centralize academic activities in a single web application.
- Improve access to attendance, results, assignments, and timetables.
- Provide role-specific functionality for different university stakeholders.
- Support placement discovery and application tracking.
- Deliver a responsive, maintainable, and deployable application.

## 🔮 Future Enhancements

- Email notifications and automated reminders.
- More detailed academic analytics and visual reports.
- Additional accessibility and mobile usability improvements.
- Automated integration and end-to-end testing.
- Expanded deployment monitoring and performance optimization.

## 👩‍💻 Author

**Ayushi Singh**

Computer Science & Engineering Student

- GitHub: [@ayushi0804](https://github.com/ayushi0804)

## 📄 License

No license has been specified yet. Unless a license is added to the repository, reuse and redistribution remain subject to the applicable copyright rules.

---

<p align="center">
  <strong>GEU Academic Connect</strong><br/>
  Connecting Academic Activities Through One Unified Platform 🎓
</p>
