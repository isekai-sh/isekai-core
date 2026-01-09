# Frontend Components

**Purpose:** React component architecture, UI library usage, and component patterns
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Overview

Isekai Core frontend uses **React 18 with TypeScript**, **shadcn/ui + Radix UI** for components, and **Tailwind CSS** for styling.

**Key Libraries:**

- **shadcn/ui** - Accessible, customizable component library
- **Radix UI** - Unstyled, accessible UI primitives
- **@dnd-kit** - Drag-and-drop functionality
- **FullCalendar** - Calendar component for scheduling
- **TanStack Table** - Data table management
- **Lucide React** - Icon library

---

## Component Architecture

### shadcn/ui Components

**Location:** `apps/isekai-frontend/src/components/ui/`

**Available Components:**

- `alert-dialog.tsx` - Modal dialogs with actions
- `avatar.tsx` - User avatars with fallback
- `badge.tsx` - Status badges
- `button.tsx` - Primary UI buttons
- `calendar.tsx` - Date picker
- `card.tsx` - Content containers
- `checkbox.tsx` - Form checkboxes
- `dialog.tsx` - Modal dialogs
- `dropdown-menu.tsx` - Dropdown menus
- `input.tsx` - Form inputs
- `label.tsx` - Form labels
- `popover.tsx` - Floating content
- `radio-group.tsx` - Radio button groups
- `select.tsx` - Dropdown selects
- `separator.tsx` - Visual dividers
- `switch.tsx` - Toggle switches
- `tabs.tsx` - Tabbed interfaces
- `textarea.tsx` - Multi-line inputs
- `toast.tsx` - Notifications
- `tooltip.tsx` - Hover tooltips

**Usage Pattern:**

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Card</CardTitle>
      </CardHeader>
      <CardContent>
        <Input placeholder="Enter text" />
        <Button>Submit</Button>
      </CardContent>
    </Card>
  );
}
```

---

## Drag and Drop (@dnd-kit)

**Purpose:** Reorder files, gallery items, and automation rules.

**Library:** `@dnd-kit/core`, `@dnd-kit/sortable`

**Pattern:**

```tsx
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';

function SortableList({ items }: { items: Item[] }) {
  const [sortedItems, setSortedItems] = useState(items);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSortedItems((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortedItems} strategy={rectSortingStrategy}>
        {sortedItems.map((item) => (
          <SortableItem key={item.id} item={item} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
```

**Use Cases:**

- File uploader (`DeviationUploader.tsx`)
- Gallery item reordering
- Schedule rule priority

---

## File Upload (react-dropzone)

**Purpose:** Drag-and-drop file uploads for deviations.

**Component:** `DeviationUploader.tsx`

**Pattern:**

```tsx
import { useDropzone } from 'react-dropzone';

function DeviationUploader() {
  const [files, setFiles] = useState<FileWithPreview[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
      'video/*': ['.mp4', '.webm'],
    },
    maxSize: 30 * 1024 * 1024, // 30MB
  });

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      {isDragActive ? <p>Drop files here...</p> : <p>Drag or click to upload</p>}
    </div>
  );
}
```

**Features:**

- File type validation (images, videos)
- Size limit (30MB)
- Preview generation
- Upload progress tracking

---

## Calendar (FullCalendar)

**Purpose:** Visualize scheduled deviations on a calendar.

**Library:** `@fullcalendar/react`

**Pattern:**

```tsx
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

function ScheduleCalendar({ deviations }: { deviations: Deviation[] }) {
  const events = deviations.map((deviation) => ({
    id: deviation.id,
    title: deviation.title,
    start: deviation.actualPublishAt,
    color: deviation.status === 'scheduled' ? '#3b82f6' : '#10b981',
  }));

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      events={events}
      editable={true}
      selectable={true}
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      }}
    />
  );
}
```

**Views:**

- Month view (default)
- Week view
- Day view

---

## Data Tables (TanStack Table)

**Purpose:** Display and manage lists of deviations, automations, etc.

**Library:** `@tanstack/react-table`

**Pattern:**

```tsx
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';

