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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deviations, pricePresets, saleQueue } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageWrapper, PageHeader, PageContent } from "@/components/ui/page-wrapper";

export function Published() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedDeviationIds, setSelectedDeviationIds] = useState<Set<string>>(
    new Set()
  );
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["deviations", "published"],
    queryFn: () => deviations.list({ status: "published" }),
  });

  const { data: presetsData } = useQuery({
    queryKey: ["pricePresets"],
    queryFn: () => pricePresets.list(),
  });

  const addToQueueMutation = useMutation({
    mutationFn: (data: { deviationIds: string[]; pricePresetId: string }) =>
      saleQueue.addToQueue(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["saleQueue"] });
      setSelectedDeviationIds(new Set());
      setShowPresetDialog(false);
      setSelectedPresetId("");
      toast({
        title: "Added to Sale Queue",
        description: `${
          result.created
        } deviation(s) queued for exclusive sale. ${
          result.skipped > 0 ? `${result.skipped} already in queue.` : ""
        }`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add to sale queue",
        variant: "destructive",
      });
    },
  });

  const handleToggleSelection = (deviationId: string) => {
    const newSelection = new Set(selectedDeviationIds);
    if (newSelection.has(deviationId)) {
      newSelection.delete(deviationId);
    } else {
      newSelection.add(deviationId);
    }
    setSelectedDeviationIds(newSelection);
  };

  const handleToggleAll = () => {
    if (selectedDeviationIds.size === data?.deviations.length) {
      setSelectedDeviationIds(new Set());
    } else {
      setSelectedDeviationIds(new Set(data?.deviations.map((d) => d.id) || []));
    }
  };

  const handleSetAsExclusive = () => {
    if (selectedDeviationIds.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select at least one deviation",
        variant: "destructive",
      });
      return;
    }

    // Pre-select default preset if available
    const defaultPreset = presetsData?.presets.find((p) => p.isDefault);
    if (defaultPreset) {
      setSelectedPresetId(defaultPreset.id);
    }

    setShowPresetDialog(true);
  };

  const handleSubmitPreset = () => {
    if (!selectedPresetId) {
      toast({
        title: "No Preset Selected",
        description: "Please select a price preset",
        variant: "destructive",
      });
      return;
    }

    addToQueueMutation.mutate({
      deviationIds: Array.from(selectedDeviationIds),
      pricePresetId: selectedPresetId,
    });
  };

  const presetsList = presetsData?.presets || [];
  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(cents / 100);
  };

  const isAllSelected =
    data?.deviations.length > 0 &&
    selectedDeviationIds.size === data?.deviations.length;

  return (
    <PageWrapper className="gap-6">
      <PageHeader>
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Published</h1>
          <p className="text-muted-foreground mt-1">
            Your deviation publishing history
            {selectedDeviationIds.size > 0 &&
              ` (${selectedDeviationIds.size} selected)`}
          </p>
        </div>
        {selectedDeviationIds.size > 0 && (
          <Button onClick={handleSetAsExclusive}>
            <DollarSign className="h-4 w-4 mr-2" />
            Set as Exclusive ({selectedDeviationIds.size})
          </Button>
        )}
        </div>
      </PageHeader>

      <PageContent>
        <Card className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>Published Deviations</CardTitle>
          <CardDescription>
            Select deviations to queue for exclusive sale automation
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : data?.deviations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No published deviations yet</p>
              </div>
            ) : (
              <>
                {/* Select All */}
                <div className="flex items-center space-x-2 pb-4 border-b mb-4">
                  <Checkbox
                    id="select-all"
                    checked={isAllSelected}
                    onCheckedChange={handleToggleAll}
                  />
                  <Label
                    htmlFor="select-all"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Select all ({data.deviations.length} deviations)
                  </Label>
                </div>

                {/* Deviations List */}
                <div className="space-y-3">
                  {data.deviations.map((deviation) => (
                    <div
                      key={deviation.id}
                      className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition"
                    >
                      <Checkbox
                        checked={selectedDeviationIds.has(deviation.id)}
                        onCheckedChange={() =>
                          handleToggleSelection(deviation.id)
                        }
                      />
                      <div className="flex-1">
                        <p className="font-medium">{deviation.title}</p>
                        <p className="text-sm text-muted-foreground">
                          Published{" "}
                          {deviation.publishedAt
                            ? new Date(
                                deviation.publishedAt
                              ).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                      {deviation.deviationUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={deviation.deviationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      </PageContent>

      {/* Price Preset Selection Dialog */}
      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Price Preset</DialogTitle>
            <DialogDescription>
              Choose a price template for {selectedDeviationIds.size} selected
              deviation(s)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {presetsList.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="mb-2">No price presets available</p>
                <p className="text-sm">
                  Create a price preset first in the Price Presets page
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="preset-select">Price Preset</Label>
                <Select
                  value={selectedPresetId}
                  onValueChange={setSelectedPresetId}
                >
                  <SelectTrigger id="preset-select">
                    <SelectValue placeholder="Select a preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {presetsList.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name} -{" "}
                        {formatPrice(preset.price, preset.currency)}
                        {preset.isDefault && " (Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPresetDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitPreset}
              disabled={
                !selectedPresetId ||
                presetsList.length === 0 ||
                addToQueueMutation.isPending
              }
            >
              Add to Queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
