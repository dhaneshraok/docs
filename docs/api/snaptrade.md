---
sidebar_position: 2
title: SnapTrade Integration
---

# SnapTrade API Integration

This document provides comprehensive documentation for the SnapTrade API integration, including all endpoints used, request/response formats, and error handling.

---

## Overview

**SnapTrade** is our brokerage aggregation layer that provides a unified API to interact with multiple brokers (TD Ameritrade, Robinhood, Interactive Brokers, Tradier, Alpaca, and more).

### Base Configuration

| Property | Value |
|----------|-------|
| **Base URL** | `https://api.snaptrade.com/api/v1` |
| **Authentication** | API Key + Signature |
| **Rate Limit** | 100 requests/minute |
| **SDK** | `snaptrade-typescript-sdk` |

---

## Authentication

SnapTrade uses a dual-key authentication system:

```typescript
import Snaptrade from 'snaptrade-typescript-sdk';

const client = new Snaptrade({
  consumerId: process.env.SNAPTRADE_CLIENT_ID!,
  consumerSecret: process.env.SNAPTRADE_CONSUMER_SECRET!,
});
```

Each API call also requires a **user-specific secret** obtained during user registration.

---

## User Management

### Register User

Creates a SnapTrade user linked to your platform user.

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /snapTrade/registerUser` |
| **Purpose** | Create SnapTrade user ID for new platform user |

**Request:**
```typescript
{
  userId: string;  // Your platform's user ID (must be unique)
}
```

**Response:**
```typescript
{
  userId: string;       // Same as input
  userSecret: string;   // Secret for this user (store securely)
}
```

<details>
<summary>📝 Service Implementation</summary>

```typescript
// lib/integrations/snaptrade.service.ts
export const snaptradeService = {
  async registerUser(userId: string): Promise<RegisterResult> {
    try {
      const response = await client.authentication.registerSnapTradeUser({
        userId,
      });

      return {
        success: true,
        userId: response.data.userId,
        userSecret: response.data.userSecret,
      };
    } catch (error) {
      return {
        success: false,
        error: this.parseError(error),
      };
    }
  },
};
```

</details>

---

### Delete User

Removes a SnapTrade user and all their connections.

| Property | Value |
|----------|-------|
| **Endpoint** | `DELETE /snapTrade/deleteUser` |
| **Purpose** | Remove user when they delete their account |

---

## Broker Connections

### Get Broker List

Retrieves available brokers for connection.

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /snapTrade/partners` |
| **Purpose** | Show available brokers in connection UI |

**Response:**
```typescript
{
  brokerages: Array<{
    id: string;                    // "ALPACA", "TRADIER", etc.
    name: string;                  // "Alpaca"
    slug: string;                  // "alpaca"
    logo: string;                  // Logo URL
    authType: "OAUTH" | "CREDENTIALS";
    supportsOptions: boolean;
    supportedOrderTypes: string[];
  }>;
}
```

---

### Get Connection URL

Generates OAuth URL for broker connection.

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /snapTrade/login` |
| **Purpose** | Get URL to redirect user for broker OAuth |

**Request:**
```typescript
{
  userId: string;
  userSecret: string;
  broker?: string;           // Optional: pre-select broker
  immediateRedirect?: boolean;
  customRedirect?: string;   // Return URL after connection
}
```

**Response:**
```typescript
{
  redirectUri: string;       // OAuth URL to redirect user to
  sessionId: string;         // Track this connection attempt
}
```

<details>
<summary>📝 Service Implementation</summary>

```typescript
async getConnectionUrl(params: ConnectionParams): Promise<ConnectionResult> {
  try {
    const response = await client.authentication.loginSnapTradeUser({
      userId: params.userId,
      userSecret: params.userSecret,
      broker: params.brokerId,
      immediateRedirect: true,
      customRedirect: params.redirectUri,
    });

    return {
      success: true,
      url: response.data.redirectUri,
      sessionId: response.data.sessionId,
    };
  } catch (error) {
    return { success: false, error: this.parseError(error) };
  }
}
```

</details>

---

### List Connected Accounts

Get all brokerage accounts for a user.

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /accounts` |
| **Purpose** | Display user's connected accounts |

**Response:**
```typescript
{
  accounts: Array<{
    id: string;                    // SnapTrade account ID
    brokerage_authorization: {
      id: string;
      brokerage: {
        id: string;
        name: string;
      };
    };
    number: string;                // Account number
    name: string;                  // Account name
    type: string;                  // "MARGIN", "CASH", "TFSA", etc.
    sync_status: {
      holdings: { last_successful_sync: string };
      transactions: { last_successful_sync: string };
    };
  }>;
}
```

---

### Delete Connection

Disconnect a brokerage account.

| Property | Value |
|----------|-------|
| **Endpoint** | `DELETE /authorizations/{authorizationId}` |
| **Purpose** | Remove broker connection |

