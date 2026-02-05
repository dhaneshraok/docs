---
sidebar_position: 2
title: Database Triggers
---

# Database Triggers

This document covers PostgreSQL triggers used in Alertsify for automated data updates and business logic enforcement.

## Understanding Database Triggers

A trigger is **code that runs automatically** when something happens in the database. Insert a row? A trigger can modify it. Update a row? A trigger can update related rows. Delete a row? A trigger can prevent it or clean up related data.

### Why Use Triggers?

**1. Guaranteed Consistency** — Application code can crash, skip steps, or have bugs. Triggers run inside the database transaction—they can't be bypassed.

**2. Reduced Application Complexity** — Instead of remembering to update `total_pnl` in 5 different places, one trigger handles it automatically.

**3. Performance** — Triggers run inside the database, avoiding network round-trips. When a trade is inserted, the parent trade is updated in the same transaction.

**4. Audit Trails** — Triggers can log who changed what and when, without developers remembering to add logging code.

### When NOT to Use Triggers

- **External API calls** — Don't call SnapTrade from a trigger. Use application code.
- **Complex business logic** — If the logic needs conditionals and loops, put it in a service.
- **User notifications** — Triggers run synchronously. Don't slow down inserts with email sending.

---

## Overview

Triggers automate database-level operations:

| Category | What It Does | Example |
|----------|--------------|----------|
| **Timestamp updates** | Auto-update `updated_at` | Every row modification updates the timestamp |
| **Audit logging** | Track changes | Who deleted this row? When? |
| **Aggregation** | Update parent records | When trade closes, update parent P&L |
| **Constraints** | Business rule enforcement | Prevent selling more than you own |

---

## Updated At Trigger

Automatically updates `updated_at` on row modification.

### Why This Matters

Knowing when a row was last modified is essential for:
- **Caching** — Invalidate cache entries older than `updated_at`
- **Syncing** — "Give me all rows updated since X"
- **Debugging** — "When did this data change?"
- **User Experience** — "Last updated 2 minutes ago"

**Without a trigger**, developers must remember to set `updated_at = NOW()` on every update. They will forget. With a trigger, it's automatic and impossible to miss.

<details>
<summary>📝 Trigger Definition</summary>

```sql
-- Function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_parent_trades_updated_at
  BEFORE UPDATE ON parent_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

</details>

---

## Parent Trade Aggregation

Updates parent trade totals when child trades change.

### The Problem This Solves

When a user opens a position, we create a `parent_trade` record. As they buy and sell, we insert `trades` records. But the parent needs to show:
- Total cost basis
- Total proceeds
- Net P&L
- Current status (open/closed)

**Without a trigger**, we'd have to:
1. Calculate these values on every read (slow)
2. Or update them in application code (error-prone, might forget)

**With a trigger**, the parent is always accurate. Insert a trade? Parent updates. Cancel a trade? Parent updates. Delete a trade? Parent updates.

### How It Works

1. **AFTER INSERT/UPDATE/DELETE** on `trades` table
2. Trigger function calculates aggregates from all related trades
3. Updates the `parent_trades` row with new totals
4. If position is fully closed (bought = sold), sets status to 'closed'

<details>
<summary>📝 Aggregation Trigger</summary>

```sql
-- Function to recalculate parent trade aggregates
CREATE OR REPLACE FUNCTION update_parent_trade_aggregates()
RETURNS TRIGGER AS $$
DECLARE
  parent_id TEXT;
  agg_record RECORD;
BEGIN
  -- Get the parent trade ID
  IF TG_OP = 'DELETE' THEN
    parent_id := OLD.parent_trade_id;
  ELSE
    parent_id := NEW.parent_trade_id;
  END IF;

  -- Calculate aggregates
  SELECT
    COALESCE(SUM(
      CASE WHEN action = 'buy' AND status = 'filled' 
      THEN filled_quantity * filled_price * 100 
      ELSE 0 END
    ), 0) as total_cost,
    COALESCE(SUM(
      CASE WHEN action = 'sell' AND status = 'filled' 
      THEN filled_quantity * filled_price * 100 
      ELSE 0 END
    ), 0) as total_proceeds,
    COALESCE(SUM(
      CASE WHEN action = 'buy' AND status = 'filled' 
      THEN filled_quantity ELSE 0 END
    ), 0) as bought_qty,
    COALESCE(SUM(
      CASE WHEN action = 'sell' AND status = 'filled' 
      THEN filled_quantity ELSE 0 END
    ), 0) as sold_qty
  INTO agg_record
  FROM trades
  WHERE parent_trade_id = parent_id;

  -- Update parent trade
  UPDATE parent_trades
  SET 
    total_cost_basis = agg_record.total_cost,
    total_proceeds = agg_record.total_proceeds,
    total_pnl = agg_record.total_proceeds - agg_record.total_cost,
    status = CASE 
      WHEN agg_record.bought_qty > 0 AND agg_record.bought_qty = agg_record.sold_qty 
      THEN 'closed'
      ELSE status
    END,
    closed_at = CASE 
      WHEN agg_record.bought_qty > 0 AND agg_record.bought_qty = agg_record.sold_qty 
      THEN NOW()
      ELSE closed_at
    END
  WHERE id = parent_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger on trades table
