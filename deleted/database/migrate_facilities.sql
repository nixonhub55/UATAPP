USE uat_monitoring;

-- Safe to run once against an existing installation.
ALTER TABLE projects ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;
ALTER TABLE projects ADD COLUMN deleted_by INT NULL;
ALTER TABLE projects ADD INDEX idx_projects_deleted_at(deleted_at);
ALTER TABLE projects ADD CONSTRAINT fk_projects_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
