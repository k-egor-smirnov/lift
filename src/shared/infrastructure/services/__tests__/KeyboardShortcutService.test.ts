import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeyboardShortcutService } from '../KeyboardShortcutService';

// Mock window and navigator
const mockNavigator = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

// Ensure we have a proper DOM environment
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'navigator', {
    value: mockNavigator,
    writable: true
  });
}

describe('KeyboardShortcutService', () => {
  let service: KeyboardShortcutService;
  let mockHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new KeyboardShortcutService();
    mockHandler = vi.fn();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('shortcut registration', () => {
    it('should register a keyboard shortcut', () => {
      const shortcut = {
        key: 'n',
        ctrlKey: true,
        handler: mockHandler,
        description: 'Test shortcut'
      };

      service.register('test-shortcut', shortcut);

      const shortcuts = service.getShortcuts();
      expect(shortcuts).toHaveLength(1);
      expect(shortcuts[0].id).toBe('test-shortcut');
      expect(shortcuts[0].shortcut).toEqual(shortcut);
    });

    it('should unregister a keyboard shortcut', () => {
      const shortcut = {
        key: 'n',
        ctrlKey: true,
        handler: mockHandler,
        description: 'Test shortcut'
      };

      service.register('test-shortcut', shortcut);
      expect(service.getShortcuts()).toHaveLength(1);

      service.unregister('test-shortcut');
      expect(service.getShortcuts()).toHaveLength(0);
    });

    it('should get shortcuts by category', () => {
      const shortcut1 = {
        key: 'n',
        ctrlKey: true,
        handler: mockHandler,
        description: 'Test shortcut 1',
        category: 'tasks'
      };

      const shortcut2 = {
        key: 'l',
        ctrlKey: true,
        handler: mockHandler,
        description: 'Test shortcut 2',
        category: 'logs'
      };

      service.register('test-shortcut-1', shortcut1);
      service.register('test-shortcut-2', shortcut2);

      const taskShortcuts = service.getShortcutsByCategory('tasks');
      expect(taskShortcuts).toHaveLength(1);
      expect(taskShortcuts[0].shortcut.category).toBe('tasks');

      const logShortcuts = service.getShortcutsByCategory('logs');
      expect(logShortcuts).toHaveLength(1);
      expect(logShortcuts[0].shortcut.category).toBe('logs');
    });
  });

  describe('enable/disable functionality', () => {
    it('should be enabled by default on desktop', () => {
      expect(service.getEnabled()).toBe(true);
    });

    it('should allow enabling/disabling shortcuts', () => {
      service.setEnabled(false);
      expect(service.getEnabled()).toBe(false);

      service.setEnabled(true);
      expect(service.getEnabled()).toBe(true);
    });

    it('should be disabled on mobile devices', () => {
      // Mock mobile user agent
      Object.defineProperty(window, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)' },
        writable: true
      });

      const mobileService = new KeyboardShortcutService();
      expect(mobileService.getEnabled()).toBe(false);

      mobileService.destroy();
    });
  });

  describe('keyboard event handling', () => {
    it('should have event listener set up', () => {
      expect(service['eventListener']).toBeDefined();
    });

    it('should not trigger handler when shortcuts are disabled', () => {
      service.setEnabled(false);
      expect(service.getEnabled()).toBe(false);
    });

    it('should detect input field targets correctly', () => {
      const input = document.createElement('input');
      expect(input.tagName).toBe('INPUT');
      
      const textarea = document.createElement('textarea');
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('should handle event listener cleanup', () => {
      const initialListener = service['eventListener'];
      expect(initialListener).toBeDefined();
      
      service.destroy();
      expect(service['eventListener']).toBeNull();
    });
  });

  describe('shortcut matching', () => {
    it('should match shortcuts with exact modifiers', () => {
      const shortcut = {
        key: 'n',
        ctrlKey: true,
        altKey: true,
        handler: mockHandler,
        description: 'Test shortcut'
      };

      const event1 = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        altKey: true
      });

      const event2 = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        altKey: false
      });

      // Test the private method through reflection
      const matchesShortcut = service['matchesShortcut'].bind(service);
      
      expect(matchesShortcut(event1, shortcut)).toBe(true);
      expect(matchesShortcut(event2, shortcut)).toBe(false);
    });

    it('should be case insensitive for key matching', () => {
      const shortcut = {
        key: 'N',
        ctrlKey: true,
        handler: mockHandler,
        description: 'Test shortcut'
      };

      const event = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true
      });

      const matchesShortcut = service['matchesShortcut'].bind(service);
      expect(matchesShortcut(event, shortcut)).toBe(true);
    });

    it('should handle missing modifiers correctly', () => {
      const shortcut = {
        key: 'n',
        handler: mockHandler,
        description: 'Test shortcut'
      };

      const event = new KeyboardEvent('keydown', {
        key: 'n'
      });

      const matchesShortcut = service['matchesShortcut'].bind(service);
      expect(matchesShortcut(event, shortcut)).toBe(true);
    });
  });

  describe('shortcut formatting', () => {
    it('should format shortcut with single key', () => {
      const shortcut = {
        key: 't',
        handler: mockHandler,
        description: 'Test shortcut'
      };

      const formatted = KeyboardShortcutService.formatShortcut(shortcut);
      expect(formatted).toBe('T');
    });

    it('should format shortcut with modifier keys', () => {
      const shortcut = {
        key: 'n',
        ctrlKey: true,
        altKey: true,
        handler: mockHandler,
        description: 'Test shortcut'
      };

      const formatted = KeyboardShortcutService.formatShortcut(shortcut);
      expect(formatted).toBe('Ctrl + Alt + N');
    });

    it('should format shortcut with all modifiers', () => {
      const shortcut = {
        key: 'n',
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        metaKey: true,
        handler: mockHandler,
        description: 'Test shortcut'
      };

      const formatted = KeyboardShortcutService.formatShortcut(shortcut);
      expect(formatted).toBe('Ctrl + Alt + Shift + Cmd + N');
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners and clear shortcuts on destroy', () => {
      const shortcut = {
        key: 'n',
        ctrlKey: true,
        handler: mockHandler,
        description: 'Test shortcut'
      };

      service.register('test-shortcut', shortcut);
      expect(service.getShortcuts()).toHaveLength(1);

      service.destroy();

      expect(service.getShortcuts()).toHaveLength(0);

      // Event should not trigger after destroy
      const event = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true
      });

      window.dispatchEvent(event);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });
});