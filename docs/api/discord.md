---
sidebar_position: 4
title: Discord Webhooks
---

# Discord Webhook Integration

This document covers the Discord webhook integration for sending trade alerts and notifications to Discord channels.

---

## Overview

Alertsify uses Discord webhooks to send trade alerts, enabling traders and subscribers to receive notifications directly in Discord.

### Features

- **BTO Alerts**: New position opened
- **STC Alerts**: Position closed with P&L
- **Rich Embeds**: Formatted with colors and fields
- **Deduplication**: Prevents duplicate alerts
- **Rate Limiting**: Respects Discord limits

---

## Configuration

### Environment Variables

```bash
# Primary alerts channel
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy

# Separate channels by type (optional)
DISCORD_BTO_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
DISCORD_STC_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy

# Admin/error channel
DISCORD_ADMIN_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
```

### Creating Webhooks

1. Open Discord channel settings
2. Go to **Integrations** → **Webhooks**
3. Click **New Webhook**
4. Copy the webhook URL
5. Add to environment variables

---

## Alert Types

### BTO (Buy to Open) Alert

Sent when a trader opens a new position.

**Embed Structure:**

```typescript
{
  embeds: [{
    title: "🟢 BTO Alert",
    color: 0x00ff00,  // Green
    fields: [
      { name: "Trader", value: "@TraderName", inline: true },
      { name: "Ticker", value: "AAPL", inline: true },
      { name: "Type", value: "📈 CALL", inline: true },
      { name: "Strike", value: "$200", inline: true },
      { name: "Expiry", value: "Feb 21", inline: true },
      { name: "Contracts", value: "5", inline: true },
      { name: "Entry", value: "$3.50", inline: true },
      { name: "Cost Basis", value: "$1,750", inline: true },
    ],
    timestamp: "2025-02-04T10:30:00Z",
    footer: { text: "Alertsify • Trade ID: abc123" }
  }]
}
```

**Visual Example:**

```
┌─────────────────────────────────────────┐
│ 🟢 BTO Alert                            │
├─────────────────────────────────────────┤
│ Trader: @TraderName                     │
│ Ticker: AAPL    Type: 📈 CALL          │
│ Strike: $200    Expiry: Feb 21          │
│ Contracts: 5    Entry: $3.50            │
│ Cost Basis: $1,750                      │
├─────────────────────────────────────────┤
│ Alertsify • Trade ID: abc123            │
└─────────────────────────────────────────┘
```

---

### STC (Sell to Close) Alert

Sent when a trader closes a position, includes P&L.

**Embed Structure:**

```typescript
{
  embeds: [{
    title: "🔴 STC Alert",
    color: pnl >= 0 ? 0x00ff00 : 0xff0000,  // Green or Red
    fields: [
      { name: "Trader", value: "@TraderName", inline: true },
      { name: "Ticker", value: "AAPL", inline: true },
      { name: "Type", value: "📈 CALL", inline: true },
      { name: "Strike", value: "$200", inline: true },
      { name: "Expiry", value: "Feb 21", inline: true },
      { name: "Contracts", value: "5", inline: true },
      { name: "Entry", value: "$3.50", inline: true },
      { name: "Exit", value: "$5.25", inline: true },
      { name: "P&L", value: "+$875 (+50%)", inline: true },
    ],
    timestamp: "2025-02-04T14:30:00Z",
    footer: { text: "Alertsify • Trade ID: def456" }
  }]
}
```

---

## Implementation

### Discord Service

<details>
<summary>📝 Full Service Implementation</summary>

```typescript
// lib/services/discord-webhook-alerts.service.ts

interface BTOAlertParams {
  tradeId: string;
  traderId: string;
  traderName: string;
  underlying: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  quantity: number;
  price: number;
}

interface STCAlertParams extends BTOAlertParams {
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
}

export const discordAlertService = {
  /**
   * Send BTO alert to Discord
   */
  async sendBTOAlert(params: BTOAlertParams): Promise<void> {
    const webhookUrl = process.env.DISCORD_BTO_WEBHOOK_URL 
      ?? process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
      console.warn('[Discord] No webhook URL configured');
      return;
    }

    const costBasis = params.quantity * params.price * 100;

    const embed = {
      title: '🟢 BTO Alert',
      color: 0x00ff00,
      fields: [
        { name: 'Trader', value: params.traderName, inline: true },
        { name: 'Ticker', value: params.underlying, inline: true },
        { 
          name: 'Type', 
          value: params.optionType === 'call' ? '📈 CALL' : '📉 PUT', 
          inline: true 
        },
        { name: 'Strike', value: `$${params.strike}`, inline: true },
        { name: 'Expiry', value: this.formatExpiry(params.expiration), inline: true },
        { name: 'Contracts', value: params.quantity.toString(), inline: true },
        { name: 'Entry', value: `$${params.price.toFixed(2)}`, inline: true },
        { name: 'Cost Basis', value: `$${costBasis.toLocaleString()}`, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `Alertsify • Trade ID: ${params.tradeId.slice(0, 8)}` },
    };

    await this.sendWebhook(webhookUrl, { embeds: [embed] });
  },

  /**
   * Send STC alert to Discord
   */
  async sendSTCAlert(params: STCAlertParams): Promise<void> {
    const webhookUrl = process.env.DISCORD_STC_WEBHOOK_URL 
      ?? process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) return;

    const isProfit = params.pnl >= 0;
    const pnlFormatted = isProfit 
      ? `+$${params.pnl.toFixed(2)} (+${params.pnlPercent.toFixed(1)}%)`
      : `-$${Math.abs(params.pnl).toFixed(2)} (${params.pnlPercent.toFixed(1)}%)`;

    const embed = {
      title: '🔴 STC Alert',
      color: isProfit ? 0x00ff00 : 0xff0000,
      fields: [
        { name: 'Trader', value: params.traderName, inline: true },
        { name: 'Ticker', value: params.underlying, inline: true },
        { 
          name: 'Type', 
          value: params.optionType === 'call' ? '📈 CALL' : '📉 PUT', 
          inline: true 
        },
        { name: 'Strike', value: `$${params.strike}`, inline: true },
        { name: 'Expiry', value: this.formatExpiry(params.expiration), inline: true },
        { name: 'Contracts', value: params.quantity.toString(), inline: true },
        { name: 'Entry', value: `$${params.entryPrice.toFixed(2)}`, inline: true },
        { name: 'Exit', value: `$${params.exitPrice.toFixed(2)}`, inline: true },
        { name: 'P&L', value: pnlFormatted, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `Alertsify • Trade ID: ${params.tradeId.slice(0, 8)}` },
    };

    await this.sendWebhook(webhookUrl, { embeds: [embed] });
  },

  /**
   * Send raw webhook request
   */
  async sendWebhook(
    url: string, 
    payload: DiscordWebhookPayload
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[Discord] Webhook failed:', response.status, text);
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          console.warn(`[Discord] Rate limited. Retry after ${retryAfter}s`);
        }
      }
    } catch (error) {
      console.error('[Discord] Webhook error:', error);
    }
  },

  formatExpiry(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  },
};
```

