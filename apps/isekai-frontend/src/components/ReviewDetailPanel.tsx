/*
 * Copyright (C) 2025 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Check, X } from 'lucide-react';
import { DecisionDetailPanel } from '@/components/DecisionDetailPanel';
import type { Deviation } from '@isekai/shared';

interface ReviewDetailPanelProps {
  deviation: Deviation | undefined;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onUpdate: (id: string, data: Partial<Deviation>) => void;
}

export function ReviewDetailPanel({
  deviation,
  onApprove,
  onReject,
  onUpdate,
}: ReviewDetailPanelProps) {
  return (
    <DecisionDetailPanel
      deviation={deviation}
      onUpdate={onUpdate}
      secondaryAction={{ label: 'Reject', icon: X, variant: 'outline', onAction: onReject }}
      primaryAction={{ label: 'Approve', icon: Check, onAction: onApprove }}
    />
  );
}
