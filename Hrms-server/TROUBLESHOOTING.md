# Troubleshooting Guide

## Login Error: "Email and password are required"

### Problem
When trying to login with:
```json
POST http://localhost:5000/api/auth/login
{
  "username": "admin",
  "password": "tempPassword123"
}
```

You get error:
```json
{
  "message": "Email and password are required."
}
```

### Solutions

#### 1. Check Request Body Format
Make sure you're sending the request as **raw JSON** in Postman:

**In Postman:**
- Go to **Body** tab
- Select **raw**
- Select **JSON** from dropdown (not Text)
- Enter:
```json
{
  "username": "admin",
  "password": "tempPassword123"
}
```

#### 2. Check Headers
Ensure you have the correct Content-Type header:
```
Content-Type: application/json
```

#### 3. Restart Server
If you just updated the code, restart your server:
```bash
# Stop the server (Ctrl+C)
# Then restart
npm start
# or
npm run dev
```

#### 4. Verify Endpoint URL
Make sure you're using the correct URL:
```
POST http://localhost:5000/api/auth/login
```
Not:
- `http://localhost:5000/auth/login` ❌
- `http://localhost:5000/api/login` ❌

#### 5. Check Server Logs
Look at your server console for any error messages. The server should show:
```
Server running on port 5000
MongoDB Connected: ...
```

#### 6. Test with cURL
Try the request with cURL to verify:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"tempPassword123"}'
```

---

## Common Issues

### Issue 1: "Invalid credentials"
**Possible causes:**
- Username doesn't exist in database
- Password is incorrect
- Username has extra spaces

**Solution:**
- Verify user exists: Check MongoDB or create user first
- Use exact password: `tempPassword123` for new users
- Trim username: Remove any spaces

### Issue 2: "Username is required"
**Possible causes:**
- Request body is empty
- Field name is wrong (should be `username`, not `email` or `user`)
- JSON is malformed

**Solution:**
- Check JSON syntax
- Verify field name is `username`
- Ensure Content-Type is `application/json`

### Issue 3: Server not responding
**Possible causes:**
- Server not running
- Wrong port
- MongoDB connection failed

**Solution:**
- Check if server is running: `npm start`
- Verify port 5000 is available
- Check MongoDB connection in `.env` file

### Issue 4: "Token is not valid"
**Possible causes:**
- Token expired (tokens last 7 days)
- Token not included in request
- Wrong token format

**Solution:**
- Login again to get new token
- Include token in Authorization header: `Bearer <token>`
- Check token format: Should start with `eyJ...`

---

## Postman Setup Checklist

- [ ] Method is `POST`
- [ ] URL is `http://localhost:5000/api/auth/login`
- [ ] Headers include `Content-Type: application/json`
- [ ] Body is set to `raw` and `JSON` (not Text)
- [ ] Request body has correct JSON format:
  ```json
  {
    "username": "admin",
    "password": "tempPassword123"
  }
  ```
- [ ] No extra spaces or characters in JSON
- [ ] Server is running on port 5000

---

## Correct Postman Request Example

### Request Tab
```
POST http://localhost:5000/api/auth/login
```

### Headers Tab
```
Content-Type: application/json
```

### Body Tab
- Select: **raw**
- Select: **JSON** (from dropdown)
- Enter:
```json
{
  "username": "admin",
  "password": "tempPassword123"
}
```

### Expected Response (200 OK)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65f1234567890abcdef12345",
    "name": "Admin User",
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

---

## Still Not Working?

1. **Check MongoDB**: Verify user exists
   ```javascript
   db.users.find({ username: "admin" })
   ```

2. **Check Server Code**: Make sure latest code is running
   - Restart server
   - Check `controllers/authController.js` has latest code

3. **Check Network**: 
   - Verify server is accessible
   - Check firewall settings
   - Try `http://localhost:5000/health` to test server

4. **Check Environment Variables**:
   - Verify `.env` file exists
   - Check `JWT_SECRET` is set
   - Check `MONGODB_URI` is correct

---

## Quick Test Commands

### Test Server Health
```bash
curl http://localhost:5000/health
```
Should return: `{"status":"OK","message":"HRMS API is running"}`

### Test Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"tempPassword123"}'
```

### Check MongoDB Connection
```bash
# In MongoDB shell
use hrms
db.users.find()
```



