# Tai lieu ket noi va chi tiet toan bo API

Tai lieu nay duoc tong hop truc tiep tu ma nguon hien tai:
- Server: `be/server-mysql.ts`
- Data layer: `be/database/db.ts`
- Frontend API client: `fe/services/storage.ts`, `fe/services/adminAuth.ts`

## 1) Tong quan ket noi

- Backend default: `http://localhost:3004`
- Port backend: bien moi truong `PORT` (mac dinh `3004`)
- CORS: `CORS_ORIGIN` (mac dinh `*`)
- Body parser: JSON toi da `50mb`
- Static file:
  - `GET /uploads/<file>`
  - `GET /img/<file>`

## 2) Bao mat va xac thuc

### 2.1 API Key (`x-api-key`)
Middleware `authenticateApiKey` ap dung toan bo route, tru cac nhom duoi day:
- `/uploads/*`
- `/img/*`
- `/status`
- `/login`
- `/config*`
- `/backup*`
- `/admin-api*`

Voi cac endpoint con lai, can header:
```http
x-api-key: <API_KEY>
```
`API_KEY` lay tu env (`API_KEY`), mac dinh: `kzi207-khoaktck-cncd2511`.

### 2.2 Admin Bearer token
- Dang nhap admin qua: `POST /admin-api/login`
- Endpoint admin duoc bao ve boi `authenticateAdmin` can:
```http
Authorization: Bearer <token>
```

### 2.3 Rate limit
- Gioi han: `50 requests / 1 giay / IP`
- Bo qua rate limit cho:
  - `/admin-api/*`
  - `/uploads/*`, `/img/*`
- Vuot gioi han tra:
  - HTTP `429`
  - Header `Retry-After: 2`

## 3) Frontend dang ket noi API nhu the nao

Theo `fe/services/storage.ts`:
- Dev:
  - Neu co `VITE_API_URL` thi uu tien dung bien nay
  - Neu host la `localhost`/`127.0.0.1` thi fallback `http://localhost:3004`
- Production:
  - Co dinh dung `'/api-proxy'`
  - Tren Vercel rewrite trong `fe/vercel.json`:
    - `/api-proxy/:path* -> https://database.kzii.site/:path*`

Frontend goi API thuong kem:
- `Content-Type: application/json`
- `x-api-key: ...` (voi endpoint thuong)

Frontend goi admin API qua `adminFetch` (file `fe/services/adminAuth.ts`) va kem:
- `Authorization: Bearer <token>`

## 4) Bien moi truong backend can biet

```env
PORT=3004
CORS_ORIGIN=*
API_KEY=kzi207-khoaktck-cncd2511

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=diemdanh

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
ADMIN_SECRET_KEY=kzi207-admin-secret-key-2026

GOOGLE_SHEET_API=
```

## 5) API chi tiet (toan bo endpoint)

Ghi chu auth:
- `NONE`: khong can `x-api-key`, khong can token
- `API_KEY`: can `x-api-key`
- `ADMIN_TOKEN`: can `Authorization: Bearer ...`

### 5.1 Health

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/status` | NONE | - | `{ status: 'ok', mode: 'MySQL Server' }` |

### 5.2 Authentication

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| POST | `/login` | NONE | `{ username, password }` | User object hoac 400/401 |
| POST | `/change-password` | API_KEY | `{ username, newPassword }` | `{ success: true }` |
| POST | `/admin-api/login` | NONE | `{ username, password }` | `{ success, token?, username?, error? }` |

### 5.3 Classes

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/classes` | API_KEY | - | `ClassGroup[]` |
| POST | `/classes` | API_KEY | `{ id, name, description? }` | `{ success: true }` |
| PUT | `/classes` | API_KEY | `{ id, name }` | `{ success: true }` |
| DELETE | `/classes` | API_KEY | body/query: `id` | `{ success: true }` |

### 5.4 Students

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/students` | API_KEY | query `classId?` | `Student[]` |
| POST | `/students` | API_KEY | `Student` hoac `Student[]` | `{ success: true }` |
| PUT | `/students` | API_KEY | `Partial<Student> & { id }` | `{ success: true }` |
| DELETE | `/students` | API_KEY | body/query: `id` | `{ success: true }` |

`Student`:
- `id`, `lastName`, `firstName`, `dob`, `classId`, `email?`, `major?`

### 5.5 Users

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/users` | API_KEY | - | `User[]` |
| POST | `/users` | API_KEY | `User` | `{ success: true }` hoac `400 { error: 'Username exists' }` |
| PUT | `/users` | API_KEY | `User` | `{ success: true }` |
| DELETE | `/users` | API_KEY | body/query: `username` | `{ success: true }` |
| POST | `/users-batch` | API_KEY | `User[]` | `{ success: true, count }` |
| POST | `/users-reset-pass` | API_KEY | `[{ username, password }]` | `{ success: true, count }` |

