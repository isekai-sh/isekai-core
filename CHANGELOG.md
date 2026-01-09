# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.3] - 2025-12-28

### Added

- Storage abstraction layer to support S3 compatible object storage providers
- MinIO as default storage
- SaaS configuration based deployment features

## [0.1.0-alpha.2] - 2025-12-22

This version enables users run the application via pre-built Docker images.

### Added

- Easily run via Docker compose
- Set up unit tests in apps
- Updated Github Actions to support test, build, and Docker image push to registry

### Known Issues

- Low coverage in frontend unit tests
- Linting warnings still not addressed

## [0.1.0-alpha.1] - 2025-12-21

Initial alpha release of Isekai - A DeviantArt automation and management platform.

### Features

**Authentication & Core**

- DeviantArt OAuth 2.0 authentication
- Session-based user management
- API key system for external integrations

**Deviation Management**

- Draft system for managing unpublished work
- Scheduled queue for automated publishing
- Published history with activity tracking
- Review system for content curation

**Automation**

- Workflow automation for scheduled publishing
- Configurable automation rules
- Schedule-based triggers
- Default values management
- Dedicated publisher worker

**Exclusives & Sales**

- Exclusives Queue for managing exclusive sales
- Price preset system (fixed pricing and random ranges)
- Queue status tracking and monitoring
- Automatic retry mechanism for failed operations

**Organization**

- Gallery management with drag-and-drop ordering
- Gallery folder synchronization
- Template system for reusable deviation metadata

**Browse - Inspiration**

- Browse deviations with multiple modes (home, daily, following, tags, topics, user galleries)
- Global tag search with keyboard shortcuts (⌘/Ctrl + K)
- Intelligent caching for performance

**Technical Stack**

- Frontend: React 18, TypeScript, TanStack Query, React Router, shadcn/ui
- Backend: Express.js, PostgreSQL, Redis, Drizzle ORM
- Caching: Redis-based intelligent caching with configurable TTL
- Architecture: Monorepo structure with shared types

### Known Issues

- Still lacks comprehensive unit and e2e testing
- No test coverage
- Lots of linting warnings
- Chrome extension to execute exclusive sale is yet to be developed (separate repository)

---

## Release Notes Format

### Version Number Scheme

This project uses [Semantic Versioning](https://semver.org/):

- **v0.x.x**: Development versions (breaking changes may occur)
- **v1.0.0+**: Stable versions (breaking changes only on major version bumps)

### Pre-release Identifiers

- **alpha**: Early development, expect bugs and missing features
- **beta**: Feature-complete, testing and bug fixes
- **rc**: Release candidate, final testing before stable release

---

<!-- Template for future releases:

## [0.1.0-alpha.1] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Deprecated
- Features that will be removed in future versions

### Removed
- Features that have been removed

### Fixed
- Bug fixes

### Security
- Security improvements and fixes

-->
