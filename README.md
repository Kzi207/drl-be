# Backend API Server

A comprehensive Node.js/Express API server for managing student information, attendance, grades, DRL (Character/Conduct Score), and academic data using MySQL database.

## Quick Start

### Requirements

- Node.js 16+ with npm
- MySQL 5.7+ or MySQL 8.0+
- 512MB+ RAM
- ~100MB disk space

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Create and configure .env file
cp .env.example .env

# 3. Configure database in .env
# Edit .env with your MySQL credentials

# 4. Create database and tables
npm run build:db

# 5. Start the server
npm start
```

### Default Access

- **API URL:** http://localhost:3004
- **Admin Username:** admin
- **Admin Password:** admin123456
- **Default API Key:** kzi207-khoaktck-cncd2511

**⚠️ IMPORTANT:** Change default credentials in production!

---

## 📚 Full Documentation

For comprehensive API documentation including all endpoints, parameters, and examples, see [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

---

## Configuration

### Environment Variables

Create `.env` file in the `be/` directory:

```env
# Server Configuration
PORT=3004
CORS_ORIGIN=*

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=chamdrl

# API Security
API_KEY=kzi207-khoaktck-cncd2511
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
ADMIN_SECRET_KEY=kzi207-admin-secret-key-2026

# Optional: Google Sheets Backup
GOOGLE_SHEET_API=your-api-key

# Backup Directory
BACKUP_DIR=./backups
```

---

## 🚀 Core Features

### Student & Class Management
- Create, read, update, delete (CRUD) students and classes
- Batch import students from arrays
- Student assignment to classes
- Student profile information (name, DOB, email, major)

### User & Authentication
- Multiple user roles: admin, monitor, student, bch, doankhoa
- User account management with batch operations
- Password reset and change functionality
- Role-based access control (RBAC)
- Session logging and access tracking

### Academic Management
- Subject creation and management
- GPA calculation support
- Grading periods management
- Attendance tracking
- Grade recording (midterm/final scores)

### DRL System (Điểm Rèn Luyện)
- Character/conduct score tracking
- Multi-category scoring (I, II, III, etc.)
- Multi-step approval workflow:
  - Draft → Submitted → Class Approved → BCH Approved → Finalized
- Evidence/proof upload support
- Student self-assessment + class committee + BCH scoring

### File Management
- Image/proof upload (base64)
- File organization by student and category
- Public URL generation for uploaded files
- File deletion and management

### Backup & Restore
- Local SQL backup creation
- Backup listing and management
- Database restore from backup
- Google Sheets integration (cloud backup)
- Automatic backup on restore operations

### Admin Dashboard
- System statistics (users, access, etc.)
- Access log viewing and filtering
- User management interface
- Configuration management
- IP security management

### Security Features
- API key authentication
- Admin token-based authentication (HMAC-SHA256)
- Rate limiting (50 req/sec per IP)
- IP whitelist and blacklist
- IP tracking and analytics
- Access logging with categories:
  - `access` - Login/logout events
  - `account` - User management
  - `drl` - DRL-related changes
  - `system` - System changes
- CORS configuration
- Automatic inactive log cleanup

---

## 📋 Available Scripts

```bash
# Development
npm run dev                 # Start with hot reload
npm run server              # Start production server
npm start                   # Alias for production start

# Database Management
npm run build:db            # Auto-create DB and tables
npm run migrate             # Run full migration
npm run migrate:safe        # Safe migration with validation
npm run migrate:bch         # Add BCH scoring table/columns

# Backup & Restore
npm run backup              # Create manual backup
npm run backup:list         # List local backups
npm run backup:restore      # Restore from backup (interactive)

