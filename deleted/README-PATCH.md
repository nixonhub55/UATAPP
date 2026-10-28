# UAT Monitoring Facilities Patch (based on your uploaded revised backup)

This patch is based on the `uatmoon.rar` backup supplied for this conversation. It preserves the existing scenario and multi-assignment code in that backup.

## Included
- Project Incharge sees only projects they created.
- Tester and Tech/Dev project visibility is based on test cases assigned to that user (including legacy single-assignee fields).
- Project Trash for Project Incharge only; soft-delete and restore preserve test cases, attachments, and history.
- Automatic logout after 5 minutes without browser activity.
- Optional Gmail notifications via SMTP using a Google App Password.

## Before applying
1. Stop the frontend and backend.
2. Make a separate backup of your current working `C:\AIProjects\uatmoon` folder.
3. Keep your existing `.env` file private and unchanged. This patch does not include your `.env`.
4. Do not drop or recreate your database.

## Apply the files
Extract this ZIP into `C:\AIProjects\uatmoon` and allow these included files to overwrite the matching files:
- `backend/src/server.js`
- `backend/package.json`
- `backend/.env.example`
- `frontend/src/App.jsx`
- `database/schema.sql`
- `database/migrate_v6_facilities.sql`

## Database migration
For an existing database, run `database/migrate_v6_facilities.sql` once against `uat_monitoring`. This adds `projects.deleted_at`; it does not delete project data.
Do not run the migration more than once. For a brand-new database created from the updated `database/schema.sql`, do not run the migration separately.

## Install backend dependency
Open Command Prompt:
```bat
cd C:\AIProjects\uatmoon\backend
npm install
```
This installs Nodemailer and updates `package-lock.json`. If you prefer to keep the lockfile committed, include the updated `package-lock.json` in your own backup after npm install.

## Enable Gmail notifications
1. Turn on 2-Step Verification for the Google account that will send mail.
2. Create a Google App Password in that account. Do not use your normal Gmail password.
3. Add these lines to your existing `backend/.env` (keep all existing DB/JWT settings):
```dotenv
GMAIL_USER=your.gmail.address@gmail.com
GMAIL_APP_PASSWORD=your-16-character-app-password
```
4. Restart the backend. Email sending is optional; without these variables, in-app notifications continue to work normally.

## Start and test
Terminal 1:
```bat
cd C:\AIProjects\uatmoon\backend
npm run dev
```
Terminal 2:
```bat
cd C:\AIProjects\uatmoon\frontend
npm run dev
```
Test with separate accounts:
- PI A should see only projects PI A created, and only PI A should see them in Trash.
- PI A moves a project to Trash, then restores it.
- A Tester / Tech-Dev should see a project only when a case in that project is assigned to them.
- Leave the app idle for five minutes; it should sign out.
- Assign a project or other action that triggers an existing notification; confirm the recipient receives email when Gmail is configured.

## Important
This is a code patch, not an executable installer. Run it against a backup first and test with non-production data before relying on it.
