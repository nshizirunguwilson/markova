# Markova

Standalone, self-hosted school management system.

## Project Structure

```
markova/
├── backend/          # NestJS API
├── web/              # Next.js dashboard
├── mobile/           # Flutter app (Phase 2)
├── docs/             # Deployment docs, user guides
├── docker-compose.yml
├── .env.example
└── README.md
```

## Tech Stack

- **Backend**: Node.js + NestJS + TypeScript + Prisma ORM
- **Database**: PostgreSQL 15+ with Redis for cache/queues
- **Web Dashboard**: Next.js 14+ (App Router) + TypeScript + Tailwind CSS
- **Mobile**: Flutter (Phase 2)

## Development Setup

1. Start database services:
   ```bash
   docker-compose up -d
   ```

2. Copy environment config:
   ```bash
   cp .env.example backend/.env
   ```

3. Start backend:
   ```bash
   cd backend
   npm install
   npx prisma migrate dev
   npm run start:dev
   ```

4. Start web dashboard:
   ```bash
   cd web
   npm install
   npm run dev
   ```