CREATE TRIGGER trigger_update_parent_aggregates
  AFTER INSERT OR UPDATE OR DELETE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_parent_trade_aggregates();
```

</details>

**What this does:**

| Event | Action |
|-------|--------|
| Trade inserted | Recalculate parent P&L |
| Trade updated | Recalculate parent P&L |
| Trade deleted | Recalculate parent P&L |
| Position fully closed | Set parent status to 'closed' |

---

## Oversell Prevention

Prevents selling more contracts than available.

### Why This Is Critical

Imagine a user owns 10 contracts. They try to sell 15. What should happen?

**Without protection:**
- The order goes to the brokerage and fails
- User sees a confusing error message
- Platform looks unreliable

**With trigger protection:**
- The database rejects the insert
- User sees a clear error: "Cannot sell 15 contracts. Only 10 available."
- Bad data never enters the system

### Edge Cases Handled

| Scenario | Trigger Action |
|----------|----------------|
| Sell 5 of 10 owned | ✅ Allowed |
| Sell 10 of 10 owned | ✅ Allowed |
| Sell 12 of 10 owned | ❌ Exception raised |
| Pending sell of 5, try sell 6 more of 10 | ❌ Exception (only 5 remaining) |

The trigger accounts for pending sells that haven't executed yet—preventing users from placing multiple sells that together exceed their holdings.

<details>
<summary>📝 Oversell Check Trigger</summary>

```sql
CREATE OR REPLACE FUNCTION check_oversell()
RETURNS TRIGGER AS $$
DECLARE
  available_qty INTEGER;
  bought_qty INTEGER;
  sold_qty INTEGER;
  pending_sells INTEGER;
BEGIN
  -- Only check for sell orders
  IF NEW.action != 'sell' THEN
    RETURN NEW;
  END IF;

  -- Calculate available quantity
  SELECT
    COALESCE(SUM(
      CASE WHEN action = 'buy' AND status = 'filled' 
      THEN filled_quantity ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN action = 'sell' AND status = 'filled' 
      THEN filled_quantity ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN action = 'sell' AND status = 'pending' AND id != NEW.id
      THEN quantity ELSE 0 END
    ), 0)
  INTO bought_qty, sold_qty, pending_sells
  FROM trades
  WHERE parent_trade_id = NEW.parent_trade_id;

  available_qty := bought_qty - sold_qty - pending_sells;

  IF NEW.quantity > available_qty THEN
    RAISE EXCEPTION 'Cannot sell % contracts. Only % available.', 
      NEW.quantity, available_qty;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_oversell
  BEFORE INSERT ON trades
  FOR EACH ROW
  EXECUTE FUNCTION check_oversell();
```

</details>

**Behavior:**

| Scenario | Result |
|----------|--------|
| Sell 5 of 10 owned | ✅ Allowed |
| Sell 10 of 10 owned | ✅ Allowed |
| Sell 12 of 10 owned | ❌ Exception raised |
| Pending sell of 5, try sell 6 more of 10 | ❌ Exception raised |

---

## Self-Subscription Prevention

Prevents users from subscribing to themselves.

<details>
<summary>📝 Self-Subscription Check</summary>

```sql
CREATE OR REPLACE FUNCTION check_self_subscription()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subscriber_id = NEW.trader_id THEN
    RAISE EXCEPTION 'Cannot subscribe to yourself';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_self_subscription
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION check_self_subscription();
```

</details>

---

## Account Selection

Ensures only one account is selected per user.

<details>
<summary>📝 Single Selection Trigger</summary>

```sql
CREATE OR REPLACE FUNCTION ensure_single_selected_account()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting an account as selected, deselect others
  IF NEW.is_selected = TRUE THEN
    UPDATE accounts
    SET is_selected = FALSE
    WHERE user_id = NEW.user_id 
      AND id != NEW.id 
      AND is_selected = TRUE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_single_selected_account
  BEFORE INSERT OR UPDATE OF is_selected ON accounts
  FOR EACH ROW
  WHEN (NEW.is_selected = TRUE)
  EXECUTE FUNCTION ensure_single_selected_account();
