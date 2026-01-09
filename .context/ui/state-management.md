# Frontend State Management

**Purpose:** Client-side state architecture, Zustand stores, and TanStack Query patterns
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

Isekai Core frontend uses a **clear separation** between server state and UI state:

- **TanStack Query** - Server state (API data, caching, synchronization)
- **Zustand** - UI state (auth, whitelabel configuration)
- **React Router 7** - Routing and navigation

**Philosophy:** Server state lives in TanStack Query, UI state lives in Zustand. Never duplicate server data in Zustand.

---

## TanStack Query (Server State)

**Purpose:** Fetch, cache, and synchronize server data.

**Library:** `@tanstack/react-query`

**Configuration:** `apps/isekai-frontend/src/main.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}
```

---

## API Client Pattern

**Location:** `apps/isekai-frontend/src/lib/api.ts`

**Architecture:**

```tsx
// Runtime configuration (no build-time env vars)
const API_URL = (window as any).ISEKAI_CONFIG?.API_URL || '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public upgradeRequired?: boolean
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Retry configuration
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetry: (error: any, attempt: number) => boolean;
}

// Exponential backoff with jitter
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}
```

**Features:**

- Exponential backoff (1s to 10s)
- Retry on 429 (rate limit), 408 (timeout), 5xx (server errors)
- 0-30% jitter to prevent thundering herd
- Runtime API URL configuration (supports whitelabel deployments)

---

## TanStack Query Hooks

### Query Hook Pattern

**Purpose:** Fetch data from API.

**Example:**

```tsx
import { useQuery } from '@tanstack/react-query';
import { deviations } from '@/lib/api';

function useDrafts() {
  return useQuery({
    queryKey: ['deviations', 'draft'],
    queryFn: () => deviations.getByStatus('draft'),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Usage
function DraftPage() {
  const { data, isLoading, error } = useDrafts();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div>
      {data.map((deviation) => (
        <DeviationCard key={deviation.id} deviation={deviation} />
      ))}
    </div>
  );
}
```

### Mutation Hook Pattern

**Purpose:** Modify data on server, invalidate cache.

**Example:**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deviations } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

function useCreateDeviation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDeviationRequest) => deviations.create(data),
    onSuccess: () => {
      // Invalidate drafts query to refetch
      queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });

      toast({
        title: 'Success',
        description: 'Deviation created successfully.',
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Usage
function CreateDeviationForm() {
  const createMutation = useCreateDeviation();

  const handleSubmit = (data: CreateDeviationRequest) => {
    createMutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <Button disabled={createMutation.isPending}>
        {createMutation.isPending ? 'Creating...' : 'Create'}
      </Button>
    </form>
  );
}
```

---

## Cache Invalidation Strategy

### Invalidate After Mutations

```tsx
// Create deviation → Invalidate drafts list
queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });

// Update deviation → Invalidate specific deviation + list
queryClient.invalidateQueries({ queryKey: ['deviations', deviationId] });
queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });

// Delete deviation → Invalidate list
queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });

// Schedule deviation → Invalidate draft list + scheduled list
queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });
queryClient.invalidateQueries({ queryKey: ['deviations', 'scheduled'] });
```

### Query Key Conventions

```tsx
// Entity list by status
['deviations', 'draft'][('deviations', 'scheduled')][('deviations', 'published')][
  // Entity detail
  ('deviations', deviationId)
][
  // Related entities
  ('galleries', userId)
][('automations', userId)][
  // Browse cache
  ('browse', mode, { offset, tag })
];
```

---

## Zustand Stores (UI State)

**Purpose:** Client-side UI state that doesn't come from server.

**Library:** `zustand`

---

### Auth Store

**Location:** `apps/isekai-frontend/src/stores/auth.ts`

**Purpose:** Authentication state, user profile.

**Pattern:**

```tsx
import { create } from 'zustand';
import type { User } from '@isekai/shared';
import { auth } from '@/lib/api';

interface ExtendedUser extends User {
  instanceRole?: 'admin' | 'member';
  isAdmin?: boolean;
}

interface AuthState {
  user: ExtendedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  error: string | null;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: ExtendedUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isAdmin: false,
  error: null,

