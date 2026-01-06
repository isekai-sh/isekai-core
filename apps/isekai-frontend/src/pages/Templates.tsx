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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Tag,
  FileText,
  DollarSign,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { templates, pricePresets } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Template, TagContent, DescriptionContent } from "@isekai/shared";
import type { PricePreset, CreatePricePresetRequest } from "@/lib/api";

type TemplateTab = "tags" | "descriptions" | "prices";

const tabs: { id: TemplateTab; label: string; icon: typeof Tag }[] = [
  { id: "tags", label: "Tags", icon: Tag },
  { id: "descriptions", label: "Descriptions", icon: FileText },
  { id: "prices", label: "Price Presets", icon: DollarSign },
];

export function Templates() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as TemplateTab) || "tags";

  const setTab = (newTab: TemplateTab) => {
    setSearchParams({ tab: newTab });
  };

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">
          <span className="text-gradient">Templates</span>
        </h1>
        <p className="text-lg text-muted-foreground">
          Reusable templates for tags, descriptions, and pricing
        </p>
      </div>

      {/* Content with sidebar */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Sidebar */}
        <nav className="w-48 flex-shrink-0">
          <div className="space-y-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {tab === "tags" && <TagTemplatesContent />}
          {tab === "descriptions" && <DescriptionTemplatesContent />}
          {tab === "prices" && <PricePresetsContent />}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tag Templates Content
// ============================================================================

function TagTemplatesContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["templates", "tag"],
    queryFn: () => templates.list("tag"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Deleted", description: "Template deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
      });
    },
  });

  const templateList = data?.templates || [];

  return (
    <>
      <Card className="h-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">Tag Templates</h2>
              <p className="text-sm text-muted-foreground">
                Reusable tag collections for your posts
              </p>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : templateList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No tag templates yet</p>
              <p className="text-sm mb-4">
                Create tag templates to quickly apply common tag combinations
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {templateList.map((template) => {
                const content = template.content as TagContent;
                return (
                  <div
                    key={template.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium mb-1.5">{template.name}</h3>
                      <div className="flex flex-wrap gap-1">
                        {content.tags.slice(0, 8).map((tag, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {content.tags.length > 8 && (
                          <Badge variant="outline" className="text-xs">
                            +{content.tags.length - 8} more
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setEditingTemplate(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => deleteMutation.mutate(template.id)}
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

      <TagTemplateDialog
        open={isCreateDialogOpen || !!editingTemplate}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) setEditingTemplate(null);
        }}
        template={editingTemplate}
      />
    </>
  );
}

function TagTemplateDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    if (template) {
      setName(template.name);
      const content = template.content as TagContent;
      setTags(content.tags);
    } else {
      setName("");
      setTags([]);
      setTagInput("");
    }
  }, [template, open]);

  const createMutation = useMutation({
    mutationFn: (data: { type: "tag"; name: string; content: TagContent }) =>
      templates.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Created", description: "Template created successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; content?: TagContent };
    }) => templates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Updated", description: "Template updated successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message });
    },
  });

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Name is required" });
      return;
    }

    if (tags.length === 0) {
      toast({ title: "Error", description: "At least one tag is required" });
      return;
    }

    const content: TagContent = { tags };

    if (template) {
      updateMutation.mutate({
        id: template.id,
        data: { name: name.trim(), content },
      });
    } else {
      createMutation.mutate({ type: "tag", name: name.trim(), content });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {template ? "Edit" : "Create"} Tag Template
          </DialogTitle>
          <DialogDescription>Create a reusable tag combination</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              placeholder="e.g., Digital Art, Fantasy Characters"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Enter a tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <Button type="button" onClick={handleAddTag}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary" className="pr-1">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(idx)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending
              ? "Saving..."
              : template
              ? "Update"
              : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Description Templates Content
// ============================================================================

function DescriptionTemplatesContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["templates", "description"],
    queryFn: () => templates.list("description"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Deleted", description: "Template deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
      });
    },
  });

  const templateList = data?.templates || [];

  return (
    <>
      <Card className="h-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">Description Templates</h2>
              <p className="text-sm text-muted-foreground">
                Reusable descriptions and captions
              </p>
            </div>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : templateList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">
                No description templates yet
              </p>
              <p className="text-sm mb-4">
                Create description templates to save time when writing
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {templateList.map((template) => {
                const content = template.content as DescriptionContent;
                return (
                  <div
                    key={template.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium mb-1">{template.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {content.text}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setEditingTemplate(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => deleteMutation.mutate(template.id)}
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

      <DescriptionTemplateDialog
        open={isCreateDialogOpen || !!editingTemplate}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) setEditingTemplate(null);
        }}
        template={editingTemplate}
      />
    </>
  );
}

function DescriptionTemplateDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (template) {
      setName(template.name);
      const content = template.content as DescriptionContent;
      setText(content.text);
    } else {
      setName("");
      setText("");
    }
  }, [template, open]);

  const createMutation = useMutation({
    mutationFn: (data: {
      type: "description";
      name: string;
      content: DescriptionContent;
    }) => templates.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Created", description: "Template created successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; content?: DescriptionContent };
    }) => templates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Updated", description: "Template updated successfully" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Name is required" });
      return;
    }

    if (!text.trim()) {
      toast({ title: "Error", description: "Description text is required" });
      return;
    }

    const content: DescriptionContent = { text: text.trim() };

    if (template) {
      updateMutation.mutate({
        id: template.id,
        data: { name: name.trim(), content },
      });
    } else {
      createMutation.mutate({
        type: "description",
        name: name.trim(),
        content,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {template ? "Edit" : "Create"} Description Template
          </DialogTitle>
          <DialogDescription>Create a reusable description</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              placeholder="e.g., Commission Info, Character Bio"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="text">Description Text</Label>
            <Textarea
              id="text"
              placeholder="Enter your description..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending
              ? "Saving..."
              : template
              ? "Update"
              : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Price Presets Content
// ============================================================================

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(cents / 100);
}

function PricePresetsContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PricePreset | null>(null);
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<"fixed" | "range">("fixed");
  const [presetFormData, setPresetFormData] = useState<CreatePricePresetRequest>(
    {
      name: "",
      price: 5000,
      currency: "USD",
      description: "",
      isDefault: false,
      sortOrder: 0,
    }
  );

  const { data: presetsData, isLoading } = useQuery({
    queryKey: ["pricePresets"],
    queryFn: async () => await pricePresets.list(),
  });

  const presetsList = presetsData?.presets || [];

  const createPresetMutation = useMutation({
    mutationFn: (data: CreatePricePresetRequest) => pricePresets.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricePresets"] });
      handleClosePresetDialog();
      toast({ title: "Created", description: "Price preset created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message });
    },
  });

  const updatePresetMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PricePreset> }) =>
      pricePresets.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricePresets"] });
      handleClosePresetDialog();
      toast({ title: "Updated", description: "Price preset updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message });
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: (id: string) => pricePresets.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricePresets"] });
      setDeletePresetId(null);
      toast({ title: "Deleted", description: "Price preset deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message });
    },
  });

  const handleOpenCreatePreset = () => {
    setEditingPreset(null);
    setPricingMode("fixed");
    setPresetFormData({
      name: "",
      price: 5000,
      currency: "USD",
      description: "",
      isDefault: false,
      sortOrder: 0,
    });
    setShowPresetDialog(true);
  };

  const handleOpenEditPreset = (preset: PricePreset) => {
    setEditingPreset(preset);
    if (preset.minPrice && preset.maxPrice) {
      setPricingMode("range");
      setPresetFormData({
        name: preset.name,
        minPrice: preset.minPrice,
        maxPrice: preset.maxPrice,
        currency: preset.currency,
        description: preset.description || "",
        isDefault: preset.isDefault,
        sortOrder: preset.sortOrder,
      });
    } else {
      setPricingMode("fixed");
      setPresetFormData({
        name: preset.name,
        price: preset.price,
        currency: preset.currency,
        description: preset.description || "",
        isDefault: preset.isDefault,
        sortOrder: preset.sortOrder,
      });
    }
    setShowPresetDialog(true);
  };

  const handleClosePresetDialog = () => {
    setShowPresetDialog(false);
    setEditingPreset(null);
  };

  const handleSubmitPreset = (e: React.FormEvent) => {
    e.preventDefault();

    const data = { ...presetFormData };
    if (pricingMode === "fixed") {
      data.minPrice = undefined;
      data.maxPrice = undefined;
    } else {
      data.price = undefined;
    }

    if (editingPreset) {
      updatePresetMutation.mutate({ id: editingPreset.id, data });
    } else {
      createPresetMutation.mutate(data);
    }
  };

  return (
    <>
      <Card className="h-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">Price Presets</h2>
              <p className="text-sm text-muted-foreground">
                Pricing templates for exclusive sales
              </p>
            </div>
            <Button onClick={handleOpenCreatePreset}>
              <Plus className="h-4 w-4 mr-2" />
              Create Preset
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : presetsList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No price presets yet</p>
              <p className="text-sm mb-4">
                Create price presets to use with exclusive sales
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {presetsList.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{preset.name}</h3>
                      {preset.isDefault && (
                        <Badge variant="secondary" className="text-xs">
                          Default
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {preset.minPrice && preset.maxPrice ? (
                        <span>
                          {formatPrice(preset.minPrice, preset.currency)} -{" "}
                          {formatPrice(preset.maxPrice, preset.currency)}
                          <span className="text-xs ml-2">(Random)</span>
                        </span>
                      ) : (
                        <span className="text-lg font-semibold text-primary">
                          {formatPrice(preset.price, preset.currency)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleOpenEditPreset(preset)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setDeletePresetId(preset.id)}
                      disabled={deletePresetMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Price Preset Create/Edit Dialog */}
      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmitPreset}>
            <DialogHeader>
              <DialogTitle>
                {editingPreset ? "Edit" : "Create"} Price Preset
              </DialogTitle>
              <DialogDescription>
                {editingPreset
                  ? "Update the preset details below"
                  : "Create a reusable price template for exclusive sales"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={presetFormData.name}
                  onChange={(e) =>
                    setPresetFormData({ ...presetFormData, name: e.target.value })
                  }
                  placeholder="e.g., Standard, Premium"
                  required
                  maxLength={100}
                />
              </div>
              <div className="grid gap-2">
                <Label>Pricing Type</Label>
                <RadioGroup
                  value={pricingMode}
                  onValueChange={(v) => {
                    setPricingMode(v as "fixed" | "range");
                    if (v === "fixed") {
                      setPresetFormData({
                        ...presetFormData,
                        price: 5000,
                        minPrice: undefined,
                        maxPrice: undefined,
                      });
                    } else {
                      setPresetFormData({
                        ...presetFormData,
                        price: undefined,
                        minPrice: 3000,
                        maxPrice: 10000,
                      });
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fixed" id="fixed" />
                    <Label htmlFor="fixed" className="font-normal cursor-pointer">
                      Fixed Price
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="range" id="range" />
                    <Label htmlFor="range" className="font-normal cursor-pointer">
                      Random Range
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {pricingMode === "fixed" ? (
                <div className="grid gap-2">
                  <Label htmlFor="price">Price (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="price"
                      type="number"
                      min="1"
                      max="10000"
                      step="0.01"
                      value={((presetFormData.price ?? 5000) / 100).toFixed(2)}
                      onChange={(e) =>
                        setPresetFormData({
                          ...presetFormData,
                          price: Math.round(parseFloat(e.target.value) * 100),
                        })
                      }
                      className="pl-7"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimum $1, maximum $10,000
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="minPrice">Min Price (USD)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="minPrice"
                        type="number"
                        min="1"
                        max="10000"
                        step="0.01"
                        value={((presetFormData.minPrice ?? 3000) / 100).toFixed(2)}
                        onChange={(e) =>
                          setPresetFormData({
                            ...presetFormData,
                            minPrice: Math.round(parseFloat(e.target.value) * 100),
                          })
                        }
                        className="pl-7"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxPrice">Max Price (USD)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="maxPrice"
                        type="number"
                        min="1"
                        max="10000"
                        step="0.01"
                        value={((presetFormData.maxPrice ?? 10000) / 100).toFixed(2)}
                        onChange={(e) =>
                          setPresetFormData({
                            ...presetFormData,
                            maxPrice: Math.round(parseFloat(e.target.value) * 100),
                          })
                        }
                        className="pl-7"
                        required
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground col-span-2">
                    A random price between min and max will be chosen
                  </p>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={presetFormData.description}
                  onChange={(e) =>
                    setPresetFormData({
                      ...presetFormData,
                      description: e.target.value,
                    })
                  }
                  placeholder="Add notes about this pricing tier..."
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isDefault"
                  checked={presetFormData.isDefault}
                  onCheckedChange={(checked) =>
                    setPresetFormData({
                      ...presetFormData,
                      isDefault: !!checked,
                    })
                  }
                />
                <Label htmlFor="isDefault" className="text-sm font-normal cursor-pointer">
                  Set as default preset
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClosePresetDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createPresetMutation.isPending || updatePresetMutation.isPending}
              >
                {editingPreset ? "Update" : "Create"} Preset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Price Preset Dialog */}
      <AlertDialog open={!!deletePresetId} onOpenChange={() => setDeletePresetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Price Preset?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The preset will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePresetId && deletePresetMutation.mutate(deletePresetId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