</details>

---

## Deduplication

To prevent duplicate alerts (e.g., during retries), we use atomic claims:

<details>
<summary>📝 Deduplication Pattern</summary>

```typescript
// lib/services/discord-webhook-alerts.service.ts
import { kv } from '@vercel/kv';

const ALERT_TTL = 3600; // 1 hour

async function claimAlertSlot(tradeId: string, type: 'bto' | 'stc'): Promise<boolean> {
  const key = `discord:alert:${type}:${tradeId}`;
  
  // SETNX returns 1 if key was set (we claimed it), 0 if it existed
  const claimed = await kv.setnx(key, Date.now());
  
  if (claimed) {
    // Set expiry
    await kv.expire(key, ALERT_TTL);
    return true;
  }
  
  return false;
}

// Usage
async function sendBTOAlertSafe(params: BTOAlertParams): Promise<void> {
  const claimed = await claimAlertSlot(params.tradeId, 'bto');
  
  if (!claimed) {
    console.log(`[Discord] Alert already sent for trade ${params.tradeId}`);
    return;
  }
  
  await discordAlertService.sendBTOAlert(params);
}
```

</details>

---

## Rate Limiting

Discord webhooks have rate limits:

| Limit | Value |
|-------|-------|
| **Requests per second** | 5 |
| **Requests per minute** | 30 |
| **Embed limit** | 10 per message |

### Handling Rate Limits

```typescript
async function sendWithRateLimit(
  url: string, 
  payload: DiscordWebhookPayload
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5');
    
    // Queue for retry
    await sleep(retryAfter * 1000);
    return sendWithRateLimit(url, payload);
  }

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }
}
```

---

## Webhook Payload Types

### Basic Message

```typescript
{
  content: "Hello, World!"
}
```

### Message with Embed

```typescript
{
  content: "Optional text above embed",
  embeds: [{
    title: "Embed Title",
    description: "Embed description",
    color: 0x00ff00,
    fields: [
      { name: "Field 1", value: "Value 1", inline: true },
      { name: "Field 2", value: "Value 2", inline: true },
    ],
    thumbnail: { url: "https://example.com/image.png" },
    footer: { text: "Footer text" },
    timestamp: "2025-02-04T10:30:00Z"
  }]
}
```

### Colors

| Color | Hex | Usage |
|-------|-----|-------|
| **Green** | `0x00ff00` | Profit, success |
| **Red** | `0xff0000` | Loss, error |
| **Blue** | `0x0099ff` | Info |
| **Yellow** | `0xffcc00` | Warning |
| **Gray** | `0x808080` | Neutral |

---

## Error Notifications

For admin/error notifications:

<details>
<summary>📝 Error Alert Service</summary>

```typescript
async function sendErrorAlert(params: {
  error: Error;
  context: string;
  userId?: string;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_ADMIN_WEBHOOK_URL;
  if (!webhookUrl) return;

  const embed = {
    title: '🚨 Error Alert',
    color: 0xff0000,
    description: `\`\`\`${params.error.message}\`\`\``,
    fields: [
      { name: 'Context', value: params.context, inline: false },
      { name: 'User ID', value: params.userId ?? 'N/A', inline: true },
      { name: 'Environment', value: process.env.NODE_ENV ?? 'unknown', inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
}
```

</details>

---

## Best Practices

### ✅ Do

| Practice | Reason |
|----------|--------|
| Use embeds for structured data | Better readability |
| Include trade IDs | Easier debugging |
| Handle rate limits gracefully | Prevent alert loss |
| Deduplicate alerts | Prevent spam |

### ❌ Don't

| Anti-Pattern | Reason |
|--------------|--------|
| Send too many alerts | Discord rate limits |
| Include sensitive data | Security risk |
| Ignore failures | Alerts may be lost |
| Use @everyone frequently | Annoys users |

---

## Next Steps

- [Notifications Flow](/flows/notifications) — Multi-channel notifications
- [Copy Trading Flow](/flows/copy-trading) — How alerts are triggered
