# OMN — Offline Map Navigation Backend

![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![Express](https://img.shields.io/badge/Express-4.21-blue)
![MongoDB](https://img.shields.io/badge/MongoDB-7+-green)
![License](https://img.shields.io/badge/License-ISC-yellow)

A **production-ready, security-first** backend built with Clean Architecture, designed for enterprise environments requiring audit compliance, comprehensive logging, and hardened security.

---

## 🏗️ Architecture

```
src/
├── config/              # Configuration & env validation
│   ├── index.js         # Centralized config
│   ├── envValidator.js  # Joi-based env validation
│   └── database.js      # MongoDB connection
├── controllers/         # Request handlers
│   ├── authController.js
│   ├── adminController.js
│   └── performanceController.js
├── docs/                # Swagger & compliance
│   ├── swagger.js
│   └── complianceValidator.js
├── logs/                # Logging system
│   ├── logger.js        # Winston multi-transport logger
│   └── sensitiveDataMasker.js
├── middlewares/         # Express middleware
│   ├── authenticate.js  # JWT auth
│   ├── authorize.js     # RBAC
│   ├── auditLogger.js   # Request audit trail
│   ├── correlationId.js # Correlation & request ID
│   └── errorHandler.js  # Centralized error handling
├── models/              # Mongoose models
│   ├── User.js
│   ├── RefreshToken.js
│   └── TokenBlacklist.js
├── performance/         # Performance monitoring
│   ├── eventLoopMonitor.js
│   └── performanceMiddleware.js
├── routes/v1/           # API routes (versioned)
│   ├── authRoutes.js
│   ├── adminRoutes.js
│   └── healthRoutes.js
├── security/            # Security modules
│   ├── helmet.js        # Security headers
│   ├── cors.js          # CORS whitelist
│   ├── rateLimiter.js   # Multi-tier rate limiting
│   ├── ipBlocker.js     # IP blocking
│   └── csrf.js          # CSRF protection
├── services/            # Business logic
│   ├── authService.js
│   ├── tokenService.js
│   └── logViewerService.js
├── startup/             # Startup validation
│   └── startupValidator.js
├── utils/               # Utilities
│   ├── ApiResponse.js   # Standard response format
│   ├── AppError.js      # Custom error class
│   ├── asyncHandler.js  # Async wrapper
│   ├── errorCodes.js    # Error code registry
│   ├── gracefulShutdown.js
│   └── processHandlers.js
├── validations/         # Joi validation schemas
│   └── authValidation.js
├── app.js               # Express app setup
└── server.js            # Server entry point
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- MongoDB 7+ (or use Docker Compose)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start MongoDB (Docker)
```bash
docker-compose up -d mongodb
```

### 4. Start Development Server
```bash
npm run dev
```

### 5. Access
- **API**: http://localhost:3000/api/v1
- **Swagger Docs**: http://localhost:3000/api/docs
- **Health Check**: http://localhost:3000/api/v1/health

---

## 🔐 Security Features

### Authentication
| Feature | Implementation |
|---|---|
| JWT Access Tokens | Short-lived (15min), signed with HS256 |
| JWT Refresh Tokens | Long-lived (7d), stored in DB, family-based |
| Token Rotation | New refresh token on each use |
| Reuse Detection | Old token reuse revokes entire family |
| Token Blacklist | Access tokens blacklisted on logout |
| Secure Cookies | httpOnly, sameSite=strict, secure in production |
| Account Locking | Auto-lock after 5 failed attempts for 30min |
| Password Strength | Min 8 chars, upper/lower/number/special required |

### Hardening
- **Helmet** with strict CSP, HSTS, frameguard
- **CORS** whitelist with security logging
- **Rate Limiting** — IP, per-user, login brute-force, Swagger
- **NoSQL Injection** prevention (express-mongo-sanitize)
- **XSS** protection (xss-clean, CSP headers)
- **HPP** HTTP parameter pollution prevention
- **CSRF** double-submit cookie pattern
- **IP Blocking** for suspicious activity
- **Request Body Limit** 10KB max

---

## 📊 Monitoring

### Event Loop Monitor
Detects blocking operations using `perf_hooks.monitorEventLoopDelay`:
- Percentile tracking (p50, p95, p99)
- Configurable threshold alerts
- Severity escalation on consecutive blocks
- CPU/memory snapshots on detection

### Performance Metrics Endpoint
```
GET /api/v1/admin/performance
Authorization: Bearer <admin-token>
```

Returns: event loop stats, memory, CPU, throughput, active connections, slowest routes.

---

## 📝 Logging

Five dedicated log files with daily rotation:

| File | Content |
|---|---|
| `error-YYYY-MM-DD.log` | Application errors |
| `security-YYYY-MM-DD.log` | Security events (auth failures, suspicious activity) |
| `access-YYYY-MM-DD.log` | Request/response logs |
| `system-YYYY-MM-DD.log` | System events (startup, shutdown, config) |
| `performance-YYYY-MM-DD.log` | Performance alerts |

**Features**: JSON structured, correlation/request IDs, sensitive data masking, no console output in production.

### Log Viewer API
```
GET /api/v1/admin/logs?type=security&page=1&limit=50&startDate=2024-01-01
Authorization: Bearer <admin-token>
```

---

## 📖 API Documentation

Swagger UI auto-generates from JSDoc annotations. Access at `/api/docs`.

**Compliance Enforcement**: On startup, the system scans all registered routes and compares against Swagger docs. Undocumented routes can block server startup (configurable via `SWAGGER_ENFORCE_DOCS`).

Taxi module full flow guide:
- [docs/TAXI_BOOKING_FLOW.md](docs/TAXI_BOOKING_FLOW.md)
- [frontend-dummy/src/taxi-full-flow-demo.html](frontend-dummy/src/taxi-full-flow-demo.html)

---

## 🐳 Docker

### Development
```bash
docker-compose up -d mongodb   # Start MongoDB only
npm run dev                     # Start app locally
```

### Production
```bash
docker-compose up -d            # Start both MongoDB and app
```

---

## 🔍 VAPT Scripts

```bash
npm run vapt:audit      # Run npm audit
npm run vapt:deps       # Dependency vulnerability check
npm run vapt:attack     # Simulated attack tests (dev only!)
```

Attack simulator tests: NoSQL injection, XSS, brute force, token tampering, path traversal, security headers, rate limiting.

---

## Proto To JSON Converter

Convert a `.proto` schema into a JSON descriptor file:

```bash
npm run convert:proto-json -- --input path/to/schema.proto
```

Write to a custom file:

```bash
npm run convert:proto-json -- --input path/to/schema.proto --output path/to/schema.json
```

Resolve imports from extra directories:

```bash
npm run convert:proto-json -- --input path/to/schema.proto --include path/to/protos --include path/to/shared
```

Print the generated descriptor to stdout:

```bash
npm run convert:proto-json -- --input path/to/schema.proto --stdout
```

---

## 🧪 API Test Script Standard

Function-based API flow tests (without Jest) must follow the project template in:

- `tests/README.md`

This includes Bearer token generation via `TokenService`, `console.table` response summary, and mandatory cleanup in `finally`.

---

## 📄 API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | No | Health check |
| POST | `/api/v1/auth/register` | No | Register user |
| POST | `/api/v1/auth/login` | No | Login |
| POST | `/api/v1/auth/refresh` | No | Refresh tokens |
| POST | `/api/v1/auth/logout` | Yes | Logout |
| POST | `/api/v1/auth/verify-email` | No | Verify email |
| POST | `/api/v1/auth/forgot-password` | No | Request password reset |
| POST | `/api/v1/auth/reset-password` | No | Reset password |
| POST | `/api/v1/auth/change-password` | Yes | Change password |
| GET | `/api/v1/auth/me` | Yes | Get profile |
| GET | `/api/v1/admin/logs` | Admin | View logs |
| GET | `/api/v1/admin/logs/info` | Admin | Log file info |
| GET | `/api/v1/admin/performance` | Admin | Performance metrics |

---

## 📋 Environment Variables

See `.env.example` for all configuration options. Critical variables:

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Yes | JWT access token secret (min 16 chars) |
| `JWT_REFRESH_SECRET` | Yes | JWT refresh token secret (min 16 chars) |
| `COOKIE_SECRET` | Yes | Cookie signing secret (min 16 chars) |
| `CORS_ORIGIN` | No | Comma-separated allowed origins |
| `SWAGGER_ENABLED` | No | Enable Swagger UI (default: true) |
| `SWAGGER_ENFORCE_DOCS` | No | Block startup on undocumented routes |

---

## 📚 Security Compliance

See [docs/SECURITY_COMPLIANCE.md](docs/SECURITY_COMPLIANCE.md) for:
- OWASP Top 10 alignment
- STRIDE threat model
- Risk assessment
- Incident response outline
- Audit readiness checklist
