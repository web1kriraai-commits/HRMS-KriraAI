# Testing User Creation Route

## Verify Route is Working

### Step 1: Check Server is Running
```bash
# In Hrms-server directory
npm start
```

You should see:
```
Server running on port 5000
MongoDB Connected: ...
```

### Step 2: Test Health Endpoint
```
GET http://localhost:5000/health
```

Should return:
```json
{
  "status": "OK",
  "message": "HRMS API is running"
}
```

### Step 3: Test User Creation Endpoint

**Request:**
```
POST http://localhost:5000/api/users/create
Content-Type: application/json

{
  "name": "Test Admin",
  "username": "testadmin",
  "email": "test@example.com",
  "role": "Admin",
  "department": "IT",
  "password": "test1234"
}
```

---

## Common Issues

### Issue: "Route not found"

**Possible Causes:**
1. Server not restarted after code changes
2. Wrong URL path
3. Route not properly registered

**Solutions:**

1. **Restart Server:**
   ```bash
   # Stop server (Ctrl+C)
   # Then restart
   cd Hrms-server
   npm start
   ```

2. **Verify URL:**
   - Correct: `http://localhost:5000/api/users/create`
   - Wrong: `http://localhost:5000/users/create` (missing `/api`)
   - Wrong: `http://localhost:5000/api/user/create` (missing `s`)

3. **Check Route Registration:**
   - Route should be: `router.post('/create', createPublicUser)`
   - Must be BEFORE `router.use(authenticate)`
   - Mounted at: `app.use('/api/users', userRoutes)`

---

## Debug Steps

### 1. Check Server Console
Look for any errors when starting the server.

### 2. Test with cURL
```bash
curl -X POST http://localhost:5000/api/users/create \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test\",\"username\":\"test\",\"email\":\"test@test.com\",\"role\":\"Admin\",\"department\":\"IT\",\"password\":\"test123\"}"
```

### 3. Check Route Order
The route must be defined BEFORE `router.use(authenticate)`:
```javascript
// ✅ Correct order
router.post('/create', createPublicUser);  // Public route first
router.use(authenticate);                  // Then auth middleware
router.get('/', getAllUsers);              // Protected routes

// ❌ Wrong order
router.use(authenticate);                  // Auth first
router.post('/create', createPublicUser);  // This won't work!
```

---

## Quick Fix

If route still not found, try:

1. **Restart server completely**
2. **Clear node_modules and reinstall:**
   ```bash
   cd Hrms-server
   rm -rf node_modules
   npm install
   npm start
   ```

3. **Check for typos in route path**



