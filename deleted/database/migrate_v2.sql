USE uat_monitoring;

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

