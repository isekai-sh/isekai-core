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

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { automations } from '@/lib/api';
import { CreateAutomationDialog } from '@/components/CreateAutomationDialog';
import { Plus, Clock, Calendar, ChevronRight, Copy, Trash2, Zap } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { formatNextRunTime } from '@/lib/automation-utils';

export function AutomationList() {
  const { toast } = useToast();
  const [automationList, setAutomationList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deletingAutomation, setDeletingAutomation] = useState<any>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    loadAutomations();
  }, []);

  const loadAutomations = async () => {
    try {
      setLoading(true);
      const { automations: data } = await automations.list();
      setAutomationList(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load automations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: any) => {
    try {
      await automations.create({
        ...data,
        draftSelectionMethod: 'fifo',
        stashOnlyByDefault: false,
        jitterMinSeconds: 0,
        jitterMaxSeconds: 300,
      });

      toast({
        title: 'Success',
        description: 'Workflow created successfully',
      });

      loadAutomations();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create workflow',
        variant: 'destructive',
      });
    }
  };

  const handleToggle = async (automation: any) => {
    if (togglingId) return;

    setTogglingId(automation.id);

    // Optimistic update
    setAutomationList((prev) =>
      prev.map((a) => (a.id === automation.id ? { ...a, enabled: !a.enabled } : a))
    );

    try {
      await automations.toggle(automation.id);
      toast({
        title: automation.enabled ? 'Disabled' : 'Enabled',
        description: `${automation.name} has been ${automation.enabled ? 'disabled' : 'enabled'}`,
      });
    } catch (error: any) {
      // Rollback
      setAutomationList((prev) =>
        prev.map((a) => (a.id === automation.id ? { ...a, enabled: automation.enabled } : a))
      );
      toast({
        title: 'Error',
        description: error.message || 'Failed to toggle automation',
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDuplicate = async (automation: any) => {
    try {
      await automations.create({
        name: `${automation.name} (Copy)`,
        description: automation.description,
        draftSelectionMethod: automation.draftSelectionMethod,
        stashOnlyByDefault: automation.stashOnlyByDefault,
        jitterMinSeconds: automation.jitterMinSeconds,
        jitterMaxSeconds: automation.jitterMaxSeconds,
      });

      toast({
        title: 'Success',
        description: 'Workflow duplicated successfully',
      });

      loadAutomations();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to duplicate workflow',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingAutomation) return;

    try {
      await automations.delete(deletingAutomation.id);

      toast({
        title: 'Success',
        description: 'Workflow deleted successfully',
      });

      setDeletingAutomation(null);
      loadAutomations();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete workflow',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-10 w-48 bg-muted animate-pulse rounded" />
            <div className="h-5 w-64 bg-muted animate-pulse rounded mt-2" />
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-gradient">Automations</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Automate your DeviantArt publishing schedule
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {/* Automations List */}
      {automationList.length === 0 ? (
        <Card>
          <CardContent className="py-16">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No workflows yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create your first automation workflow to automatically schedule and publish your
                drafts based on your preferences.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Workflow
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {automationList.map((automation) => {
                const activeRulesCount =
                  automation._count?.scheduleRules ||
                  automation.scheduleRules?.filter((r: any) => r.enabled).length ||
                  0;
                const defaultValuesCount = automation._count?.defaultValues || 0;

                return (
                  <div
                    key={automation.id}
                    className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                  >
                    {/* Enable/Disable Toggle */}
                    <Switch
                      checked={automation.enabled}
                      onCheckedChange={() => handleToggle(automation)}
                      disabled={togglingId === automation.id}
                      className="shrink-0"
                    />

                    {/* Main Content - Clickable */}
                    <Link
                      to={`/automation/${automation.id}`}
                      className="flex-1 min-w-0 flex items-center gap-4"
                    >
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{automation.name}</h3>
                          <Badge
                            variant={automation.enabled ? 'default' : 'secondary'}
                            className="shrink-0"
                          >
                            {automation.enabled ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        {automation.description && (
                          <p className="text-sm text-muted-foreground truncate mb-2">
                            {automation.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {activeRulesCount} {activeRulesCount === 1 ? 'rule' : 'rules'}
                          </span>
                          {defaultValuesCount > 0 && (
                            <span>
                              {defaultValuesCount} default{defaultValuesCount !== 1 && 's'}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Next: {formatNextRunTime(automation)}
                          </span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </Link>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDuplicate(automation)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeletingAutomation(automation)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <CreateAutomationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={handleCreate}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingAutomation}
        onOpenChange={(open) => !open && setDeletingAutomation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingAutomation?.name}"? This will also delete
              all associated schedule rules, default values, and execution logs. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
