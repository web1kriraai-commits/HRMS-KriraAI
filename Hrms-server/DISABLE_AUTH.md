# How to Disable Authentication (Temporary)

## Quick Setup

### Step 1: Add Environment Variable

Add this line to your `.env` file:
```
DISABLE_AUTH=true
```

### Step 2: Restart Server

```bash
npm start
```

That's it! All authentication is now bypassed.

---

## What Happens When Auth is Disabled

1. **No login required** - All endpoints work without tokens
2. **All roles allowed** - Authorization checks are bypassed
3. **Default user** - System uses first Admin user or creates a mock Admin user
4. **All endpoints accessible** - No restrictions

---

## Re-enable Authentication

Simply remove or set to false in `.env`:
```
DISABLE_AUTH=false
```

Or remove the line entirely, then restart server.

---

## Important Notes

⚠️ **Security Warning:**
- Only use this in **development/testing**
- **Never** use `DISABLE_AUTH=true` in production
- This bypasses all security checks

---

## Testing Without Auth

### Example: Create User (No Token Needed)
```
POST http://localhost:5000/api/users

Body:
{
  "name": "Test User",
  "username": "testuser",
  "email": "test@example.com",
  "role": "Admin",
  "department": "IT"
}
```

### Example: Get All Users (No Token Needed)
```
GET http://localhost:5000/api/users
```

### Example: Clock In (No Token Needed)
```
POST http://localhost:5000/api/attendance/clock-in

Body:
{
  "location": "Office"
}
```

All endpoints work without authentication when `DISABLE_AUTH=true`!

---

## Environment Variables

Your `.env` file should look like:
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
PORT=5000
NODE_ENV=development
DISABLE_AUTH=true    # Add this line
```



