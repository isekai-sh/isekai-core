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
import { Login } from './Login';

vi.mock('@/components/login-form', () => ({
  LoginForm: () => <div data-testid="login-form">Login Form</div>,
}));

describe('Login', () => {
  it('should render login page with background', () => {
    render(<Login />);

    const backgroundImage = screen.getByAltText('Background');
    expect(backgroundImage).toHaveAttribute('src', '/featured.jpg');
  });

  it('should render Isekai logo', () => {
    render(<Login />);

    const logo = screen.getByAltText('Isekai');
    expect(logo).toHaveAttribute('src', '/isekai-logo.svg');
  });

  it('should render login form', () => {
    render(<Login />);

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('should have logo link to home', () => {
    render(<Login />);

    const logoLink = screen.getByAltText('Isekai').closest('a');
    expect(logoLink).toHaveAttribute('href', '/');
  });
});
