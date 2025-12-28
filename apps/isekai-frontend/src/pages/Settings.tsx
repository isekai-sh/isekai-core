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
import { Loader2, Trash2, Users, Server, HardDrive, Settings as SettingsIcon } from "lucide-react";
import { PageWrapper, PageHeader, PageContent } from "@/components/ui/page-wrapper";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function Settings() {
  const { user, isAdmin } = useAuthStore();
  const { toast } = useToast();
  const [teamMembers, setTeamMembers] = useState<InstanceUser[]>([]);
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfo | null>(null);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [isLoadingInstance, setIsLoadingInstance] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [teamInvitesEnabled, setTeamInvitesEnabled] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // Fetch team members, instance info, and settings if admin
  useEffect(() => {
    if (isAdmin) {
      fetchTeamMembers();
      fetchInstanceInfo();
      fetchSettings();
    }
  }, [isAdmin]);

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

  return (
    <PageWrapper className="gap-6">
      <PageHeader>
        <h1 className="text-3xl font-bold">Settings</h1>
      </PageHeader>

      <PageContent className="space-y-6">
      {/* Connected Account */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Account</CardTitle>
          <CardDescription>Your connected DeviantArt account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="h-16 w-16 rounded-full"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <span className="text-2xl font-medium">
                  {user?.username?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-medium">{user?.username}</p>
                {isAdmin && (
                  <Badge variant="secondary">Admin</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                DeviantArt ID: {user?.deviantartId}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin Section - Only visible to admins */}
      {isAdmin && (
        <>
          {/* Instance Info */}
          <Card>
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
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <p className="text-lg font-medium capitalize">
                      {instanceInfo.tier}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">DA Accounts</p>
                    <p className="text-lg font-medium">
                      {instanceInfo.limits.currentDaAccounts}
                      {!instanceInfo.limits.unlimited && (
                        <span className="text-muted-foreground">
                          {" "}/ {instanceInfo.limits.maxDaAccounts}
                        </span>
                      )}
                      {instanceInfo.limits.unlimited && (
                        <span className="text-muted-foreground"> (unlimited)</span>
                      )}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Team Members</p>
                    <p className="text-lg font-medium">{instanceInfo.stats.teamMembers}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Deviations</p>
                    <p className="text-lg font-medium">{instanceInfo.stats.deviations}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-4 w-4" />
                      Storage Used
                    </p>
                    <p className="text-lg font-medium">
                      {formatBytes(instanceInfo.stats.storageUsedBytes)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Team Invites</p>
                    <p className="text-lg font-medium">
                      {instanceInfo.settings.teamInvitesEnabled ? (
                        <Badge variant="default">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Failed to load instance info</p>
              )}
            </CardContent>
          </Card>

          {/* Instance Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Instance Settings
              </CardTitle>
              <CardDescription>Configure your instance settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="team-invites">Team Invites</Label>
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

          {/* Team Members */}
          <Card>
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
                <p className="text-muted-foreground">No team members found</p>
              ) : (
                <div className="space-y-4">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        {member.daAvatar ? (
                          <img
                            src={member.daAvatar}
                            alt={member.daUsername}
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-sm font-medium">
                              {member.daUsername[0]?.toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{member.daUsername}</p>
                            <Badge
                              variant={member.role === "admin" ? "default" : "secondary"}
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
                                <Trash2 className="h-4 w-4 text-destructive" />
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
        </>
      )}
      </PageContent>
    </PageWrapper>
  );
}
