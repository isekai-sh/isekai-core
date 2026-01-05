# Contribution Guidelines

**Purpose:** Pull request process, code review checklist, and collaboration guidelines
**Last Updated:** 2026-01-05 (v0.1.0-alpha.5)

---

## Branch & Merge Workflow

**CRITICAL:** All development happens in feature branches. Never commit directly to `main`.

### 1. Before Pushing Branch

**Checklist:**
- [ ] Tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Coverage meets 30% threshold
- [ ] Documentation updated (`.context/` files)
- [ ] All commits follow multi-line Conventional Commits format
- [ ] Branch up-to-date with `main`

### 2. PR Title Format

**Use Conventional Commits:**
```
feat(automation): add daily quota rule type
fix(publisher): prevent duplicate publishes
docs(api): document browse endpoints
refactor(storage): abstract S3/R2/MinIO
```

### 3. PR Description Template

```markdown
## Summary
Brief description of changes (1-3 sentences).

## Motivation
Why this change is needed.

## Changes
- Added X to handle Y
- Updated Z to support W
- Refactored A for better B

## Testing
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Manual testing performed

## Documentation
- [ ] `.context/` files updated
- [ ] API docs updated (if applicable)
- [ ] ADR created (if architectural change)

## Breaking Changes
None / List breaking changes

## Screenshots
(If UI changes)
```

### 4. PR Size Guidelines

**Ideal PR Size:**
- **Small:** <200 lines changed (preferred)
- **Medium:** 200-500 lines
- **Large:** >500 lines (requires justification)

**Large PRs Should:**
- Be split into smaller PRs if possible
- Have detailed description and context
- Include comprehensive tests

---

## Code Review Checklist

### For Reviewers

#### Correctness
- [ ] Code does what PR description claims
- [ ] Edge cases handled
- [ ] Error handling appropriate
- [ ] No obvious bugs

#### Architecture
- [ ] Follows existing patterns
- [ ] No unnecessary complexity
- [ ] Appropriate abstractions
- [ ] Matches ADRs (if applicable)

#### Security
- [ ] No secrets in code
- [ ] Input validation present
- [ ] SQL injection prevented (use Prisma)
- [ ] XSS prevented (proper sanitization)
- [ ] Token encryption used

#### Performance
- [ ] No N+1 queries
- [ ] Appropriate indexes (database changes)
- [ ] No memory leaks
- [ ] Efficient algorithms

#### Testing
- [ ] Tests cover new code
- [ ] Tests are meaningful (not trivial)
- [ ] Coverage meets threshold
- [ ] Tests pass consistently

#### Documentation
- [ ] Code comments where needed (complex logic)
- [ ] `.context/` files updated
- [ ] API changes documented
- [ ] Breaking changes noted

#### Style
- [ ] Follows code style (`.context/ai-rules.md`)
- [ ] Consistent naming
- [ ] No commented-out code
- [ ] No debug logs left in

---

## Code Review Process

### 1. Self-Review

Before requesting review:
1. Review your own diff on GitHub
2. Check for debug logs, console.logs
3. Verify all files intended to be included
4. Test locally one more time

### 2. Request Review

**Tag Reviewers:**
- For architectural changes: Tag senior devs
- For database changes: Tag database expert
- For security changes: Tag security reviewer

### 3. Address Feedback

**Respond to Comments:**
- ✅ **Fixed** - Make change, push commit
- 💬 **Clarified** - Explain decision
- 🤔 **Need Discussion** - Tag reviewer for discussion

**Push Changes:**
```bash
# Make changes
git add .
git commit -m "fix: address review feedback"
git push origin feature-branch
```

### 4. Approval

**Merge Requirements:**
- At least 1 approval (standard PRs)
- At least 2 approvals (architectural changes)
- All CI checks pass
- No unresolved conversations

### 5. Merge

**Merge Strategy:** Squash and merge (default)

**Final Commit Message:**
```
feat(automation): add daily quota rule type (#123)

- Add DailyQuotaRule model
- Implement quota checking logic
- Update auto-scheduler to respect quotas
```

---

## Architectural Changes

### When to Create ADR

**Create ADR for:**
- New patterns or paradigms
- Technology choices (e.g., switching ORM)
- Major refactorings
- Security decisions
- Performance optimizations with trade-offs

**File:** `.context/decisions/NNN-title.md`

