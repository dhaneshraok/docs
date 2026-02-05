---
sidebar_position: 1
title: Integrations Overview
---

# External Integrations

This document provides an overview of all external services integrated into Alertsify.

---

## Integration Map

```mermaid
flowchart TB
    subgraph Core["Alertsify Core"]
        App[Next.js Application]
    end

    subgraph Brokerage["Brokerage Layer"]
        SnapTrade[SnapTrade API]
        Brokers[TD/Robinhood/Alpaca/etc]
    end

    subgraph Social["Social & Feeds"]
        GetStream[GetStream]
    end

    subgraph Notifications["Notifications"]
        Discord[Discord Webhooks]
        Push[Web Push]
    end

    subgraph Infrastructure["Infrastructure"]
        Supabase[Supabase/PostgreSQL]
        Vercel[Vercel KV/Redis]
        Auth[NextAuth.js]
    end

    subgraph Payments["Payments"]
        Whop[Whop]
    end

    App --> SnapTrade
    SnapTrade --> Brokers
    App --> GetStream
    App --> Discord
    App --> Push
    App --> Supabase
    App --> Vercel
    App --> Auth
    App --> Whop
```

---

## Integration Summary

| Service | Purpose | Documentation |
|---------|---------|---------------|
| **SnapTrade** | Brokerage aggregation | [SnapTrade API](/api/snaptrade) |
| **GetStream** | Activity feeds & notifications | [GetStream API](/api/getstream) |
| **Discord** | Trade alert webhooks | [Discord Webhooks](/api/discord) |
| **Supabase** | PostgreSQL database | [Database Schema](/database/schema) |
| **Vercel KV** | Redis caching | [Caching Strategy](/architecture/caching) |
| **NextAuth.js** | Authentication | Below |
| **Whop** | Subscription payments | Below |

---

## SnapTrade

### Purpose
Unified API to connect and trade with multiple brokerages.

### Capabilities

| Feature | Description |
|---------|-------------|
| **OAuth Connection** | Connect to 20+ brokers |
| **Account Data** | Balances, positions, history |
| **Order Execution** | Place buy/sell orders |
| **Webhooks** | Real-time order updates |

### Environment Variables

```bash
SNAPTRADE_CLIENT_ID=your_client_id
SNAPTRADE_CONSUMER_SECRET=your_consumer_secret
```

➡️ See [SnapTrade API Reference](/api/snaptrade) for full documentation.

---

## GetStream

### Purpose
Scalable activity feeds and real-time notifications.

### Capabilities

| Feature | Description |
|---------|-------------|
| **Activity Feeds** | Trade timeline, global feed |
| **Notifications** | In-app notification feed |
| **Follow System** | Trader subscriptions |
| **Real-time** | WebSocket updates |

### Environment Variables

```bash
GETSTREAM_API_KEY=your_api_key
GETSTREAM_API_SECRET=your_api_secret
GETSTREAM_APP_ID=your_app_id

# Client-side
NEXT_PUBLIC_GETSTREAM_KEY=your_api_key
NEXT_PUBLIC_GETSTREAM_APP_ID=your_app_id
```

➡️ See [GetStream API Reference](/api/getstream) for full documentation.

---

## Discord

### Purpose
Send trade alerts to Discord channels via webhooks.

### Capabilities

| Feature | Description |
|---------|-------------|
| **BTO Alerts** | New position opened |
| **STC Alerts** | Position closed with P&L |
| **Rich Embeds** | Formatted alert cards |
| **Multi-channel** | Separate channels by type |

