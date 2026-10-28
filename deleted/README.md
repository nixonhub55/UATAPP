# Project UAT Monitoring System

A local Windows starter application with React + Vite, Express, MariaDB, JWT login, role-based permissions, UAT test cases, retest history, threaded comments, image compression, master tables, and dashboard charts.

## Requirements
- Node.js 20+ (Node 24 should work)
- MariaDB Server
- npm

## 1. Create the database
Open HeidiSQL or the MariaDB command line and run `database/schema.sql`.
The schema creates the `uat_monitoring` database and tables.

## 2. Configure the API
Open a terminal:
```powershell
cd backend
Copy-Item .env.example .env
npm install
```
Edit `.env` and set your MariaDB username/password and a long `JWT_SECRET`.

Create the first administrator:
```powershell
npm run seed:admin
```
The seed script creates a Project Incharge user:
- Email: `admin@uat.local`
- Password: `ChangeMe123!`

**Change the password after first login.** This starter intentionally seeds only one account; create other users from User Management while logged in as Project Incharge.

Start the API:
```powershell
npm run dev
```
API runs at `http://localhost:4000`. Health check: `http://localhost:4000/api/health`.

## 3. Run the React UI
Open a second terminal:
```powershell
cd frontend
npm install
npm run dev
```
Open the URL printed by Vite, usually `http://localhost:5173`.

## Workflow
- Project Incharge creates projects, assigns users, manages master values, and creates/edits test cases.
- Testers can create test cases, record attempts, upload findings evidence, and close cases only after a Pass result.
- Tech/Dev can add technical comments/evidence and move a failed case to `For Review` after a fix.
- All assigned project members can view cases and add nested replies.
- Every test attempt is stored, so a failed test remains visible after retesting.

## Important implementation notes
- Image uploads are resized and converted to WebP using Sharp before storage.
- Files are stored in `backend/uploads`; the database stores attachment metadata.
- In production, serve uploads through authenticated endpoints and use HTTPS. This local starter exposes `/uploads` as static files for ease of development; do not expose sensitive evidence this way on a public server.
- JWT is stored in browser localStorage in this starter for simplicity. For a public deployment, prefer secure, HttpOnly cookies, CSRF protection, rate limiting, audit logging, backups, and a stronger account recovery flow.
- `Status Master` contains Open and Closed. `Result Master` contains Pass, Fail, For Review. `Category Master` contains Functionality and UI.
- API authorization is enforced on the backend, but this is a starter MVP rather than a security-audited production system.


## Revised project features (v2)

- Bulk testcase assignment: Project Incharge can select individual or all test cases in a project and assign or unassign multiple Testers and Tech/Dev users in one operation. Assign/unassign actions preserve other existing assignees. Users must first be project participants.
- Project duplication: duplicate a project and its testcase definitions, select which active users should join the new project, and choose whether to copy current result values, findings, technical notes, and tested dates. When results are not copied, new cases start with no result and Open status. Comments, attachments, and attempt history are intentionally not copied so the new project has its own history.
- In-app notifications: assignment and unassignment notifications, project duplication notifications, unread badge, mark-one-read, and mark-all-read.
- Normalized `test_case_assignments` supports multiple users per testcase while legacy single-assignee columns remain populated for compatibility.

### Upgrade an existing local database

If you already imported the original schema and have working project data, **do not drop the database**. In MariaDB/MySQL, select the `uat_monitoring` database and run `database/migrate_v2.sql` once to add the assignment and notification tables. If you are creating a new database, import the updated `database/schema.sql` instead. Back up your database before applying any schema change.

### New workflow

1. Open **Projects** and open a project to its **Test Cases** view.
2. Choose **Assign / unassign users**. Select specific test cases or **Select all test cases**, choose the action, check the users, and save. Only checked users are added or removed; other assignments are preserved.
3. In **Projects**, choose **Duplicate** on a project. Give the copy a name, choose whether to copy current results, and select participants for the new project. The signed-in Project Incharge is included automatically.
4. Open **Notifications** or click the bell icon to review updates.


## Facilities patch: access, Trash, idle timeout, Gmail notifications

1. Back up your database before applying changes.
2. Run `database/migrate_facilities.sql` against the existing `uat_monitoring` database. If creating a new database from `schema.sql`, do not run the migration afterward (the columns already exist).
3. In `backend`, run `npm install` to install Nodemailer.
4. Add Gmail settings to `backend/.env`. Enable 2-Step Verification on the Google account and create a Google App Password; use that App Password as `MAIL_APP_PASSWORD`, not your regular Gmail password. Set `MAIL_ENABLED=true` after testing.
5. Frontend idle timeout is 5 minutes of no mouse, keyboard, scroll, touch, or click activity. The existing JWT still expires after 8 hours as an additional server-side limit.
6. Restart backend and frontend. Test with one account for each role before using real projects.

Role project visibility is enforced in the project-list query and backend project access checks. PI project list and Trash are limited to projects created by that PI. Tester/Tech-Dev project list uses case-specific assignments (with legacy single-assignee compatibility). Trash is soft-delete; records are retained.
