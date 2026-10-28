CREATE DATABASE IF NOT EXISTS uat_monitoring CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE uat_monitoring;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('PROJECT_INCHARGE','TESTER','TECH_DEV') NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(40) UNIQUE,
  description TEXT,
  start_date DATE NULL,
  target_date DATE NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_assignments (
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  assigned_role ENUM('PROJECT_INCHARGE','TESTER','TECH_DEV') NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(project_id,user_id),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS category_master (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS result_master (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS status_master (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS severity_master (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS test_cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  module VARCHAR(160) NOT NULL,
  sub_module VARCHAR(160) NULL,
  steps TEXT NOT NULL,
  category_id INT NOT NULL,
  severity_id INT NOT NULL,
  target_from DATE NULL,
  target_to DATE NULL,
  date_tested DATE NULL,
  findings TEXT NULL,
  tech_comment TEXT NULL,
  result_id INT NULL,
  status_id INT NOT NULL,
  created_by INT NOT NULL,
  assigned_tester_id INT NULL,
  assigned_tech_id INT NULL,
  workflow_type ENUM('CHECKLIST','ISSUE_RETEST') NOT NULL DEFAULT 'CHECKLIST',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(category_id) REFERENCES category_master(id),
  FOREIGN KEY(severity_id) REFERENCES severity_master(id),
  FOREIGN KEY(result_id) REFERENCES result_master(id),
  FOREIGN KEY(status_id) REFERENCES status_master(id),
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(assigned_tester_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(assigned_tech_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_case_id INT NOT NULL,
  attempt_no INT NOT NULL,
  result_id INT NOT NULL,
  findings TEXT NULL,
  tech_comment TEXT NULL,
  tested_by INT NOT NULL,
  tested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attempt(test_case_id,attempt_no),
  FOREIGN KEY(test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(result_id) REFERENCES result_master(id),
  FOREIGN KEY(tested_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_case_id INT NOT NULL,
  user_id INT NOT NULL,
  parent_id INT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_case_id INT NOT NULL,
  comment_id INT NULL,
  attempt_id INT NULL,
  uploaded_by INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'image/webp',
  size_bytes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY(attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY(uploaded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NULL,
  test_case_id INT NULL,
  action VARCHAR(120) NOT NULL,
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY(test_case_id) REFERENCES test_cases(id) ON DELETE SET NULL
);



-- Normalized many-to-many testcase assignments (supports multiple Testers and Tech/Dev users).
CREATE TABLE IF NOT EXISTS test_case_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_case_id INT NOT NULL,
  user_id INT NOT NULL,
  assignment_type ENUM('TESTER','TECH_DEV') NOT NULL,
  assigned_by INT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_case_user_type(test_case_id,user_id,assignment_type),
  INDEX idx_tca_user(user_id),
  FOREIGN KEY(test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  actor_id INT NULL,
  project_id INT NULL,
  test_case_id INT NULL,
  type VARCHAR(80) NOT NULL,
  message VARCHAR(500) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user_read(user_id,is_read,created_at),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);


-- Ordered scenario steps and per-Tester scenario outcomes.
CREATE TABLE IF NOT EXISTS test_case_scenarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_case_id INT NOT NULL,
  step_no INT NOT NULL,
  scenario_text TEXT NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_case_step(test_case_id,step_no),
  FOREIGN KEY(test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS test_case_scenario_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scenario_id INT NOT NULL,
  tester_id INT NOT NULL,
  result ENUM('OK','Not OK','Pending') NOT NULL DEFAULT 'Pending',
  notes TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scenario_tester(scenario_id,tester_id),
  FOREIGN KEY(scenario_id) REFERENCES test_case_scenarios(id) ON DELETE CASCADE,
  FOREIGN KEY(tester_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT IGNORE INTO category_master(name) VALUES ('Functionality'),('UI');
INSERT IGNORE INTO result_master(name) VALUES ('Pass'),('Fail'),('For Review'),('Tested'),('Pending');
INSERT IGNORE INTO status_master(name) VALUES ('Open'),('Closed');
INSERT IGNORE INTO severity_master(name) VALUES ('Critical'),('High'),('Medium'),('Low');
