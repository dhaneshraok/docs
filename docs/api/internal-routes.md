---
sidebar_position: 1
title: Internal API Routes
---

# Internal API Routes

This document provides a complete reference of all internal API routes in the Alertsify application.

---

## Overview

Alertsify uses **Next.js API Routes** for:
- External webhook handlers
- OAuth callbacks
- Cron job triggers
- Legacy REST endpoints

:::info Server Actions Preferred
For most client-server communication, we use **Server Actions** instead of API routes. See [Server Actions](/api/server-actions) for those.
:::

---

## Route Map

```
app/api/
├── brokers/              # Broker connection management
├── trading/              # Trade execution (legacy)
├── copy-trading/         # Copy trading endpoints
├── feeds/                # Activity feed endpoints
├── webhooks/             # External webhooks
├── cron/                 # Scheduled jobs
└── health/               # Health checks
```

---

## Broker Routes

### `POST /api/brokers/connect`

Initiates broker OAuth connection flow.

**Request:**
```typescript
{
  brokerId: string;        // e.g., "ALPACA", "TRADIER"
  redirectUri?: string;    // Optional custom redirect
}
```

**Response:**
```typescript
{
  connectionUrl: string;   // OAuth URL to redirect user
  sessionId: string;       // For tracking the connection
}
```

<details>
<summary>📝 Full Implementation</summary>

```typescript
// app/api/brokers/connect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { snaptradeService } from '@/lib/integrations/snaptrade.service';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { brokerId, redirectUri } = await request.json();

  const result = await snaptradeService.getConnectionUrl({
    userId: session.user.id,
    brokerId,
    redirectUri: redirectUri ?? `${process.env.NEXT_PUBLIC_APP_URL}/settings/brokers`,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    connectionUrl: result.url,
    sessionId: result.sessionId,
  });
}
```

</details>

---

### `GET /api/brokers/accounts`

Fetches user's connected brokerage accounts.

**Response:**
```typescript
{
  accounts: Array<{
    id: string;
    brokerName: string;
    accountNumber: string;
    accountType: string;      // "margin" | "cash" | "ira"
    balance: number;
    buyingPower: number;
    isSelected: boolean;
  }>;
}
```

---

### `DELETE /api/brokers/accounts/:accountId`

Disconnects a brokerage account.

**Response:**
```typescript
{
  success: boolean;
  message: string;
}
```

---

## Copy Trading Routes

### `POST /api/copy-trading/subscribe`

Subscribe to a trader for copy trading.

**Request:**
```typescript
{
  traderId: string;
  settings: {
    autoExecute: boolean;      // Auto-execute or notify for approval
    maxPositionSize: number;   // Max contracts per trade
    maxDailyTrades: number;    // Daily trade limit
    scalingFactor: number;     // Position size multiplier (0.5 = 50%)
  };
}
```

**Response:**
```typescript
{
  subscription: {
    id: string;
    traderId: string;
    subscriberId: string;
    settings: SubscriptionSettings;
    status: "active" | "paused";
    createdAt: string;
  };
}
```

<details>
<summary>📝 Full Implementation</summary>

```typescript
// app/api/copy-trading/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { copyTradingService } from '@/lib/services/copy-trading.service';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { traderId, settings } = await request.json();

  // Prevent self-subscription
  if (traderId === session.user.id) {
    return NextResponse.json(
      { error: 'Cannot subscribe to yourself' }, 
      { status: 400 }
    );
  }

  const subscription = await copyTradingService.createSubscription({
    traderId,
    subscriberId: session.user.id,
    settings,
  });

  return NextResponse.json({ subscription });
}
```

</details>

---

### `GET /api/copy-trading/traders`

List available traders to follow.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `sort` | string | `pnl`, `winRate`, `followers` |
| `period` | string | `daily`, `weekly`, `monthly`, `all` |
| `limit` | number | Results per page (default: 20) |
| `cursor` | string | Pagination cursor |

