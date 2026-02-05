---
sidebar_position: 3
title: Database Views
---

# Database Views

This document covers PostgreSQL views and materialized views used in Alertsify for analytics, reporting, and performance optimization.

## Understanding Database Views

A view is like a **saved query**. Instead of writing the same complex SQL every time, you define it once and query it like a table. Think of it as a "virtual table" that's computed on the fly.

### Regular Views vs Materialized Views

| Feature | Regular View | Materialized View |
|---------|--------------|-------------------|
| **Data Storage** | Computed on each query | Stored on disk |
| **Freshness** | Always current | Snapshot (must refresh) |
| **Performance** | Can be slow | Very fast |
| **Use Case** | Simple joins, filters | Complex aggregations |

**When to Use Each:**

- **Regular View** — When data must be current and the query is fast (< 100ms)
- **Materialized View** — When data can be slightly stale and the query is slow (> 1 second)

---

## Overview

Views in Alertsify serve several purposes:

- **Analytics**: Pre-computed stats for dashboards (win rate, P&L, trade counts)
- **Performance**: Materialized views cache expensive calculations
- **Convenience**: Simplified access to complex multi-table joins
- **Security**: Expose limited columns/rows to specific roles

### Our View Strategy

We use **materialized views** for the leaderboard and user stats because:
1. These queries aggregate millions of rows
2. Users don't need real-time accuracy (a 1-hour delay is acceptable)
3. The calculations are identical for all users (cache once, serve many)

---

## User Statistics View

Aggregated trading statistics per user.

<details>
<summary>📝 View Definition</summary>

```sql
CREATE MATERIALIZED VIEW user_stats AS
SELECT
  u.id as user_id,
  u.username,
  u.name,
  u.avatar_url,
  u.is_trader,
  
  -- Trade counts
  COUNT(DISTINCT pt.id) FILTER (WHERE pt.status = 'closed') as total_positions,
  COUNT(t.id) FILTER (WHERE t.action = 'buy' AND t.status = 'filled') as total_bto,
  COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled') as total_stc,
  
  -- P&L metrics
  COALESCE(SUM(t.pnl) FILTER (WHERE t.action = 'sell' AND t.status = 'filled'), 0) as total_pnl,
  
  -- Win rate
  COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled' AND t.pnl > 0) as winning_trades,
  COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled' AND t.pnl < 0) as losing_trades,
  
  CASE 
    WHEN COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled') > 0
    THEN ROUND(
      COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled' AND t.pnl > 0)::NUMERIC /
      COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled')::NUMERIC * 100,
      2
    )
    ELSE 0
  END as win_rate,
  
  -- Follower count
  (SELECT COUNT(*) FROM subscriptions s 
   WHERE s.trader_id = u.id AND s.status = 'active') as follower_count,
  
  -- Following count
  (SELECT COUNT(*) FROM subscriptions s 
   WHERE s.subscriber_id = u.id AND s.status = 'active') as following_count,
  
  -- Activity dates
  MAX(t.filled_at) as last_trade_at,
  u.created_at as joined_at

FROM users u
LEFT JOIN parent_trades pt ON pt.user_id = u.id
LEFT JOIN trades t ON t.parent_trade_id = pt.id
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.username, u.name, u.avatar_url, u.is_trader, u.created_at;

-- Indexes for common queries
CREATE UNIQUE INDEX idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX idx_user_stats_total_pnl ON user_stats(total_pnl DESC);
CREATE INDEX idx_user_stats_win_rate ON user_stats(win_rate DESC);
CREATE INDEX idx_user_stats_followers ON user_stats(follower_count DESC);
```

</details>

### Refreshing the View

```sql
-- Refresh (blocks reads during refresh)
REFRESH MATERIALIZED VIEW user_stats;

-- Refresh concurrently (requires unique index)
REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats;
```

**Scheduled Refresh:**

