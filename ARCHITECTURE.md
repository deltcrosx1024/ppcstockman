# PPC Stock Management System - Technical Architecture

## Overview
PPC Stock Management is a custom Warehouse Management System (WMS) designed for a motorcycle repair and retail business. The system follows a client-server architecture with a Next.js frontend communicating via Axios to a backend API that utilizes Upstash Redis for data storage.

## Technology Stack
- **Frontend**: Next.js 13+ (App Router)
- **Backend**: Next.js API Routes (Node.js)
- **Database**: Upstash Redis (with in-memory MockRedis fallback for development)
- **Authentication**: JWT-based token system
- **Styling**: CSS Modules / Global CSS
- **Type Safety**: TypeScript

## System Architecture

### Directory Structure
```
ppcstockman/
├── app/
│   ├── api/                    # API endpoints
│   │   ├── auth/              # Authentication endpoints
│   │   ├── inventory/         # Inventory management
│   │   ├── pos/               # Point of Sale operations
│   │   ├── revenue/           # Revenue tracking
│   │   ├── shifts/            # Shift management
│   │   └── users/             # User management
│   ├── dashboard/             # Frontend dashboard
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Home page
├── lib/
│   ├── auth.ts                # Authentication utilities
│   └── redis.ts               # Redis connection wrapper
├── types/                     # TypeScript interfaces
│   ├── user.ts
│   ├── inventoryItem.ts
│   ├── inventoryMovement.ts
│   ├── cart.ts
│   ├── order.ts
│   ├── shift.ts
│   ├── revenue.ts
│   └── budget.ts
└── public/                    # Static assets
```

## Core Components

### 1. Authentication & User Management
**Files**: 
- `app/api/auth/login/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/users/route.ts`
- `app/api/users/[id]/route.ts`
- `lib/auth.ts`

**Features**:
- Custom lightweight authentication system using JWT
- Role-based access control (RBAC) with roles: super_admin, admin, employee, cashier
- Super Administrator can create employee accounts and manage roles
- Password hashing using SHA-256
- Token-based session management (1-hour expiry)
- Development seed data for super admin (admin/password123)

**Redis Schema**:
- `user:{userId}` - Hash storing user data
- `user:username:{username}` - String mapping username to userId
- `users` - Set of all user IDs

### 2. Inventory Management Module
**Files**:
- `app/api/inventory/items/route.ts`
- `app/api/inventory/barcodes/route.ts`
- `app/api/inventory/movements/in/route.ts`
- `app/api/inventory/movements/out/route.ts`
- `app/api/inventory/label/route.ts`
- `app/api/inventory/budget/route.ts`
- `app/api/inventory/import/route.ts`
- `app/api/loyverse/webhook/route.ts` (Loyverse API integration)

**Features**:
- Item tracking with name, description, barcode, category, pricing
- Barcode registry for individual item tracking
- In-registry (inbound) and Out-registry (outbound) functionality
- Label generation (prototype text format, ready for PDF enhancement)
- Daily budget tracking (input/output value summary)
- Bulk import capabilities
- Loyverse API integration via webhook endpoint for real-time synchronization

**Redis Schema**:
- `inventory:item:{itemId}` - Hash storing item details
- `inventory:movement:{movementId}` - Hash storing movement records
- `inventory:movementIds` - Set of all movement IDs
- `inventory:barcode:{barcode}` - String mapping barcode to itemId

### 3. Cashier Workspace (POS)
**Files**:
- `app/api/pos/cart/route.ts`
- `app/api/pos/cart/[itemId]/route.ts`
- `app/api/pos/orders/route.ts`
- `app/api/pos/receipts/route.ts`

**Features**:
- Point-of-Sale interface for item checkout
- Cart management (add/remove/update items)
- Automated order processing from cart
- Receipt generation (JSON format, ready for PDF enhancement)
- Inventory deduction on sale
- Order history with filtering and pagination

**Redis Schema**:
- `cart:{userId}` - String storing cart JSON
- `order:{orderId}` - Hash storing order details
- `orders` - Set of all order IDs
- `user:{userId}:orders` - Set of user's order IDs

### 4. Shift & Revenue Management
**Files**:
- `app/api/shifts/route.ts`
- `app/api/shifts/[id]/route.ts`
- `app/api/revenue/route.ts`

