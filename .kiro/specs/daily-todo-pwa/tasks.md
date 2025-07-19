# Implementation Plan

- [x] 1. Set up project structure and core interfaces

  - Create directory structure for features (tasks, today, logs, stats, onboarding)
  - Set up Vite + React + TypeScript + PWA plugin configuration
  - Install and configure dependencies (Zustand, Dexie, Supabase, Tailwind)
  - Create shared domain abstractions (ValueObject base class, Result type)
  - _Requirements: 9.1, 9.2_

- [x] 2. Implement core domain value objects and entities

  - [x] 2.1 Create value objects with validation

    - Implement TaskId (ULID), DateOnly, NonEmptyTitle value objects
    - Add validation logic and error handling for invalid values
    - Write unit tests for value object creation and validation
    - _Requirements: 11.1, 11.2_

  - [x] 2.2 Implement Task entity with domain logic

    - Create Task entity with all required fields and methods
    - Implement changeCategory(), complete(), revertCompletion(), isOverdue() methods
    - Add domain event generation for state changes
    - Write comprehensive unit tests for Task entity behavior
    - _Requirements: 1.3, 2.5, 11.5, 11.6_

  - [x] 2.3 Create domain events system

    - Implement DomainEvent base class and specific events (TaskCreated, TaskCompleted, etc.)
    - Create EventBus interface with publish/subscribe methods
    - Write unit tests for event creation and bus functionality
    - _Requirements: 9.4_

  - [x] 2.4 Implement persistent EventBus with delivery guarantees
    - Create EventStoreRecord, HandledEventRecord, and LockRecord schemas
    - Update TodoDatabase to version 2 with eventStore, handledEvents, and locks tables
    - Implement PersistentEventBus with at-least-once processing guarantees
    - Add per-aggregate ordered processing with aggregateId serialization
    - Implement retry mechanism with exponential backoff + jitter
    - Add multi-tab coordination using Web Locks API with database fallback
    - Create EventHandler interface with unique IDs for idempotency tracking
    - Write comprehensive tests for event processing, retry logic, and ordering
    - _Requirements: 9.4, 10.1, 10.4_

- [x] 3. Set up local storage infrastructure

  - [x] 3.1 Configure IndexedDB with Dexie

    - Create TodoDatabase class with all required tables and indexes
    - Implement database versioning and migration strategy
    - Add connection management and error handling
    - Write integration tests for database operations
    - _Requirements: 10.1, 10.4_

  - [x] 3.2 Implement repository pattern for tasks

    - Create TaskRepository interface with all CRUD operations
    - Implement TaskRepositoryImpl with IndexedDB operations
    - Add soft delete functionality with global filtering
    - Write integration tests for repository operations
    - _Requirements: 11.1, 11.2, 11.3, 11.7_

  - [x] 3.3 Implement daily selection repository
    - Create DailySelectionRepository interface
    - Implement repository with daily_selection_entries table operations
    - Add UNIQUE(date, taskId) constraint handling for idempotent upserts
    - Write integration tests for daily selection operations
    - _Requirements: 2.1, 2.3, 15.1, 15.3_

- [x] 4. Create application layer use cases

  - [x] 4.1 Implement task management use cases

    - Create CreateTaskUseCase with validation and transactional event publishing
    - Implement CompleteTaskUseCase with transactional updates (task + syncQueue + events)
    - Add UpdateTaskUseCase for title and category changes with event publishing
    - Ensure all UseCase transactions include tasks, syncQueue, and eventStore tables
    - Write unit tests for all use cases with mocked dependencies and transaction verification
    - _Requirements: 11.1, 11.3, 11.4, 11.5_

  - [x] 4.2 Implement daily selection use cases

    - Create AddTaskToTodayUseCase with DailySelectionEntry creation
    - Implement RemoveTaskFromTodayUseCase
    - Add GetTodayTasksUseCase with task filtering and status
    - Write unit tests for daily selection use cases
    - _Requirements: 2.1, 2.2, 2.3, 15.4, 15.6_

  - [x] 4.3 Create logging use cases
    - Implement CreateSystemLogUseCase for automatic log generation
    - Create CreateUserLogUseCase with 500 character validation
    - Add GetTaskLogsUseCase with pagination (20 records per page)
    - Write unit tests for logging use cases
    - _Requirements: 3.1, 3.4, 12.1, 12.2, 12.4_

- [-] 5. Build presentation layer with MVVM pattern

  - [x] 5.1 Create task management ViewModels

    - Implement TaskViewModel using Zustand with task state management
    - Add methods for creating, updating, completing, and deleting tasks
    - Implement category filtering and overdue task detection
    - Write unit tests for ViewModel state management
    - _Requirements: 1.1, 1.2, 1.7, 1.8_

  - [x] 5.2 Build task UI components

    - Create TaskList component with category grouping
    - Implement TaskCard component with category indicators and actions
    - Add CreateTaskModal with category selection
    - Build responsive design with Tailwind CSS for mobile and desktop
    - _Requirements: 1.4, 1.5, 1.6, 5.1, 5.2_

  - [x] 5.3 Implement today view components
    - Create TodayView component showing selected tasks
    - Add task selection/deselection functionality with sun icon
    - Implement daily reset handling with new DailySelection creation
    - Write component tests for today view functionality
    - _Requirements: 2.1, 2.2, 2.4_

- [x] 6. Implement logging system UI

  - [x] 6.1 Create logging ViewModels and components

    - Implement LogViewModel with pagination and filtering
    - Create TaskLogList component with system/user log differentiation
    - Add CreateLogModal for custom user logs
    - Implement log retention cleanup as background task
    - _Requirements: 3.2, 3.3, 3.6, 12.3, 12.6_

  - [x] 6.2 Add log display to task components
    - Show last log preview in TaskCard components
    - Implement expandable log history view
    - Add visual indicators for different log types
    - Write component tests for log display functionality
    - _Requirements: 3.2, 3.3_