`User.role` hop le:
- `admin | monitor | student | bch | doankhoa`

### 5.6 Subjects (combined + specialized)

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/subjects` | API_KEY | - | `Subject[]` (combined) |
| POST | `/subjects` | API_KEY | `Subject` | `{ success: true }` |
| PUT | `/subjects` | API_KEY | `Subject` | `{ success: true }` |
| DELETE | `/subjects` | API_KEY | body/query: `id` | `{ success: true }` |
| GET | `/attendance-subjects` | API_KEY | - | attendance subjects list |
| POST | `/attendance-subjects` | API_KEY | `{ id, name, classId, semester? }` | `{ success: true }` |
| PUT | `/attendance-subjects` | API_KEY | `{ id, name, classId, semester? }` | `{ success: true }` |
| DELETE | `/attendance-subjects` | API_KEY | body/query: `id` | `{ success: true }` |
| GET | `/gpa-subjects` | API_KEY | - | GPA subjects list |
| POST | `/gpa-subjects` | API_KEY | `Subject` | `{ success: true }` |
| PUT | `/gpa-subjects` | API_KEY | `Subject` | `{ success: true }` |
| DELETE | `/gpa-subjects` | API_KEY | body/query: `id` | `{ success: true }` |

`Subject`:
- `id`, `name`, `classId`, `credits?`, `midtermWeight?`, `finalWeight?`, `semester?`

### 5.7 Activities, Attendance, Grades

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/activities` | API_KEY | - | `Activity[]` |
| POST | `/activities` | API_KEY | `{ id, name, dateTime, subjectId, classId }` | `{ success: true }` |
| GET | `/attendance` | API_KEY | query `activityId?` | `AttendanceRecord[]` |
| POST | `/attendance` | API_KEY | `{ id, activityId, studentId, timestamp }` | `{ success: true }` |
| DELETE | `/attendance` | API_KEY | query `id` (bat buoc) | `{ success: true }` hoac `400` |
| GET | `/grades` | API_KEY | query `subjectId?` | `SubjectGrade[]` |
| POST | `/grades` | API_KEY | `{ id, studentId, subjectId, midtermScore?, finalScore? }` | `{ success: true }` |

### 5.8 DRL + Grading periods

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/grading_periods` | API_KEY | - | `GradingPeriod[]` |
| POST | `/grading_periods` | API_KEY | `{ id, name, startDate?, endDate? }` | `{ success: true }` |
| PUT | `/grading_periods` | API_KEY | `{ id, name, startDate?, endDate? }` | `{ success: true }` |
| DELETE | `/grading_periods` | API_KEY | body/query: `id` | `{ success: true }` |
| GET | `/drl_scores` | API_KEY | - | `DRLScore[]` |
| POST | `/drl_scores` | API_KEY | `DRLScore` | `{ success: true }` |
| GET | `/trang_thai/summary` | API_KEY | query `semester?` | `{ semester, total, daNop, daHoanTat }` hoặc `Array<...>` |
| GET | `/trang_thai/by_class` | API_KEY | query `semester` (bat buoc) | `Array<{ classId, className, totalStudents, submittedCount, completedCount }>` |

`DRLScore`:
- `id`, `studentId`, `semester`
- `selfScore`, `classScore`, `bchScore`, `finalScore`
- `details` (JSON)
- `status`: `draft | submitted | class_approved | bch_approved | finalized`

`/trang_thai/summary`:
- Nếu có `semester`: trả về 1 object tổng hợp theo đợt chấm.
- Nếu không có `semester`: trả về danh sách tổng hợp theo từng `semester`.

### 5.9 Upload minh chung

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| POST | `/upload` | API_KEY | `{ fileName, fileData(base64), studentId?, category? }` | `{ success: true, url, url_anh }` |
| GET | `/delimg` | API_KEY | query `tk_sv`, `muc_danh_gia` | `{ success: true }` |
| GET | `/api/get-proof` | API_KEY | query `tk_sv`, `muc_danh_gia` | `{ url_anh }` hoac `{ success:false, url_anh:null }` |
| GET | `/api/get-proofs` | API_KEY | query `tk_sv` | `{ success: true, proofs: Record<string, string[]> }` |

### 5.10 Backup

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/backup/list` | NONE | - | `{ success, backups[] }` |
| POST | `/backup/create` | NONE | - | `{ success, file, filename }` |
| POST | `/backup/restore` | NONE | `{ file }` hoac `{ filename }` | `{ success }` |
| DELETE | `/backup/delete` | NONE | body/query `file`/`filename` | `{ success }` |
| GET | `/backup/gsheet/list` | NONE | - | `{ success, backups }` |
| POST | `/backup/gsheet/upload` | NONE | `{ saveLocal?: boolean }` | `{ success, file, filename, cloud: true }` |
| POST | `/backup/gsheet/restore` | NONE | `{ id }` hoac `{ backupId }` hoac `{ sheetName }` | `{ success }` |