```sql
-- Using pg_cron (runs every hour)
SELECT cron.schedule('refresh_user_stats', '0 * * * *', 
  'REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats');
```

---

## Leaderboard View

Top traders by various metrics.

<details>
<summary>📝 View Definition</summary>

```sql
CREATE MATERIALIZED VIEW leaderboard AS
WITH trader_stats AS (
  SELECT
    u.id as user_id,
    u.username,
    u.name,
    u.avatar_url,
    
    -- Overall stats
    COALESCE(SUM(t.pnl), 0) as total_pnl,
    COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled') as total_trades,
    
    -- Win rate
    CASE 
      WHEN COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled') > 0
      THEN ROUND(
        COUNT(t.id) FILTER (WHERE t.pnl > 0)::NUMERIC /
        COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled')::NUMERIC * 100,
        2
      )
      ELSE 0
    END as win_rate,
    
    -- Average P&L per trade
    CASE 
      WHEN COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled') > 0
      THEN ROUND(
        SUM(t.pnl)::NUMERIC / 
        COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled')::NUMERIC,
        2
      )
      ELSE 0
    END as avg_pnl,
    
    -- Time periods
    COALESCE(SUM(t.pnl) FILTER (WHERE t.filled_at >= NOW() - INTERVAL '1 day'), 0) as pnl_24h,
    COALESCE(SUM(t.pnl) FILTER (WHERE t.filled_at >= NOW() - INTERVAL '7 days'), 0) as pnl_7d,
    COALESCE(SUM(t.pnl) FILTER (WHERE t.filled_at >= NOW() - INTERVAL '30 days'), 0) as pnl_30d,
    
    -- Followers
    (SELECT COUNT(*) FROM subscriptions s 
     WHERE s.trader_id = u.id AND s.status = 'active') as followers

  FROM users u
  JOIN parent_trades pt ON pt.user_id = u.id
  JOIN trades t ON t.parent_trade_id = pt.id
  WHERE u.is_trader = TRUE
    AND u.deleted_at IS NULL
    AND t.action = 'sell'
    AND t.status = 'filled'
  GROUP BY u.id, u.username, u.name, u.avatar_url
)
SELECT 
  *,
  RANK() OVER (ORDER BY total_pnl DESC) as rank_pnl,
  RANK() OVER (ORDER BY win_rate DESC) as rank_win_rate,
  RANK() OVER (ORDER BY pnl_7d DESC) as rank_weekly,
  RANK() OVER (ORDER BY followers DESC) as rank_followers
FROM trader_stats;

-- Indexes
CREATE UNIQUE INDEX idx_leaderboard_user ON leaderboard(user_id);
CREATE INDEX idx_leaderboard_pnl ON leaderboard(rank_pnl);
CREATE INDEX idx_leaderboard_weekly ON leaderboard(rank_weekly);
```

</details>

---

## Position Summary View

Current open positions with calculated values.

<details>
<summary>📝 View Definition</summary>

```sql
CREATE VIEW position_summary AS
SELECT
  pt.id as position_id,
  pt.user_id,
  pt.underlying,
  pt.option_type,
  pt.strike,
  pt.expiration,
  pt.symbol,
  pt.status,
  pt.opened_at,
  
  -- Quantity calculations
  COALESCE(SUM(t.filled_quantity) FILTER (WHERE t.action = 'buy'), 0) as total_bought,
  COALESCE(SUM(t.filled_quantity) FILTER (WHERE t.action = 'sell'), 0) as total_sold,
  COALESCE(SUM(t.filled_quantity) FILTER (WHERE t.action = 'buy'), 0) -
  COALESCE(SUM(t.filled_quantity) FILTER (WHERE t.action = 'sell'), 0) as current_quantity,
  
  -- Cost basis
  CASE 
    WHEN SUM(t.filled_quantity) FILTER (WHERE t.action = 'buy') > 0
    THEN ROUND(
      SUM(t.filled_quantity * t.filled_price) FILTER (WHERE t.action = 'buy') /
      SUM(t.filled_quantity) FILTER (WHERE t.action = 'buy'),
      4
    )
    ELSE 0
  END as average_entry,
  
  -- Totals
  COALESCE(SUM(t.filled_quantity * t.filled_price * 100) FILTER (WHERE t.action = 'buy'), 0) as total_cost,
  COALESCE(SUM(t.filled_quantity * t.filled_price * 100) FILTER (WHERE t.action = 'sell'), 0) as total_proceeds,
  
  -- Realized P&L
  COALESCE(SUM(t.pnl) FILTER (WHERE t.action = 'sell'), 0) as realized_pnl,
  
  -- Days to expiration
  pt.expiration - CURRENT_DATE as days_to_expiration

FROM parent_trades pt
LEFT JOIN trades t ON t.parent_trade_id = pt.id AND t.status = 'filled'
WHERE pt.status = 'open'
GROUP BY pt.id;
```

