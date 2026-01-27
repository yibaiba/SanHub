# Project Context

## Purpose
SanHub is a unified creation platform integrating multiple AI generation services including Sora, Gemini, and Z-Image. It provides a seamless workspace for users to generate videos, images, and manage workflows, featuring a robust backend that supports both local development and production scalability.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS, Radix UI, Lucide React
- **Authentication**: NextAuth.js (v4)
- **Database**: Dual-stack support for SQLite (`better-sqlite3`) and MySQL (`mysql2`) via custom adapter
- **Core Libraries**: `undici` (HTTP), `bcryptjs` (Security), `browser-image-compression`

## Project Conventions

### Code Style
- **TypeScript**: Strict type checking.
- **Components**: Functional components with hooks.
- **Styling**: Utility-first CSS with Tailwind; `clsx` and `tailwind-merge` for class management.
- **Naming**: PascalCase for components, camelCase for functions/variables.

### Architecture Patterns
- **Modular Design**: Feature-based directory structure (Video, Workspace, Admin).
- **Adapter Pattern**: `lib/db-adapter.ts` abstracts database operations to support switching between SQLite and MySQL.
- **Factory Pattern**: Used for instantiating the correct database adapter based on environment.
- **Service Layer**: `lib/sora-api.ts` encapsulates external AI service interactions with robust error handling and polling.

### Testing Strategy
- Manual testing of AI generation flows.
- Validation of database adapter compatibility (SQLite vs MySQL).

### Git Workflow
- **Branches**: `main` (stable), `dev` (active development).
- **Commits**: Conventional Commits format (feat, fix, perf, etc.).

## Domain Context
- **AI Generation**: Handling long-running tasks (video generation) with asynchronous polling and progress tracking.
- **Workflow Management**: Node-based workflow canvas for chaining AI tasks.
- **Multi-Model Integration**: Unified interface for different AI providers (Sora, Gemini, etc.).

## Important Constraints
- **Database Agnostic**: Core logic MUST work with both SQLite and MySQL without modification. Use the `DBAdapter` interface.
- **Real-time Auth**: Session callbacks must query the database to ensure banned users or permission changes take effect immediately.
- **Response Parsing**: The API client must handle various response formats (JSON, NewAPI wrappers, URL-encoded) robustly.

## External Dependencies
- **AI Services**: Sora, Gemini, Z-Image APIs.
- **Infrastructure**: Docker (for containerized deployment).
