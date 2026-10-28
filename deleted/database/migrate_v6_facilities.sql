-- UAT Monitoring facilities migration v6
-- Run once against the existing uat_monitoring database. Do not recreate the database.
ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);
