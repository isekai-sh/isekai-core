# Prompt: Add Frontend Page

**Purpose:** Guide for adding a new page to the Isekai Core frontend

---

## Prerequisites

Before starting, ensure you have:
- [ ] API endpoint exists (if fetching data)
- [ ] Frontend dev server running (`pnpm dev`)
- [ ] shadcn/ui components installed
- [ ] React Router configured

---

## Step 1: Define Requirements

**Questions to Answer:**
1. What is the page's purpose?
2. What data does it display?
3. What user interactions are needed?
4. Is authentication required?
5. What is the route path?

**Example:**
```
Purpose: Display list of user's automations
Data: Automation[] from /api/automations
Interactions: Create, edit, delete automations
Auth: Required
Path: /automation
```

---

## Step 2: Create Page Component

**Location:** `apps/isekai-frontend/src/pages/MyPage.tsx`

**Template:**

```tsx
/*
 * Copyright (C) 2026 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { myEndpoint } from "@/lib/api";

export function MyPage() {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Fetch data
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-endpoint"],
    queryFn: () => myEndpoint.getAll(),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => myEndpoint.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-endpoint"] });
      toast({
        title: "Success",
        description: "Item deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Items</h1>
          <p className="text-muted-foreground">Manage your items</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Item
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
              <CardDescription>
                Created {new Date(item.createdAt).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-end space-x-2">
              <Button variant="ghost" size="sm">
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteMutation.mutate(item.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {data?.items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No items yet</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Item
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

---

## Step 3: Add Route

**File:** `apps/isekai-frontend/src/App.tsx`

```tsx
import { MyPage } from "@/pages/MyPage";

function App() {
  return (
    <Routes>
      {/* ... existing routes ... */}

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/my-page" element={<MyPage />} />
      </Route>
    </Routes>
  );
}
```

---

## Step 4: Add API Client Methods

**File:** `apps/isekai-frontend/src/lib/api.ts`

```typescript
export const myEndpoint = {
  async getAll() {
    return fetchWithRetry<{ items: MyItem[] }>(`${API_URL}/my-endpoint`);
  },

  async getById(id: string) {
    return fetchWithRetry<{ item: MyItem }>(`${API_URL}/my-endpoint/${id}`);
  },

  async create(data: CreateMyItemRequest) {
    return fetchWithRetry<{ item: MyItem }>(`${API_URL}/my-endpoint`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: UpdateMyItemRequest) {
    return fetchWithRetry<{ item: MyItem }>(`${API_URL}/my-endpoint/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchWithRetry<void>(`${API_URL}/my-endpoint/${id}`, {
      method: "DELETE",
    });
  },
};
```

---

## Step 5: Add Navigation Link

**File:** `apps/isekai-frontend/src/components/app-sidebar.tsx`

```tsx
import { MyIcon } from "lucide-react";

const navItems = [
  // ... existing items ...
  {
    title: "My Page",
    href: "/my-page",
    icon: MyIcon,
  },
];
```

---

## Step 6: Add Tests

**Location:** `apps/isekai-frontend/src/pages/MyPage.test.tsx`

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyPage } from "./MyPage";
import { myEndpoint } from "@/lib/api";

vi.mock("@/lib/api");

describe("MyPage", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  it("should display loading state", () => {
    vi.mocked(myEndpoint.getAll).mockReturnValue(new Promise(() => {}));

    render(
      <QueryClientProvider client={queryClient}>
        <MyPage />
      </QueryClientProvider>
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("should display items", async () => {
    vi.mocked(myEndpoint.getAll).mockResolvedValue({
      items: [
        { id: "1", name: "Item 1", createdAt: new Date().toISOString() },
        { id: "2", name: "Item 2", createdAt: new Date().toISOString() },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MyPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
    });
  });

  it("should display empty state", async () => {
    vi.mocked(myEndpoint.getAll).mockResolvedValue({ items: [] });

    render(
      <QueryClientProvider client={queryClient}>
        <MyPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("No items yet")).toBeInTheDocument();
    });
  });
});
```

---

## Step 7: Test Locally

```bash
# Start dev server
pnpm dev

# Navigate to http://localhost:3000/my-page
# Test interactions (create, edit, delete)

# Run tests
pnpm --filter isekai-frontend test
```

---

## Checklist

- [ ] Page component created with AGPL license header
- [ ] TanStack Query hooks for data fetching
- [ ] Loading and error states handled
- [ ] Empty state displayed when no data
- [ ] Route added to App.tsx
- [ ] Navigation link added to sidebar
- [ ] API client methods added
- [ ] Tests written
- [ ] TypeScript compiles without errors
- [ ] Responsive design (test on mobile)

---

## Common Pitfalls

1. **Missing Loading State**
   - ❌ Render data immediately (flashing)
   - ✅ Show loading spinner while fetching

2. **No Error Handling**
   - ❌ Page crashes on API error
   - ✅ Display error message with retry button

3. **Forgot Cache Invalidation**
   - ❌ Stale data after mutation
   - ✅ `queryClient.invalidateQueries()` after mutations

4. **Direct API Calls**
   - ❌ `fetch("/api/my-endpoint")` in component
   - ✅ Use API client methods from `lib/api.ts`

5. **Missing Empty State**
   - ❌ Blank page when no data
   - ✅ Show helpful message with CTA

---

## Related Documentation

- `.context/ui/components.md` - Component patterns
- `.context/ui/state-management.md` - TanStack Query usage
- `.context/testing.md` - Test strategies