# Code Quality
npm run typecheck           # Type check TypeScript
npm run typecheck:watch     # Watch mode type checking
```

---

## 📡 API Endpoints Overview

### Authentication
- `POST /login` - User login
- `POST /admin-api/login` - Admin login

### Management Endpoints

| Resource | GET | POST | PUT | DELETE |
|----------|-----|------|-----|--------|
| `/classes` | List | Create | Update | Delete |
| `/students` | List | Create/Import* | Update | Delete |
| `/users` | List | Create** | Update | Delete |
| `/subjects` | List | Create | Update | Delete |
| `/activities` | List | Create | - | - |
| `/attendance` | List | Create | - | Delete |
| `/grades` | List | Create | - | - |
| `/grading_periods` | List | Create | Update | Delete |
| `/drl_scores` | List | Create/Update | - | - |

*Batch import supported
**Batch creation available at `/users-batch`

### File Operations
- `POST /upload` - Upload proof/evidence
- `GET /api/get-proof` - Get single proof
- `GET /api/get-proofs` - Get all proofs by student
- `GET /delimg` - Delete proof

### Backup
- `GET /backup/list` - List local backups
- `POST /backup/create` - Create new backup
- `POST /backup/restore` - Restore from backup
- `DELETE /backup/delete` - Delete backup
- `GET /backup/gsheet/list` - List Google Sheet backups
- `POST /backup/gsheet/upload` - Upload to Google Sheets
- `POST /backup/gsheet/restore` - Restore from Google Sheets

### Configuration
- `GET /config` - Get system configuration
- `POST /config/update` - Update configuration

### Admin Only
- `GET /admin-api/stats` - System statistics
- `GET /admin-api/logs` - Access logs
- `DELETE /admin-api/logs/cleanup` - Clean old logs
- `GET /admin-api/users` - List all users
- `GET /admin-api/blacklist` - List blacklisted IPs
- `POST /admin-api/blacklist/ban` - Ban IP
- `POST /admin-api/blacklist/unban` - Unban IP
- `GET /admin-api/whitelist` - List whitelisted IPs
- `POST /admin-api/whitelist/add` - Whitelist IP
- Plus security and SQL management endpoints

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete endpoint details.

---

## 🔐 Security Configuration

### API Key Authentication
Most endpoints require `x-api-key` header:

```bash
curl -H "x-api-key: kzi207-khoaktck-cncd2511" http://localhost:3004/students
```

### Admin Authentication
Admin endpoints use Bearer token:

```bash
# Get token
curl -X POST http://localhost:3004/admin-api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123456"}'

# Use token
curl -H "Authorization: Bearer <token>" http://localhost:3004/admin-api/stats
```

### Rate Limiting
- **Limit:** 50 requests/second per IP
- **Exempt:** Admin, static files, status, login, config
- **Response:** 429 Too Many Requests with `Retry-After` header

### IP Management
- Add IPs to whitelist to bypass rate limiting
- Ban suspicious IPs manually
- Monitor IP tracking statistics
- View all IP access logs

---

## 📊 Data Models

### Student
```typescript
{
  id: string;           // Student ID (e.g., "2262001")
  firstName: string;    // First name
  lastName: string;     // Last name
  dob: string;         // Date of birth (YYYY-MM-DD)
  classId: string;     // Class ID
  email?: string;
  major?: string;
}
```

### User
```typescript
{
  username: string;     // Unique username
  password: string;     // Hashed password
  name: string;        // Full name
  role: string;        // 'admin' | 'monitor' | 'student' | 'bch' | 'doankhoa'
  classId?: string;
  email?: string;
}
```

### DRLScore
```typescript
{
  id: string;
  studentId: string;
  semester: string;
  selfScore: number;        // Student self-assessment
  classScore: number;       // Class committee score
  bchScore: number;        // BCH/University score
  finalScore: number;      // Final approved score
  details: object;         // Scoring breakdown by category
  status: string;          // draft|submitted|class_approved|bch_approved|finalized
}
```

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for all models.

---

## 🗂️ Project Structure

```
be/
├── server-mysql.ts           # Main Express server
├── types.ts                  # TypeScript interfaces
├── ts-register.js           # TypeScript loader
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
├── .env                     # Configuration (create this)
├── API_DOCUMENTATION.md     # Complete API docs
├── README.md               # This file
├── database/
│   ├── db.ts               # Database module
│   ├── backup.ts           # Backup/restore functions
│   ├── migrate.ts          # Database migration
│   ├── migrate-safe.ts     # Safe migration
│   ├── auto-migrate.ts     # Auto migration
│   ├── add-bch-score.ts    # Add BCH scoring
│   ├── schema.sql          # Database schema
│   ├── schema-safe.sql     # Safe schema
│   └── README.md           # Database docs
├── data/
│   └── uploads/            # Uploaded files directory
└── backups/                # Database backups directory
```

---

## 🔧 Database Setup

### Auto Setup
```bash
npm run build:db
```

This automatically:
1. Creates the MySQL database
2. Creates all required tables
3. Initializes data structures

### Manual Setup

```bash
# 1. Create database
mysql -u root -p
> CREATE DATABASE chamdrl;
> EXIT;

# 2. Run migration
npm run migrate

# 3. (Optional) Add BCH scoring support
npm run migrate:bch
```

### Database Location
- Filename: Configured in `.env` as `DB_NAME`
- Host: `DB_HOST` (default: localhost)
- Port: `DB_PORT` (default: 3306)

---

## 📝 Usage Examples

### Get All Students
```bash
curl -H "x-api-key: kzi207-khoaktck-cncd2511" \
  http://localhost:3004/students
```

### Create Student
```bash
curl -X POST http://localhost:3004/students \
  -H "x-api-key: kzi207-khoaktck-cncd2511" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "2262001",
    "firstName": "Văn A",
    "lastName": "Nguyễn",
    "dob": "2004-05-15",
    "classId": "K62-A1"
  }'
