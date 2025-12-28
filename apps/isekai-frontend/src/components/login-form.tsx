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

import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { auth } from "@/lib/api";

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  account_limit_reached: {
    title: "Account Limit Reached",
    description: "This instance has reached its maximum number of DeviantArt accounts. Please contact the administrator.",
  },
  team_invites_disabled: {
    title: "Team Invites Disabled",
    description: "New team members are not currently being accepted. Please contact the administrator for access.",
  },
  oauth_failed: {
    title: "Authentication Failed",
    description: "Failed to connect with DeviantArt. Please try again.",
  },
  session_failed: {
    title: "Session Error",
    description: "Failed to create a session. Please try again.",
  },
  missing_code: {
    title: "Authentication Error",
    description: "Missing authorization code from DeviantArt. Please try again.",
  },
};

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const errorInfo = error ? ERROR_MESSAGES[error] : null;

  const handleLogin = () => {
    window.location.href = auth.getDeviantArtAuthUrl();
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {errorInfo && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{errorInfo.title}</AlertTitle>
          <AlertDescription>{errorInfo.description}</AlertDescription>
        </Alert>
      )}
      {error && !errorInfo && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            An unexpected error occurred: {error}
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader className="text-center">
          <CardDescription>
            Connect your DeviantArt account to start managing your deviations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <Button onClick={handleLogin} className="w-full" size="lg">
              <img
                src="/deviantart.svg"
                alt="DeviantArt"
                className="mr-2 h-5 w-5"
              />
              Continue with DeviantArt
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
