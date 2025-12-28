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

import { LoginForm } from "@/components/login-form";
import { useWhitelabelStore } from "@/stores/whitelabel";

export function Login() {
  const { config: whitelabelConfig } = useWhitelabelStore();

  const productName = whitelabelConfig?.productName || "Isekai";
  const logoUrl = whitelabelConfig?.logoUrl || "/isekai-logo.svg";

  return (
    <div className="relative h-screen w-screen bg-black">
      {/* Background image (10% opacity for darker look) */}
      <img
        src="/featured.jpg"
        alt="Background"
        className="absolute inset-0 h-full w-full object-cover opacity-10"
      />

      {/* Centered content */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-6">
        <div className="mb-8">
          <a href="/" className="flex items-center gap-2">
            <img src={logoUrl} alt={productName} className="h-10 w-auto" />
          </a>
        </div>
        <div className="w-full max-w-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
