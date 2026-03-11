CREATE DATABASE IF NOT EXISTS elms;
USE elms;

CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('Employee', 'HR', 'Manager') NOT NULL DEFAULT 'Employee',
  emp_code VARCHAR(20) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
select * from employees;

CREATE TABLE leaves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  leave_type ENUM(
    'Casual Leave',
    'Sick Leave',
    'Partial Leave',
    'Annual Leave',
    'Unpaid Leave',
    'Comp Offs',
    'Flater Leave',
    'Paid Leave'
  ) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);


 
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  leave_id INT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (leave_id) REFERENCES leaves(id) ON DELETE CASCADE
);


INSERT INTO employees (name, email, password, role, emp_code) 
VALUES ('Admin', 'Admin@qloron.com', '$2a$10$n9yqk1aAg7qGAl0b6kQbiONmvMj9HkSAaybqConYXYQM8BcYvIWAG', 'Manager', 'MGR001');