### Environment Variables

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
DISCORD_BTO_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy  # Optional
DISCORD_STC_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy  # Optional
DISCORD_ADMIN_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
```

➡️ See [Discord Webhooks Reference](/api/discord) for full documentation.

---

## Supabase

### Purpose
PostgreSQL database with real-time capabilities.

### Capabilities

| Feature | Description |
|---------|-------------|
| **PostgreSQL** | Relational database |
| **Row Level Security** | Database-level auth |
| **Edge Functions** | Serverless functions |
| **Storage** | File storage (avatars, etc.) |

### Environment Variables

```bash
DATABASE_URL=postgresql://user:password@host:5432/db
DIRECT_URL=postgresql://user:password@host:5432/db  # For migrations
```

➡️ See [Database Schema](/database/schema) for table definitions.

---

## Vercel KV (Redis)

### Purpose
High-performance caching and rate limiting.

### Capabilities

| Feature | Description |
|---------|-------------|
| **Caching** | API response caching |
| **Rate Limiting** | Request throttling |
| **Session Data** | Fast session lookups |
| **Deduplication** | Prevent duplicate alerts |

### Environment Variables

```bash
KV_REST_API_URL=your_kv_url
KV_REST_API_TOKEN=your_kv_token
```

➡️ See [Caching Strategy](/architecture/caching) for patterns.

---

## NextAuth.js

### Purpose
Authentication and session management.

### Capabilities

| Feature | Description |
|---------|-------------|
| **OAuth Providers** | Google, Discord, GitHub |
| **Session Management** | JWT or database sessions |
| **Callbacks** | Custom auth logic |

### Configuration

<details>
<summary>📝 Auth Configuration</summary>

```typescript
// lib/auth.ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Discord from 'next-auth/providers/discord';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from './db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session: async ({ session, user }) => {
      session.user.id = user.id;
      return session;
    },
  },
});
```

</details>

### Environment Variables

```bash
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your_secret

# OAuth Providers
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
```

---

## Whop

### Purpose
Subscription management and payment processing.

### Capabilities

| Feature | Description |
|---------|-------------|
| **Subscriptions** | Recurring payments |
| **Webhooks** | Payment events |
| **License Keys** | Access validation |
| **Analytics** | Revenue tracking |

### Configuration

<details>
<summary>📝 Whop Integration</summary>

```typescript
// lib/integrations/whop.service.ts
import Whop from '@whop-apps/sdk';

const whop = new Whop({
  apiKey: process.env.WHOP_API_KEY!,
});

export async function validateLicense(licenseKey: string): Promise<boolean> {
  try {
    const license = await whop.licenses.retrieve(licenseKey);
    return license.status === 'active';
  } catch {
    return false;
  }
}

export async function getSubscription(userId: string) {
  return await whop.memberships.list({
    user_id: userId,
  });
}
```

</details>

### Webhook Events

| Event | Action |
|-------|--------|
| `membership.created` | Grant access |
| `membership.cancelled` | Revoke access |
| `payment.succeeded` | Confirm payment |
| `payment.failed` | Send retry notification |

### Environment Variables

```bash
WHOP_API_KEY=your_api_key
WHOP_WEBHOOK_SECRET=your_webhook_secret
```

---

## Web Push

### Purpose
Browser push notifications.

### Capabilities

| Feature | Description |
|---------|-------------|
| **Push Notifications** | Browser alerts |
| **Service Worker** | Background handling |
| **VAPID** | Secure authentication |

### Environment Variables

```bash
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_SUBJECT=mailto:your@email.com

NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key
```

➡️ See [Notifications Flow](/flows/notifications) for implementation.

---

## Environment Variables Summary

### Required for Production

```bash
# Database
DATABASE_URL=
DIRECT_URL=

# Authentication
NEXTAUTH_URL=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# SnapTrade
SNAPTRADE_CLIENT_ID=
SNAPTRADE_CONSUMER_SECRET=

# GetStream
GETSTREAM_API_KEY=
GETSTREAM_API_SECRET=
GETSTREAM_APP_ID=
NEXT_PUBLIC_GETSTREAM_KEY=
NEXT_PUBLIC_GETSTREAM_APP_ID=

# Vercel KV
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=

# Whop
WHOP_API_KEY=
WHOP_WEBHOOK_SECRET=

# Cron
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=
```

### Optional

```bash
# Discord (for alerts)
DISCORD_WEBHOOK_URL=
DISCORD_ADMIN_WEBHOOK_URL=

# Additional OAuth
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

---

## Health Checks

All integrations have health check endpoints:

```typescript
// app/api/health/ready/route.ts
export async function GET() {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    snaptrade: await checkSnapTrade(),
    getstream: await checkGetStream(),
  };

  const healthy = Object.values(checks).every(c => c === 'ok');

  return NextResponse.json({
    status: healthy ? 'ready' : 'degraded',
    checks,
  });
}
```

---

## Next Steps

- [SnapTrade API](/api/snaptrade) — Brokerage integration details
- [GetStream API](/api/getstream) — Activity feeds
- [Discord Webhooks](/api/discord) — Trade alerts
- [Installation Guide](/getting-started/installation) — Setup instructions
