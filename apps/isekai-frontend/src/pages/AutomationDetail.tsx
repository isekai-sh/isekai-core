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
  Plus,
  Trash2,
  Edit,
  Play,
  Info,
  Clock,
  Calendar,
  Repeat,
  Target,
  Check,
  X,
  Pencil,
  ShieldCheck,
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

  // Rename state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");

  // Loading states for mutations
  const [isToggling, setIsToggling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [deletingDefaultId, setDeletingDefaultId] = useState<string | null>(null);

  // Confirmation dialog states
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
  const [defaultToDelete, setDefaultToDelete] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState<"fixed_time" | "fixed_interval" | "daily_quota">("fixed_time");
  const [ruleData, setRuleData] = useState({
    timeOfDay: "09:00",
    intervalMinutes: 360,
    deviationsPerInterval: 1,
    dailyQuota: 3,
    daysOfWeek: [] as string[],
    priority: 0,
    enabled: true,
  });

  // Local state for jitter inputs
  const [localJitterMin, setLocalJitterMin] = useState<number | string>("");
  const [localJitterMax, setLocalJitterMax] = useState<number | string>("");

  useEffect(() => {
    if (id) {
      loadAutomation();
    }
  }, [id]);

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
        console.error("Failed to refresh logs:", error);
      }
    };

    const intervalId = setInterval(refreshLogs, 30000);
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
    const previousState = automation;
    setAutomation({ ...automation, enabled: !automation.enabled });

    try {
      const { automation: updated } = await automations.toggle(automation.id);
      setAutomation(updated);
      toast({
        title: updated.enabled ? "Enabled" : "Disabled",
        description: `Workflow is now ${updated.enabled ? "active" : "inactive"}`,
      });
    } catch (error: any) {
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

    const previousState = automation;
    setAutomation({ ...automation, ...updates });

    try {
      const { automation: updated } = await automations.update(automation.id, updates);
      setAutomation(updated);
    } catch (error: any) {
      setAutomation(previousState);
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    }
  };

  const debouncedUpdateSettings = useDebouncedCallback((updates: any) => {
    updateSettings(updates);
  }, 500);

  const startEditingName = () => {
    setEditName(automation?.name || "");
    setIsEditingName(true);
  };

  const cancelEditingName = () => {
    setIsEditingName(false);
    setEditName("");
  };

  const saveNewName = async () => {
    if (!automation || isSavingName) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      toast({
        title: "Error",
        description: "Name cannot be empty",
        variant: "destructive",
      });
      return;
    }
    if (trimmedName === automation.name) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);
    try {
      const { automation: updated } = await automations.update(automation.id, { name: trimmedName });
      setAutomation(updated);
      setIsEditingName(false);
      toast({ title: "Renamed", description: "Workflow renamed successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to rename workflow",
        variant: "destructive",
      });
    } finally {
      setIsSavingName(false);
    }
  };

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
        daysOfWeek: ruleData.daysOfWeek.length > 0 ? ruleData.daysOfWeek : undefined,
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
        toast({ title: "Updated", description: "Rule updated successfully" });
      } else {
        await automationScheduleRules.create(id, payload);
        toast({ title: "Created", description: "Rule created successfully" });
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
    const previousRules = rules;
    setRules(rules.filter((r) => r.id !== ruleToDelete));

    try {
      await automationScheduleRules.delete(ruleToDelete);
      toast({ title: "Deleted", description: "Rule deleted successfully" });
      loadAutomation();
    } catch (error: any) {
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
      toast({ title: "Added", description: "Default value added successfully" });
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
    const previousValues = defaultValues;
    setDefaultValues(defaultValues.filter((v) => v.id !== defaultToDelete));

    try {
      await automationDefaultValues.delete(defaultToDelete);
      toast({ title: "Deleted", description: "Default value deleted successfully" });
      loadAutomation();
    } catch (error: any) {
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

  const getRuleIcon = (type: string) => {
    switch (type) {
      case "fixed_time":
        return Clock;
      case "fixed_interval":
        return Repeat;
      case "daily_quota":
        return Target;
      default:
        return Calendar;
    }
  };

  const getRuleDescription = (rule: any) => {
    switch (rule.type) {
      case "fixed_time":
        return `Post at ${rule.timeOfDay} daily`;
      case "fixed_interval":
        return `Post ${rule.deviationsPerInterval} every ${rule.intervalMinutes} minutes`;
      case "daily_quota":
        return `Post ${rule.dailyQuota} times per day`;
      default:
        return "Custom schedule";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
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
          Back to Automations
        </Link>
        <Card>
          <CardContent className="py-16 text-center">
            <h3 className="text-xl font-semibold mb-2">Workflow Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The automation workflow you're looking for doesn't exist.
            </p>
            <Link to="/automation">
              <Button>Go to Automations</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        to="/automation"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Automations
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-2xl font-bold h-auto py-1 px-2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNewName();
                    if (e.key === "Escape") cancelEditingName();
                  }}
                  disabled={isSavingName}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={saveNewName}
                  disabled={isSavingName}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancelEditingName}
                  disabled={isSavingName}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-4xl font-bold truncate">
                  <span className="text-gradient">{automation.name}</span>
                </h1>
                <Button
                  size="sm"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={startEditingName}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Badge variant={automation.enabled ? "default" : "secondary"} className="shrink-0">
              {automation.enabled ? "Active" : "Inactive"}
            </Badge>
          </div>
          {automation.description && (
            <p className="text-lg text-muted-foreground">{automation.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={testAutomation}
            disabled={isTesting}
          >
            <Play className="h-4 w-4 mr-2" />
            {isTesting ? "Testing..." : "Test Run"}
          </Button>
          <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
            <Label htmlFor="enable-toggle" className="text-sm">
              {automation.enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="enable-toggle"
              checked={automation.enabled}
              onCheckedChange={toggleAutomation}
              disabled={isToggling}
            />
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Schedule Rules */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Schedule Rules</CardTitle>
                  <CardDescription>
                    Define when your drafts should be automatically published
                  </CardDescription>
                </div>
                <Button onClick={() => openRuleDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium mb-1">No schedule rules yet</p>
                  <p className="text-sm">Add a rule to start automating your posts</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => {
                    const RuleIcon = getRuleIcon(rule.type);
                    return (
                      <div
                        key={rule.id}
                        className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <RuleIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{getRuleDescription(rule)}</span>
                            {!rule.enabled && (
                              <Badge variant="secondary" className="text-xs">Disabled</Badge>
                            )}
                          </div>
                          {rule.daysOfWeek && rule.daysOfWeek.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                              {rule.daysOfWeek
                                .map((d: string) => d.charAt(0).toUpperCase() + d.slice(1, 3))
                                .join(", ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRuleDialog(rule)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRuleToDelete(rule.id)}
                            disabled={deletingRuleId === rule.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Default Values */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Default Values</CardTitle>
                  <CardDescription>
                    Set default values to apply to posts automatically
                  </CardDescription>
                </div>
                <Button onClick={() => setShowDefaultDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Default
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
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Draft Selection</Label>
                <Select
                  value={automation.draftSelectionMethod}
                  onValueChange={(value) => updateSettings({ draftSelectionMethod: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fifo">Oldest first (FIFO)</SelectItem>
                    <SelectItem value="lifo">Newest first (LIFO)</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Sta.sh Only</Label>
                  <p className="text-xs text-muted-foreground">Only publish to Sta.sh</p>
                </div>
                <Switch
                  checked={automation.stashOnlyByDefault}
                  onCheckedChange={(checked) => updateSettings({ stashOnlyByDefault: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>Random Delay (seconds)</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      placeholder="Min"
                      min={0}
                      max={3600}
                      value={localJitterMin}
                      onChange={(e) => {
                        setLocalJitterMin(e.target.value);
                        const numValue = parseInt(e.target.value);
                        if (!isNaN(numValue) && numValue >= 0 && numValue <= 3600) {
                          debouncedUpdateSettings({ jitterMinSeconds: numValue });
                        }
                      }}
                      onBlur={(e) => {
                        const value = parseInt(e.target.value);
                        const clampedValue = isNaN(value) || value < 0 ? 0 : value > 3600 ? 3600 : value;
                        setLocalJitterMin(clampedValue);
                        debouncedUpdateSettings.flush();
                        updateSettings({ jitterMinSeconds: clampedValue });
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      type="number"
                      placeholder="Max"
                      min={0}
                      max={3600}
                      value={localJitterMax}
                      onChange={(e) => {
                        setLocalJitterMax(e.target.value);
                        const numValue = parseInt(e.target.value);
                        if (!isNaN(numValue) && numValue >= 0 && numValue <= 3600) {
                          debouncedUpdateSettings({ jitterMaxSeconds: numValue });
                        }
                      }}
                      onBlur={(e) => {
                        const value = parseInt(e.target.value);
                        const clampedValue = isNaN(value) || value < 0 ? 0 : value > 3600 ? 3600 : value;
                        setLocalJitterMax(clampedValue);
                        debouncedUpdateSettings.flush();
                        updateSettings({ jitterMaxSeconds: clampedValue });
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add random delay to make posting times less predictable
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Exclusive Sales */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Exclusive Sales</CardTitle>
                  <CardDescription>Auto-add to sale queue after publishing</CardDescription>
                </div>
                <Switch
                  checked={automation?.autoAddToSaleQueue || false}
                  onCheckedChange={(checked) => {
                    if (checked && !automation?.saleQueuePresetId) {
                      toast({
                        title: "Price Preset Required",
                        description: "Please select a price preset first",
                        variant: "destructive",
                      });
                      return;
                    }
                    updateSettings({ autoAddToSaleQueue: checked });
                  }}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Price Preset</Label>
                <Select
                  value={automation?.saleQueuePresetId || ""}
                  onValueChange={(value) => updateSettings({ saleQueuePresetId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {pricePresetsList.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name} - {preset.minPrice && preset.maxPrice
                          ? `$${(preset.minPrice / 100).toFixed(2)} - $${(preset.maxPrice / 100).toFixed(2)}`
                          : `$${(preset.price / 100).toFixed(2)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {automation?.autoAddToSaleQueue && (
                <div className="bg-muted/50 border rounded-lg p-3">
                  <div className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">Protection enabled</p>
                      <ul className="space-y-0.5">
                        <li>Max resolution: 1920px</li>
                        <li>Watermark: On</li>
                        <li>Free download: Off</li>
                      </ul>
                    </div>
                  </div>
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
            <DialogTitle>{editingRule ? "Edit Rule" : "Add Schedule Rule"}</DialogTitle>
            <DialogDescription>
              Configure when drafts should be automatically published
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
                  <SelectItem value="fixed_time">Post at specific time</SelectItem>
                  <SelectItem value="fixed_interval">Post every X minutes</SelectItem>
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
                  onChange={(e) => setRuleData({ ...ruleData, timeOfDay: e.target.value })}
                />
              </div>
            )}

            {ruleType === "fixed_interval" && (
              <>
                <div className="space-y-2">
                  <Label>Interval (minutes)</Label>
                  <Input
                    type="number"
                    min={5}
                    max={10080}
                    value={ruleData.intervalMinutes}
                    onChange={(e) => setRuleData({ ...ruleData, intervalMinutes: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Posts per interval</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={ruleData.deviationsPerInterval}
                    onChange={(e) => setRuleData({ ...ruleData, deviationsPerInterval: parseInt(e.target.value) })}
                  />
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
                  onChange={(e) => setRuleData({ ...ruleData, dailyQuota: parseInt(e.target.value) })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Days of Week (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => (
                  <div key={day} className="flex items-center space-x-2">
                    <Checkbox
                      id={day}
                      checked={ruleData.daysOfWeek.includes(day)}
                      onCheckedChange={() => toggleDay(day)}
                    />
                    <Label htmlFor={day} className="text-sm capitalize cursor-pointer">
                      {day.slice(0, 3)}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Leave empty for every day</p>
            </div>

            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch
                checked={ruleData.enabled}
                onCheckedChange={(checked) => setRuleData({ ...ruleData, enabled: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRuleDialog(false)} disabled={isSavingRule}>
              Cancel
            </Button>
            <Button onClick={saveRule} disabled={isSavingRule}>
              {isSavingRule ? "Saving..." : editingRule ? "Update" : "Create"}
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
      <AlertDialog open={!!ruleToDelete} onOpenChange={(open) => !open && setRuleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this schedule rule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingRuleId}>Cancel</AlertDialogCancel>
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
      <AlertDialog open={!!defaultToDelete} onOpenChange={(open) => !open && setDefaultToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Default Value?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this default value.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingDefaultId}>Cancel</AlertDialogCancel>
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
