# Project Structure

## Root Level Organization
```
├── src/                    # Source code
├── tests/                  # E2E tests (Playwright)
├── dist/                   # Build output
├── assets/                 # Static assets
└── Configuration files     # Package.json, configs, etc.
```

## Source Code Architecture (`src/`)

### Clean Architecture Layers

#### Domain Layer (`src/shared/domain/`)
- **entities/**: Core business entities (Task)
- **value-objects/**: Immutable value types (TaskId, NonEmptyTitle, DateOnly)
- **events/**: Domain events and event bus
- **repositories/**: Repository interfaces
- **types.ts**: Core domain types and enums

#### Application Layer (`src/shared/application/`)
- **use-cases/**: Business logic orchestration
- **services/**: Application services
- Each use case follows Command pattern with execute() method

#### Infrastructure Layer (`src/shared/infrastructure/`)
- **database/**: Database implementations (TodoDatabase with Dexie)
- **repositories/**: Repository implementations
- **di/**: Dependency injection container and tokens
- **services/**: Infrastructure services (keyboard shortcuts, touch gestures)
- **utils/**: Utility functions

#### Presentation Layer (`src/features/`)
Feature-based organization with:
- **application/**: Feature-specific services and event handlers
- **presentation/components/**: React components
- **presentation/view-models/**: State management and business logic
- **presentation/hooks/**: Custom React hooks

### Feature Modules
- **features/tasks/**: Task management
- **features/today/**: Today view functionality  
- **features/logs/**: Task logging system
- **features/stats/**: Statistics and analytics
- **features/onboarding/**: User onboarding and settings

### MVP Implementation (`src/mvp/`)
- **MVPApp.tsx**: Main application without DI
- **MVPAppWithDI.tsx**: DI-enabled version (placeholder)
- **components/**: MVP-specific components

### Shared Resources (`src/shared/`)
- **lib/**: Utility libraries
- **ui/**: Reusable UI components

## Naming Conventions

### Files & Directories
- **PascalCase**: React components, classes, types
- **camelCase**: Functions, variables, hooks
- **kebab-case**: File names for non-components
- **SCREAMING_SNAKE_CASE**: Constants and tokens

### Architecture Patterns
- **Entities**: Rich domain models with behavior
- **Value Objects**: Immutable, validated data containers
- **Use Cases**: Single responsibility business operations
- **Repositories**: Data access abstraction
- **View Models**: Presentation state management
- **Events**: Domain event sourcing for side effects

## Testing Structure
- **Unit tests**: Co-located in `__tests__/` folders
- **E2E tests**: Separate `tests/` directory
- **Test setup**: `src/test/setup.ts`

## Key Architectural Principles
- **Dependency Inversion**: High-level modules don't depend on low-level modules
- **Single Responsibility**: Each class/function has one reason to change
- **Domain-Driven Design**: Business logic encapsulated in domain layer
- **Event-Driven Architecture**: Domain events for decoupled side effects
- **Feature-Based Organization**: Related functionality grouped together