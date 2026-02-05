# Component Architecture

The Dashboard Module is built with a hierarchical component structure that separates concerns between server-side data fetching, client-side interactivity, and reusable UI primitives. This document covers the key components and their relationships.

## Understanding the Component Architecture

Before diving into the code, let's understand why we structured our components this way and what problems we're solving.

### The Challenges We Face

Building a trading dashboard presents unique challenges:

1. **Performance at Scale** — Users may have hundreds of positions and thousands of historical trades. Rendering all this data without freezing the UI requires careful optimization.

2. **Real-time Updates** — Market data changes every second. Components need to update frequently without causing cascading re-renders that slow everything down.

3. **Data Freshness vs Server Load** — We want fresh data, but hitting the database on every interaction would overwhelm the server and slow down the experience.

4. **Code Maintainability** — A trading dashboard has many interconnected features. Without clear boundaries, the code becomes spaghetti.

### Our Solution: Next.js Server and Client Components

Next.js 14 gives us a powerful pattern: **Server Components** for data fetching and **Client Components** for interactivity. Here's why this matters:

**Server Components (RSC)**
- Run on the server, so they can directly access the database
- Send only HTML to the client, not JavaScript
- Don't add to the client bundle size
- Can't use `useState`, `useEffect`, or event handlers

**Client Components**
- Run in the browser and can be interactive
- Use `'use client'` directive at the top of the file
- Can use hooks and event handlers
- Are hydrated on the client

**Our Pattern:** We use Server Components at the page level to fetch data, then pass that data down to Client Components that handle interactivity.

## Component Design Principles

These principles guide how we structure every component:

| Principle | Description | Why It Matters |
|-----------|-------------|----------------|
| **Server-First** | Data fetching happens in Server Components when possible | Reduces client bundle size, faster initial load |
| **Composition** | Complex UIs are composed from smaller, focused components | Easier to test, maintain, and reuse |
| **Colocation** | Related components are grouped in feature folders | Developers can find everything in one place |
| **Memoization** | Heavy components use `memo()` to prevent unnecessary re-renders | Keeps the UI responsive during rapid updates |

## Dashboard Page Components

The main dashboard page combines trading controls, options grid, and order management.

### Understanding the Hierarchy

Think of the component hierarchy like a tree. At the top, you have the page (Server Component) which fetches all the initial data. Below that, you have sections (like tabs) that organize features. At the leaves, you have the actual UI elements users interact with.

**Why This Structure?**

- **DashboardPage (Server)** — Fetches user data, account info, and initial positions from the database. This happens on the server, so it's fast and secure.
- **DashboardPageClient (Client)** — Wraps everything in React context providers and handles client-side navigation between tabs.
- **Tab Components** — Each tab is a self-contained feature that manages its own state and data fetching.

### Component Hierarchy

```
DashboardPage (Server Component)
└── DashboardPageClient (Client Component)
    ├── PageHeader
    │   ├── AccountSelector
    │   └── NotificationBell
    ├── PageContentTabs
    │   ├── MasterTradingTab (default)
    │   │   ├── MasterPortfolioSummary
    │   │   ├── MasterTradingControls
    │   │   ├── MasterOptionsGrid
    │   │   ├── MasterOrdersTable
    │   │   └── SignalsFeedWidget
    │   ├── CopyTradingDashboardTab
    │   │   ├── TraderPerformanceTab
    │   │   └── SubscriberTraderPerformanceTab
    │   └── PositionsTab
    │       ├── OpenPositionsGrid
    │       └── ClosedPositionsList
    └── WinningTradeModal
```

### MasterTradingTab

The primary trading interface component that orchestrates the trading experience.

**What Does This Component Do?**

This is the "command center" of the trading dashboard. It's where users spend most of their time. Let's break down its responsibilities:

**1. Ticker Row Management** — Users can add ticker symbols (like AAPL, TSLA) to their watchlist. This component maintains the list and persists it to the server.

