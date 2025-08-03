/**
 * Keyboard shortcut configuration
 */
export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  handler: (event: KeyboardEvent) => void;
  description: string;
  category?: string;
}

/**
 * Keyboard shortcut registration interface
 */
export interface KeyboardShortcutRegistration {
  id: string;
  shortcut: KeyboardShortcut;
}

/**
 * Service for managing keyboard shortcuts
 */
export class KeyboardShortcutService {
  private shortcuts: Map<string, KeyboardShortcutRegistration> = new Map();
  private isEnabled: boolean = true;
  private isMobile: boolean = false;
  private eventListener: ((event: KeyboardEvent) => void) | null = null;

  constructor() {
    this.detectMobile();
    this.setupEventListener();
  }

  /**
   * Register a keyboard shortcut
   */
  register(id: string, shortcut: KeyboardShortcut): void {
    this.shortcuts.set(id, { id, shortcut });
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  /**
   * Enable or disable keyboard shortcuts
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Check if keyboard shortcuts are enabled
   */
  getEnabled(): boolean {
    return this.isEnabled && !this.isMobile;
  }

  /**
   * Get all registered shortcuts
   */
  getShortcuts(): KeyboardShortcutRegistration[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcuts by category
   */
  getShortcutsByCategory(category: string): KeyboardShortcutRegistration[] {
    return Array.from(this.shortcuts.values()).filter(
      (registration) => registration.shortcut.category === category
    );
  }

  /**
   * Check if device is mobile
   */
  private detectMobile(): void {
    if (typeof window !== "undefined") {
      this.isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
    }
  }

  /**
   * Setup global keyboard event listener
   */
  private setupEventListener(): void {
    if (typeof window === "undefined") return;

    this.eventListener = (event: KeyboardEvent) => {
      if (!this.getEnabled()) return;

      // Don't trigger shortcuts when user is typing in input fields
      const target = event.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.contentEditable === "true")
      ) {
        // Allow form shortcuts (Escape, Enter) in input fields
        if (event.key !== "Escape" && event.key !== "Enter") {
          return;
        }
      }

      // Find matching shortcut
      for (const registration of this.shortcuts.values()) {
        if (this.matchesShortcut(event, registration.shortcut)) {
          event.preventDefault();
          event.stopPropagation();
          registration.shortcut.handler(event);
          break;
        }
      }
    };

    window.addEventListener("keydown", this.eventListener);
  }

  /**
   * Check if event matches shortcut
   */
  private matchesShortcut(
    event: KeyboardEvent,
    shortcut: KeyboardShortcut
  ): boolean {
    return (
      event.key.toLowerCase() === shortcut.key.toLowerCase() &&
      !!event.ctrlKey === !!shortcut.ctrlKey &&
      !!event.altKey === !!shortcut.altKey &&
      !!event.shiftKey === !!shortcut.shiftKey &&
      !!event.metaKey === !!shortcut.metaKey
    );
  }

  /**
   * Cleanup event listeners
   */
  destroy(): void {
    if (this.eventListener && typeof window !== "undefined") {
      window.removeEventListener("keydown", this.eventListener);
      this.eventListener = null;
    }
    this.shortcuts.clear();
  }

  /**
   * Format shortcut for display
   */
  static formatShortcut(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];

    if (shortcut.ctrlKey) parts.push("Ctrl");
    if (shortcut.altKey) parts.push("Alt");
    if (shortcut.shiftKey) parts.push("Shift");
    if (shortcut.metaKey) parts.push("Cmd");

    parts.push(shortcut.key.toUpperCase());

    return parts.join(" + ");
  }
}

/**
 * Global keyboard shortcut service instance
 */
export const keyboardShortcutService = new KeyboardShortcutService();