</details>

---

## Daily P&L View

P&L aggregated by day for charting.

<details>
<summary>📝 View Definition</summary>

```sql
CREATE MATERIALIZED VIEW daily_pnl AS
SELECT
  user_id,
  DATE(filled_at) as trade_date,
  COUNT(*) as trade_count,
  SUM(pnl) as daily_pnl,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
  SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses,
  SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) as gross_profit,
  SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END) as gross_loss,
  
  -- Running total
  SUM(SUM(pnl)) OVER (
    PARTITION BY user_id 
    ORDER BY DATE(filled_at)
    ROWS UNBOUNDED PRECEDING
  ) as cumulative_pnl

FROM trades
WHERE action = 'sell' 
  AND status = 'filled'
  AND pnl IS NOT NULL
GROUP BY user_id, DATE(filled_at);

-- Indexes
CREATE UNIQUE INDEX idx_daily_pnl_user_date ON daily_pnl(user_id, trade_date);
CREATE INDEX idx_daily_pnl_date ON daily_pnl(trade_date DESC);
```

</details>

### Query Examples

```sql
-- Last 30 days for a user
SELECT * FROM daily_pnl
WHERE user_id = 'user_123'
  AND trade_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY trade_date;

-- Best trading days
SELECT * FROM daily_pnl
WHERE user_id = 'user_123'
ORDER BY daily_pnl DESC
LIMIT 10;
```

---

## Subscription Analytics View

Copy trading subscription statistics.

<details>
<summary>📝 View Definition</summary>

```sql
CREATE MATERIALIZED VIEW subscription_stats AS
SELECT
  s.id as subscription_id,
  s.subscriber_id,
  s.trader_id,
  s.created_at as subscribed_at,
  s.status,
  
  -- Trader info
  trader.username as trader_username,
  trader.name as trader_name,
  trader.avatar_url as trader_avatar,
  
  -- Subscriber info
  sub.username as subscriber_username,
  
  -- Copy trade stats
  COUNT(t.id) FILTER (WHERE t.source = 'copy' AND t.source_trader_id = s.trader_id) as copied_trades,
  
  COALESCE(SUM(t.pnl) FILTER (
    WHERE t.source = 'copy' 
    AND t.source_trader_id = s.trader_id 
    AND t.action = 'sell'
  ), 0) as copy_pnl,
  
  -- Settings
  s.settings->>'autoExecute' as auto_execute,
  (s.settings->>'scalingFactor')::NUMERIC as scaling_factor

FROM subscriptions s
JOIN users trader ON trader.id = s.trader_id
JOIN users sub ON sub.id = s.subscriber_id
LEFT JOIN trades t ON t.user_id = s.subscriber_id 
  AND t.source = 'copy'
  AND t.source_trader_id = s.trader_id
GROUP BY s.id, s.subscriber_id, s.trader_id, s.created_at, s.status, s.settings,
  trader.username, trader.name, trader.avatar_url, sub.username;

CREATE UNIQUE INDEX idx_sub_stats_id ON subscription_stats(subscription_id);
CREATE INDEX idx_sub_stats_subscriber ON subscription_stats(subscriber_id);
CREATE INDEX idx_sub_stats_trader ON subscription_stats(trader_id);
```