- [x] 7. Build statistics and analytics features

  - [x] 7.1 Implement statistics calculation

    - Create StatisticsService with completion tracking by category
    - Implement inbox review tracking (first move from INBOX)
    - Add daily/weekly/monthly statistics aggregation
    - Create nightly snapshot system for stats_daily table
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_
    - [x] 7.2 Create statistics UI components
    - Build StatisticsView with period selection (day/week/month)
    - Implement charts and metrics display
    - Add proper ISO week and calendar month calculations
    - Write component tests for statistics display
    - _Requirements: 8.5_

  - [x] 7.3 Implement event handlers for statistics and logging

    - Create TaskLogEventHandler with idempotent UPSERT operations
    - Implement StatsUpdateHandler with existing record checks and timestamp validation
    - Add NotificationHandler for overdue task notifications
    - Ensure all handlers follow idempotency patterns (UPSERT, existing checks, handledEvents)
    - Write unit tests for handler idempotency and error scenarios
    - _Requirements: 3.1, 8.1, 8.2, 9.4_

  - [x] 7.4 Implement event processing monitoring and cleanup

    - Create EventMonitor with processing statistics (pending, processing, done, dead)
    - Implement EventCleanupService for processed events cleanup (30+ days old)
    - Add dead letter queue management with reprocessing capabilities
    - Create event processing dashboard for debugging and monitoring
    - Write integration tests for monitoring and cleanup functionality
    - _Requirements: 9.4, 10.1, 10.4_

- [x] 8. Implement onboarding and motivational features

  - [x] 8.1 Create daily modal system
  
    - Implement OnboardingService with morning window detection (6-11 AM)
    - Create DailyModalData aggregation with unfinished and overdue tasks
    - Add motivational message system with random selection
    - Build modal UI with task overview and motivation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 8.2 Add user settings management
    - Create UserSettingsRepository with local storage
    - Implement settings for inbox overdue days (default 3)
    - Add keyboard shortcuts toggle (default enabled on desktop)
    - Create settings UI for user customization
    - _Requirements: 1.9, 14.1, 14.2, 14.4, 14.5, 14.6_

- [x] 9. Add keyboard shortcuts and accessibility

  - [x] 9.1 Implement keyboard shortcut system

    - Create KeyboardShortcutService with shortcut registration
    - Add shortcuts for task creation (Ctrl+N), custom logs (Ctrl+L)
    - Implement category navigation (1, 2, 3) and today view (T)
    - Add form shortcuts (Escape, Enter) and mobile detection
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 9.2 Enhance accessibility and responsive design
    - Add ARIA labels and keyboard navigation support
    - Implement touch gesture handling for mobile devices
    - Create adaptive layouts for different screen sizes
    - Test and optimize for screen readers
    - _Requirements: 5.4, 13.1, 13.2, 13.3_

- [ ] 10. Build sync engine and cloud integration

  - [ ] 10.1 Implement sync queue and outbox pattern

    - Create SyncQueueRepository with outbox pattern implementation
    - Add operation tracking (create/update/delete) with payload hashing
    - Implement retry logic with exponential backoff
    - Write integration tests for sync queue operations
    - _Requirements: 6.3, 10.2, 13.6_

  - [ ] 10.2 Create Supabase adapter and conflict resolution

    - Implement SupabaseAdapter with authentication and CRUD operations
    - Add Last-Write-Wins conflict resolution with tie-breaker logic
    - Create conflict logging with detailed metadata
    - Build pull strategy with sync cursors
    - _Requirements: 6.1, 6.4, 10.3, 10.5_

  - [ ] 10.3 Integrate sync engine with application
    - Connect sync engine to domain events for automatic synchronization
    - Add offline detection and user notification system
    - Implement background sync with connection restoration
    - Create sync status indicators in UI
    - _Requirements: 6.2, 6.5, 13.3, 13.4, 13.5_

- [ ] 11. Configure PWA and offline functionality

  - [ ] 11.1 Set up PWA configuration

    - Configure Vite PWA plugin with service worker
    - Create app manifest with icons and display settings
    - Implement app shell caching strategy
    - Add offline page and error handling
    - _Requirements: 5.3, 5.5_

  - [ ] 11.2 Optimize performance and caching
    - Implement virtual scrolling for large task lists
    - Add debounced search and filtering
    - Create optimistic updates with rollback on failure
    - Add performance instrumentation with p95 metrics
    - _Requirements: 13.1, 13.5_

- [ ] 12. Testing and quality assurance

  - [ ] 12.1 Write comprehensive unit tests

    - Test all domain entities, value objects, and use cases
    - Add repository contract tests for all implementations
    - Create ViewModel tests with state management scenarios
    - Achieve 70% coverage target for unit tests
    - _Requirements: 9.6_

  - [ ] 12.2 Implement integration and E2E tests
    - Create sync engine integration tests with conflict scenarios
    - Add race condition tests for concurrent task modifications
    - Build PWA functionality tests (offline, caching, installation)
    - Test critical user journeys end-to-end
    - _Requirements: 9.6_

- [ ] 13. Final integration and deployment preparation

  - [ ] 13.1 Complete feature integration

    - Wire all features together in main application shell
    - Test complete user workflows across all features
    - Verify all requirements are implemented and working
    - Fix any integration issues and edge cases
    - _Requirements: All requirements_

  - [ ] 13.2 Performance optimization and deployment setup
    - Optimize bundle size with code splitting by feature
    - Configure production build with proper caching headers
    - Set up deployment pipeline for PWA hosting
    - Create user documentation and deployment guide
    - _Requirements: 13.1, 13.2_