---

## Account Data

### Get Account Holdings

Retrieve current positions for an account.

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /accounts/{accountId}/holdings` |
| **Purpose** | Show user's current positions |
| **Cache TTL** | 60 seconds |

**Response:**
```typescript
{
  holdings: Array<{
    symbol: {
      id: string;
      symbol: string;              // "AAPL" or option symbol
      description: string;
      type: "EQUITY" | "OPTION";
      currency: { code: string };
    };
    units: number;                 // Position size
    average_purchase_price: number;
    open_pnl: number;              // Unrealized P&L
  }>;
  
  balances: {
    cash: number;
    buying_power: number;
    total_equity: number;
  };
}
```

<details>
<summary>📝 Service Implementation</summary>

```typescript
async getHoldings(params: HoldingsParams): Promise<HoldingsResult> {
  const cacheKey = `snaptrade:holdings:${params.accountId}`;
  
  // Check cache first
  const cached = await cache.get<Holdings>(cacheKey);
  if (cached) return { success: true, holdings: cached };

  try {
    const response = await client.accountInformation.getUserHoldings({
      userId: params.userId,
      userSecret: params.userSecret,
      accountId: params.accountId,
    });

    const holdings = this.transformHoldings(response.data);
    
    // Cache for 60 seconds
    await cache.set(cacheKey, holdings, 60);

    return { success: true, holdings };
  } catch (error) {
    return { success: false, error: this.parseError(error) };
  }
}
```

</details>

---

### Get Account Balances

Get cash and buying power.

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /accounts/{accountId}/balances` |
| **Purpose** | Check available funds before trading |

**Response:**
```typescript
{
  cash: number;
  buying_power: number;
  maintenance_excess: number;
}
```

---

## Trading

### Place Order (Force)

Places an order without preview step.

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /trade/{userId}/{userSecret}/placeForceOrder` |
| **Purpose** | Execute BTO/STC orders |

**Request:**
```typescript
{
  accountId: string;
  action: "BUY" | "SELL";
  order_type: "Market" | "Limit" | "Stop" | "StopLimit";
  time_in_force: "Day" | "GTC" | "FOK" | "IOC";
  universal_symbol_id: string;   // Option symbol
  units: number;                  // Quantity
  price?: number;                 // For limit orders
  stop?: number;                  // For stop orders
}
```

**Response:**
```typescript
{
  brokerage_order_id: string;    // Broker's order ID
  status: "PENDING" | "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";
  symbol: {
    symbol: string;
    description: string;
  };
  action: "BUY" | "SELL";
  total_quantity: number;
  filled_quantity: number;
  average_price: number | null;
  execution_price: number | null;
}
```

<details>
<summary>📝 Full Implementation with Error Handling</summary>

```typescript
async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
  try {
    const response = await client.trading.placeForceOrder({
      userId: params.userId,
      userSecret: params.userSecret,
      accountId: params.accountId,
      action: params.action,
      order_type: params.orderType,
      time_in_force: params.timeInForce ?? 'Day',
      universal_symbol_id: params.symbol,
      units: params.quantity,
      price: params.limitPrice,
    });

    return {
      success: true,
      orderId: response.data.brokerage_order_id,
      status: response.data.status,
      filledQuantity: response.data.filled_quantity,
      averagePrice: response.data.average_price,
    };
  } catch (error) {
    const parsed = this.parseError(error);
    
    // Map common errors to user-friendly messages
    const userMessage = this.getUserFriendlyError(parsed);
    
    return {
      success: false,
      error: parsed,
      userMessage,
    };
  }
}

getUserFriendlyError(error: string): string {
  const errorMap: Record<string, string> = {
    'insufficient_funds': 'Insufficient buying power for this order',
    'market_closed': 'Market is currently closed',
    'invalid_symbol': 'Invalid option symbol',
    'order_rejected': 'Order was rejected by the broker',
    'rate_limited': 'Too many requests. Please wait and try again.',
  };

  for (const [key, message] of Object.entries(errorMap)) {
    if (error.toLowerCase().includes(key)) {
      return message;
    }
  }

  return 'Unable to place order. Please try again.';
}
```

</details>

---

### Cancel Order

Cancels a pending order.

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /accounts/{accountId}/orders/cancel` |
| **Purpose** | Cancel unfilled orders |

**Request:**
```typescript
{
  brokerage_order_id: string;
}
```

---

### Get Order Status

Check status of a specific order.

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /accounts/{accountId}/orders/{orderId}` |
| **Purpose** | Check if order filled |

**Response:**
```typescript
{
  brokerage_order_id: string;
  status: "PENDING" | "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";
  filled_quantity: number;
  average_price: number | null;
  updated_at: string;
}
```

---

## Options Data

### Search Symbol

Search for stock or option symbols.

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /symbols` |
| **Purpose** | Symbol lookup in order form |