```

### Batch Import Students
```bash
curl -X POST http://localhost:3004/students \
  -H "x-api-key: kzi207-khoaktck-cncd2511" \
  -H "Content-Type: application/json" \
  -d '[
    {"id":"2262001","firstName":"Văn A","lastName":"Nguyễn","dob":"2004-05-15","classId":"K62-A1"},
    {"id":"2262002","firstName":"Văn B","lastName":"Trần","dob":"2004-06-20","classId":"K62-A1"}
  ]'
```

### Upload Proof (JavaScript)
```javascript
const fileData = canvas.toDataURL('image/jpeg');
const response = await fetch('http://localhost:3004/upload', {
  method: 'POST',
  headers: {
    'x-api-key': 'kzi207-khoaktck-cncd2511',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileName: 'proof.jpg',
    fileData: fileData,
    studentId: '2262001',
    category: 'I.1'
  })
});
```

### Create DRL Score
```bash
curl -X POST http://localhost:3004/drl_scores \
  -H "x-api-key: kzi207-khoaktck-cncd2511" \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "2262001",
    "semester": "1",
    "selfScore": 85,
    "classScore": 90,
    "bchScore": 0,
    "finalScore": 0,
    "details": {"categories": {"I.1": 10, "I.2": 9}},
    "status": "draft"
  }'
```

### Create Backup
```bash
curl -X POST http://localhost:3004/backup/create \
  -H "x-api-key: kzi207-khoaktck-cncd2511"
```

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for more examples and detailed endpoint documentation.

---

## 🐛 Troubleshooting

### MySQL Connection Error
```
Error: ECONNREFUSED 127.0.0.1:3306
```

**Fix:**
- Ensure MySQL is running
- Check `DB_HOST` and `DB_PORT` in `.env`
- Verify username and password

### Port Already in Use
```
Error: listen EADDRINUSE :::3004
```

**Fix:**
```bash
# Change PORT in .env or kill process
kill -9 $(lsof -t -i:3004)
PORT=3005 npm start
```

### Database Migration Fails
```bash
# Run safe migration
npm run migrate:safe

# Check database connection first
curl -X POST http://localhost:3004/admin-api/sql/test-connection \
  -H "Content-Type: application/json" \
  -d '{"host":"localhost","user":"root","database":"chamdrl"}'
```

### Invalid API Key
Add header: `-H "x-api-key: kzi207-khoaktck-cncd2511"`

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for more troubleshooting.

---

## 📦 Dependencies

### Core
- **express** ^4.18.2 - Web framework
- **mysql2** ^3.9.1 - MySQL driver
- **cors** ^2.8.5 - CORS middleware
- **dotenv** ^16.6.1 - Environment variables

### Development
- **typescript** ^5.2.2 - TypeScript compiler
- **ts-node** ^10.9.2 - TypeScript executor
- **@types/express** ^4.17.21 - Type definitions
- **@types/node** ^20.11.19 - Node types

Update dependencies:
```bash
npm update
```

---

## 🚢 Production Deployment

### Pre-Deployment Checklist

- ✅ Change admin credentials in `.env`
- ✅ Use strong API_KEY (min 32 characters)
- ✅ Enable HTTPS on reverse proxy
- ✅ Set `CORS_ORIGIN` to specific domains
- ✅ Use environment-specific `.env`
- ✅ Create database backups
- ✅ Test all critical endpoints
- ✅ Configure monitoring/logging
- ✅ Set up automated backups
- ✅ Document any custom configurations

### Production .env Example
```env
PORT=3004
CORS_ORIGIN=https://yourdomain.com,https://admin.yourdomain.com
DB_HOST=db.internal.local
DB_USER=api_user
DB_PASSWORD=strong_secure_password_here
API_KEY=some-very-long-random-api-key-min-32-chars
ADMIN_USERNAME=secure_admin_username
ADMIN_PASSWORD=very_strong_password_here
ADMIN_SECRET_KEY=another_long_random_secret_key
```

### Using PM2 (Process Manager)
```bash
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'chamdrl-api',
    script: './server-mysql.ts',
    interpreter: 'node -r ./ts-register.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3004
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 logs
```

### Using Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3004
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t chamdrl-api .
docker run -p 3004:3004 --env-file .env chamdrl-api
```

---

## 📊 Monitoring & Logs

### Access Logs
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3004/admin-api/logs?limit=100&category=all
```

### System Statistics
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3004/admin-api/stats
```

### IP Tracking
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3004/admin-api/ip-tracking
```

### Clean Old Logs
```bash
curl -X DELETE -H "Authorization: Bearer <token>" \
  http://localhost:3004/admin-api/logs/cleanup?days=30
```

---

## 🤝 Contributing

1. Follow TypeScript best practices
2. Add comments for complex logic
3. Test changes before committing
4. Update documentation
5. Use descriptive commit messages

---

## 📄 License

© 2026 Bách Khoa University. All rights reserved.

---

## 📞 Support

For issues, questions, or suggestions:
- Check [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- Review database schema in `database/schema.sql`
- Check logs via admin API
- Monitor IP access patterns

---

**Last Updated:** March 27, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
