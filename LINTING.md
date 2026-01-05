# Linting & Formatting Standards

> **⚠️ DEPRECATED:** This file is deprecated as of v0.1.0-alpha.5.
>
> **Please see [`.context/ai-rules.md`](.context/ai-rules.md) for complete code style guidelines.**
>
> The `.context/` directory contains comprehensive documentation including:
> - Code style and linting rules
> - Commit message format (Conventional Commits)
> - Security requirements
> - Testing requirements
> - File organization patterns
> - AGPL-3.0 license compliance

---

This project uses ESLint and Prettier to maintain code quality and consistency.

## Tools

- **ESLint 9** - Modern flat config with TypeScript support
- **Prettier** - Code formatter
- **typescript-eslint** - TypeScript-specific linting rules

## Commands

```bash
# Check for linting errors
pnpm lint

# Auto-fix linting errors
pnpm lint:fix

# Format code with Prettier
pnpm format

# Check if code is formatted
pnpm format:check
```

## Configuration Files

- `eslint.config.js` - ESLint configuration (modern flat config)
- `.prettierrc` - Prettier formatting rules
- `.prettierignore` - Files to exclude from formatting

## Rules Overview

### ESLint Rules

**General:**
- `no-console`: OFF (server-side logging allowed)
- `no-unused-vars`: WARN
- `prefer-const`: WARN
- `no-var`: ERROR

**TypeScript:**
- `@typescript-eslint/no-unused-vars`: WARN (ignores `_` prefixed vars)
- `@typescript-eslint/no-explicit-any`: WARN (prefer typed code)

### Prettier Rules

- **Semi-colons:** Required
- **Quotes:** Single quotes
- **Print width:** 100 characters
- **Tab width:** 2 spaces
- **Trailing commas:** ES5 style

## Pre-commit Integration (Optional)

To automatically lint/format before commits, you can add a pre-commit hook:

```bash
# Install husky
pnpm add -D husky lint-staged

# Initialize husky
pnpm exec husky init

# Add pre-commit hook
echo "pnpm lint-staged" > .husky/pre-commit
```

Add to `package.json`:
```json
{
  "lint-staged": {
    "*.{js,ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

## CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Lint
  run: pnpm lint

- name: Check formatting
  run: pnpm format:check
```

## Notes

- All apps (backend, frontend, publisher) use the shared ESLint config
- TypeScript files get additional type-checking rules
- Linting warnings won't block builds, but should be addressed
- Use `// eslint-disable-next-line` sparingly and with comments explaining why
