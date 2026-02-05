---
sidebar_position: 5
title: Server Actions
---

# Server Actions Reference

This document provides a complete reference of all Server Actions available in Alertsify.

---

## Overview

Server Actions are the primary API for client-server communication in Alertsify. They provide type-safe, authenticated function calls that run on the server.

### Location

All server actions are in `lib/actions/`:

```
lib/actions/
├── trading.actions.ts        # Trade execution
├── account.actions.ts        # Account management
├── copy-trading.actions.ts   # Copy trading
├── notification.actions.ts   # Notifications
├── user.actions.ts           # User profile
└── broker.actions.ts         # Broker connections
```

---

## Trading Actions

### `placeOptionOrder`

Places a BTO (Buy to Open) or STC (Sell to Close) order.

**Signature:**
```typescript
async function placeOptionOrder(params: PlaceOrderParams): Promise<ActionResult<Trade>>
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `side` | `'BTO' \| 'STC'` | ✅ | Order direction |
| `underlying` | `string` | ✅ | Stock symbol (e.g., "AAPL") |
| `optionType` | `'call' \| 'put'` | ✅ | Option type |
| `strike` | `number` | ✅ | Strike price |
| `expiration` | `string` | ✅ | Expiration date (YYYY-MM-DD) |
| `quantity` | `number` | ✅ | Number of contracts |
| `orderType` | `'Market' \| 'Limit'` | ✅ | Order type |
| `limitPrice` | `number` | For Limit | Limit price per share |
| `parentTradeId` | `string` | For STC | Parent trade to close |

**Returns:**

```typescript
// Success
{ 
  ok: true, 
  data: {
    id: string;
    parentTradeId: string;
    brokerOrderId: string;
    status: 'pending' | 'filled' | 'cancelled';
  }
}

// Error
{ ok: false, error: string }
```

<details>
<summary>📝 Usage Example</summary>

```typescript
// In a client component
import { placeOptionOrder } from '@/lib/actions/trading.actions';

const handleBuy = async () => {
  const result = await placeOptionOrder({
    side: 'BTO',
    underlying: 'AAPL',
    optionType: 'call',
    strike: 200,
    expiration: '2025-02-21',
    quantity: 5,
    orderType: 'Limit',
    limitPrice: 3.50,
  });

  if (result.ok) {
    toast.success('Order placed!');
    console.log('Trade ID:', result.data.id);
  } else {
    toast.error(result.error);
  }
};
```

</details>

---

### `cancelOrder`

Cancels a pending order.

**Signature:**
```typescript
async function cancelOrder(orderId: string): Promise<ActionResult<void>>
```

---

### `getOpenPositions`

Retrieves user's open positions.

**Signature:**
```typescript
async function getOpenPositions(): Promise<ActionResult<Position[]>>
```

**Returns:**

```typescript
{
  ok: true,
  data: Array<{
    id: string;
    symbol: string;
    underlying: string;
    optionType: 'call' | 'put';
    strike: number;
    expiration: string;
    quantity: number;
    averageEntry: number;
    currentPrice: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
  }>
}
```

---

### `getTradeHistory`

Retrieves user's trade history with pagination.

**Signature:**
```typescript
async function getTradeHistory(params: {
  limit?: number;
  cursor?: string;
  status?: 'all' | 'open' | 'closed';
}): Promise<ActionResult<PaginatedResult<Trade>>>
```

---

## Account Actions

### `getConnectedAccounts`

Retrieves user's connected brokerage accounts.

**Signature:**
```typescript
async function getConnectedAccounts(): Promise<ActionResult<BrokerageAccount[]>>
```

**Returns:**

```typescript
{
  ok: true,
  data: Array<{
    id: string;
    brokerName: string;
    accountNumber: string;
    accountType: string;
    balance: number;
    buyingPower: number;
    isSelected: boolean;
    lastSyncAt: string;
  }>
}
```

---

### `setSelectedAccount`

Sets the default account for trading.

**Signature:**
```typescript
async function setSelectedAccount(accountId: string): Promise<ActionResult<void>>
```

---

### `disconnectAccount`

Disconnects a brokerage account.

**Signature:**
```typescript
async function disconnectAccount(accountId: string): Promise<ActionResult<void>>
```

---

### `syncAccount`

Manually triggers account sync with broker.

**Signature:**
```typescript
async function syncAccount(accountId: string): Promise<ActionResult<SyncResult>>
```

---

## Copy Trading Actions

### `subscribeToTrader`

Subscribe to a trader for copy trading.

**Signature:**
```typescript
async function subscribeToTrader(params: {
  traderId: string;
  settings: SubscriptionSettings;
}): Promise<ActionResult<Subscription>>
```

**Settings:**

| Field | Type | Description |
|-------|------|-------------|
| `autoExecute` | `boolean` | Auto-execute or notify for approval |
| `maxPositionSize` | `number` | Max contracts per trade |
| `maxDailyTrades` | `number` | Daily trade limit |
| `scalingFactor` | `number` | Position size multiplier (0.5 = 50%) |

---

### `unsubscribeFromTrader`

Unsubscribe from a trader.

**Signature:**
```typescript
async function unsubscribeFromTrader(subscriptionId: string): Promise<ActionResult<void>>
```

---

### `updateSubscriptionSettings`

Update copy trading settings.

**Signature:**
```typescript
async function updateSubscriptionSettings(
  subscriptionId: string,
  settings: Partial<SubscriptionSettings>
): Promise<ActionResult<Subscription>>
```

---

### `pauseSubscription` / `resumeSubscription`

Pause or resume a subscription.

**Signature:**
```typescript
async function pauseSubscription(subscriptionId: string): Promise<ActionResult<void>>
async function resumeSubscription(subscriptionId: string): Promise<ActionResult<void>>
```

---

### `getMySubscriptions`

Get trader subscriptions for the current user.

**Signature:**
```typescript
async function getMySubscriptions(): Promise<ActionResult<Subscription[]>>
```

---

### `getMySubscribers`

Get users subscribed to the current user (for traders).

**Signature:**
```typescript
async function getMySubscribers(): Promise<ActionResult<Subscriber[]>>
```

---

## User Actions

### `updateProfile`

Update user profile.

**Signature:**
```typescript
async function updateProfile(params: {
  name?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
}): Promise<ActionResult<User>>
```

---

### `updateSettings`

Update user settings.

**Signature:**
```typescript
async function updateSettings(params: {
  notifications?: NotificationSettings;
  trading?: TradingSettings;
  privacy?: PrivacySettings;
}): Promise<ActionResult<Settings>>
```

---

### `getProfileById`

Get another user's public profile.

**Signature:**
```typescript
async function getProfileById(userId: string): Promise<ActionResult<PublicProfile>>
```

---

## Notification Actions

### `getNotifications`

Get user notifications with pagination.

**Signature:**
```typescript
async function getNotifications(params?: {
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
}): Promise<ActionResult<PaginatedResult<Notification>>>
```

---

### `markNotificationsRead`

Mark notifications as read.

**Signature:**
```typescript
async function markNotificationsRead(
  notificationIds: string[]
): Promise<ActionResult<void>>
```

---

### `markAllNotificationsRead`

Mark all notifications as read.

**Signature:**
```typescript
async function markAllNotificationsRead(): Promise<ActionResult<void>>
```

---

## Error Handling

All actions return a consistent result type:

```typescript
type ActionResult<T> = 
  | { ok: true; data: T }
  | { ok: false; error: string };