**2. Market Data Coordination** — For each ticker in the watchlist, we need live price data. This component manages WebSocket subscriptions so we only subscribe to tickers the user is actually viewing.

**3. Order Synchronization** — When a user places an order, it may take seconds or minutes to fill. This component polls the server to keep the order status up to date.

**4. Celebration Moments** — When a trade is closed at a profit, we show a celebratory modal. This creates a positive user experience and helps users recognize winning patterns.

**Responsibilities:**
- Manages ticker rows state
- Coordinates market data subscriptions
- Handles order synchronization
- Displays winning trade celebrations

<details>
<summary><strong>Component Implementation</strong></summary>

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RowModel } from '@/components/trading/models';
import { useOrdersSync } from '@/hooks/use-orders-sync';
import { useOrderNotifications } from '@/hooks/use-order-notifications';
import { useUserTickersSync } from '@/hooks/use-user-tickers-sync';
import { useMarketDataCoordinator } from '@/hooks/use-market-data-coordinator';
import { useWinningTradeCelebration } from '@/hooks/use-winning-trade-celebration';
import { MasterTradingControls } from './master-trading-controls';
import { MasterPortfolioSummary } from './master-portfolio-summary';
import { MasterOptionsGrid } from './master-options-grid';
import { MasterOrdersTable } from './master-orders-table';
import { SignalsFeedWidget } from '@/components/feeds/signals-feed-widget';
import { WinningTradeModal } from '@/components/dashboard/winning-trade-modal';

export interface MasterTradingTabProps {
  initialRows?: RowModel[];
  dailyPnl?: number;
}

export function MasterTradingTab({ 
  initialRows = [], 
  dailyPnl = 0 
}: MasterTradingTabProps) {
  // Enable order fill notifications
  useOrderNotifications();
  
  // Winning trade celebration modal
  const { showModal, winningTrade, dismissModal } = useWinningTradeCelebration();
  
  // Ticker rows state with persistence sync
  const [rows, setRows] = useState<RowModel[]>(() => initialRows);
  useUserTickersSync(rows, setRows);
  
  // Extract unique tickers for market data subscription
  const tickers = useMemo(() => 
    Array.from(new Set(rows.map((r) => r.ticker.toUpperCase()))), 
    [rows]
  );

  // Market data WebSocket coordinator
  const {
    connectionStatus,
    subscribeTicker,
    requestOptionsChain,
    forceReconnect,
  } = useMarketDataCoordinator({ tickers, enabled: true });

  // Poll order statuses every 3 seconds
  useOrdersSync(3000);

  // Row management handlers
  const addRow = (row: RowModel) => setRows(prev => [...prev, row]);
  const updateRow = (id: string, updates: Partial<RowModel>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };
  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Portfolio summary with daily P&L */}
      <MasterPortfolioSummary dailyPnl={dailyPnl} />
      
      {/* Trading controls: amount, order type, broker */}
      <MasterTradingControls />
      
      {/* Options chain grid */}
      <MasterOptionsGrid
        rows={rows}
        onUpdateRow={updateRow}
        onAddRow={addRow}
        onRemoveRow={removeRow}
        subscribeTicker={subscribeTicker}
        requestOptionsChain={requestOptionsChain}
        connectionStatus={connectionStatus}
      />
      
      {/* Active orders table */}
      <MasterOrdersTable
        requestOptionsChain={requestOptionsChain}
        connectionStatus={connectionStatus}
      />
      
      {/* Winning trade celebration */}
      <WinningTradeModal
        open={showModal}
        trade={winningTrade}
        onDismiss={dismissModal}
      />
    </div>
  );
}
```

</details>

### MasterPortfolioSummary

Displays the daily P&L and portfolio metrics header.

| Prop | Type | Description |
|------|------|-------------|
| `dailyPnl` | `number` | Today's profit/loss |

<details>
<summary><strong>Component Implementation</strong></summary>

```tsx
'use client';

import { memo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatUsd } from '@/lib/utils/format';