**Response:**
```typescript
{
  traders: Array<{
    id: string;
    username: string;
    avatarUrl: string;
    stats: {
      totalPnL: number;
      winRate: number;
      totalTrades: number;
      followers: number;
    };
    isFollowing: boolean;
  }>;
  nextCursor: string | null;
}
```

---

### `PATCH /api/copy-trading/subscription/:id`

Update subscription settings.

**Request:**
```typescript
{
  settings?: SubscriptionSettings;
  status?: "active" | "paused";
}
```

---

### `DELETE /api/copy-trading/subscription/:id`

Unsubscribe from a trader.

---

## Webhook Routes

### `POST /api/webhooks/snaptrade`

Receives SnapTrade order update webhooks.

**Headers:**
```
x-snaptrade-signature: <signature>
```

**Payload:**
```typescript
{
  event: "order_updated" | "order_filled" | "order_cancelled";
  data: {
    brokerOrderId: string;
    status: string;
    filledQuantity: number;
    averagePrice: number;
    timestamp: string;
  };
}
```

<details>
<summary>📝 Webhook Handler</summary>

```typescript
// app/api/webhooks/snaptrade/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySnaptradeSignature } from '@/lib/utils/crypto';
import { syncService } from '@/lib/services/sync.service';

export async function POST(request: NextRequest) {
  // 1. Verify signature
  const signature = request.headers.get('x-snaptrade-signature');
  const body = await request.text();

  if (!verifySnaptradeSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Parse and handle event
  const event = JSON.parse(body);

  switch (event.type) {
    case 'order_filled':
      await syncService.handleOrderFilled(event.data);
      break;
    case 'order_cancelled':
      await syncService.handleOrderCancelled(event.data);
      break;
    default:
      console.log('[Webhook] Unknown event:', event.type);
  }

  return NextResponse.json({ received: true });
}
```

</details>

---

### `POST /api/webhooks/whop`

Receives Whop subscription webhooks.

**Events:**
| Event | Action |
|-------|--------|
| `payment.succeeded` | Activate subscription |
| `payment.failed` | Send retry notification |
| `subscription.cancelled` | Revoke access |
| `subscription.renewed` | Extend access |

---

## Cron Routes

### `GET /api/cron/sync-orders`

Syncs pending orders with broker status.

**Schedule:** Every 5 minutes

**Authorization:** Requires `CRON_SECRET` header

<details>
<summary>📝 Implementation</summary>

```typescript
// app/api/cron/sync-orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { syncService } from '@/lib/services/sync.service';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await syncService.syncAllPendingOrders();

  return NextResponse.json({
    success: true,
    synced: result.syncedCount,
    errors: result.errors,
  });
}
```

</details>

---

### `GET /api/cron/update-leaderboard`

Updates leaderboard rankings.

**Schedule:** Every hour

---

### `GET /api/cron/cleanup-expired`

Cleans up expired sessions and tokens.

**Schedule:** Daily at midnight

---

## Health Routes

### `GET /api/health`

Basic health check.

**Response:**
```typescript
{
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
}
```

---

### `GET /api/health/ready`

Readiness check including dependencies.

**Response:**
```typescript
{
  status: "ready" | "not_ready";
  checks: {
    database: "ok" | "error";
    redis: "ok" | "error";
    snaptrade: "ok" | "error";
  };
}
```

---

## Error Response Format

All API routes return errors in this format:

```typescript
{
  error: string;           // Human-readable message
  code?: string;           // Machine-readable error code
  details?: object;        // Additional context
}
```

**HTTP Status Codes:**

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 429 | Rate Limited |
| 500 | Server Error |

---

## Authentication

Most routes require authentication via session cookie (NextAuth.js).

```typescript
// Check auth in route handler
const session = await auth();
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Webhook routes use signature verification instead.

---

## Next Steps

- [SnapTrade API](/api/snaptrade) — External brokerage API
- [GetStream API](/api/getstream) — Activity feeds API
- [Server Actions](/api/server-actions) — Primary mutation API
