# Postman API Requests Guide

## Complete Request to Add Admin User

### Step 1: Login to Get Authentication Token

**Request:**
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
    "password": "pass"
  }
  ```

**Expected Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65f1234567890abcdef12345",
    "name": "Alice Admin",
    "username": "admin",
    "email": "alice@krira.ai",
    "role": "Admin",
    "department": "IT",
    "isActive": true,
    "isFirstLogin": false,
    "lastLogin": "2024-01-15T10:30:00.000Z"
  },
  "requiresPasswordChange": false
}
```

**Copy the `token` value from the response!**

---

### Step 2: Create Admin User

**Request:**
- **Method:** `POST`
- **URL:** `http://localhost:5000/api/users`
- **Headers:**
  ```
  Content-Type: application/json
  Authorization: Bearer YOUR_TOKEN_HERE
  ```
  Replace `YOUR_TOKEN_HERE` with the token from Step 1.

- **Body (raw JSON):**
  ```json
  {
    "name": "John Admin",
    "username": "johnadmin",
    "email": "john.admin@krira.ai",
    "role": "Admin",
    "department": "IT"
  }
  ```

**Expected Response (Success - 201):**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "65f1234567890abcdef12346",
    "name": "John Admin",
    "username": "johnadmin",
    "email": "john.admin@krira.ai",
    "role": "Admin",
    "department": "IT",
    "isActive": true,
    "isFirstLogin": true
  }
}
```

**Error Response (400 - Username/Email already exists):**
```json
{
  "message": "Username or email already exists"
}
```

**Error Response (401 - Unauthorized):**
```json
{
  "message": "No token, authorization denied"
}
```

**Error Response (403 - Forbidden):**
```json
{
  "message": "Access denied. Insufficient permissions."
}
```

---

## Complete Postman Collection

### Collection Variables
Set these in Postman:
- `base_url`: `http://localhost:5000/api`
- `token`: (will be set after login)

### Request 1: Login
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "pass"
}
```

**Tests Tab (to auto-save token):**
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set("token", jsonData.token);
    pm.environment.set("userId", jsonData.user.id);
}
```

### Request 2: Create Admin User
```
POST {{base_url}}/users
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "John Admin",
  "username": "johnadmin",
  "email": "john.admin@krira.ai",
  "role": "Admin",
  "department": "IT"
}
```

### Request 3: Create HR User
```
POST {{base_url}}/users
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Jane HR",
  "username": "janehr",
  "email": "jane.hr@krira.ai",
  "role": "HR",
  "department": "People"
}
```

### Request 4: Create Employee User
```
POST {{base_url}}/users
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Bob Employee",
  "username": "bobemp",
  "email": "bob.emp@krira.ai",
  "role": "Employee",
  "department": "Engineering"
}
```

---

## Quick Copy-Paste for Postman

### Complete Request JSON (Create Admin)

**URL:**
```
POST http://localhost:5000/api/users
```

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_TOKEN_HERE"
}
```

**Body:**
```json
{
  "name": "John Admin",
  "username": "johnadmin",
  "email": "john.admin@krira.ai",
  "role": "Admin",
  "department": "IT"
}
```

---

## Field Requirements

- **name** (required): Full name of the user
- **username** (required): Unique username (lowercase)
- **email** (required): Unique email address (lowercase)
- **role** (required): One of: `"Admin"`, `"HR"`, `"Employee"`
- **department** (required): Department name

**Note:** 
- New users are created with `isFirstLogin: true`
- Temporary password is set to `"tempPassword123"`
- User must change password on first login

---

## Testing the Created User

After creating the admin, you can test login:

**Request:**
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "username": "johnadmin",
  "password": "tempPassword123"
}
```

**Expected Response:**
```json
{
  "token": "...",
  "user": {
    "id": "...",
    "name": "John Admin",
    "username": "johnadmin",
    "email": "john.admin@krira.ai",
    "role": "Admin",
    "department": "IT",
    "isActive": true,
    "isFirstLogin": true
  },
  "requiresPasswordChange": true
}
```

Since `isFirstLogin: true`, the user will be prompted to change password.