**Query Parameters:**
```
substring: string   // Search term (e.g., "AAPL")
```

**Response:**
```typescript
{
  symbols: Array<{
    id: string;
    symbol: string;
    description: string;
    type: "EQUITY" | "OPTION";
    exchange: string;
  }>;
}
```

---

### Get Options Chain

Retrieve available options for an underlying.

| Property | Value |
|----------|-------|
| **Endpoint** | `GET /accounts/{accountId}/optionChain` |
| **Purpose** | Display options chain in trading UI |

**Query Parameters:**
```
symbol: string      // Underlying symbol (e.g., "AAPL")
```

**Response:**
```typescript
{
  optionChain: Array<{
    expirationDate: string;       // "2025-02-21"
    options: Array<{
      symbol: string;              // OCC symbol
      optionType: "CALL" | "PUT";
      strikePrice: number;
      bid: number;
      ask: number;
      last: number;
      volume: number;
      openInterest: number;
      delta: number;
      gamma: number;
      theta: number;
      vega: number;
    }>;
  }>;
}
```

---

## Option Symbol Format

SnapTrade uses the **OCC (Options Clearing Corporation)** format for option symbols:

```
AAPL  250221C00200000
│     │     ││└─ Strike price × 1000 (200.00 = 00200000)
│     │     │└── Option type (C = Call, P = Put)
│     │     └─── Expiration (YYMMDD)
│     └───────── Padding (6 chars total for underlying)
└─────────────── Underlying symbol
```

<details>
<summary>📝 Symbol Builder Utility</summary>

```typescript
// lib/utils/options.ts
export function buildOptionSymbol(params: {
  underlying: string;
  expiration: string;      // "2025-02-21"
  optionType: 'call' | 'put';
  strike: number;
}): string {
  // Pad underlying to 6 characters
  const paddedUnderlying = params.underlying.toUpperCase().padEnd(6, ' ');
  
  // Format expiration as YYMMDD
  const [year, month, day] = params.expiration.split('-');
  const expiry = `${year.slice(2)}${month}${day}`;
  
  // Option type
  const type = params.optionType === 'call' ? 'C' : 'P';
  
  // Strike price × 1000, padded to 8 digits
  const strike = Math.round(params.strike * 1000)
    .toString()
    .padStart(8, '0');
  
  return `${paddedUnderlying}${expiry}${type}${strike}`;
}

// Example
buildOptionSymbol({
  underlying: 'AAPL',
  expiration: '2025-02-21',
  optionType: 'call',
  strike: 200,
});
// Returns: "AAPL  250221C00200000"
```

</details>

---

## Error Handling

### Common Error Codes

| Error | Meaning | Action |
|-------|---------|--------|
| `INVALID_CREDENTIALS` | Bad API key | Check environment variables |
| `USER_NOT_FOUND` | Unknown user ID | Register user first |
| `ACCOUNT_NOT_FOUND` | Invalid account ID | Refresh account list |
| `INSUFFICIENT_FUNDS` | Not enough buying power | Show balance to user |
| `MARKET_CLOSED` | Market not open | Show market hours |
| `RATE_LIMITED` | Too many requests | Implement backoff |
| `BROKER_ERROR` | Broker-side issue | Retry or contact support |

### Error Response Format

```typescript
{
  detail: string;           // Error message
  error_code?: string;      // Machine-readable code
  status_code: number;      // HTTP status
}
```

<details>
<summary>📝 Error Parser</summary>

```typescript
parseError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    
    if (typeof data === 'string') return data;
    if (data?.detail) return data.detail;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
    
    return `HTTP ${error.response?.status}: ${error.message}`;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'Unknown error occurred';
}
```

</details>

---

## Rate Limiting

| Limit | Value |
|-------|-------|
| **Requests per minute** | 100 |
| **Burst limit** | 10 requests/second |
| **Backoff strategy** | Exponential with jitter |

<details>
<summary>📝 Rate Limit Handler</summary>

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitError(error) || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await sleep(delay);
    }
  }
  throw new Error('Max retries exceeded');
}
```

</details>

---

## Webhook Events

SnapTrade sends webhooks for order updates:

| Event | Description |
|-------|-------------|
| `order_created` | New order submitted |
| `order_filled` | Order fully filled |
| `order_partially_filled` | Order partially filled |
| `order_cancelled` | Order cancelled |
| `order_rejected` | Order rejected by broker |

Webhook endpoint: `POST /api/webhooks/snaptrade`

---

## Next Steps

- [GetStream API](/api/getstream) — Activity feeds integration
- [Discord Webhooks](/api/discord) — Notification webhooks
- [BTO Execution Flow](/flows/bto-execution) — How orders are placed