function DeviationTable({ data }: { data: Deviation[] }) {
  const columns = [
    { accessorKey: 'title', header: 'Title' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'actualPublishAt', header: 'Publish At' },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Layout Components

### AppLayout

**Purpose:** Main authenticated layout with sidebar and navigation.

**Location:** `apps/isekai-frontend/src/components/layouts/AppLayout.tsx`

**Features:**

- Sidebar navigation
- User avatar with dropdown
- Breadcrumbs
- Mobile responsive

**Usage:**

```tsx
<Route
  element={
    <ProtectedRoute>
      <AppLayout />
    </ProtectedRoute>
  }
>
  <Route path="/browse" element={<Browse />} />
  <Route path="/draft" element={<Draft />} />
</Route>
```

### AuthLayout

**Purpose:** Minimal layout for login/callback pages.

**Location:** `apps/isekai-frontend/src/components/layouts/AuthLayout.tsx`

**Usage:**

```tsx
<Route element={<AuthLayout />}>
  <Route path="/callback" element={<Callback />} />
</Route>
```

---

## Custom Components

### FilePreview

**Purpose:** Display file previews with drag handles.

**Location:** `apps/isekai-frontend/src/components/FilePreview.tsx`

**Features:**

- Image/video preview
- Remove button
- Drag handle (via @dnd-kit)
- Upload progress

**Usage:**

```tsx
<FilePreview file={fileWithPreview} onRemove={() => removeFile(file.id)} />
```

### GallerySelector

**Purpose:** Dropdown to select DeviantArt gallery folders.

**Location:** `apps/isekai-frontend/src/components/GallerySelector.tsx`

**Features:**

- Fetch user galleries via API
- Filter by folder type
- Create new folders

### AutomationCard

**Purpose:** Display automation workflow summary.

**Location:** `apps/isekai-frontend/src/components/AutomationCard.tsx`

**Features:**

- Rule summary (days, times)
- Active/inactive toggle
- Edit/delete actions

---

## Styling Patterns

### Tailwind CSS

**Configuration:** `apps/isekai-frontend/tailwind.config.js`

**Common Patterns:**

```tsx
// Card layout
<Card className="w-full max-w-2xl">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Content */}
  </CardContent>
</Card>

// Button variants
<Button variant="default">Primary</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>

// Grid layout
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards */}
</div>

// Flex layout
<div className="flex items-center justify-between">
  <span>Label</span>
  <Button size="sm">Action</Button>
</div>
```

### CSS Variables

**Location:** `apps/isekai-frontend/src/index.css`

**Theme Variables:**

- `--background` - Page background
- `--foreground` - Text color
- `--primary` - Primary color
- `--secondary` - Secondary color
- `--accent` - Accent color
- `--destructive` - Error/delete color
- `--border` - Border color
- `--radius` - Border radius

---

## Icon Usage (Lucide React)

**Library:** `lucide-react`

**Common Icons:**

```tsx
import { Upload, Calendar, Send, Trash, Edit, Settings, CheckCircle, XCircle } from 'lucide-react';

<Button>
  <Upload className="mr-2 h-4 w-4" />
  Upload Files
</Button>;
```

---

## Toast Notifications

**Hook:** `use-toast.ts`

**Pattern:**

```tsx
import { toast } from '@/hooks/use-toast';

// Success
toast({
  title: 'Success',
  description: 'Deviation uploaded successfully.',
});

// Error
toast({
  title: 'Error',
  description: 'Failed to upload deviation.',
  variant: 'destructive',
});

// With action
toast({
  title: 'Scheduled',
  description: 'Deviation scheduled for tomorrow.',
  action: <Button size="sm">View</Button>,
});
```

---

## Whitelabel Support (v0.1.0-alpha.3+)

**Purpose:** Customizable branding for multi-tenant deployments.

**Features:**

- Custom product name
- Custom logo URL
- Custom favicon URL
- Custom footer text
- Custom support email

**Implementation:** See `.context/ui/state-management.md` for whitelabel store.

---

## Component Best Practices

1. **Use shadcn/ui components** - Don't build custom UI primitives
2. **Tailwind for styling** - Avoid custom CSS files
3. **Responsive design** - Use `md:`, `lg:` breakpoints
4. **Accessible** - Use Radix UI's built-in accessibility
5. **TypeScript strict** - Type all props
6. **AGPL-3.0 license header** - On all new files
7. **Test components** - Use Vitest and React Testing Library

---

## Related Documentation

- `.context/ui/state-management.md` - State management patterns
- `.context/testing.md` - Testing strategies
- `.context/ai-rules.md` - Code style rules
