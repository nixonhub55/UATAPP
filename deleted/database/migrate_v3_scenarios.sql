USE uat_monitoring;

-- Safe to run on an existing installation; creates the scenario-step and per-Tester result tables.
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
