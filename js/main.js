// ═══════════════════════════════════════════════════════════
// LIQUID GLASS — Main Entry Point
// ═══════════════════════════════════════════════════════════

import { loadInitialState, setupEventListeners, initializeCharts, initializePanels } from './events/init.js';

// Simple entry point
async function init() {
    console.log('Initializing Liquid Glass...');

    // Load state and settings first
    loadInitialState();

    // Setup event listeners
    setupEventListeners();

    // Initialize panels (charts are rendered within loadInitialState via renderTable)
    initializePanels();

    console.log('Liquid Glass initialized');
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
} else {
    init();
}
