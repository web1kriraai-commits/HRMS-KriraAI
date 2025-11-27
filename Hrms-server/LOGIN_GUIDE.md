# Login Guide - After Creating First User

## Quick Login Steps

After creating your first user using:
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

---

## Step 1: Login Request

### Postman Request
- **Method:** `POST`
- **URL:** `http://localhost:5000/api/auth/login`
- **Headers:**
  ```
  Content-Type: application/json
  ```
- **Body (raw JSON):**
  ```json
  {
    "username": "admin",
    "password": "tempPassword123"
  }
  ```

### Complete Postman Request (Copy-Paste)
```
POST http://localhost:5000/api/auth/login

Headers:
Content-Type: application/json

Body (raw JSON):
{
  "username": "admin",
  "password": "tempPassword123"
}
```

---

## Step 2: Expected Response

### Success Response (200 OK)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NWYxMjM0NTY3ODkwYWJjZGVmMTIzNDUiLCJpYXQiOjE3MDQ4MjQwMDAsImV4cCI6MTcwNTQyODgwMH0.abc123...",
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

### What to Do Next:
1. **Copy the `token`** - You'll need it for authenticated requests
2. **Note `requiresPasswordChange: true`** - You must change your password
3. **Proceed to Step 3** to change password

---

## Step 3: Change Password (Required)

Since `isFirstLogin: true`, you **must** change your password.

### Postman Request
- **Method:** `POST`
- **URL:** `http://localhost:5000/api/auth/change-password`
- **Headers:**
  ```
  Content-Type: application/json
  Authorization: Bearer YOUR_TOKEN_HERE
  ```
  Replace `YOUR_TOKEN_HERE` with the token from Step 2.

- **Body (raw JSON):**
  ```json
  {
    "newPassword": "MySecurePassword123!"
  }
  ```

### Complete Postman Request
```
POST http://localhost:5000/api/auth/change-password

Headers:
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (your token)

Body (raw JSON):
{
  "newPassword": "MySecurePassword123!"
}
```

### Expected Response (200 OK)
```json
{
  "message": "Password changed successfully"
}
```

---

## Step 4: Login Again with New Password

After changing password, login again with your new password:

```
POST http://localhost:5000/api/auth/login

Headers:
Content-Type: application/json

Body (raw JSON):
{
  "username": "admin",
  "password": "MySecurePassword123!"
}
```

### Expected Response
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65f1234567890abcdef12345",
    "name": "System Administrator",
    "username": "admin",
    "email": "admin@company.com",
    "role": "Admin",
    "department": "IT",
    "isActive": true,
    "isFirstLogin": false,
    "lastLogin": "2024-01-15T10:35:00.000Z"
  },
  "requiresPasswordChange": false
}
```

**Note:** `isFirstLogin: false` and `requiresPasswordChange: false` - You're all set!

---

## Complete Flow Summary

### 1. Create First User
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

### 2. Login (Temporary Password)
```json
POST http://localhost:5000/api/auth/login
{
  "username": "admin",
  "password": "tempPassword123"
}
```
**→ Copy the token from response**

### 3. Change Password
```json
POST http://localhost:5000/api/auth/change-password
Authorization: Bearer <token>
{
  "newPassword": "MySecurePassword123!"
}
```

### 4. Login Again (New Password)
```json
POST http://localhost:5000/api/auth/login
{
  "username": "admin",
  "password": "MySecurePassword123!"
}
```
**→ Copy the new token for future requests**

---

## Login Credentials Reference

| Step | Username | Password | Notes |
|------|----------|----------|-------|
| **First Login** | `admin` (or your username) | `tempPassword123` | Temporary password |
| **After Password Change** | `admin` (or your username) | Your new password | Use the password you set |

---

## Common Errors

### Error: "Invalid credentials"
```json
{
  "message": "Invalid credentials"
}
```
**Solution:** 
- Check username is correct (case-sensitive)
- Ensure password is exactly `"tempPassword123"` for first login
- Or use your new password if you've already changed it

### Error: "No token, authorization denied"
```json
{
  "message": "No token, authorization denied"
}
```
**Solution:** 
- Make sure you included `Authorization: Bearer <token>` header
- Check the token is valid (not expired)
- Login again to get a new token

### Error: "Token is not valid"
```json
{
  "message": "Token is not valid"
}
```
**Solution:** 
- Token may be expired (tokens last 7 days)
- Login again to get a fresh token

---

## Using the Token

After successful login, use the token in all authenticated requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Example: Get All Users
```
GET http://localhost:5000/api/users
Authorization: Bearer <your-token>
```

### Example: Create New User
```
POST http://localhost:5000/api/users
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "name": "New User",
  "username": "newuser",
  "email": "newuser@company.com",
  "role": "Employee",
  "department": "Engineering"
}
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────┐
│  CREATE FIRST USER                      │
│  POST /api/users/first-user             │
│  Body: name, username, email, role,    │
│        department                       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  LOGIN (Temporary Password)             │
│  POST /api/auth/login                    │
│  Body: username, password: "temp..."    │
│  → Get token                             │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  CHANGE PASSWORD (Required)             │
│  POST /api/auth/change-password          │
│  Header: Authorization: Bearer <token>  │
│  Body: newPassword                       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  LOGIN (New Password)                   │
│  POST /api/auth/login                    │
│  Body: username, password: <new>        │
│  → Get token for future requests         │
└─────────────────────────────────────────┘
```


