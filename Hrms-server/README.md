# HRMS Backend API

Complete Node.js backend API for the HRMS system.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
MONGODB_URI=mongodb+srv://web1kriraai_db_user:pCedDBOrq9PSVcaF@hrms.n84krf1.mongodb.net/
JWT_SECRET=your-secret-key-change-in-production
PORT=5001
NODE_ENV=development
DISABLE_AUTH=false
```

**Note:** Set `DISABLE_AUTH=true` to temporarily disable authentication for testing (see `DISABLE_AUTH.md`).

3. (Optional) Initialize database with default users:
```bash
npm run init-db
```

This will create default users:
- Admin: `admin` / `pass`
- HR: `hr` / `pass`
- Employee: `emp` / `pass`

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/change-password` - Change password (requires auth)
- `GET /api/auth/me` - Get current user (requires auth)

### Attendance
- `POST /api/attendance/clock-in` - Clock in
- `POST /api/attendance/clock-out` - Clock out
- `POST /api/attendance/break/start` - Start break
- `POST /api/attendance/break/end` - End break
- `GET /api/attendance/today` - Get today's attendance
- `GET /api/attendance/history` - Get attendance history
- `GET /api/attendance/today/all` - Get all today's attendance (HR/Admin)
- `PUT /api/attendance/:recordId` - Update attendance (HR/Admin)

### Leave Requests
- `POST /api/leaves/request` - Request leave
- `GET /api/leaves/my-leaves` - Get my leaves
- `GET /api/leaves/all` - Get all leaves (HR/Admin)
- `GET /api/leaves/pending` - Get pending leaves (HR/Admin)
- `PUT /api/leaves/:id/status` - Update leave status (HR/Admin)

### Users
- `GET /api/users` - Get all users
- `GET /api/users/role/:role` - Get users by role
- `GET /api/users/stats/employees` - Get employee stats (HR/Admin)
- `POST /api/users` - Create user (HR/Admin)

### Holidays
- `GET /api/holidays` - Get all holidays
- `POST /api/holidays` - Add holiday (HR/Admin)
- `DELETE /api/holidays/:id` - Delete holiday (Admin)

### Notifications
- `GET /api/notifications` - Get my notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read

### Settings
- `GET /api/settings` - Get system settings
- `PUT /api/settings` - Update settings (Admin)

### Reports
- `GET /api/reports/attendance` - Export attendance report (HR/Admin)

### Audit Logs
- `GET /api/audit` - Get audit logs (Admin)

## Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Roles

- **Employee**: Basic attendance and leave management
- **HR**: Employee management + leave approvals
- **Admin**: Full system access