**Features**:
- Employee shift scheduling and tracking
- Real-time financial summaries per shift
- Expected revenue vs. actual sales comparison
- Transaction summaries and analytics
- Date-range reporting capabilities

**Redis Schema**:
- `shift:{shiftId}` - Hash storing shift details
- `shifts` - Set of all shift IDs
- `user:{userId}:shifts` - Set of user's shift IDs

## API Design Patterns

### Authentication Middleware
All protected endpoints use the authentication utilities from `lib/auth.ts`:
- `authenticateHandler` - Basic token verification
- `authorizeRole` - Role-based access control wrapper

### Response Format
Success responses follow the format:
```json
{
  "message": "Success message",
  "data": {...}
}
```

Error responses follow the format:
```json
{
  "error": "Error description"
}
```
with appropriate HTTP status codes (400, 401, 403, 404, 500).

### Route Organization
- RESTful conventions where applicable
- Dynamic route segments for resource IDs
- Query parameters for filtering and pagination
- Proper HTTP methods (GET, POST, PUT, DELETE)

## Data Flow

### Authentication Flow
1. User submits credentials to `/api/auth/login`
2. Server verifies credentials against Redis
3. On success, JWT token is generated and returned
4. Client stores token and includes it in Authorization header
5. Server validates token on each protected request

### Inventory Operation Flow (Example: Purchase Order)
1. User authenticates and accesses inventory interface
2. User creates/receives inventory items via `/api/inventory/items`
3. When stock arrives, user records inbound movement via `/api/inventory/movements/in`
4. System updates item quantity in Redis
5. Movement is logged for audit trail and reporting

### Sales Flow (POS)
1. User authenticates and accesses POS interface
2. User adds items to cart via `/api/pos/cart`
3. User submits order via `/api/pos/orders`
4. System validates stock availability
5. Creates order record and outbound inventory movements
6. Updates item quantities and clears cart
7. Returns order confirmation and receipt data

## Security Considerations

### Authentication
- JWT tokens with HMAC-SHA256 signing
- Configurable expiration (1 hour)
- Secure token handling (HTTP-only cookies recommended for production)
- Password hashing (never store plaintext passwords)

### Authorization
- Role-based access control on all sensitive endpoints
- Super Admin restricted user management
- Inventory and financial data access controls
- Input validation on all endpoints

### Data Protection
- Environment variables for secrets (JWT_SECRET, Redis credentials)
- No sensitive data in logs or error messages
- Development vs production configuration separation

## Development & Deployment

### Local Development
1. Copy `.env.example` to `.env`
2. Set environment variables:
   ```
   UPSTASH_REDIS_REST_URL=your_upstash_url
   UPSTASH_REDIS_REST_TOKEN=your_upstash_token
   JWT_SECRET=your_jwt_secret
   LOYVERSE_WEBHOOK_TOKEN=your_loyverse_webhook_token
   ```
3. Run `npm install`
4. Run `npm run dev`

### Production Considerations
1. Use actual Upstash Redis instance (not MockRedis)
2. Implement rate limiting on auth endpoints
3. Add request size limits
4. Implement proper logging and monitoring
5. Use HTTPS in production
6. Consider CDN for static assets
7. Implement backup strategy for Redis data

## Extensibility Points

### Planned Enhancements
1. **Label Generation**: Integrate PDFKit or similar for actual PDF/sticker generation
2. **Receipt Printing**: Add PDF receipt generation with proper formatting
3. **Advanced Reporting**: Add export capabilities (CSV, Excel)
4. **Notifications**: Add email/SMS alerts for low inventory
5. **User Interface**: Enhance frontend with better UX/UI
6. **Audit Trail**: Detailed logging of all system operations
7. **Integration**: API for accounting software integration
8. **Loyverse Enhancements**: Add support for additional Loyverse endpoints (transactions, customers, etc.)

### Backend Extension
- Add new API routes under `app/api/` following existing patterns
- Create new type definitions in `types/` as needed
- Extend Redis schema with new hash/sets as required
- Use existing auth utilities for consistent security

## Conclusion
The PPC Stock Management system provides a solid foundation for a motorcycle repair and retail business WMS. It implements all requested modules with clean separation of concerns, proper authentication/authorization, and extensible design. The system is ready for production use with minimal enhancements (primarily in the UI layer and report generation) and follows best practices for security, maintainability, and scalability.