</details>

---

## Underlying Performance View

Performance breakdown by underlying symbol.

<details>
<summary>📝 View Definition</summary>

```sql
CREATE VIEW underlying_performance AS
SELECT
  pt.user_id,
  pt.underlying,
  
  -- Trade counts
  COUNT(DISTINCT pt.id) as positions,
  COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled') as closed_trades,
  
  -- P&L
  COALESCE(SUM(t.pnl), 0) as total_pnl,
  
  -- Win rate
  CASE 
    WHEN COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled') > 0
    THEN ROUND(
      COUNT(t.id) FILTER (WHERE t.pnl > 0)::NUMERIC /
      COUNT(t.id) FILTER (WHERE t.action = 'sell' AND t.status = 'filled')::NUMERIC * 100,
      2
    )
    ELSE 0
  END as win_rate,
  
  -- Average hold time
  AVG(DATE_PART('day', t.filled_at - pt.opened_at)) 
    FILTER (WHERE t.action = 'sell') as avg_hold_days

FROM parent_trades pt
JOIN trades t ON t.parent_trade_id = pt.id
WHERE t.status = 'filled'
GROUP BY pt.user_id, pt.underlying;
```

</details>

---

## View Refresh Strategy

### Materialized View Refresh Schedule

| View | Refresh Frequency | Method |
|------|-------------------|--------|
| `user_stats` | Every hour | Concurrent |
| `leaderboard` | Every hour | Concurrent |
| `daily_pnl` | Every hour | Concurrent |
| `subscription_stats` | Every 15 min | Concurrent |

### Refresh via Application

```typescript
// lib/services/stats.service.ts
export async function refreshMaterializedViews(): Promise<void> {
  await db.execute(sql`
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard;
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_pnl;
    REFRESH MATERIALIZED VIEW CONCURRENTLY subscription_stats;
  `);
}
```

---

## Using Views with Drizzle

<details>
<summary>📝 Drizzle Integration</summary>

```typescript
// lib/db/schema/views.ts
import { pgView, text, integer, numeric, timestamp } from 'drizzle-orm/pg-core';

// Define the view schema
export const userStats = pgView('user_stats', {
  userId: text('user_id').primaryKey(),
  username: text('username'),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  isTrader: boolean('is_trader'),
  totalPositions: integer('total_positions'),
  totalBto: integer('total_bto'),
  totalStc: integer('total_stc'),
  totalPnl: numeric('total_pnl'),
  winningTrades: integer('winning_trades'),
  losingTrades: integer('losing_trades'),
  winRate: numeric('win_rate'),
  followerCount: integer('follower_count'),
  followingCount: integer('following_count'),
  lastTradeAt: timestamp('last_trade_at'),
  joinedAt: timestamp('joined_at'),
});

// Query the view
const stats = await db.select()
  .from(userStats)
  .where(eq(userStats.userId, 'user_123'));
```

</details>

---

## Best Practices

### ✅ Do

| Practice | Reason |
|----------|--------|
| Use CONCURRENTLY for refreshes | Allows reads during refresh |
| Create unique indexes | Required for concurrent refresh |
| Schedule refreshes appropriately | Balance freshness vs. cost |
| Monitor refresh duration | Alert if taking too long |

### ❌ Don't

| Anti-Pattern | Reason |
|--------------|--------|
| Refresh on every request | Expensive and unnecessary |
| Skip indexes on mat views | Makes queries slow |
| Use views for OLTP queries | Regular tables are faster |
| Forget to refresh after migrations | Data becomes stale |

---

## Next Steps

- [Database Schema](/database/schema) — Table definitions
- [Database Triggers](/database/triggers) — Automated updates
- [Architecture Overview](/architecture/overview) — System design
