# Employee Leave Management System

A full-stack web application for managing employee leave requests with role-based access control. Built with React, Node.js, Express, and MySQL.

## Features

- **User Authentication** – Secure login/signup with JWT tokens, password encryption.
- **Role-Based Dashboards** – Separate interfaces for Employee, HR, and Manager.
- **Leave Application** – Apply for various leave types with monthly limits (except unpaid leave).
- **Leave History** – View and filter past leave applications.
- **Approval Workflow** – HR can approve/reject employee leaves; Manager can approve/reject all roles.
- **Employee Management** – HR can manage employee details (edit code, change password, delete).
- **User Management** – Manager can create, update, and delete any user (Employee, HR, Manager).
- **Password Change** – Users can change their own password securely.
- **Notifications** – Bell icon shows pending leave requests for HR/Manager.
- **Responsive Design** – Fully mobile-friendly with a collapsible sidebar.

## Tech Stack

| Layer       | Technology                         |
|-------------|------------------------------------|
| Frontend    | React, React Hooks, React Icons, CSS |
| Backend     | Node.js, Express, JWT, Bcrypt      |
| Database    | MySQL with `mysql2` driver         |
| HTTP Client | Axios                              |

## Prerequisites

- Node.js (v14 or later)
- MySQL (v8 or later)
- npm or yarn

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/elms.git
cd elms

```

### 2. Backend Setup
``` bash
cd server
npm install
```

## Create a .env file in the server directory:

### env
- PORT=5000
- DB_HOST=localhost
- DB_USER=root
- DB_PASSWORD=yourpassword
- DB_NAME=elms
- JWT_SECRET=your_super_secret_key_change_this


### 3. Database Setup
Run the following SQL commands to create the database and tables:

``` sql
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
``` 
### 4. Frontend Setup
``` bash
cd ../client
npm install
```
## Running the Application
Start the Backend Server
``` bash
cd server
npm start
# Or for development with auto-restart:
npm run dev
```
The server will run at http://localhost:5000.

### Start the Frontend Development Server
``` bash
cd client
npm start
```
The React app will open at http://localhost:3000.

### Usage
Sign Up – Only Employee accounts can be created via signup (uses @qloron.com email domain).

Login – Use your credentials. The dashboard will load based on your role.

Explore Dashboards:

Employee: Apply for leave, view summary and history, change password.

HR: Manage employees, approve/reject employee leaves, view own leaves.

Manager: Full control – manage all users, approve/reject leaves for all roles.

### API Endpoints Overview
Method	Endpoint	Description	Access
- **POST	/api/auth/register	Register as Employee	Public
- **POST	/api/auth/login	Login	Public
- **PUT	/api/auth/change-password	Change own password	Authenticated
- **POST	/api/leaves	Apply for leave	Authenticated
- **GET	/api/leaves/my	Get own leaves	Authenticated
- **GET	/api/leaves/all	Get all leaves (optional role filter)	HR, Manager
- **PUT	/api/leaves/:id	Update leave status	HR, Manager
- **GET	/api/notifications	Get unread notifications	HR, Manager
- **PUT	/api/notifications/:id/read	Mark notification as read	HR, Manager
POST	/api/users	Create a new user	Manager
- **GET	/api/users	Get all users (optional role filter)	Manager
- **DELETE	/api/users/:id	Delete a user	Manager
- **PUT	/api/users/:id/code	Update user's employee code	Manager
- **PUT	/api/users/:id/password	Change user's password	Manager
- **GET	/api/employees	Get all employees	HR
- **PUT	/api/employees/:id/code	Update employee code	HR
- **PUT	/api/employees/:id/password	Change employee password	HR
- **DELETE	/api/employees/:id	Delete an employee	HR
### Environment Variables
Variable	Description
- **PORT	Port for the backend server
- **DB_HOST	MySQL host (e.g., localhost)
- **DB_USER	MySQL username
- **DB_PASSWORD	MySQL password
- **DB_NAME	Database name (elms)
- **JWT_SECRET	Secret key for signing JWT tokens

# Project Screenshots

Below are the screenshots of the project.

## Screenshot 1
![Screenshot 1](/screenshot/screenshot1.png)

## Screenshot 2
![Screenshot 2](/screenshot/screenshot2.png)

## Screenshot 3
![Screenshot 3](/screenshot/screenshot3.png)

## Screenshot 4
![Screenshot 4](/screenshot/screenshot4.png)

## Screenshot 5
![Screenshot 5](/screenshot/screenshot5.png)

## Screenshot 6
![Screenshot 6](/screenshot/screenshot6.png)

## Screenshot 7
![Screenshot 7](/screenshot/screenshot7.png)

## Screenshot 8
![Screenshot 8](/screenshot/screenshot8.png)

### Contributing
- Contributions are welcome! Please open an issue or submit a pull request for any improvements.

### License
- This project is licensed under the MIT License.
