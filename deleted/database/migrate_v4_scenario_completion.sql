USE uat_monitoring;

-- The result is "Tested" when every scenario is OK for every assigned Tester.
INSERT IGNORE INTO result_master(name) VALUES ('Tested'),('Pending');