```

</details>

---

## Notification Counter

Maintains unread notification count for efficient querying.

<details>
<summary>📝 Notification Counter Trigger</summary>

```sql
-- Add counter column to users
ALTER TABLE users ADD COLUMN unread_notifications INTEGER DEFAULT 0;

-- Function to update counter
CREATE OR REPLACE FUNCTION update_notification_counter()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New notification, increment counter
    UPDATE users
    SET unread_notifications = unread_notifications + 1
    WHERE id = NEW.user_id;
    
  ELSIF TG_OP = 'UPDATE' AND OLD.read = FALSE AND NEW.read = TRUE THEN
    -- Marked as read, decrement counter
    UPDATE users
    SET unread_notifications = GREATEST(0, unread_notifications - 1)
    WHERE id = NEW.user_id;
    
  ELSIF TG_OP = 'DELETE' AND OLD.read = FALSE THEN
    -- Deleted unread notification, decrement counter
    UPDATE users
    SET unread_notifications = GREATEST(0, unread_notifications - 1)
    WHERE id = OLD.user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notification_counter
  AFTER INSERT OR UPDATE OR DELETE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_counter();
```

</details>

---

## Position Expiration

Marks positions as expired when expiration date passes.

<details>
<summary>📝 Expiration Check (Scheduled)</summary>

```sql
-- Function to expire positions (called by cron)
CREATE OR REPLACE FUNCTION expire_old_positions()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE parent_trades
  SET 
    status = 'expired',
    closed_at = NOW()
  WHERE status = 'open'
    AND expiration < CURRENT_DATE;
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Call via pg_cron or application cron
-- SELECT expire_old_positions();
```

</details>

---

## Audit Log Trigger

Tracks all changes to important tables.

<details>
<summary>📝 Audit Log Implementation</summary>

```sql
-- Audit log table
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changed_by TEXT,
  changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_time ON audit_log(changed_at DESC);

-- Generic audit function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, operation, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), current_setting('app.user_id', TRUE));
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), current_setting('app.user_id', TRUE));
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, operation, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), current_setting('app.user_id', TRUE));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply to critical tables
CREATE TRIGGER audit_trades
  AFTER INSERT OR UPDATE OR DELETE ON trades
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

</details>

---

## Trigger Management

### Listing Triggers

```sql
SELECT 
  tgname as trigger_name,
  relname as table_name,
  proname as function_name
FROM pg_trigger
JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE NOT tgisinternal
ORDER BY relname, tgname;
```

### Disabling Triggers (Maintenance)

```sql
-- Disable specific trigger
ALTER TABLE trades DISABLE TRIGGER trigger_update_parent_aggregates;

-- Perform maintenance...

-- Re-enable
ALTER TABLE trades ENABLE TRIGGER trigger_update_parent_aggregates;
```

### Disabling All Triggers

```sql
-- Disable all triggers on a table
ALTER TABLE trades DISABLE TRIGGER ALL;

-- Re-enable all
ALTER TABLE trades ENABLE TRIGGER ALL;
```

---

## Best Practices

### ✅ Do

| Practice | Reason |
|----------|--------|
| Keep triggers simple | Complex logic belongs in application |
| Use AFTER triggers for aggregation | Ensures row is committed |
| Use BEFORE triggers for validation | Can prevent invalid data |
| Test trigger performance | Triggers add overhead |

### ❌ Don't

| Anti-Pattern | Reason |
|--------------|--------|
| Trigger chains | Hard to debug, performance issues |
| Heavy computation in triggers | Blocks transactions |
| External API calls | Triggers should be fast |
| Ignore trigger errors | Can cause data inconsistency |

---

## Next Steps

- [Database Schema](/database/schema) — Table definitions
- [Database Views](/database/views) — Materialized views
- [Order Sync Flow](/flows/order-sync) — How triggers help sync
