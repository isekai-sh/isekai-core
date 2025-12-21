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
import { useParams, Link } from "react-router-dom";
import { useDebouncedCallback } from "use-debounce";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  automations,
  automationScheduleRules,
  automationDefaultValues,
  pricePresets,
} from "@/lib/api";
import { DefaultValuesList } from "@/components/DefaultValuesList";
import { AddDefaultValueDialog } from "@/components/AddDefaultValueDialog";
import {
  ChevronLeft,
  Zap,
  Plus,
  Trash2,
  Edit,
  Play,
  Clock,
  Calendar as CalendarIcon,
  TrendingUp,
  Info,
} from "lucide-react";

export function AutomationDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [automation, setAutomation] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [defaultValues, setDefaultValues] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [pricePresetsList, setPricePresetsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [showDefaultDialog, setShowDefaultDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);

  // Loading states for mutations
  const [isToggling, setIsToggling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [deletingDefaultId, setDeletingDefaultId] = useState<string | null>(
    null
  );

  // Confirmation dialog states
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
  const [defaultToDelete, setDefaultToDelete] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState<
    "fixed_time" | "fixed_interval" | "daily_quota"
  >("fixed_time");
  const [ruleData, setRuleData] = useState({
    timeOfDay: "09:00",
    intervalMinutes: 360,
    deviationsPerInterval: 1,
    dailyQuota: 3,
    daysOfWeek: [] as string[],
    priority: 0,
    enabled: true,
  });

  // Local state for jitter inputs (for immediate UI feedback)
  const [localJitterMin, setLocalJitterMin] = useState<number | string>("");
  const [localJitterMax, setLocalJitterMax] = useState<number | string>("");

  useEffect(() => {
    if (id) {
      loadAutomation();
    }
  }, [id]);

  // Sync local state when automation loads
  useEffect(() => {
    if (automation) {
      setLocalJitterMin(automation.jitterMinSeconds ?? 0);
      setLocalJitterMax(automation.jitterMaxSeconds ?? 0);
    }
  }, [automation?.jitterMinSeconds, automation?.jitterMaxSeconds]);

  // Auto-refresh logs every 30 seconds
  useEffect(() => {
    if (!id || !automation) return;

    const refreshLogs = async () => {
      try {
        const logsData = await automations.getLogs(id, { limit: 10 });
        setLogs(logsData.logs);
      } catch (error) {
        // Silently fail - don't show toast for background refresh errors
        console.error("Failed to refresh logs:", error);
      }
    };

    // Set up interval for auto-refresh
    const intervalId = setInterval(refreshLogs, 30000); // 30 seconds

    // Cleanup on unmount
    return () => clearInterval(intervalId);
  }, [id, automation]);

  const loadAutomation = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const [autoData, rulesData, valuesData, presetsData] = await Promise.all([
        automations.get(id),
        automationScheduleRules.list(id),
        automationDefaultValues.list(id),
        pricePresets.list(),
      ]);

      setAutomation(autoData.automation);
      setRules(rulesData.rules);
      setDefaultValues(valuesData.values);
      setPricePresetsList(presetsData.presets);

      const logsData = await automations.getLogs(id, { limit: 10 });
      setLogs(logsData.logs);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load automation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleAutomation = async () => {
    if (!automation || isToggling) return;

    setIsToggling(true);

    // Optimistic update
    const previousState = automation;
    const optimisticState = { ...automation, enabled: !automation.enabled };
    setAutomation(optimisticState);

    try {
      const { automation: updated } = await automations.toggle(automation.id);
      setAutomation(updated);
      toast({
        title: "Success",
        description: updated.enabled
          ? "Automation enabled"
          : "Automation disabled",
      });
    } catch (error: any) {
      // Rollback on error
      setAutomation(previousState);
      toast({
        title: "Error",
        description: error.message || "Failed to toggle automation",
        variant: "destructive",
      });
    } finally {
      setIsToggling(false);
    }
  };

  const testAutomation = async () => {
    if (!automation || isTesting) return;

    setIsTesting(true);

    try {
      const result = await automations.test(automation.id);
      toast({
        title: "Test Successful",
        description: result.message,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Test failed",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const updateSettings = async (updates: any) => {
    if (!automation) return;

    // Optimistic update
    const previousState = automation;
    const optimisticState = { ...automation, ...updates };
    setAutomation(optimisticState);

    try {
      const { automation: updated } = await automations.update(
        automation.id,
        updates
      );
      setAutomation(updated);
      toast({
        title: "Success",
        description: "Settings updated successfully",
      });
    } catch (error: any) {
      // Rollback on error
      setAutomation(previousState);
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    }
  };

  // Debounced version for text inputs (500ms delay)
  const debouncedUpdateSettings = useDebouncedCallback((updates: any) => {
    updateSettings(updates);
  }, 500);

  const openRuleDialog = (rule?: any) => {
    if (rule) {
      setEditingRule(rule);
      setRuleType(rule.type);
      setRuleData({
        timeOfDay: rule.timeOfDay || "09:00",
        intervalMinutes: rule.intervalMinutes || 360,
        deviationsPerInterval: rule.deviationsPerInterval || 1,
        dailyQuota: rule.dailyQuota || 3,
        daysOfWeek: rule.daysOfWeek || [],
        priority: rule.priority || 0,
        enabled: rule.enabled !== false,
      });
    } else {
      setEditingRule(null);
      setRuleType("fixed_time");
      setRuleData({
        timeOfDay: "09:00",
        intervalMinutes: 360,
        deviationsPerInterval: 1,
        dailyQuota: 3,
        daysOfWeek: [],
        priority: 0,
        enabled: true,
      });
    }
    setShowRuleDialog(true);
  };

  const saveRule = async () => {
    if (!id || isSavingRule) return;

    setIsSavingRule(true);

    try {
      const payload: any = {
        type: ruleType,
        priority: ruleData.priority,
        enabled: ruleData.enabled,
        daysOfWeek:
          ruleData.daysOfWeek.length > 0 ? ruleData.daysOfWeek : undefined,
      };

      if (ruleType === "fixed_time") {
        payload.timeOfDay = ruleData.timeOfDay;
      } else if (ruleType === "fixed_interval") {
        payload.intervalMinutes = ruleData.intervalMinutes;
        payload.deviationsPerInterval = ruleData.deviationsPerInterval;
      } else if (ruleType === "daily_quota") {
        payload.dailyQuota = ruleData.dailyQuota;
      }

      if (editingRule) {
        await automationScheduleRules.update(editingRule.id, payload);
        toast({
          title: "Success",
          description: "Rule updated successfully",
        });
      } else {
        await automationScheduleRules.create(id, payload);
        toast({
          title: "Success",
          description: "Rule created successfully",
        });
      }

      setShowRuleDialog(false);
      loadAutomation();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save rule",
        variant: "destructive",
      });
    } finally {
      setIsSavingRule(false);
    }
  };

  const confirmDeleteRule = async () => {
    if (!ruleToDelete || deletingRuleId) return;

    setDeletingRuleId(ruleToDelete);

    // Optimistic update
    const previousRules = rules;
    setRules(rules.filter((r) => r.id !== ruleToDelete));

    try {
      await automationScheduleRules.delete(ruleToDelete);
      toast({
        title: "Success",
        description: "Rule deleted successfully",
      });
      // Reload to ensure consistency
      loadAutomation();
    } catch (error: any) {
      // Rollback on error
      setRules(previousRules);
      toast({
        title: "Error",
        description: error.message || "Failed to delete rule",
        variant: "destructive",
      });
    } finally {
      setDeletingRuleId(null);
      setRuleToDelete(null);
    }
  };

  const toggleDay = (day: string) => {
    setRuleData((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [...prev.daysOfWeek, day],
    }));
  };

  const createDefaultValue = async (data: {
    fieldName: string;
    value: any;
    applyIfEmpty: boolean;
  }) => {
    if (!id) return;

    try {
      await automationDefaultValues.create(id, data);
      toast({
        title: "Success",
        description: "Default value added successfully",
      });
      loadAutomation();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add default value",
        variant: "destructive",
      });
      throw error;
    }
  };

  const confirmDeleteDefaultValue = async () => {
    if (!defaultToDelete || deletingDefaultId) return;

    setDeletingDefaultId(defaultToDelete);

    // Optimistic update
    const previousValues = defaultValues;
    setDefaultValues(defaultValues.filter((v) => v.id !== defaultToDelete));

    try {
      await automationDefaultValues.delete(defaultToDelete);
      toast({
        title: "Success",
        description: "Default value deleted successfully",
      });
      // Reload to ensure consistency
      loadAutomation();
    } catch (error: any) {
      // Rollback on error
      setDefaultValues(previousValues);
      toast({
        title: "Error",
        description: error.message || "Failed to delete default value",
        variant: "destructive",
      });
    } finally {
      setDeletingDefaultId(null);
      setDefaultToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column Skeleton */}
          <div className="lg:col-span-2 space-y-6">
            {/* Schedule Rules Card */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-64 mt-2" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>

            {/* Default Values Card */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          </div>

          {/* Right Column Skeleton */}
          <div className="space-y-3">
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="space-y-6">
        <Link
          to="/automation"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Workflows
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Workflow Not Found</CardTitle>
            <CardDescription>
              The automation workflow you're looking for doesn't exist or you
              don't have access to it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/automation">
              <Button>Go to Workflows</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Breadcrumb */}
      <Link
        to="/automation"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Workflows
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{automation.name}</h1>
          {automation.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {automation.description}
            </p>
          )}
        </div>
        <Badge variant={automation.enabled ? "default" : "secondary"}>
          {automation.enabled ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Multi-column Layout */}
      <div className="flex-1 grid grid-cols-3 gap-3 overflow-y-auto pr-2">
        {/* Column 1: Controls + Settings */}
        <div className="space-y-3">
          {/* Controls */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Enable</Label>
                <Switch
                  checked={automation.enabled}
                  onCheckedChange={toggleAutomation}
                  disabled={isToggling}
                />
              </div>
              <Button
                onClick={testAutomation}
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isTesting}
              >
                <Play className="h-4 w-4 mr-2" />
                {isTesting ? "Testing..." : "Test"}
              </Button>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm">Draft Selection</Label>
                <Select
                  value={automation.draftSelectionMethod}
                  onValueChange={(value) =>
                    updateSettings({ draftSelectionMethod: value })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fifo">Oldest first</SelectItem>
                    <SelectItem value="lifo">Newest first</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm">Sta.sh only</Label>
                <Switch
                  checked={automation.stashOnlyByDefault}
                  onCheckedChange={(checked) =>
                    updateSettings({ stashOnlyByDefault: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Delay (sec)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    className="h-9"
                    min={0}
                    max={3600}
                    value={localJitterMin}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLocalJitterMin(value); // Update UI immediately

                      const numValue = parseInt(value);
                      if (
                        !isNaN(numValue) &&
                        numValue >= 0 &&
                        numValue <= 3600
                      ) {
                        debouncedUpdateSettings({ jitterMinSeconds: numValue });
                      }
                    }}
                    onBlur={(e) => {
                      const value = parseInt(e.target.value);
                      let clampedValue = 0;

                      if (isNaN(value) || value < 0) {
                        clampedValue = 0;
                      } else if (value > 3600) {
                        clampedValue = 3600;
                      } else {
                        clampedValue = value;
                      }

                      setLocalJitterMin(clampedValue);
                      debouncedUpdateSettings.flush(); // Flush any pending debounced calls
                      updateSettings({ jitterMinSeconds: clampedValue });
                    }}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    className="h-9"
                    min={0}
                    max={3600}
                    value={localJitterMax}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLocalJitterMax(value); // Update UI immediately

                      const numValue = parseInt(value);
                      if (
                        !isNaN(numValue) &&
                        numValue >= 0 &&
                        numValue <= 3600
                      ) {
                        debouncedUpdateSettings({ jitterMaxSeconds: numValue });
                      }
                    }}
                    onBlur={(e) => {
                      const value = parseInt(e.target.value);
                      let clampedValue = 0;

                      if (isNaN(value) || value < 0) {
                        clampedValue = 0;
                      } else if (value > 3600) {
                        clampedValue = 3600;
                      } else {
                        clampedValue = value;
                      }

                      setLocalJitterMax(clampedValue);
                      debouncedUpdateSettings.flush(); // Flush any pending debounced calls
                      updateSettings({ jitterMaxSeconds: clampedValue });
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Column 2: Schedule Rules */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">When to Post</CardTitle>
                <Button onClick={() => openRuleDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rules yet</p>
              ) : (
                <div className="space-y-2">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-3 border rounded text-sm"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {rule.type === "fixed_time" && `${rule.timeOfDay}`}
                            {rule.type === "fixed_interval" &&
                              `Every ${rule.intervalMinutes}min (${rule.deviationsPerInterval}×)`}
                            {rule.type === "daily_quota" &&
                              `${rule.dailyQuota}/day`}
                          </span>
                          {!rule.enabled && (
                            <Badge variant="secondary" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        {rule.daysOfWeek && rule.daysOfWeek.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {rule.daysOfWeek
                              .map((d: string) => d.charAt(0).toUpperCase() + d.slice(1, 3))
                              .join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openRuleDialog(rule)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRuleToDelete(rule.id)}
                          disabled={deletingRuleId === rule.id}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Column 3: Default Values + Activity */}
        <div className="space-y-3">
          {/* Default Values */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Default Values</CardTitle>
                <Button onClick={() => setShowDefaultDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DefaultValuesList
                values={defaultValues}
                onDelete={setDefaultToDelete}
                deletingId={deletingDefaultId}
              />
            </CardContent>
          </Card>

          {/* Sale Queue Settings */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Exclusive Sales</CardTitle>
                  <CardDescription className="text-xs">
                    Automatically add published posts to sale queue
                  </CardDescription>
                </div>
                <Switch
                  checked={automation?.autoAddToSaleQueue || false}
                  onCheckedChange={(checked) => {
                    // Prevent enabling if no price preset is selected
                    if (checked && !automation?.saleQueuePresetId) {
                      toast({
                        title: "Price Preset Required",
                        description:
                          "Please select a price preset before enabling exclusive sales",
                        variant: "destructive",
                      });
                      return;
                    }
                    updateSettings({ autoAddToSaleQueue: checked });
                  }}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Price Preset Selector - Always visible */}
                <div className="space-y-2">
                  <Label className="text-sm">
                    Price Preset{" "}
                    {!automation?.autoAddToSaleQueue && (
                      <span className="text-muted-foreground">
                        (Required to enable)
                      </span>
                    )}
                  </Label>
                  <Select
                    value={automation?.saleQueuePresetId || ""}
                    onValueChange={(value) =>
                      updateSettings({ saleQueuePresetId: value })
                    }
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Select a price preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {pricePresetsList.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          <div className="flex items-center gap-2">
                            <span>{preset.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {preset.minPrice && preset.maxPrice
                                ? `$${(preset.minPrice / 100).toFixed(2)} - $${(
                                    preset.maxPrice / 100
                                  ).toFixed(2)}`
                                : `$${(preset.price / 100).toFixed(2)}`}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select which price preset to use for exclusive sales
                  </p>
                </div>

                {automation?.autoAddToSaleQueue && (
                  <>
                    {/* Protection Notice */}
                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <div className="flex gap-2">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                            Protection Defaults Applied
                          </p>
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            When sale queue is enabled, the following settings
                            are automatically enforced:
                          </p>
                          <ul className="text-xs text-blue-700 dark:text-blue-300 list-disc list-inside space-y-0.5 mt-1">
                            <li>
                              Display Resolution: 1920px (highest quality with
                              watermark)
                            </li>
                            <li>Add Watermark: Enabled</li>
                            <li>Allow Free Download: Disabled</li>
                          </ul>
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            These overrides ensure your exclusive content is
                            protected from unauthorized downloads.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Current Preset Details */}
                    {automation.saleQueuePreset && (
                      <div className="bg-muted rounded-lg p-2">
                        <p className="text-xs font-medium">Selected Preset</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {automation.saleQueuePreset.name}
                        </p>
                        {automation.saleQueuePreset.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {automation.saleQueuePreset.description}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="p-2 border rounded text-sm">
                      <p className="font-medium">
                        {log.scheduledCount}{" "}
                        {log.scheduledCount === 1 ? "post" : "posts"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.executedAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedule Rule Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit Schedule Rule" : "Add Schedule Rule"}
            </DialogTitle>
            <DialogDescription>
              Set up when you want to automatically post your drafts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select
                value={ruleType}
                onValueChange={(value: any) => setRuleType(value)}
                disabled={!!editingRule}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_time">
                    Post at specific time
                  </SelectItem>
                  <SelectItem value="fixed_interval">
                    Post every X hours
                  </SelectItem>
                  <SelectItem value="daily_quota">Posts per day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ruleType === "fixed_time" && (
              <div className="space-y-2">
                <Label>Time of Day</Label>
                <Input
                  type="time"
                  value={ruleData.timeOfDay}
                  onChange={(e) =>
                    setRuleData({ ...ruleData, timeOfDay: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Post one item at this time each day
                </p>
              </div>
            )}

            {ruleType === "fixed_interval" && (
              <>
                <div className="space-y-2">
                  <Label>Post every X minutes</Label>
                  <Input
                    type="number"
                    min={5}
                    max={10080}
                    value={ruleData.intervalMinutes}
                    onChange={(e) =>
                      setRuleData({
                        ...ruleData,
                        intervalMinutes: parseInt(e.target.value),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    How often to post (5 minutes to 7 days)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Posts per interval</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={ruleData.deviationsPerInterval}
                    onChange={(e) =>
                      setRuleData({
                        ...ruleData,
                        deviationsPerInterval: parseInt(e.target.value),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    How many items to post each time
                  </p>
                </div>
              </>
            )}

            {ruleType === "daily_quota" && (
              <div className="space-y-2">
                <Label>Posts per day</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={ruleData.dailyQuota}
                  onChange={(e) =>
                    setRuleData({
                      ...ruleData,
                      dailyQuota: parseInt(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Total posts to schedule per day (spread automatically
                  throughout the day)
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Days of Week (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  "monday",
                  "tuesday",
                  "wednesday",
                  "thursday",
                  "friday",
                  "saturday",
                  "sunday",
                ].map((day) => (
                  <div key={day} className="flex items-center space-x-2">
                    <Checkbox
                      id={day}
                      checked={ruleData.daysOfWeek.includes(day)}
                      onCheckedChange={() => toggleDay(day)}
                    />
                    <Label
                      htmlFor={day}
                      className="text-sm capitalize cursor-pointer"
                    >
                      {day.slice(0, 3)}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to run every day
              </p>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Input
                type="number"
                value={ruleData.priority}
                onChange={(e) =>
                  setRuleData({
                    ...ruleData,
                    priority: parseInt(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers run first (0 is highest priority)
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enabled</Label>
                <p className="text-xs text-muted-foreground">Rule is active</p>
              </div>
              <Switch
                checked={ruleData.enabled}
                onCheckedChange={(checked) =>
                  setRuleData({ ...ruleData, enabled: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRuleDialog(false)}
              disabled={isSavingRule}
            >
              Cancel
            </Button>
            <Button onClick={saveRule} disabled={isSavingRule}>
              {isSavingRule ? "Saving..." : editingRule ? "Update" : "Create"}{" "}
              Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Default Value Dialog */}
      <AddDefaultValueDialog
        open={showDefaultDialog}
        onOpenChange={setShowDefaultDialog}
        onSubmit={createDefaultValue}
        existingFields={defaultValues.map((dv) => dv.fieldName)}
      />

      {/* Delete Rule Confirmation */}
      <AlertDialog
        open={!!ruleToDelete}
        onOpenChange={(open) => !open && setRuleToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this schedule rule. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingRuleId}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRule}
              disabled={!!deletingRuleId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingRuleId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Default Value Confirmation */}
      <AlertDialog
        open={!!defaultToDelete}
        onOpenChange={(open) => !open && setDefaultToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Default Value?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this default value. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingDefaultId}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDefaultValue}
              disabled={!!deletingDefaultId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingDefaultId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