```

### Common Error Messages

| Error | Meaning |
|-------|---------|
| `"Unauthorized"` | User not logged in |
| `"No brokerage account connected"` | Need to connect broker first |
| `"Insufficient buying power"` | Not enough funds |
| `"Market is closed"` | Trading outside hours |
| `"Invalid order parameters"` | Validation failed |
| `"Rate limit exceeded"` | Too many requests |

### Error Handling Pattern

```typescript
const result = await placeOptionOrder(params);

if (!result.ok) {
  // Handle specific errors
  switch (result.error) {
    case 'Insufficient buying power':
      showDepositModal();
      break;
    case 'Market is closed':
      showMarketHoursInfo();
      break;
    default:
      toast.error(result.error);
  }
  return;
}

// Success
const trade = result.data;
```

---

## Type Definitions

<details>
<summary>📝 Common Types</summary>

```typescript
// lib/types/actions.ts

interface Trade {
  id: string;
  userId: string;
  parentTradeId: string;
  brokerOrderId: string;
  symbol: string;
  underlying: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  action: 'buy' | 'sell';
  quantity: number;
  filledQuantity: number;
  limitPrice: number | null;
  filledPrice: number | null;
  status: 'pending' | 'filled' | 'cancelled';
  source: 'manual' | 'copy';
  createdAt: string;
  filledAt: string | null;
}

interface Position {
  id: string;
  symbol: string;
  underlying: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  quantity: number;
  averageEntry: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  status: 'open' | 'closed';
}

interface Subscription {
  id: string;
  traderId: string;
  subscriberId: string;
  settings: SubscriptionSettings;
  status: 'active' | 'paused';
  createdAt: string;
}

interface SubscriptionSettings {
  autoExecute: boolean;
  maxPositionSize: number;
  maxDailyTrades: number;
  scalingFactor: number;
}

interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

</details>

---

## Next Steps

- [BTO Execution Flow](/flows/bto-execution) — How orders are executed
- [Copy Trading Flow](/flows/copy-trading) — How subscriptions work
- [SnapTrade API](/api/snaptrade) — Brokerage integration
