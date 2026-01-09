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

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, AlertCircle, CheckCircle2, XCircle, Upload, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deviations } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatScheduleDateTime } from '@/lib/timezone';
import { DeviationUploader } from '@/components/DeviationUploader';
import type { Deviation } from '@isekai/shared';

export function Schedule() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'calendar' | 'list'>('list');
  const [showUploader, setShowUploader] = useState(false);

  // Fetch scheduled deviations
  const { data: scheduledData, isLoading: isLoadingScheduled } = useQuery({
    queryKey: ['deviations', 'scheduled'],
    queryFn: () => deviations.list({ status: 'scheduled' }),
  });

  // Fetch publishing deviations
  const { data: publishingData, isLoading: isLoadingPublishing } = useQuery({
    queryKey: ['deviations', 'publishing'],
    queryFn: () => deviations.list({ status: 'publishing' }),
  });

  // Fetch uploading deviations
  const { data: uploadingData, isLoading: isLoadingUploading } = useQuery({
    queryKey: ['deviations', 'uploading'],
    queryFn: () => deviations.list({ status: 'uploading' }),
  });

  // Fetch failed deviations
  const { data: failedData, isLoading: isLoadingFailed } = useQuery({
    queryKey: ['deviations', 'failed'],
    queryFn: () => deviations.list({ status: 'failed' }),
  });

  const cancelDeviation = useMutation({
    mutationFn: (deviationId: string) => deviations.cancel(deviationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations'] });
      toast({
        title: 'Deviation cancelled',
        description: 'The scheduled deviation has been cancelled.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel deviation',
        variant: 'destructive',
      });
    },
  });

  const publishNow = useMutation({
    mutationFn: (deviationId: string) => deviations.publishNow(deviationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations'] });
      toast({
        title: 'Publishing...',
        description: 'Your deviation is being published to DeviantArt.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to publish deviation',
        variant: 'destructive',
      });
    },
  });

  const scheduledDeviations = scheduledData?.deviations || [];
  const publishingDeviations = publishingData?.deviations || [];
  const uploadingDeviations = uploadingData?.deviations || [];
  const failedDeviations = failedData?.deviations || [];
  const isLoading =
    isLoadingScheduled || isLoadingPublishing || isLoadingUploading || isLoadingFailed;

  const allActiveDeviations = [
    ...scheduledDeviations,
    ...publishingDeviations,
    ...uploadingDeviations,
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Upload and schedule your DeviantArt deviations
          </p>
        </div>
        <Button
          onClick={() => setShowUploader(!showUploader)}
          variant={showUploader ? 'outline' : 'default'}
        >
          <Upload className="h-4 w-4 mr-2" />
          {showUploader ? 'Hide Uploader' : 'Upload Files'}
        </Button>
      </div>

      {/* Upload Interface */}
      {showUploader && (
        <div className="mb-8">
          <DeviationUploader />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Scheduled</p>
                <p className="text-2xl font-bold">{scheduledDeviations.length}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Publishing</p>
                <p className="text-2xl font-bold">
                  {publishingDeviations.length + uploadingDeviations.length}
                </p>
              </div>
              <Upload className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold">{failedDeviations.length}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Active</p>
                <p className="text-2xl font-bold">{allActiveDeviations.length}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as 'calendar' | 'list')}>
        <TabsList className="mb-6">
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {isLoading ? (
            <Card>
              <CardContent className="p-12">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              </CardContent>
            </Card>
          ) : allActiveDeviations.length === 0 && failedDeviations.length === 0 ? (
            <Card>
              <CardContent className="p-12">
                <div className="text-center text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No scheduled deviations</p>
                  <p className="text-sm mb-4">Upload files to create your first deviation</p>
                  <Button onClick={() => setShowUploader(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Files
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Scheduled Deviations */}
              {scheduledDeviations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Scheduled Deviations ({scheduledDeviations.length})
                    </CardTitle>
                    <CardDescription>Deviations waiting to be published</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {scheduledDeviations.map((deviation) => (
                        <ScheduledDeviationCard
                          key={deviation.id}
                          deviation={deviation}
                          onCancel={() => cancelDeviation.mutate(deviation.id)}
                          onPublishNow={() => publishNow.mutate(deviation.id)}
                          onEdit={() => navigate(`/deviations/${deviation.id}`)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Publishing Deviations */}
              {(publishingDeviations.length > 0 || uploadingDeviations.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5 text-yellow-500" />
                      Publishing Now ({publishingDeviations.length + uploadingDeviations.length})
                    </CardTitle>
                    <CardDescription>Deviations being uploaded to DeviantArt</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[...uploadingDeviations, ...publishingDeviations].map((deviation) => (
                        <PublishingDeviationCard key={deviation.id} deviation={deviation} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Failed Deviations */}
              {failedDeviations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-500" />
                      Failed Deviations ({failedDeviations.length})
                    </CardTitle>
                    <CardDescription>Deviations that failed to publish</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {failedDeviations.map((deviation) => (
                        <FailedDeviationCard
                          key={deviation.id}
                          deviation={deviation}
                          onRetry={() => publishNow.mutate(deviation.id)}
                          onEdit={() => navigate(`/deviations/${deviation.id}`)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle>Calendar View</CardTitle>
              <CardDescription>Visual timeline of your scheduled posts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Calendar view coming soon</p>
                <p className="text-sm">
                  We're working on a visual calendar to help you manage your posting schedule
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Scheduled Deviation Card Component
function ScheduledDeviationCard({
  deviation,
  onCancel,
  onPublishNow,
  onEdit,
}: {
  deviation: Deviation;
  onCancel: () => void;
  onPublishNow: () => void;
  onEdit: () => void;
}) {
  const scheduledDate = deviation.scheduledAt ? new Date(deviation.scheduledAt) : null;
  const timeUntil = scheduledDate ? getTimeUntil(scheduledDate) : null;
  const isPastDue = scheduledDate ? scheduledDate < new Date() : false;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
      {/* Thumbnail */}
      {deviation.files && deviation.files.length > 0 && deviation.files[0].storageUrl ? (
        <img
          src={deviation.files[0].storageUrl}
          alt={deviation.title}
          className="w-16 h-16 object-cover rounded"
        />
      ) : (
        <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium truncate">{deviation.title}</h3>
          {isPastDue && (
            <Badge variant="destructive" className="text-xs">
              Past Due
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {scheduledDate && formatScheduleDateTime(scheduledDate)}
          </span>
          {timeUntil && !isPastDue && (
            <span className="text-blue-600 dark:text-blue-400">in {timeUntil}</span>
          )}
        </div>
        {deviation.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{deviation.description}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onPublishNow}>
          Publish Now
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Publishing Deviation Card Component
function PublishingDeviationCard({ deviation }: { deviation: Deviation }) {
  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
      {/* Thumbnail */}
      {deviation.files && deviation.files.length > 0 && deviation.files[0].storageUrl ? (
        <img
          src={deviation.files[0].storageUrl}
          alt={deviation.title}
          className="w-16 h-16 object-cover rounded"
        />
      ) : (
        <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium truncate">{deviation.title}</h3>
          <Badge className="bg-yellow-500 text-white">
            {deviation.status === 'uploading' ? 'Uploading' : 'Publishing'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Your deviation is being published to DeviantArt...
        </p>
      </div>

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600"></div>
    </div>
  );
}

// Failed Deviation Card Component
function FailedDeviationCard({
  deviation,
  onRetry,
  onEdit,
}: {
  deviation: Deviation;
  onRetry: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
      {/* Thumbnail */}
      {deviation.files && deviation.files.length > 0 && deviation.files[0].storageUrl ? (
        <img
          src={deviation.files[0].storageUrl}
          alt={deviation.title}
          className="w-16 h-16 object-cover rounded"
        />
      ) : (
        <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium truncate">{deviation.title}</h3>
          <Badge variant="destructive">Failed</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span className="truncate">{deviation.errorMessage || 'Failed to publish'}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

// Helper function to calculate time until scheduled date
function getTimeUntil(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return 'past due';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return 'less than a minute';
}
