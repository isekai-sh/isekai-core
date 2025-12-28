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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Tag,
  FileText,
  MessageSquare,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { templates } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type {
  Template,
  TemplateType,
  TagContent,
  DescriptionContent,
  CommentContent,
} from "@isekai/shared";
import { PageWrapper, PageHeader, PageContent } from "@/components/ui/page-wrapper";

export function Templates() {
  const [activeTab, setActiveTab] = useState<TemplateType>("tag");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  return (
    <PageWrapper className="gap-6">
      <PageHeader>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Templates</h1>
            <p className="text-muted-foreground mt-1">
              Manage reusable metadata templates for your deviations
            </p>
          </div>
        </div>
      </PageHeader>

      <PageContent>
        <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TemplateType)}
      >
        <TabsList className="mb-6">
          <TabsTrigger value="tag" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="description" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Descriptions
          </TabsTrigger>
          <TabsTrigger value="comment" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comments
          </TabsTrigger>
        </TabsList>

        {/* Tags Tab */}
        <TabsContent value="tag">
          <TagTemplatesList
            onCreateNew={() => setIsCreateDialogOpen(true)}
            onEdit={(template) => setEditingTemplate(template)}
          />
        </TabsContent>

        {/* Descriptions Tab */}
        <TabsContent value="description">
          <DescriptionTemplatesList
            onCreateNew={() => setIsCreateDialogOpen(true)}
            onEdit={(template) => setEditingTemplate(template)}
          />
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comment">
          <CommentTemplatesList
            onCreateNew={() => setIsCreateDialogOpen(true)}
            onEdit={(template) => setEditingTemplate(template)}
          />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
        <TemplateDialog
          type={activeTab}
          open={isCreateDialogOpen || !!editingTemplate}
          onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (!open) setEditingTemplate(null);
          }}
          template={editingTemplate}
        />
      </PageContent>
    </PageWrapper>
  );
}

// Tag Templates List Component
function TagTemplatesList({
  onCreateNew,
  onEdit,
}: {
  onCreateNew: () => void;
  onEdit: (template: Template) => void;
}) {
  const queryClient = useQueryClient();
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
        variant: "destructive",
      });
    },
  });

  const templateList = data?.templates || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tag Templates</CardTitle>
            <CardDescription>
              Save commonly used tag combinations for quick application
            </CardDescription>
          </div>
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : templateList.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No tag templates yet</p>
            <p className="text-sm mb-4">
              Create tag templates to quickly apply common tag combinations to
              your deviations
            </p>
            <p className="text-xs text-muted-foreground">
              Example: "Digital Art" → ["digital", "art", "illustration", "2d"]
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templateList.map((template) => {
              const content = template.content as TagContent;
              return (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50"
                >
                  <div className="flex-1">
                    <h3 className="font-medium mb-2">{template.name}</h3>
                    <div className="flex flex-wrap gap-1">
                      {content.tags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(template)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
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
  );
}

// Description Templates List Component
function DescriptionTemplatesList({
  onCreateNew,
  onEdit,
}: {
  onCreateNew: () => void;
  onEdit: (template: Template) => void;
}) {
  const queryClient = useQueryClient();
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
        variant: "destructive",
      });
    },
  });

  const templateList = data?.templates || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Description Templates</CardTitle>
            <CardDescription>
              Save reusable descriptions with optional variable support
            </CardDescription>
          </div>
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </CardHeader>
      <CardContent>
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
              Create description templates to save time when writing deviation
              descriptions
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templateList.map((template) => {
              const content = template.content as DescriptionContent;
              return (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50"
                >
                  <div className="flex-1">
                    <h3 className="font-medium mb-2">{template.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {content.text}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(template)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
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
  );
}

// Comment Templates List Component
function CommentTemplatesList({
  onCreateNew,
  onEdit,
}: {
  onCreateNew: () => void;
  onEdit: (template: Template) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["templates", "comment"],
    queryFn: () => templates.list("comment"),
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
        variant: "destructive",
      });
    },
  });

  const templateList = data?.templates || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Comment Templates</CardTitle>
            <CardDescription>
              Save common responses for quick replies
            </CardDescription>
          </div>
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : templateList.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No comment templates yet</p>
            <p className="text-sm mb-4">
              Create comment templates for common messages like thank you notes
              and collaboration requests
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templateList.map((template) => {
              const content = template.content as CommentContent;
              return (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50"
                >
                  <div className="flex-1">
                    <h3 className="font-medium mb-2">{template.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {content.text}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(template)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
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
  );
}

// Template Dialog Component
function TemplateDialog({
  type,
  open,
  onOpenChange,
  template,
}: {
  type: TemplateType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState("");

  // Reset form when dialog opens/closes or template changes
  useEffect(() => {
    if (template) {
      setName(template.name);
      if (template.type === "tag") {
        const content = template.content as TagContent;
        setTags(content.tags);
      } else if (
        template.type === "description" ||
        template.type === "comment"
      ) {
        const content = template.content as DescriptionContent | CommentContent;
        setText(content.text);
      }
    } else {
      setName("");
      setTags([]);
      setTagInput("");
      setText("");
    }
  }, [template, open]);

  const createMutation = useMutation({
    mutationFn: (data: { type: TemplateType; name: string; content: any }) =>
      templates.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Created", description: "Template created successfully" });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; content?: any };
    }) => templates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast({ title: "Updated", description: "Template updated successfully" });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setName("");
    setTags([]);
    setTagInput("");
    setText("");
  };

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
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    let content: any;
    if (type === "tag") {
      if (tags.length === 0) {
        toast({
          title: "Error",
          description: "At least one tag is required",
          variant: "destructive",
        });
        return;
      }
      content = { tags };
    } else {
      if (!text.trim()) {
        toast({
          title: "Error",
          description: "Text is required",
          variant: "destructive",
        });
        return;
      }
      content = { text: text.trim() };
    }

    if (template) {
      updateMutation.mutate({
        id: template.id,
        data: { name: name.trim(), content },
      });
    } else {
      createMutation.mutate({ type, name: name.trim(), content });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {template ? "Edit" : "Create"}{" "}
            {type === "tag"
              ? "Tag"
              : type === "description"
              ? "Description"
              : "Comment"}{" "}
            Template
          </DialogTitle>
          <DialogDescription>
            {type === "tag" && "Create a reusable tag combination"}
            {type === "description" && "Create a reusable description"}
            {type === "comment" && "Create a reusable comment"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              placeholder="e.g., Digital Art, Commission Info, Thank You"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {type === "tag" ? (
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
          ) : (
            <div className="space-y-2">
              <Label htmlFor="text">
                {type === "description" ? "Description" : "Comment"} Text
              </Label>
              <Textarea
                id="text"
                placeholder={
                  type === "description"
                    ? "Enter your description..."
                    : "Enter your comment..."
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
              />
            </div>
          )}
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