### 5.11 Config

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/config` | NONE | - | `{ success, config }` |
| POST | `/config/update` | NONE | JSON config object | `{ success, message? }` |

### 5.12 Admin APIs (can token)

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| GET | `/admin-api/stats` | ADMIN_TOKEN | - | `{ success, data: { totalUsers, activeUsers, totalAccess, todayAccess } }` |
| GET | `/admin-api/logs` | ADMIN_TOKEN | query `limit?`, `category?` | `{ success, data }` |
| DELETE | `/admin-api/logs/cleanup` | ADMIN_TOKEN | query `days?` | `{ success, deleted, remaining }` |
| GET | `/admin-api/users` | ADMIN_TOKEN | - | `{ success, data: User[] }` |
| POST | `/admin-api/config/update` | ADMIN_TOKEN | config object | `{ success, message? }` |
| GET | `/admin-api/blacklist` | ADMIN_TOKEN | - | `{ success, data, total }` |
| GET | `/admin-api/ip-tracking` | ADMIN_TOKEN | - | `{ success, data, total }` |
| POST | `/admin-api/blacklist/unban` | ADMIN_TOKEN | `{ ip }` | `{ success, message? }` |
| POST | `/admin-api/blacklist/ban` | ADMIN_TOKEN | `{ ip, reason? }` | `{ success, message? }` |
| POST | `/admin-api/ip-tracking/clear` | ADMIN_TOKEN | - | `{ success, message }` |
| POST | `/admin-api/blacklist/clear` | ADMIN_TOKEN | - | `{ success, message }` |
| GET | `/admin-api/whitelist` | ADMIN_TOKEN | - | `{ success, data, total }` |
| POST | `/admin-api/whitelist/add` | ADMIN_TOKEN | `{ ip, reason? }` | `{ success, message }` |
| POST | `/admin-api/whitelist/remove` | ADMIN_TOKEN | `{ ip }` | `{ success, message }` |
| POST | `/admin-api/whitelist/clear` | ADMIN_TOKEN | - | `{ success, message }` |
| GET | `/admin-api/proof-uploads` | ADMIN_TOKEN | query `classId?`, `studentId?`, `category?` | `{ success, count, data }` |

### 5.13 SQL management endpoints

| Method | Path | Auth | Input | Response |
|---|---|---|---|---|
| POST | `/admin-api/sql/test-connection` | NONE | `{ host, port?, user, password?, database? }` | `{ success, message? , warning?, error? }` |
| POST | `/admin-api/sql/run-migration` | NONE | `{ host, port?, user, password?, database }` | `{ success, tablesCreated?, message?, error? }` |

Luu y: 2 endpoint SQL hien tai khong bat buoc admin token.

## 6) Mau goi API nhanh

### 6.1 Dang nhap nguoi dung
```bash
curl -X POST http://localhost:3004/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 6.2 Goi endpoint can API key
```bash
curl http://localhost:3004/students \
  -H "x-api-key: kzi207-khoaktck-cncd2511"
```

### 6.3 Dang nhap admin + goi admin API
```bash
# 1) Login admin
curl -X POST http://localhost:3004/admin-api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123456"}'

# 2) Goi endpoint admin
curl http://localhost:3004/admin-api/stats \
  -H "Authorization: Bearer <token>"
```

## 7) Loi thuong gap

- `401 Unauthorized`:
  - Thieu API key (route API_KEY)
  - Hoac thieu Bearer token (route ADMIN_TOKEN)
- `403 Forbidden`:
  - API key sai
- `429 Too Many Requests`:
  - Vuot gioi han request, doi it nhat 2 giay
- `404 Not Found`:
  - Sai path hoac endpoint khong ton tai
- `500 Internal Server Error`:
  - Loi server/DB, xem log backend

## 8) Ghi chu quan trong theo code hien tai

- `DELETE /activities` khong ton tai tren backend, du frontend co helper `deleteActivity`.
- `POST /config/update` dang mo (khong can auth).
- Nhom `/backup/*` dang mo (khong can auth).
- Nhom `/admin-api/sql/*` dang mo (khong can admin token).

Neu can, co the harden bao mat bang cach bo sung `authenticateAdmin` cho cac endpoint nhay cam.