**Format:**
```markdown
# NNN. Title

**Status:** Accepted | Deprecated | Superseded
**Date:** 2025-01-10
**Deciders:** Names

## Context
What problem are we solving?

## Decision
What did we decide?

## Consequences
What are the trade-offs?

## Alternatives Considered
What else did we consider?
```

---

## Breaking Changes

### Definition

**Breaking Change:** Change that requires users to modify their code/config.

**Examples:**
- API endpoint renamed
- Required field added to model
- Environment variable renamed
- Configuration format changed

### Handling Breaking Changes

1. **Deprecation Notice:** Add for 1 release before removal
2. **Migration Guide:** Provide clear upgrade path
3. **Versioning:** Bump major version (semantic versioning)
4. **Changelog:** Document in `.context/changelog.md`

**Example:**
```markdown
## Breaking Changes in v0.2.0

### Renamed Environment Variable

`DEVIANTART_REDIRECT_URL` → `DEVIANTART_REDIRECT_URI`

**Migration:**
Update your `.env` file:
```bash
# Old
DEVIANTART_REDIRECT_URL=http://localhost:4000/callback

# New
DEVIANTART_REDIRECT_URI=http://localhost:4000/api/auth/deviantart/callback
```
```

---

## Commit Message Guidelines

**CRITICAL:** ALL commits MUST be multi-line with detailed body. See `.context/ai-rules.md` and `.context/workflows.md` for complete rules.

### Structure (Required)

```
<type>(<scope>): <subject>

<body with bullet points>

<footer>
```

**Rules:**
1. Line 1: Type, scope, subject (max 72 chars)
2. Line 2: Blank line (required)
3. Line 3+: Detailed body with bullets
4. Last line: Issue reference if applicable
5. **NO emojis, NO AI attribution, NO single-line commits**

### Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(automation): add daily quota` |
| `fix` | Bug fix | `fix(publisher): race condition` |
| `refactor` | Code restructuring | `refactor(storage): extract interface` |
| `docs` | Documentation | `docs(api): update endpoints` |
| `test` | Tests | `test(auth): add OAuth tests` |
| `chore` | Build/tooling | `chore: update dependencies` |
| `perf` | Performance | `perf(db): add index on status` |

### Scopes

Common scopes:
- `automation`, `publisher`, `storage`, `auth`, `api`, `db`, `ui`, `tests`

### Examples

**✅ Good (Multi-line with details):**
```
feat(automation): add daily quota rule type

Implements daily_quota rule type that limits posts per day.

- Add dailyQuota field to AutomationScheduleRule model
- Implement quota checking in auto-scheduler
- Add timezone-aware quota tracking
- Add tests for quota enforcement

The quota resets at midnight in the user's timezone.

Closes #42
```

**❌ Bad (Single-line):**
```
feat: add feature
```

**❌ Bad (Has emoji or AI attribution):**
```
feat(api): add endpoint 🚀

Generated with Claude Code
```

---

## Code Style

See `.context/ai-rules.md` for complete style guide.

**Key Points:**
- TypeScript strict mode
- No `any` types (use `unknown`)
- Prisma ORM only (no raw SQL)
- Zod for validation
- Async/await (no callbacks)
- AGPL-3.0 license header on all files

---

## Issue Reporting

### Bug Reports

**Template:**
```markdown
## Description
Brief description of bug.

## Steps to Reproduce
1. Go to X
2. Click Y
3. See error

## Expected Behavior
What should happen?

## Actual Behavior
What actually happens?

## Environment
- Version: v0.1.0-alpha.5
- Node.js: 20.10.0
- OS: Ubuntu 22.04
- Database: PostgreSQL 16

## Logs
```
Error message here
```

## Screenshots
(If applicable)
```

### Feature Requests

**Template:**
```markdown
## Problem
What problem does this solve?

## Proposed Solution
How would this work?

## Alternatives
Other ways to solve this?

## Additional Context
Any other details?
```

---

## Communication

### GitHub Discussions

**Use for:**
- Feature brainstorming
- Architecture discussions
- General questions

### Issues

**Use for:**
- Bug reports
- Feature requests
- Task tracking

### Pull Requests

**Use for:**
- Code review
- Implementation discussion

---

## License

All contributions must be under **AGPL-3.0**.

**License Header:**
```typescript
/*
 * Copyright (C) 2026 Isekai
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
```

---

## Related Documentation

- `.context/ai-rules.md` - Code style
- `.context/workflows.md` - Development workflow
- `.context/testing.md` - Test strategy
- `.context/decisions/` - ADRs
