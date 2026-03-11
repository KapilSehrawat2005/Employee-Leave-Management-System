require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based authorization
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

// Email domain validation
const isValidEmailDomain = (email) => email.endsWith('@qloron.com');

// Notification helper
const createNotification = async (leaveId, message) => {
  try {
    await db.query('INSERT INTO notifications (message, leave_id) VALUES (?, ?)', [message, leaveId]);
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
};

// ==================== AUTH ROUTES ====================
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  // Only allow Employee registration via public signup
  if (role !== 'Employee') {
    return res.status(400).json({ error: 'Only Employee accounts can be created via signup' });
  }

  if (!isValidEmailDomain(email)) {
    return res.status(400).json({ error: 'Only @qloron.com emails are allowed' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    );

    const [newUser] = await db.query(
      'SELECT id, name, email, role, emp_code FROM employees WHERE id = ?',
      [result.insertId]
    );

    const token = jwt.sign(
      { id: newUser[0].id, role: newUser[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token, user: newUser[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!isValidEmailDomain(email)) {
    return res.status(400).json({ error: 'Only @qloron.com emails are allowed' });
  }

  try {
    const [results] = await db.query('SELECT * FROM employees WHERE email = ?', [email]);
    if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = results[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, emp_code: user.emp_code }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change own password
app.put('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    const [users] = await db.query('SELECT password FROM employees WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, users[0].password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashedNew = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE employees SET password = ? WHERE id = ?', [hashedNew, userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== LEAVE ROUTES ====================
// Allow any authenticated user (Employee, HR, Manager) to apply for leave
app.post('/api/leaves', authenticateToken, async (req, res) => {
  const { leave_type, start_date, end_date, reason } = req.body;
  const employee_id = req.user.id;

  // --- New: Monthly limit check (except Unpaid Leave) ---
  if (leave_type !== 'Unpaid Leave') {
    try {
      // Count existing leaves of the same type in the same month (start_date)
      // Only consider Pending or Approved leaves (rejected leaves don't count)
      const [rows] = await db.query(
        `SELECT COUNT(*) as count FROM leaves 
         WHERE employee_id = ? 
           AND leave_type = ? 
           AND status IN ('Pending', 'Approved')
           AND YEAR(start_date) = YEAR(?)
           AND MONTH(start_date) = MONTH(?)`,
        [employee_id, leave_type, start_date, start_date]
      );

      if (rows[0].count > 0) {
        return res.status(400).json({ 
          error: `You already have a pending or approved ${leave_type} in this month. Only one ${leave_type} per month is allowed.` 
        });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const [result] = await db.query(
      'INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)',
      [employee_id, leave_type, start_date, end_date, reason]
    );

    const message = `New leave request from employee`;
    await createNotification(result.insertId, message);

    res.json({ message: 'Leave applied successfully', leaveId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get own leaves (now any authenticated user)
app.get('/api/leaves/my', authenticateToken, async (req, res) => {
  try {
    const [results] = await db.query(
      'SELECT * FROM leaves WHERE employee_id = ? ORDER BY applied_at DESC',
      [req.user.id]
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all leaves (for HR and Manager) - optionally filter by role
app.get('/api/leaves/all', authenticateToken, allowRoles('HR', 'Manager'), async (req, res) => {
  const { role } = req.query; // optional role filter
  let sql = `
    SELECT l.*, e.name as employee_name, e.emp_code, e.role as employee_role
    FROM leaves l
    JOIN employees e ON l.employee_id = e.id
  `;
  const params = [];
  if (role) {
    sql += ' WHERE e.role = ?';
    params.push(role);
  }
  sql += ' ORDER BY l.applied_at DESC';

  try {
    const [results] = await db.query(sql, params);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update leave status with extra check: HR cannot act on HR/Manager leaves
app.put('/api/leaves/:id', authenticateToken, allowRoles('HR', 'Manager'), async (req, res) => {
  const { status } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // Get leave and owner's role
    const [leaveRows] = await db.query(
      `SELECT l.*, e.role as owner_role 
       FROM leaves l
       JOIN employees e ON l.employee_id = e.id
       WHERE l.id = ?`,
      [req.params.id]
    );
    if (leaveRows.length === 0) return res.status(404).json({ error: 'Leave not found' });

    const leave = leaveRows[0];

    // HR can only approve/reject Employee leaves
    if (req.user.role === 'HR' && leave.owner_role !== 'Employee') {
      return res.status(403).json({ error: 'HR cannot approve/reject leaves of HR or Manager' });
    }

    await db.query('UPDATE leaves SET status = ? WHERE id = ?', [status, req.params.id]);

    // Optionally create notification
    res.json({ message: `Leave ${status.toLowerCase()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== NOTIFICATION ROUTES ====================
app.get('/api/notifications', authenticateToken, allowRoles('HR', 'Manager'), async (req, res) => {
  try {
    const [results] = await db.query(
      'SELECT * FROM notifications WHERE is_read = FALSE ORDER BY created_at DESC'
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, allowRoles('HR', 'Manager'), async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [req.params.id]);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== USER MANAGEMENT (Manager only) ====================
// Create any user (Employee, HR, Manager)
app.post('/api/users', authenticateToken, allowRoles('Manager'), async (req, res) => {
  const { name, email, password, role, emp_code } = req.body;

  if (!['Employee', 'HR', 'Manager'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  if (!isValidEmailDomain(email)) {
    return res.status(400).json({ error: 'Only @qloron.com emails are allowed' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO employees (name, email, password, role, emp_code) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role, emp_code || null]
    );

    const [newUser] = await db.query(
      'SELECT id, name, email, role, emp_code, created_at FROM employees WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(newUser[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email or employee code already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Get all users (optional role filter)
app.get('/api/users', authenticateToken, allowRoles('Manager'), async (req, res) => {
  const { role } = req.query;
  let sql = 'SELECT id, name, email, role, emp_code, created_at FROM employees';
  const params = [];

  if (role) {
    sql += ' WHERE role = ?';
    params.push(role);
  }

  try {
    const [results] = await db.query(sql, params);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete any user
app.delete('/api/users/:id', authenticateToken, allowRoles('Manager'), async (req, res) => {
  try {
    const [emp] = await db.query('SELECT id FROM employees WHERE id = ?', [req.params.id]);
    if (emp.length === 0) return res.status(404).json({ error: 'User not found' });

    await db.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user's employee code (Manager only)
app.put('/api/users/:id/code', authenticateToken, allowRoles('Manager'), async (req, res) => {
  const { emp_code } = req.body;
  if (!emp_code || emp_code.trim() === '') {
    return res.status(400).json({ error: 'Employee code is required' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM employees WHERE emp_code = ? AND id != ?',
      [emp_code, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Employee code already exists' });
    }

    await db.query('UPDATE employees SET emp_code = ? WHERE id = ?', [emp_code, req.params.id]);
    res.json({ message: 'Employee code updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change any user's password (Manager only)
app.put('/api/users/:id/password', authenticateToken, allowRoles('Manager'), async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE employees SET password = ? WHERE id = ?', [hashed, req.params.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== EMPLOYEE MANAGEMENT (HR only) ====================
// Get all Employees (for HR)
app.get('/api/employees', authenticateToken, allowRoles('HR'), async (req, res) => {
  try {
    const [results] = await db.query(
      'SELECT id, name, email, role, emp_code, created_at FROM employees WHERE role = "Employee"'
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update employee code (HR only)
app.put('/api/employees/:id/code', authenticateToken, allowRoles('HR'), async (req, res) => {
  const { emp_code } = req.body;
  if (!emp_code || emp_code.trim() === '') {
    return res.status(400).json({ error: 'Employee code is required' });
  }

  try {
    // Ensure target is an Employee
    const [target] = await db.query('SELECT role FROM employees WHERE id = ?', [req.params.id]);
    if (target.length === 0) return res.status(404).json({ error: 'Employee not found' });
    if (target[0].role !== 'Employee') {
      return res.status(403).json({ error: 'Can only update code for Employees' });
    }

    const [existing] = await db.query(
      'SELECT id FROM employees WHERE emp_code = ? AND id != ?',
      [emp_code, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Employee code already exists' });
    }

    await db.query('UPDATE employees SET emp_code = ? WHERE id = ?', [emp_code, req.params.id]);
    res.json({ message: 'Employee code updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change employee password (HR only)
app.put('/api/employees/:id/password', authenticateToken, allowRoles('HR'), async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // Ensure target is an Employee
    const [target] = await db.query('SELECT role FROM employees WHERE id = ?', [req.params.id]);
    if (target.length === 0) return res.status(404).json({ error: 'Employee not found' });
    if (target[0].role !== 'Employee') {
      return res.status(403).json({ error: 'Can only change password for Employees' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE employees SET password = ? WHERE id = ?', [hashed, req.params.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete employee (HR only)
app.delete('/api/employees/:id', authenticateToken, allowRoles('HR'), async (req, res) => {
  try {
    const [emp] = await db.query('SELECT role FROM employees WHERE id = ?', [req.params.id]);
    if (emp.length === 0) return res.status(404).json({ error: 'Employee not found' });
    if (emp[0].role !== 'Employee') {
      return res.status(403).json({ error: 'Can only delete Employees' });
    }

    await db.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));