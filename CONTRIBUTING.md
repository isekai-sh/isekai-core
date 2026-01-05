# Contributing to Isekai

Thank you for your interest in contributing to Isekai! This document provides basic guidelines for contributions.

---

## 📚 Complete Guidelines

**For comprehensive contribution guidelines, see [`.context/guidelines.md`](.context/guidelines.md)**

Documentation includes:
- **[Pull Request Process](.context/guidelines.md)** - Complete PR workflow and checklist
- **[Code Review Checklist](.context/guidelines.md)** - What reviewers look for
- **[Development Workflow](.context/workflows.md)** - Local setup and testing
- **[Code Style](.context/ai-rules.md)** - Conventions and patterns
- **[Testing Strategy](.context/testing.md)** - Test requirements (30% coverage)

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Quick Start

### Prerequisites

Before you begin, make sure you have:

- Read the [README.md](README.md)
- Read [`.context/substrate.md`](.context/substrate.md) for project overview
- Familiarized yourself with the codebase structure

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/isekai-core.git
cd isekai-core

# Add upstream remote
git remote add upstream https://github.com/isekai-sh/isekai.git

# Install dependencies
pnpm install

# Start development environment
docker-compose up -d postgres redis
pnpm db:migrate
pnpm dev
```

## Development Workflow

### 1. Create a Feature Branch

```bash
# Update your main branch
git checkout main
git pull upstream main

# Create a new feature branch
git checkout -b feature/your-feature-name
```

### Branch Naming Convention

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests
- `chore/` - Maintenance tasks

Examples:

- `feature/add-image-filters`
- `fix/scheduling-timezone-bug`
- `docs/update-deployment-guide`

### 2. Make Your Changes

- Write clean, readable code
- Follow existing code style and conventions
- Add comments for complex logic
- Keep commits atomic and focused

### 3. Test Your Changes

```bash
# Run linting
pnpm lint

# Build all apps to check for errors
pnpm build

# Test manually in the browser
pnpm dev
```

### 4. Commit Your Changes

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
git add .
git commit -m "feat: add image filter feature"
```

#### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependencies
- `build`: Build system changes
- `ci`: CI/CD changes

**Examples:**

```bash
feat(scheduling): add recurring post support
fix(auth): resolve session timeout issue
docs(readme): update installation instructions
refactor(api): simplify error handling
perf(images): optimize image compression
test(drafts): add draft management tests
chore(deps): update dependencies
```

### 5. Push and Create Pull Request

```bash
# Push your branch
git push origin feature/your-feature-name
```

Then:

1. Go to GitHub and create a Pull Request
2. Fill out the PR template
3. Link any related issues
4. Request review from maintainers

## Pull Request Guidelines

### PR Title

Follow the same format as commit messages:

```
feat(scheduling): add recurring post support
```

### PR Description

Include:

- **What**: Description of the changes
- **Why**: Reason for the changes
- **How**: Implementation approach
- **Testing**: How you tested the changes
- **Screenshots**: If UI changes are involved
- **Related Issues**: Link to related issues

Example:

```markdown
## What

Adds support for recurring scheduled posts (daily, weekly, monthly).

## Why

Users requested the ability to schedule recurring posts for regular content updates.

## How

- Added `RecurrenceRule` model to database
- Implemented cron-based scheduling with BullMQ
- Created UI for configuring recurrence patterns
- Added API endpoints for CRUD operations

## Testing

- ✅ Tested daily, weekly, and monthly recurrence
- ✅ Verified timezone handling
- ✅ Tested edit and deletion of recurring schedules
- ✅ Checked database migrations

## Screenshots

[Attach screenshots if applicable]

## Related Issues

Closes #123
```

### PR Checklist

Before submitting, ensure:

- [ ] Code follows the project's style guidelines
- [ ] Self-review of code completed
- [ ] Comments added for complex logic
- [ ] Documentation updated if needed
- [ ] No new warnings or errors
- [ ] Changes tested locally
- [ ] Commit messages follow conventions
- [ ] PR description is clear and complete

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Define proper types, avoid `any`
- Use interfaces for object shapes
- Use type aliases for unions/intersections

