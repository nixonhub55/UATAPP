USE uat_monitoring;

-- Ensure scenario-derived outcomes are available in existing installations.
INSERT IGNORE INTO result_master(name) VALUES ('Tested'), ('Pending');
