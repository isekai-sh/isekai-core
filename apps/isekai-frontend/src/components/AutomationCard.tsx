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

import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Clock, Calendar, MoreVertical, Edit, Copy, Trash2 } from 'lucide-react';
import { formatNextRunTime } from '@/lib/automation-utils';

interface AutomationCardProps {
  automation: any;
  onEdit?: (automation: any) => void;
  onDuplicate?: (automation: any) => void;
  onDelete?: (automation: any) => void;
}

export function AutomationCard({ automation, onEdit, onDuplicate, onDelete }: AutomationCardProps) {
  const activeRulesCount =
    automation._count?.scheduleRules ||
    automation.scheduleRules?.filter((r: any) => r.enabled).length ||
    0;
  const defaultValuesCount = automation._count?.defaultValues || 0;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle>{automation.name}</CardTitle>
            {automation.description && (
              <CardDescription className="text-sm">{automation.description}</CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit?.(automation)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate?.(automation)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete?.(automation)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Status Badge */}
        <div>
          <Badge variant={automation.enabled ? 'default' : 'secondary'}>
            {automation.enabled ? '● ACTIVE' : '○ INACTIVE'}
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {activeRulesCount} {activeRulesCount === 1 ? 'rule' : 'rules'}
              {defaultValuesCount > 0 &&
                `, ${defaultValuesCount} default ${defaultValuesCount === 1 ? 'value' : 'values'}`}
            </span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Next: {formatNextRunTime(automation)}</span>
          </div>
        </div>

        {/* Configure Button */}
        <Link to={`/automation/${automation.id}`}>
          <Button variant="outline" className="w-full">
            Configure
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
