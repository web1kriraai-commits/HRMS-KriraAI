# Create First User - Postman Request

## Overview
This endpoint allows you to create the **first Admin or HR user** without authentication. This is useful for initial setup when no users exist in the database.

**Important:** This endpoint only works when the database is empty (no users exist). After the first user is created, you must use the authenticated endpoint.

---

## Postman Request

### Request Details
- **Method:** `POST`
- **URL:** `http://localhost:5000/api/users/first-user`
- **Headers:**
  ```
  Content-Type: application/json
  ```
- **Body (raw JSON):**
  ```json
  {
    "name": "Admin User",
    "username": "admin",
    "email": "admin@krira.ai",
    "role": "Admin",
    "department": "IT"
  }
  ```

---

## Complete Postman Request (Copy-Paste Ready)

### Request 1: Create First Admin User
```
POST http://localhost:5000/api/users/first-user

Headers:
Content-Type: application/json

Body (raw JSON):
{
  "name": "Admin User",
  "username": "admin",
  "email": "admin@krira.ai",
  "role": "Admin",
  "department": "IT"
}
```

### Request 2: Create First HR User
```
POST http://localhost:5000/api/users/first-user

Headers:
Content-Type: application/json

Body (raw JSON):
{
  "name": "HR Manager",
  "username": "hr",
  "email": "hr@krira.ai",
  "role": "HR",
  "department": "People"
}
```

---

## Expected Responses

### Success Response (201 Created)
```json
{
  "message": "First user created successfully. Please login and change your password.",
  "user": {
    "_id": "65f1234567890abcdef12345",
    "name": "Admin User",
    "username": "admin",
    "email": "admin@krira.ai",
    "role": "Admin",
    "department": "IT",
    "isActive": true,
    "isFirstLogin": true,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

### Error Response (400 - Missing Fields)
```json
{
  "message": "Missing required fields"
}
```

### Error Response (400 - Invalid Role)
```json
{
  "message": "First user must be Admin or HR"
}
```

### Error Response (400 - User Exists)
```json
{
  "message": "Username or email already exists"
}
```

### Error Response (403 - Users Already Exist)
```json
{
  "message": "Users already exist. Please use authenticated endpoint to create users."
}
```

---

## Field Requirements

| Field | Type | Required | Allowed Values | Description |
|-------|------|----------|----------------|-------------|
| `name` | String | Yes | Any | Full name of the user |
| `username` | String | Yes | Unique, lowercase | Username (will be converted to lowercase) |
| `email` | String | Yes | Unique, valid email | Email address (will be converted to lowercase) |
| `role` | String | Yes | `"Admin"` or `"HR"` | Role - must be Admin or HR for first user |
| `department` | String | Yes | Any | Department name |

---

## Important Notes

1. **Only works when database is empty**: This endpoint checks if any users exist. If users already exist, it will return a 403 error.

2. **Only Admin or HR allowed**: The first user must be either "Admin" or "HR" role. "Employee" role is not allowed.

3. **Temporary password**: New user is created with temporary password: `tempPassword123`

4. **First login required**: User must change password on first login (`isFirstLogin: true`)

5. **After first user**: Once the first user is created, use the authenticated endpoint:
   - Login first: `POST /api/auth/login`
   - Then create users: `POST /api/users` (with Authorization header)

---

## Step-by-Step Setup

### Step 1: Create First Admin User
```json
POST http://localhost:5000/api/users/first-user
Content-Type: application/json

{
  "name": "Admin User",
  "username": "admin",
  "email": "admin@krira.ai",
  "role": "Admin",
  "department": "IT"
}
```

### Step 2: Login with Created User

**Request:**
```json
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "tempPassword123"
}
```

**Expected Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NWYxMjM0NTY3ODkwYWJjZGVmMTIzNDUiLCJpYXQiOjE3MDQ4MjQwMDAsImV4cCI6MTcwNTQyODgwMH0...",
  "user": {
    "id": "65f1234567890abcdef12345",
    "name": "System Administrator",
    "username": "admin",
    "email": "admin@company.com",
    "role": "Admin",
    "department": "IT",
    "isActive": true,
    "isFirstLogin": true,
    "lastLogin": "2024-01-15T10:30:00.000Z"
  },
  "requiresPasswordChange": true
}
```

**Important Notes:**
- **Username**: Use the `username` you created (e.g., `"admin"`)
- **Password**: Always use `"tempPassword123"` for newly created users
- **requiresPasswordChange**: Will be `true` - you must change password
- **Token**: Copy this token for authenticated requests

### Step 3: Change Password
```json
POST http://localhost:5000/api/auth/change-password
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN_HERE

{
  "newPassword": "YourSecurePassword123"
}
```

### Step 4: Create More Users (Now Authenticated)
```json
POST http://localhost:5000/api/users
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN_HERE

{
  "name": "HR Manager",
  "username": "hr",
  "email": "hr@krira.ai",
  "role": "HR",
  "department": "People"
}
```

---

## Example: Complete Setup Flow

### 1. Create First Admin
```json
POST http://localhost:5000/api/users/first-user

{
  "name": "System Administrator",
  "username": "admin",
  "email": "admin@company.com",
  "role": "Admin",
  "department": "IT"
}
```

### 2. Login
```json
POST http://localhost:5000/api/auth/login

{
  "username": "admin",
  "password": "tempPassword123"
}
```

### 3. Change Password
```json
POST http://localhost:5000/api/auth/change-password
Authorization: Bearer <token>

{
  "newPassword": "SecurePass123!"
}
```

### 4. Create HR User
```json
POST http://localhost:5000/api/users
Authorization: Bearer <token>

{
  "name": "HR Manager",
  "username": "hr",
  "email": "hr@company.com",
  "role": "HR",
  "department": "Human Resources"
}
```

### 5. Create Employee
```json
POST http://localhost:5000/api/users
Authorization: Bearer <token>

{
  "name": "John Employee",
  "username": "john",
  "email": "john@company.com",
  "role": "Employee",
  "department": "Engineering"
}
```

---

## Security Notes

⚠️ **Important Security Considerations:**

1. **Only use in development/setup**: This endpoint should ideally be disabled in production or protected by additional security measures.

2. **Database must be empty**: The endpoint automatically checks if users exist and blocks access if they do.

3. **Admin/HR only**: Only Admin and HR roles are allowed for the first user.

4. **Change password immediately**: The temporary password should be changed on first login.

5. **After setup**: Once the first user is created, all subsequent user creation requires authentication.

---

## Troubleshooting

### Error: "Users already exist"
- **Solution**: Use the authenticated endpoint `POST /api/users` with a valid token

### Error: "First user must be Admin or HR"
- **Solution**: Change the `role` field to either `"Admin"` or `"HR"`

### Error: "Username or email already exists"
- **Solution**: Choose a different username or email address

### Error: "Missing required fields"
- **Solution**: Ensure all fields (name, username, email, role, department) are provided

