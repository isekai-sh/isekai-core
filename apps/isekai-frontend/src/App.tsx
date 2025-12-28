/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { useAuthStore } from "@/stores/auth";
// Import whitelabel store to initialize on app load
import "@/stores/whitelabel";

// Layouts
import { AppLayout } from "@/components/layouts/AppLayout";
import { AuthLayout } from "@/components/layouts/AuthLayout";

// Pages
import { Login } from "@/pages/Login";
import { Callback } from "@/pages/Callback";
import { EditDeviation } from "@/pages/EditDeviation";
import { Draft } from "@/pages/Draft";
import { Scheduled } from "@/pages/Scheduled";
import { Published } from "@/pages/Published";
import { Templates } from "@/pages/Templates";
import { Settings } from "@/pages/Settings";
import { Browse } from "@/pages/Browse";
import { Galleries } from "@/pages/Galleries";
import { GalleryDetail } from "@/pages/GalleryDetail";
import { ApiKeys } from "@/pages/ApiKeys";
import { Review } from "@/pages/Review";
import { AutomationList } from "@/pages/AutomationList";
import { AutomationDetail } from "@/pages/AutomationDetail";
import { ExclusivesQueue } from "@/pages/ExclusivesQueue";

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

function App() {
  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route element={<AuthLayout />}>
          <Route path="/callback" element={<Callback />} />
        </Route>

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
          <Route path="/automation" element={<AutomationList />} />
          <Route path="/automation/:id" element={<AutomationDetail />} />
          <Route path="/deviations/:id" element={<EditDeviation />} />
          {/* Deviations section */}
          <Route path="/draft" element={<Draft />} />
          <Route path="/scheduled" element={<Scheduled />} />
          <Route path="/published" element={<Published />} />
          {/* Redirect old routes */}
          <Route path="/schedule" element={<Navigate to="/draft" replace />} />
          <Route path="/queue" element={<Navigate to="/scheduled" replace />} />
          <Route
            path="/history"
            element={<Navigate to="/published" replace />}
          />
          {/* Templates section */}
          <Route path="/templates" element={<Templates />} />
          {/* Exclusives section */}
          <Route path="/exclusives-queue" element={<ExclusivesQueue />} />
          {/* Redirect old routes */}
          <Route path="/price-presets" element={<Navigate to="/exclusives-queue" replace />} />
          <Route path="/sale-queue" element={<Navigate to="/exclusives-queue" replace />} />
          {/* Other routes */}
          <Route path="/settings" element={<Settings />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/galleries" element={<Galleries />} />
          <Route path="/galleries/:id" element={<GalleryDetail />} />
          {/* Redirect old activity route */}
          <Route
            path="/activity"
            element={<Navigate to="/published" replace />}
          />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