interface MasterPortfolioSummaryProps {
  dailyPnl: number;
}

export const MasterPortfolioSummary = memo(function MasterPortfolioSummary({
  dailyPnl,
}: MasterPortfolioSummaryProps) {
  const isPositive = dailyPnl >= 0;
  
  return (
    <div className="flex items-center justify-between p-4 bg-neutral-900 rounded-xl border border-neutral-800">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${
          isPositive ? 'bg-green-500/10' : 'bg-red-500/10'
        }`}>
          {isPositive ? (
            <TrendingUp className="w-5 h-5 text-green-400" />
          ) : (
            <TrendingDown className="w-5 h-5 text-red-400" />
          )}
        </div>
        <div>
          <p className="text-sm text-neutral-400">Today's P&L</p>
          <p className={`text-2xl font-bold ${
            isPositive ? 'text-green-400' : 'text-red-400'
          }`}>
            {formatUsd(dailyPnl)}
          </p>
        </div>
      </div>
    </div>
  );
});
```

</details>

---

## Analytics Components

The analytics page provides comprehensive trading statistics and visualizations. This is where users go to understand their trading performance and identify areas for improvement.

### Why Separate Analytics from Trading?

The main trading page is for **action**—placing orders, monitoring positions. The analytics page is for **reflection**—understanding patterns, measuring progress.

By separating these concerns:
- The trading page can be optimized for speed and real-time updates
- The analytics page can load more data and render more complex visualizations
- Users have a dedicated space for performance analysis without trading distractions

### How the Analytics Page Is Organized

The analytics page uses a tabbed interface:

1. **Dashboard Tab** — High-level metrics (P&L, win rate, ROI) at a glance
2. **All Trades Tab** — Searchable list of all closed positions
3. **Open Positions Tab** — Currently held positions with live P&L
4. **Performance Tab** — Charts showing performance over time
5. **Symbol Stats Tab** — Which stocks/options you trade best

### Component Hierarchy

```
Analytics3V2Page (Client Component)
└── TradeSourceProviderV2
    └── Analytics3V2TabsContainer
        ├── TradeSourceToggleV2
        └── Tabs
            ├── DashboardTabV2
            │   ├── MetricCardV2 (Total P&L)
            │   ├── MetricCardV2 (Win Rate)
            │   ├── MetricCardV2 (7 Day P&L)
            │   ├── MetricCardV2 (Open Positions)
            │   ├── SecondaryStats
            │   │   ├── BiggestWinCard
            │   │   ├── BiggestLossCard
            │   │   └── ROICard
            │   └── ManualVsCopiedBreakdown
            │       ├── ManualTradesCard
            │       └── CopiedTradesCard
            ├── AllTradesTabV2
            │   ├── TradeFilters
            │   └── ClosedPositionsList
            │       └── PositionRow (repeated)
            ├── OpenPositionsTabV2
            │   └── OpenPositionsGrid
            │       └── PositionCard (repeated)
            ├── SymbolsTabV2
            │   └── SymbolPerformanceCards
            │       └── SymbolCard (repeated)
            └── HeatmapTab
                └── TradingHeatmapChart
```

### DashboardTabV2

The main analytics dashboard with metric cards and breakdowns.

**What This Component Does:**

This is the "scorecard" view of your trading performance. When you open the analytics page, this is what you see first. It answers the most important questions:

1. **Am I profitable?** → Total P&L card
2. **Am I consistent?** → Win Rate card
3. **How's my recent performance?** → 7 Day P&L card
4. **What do I have open?** → Open Positions card

**Why Metric Cards?**

We use cards because:
- Each metric is self-contained and easy to scan
- Cards can show color (green for good, red for bad) instantly
- The grid layout works on mobile (cards stack vertically)
- Adding new metrics is as simple as adding a new card

**How Data Fetching Works:**

1. The component mounts and calls two API endpoints in parallel
2. User stats (P&L, win rate) and period stats (7-day performance) load simultaneously
3. If the user changes the trade source filter, both APIs are called again
4. We use `useEffect` cleanup to prevent state updates on unmounted components

**The `source` Filter:**

Notice how we pass `source` to the API calls. This is the trade source filter from context. When a user clicks "Manual Only," the `source` changes to `manual`, triggering a re-fetch of data filtered to only manual trades.

<details>
<summary><strong>Component Implementation</strong></summary>

```tsx
'use client';

import { memo, useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, Clock, Activity } from 'lucide-react';
import { MetricCardV2 } from './metric-card-v2';
import { useTradeSourceFilterV2 } from '../trade-source-context-v2';
import { formatUsd, formatPercent } from '@/lib/utils/format';

interface UserStats {
  total_closed_trades: number;
  total_open_positions: number;
  total_pnl: number;
  wins: number;
  losses: number;
  win_rate_pct: number;
  biggest_win: number;
  biggest_loss: number;
  roi_pct: number;
}

interface PeriodStats {
  pnl_7d: number;
  trades_7d: number;
}

export const DashboardTabV2 = memo(function DashboardTabV2() {
  const { source } = useTradeSourceFilterV2();
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [periodStats, setPeriodStats] = useState<PeriodStats | null>(null);

  useEffect(() => {
    let ignore = false;
    
    async function fetchData() {
      setLoading(true);
      
      const [userRes, periodRes] = await Promise.all([
        fetch(`/api/analytics-v2/user-stats?source=${source}`),
        fetch(`/api/analytics-v2/period-stats?source=${source}`),
      ]);
      
      if (!ignore) {
        if (userRes.ok) setUserStats((await userRes.json()).data);
        if (periodRes.ok) setPeriodStats((await periodRes.json()).data);
        setLoading(false);
      }
    }
    
    fetchData();
    return () => { ignore = true; };
  }, [source]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Primary Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCardV2
          label="Total P&L"
          value={formatUsd(userStats?.total_pnl ?? 0)}
          positive={(userStats?.total_pnl ?? 0) >= 0}
          icon={TrendingUp}
        />
        <MetricCardV2
          label="Win Rate"
          value={formatPercent(userStats?.win_rate_pct ?? 0)}
          positive={(userStats?.win_rate_pct ?? 0) >= 50}
          icon={Target}
        />
        <MetricCardV2
          label="7 Day P&L"
          value={formatUsd(periodStats?.pnl_7d ?? 0)}
          subtitle={`${periodStats?.trades_7d ?? 0} trades`}
          positive={(periodStats?.pnl_7d ?? 0) >= 0}
          icon={Activity}
        />
        <MetricCardV2
          label="Open Positions"
          value={String(userStats?.total_open_positions ?? 0)}
          positive={true}
          icon={Clock}
        />
      </div>
      
      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SecondaryStatCard
          label="Biggest Win"
          value={formatUsd(userStats?.biggest_win ?? 0)}
          positive={true}
        />
        <SecondaryStatCard
          label="Biggest Loss"
          value={formatUsd(userStats?.biggest_loss ?? 0)}
          positive={false}
        />
        <SecondaryStatCard
          label="ROI"
          value={formatPercent(userStats?.roi_pct ?? 0)}
          positive={(userStats?.roi_pct ?? 0) >= 0}
        />
      </div>
      
      {/* Manual vs Copied Breakdown */}
      <ManualVsCopiedBreakdown />
    </div>
  );
});
```

</details>

### MetricCardV2

Reusable metric display card with icon and color coding.

**Design Philosophy:**

The metric card is the building block of our analytics UI. We designed it to be:

1. **Scannable** — Users should understand the metric in under a second. The icon provides context, the color indicates good/bad, and the value is large and bold.

2. **Consistent** — Every metric uses the same card format. This creates visual rhythm and makes the page feel organized.

3. **Responsive** — Cards stack on mobile but sit side-by-side on desktop. The grid handles this automatically.

4. **Memoized** — We wrap the component in `memo()` to prevent re-renders when parent state changes but the card's props haven't changed. This matters when you have many cards on screen.

**Color Coding Explained:**

- **Green** = Good (profit, high win rate, positive ROI)
- **Red** = Bad (loss, low win rate, negative ROI)

The `positive` prop controls this. For most metrics, positive values are green. But for "Biggest Loss," we always show red even though the value is displayed—it's still a loss.

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Metric label |
| `value` | `string` | Formatted metric value |
| `subtitle` | `string?` | Optional subtitle |
| `detail` | `string?` | Optional detail text |
| `positive` | `boolean` | Determines color (green/red) |
| `icon` | `LucideIcon` | Icon component |

<details>
<summary><strong>Component Implementation</strong></summary>

```tsx
'use client';

import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardV2Props {
  label: string;
  value: string;
  subtitle?: string;
  detail?: string;
  positive: boolean;
  icon: LucideIcon;
}

export const MetricCardV2 = memo(function MetricCardV2({
  label,
  value,
  subtitle,
  detail,
  positive,
  icon: Icon,
}: MetricCardV2Props) {
  return (
    <div className="p-4 bg-neutral-900 rounded-2xl border border-neutral-800 hover:border-neutral-700 transition-colors">
      {/* Header with icon and label */}
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-xl ${
          positive 
            ? 'bg-green-500/10 text-green-400' 
            : 'bg-red-500/10 text-red-400'
        }`}>
          <Icon size={20} />
        </div>
        <span className="text-xs text-neutral-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
      
      {/* Main value */}
      <p className={`text-2xl font-black tracking-tight ${
        positive ? 'text-green-400' : 'text-red-400'
      }`}>
        {value}
      </p>
      
      {/* Optional subtitle and detail */}
      {(subtitle || detail) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
          {subtitle && <span>{subtitle}</span>}
          {subtitle && detail && <span>•</span>}
          {detail && <span>{detail}</span>}
        </div>
      )}
    </div>
  );
});
```

</details>

### TradeSourceToggleV2

Toggle button group for filtering trades by source (all/manual/copied).

**How This Component Works:**

This is the filter control that appears at the top of the analytics page. It lets users switch between viewing all trades, only manual trades, or only copied trades.

**Why a Toggle Instead of a Dropdown?**

- There are only 3 options—a dropdown would be overkill
- Users can see all options at once without clicking
- The selected state is immediately visible
- It's faster to switch between options with one click

**How It Integrates:**

The toggle reads and writes to `TradeSourceContext`. When a user clicks "Manual," the context updates, which causes all analytics components to re-fetch data with the new filter.

<details>
<summary><strong>Component Implementation</strong></summary>

```tsx
'use client';

