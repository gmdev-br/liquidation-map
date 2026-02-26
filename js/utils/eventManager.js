// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Event Manager with Automatic Cleanup
// ═══════════════════════════════════════════════════════════

/**
 * Centralized event manager with automatic cleanup and delegation
 * Reduces memory leaks and improves performance
 */

class EventManager {
    constructor() {
        this.listeners = new Map();
        this.delegations = new Map();
        this.cleanupHandlers = new Set();
    }

    /**
     * Add event listener with automatic cleanup tracking
     */
    on(element, eventType, handler, options = {}) {
        if (!element) {
            console.warn('EventManager: Element is null or undefined');
            return;
        }

        element.addEventListener(eventType, handler, options);

        const key = `${element}:${eventType}`;
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }

        this.listeners.get(key).push({ handler, options });

        return () => this.off(element, eventType, handler, options);
    }

    /**
     * Remove event listener
     */
    off(element, eventType, handler, options = {}) {
        if (!element) return;

        const key = `${element}:${eventType}`;
        const listeners = this.listeners.get(key);

        if (listeners) {
            const index = listeners.findIndex(l => l.handler === handler);
            if (index !== -1) {
                listeners.splice(index, 1);
                element.removeEventListener(eventType, handler, options);
            }
        }
    }

    /**
     * Set up event delegation
     */
    delegate(container, eventType, targetSelector, handler, options = {}) {
        if (!container) {
            console.warn('EventManager: Container is null or undefined');
            return;
        }

        const delegationKey = `${container}:${eventType}:${targetSelector}`;

        const delegator = (e) => {
            const target = e.target.closest(targetSelector);
            if (target && container.contains(target)) {
                handler.call(target, e, target);
            }
        };

        container.addEventListener(eventType, delegator, options);

        this.delegations.set(delegationKey, {
            container,
            eventType,
            delegator,
            options
        });

        return () => this.undelegate(container, eventType, targetSelector);
    }

    /**
     * Remove event delegation
     */
    undelegate(container, eventType, targetSelector) {
        const delegationKey = `${container}:${eventType}:${targetSelector}`;
        const delegation = this.delegations.get(delegationKey);

        if (delegation) {
            delegation.container.removeEventListener(delegation.eventType, delegation.delegator, delegation.options);
            this.delegations.delete(delegationKey);
        }
    }

    /**
     * Add cleanup handler to be called on destroy
     */
    addCleanup(handler) {
        this.cleanupHandlers.add(handler);
    }

    /**
     * Clean up all event listeners and delegations
     */
    cleanup() {
        // Remove all listeners
        this.listeners.forEach((listeners, key) => {
            const [element, eventType] = key.split(':');
            listeners.forEach(({ handler, options }) => {
                element.removeEventListener(eventType, handler, options);
            });
        });
        this.listeners.clear();

        // Remove all delegations
        this.delegations.forEach((delegation) => {
            delegation.container.removeEventListener(delegation.eventType, delegation.delegator, delegation.options);
        });
        this.delegations.clear();

        // Run cleanup handlers
        this.cleanupHandlers.forEach(handler => {
            try {
                handler();
            } catch (e) {
                console.error('EventManager: Cleanup handler error:', e);
            }
        });
        this.cleanupHandlers.clear();
    }

    /**
     * Get statistics
     */
    getStats() {
        let listenerCount = 0;
        this.listeners.forEach(listeners => {
            listenerCount += listeners.length;
        });

        return {
            listeners: listenerCount,
            delegations: this.delegations.size,
            cleanupHandlers: this.cleanupHandlers.size
        };
    }
}

// Global event manager instance
export const eventManager = new EventManager();

/**
 * Utility to set up multiple listeners at once
 */
export function setupListeners(setups) {
    const cleanups = [];

    setups.forEach(({ element, eventType, handler, options }) => {
        const cleanup = eventManager.on(element, eventType, handler, options);
        cleanups.push(cleanup);
    });

    return () => {
        cleanups.forEach(cleanup => cleanup());
    };
}

/**
 * Utility to set up multiple delegations at once
 */
export function setupDelegations(delegations) {
    const cleanups = [];

    delegations.forEach(({ container, eventType, targetSelector, handler, options }) => {
        const cleanup = eventManager.delegate(container, eventType, targetSelector, handler, options);
        cleanups.push(cleanup);
    });

    return () => {
        cleanups.forEach(cleanup => cleanup());
    };
}

/**
 * Cleanup all events when page unloads
 */
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        eventManager.cleanup();
    });
}
