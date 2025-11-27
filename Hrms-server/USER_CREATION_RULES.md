# User Creation Rules

## Overview
Updated user creation system with role-based permissions and optional password.

---

## Rules

### 1. Role-Based Creation Permissions

- **Admin** can create:
  - Admin users
  - HR users
  - Employee users

- **HR** can create:
  - Employee users only
  - Cannot create Admin or HR users

- **Employee** cannot create users

### 2. Password Handling

- **Password is optional** when creating users
- If password is NOT provided:
  - Default password: `tempPassword123`
  - `isFirstLogin: true`
  - User must change password on first login

- If password IS provided:
  - Use provided password
  - `isFirstLogin: false`
  - No password change required

### 3. First Login Flow

1. User created with `tempPassword123`
2. User logs in with temporary password
3. System detects `isFirstLogin: true`
4. User is prompted to change password
5. After password change, `isFirstLogin: false`

---

## API Endpoint

### Create User (Authenticated)

**Endpoint:** `POST /api/users`

**Authentication:** Required (Admin or HR)

**Request Body:**
```json
{
  "name": "John Employee",
  "username": "john",
  "email": "john@example.com",
  "role": "Employee",
  "department": "Engineering",
  "password": "optional_password"  // Optional - omit for temp password
}
```

**Response:**
```json
{
  "message": "User created successfully. Temporary password: tempPassword123",
  "user": {
    "id": "...",
    "name": "John Employee",
    "username": "john",
    "email": "john@example.com",
    "role": "Employee",
    "department": "Engineering",
    "isFirstLogin": true
  }
}
```

---

## Authorization Logic

### Backend Controller Check

```javascript
// Only Admin can create Admin, HR, or Employee
// Admin and HR can create Employee
if (currentUser.role === 'HR') {
  if (role !== 'Employee') {
    return res.status(403).json({ 
      message: 'HR can only create Employee users. Only Admin can create Admin and HR users.' 
    });
  }
} else if (currentUser.role !== 'Admin') {
  return res.status(403).json({ 
    message: 'Only Admin and HR can create users.' 
  });
}
```

### Frontend Role Restrictions

- **Admin Dashboard:** Shows all roles (Employee, HR, Admin)
- **HR Dashboard:** Only shows Employee role (enforced in backend)

---

## Examples

### Example 1: Admin Creates HR User (No Password)
```json
POST /api/users
Authorization: Bearer <admin_token>

{
  "name": "Jane HR",
  "username": "janehr",
  "email": "jane@example.com",
  "role": "HR",
  "department": "People"
}
```

**Result:**
- User created with password: `tempPassword123`
- `isFirstLogin: true`
- User must change password on first login

### Example 2: HR Creates Employee (No Password)
```json
POST /api/users
Authorization: Bearer <hr_token>

{
  "name": "Bob Employee",
  "username": "bob",
  "email": "bob@example.com",
  "role": "Employee",
  "department": "Engineering"
}
```

**Result:**
- User created with password: `tempPassword123`
- `isFirstLogin: true`

### Example 3: HR Tries to Create Admin (Will Fail)
```json
POST /api/users
Authorization: Bearer <hr_token>

{
  "name": "Admin User",
  "username": "admin2",
  "email": "admin2@example.com",
  "role": "Admin",
  "department": "IT"
}
```

**Result:**
- Error: `403 Forbidden`
- Message: "HR can only create Employee users. Only Admin can create Admin and HR users."

---

## Frontend Changes

### Admin Dashboard
- Removed password field
- Shows all roles (Employee, HR, Admin)
- Message: "User will receive temporary password: tempPassword123"

### HR Dashboard
- Removed password field
- Only shows Employee role
- Message: "Employee will receive temporary password: tempPassword123"

---

## Login Flow for New Users

1. **Create User** (by Admin/HR)
   - No password provided
   - Gets `tempPassword123`

2. **First Login**
   ```
   POST /api/auth/login
   {
     "username": "john",
     "password": "tempPassword123"
   }
   ```
   - Response includes: `requiresPasswordChange: true`

3. **Change Password**
   ```
   POST /api/auth/change-password
   Authorization: Bearer <token>
   {
     "newPassword": "MySecurePassword123"
   }
   ```

4. **Login Again**
   ```
   POST /api/auth/login
   {
     "username": "john",
     "password": "MySecurePassword123"
   }
   ```
   - Now `requiresPasswordChange: false`

---

## Summary

✅ **Admin** can create Admin, HR, Employee  
✅ **HR** can create Employee only  
✅ **Password optional** - defaults to `tempPassword123`  
✅ **First login** requires password change  
✅ **No password field** in frontend forms  
✅ **All API calls use port 5001**



