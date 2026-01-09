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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test-helpers/test-utils';
import userEvent from '@testing-library/user-event';
import { AutomationCard } from './AutomationCard';

vi.mock('@/lib/automation-utils', () => ({
  formatNextRunTime: () => 'Tomorrow at 3:00 PM',
}));

describe('AutomationCard', () => {
  const mockAutomation = {
    id: 'auto-1',
    name: 'Test Automation',
    description: 'Test description',
    enabled: true,
    _count: {
      scheduleRules: 2,
      defaultValues: 3,
    },
  };

  it('should render automation name', () => {
    render(<AutomationCard automation={mockAutomation} />);
    expect(screen.getByText('Test Automation')).toBeInTheDocument();
  });

  it('should render automation description', () => {
    render(<AutomationCard automation={mockAutomation} />);
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('should show ACTIVE badge when enabled', () => {
    render(<AutomationCard automation={mockAutomation} />);
    expect(screen.getByText('● ACTIVE')).toBeInTheDocument();
  });

  it('should show INACTIVE badge when disabled', () => {
    const disabledAutomation = { ...mockAutomation, enabled: false };
    render(<AutomationCard automation={disabledAutomation} />);
    expect(screen.getByText('○ INACTIVE')).toBeInTheDocument();
  });

  it('should pluralize rules correctly', () => {
    render(<AutomationCard automation={mockAutomation} />);
    expect(screen.getByText(/2 rules/)).toBeInTheDocument();
  });

  it('should singularize rule for one rule', () => {
    const singleRuleAutomation = {
      ...mockAutomation,
      _count: { scheduleRules: 1, defaultValues: 0 },
    };
    render(<AutomationCard automation={singleRuleAutomation} />);
    expect(screen.getByText('1 rule')).toBeInTheDocument();
  });

  it('should pluralize values correctly', () => {
    render(<AutomationCard automation={mockAutomation} />);
    expect(screen.getByText(/3 default values/)).toBeInTheDocument();
  });

  it('should singularize value for one value', () => {
    const singleValueAutomation = {
      ...mockAutomation,
      _count: { scheduleRules: 2, defaultValues: 1 },
    };
    render(<AutomationCard automation={singleValueAutomation} />);
    expect(screen.getByText(/1 default value/)).toBeInTheDocument();
  });

  it('should not show default values when count is 0', () => {
    const noValuesAutomation = {
      ...mockAutomation,
      _count: { scheduleRules: 2, defaultValues: 0 },
    };
    render(<AutomationCard automation={noValuesAutomation} />);
    expect(screen.queryByText(/default/)).not.toBeInTheDocument();
  });

  it('should display next run time', () => {
    render(<AutomationCard automation={mockAutomation} />);
    expect(screen.getByText(/Next: Tomorrow at 3:00 PM/)).toBeInTheDocument();
  });

  it('should call onEdit when edit is clicked', async () => {
    const mockOnEdit = vi.fn();
    const user = userEvent.setup();
    render(<AutomationCard automation={mockAutomation} onEdit={mockOnEdit} />);

    // Open dropdown menu first
    const dropdownButton = screen.getByRole('button', { name: '' });
    await user.click(dropdownButton);

    const editButton = await screen.findByText('Edit');
    await user.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledWith(mockAutomation);
  });

  it('should call onDuplicate when duplicate is clicked', async () => {
    const mockOnDuplicate = vi.fn();
    const user = userEvent.setup();
    render(<AutomationCard automation={mockAutomation} onDuplicate={mockOnDuplicate} />);

    // Open dropdown menu first
    const dropdownButton = screen.getByRole('button', { name: '' });
    await user.click(dropdownButton);

    const duplicateButton = await screen.findByText('Duplicate');
    await user.click(duplicateButton);

    expect(mockOnDuplicate).toHaveBeenCalledWith(mockAutomation);
  });

  it('should call onDelete when delete is clicked', async () => {
    const mockOnDelete = vi.fn();
    const user = userEvent.setup();
    render(<AutomationCard automation={mockAutomation} onDelete={mockOnDelete} />);

    // Open dropdown menu first
    const dropdownButton = screen.getByRole('button', { name: '' });
    await user.click(dropdownButton);

    const deleteButton = await screen.findByText('Delete');
    await user.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith(mockAutomation);
  });

  it('should use scheduleRules array when _count is not available', () => {
    const automationWithRulesArray = {
      ...mockAutomation,
      _count: undefined,
      scheduleRules: [
        { id: 'rule-1', enabled: true },
        { id: 'rule-2', enabled: true },
        { id: 'rule-3', enabled: false },
      ],
    };
    render(<AutomationCard automation={automationWithRulesArray} />);
    expect(screen.getByText(/2 rules/)).toBeInTheDocument();
  });

  it('should show configure link', () => {
    render(<AutomationCard automation={mockAutomation} />);
    const configureLink = screen.getByText('Configure').closest('a');
    expect(configureLink).toHaveAttribute('href', '/automation/auto-1');
  });
});