  fetchUser: async () => {
    try {
      set({ isLoading: true, error: null });
      const user = (await auth.getMe()) as ExtendedUser;
      set({
        user,
        isAuthenticated: true,
        isAdmin: user.isAdmin === true,
        isLoading: false,
      });
    } catch {
      set({ user: null, isAuthenticated: false, isAdmin: false, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await auth.logout();
    } finally {
      set({ user: null, isAuthenticated: false, isAdmin: false });
    }
  },

  setUser: (user) => {
    set({
      user,
      isAuthenticated: !!user,
      isAdmin: user?.isAdmin === true,
      isLoading: false,
    });
  },
}));

// Initialize auth on app load
useAuthStore.getState().fetchUser();
```

**Usage:**

```tsx
function Header() {
  const { user, isAuthenticated, logout } = useAuthStore();

  if (!isAuthenticated) return null;

  return (
    <div>
      <span>Welcome, {user.deviantartUsername}</span>
      <Button onClick={logout}>Logout</Button>
    </div>
  );
}
```

---

### Whitelabel Store (v0.1.0-alpha.3+)

**Location:** `apps/isekai-frontend/src/stores/whitelabel.ts`

**Purpose:** Multi-tenant branding configuration.

**Pattern:**

```tsx
import { create } from 'zustand';
import { config, type WhitelabelConfig } from '@/lib/api';

interface WhitelabelState {
  config: WhitelabelConfig | null;
  isLoading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  applyBranding: () => void;
}

const DEFAULT_PRODUCT_NAME = 'Isekai';

export const useWhitelabelStore = create<WhitelabelState>((set, get) => ({
  config: null,
  isLoading: true,
  error: null,

  fetchConfig: async () => {
    try {
      set({ isLoading: true, error: null });
      const whitelabelConfig = await config.getWhitelabel();
      set({ config: whitelabelConfig, isLoading: false });
      get().applyBranding();
    } catch {
      // Use defaults if config fails to load
      set({
        config: {
          enabled: false,
          productName: DEFAULT_PRODUCT_NAME,
          logoUrl: null,
          faviconUrl: null,
          footerText: null,
          supportEmail: null,
        },
        isLoading: false,
      });
    }
  },

  applyBranding: () => {
    const { config: whitelabelConfig } = get();
    if (!whitelabelConfig) return;

    // Update document title
    const productName = whitelabelConfig.productName || DEFAULT_PRODUCT_NAME;
    document.title = `${productName} - DeviantArt Scheduler`;

    // Update favicon if custom one is provided
    if (whitelabelConfig.faviconUrl) {
      const existingFavicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (existingFavicon) {
        existingFavicon.href = whitelabelConfig.faviconUrl;
      } else {
        const favicon = document.createElement('link');
        favicon.rel = 'icon';
        favicon.href = whitelabelConfig.faviconUrl;
        document.head.appendChild(favicon);
      }
    }
  },
}));

// Initialize whitelabel on app load
useWhitelabelStore.getState().fetchConfig();
```

**Usage:**

```tsx
function Footer() {
  const { config } = useWhitelabelStore();

  return (
    <footer>
      <p>{config?.footerText || '© 2025 Isekai. All rights reserved.'}</p>
      {config?.supportEmail && <a href={`mailto:${config.supportEmail}`}>Contact Support</a>}
    </footer>
  );
}
```

---

## React Router 7 (Routing)

**Location:** `apps/isekai-frontend/src/App.tsx`

**Pattern:**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layouts/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/callback" element={<Callback />} />

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/browse" element={<Browse />} />
        <Route path="/review" element={<Review />} />
        <Route path="/draft" element={<Draft />} />
        <Route path="/scheduled" element={<Scheduled />} />
        <Route path="/published" element={<Published />} />
        <Route path="/automation" element={<AutomationList />} />
        <Route path="/automation/:id" element={<AutomationDetail />} />
        <Route path="/deviations/:id" element={<EditDeviation />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

---

## Navigation

### Programmatic Navigation

```tsx
import { useNavigate } from 'react-router-dom';

function MyComponent() {
  const navigate = useNavigate();

  const handleCreate = async () => {
    const deviation = await createDeviation();
    navigate(`/deviations/${deviation.id}`);
  };

  return <Button onClick={handleCreate}>Create</Button>;
}
```

### Route Parameters

```tsx
import { useParams } from 'react-router-dom';

function AutomationDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: automation } = useQuery({
    queryKey: ['automations', id],
    queryFn: () => automations.getById(id!),
  });

  return <div>{automation?.name}</div>;
}
```

---

## Protected Routes

**Component:** `ProtectedRoute`

**Pattern:**

```tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

---

## State Management Best Practices

### 1. Server State in TanStack Query

**✅ CORRECT:**

```tsx
// Fetch deviations with TanStack Query
const { data: deviations } = useQuery({
  queryKey: ['deviations', 'draft'],
  queryFn: () => deviations.getByStatus('draft'),
});
```

**❌ WRONG:**

```tsx
// Don't duplicate server data in Zustand
const [deviations, setDeviations] = useState<Deviation[]>([]);

useEffect(() => {
  deviations.getByStatus('draft').then(setDeviations);
}, []);
```

---

### 2. UI State in Zustand

**✅ CORRECT:**

```tsx
// UI state: auth, whitelabel config
const { user, isAuthenticated } = useAuthStore();
const { config } = useWhitelabelStore();
```

**❌ WRONG:**

```tsx
// Don't put server data in Zustand
interface AppState {
  deviations: Deviation[]; // ❌ Server data
  galleries: Gallery[]; // ❌ Server data
}
```

---

### 3. Cache Invalidation After Mutations

**✅ CORRECT:**

```tsx
const createMutation = useMutation({
  mutationFn: deviations.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['deviations', 'draft'] });
  },
});
```

**❌ WRONG:**

```tsx
// Don't manually refetch
const createMutation = useMutation({
  mutationFn: deviations.create,
  onSuccess: () => {
    // ❌ Manual refetch
    const drafts = await deviations.getByStatus('draft');
    setDrafts(drafts);
  },
});
```

---

### 4. Optimistic Updates

```tsx
const updateMutation = useMutation({
  mutationFn: deviations.update,
  onMutate: async (updatedDeviation) => {
    // Cancel outgoing queries
    await queryClient.cancelQueries({ queryKey: ['deviations', updatedDeviation.id] });

    // Snapshot previous value
    const previousDeviation = queryClient.getQueryData(['deviations', updatedDeviation.id]);

    // Optimistically update
    queryClient.setQueryData(['deviations', updatedDeviation.id], updatedDeviation);

    return { previousDeviation };
  },
  onError: (err, updatedDeviation, context) => {
    // Rollback on error
    queryClient.setQueryData(['deviations', updatedDeviation.id], context?.previousDeviation);
  },
  onSettled: () => {
    // Refetch after mutation
    queryClient.invalidateQueries({ queryKey: ['deviations'] });
  },
});
```

---

### 5. Stale Time Configuration

```tsx
// Short stale time for frequently changing data
useQuery({
  queryKey: ['deviations', 'scheduled'],
  queryFn: () => deviations.getByStatus('scheduled'),
  staleTime: 30 * 1000, // 30 seconds
});

// Long stale time for rarely changing data
useQuery({
  queryKey: ['galleries'],
  queryFn: () => galleries.getAll(),
  staleTime: 10 * 60 * 1000, // 10 minutes
});
```

---

## Custom Hooks

### useReviewCount

**Location:** `apps/isekai-frontend/src/hooks/useReviewCount.ts`

**Purpose:** Fetch count of deviations in review status for badge.

```tsx
import { useQuery } from '@tanstack/react-query';
import { deviations } from '@/lib/api';

export function useReviewCount() {
  return useQuery({
    queryKey: ['deviations', 'review', 'count'],
    queryFn: async () => {
      const data = await deviations.getByStatus('review');
      return data.length;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

// Usage
function Sidebar() {
  const { data: reviewCount } = useReviewCount();

  return <NavItem to="/review">Review {reviewCount > 0 && <Badge>{reviewCount}</Badge>}</NavItem>;
}
```

---

## Related Documentation

- `.context/ui/components.md` - Component architecture
- `.context/api/endpoints.md` - API reference
- `.context/testing.md` - Testing strategies
- `.context/ai-rules.md` - Code style rules
