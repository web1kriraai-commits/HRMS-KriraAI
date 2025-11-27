# MongoDB Collections Examples

## Users Collection

### Complete User Document Example

```json
{
  "_id": ObjectId("65f1234567890abcdef12345"),
  "name": "John Admin",
  "username": "johnadmin",
  "email": "john.admin@krira.ai",
  "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
  "role": "Admin",
  "department": "IT",
  "isActive": true,
  "isFirstLogin": false,
  "lastLogin": ISODate("2024-01-15T10:30:00.000Z"),
  "createdAt": ISODate("2024-01-10T08:00:00.000Z"),
  "updatedAt": ISODate("2024-01-15T10:30:00.000Z"),
  "__v": 0
}
```

### User Document Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | ObjectId | Auto | MongoDB unique identifier |
| `name` | String | Yes | Full name of the user |
| `username` | String | Yes | Unique username (lowercase) |
| `email` | String | Yes | Unique email address (lowercase) |
| `password` | String | Yes | Bcrypt hashed password |
| `role` | String | Yes | One of: "Admin", "HR", "Employee" |
| `department` | String | Yes | Department name |
| `isActive` | Boolean | Default: true | Account active status |
| `isFirstLogin` | Boolean | Default: true | First login flag |
| `lastLogin` | Date | Optional | Last login timestamp |
| `createdAt` | Date | Auto | Document creation timestamp |
| `updatedAt` | Date | Auto | Document update timestamp |
| `__v` | Number | Auto | Mongoose version key |

---

## Complete MongoDB Document Examples

### 1. Admin User
```json
{
  "_id": ObjectId("65f1234567890abcdef12345"),
  "name": "Alice Admin",
  "username": "admin",
  "email": "alice@krira.ai",
  "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
  "role": "Admin",
  "department": "IT",
  "isActive": true,
  "isFirstLogin": false,
  "lastLogin": ISODate("2024-01-15T10:30:00.000Z"),
  "createdAt": ISODate("2024-01-01T00:00:00.000Z"),
  "updatedAt": ISODate("2024-01-15T10:30:00.000Z"),
  "__v": 0
}
```

### 2. HR User
```json
{
  "_id": ObjectId("65f1234567890abcdef12346"),
  "name": "Bob HR",
  "username": "hr",
  "email": "bob@krira.ai",
  "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
  "role": "HR",
  "department": "People",
  "isActive": true,
  "isFirstLogin": false,
  "lastLogin": ISODate("2024-01-15T09:15:00.000Z"),
  "createdAt": ISODate("2024-01-01T00:00:00.000Z"),
  "updatedAt": ISODate("2024-01-15T09:15:00.000Z"),
  "__v": 0
}
```

### 3. Employee User
```json
{
  "_id": ObjectId("65f1234567890abcdef12347"),
  "name": "Charlie Dev",
  "username": "emp",
  "email": "charlie@krira.ai",
  "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
  "role": "Employee",
  "department": "Engineering",
  "isActive": true,
  "isFirstLogin": false,
  "lastLogin": ISODate("2024-01-15T08:45:00.000Z"),
  "createdAt": ISODate("2024-01-01T00:00:00.000Z"),
  "updatedAt": ISODate("2024-01-15T08:45:00.000Z"),
  "__v": 0
}
```

### 4. New Employee (First Login)
```json
{
  "_id": ObjectId("65f1234567890abcdef12348"),
  "name": "Diana Design",
  "username": "emp2",
  "email": "diana@krira.ai",
  "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
  "role": "Employee",
  "department": "Design",
  "isActive": true,
  "isFirstLogin": true,
  "lastLogin": null,
  "createdAt": ISODate("2024-01-15T10:00:00.000Z"),
  "updatedAt": ISODate("2024-01-15T10:00:00.000Z"),
  "__v": 0
}
```

---

## MongoDB Insert Commands

### Insert Single User (MongoDB Shell)
```javascript
db.users.insertOne({
  "name": "John Admin",
  "username": "johnadmin",
  "email": "john.admin@krira.ai",
  "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
  "role": "Admin",
  "department": "IT",
  "isActive": true,
  "isFirstLogin": false,
  "createdAt": new Date(),
  "updatedAt": new Date()
})
```

### Insert Multiple Users
```javascript
db.users.insertMany([
  {
    "name": "Alice Admin",
    "username": "admin",
    "email": "alice@krira.ai",
    "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
    "role": "Admin",
    "department": "IT",
    "isActive": true,
    "isFirstLogin": false,
    "createdAt": new Date(),
    "updatedAt": new Date()
  },
  {
    "name": "Bob HR",
    "username": "hr",
    "email": "bob@krira.ai",
    "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
    "role": "HR",
    "department": "People",
    "isActive": true,
    "isFirstLogin": false,
    "createdAt": new Date(),
    "updatedAt": new Date()
  },
  {
    "name": "Charlie Dev",
    "username": "emp",
    "email": "charlie@krira.ai",
    "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
    "role": "Employee",
    "department": "Engineering",
    "isActive": true,
    "isFirstLogin": false,
    "createdAt": new Date(),
    "updatedAt": new Date()
  }
])
```

---

## MongoDB Query Examples

### Find All Users
```javascript
db.users.find({})
```

### Find User by Username
```javascript
db.users.findOne({ "username": "admin" })
```

### Find Users by Role
```javascript
db.users.find({ "role": "Admin" })
```

### Find Active Users
```javascript
db.users.find({ "isActive": true })
```

### Find Users Needing Password Change
```javascript
db.users.find({ "isFirstLogin": true })
```

### Update User Last Login
```javascript
db.users.updateOne(
  { "username": "admin" },
  { 
    "$set": { 
      "lastLogin": new Date(),
      "isFirstLogin": false 
    } 
  }
)
```

---

## Password Hash Note

**Important:** The password field contains a bcrypt hash. The example hash above is for demonstration only.

To generate a real password hash, use:
```javascript
// In Node.js with bcryptjs
const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash('yourpassword', 10);
```

**Example hashes:**
- Password `"pass"` → `"$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u"`
- Password `"tempPassword123"` → `"$2a$10$...` (different hash)

---

## Complete JSON Document (for Import)

### User Collection JSON
```json
[
  {
    "name": "Alice Admin",
    "username": "admin",
    "email": "alice@krira.ai",
    "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
    "role": "Admin",
    "department": "IT",
    "isActive": true,
    "isFirstLogin": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  {
    "name": "Bob HR",
    "username": "hr",
    "email": "bob@krira.ai",
    "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
    "role": "HR",
    "department": "People",
    "isActive": true,
    "isFirstLogin": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T09:15:00.000Z"
  },
  {
    "name": "Charlie Dev",
    "username": "emp",
    "email": "charlie@krira.ai",
    "password": "$2a$10$rK9V8x5YzQ3mN4pL5qR6sT7uV8wX9yZ0aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u",
    "role": "Employee",
    "department": "Engineering",
    "isActive": true,
    "isFirstLogin": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T08:45:00.000Z"
  }
]
```

---

## Indexes

The User collection should have these indexes:

```javascript
// Unique index on username
db.users.createIndex({ "username": 1 }, { unique: true })

// Unique index on email
db.users.createIndex({ "email": 1 }, { unique: true })

// Index on role for faster queries
db.users.createIndex({ "role": 1 })

// Index on isActive
db.users.createIndex({ "isActive": 1 })
```