import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { useTradeSourceFilterV2 } from './trade-source-context-v2';

const sources = ['all', 'manual', 'copied'] as const;

export const TradeSourceToggleV2 = memo(function TradeSourceToggleV2() {
  const { source, setSource } = useTradeSourceFilterV2();

  return (
    <div className="flex items-center gap-1 bg-neutral-900 rounded-lg p-1 border border-neutral-800">
      {sources.map((s) => (
        <Button
          key={s}
          variant={source === s ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setSource(s)}
          className={`text-xs capitalize ${
            source === s 
              ? 'bg-white text-black' 
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {s}
        </Button>
      ))}
    </div>
  );
});
```

</details>

---

## Positions Components

Components for displaying open and closed positions.

### PositionsTab

Container for the positions view with open/closed sub-tabs.

<details>
<summary><strong>Component Implementation</strong></summary>

```tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OpenPositionsGrid } from './open-positions-grid';
import { ClosedPositionsList } from './closed-positions-list';

export function PositionsTab() {
  const [activeTab, setActiveTab] = useState('open');

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-neutral-900">
          <TabsTrigger value="open">Open Positions</TabsTrigger>
          <TabsTrigger value="closed">Closed Positions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="open" className="mt-4">
          <OpenPositionsGrid />
        </TabsContent>
        
        <TabsContent value="closed" className="mt-4">
          <ClosedPositionsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

</details>

### OpenPositionsGrid

Grid display of currently open positions with real-time P&L.

<details>
<summary><strong>Component Implementation</strong></summary>

```tsx
'use client';

import { memo } from 'react';
import useSWR from 'swr';
import { OpenPosition } from '@/types/analytics';
import { PositionCard } from './position-card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingGrid } from '@/components/ui/loading-grid';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export const OpenPositionsGrid = memo(function OpenPositionsGrid() {
  const { data, isLoading, error } = useSWR<{ data: OpenPosition[] }>(
    '/api/analytics-v2/open-positions',
    fetcher,
    { refreshInterval: 10000 } // Refresh every 10 seconds
  );

  if (isLoading) return <LoadingGrid count={4} />;
  
  if (error) {
    return <ErrorState message="Failed to load positions" />;
  }
  
  const positions = data?.data ?? [];
  
  if (positions.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="No Open Positions"
        description="You don't have any open positions right now."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {positions.map((position) => (
        <PositionCard key={position.id} position={position} />
      ))}
    </div>
  );
});
```

</details>

---

## Winning Trade Modal

Celebration modal displayed when a trade closes with profit.

<details>
<summary><strong>Component Implementation</strong></summary>

```tsx
'use client';

import { memo, useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Trophy, TrendingUp } from 'lucide-react';
import { formatUsd, formatPercent } from '@/lib/utils/format';
import confetti from 'canvas-confetti';

interface WinningTrade {
  symbol: string;
  pnl: number;
  percentGain: number;
}

interface WinningTradeModalProps {
  open: boolean;
  trade: WinningTrade | null;
  onDismiss: () => void;
}

export const WinningTradeModal = memo(function WinningTradeModal({
  open,
  trade,
  onDismiss,
}: WinningTradeModalProps) {
  
  // Trigger confetti on open
  useEffect(() => {
    if (open && trade) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [open, trade]);

  if (!trade) return null;

  return (
    <Dialog open={open} onOpenChange={onDismiss}>
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-900/50 to-neutral-900 border-green-500/20">
        <div className="flex flex-col items-center text-center py-6">
          {/* Trophy icon */}
          <div className="p-4 bg-green-500/20 rounded-full mb-4">
            <Trophy className="w-12 h-12 text-green-400" />
          </div>
          
          {/* Title */}
          <h2 className="text-2xl font-bold text-white mb-2">
            Winner! 🎉
          </h2>
          
          {/* Symbol */}
          <p className="text-neutral-400 mb-4">{trade.symbol}</p>
          
          {/* P&L Display */}
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-4xl font-black text-green-400">
                {formatUsd(trade.pnl)}
              </p>
              <p className="text-sm text-green-400/70 flex items-center justify-center gap-1">
                <TrendingUp className="w-4 h-4" />
                {formatPercent(trade.percentGain)}
              </p>
            </div>
          </div>
          
          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            className="mt-6 px-6 py-2 bg-green-500 text-black font-medium rounded-lg hover:bg-green-400 transition-colors"
          >
            Awesome!
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
```

</details>

---

## Component Best Practices

### Memoization

Components that receive stable props should be memoized:

```tsx
// Good: Memoized pure component
export const MetricCard = memo(function MetricCard(props) {
  // ...
});

// Bad: Inline function prevents memoization
<MetricCard onClick={() => handleClick(id)} />

// Good: Stable callback reference
const handleCardClick = useCallback(() => handleClick(id), [id]);
<MetricCard onClick={handleCardClick} />
```

### Loading States

Always handle loading states with skeletons:

```tsx
if (isLoading) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
  );
}
```

### Error Boundaries

Wrap complex components with error boundaries:

```tsx
<ErrorBoundary fallback={<ErrorState />}>
  <AnalyticsDashboard />
</ErrorBoundary>
```

:::tip Component Organization
Keep components small and focused. If a component exceeds ~200 lines, consider splitting it into smaller sub-components.
:::
