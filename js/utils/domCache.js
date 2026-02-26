// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — DOM Cache and Event Delegation
// ═══════════════════════════════════════════════════════════

/**
 * DOM Cache for storing frequently accessed elements
 * Reduces repeated querySelector/querySelectorAll calls
 */
class DOMCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Get element by ID with caching
     */
    getElement(id) {
        if (!this.cache.has(id)) {
            const element = document.getElementById(id);
            if (element) {
                this.cache.set(id, element);
            }
        }
        return this.cache.get(id) || null;
    }

    /**
     * Get elements by selector with caching
     */
    getElements(selector) {
        if (!this.cache.has(selector)) {
            const elements = document.querySelectorAll(selector);
            this.cache.set(selector, Array.from(elements));
        }
        return this.cache.get(selector) || [];
    }

    /**
     * Clear cache for specific key or all
     */
    clear(key = null) {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Refresh cached element (useful when DOM changes)
     */
    refresh(key) {
        if (key.startsWith('#')) {
            const element = document.getElementById(key.slice(1));
            if (element) {
                this.cache.set(key, element);
            } else {
                this.cache.delete(key);
            }
        } else {
            const elements = document.querySelectorAll(key);
            this.cache.set(key, Array.from(elements));
        }
    }
}

/**
 * Event Delegation Manager
 * Reduces number of event listeners by using delegation
 */
class EventDelegator {
    constructor() {
        this.delegators = new Map();
    }

    /**
     * Set up event delegation for a container
     * @param {string} selector - Container selector
     * @param {string} eventType - Event type (click, change, etc.)
     * @param {string} targetSelector - Target element selector
     * @param {Function} handler - Event handler
     * @param {Object} options - Event listener options
     */
    delegate(selector, eventType, targetSelector, handler, options = {}) {
        const key = `${selector}:${eventType}:${targetSelector}`;
        
        // Remove existing if any
        if (this.delegators.has(key)) {
            this.undelegate(selector, eventType, targetSelector);
        }

        const container = document.querySelector(selector);
        if (!container) {
            console.warn(`EventDelegator: Container not found for ${selector}`);
            return;
        }

        const delegator = (e) => {
            const target = e.target.closest(targetSelector);
            if (target && container.contains(target)) {
                handler.call(target, e, target);
            }
        };

        container.addEventListener(eventType, delegator, options);
        this.delegators.set(key, { container, eventType, delegator });
    }

    /**
     * Remove event delegation
     */
    undelegate(selector, eventType, targetSelector) {
        const key = `${selector}:${eventType}:${targetSelector}`;
        const delegator = this.delegators.get(key);
        
        if (delegator) {
            delegator.container.removeEventListener(eventType, delegator.delegator);
            this.delegators.delete(key);
        }
    }

    /**
     * Clean up all delegations
     */
    cleanup() {
        this.delegators.forEach((delegator) => {
            delegator.container.removeEventListener(delegator.eventType, delegator.delegator);
        });
        this.delegators.clear();
    }
}

// Global instances
export const domCache = new DOMCache();
export const eventDelegator = new EventDelegator();

/**
 * Utility to set up multiple event delegations at once
 */
export function setupDelegations(delegations) {
    delegations.forEach(({ selector, eventType, targetSelector, handler, options }) => {
        eventDelegator.delegate(selector, eventType, targetSelector, handler, options);
    });
}

/**
 * Utility to get element with cache
 */
export function getElement(id) {
    return domCache.getElement(id);
}

/**
 * Utility to get elements with cache
 */
export function getElements(selector) {
    return domCache.getElements(selector);
}

/**
 * Clean up both DOM cache and event delegations
 */
export function cleanupDOM() {
    domCache.clear();
    eventDelegator.cleanup();
}
