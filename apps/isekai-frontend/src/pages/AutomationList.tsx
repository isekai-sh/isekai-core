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
import { useToast } from "@/hooks/use-toast";
import { automations } from "@/lib/api";
import { AutomationCard } from "@/components/AutomationCard";
import { CreateAutomationDialog } from "@/components/CreateAutomationDialog";
import { Zap, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function AutomationList() {
  const { toast } = useToast();
  const [automationList, setAutomationList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deletingAutomation, setDeletingAutomation] = useState<any>(null);

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
        title: "Error",
        description: error.message || "Failed to load automations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data: any) => {
    try {
      await automations.create({
        ...data,
        draftSelectionMethod: "fifo",
        stashOnlyByDefault: false,
        jitterMinSeconds: 0,
        jitterMaxSeconds: 300,
      });

      toast({
        title: "Success",
        description: "Workflow created successfully",
      });

      loadAutomations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create workflow",
        variant: "destructive",
      });
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
        title: "Success",
        description: "Workflow duplicated successfully",
      });

      loadAutomations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate workflow",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingAutomation) return;

    try {
      await automations.delete(deletingAutomation.id);

      toast({
        title: "Success",
        description: "Workflow deleted successfully",
      });

      setDeletingAutomation(null);
      loadAutomations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete workflow",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automation Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your publishing schedules
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {/* Automation Cards Grid */}
      <div className="flex-1 overflow-y-auto pr-2">
        {automationList.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Get Started with Automation</CardTitle>
              <CardDescription>
                Create your first automated workflow to schedule drafts
                automatically based on your preferences.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Workflow
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {automationList.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onDuplicate={handleDuplicate}
                onDelete={setDeletingAutomation}
              />
            ))}

            {/* Create New Card */}
            <Card
              className="border-dashed hover:border-primary transition-colors cursor-pointer"
              onClick={() => setShowCreateDialog(true)}
            >
              <CardContent className="flex flex-col items-center justify-center h-full min-h-[200px] p-6">
                <Plus className="h-8 w-8 text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">Create New Workflow</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Set up a new automated schedule
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

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
              Are you sure you want to delete "{deletingAutomation?.name}"? This
              will also delete all associated schedule rules, default values,
              and execution logs. This action cannot be undone.
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
