# Technology Stack

## Frontend Framework

- **React 18** with TypeScript
- **Vite** for build tooling and development server
- **PWA** capabilities via vite-plugin-pwa

## Styling & UI

- **Tailwind CSS** for utility-first styling
- **Radix UI** for accessible component primitives (@radix-ui/react-dialog, @radix-ui/react-slot)
- **Lucide React** for icons
- **class-variance-authority** and **clsx** for conditional styling
- **tailwind-merge** for class merging

## State Management & Architecture

- **Zustand** for client state management
- **TSyringe** for dependency injection container
- **reflect-metadata** for decorator support
- Clean Architecture with Domain-Driven Design patterns

## Data & Storage

- **Dexie** for IndexedDB wrapper (offline-first storage)
- **ULID** for unique identifiers
- Local-first architecture with potential Supabase integration

## Testing

- **Vitest** for unit testing with jsdom environment
- **@testing-library/react** and **@testing-library/jest-dom** for component testing
- **Playwright** for end-to-end testing across multiple browsers
- **fake-indexeddb** for database mocking in tests

## Development Tools

- **ESLint** with TypeScript and React plugins
- **PostCSS** with Autoprefixer
- **TypeScript** with strict configuration

## Common Commands

```bash
# Development
npm run dev              # Start development server (Vite)

# Building
npm run build           # TypeScript compilation + Vite build
npm run preview         # Preview production build

# Testing
npm run test            # Run unit tests (Vitest)
npm run test:watch      # Run tests in watch mode
npx playwright test     # Run E2E tests

# Code Quality
npm run lint            # ESLint checking
```

## Architecture Notes

- Uses Clean Architecture with clear separation of concerns
- Domain layer with entities, value objects, and events
- Application layer with use cases and services
- Infrastructure layer with repositories and external adapters
- Presentation layer with React components and view models
