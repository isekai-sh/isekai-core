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

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuthStore } from "@/stores/auth";
import { admin, type InstanceUser, type InstanceInfo } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Users, Server, HardDrive, Settings as SettingsIcon, User } from "lucide-react";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

type SettingsTab = "account" | "instance" | "team";

const tabs = [
  { id: "account" as const, label: "Account", icon: User },
  { id: "instance" as const, label: "Instance", icon: Server, adminOnly: true },
  { id: "team" as const, label: "Team", icon: Users, adminOnly: true },
];

export function Settings() {
  const { user, isAdmin } = useAuthStore();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [teamMembers, setTeamMembers] = useState<InstanceUser[]>([]);
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfo | null>(null);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [isLoadingInstance, setIsLoadingInstance] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [teamInvitesEnabled, setTeamInvitesEnabled] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const tab = (searchParams.get("tab") as SettingsTab) || "account";

  const setTab = (newTab: SettingsTab) => {
    setSearchParams({ tab: newTab });
  };

  // Fetch team members, instance info, and settings if admin
  useEffect(() => {
    if (isAdmin) {
      if (tab === "team") {
        fetchTeamMembers();
      }
      if (tab === "instance") {
        fetchInstanceInfo();
        fetchSettings();
      }
    }
  }, [isAdmin, tab]);

  async function fetchSettings() {
    try {
      const settings = await admin.getSettings();
      setTeamInvitesEnabled(settings.teamInvitesEnabled);
    } catch (error) {
      // Settings fetch failure is non-critical, just use default
    }
  }

  async function handleTeamInvitesToggle(enabled: boolean) {
    setIsUpdatingSettings(true);
    try {
      const settings = await admin.updateSettings({ teamInvitesEnabled: enabled });
      setTeamInvitesEnabled(settings.teamInvitesEnabled);
      // Also refresh instance info to update the displayed status
      await fetchInstanceInfo();
      toast({
        title: "Settings Updated",
        description: enabled
          ? "Team invites are now enabled. New users can join."
          : "Team invites are now disabled. New users cannot join.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingSettings(false);
    }
  }

  async function fetchTeamMembers() {
    setIsLoadingTeam(true);
    try {
      const response = await admin.getTeam();
      setTeamMembers(response.users);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load team members",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTeam(false);
    }
  }

  async function fetchInstanceInfo() {
    setIsLoadingInstance(true);
    try {
      const response = await admin.getInstance();
      setInstanceInfo(response);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load instance info",
        variant: "destructive",
      });
    } finally {
      setIsLoadingInstance(false);
    }
  }

  async function handleRemoveMember(memberId: string, username: string) {
    setRemovingMemberId(memberId);
    try {
      const result = await admin.removeTeamMember(memberId);
      toast({
        title: "Member Removed",
        description: `${username} has been removed. ${result.cleanup?.jobsCancelled || 0} jobs cancelled, ${result.cleanup?.filesQueued || 0} files queued for cleanup.`,
      });
      // Refresh the team list
      await fetchTeamMembers();
      await fetchInstanceInfo();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove team member",
        variant: "destructive",
      });
    } finally {
      setRemovingMemberId(null);
    }
  }

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">
          <span className="text-gradient">Settings</span>
        </h1>
        <p className="text-lg text-muted-foreground">
          Manage your account, instance, and team preferences
        </p>
      </div>

      {/* Content with Sidebar */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Sidebar Navigation */}
        <nav className="w-48 flex-shrink-0 space-y-1">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-left",
                  tab === t.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Main Content */}
        <div className="flex-1 min-w-0 overflow-auto">
          {tab === "account" && (
            <Card className="rounded-lg border-border/50">
              <CardHeader>
                <CardTitle>Connected Account</CardTitle>
                <CardDescription>Your connected DeviantArt account</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.username}
                      className="h-20 w-20 rounded-full ring-2 ring-primary/20"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                      <span className="text-3xl font-medium text-primary">
                        {user?.username?.[0]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-bold">{user?.username}</p>
                      {isAdmin && (
                        <Badge className="bg-primary/10 text-primary border-primary/20">
                          Admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      DeviantArt ID: {user?.deviantartId}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === "instance" && isAdmin && (
            <div className="space-y-6">
              {/* Instance Info */}
              <Card className="rounded-lg border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    Instance Information
                  </CardTitle>
                  <CardDescription>Your instance configuration and usage</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingInstance ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : instanceInfo ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg space-y-1">
                        <p className="text-sm text-muted-foreground">Plan</p>
                        <p className="text-2xl font-bold capitalize">
                          {instanceInfo.tier}
                        </p>
                      </div>
                      <div className="p-4 bg-card border border-border/50 rounded-lg space-y-1">
                        <p className="text-sm text-muted-foreground">DA Accounts</p>
                        <p className="text-2xl font-bold">
                          {instanceInfo.limits.currentDaAccounts}
                          {!instanceInfo.limits.unlimited && (
                            <span className="text-base text-muted-foreground font-normal">
                              {" "}/ {instanceInfo.limits.maxDaAccounts}
                            </span>
                          )}
                          {instanceInfo.limits.unlimited && (
                            <span className="text-base text-muted-foreground font-normal"> (unlimited)</span>
                          )}
                        </p>
                      </div>
                      <div className="p-4 bg-card border border-border/50 rounded-lg space-y-1">
                        <p className="text-sm text-muted-foreground">Team Members</p>
                        <p className="text-2xl font-bold">{instanceInfo.stats.teamMembers}</p>
                      </div>
                      <div className="p-4 bg-card border border-border/50 rounded-lg space-y-1">
                        <p className="text-sm text-muted-foreground">Deviations</p>
                        <p className="text-2xl font-bold">{instanceInfo.stats.deviations}</p>
                      </div>
                      <div className="p-4 bg-card border border-border/50 rounded-lg space-y-1">
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <HardDrive className="h-4 w-4" />
                          Storage Used
                        </p>
                        <p className="text-2xl font-bold">
                          {formatBytes(instanceInfo.stats.storageUsedBytes)}
                        </p>
                      </div>
                      <div className="p-4 bg-card border border-border/50 rounded-lg space-y-1">
                        <p className="text-sm text-muted-foreground">Team Invites</p>
                        <div className="pt-1">
                          {instanceInfo.settings.teamInvitesEnabled ? (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                              Enabled
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Failed to load instance info</p>
                  )}
                </CardContent>
              </Card>

              {/* Instance Settings */}
              <Card className="rounded-lg border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SettingsIcon className="h-5 w-5" />
                    Instance Settings
                  </CardTitle>
                  <CardDescription>Configure your instance settings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 bg-card border border-border/50 rounded-lg">
                    <div className="space-y-1">
                      <Label htmlFor="team-invites" className="text-base font-medium">
                        Team Invites
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Allow new users to join this instance via DeviantArt OAuth
                      </p>
                    </div>
                    <Switch
                      id="team-invites"
                      checked={teamInvitesEnabled}
                      onCheckedChange={handleTeamInvitesToggle}
                      disabled={isUpdatingSettings}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "team" && isAdmin && (
            <Card className="rounded-lg border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Members
                </CardTitle>
                <CardDescription>
                  Manage who has access to this instance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingTeam ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No team members found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {teamMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-4 bg-card border border-border/50 rounded-lg hover:border-primary/20 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {member.daAvatar ? (
                            <img
                              src={member.daAvatar}
                              alt={member.daUsername}
                              className="h-12 w-12 rounded-full ring-2 ring-border/50"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-border/50">
                              <span className="text-lg font-medium text-primary">
                                {member.daUsername[0]?.toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold">{member.daUsername}</p>
                              <Badge
                                variant={member.role === "admin" ? "default" : "secondary"}
                                className={member.role === "admin" ? "bg-primary/10 text-primary border-primary/20" : ""}
                              >
                                {member.role}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Joined {new Date(member.createdAt).toLocaleDateString()}
                              {member.lastLoginAt && (
                                <> · Last login {new Date(member.lastLoginAt).toLocaleDateString()}</>
                              )}
                            </p>
                          </div>
                        </div>
                        {member.role !== "admin" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={removingMemberId === member.id}
                              >
                                {removingMemberId === member.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove <strong>{member.daUsername}</strong>?
                                  This will cancel all their pending jobs, queue their files for deletion,
                                  and remove all their data from this instance. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveMember(member.id, member.daUsername)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove Member
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