```typescript
// Good
interface User {
  id: number;
  email: string;
  displayName: string | null;
}

// Avoid
const user: any = {...};
```

### React

- Use functional components with hooks
- Extract reusable logic into custom hooks
- Keep components small and focused
- Use proper prop types

```typescript
// Good
interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export function Button({ onClick, children, variant = 'primary' }: ButtonProps) {
  return <button onClick={onClick} className={variant}>{children}</button>;
}
```

### Express/API

- Use async/await over callbacks
- Handle errors properly
- Validate input data
- Add proper types for request/response

```typescript
// Good
app.post('/api/posts', async (req, res) => {
  try {
    const post = await createPost(req.body);
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create post' });
  }
});
```

### CSS/Tailwind

- Use Tailwind utility classes
- Extract common patterns into components
- Maintain consistent spacing and sizing
- Follow the design system

```tsx
// Good
<div className="flex items-center gap-4 p-6 bg-background border border-border rounded-lg">
  <Avatar src={user.avatarUrl} />
  <div>
    <h3 className="font-semibold">{user.displayName}</h3>
    <p className="text-sm text-muted-foreground">{user.email}</p>
  </div>
</div>
```

## Database Changes

### Creating Migrations

1. Edit schema in `apps/isekai-backend/src/db/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Review generated SQL
4. Test migration: `pnpm db:migrate`
5. Include migration files in your PR

### Migration Best Practices

- Make incremental changes
- Add NOT NULL columns carefully
- Include indexes for queried columns
- Test migrations on a copy of production data
- Never edit existing migrations

## Testing

### Manual Testing

- Test your changes in all relevant browsers
- Test different screen sizes (responsive)
- Test error states and edge cases
- Test with different user roles/permissions

### API Testing

Use tools like:

- Thunder Client (VS Code)
- Postman
- curl

```bash
# Example API test
curl -X POST http://localhost:4000/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Post","content":"Hello"}'
```

## Documentation

Update documentation when:

- Adding new features
- Changing APIs or interfaces
- Modifying setup/deployment process
- Adding environment variables
- Updating dependencies

## Review Process

### What to Expect

1. **Initial Review**: A maintainer will review within 2-3 business days
2. **Feedback**: You may receive requests for changes
3. **Iteration**: Make requested changes and push updates
4. **Approval**: Once approved, your PR will be merged
5. **Deployment**: Changes are deployed automatically on merge

### Addressing Feedback

```bash
# Make requested changes
git add .
git commit -m "fix: address review feedback"
git push origin feature/your-feature-name
```

### Keeping Your PR Updated

```bash
# Sync with upstream main
git checkout main
git pull upstream main
git checkout feature/your-feature-name
git rebase main
git push --force-with-lease origin feature/your-feature-name
```

## Common Issues

### Merge Conflicts

```bash
# Update from main
git fetch upstream
git rebase upstream/main

# Resolve conflicts in your editor
git add .
git rebase --continue
git push --force-with-lease origin feature/your-feature-name
```

### Failed CI Checks

- Review the error messages in GitHub Actions
- Fix issues locally
- Push fixes to your branch
- CI will re-run automatically

### Database Migration Conflicts

- Coordinate with other contributors
- Rebase and regenerate migrations if needed
- Test thoroughly before submitting

## Getting Help

If you need help:

1. **Check documentation**: Look through existing docs
2. **Search issues**: See if your question was already answered
3. **Ask in discussions**: Use GitHub Discussions for questions
4. **Open an issue**: For bugs or unclear documentation

## Recognition

Contributors will be:

- Listed in commit history
- Mentioned in release notes
- Added to the contributors list (if significant contribution)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project AGPL-3.0.

## Questions?

Feel free to reach out to the maintainers if you have any questions or need clarification on anything!

Thank you for contributing to Isekai!
