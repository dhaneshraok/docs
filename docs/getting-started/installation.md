---
sidebar_position: 2
title: Installation
---

# Installation Guide

This guide walks you through setting up the Alertsify development environment from scratch.

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | 20.x LTS | JavaScript runtime |
| **pnpm** | 8.x+ | Package manager (faster than npm) |
| **PostgreSQL** | 15+ | Database (or use Supabase) |
| **Git** | Latest | Version control |

### Recommended Tools

| Tool | Purpose |
|------|---------|
| **VS Code** | IDE with excellent TypeScript support |
| **Postico/TablePlus** | Database GUI client |
| **Postman/Insomnia** | API testing |

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/alertsify.git
cd alertsify
```

---

## Step 2: Install Dependencies

We use **pnpm** for faster, more efficient package management.

```bash
# Install pnpm if you haven't
npm install -g pnpm

# Install project dependencies
pnpm install
```

:::tip Why pnpm?
pnpm uses a content-addressable file store, which means dependencies are shared across projects and disk space is saved. It's also significantly faster than npm.
:::

---

## Step 3: Environment Configuration

Create your local environment file:

```bash
cp .env.example .env.local
```

### Required Environment Variables

Configure the following variables in `.env.local`:

<details>
<summary>📝 Core Configuration</summary>

```bash
# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Authentication
NEXTAUTH_SECRET=your-random-secret-here
NEXTAUTH_URL=http://localhost:3000
```

</details>

<details>
<summary>📝 Database Configuration</summary>

```bash
# Supabase PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:54322/postgres
DIRECT_URL=postgresql://postgres:password@localhost:54322/postgres

# OR use Supabase Cloud
# DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

</details>

<details>
<summary>📝 SnapTrade (Brokerage)</summary>

```bash
# SnapTrade API Keys
SNAPTRADE_CLIENT_ID=your-client-id
SNAPTRADE_CONSUMER_SECRET=your-consumer-secret

# Get these from: https://snaptrade.com/dashboard
```

</details>

<details>
<summary>📝 GetStream (Activity Feeds)</summary>

```bash
# GetStream Keys
GETSTREAM_API_KEY=your-api-key
GETSTREAM_API_SECRET=your-api-secret

# Get these from: https://getstream.io/dashboard
```

</details>

<details>
<summary>📝 Redis (Caching)</summary>

```bash
# Vercel KV (Redis)
KV_URL=redis://localhost:6379
KV_REST_API_URL=http://localhost:6379
KV_REST_API_TOKEN=your-token
KV_REST_API_READ_ONLY_TOKEN=your-read-only-token

# For local development, you can use Docker:
# docker run -d -p 6379:6379 redis:alpine
```

</details>

<details>
<summary>📝 Discord (Notifications)</summary>

```bash
# Discord Webhook URLs
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
DISCORD_ALERTS_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
```

</details>

---

## Step 4: Database Setup

### Option A: Local Supabase (Recommended for Development)

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Start local Supabase
supabase start

# This starts:
# - PostgreSQL on port 54322
# - Supabase Studio on port 54323
# - Auth service on port 54321
```

### Option B: Cloud Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Copy the connection string to `DATABASE_URL`
3. Enable Row Level Security (RLS) as needed

### Run Migrations

```bash
# Push schema to database
pnpm db:push

# Or if using migrations
pnpm db:migrate
```

### Seed Sample Data (Optional)

```bash
pnpm db:seed
```

---

## Step 5: Start Development Server

```bash
pnpm dev
```

The application will be available at:
- **App**: http://localhost:3000
- **Supabase Studio**: http://localhost:54323

---

## Verify Installation

Check that everything is working:

| Check | How to Verify |
|-------|---------------|
| ✅ Homepage loads | Visit http://localhost:3000 |
| ✅ Database connected | Check console for connection errors |
| ✅ Auth works | Try signing up/logging in |
| ✅ API routes work | Visit http://localhost:3000/api/health |

---

## Common Issues

<details>
<summary>❌ "Module not found" errors</summary>

Clear your node_modules and reinstall:

```bash
rm -rf node_modules .next
pnpm install
```

</details>

<details>
<summary>❌ Database connection refused</summary>

Ensure PostgreSQL/Supabase is running:

```bash
# Check if Supabase is running
supabase status

# Or restart it
supabase stop && supabase start
```

</details>

<details>
<summary>❌ Environment variable errors</summary>

Ensure all required variables are set:

```bash
# Check which variables are missing
pnpm run env:check
```

</details>

---

## Next Steps

Now that you have the environment running:

1. **Explore the codebase** → [Project Structure](./project-structure)
2. **Understand the tech stack** → [Tech Stack](./tech-stack)
3. **Learn the architecture** → [Architecture Overview](/architecture/overview)
