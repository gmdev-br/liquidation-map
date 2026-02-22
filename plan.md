# Project Plan: Liquidation Map (Whale Watcher) Recovery & Stabilization

## 1. Project Overview
**Name:** Hyperliquid Whale Watcher (Liquidation Map)
**Description:** A real-time dashboard for monitoring whale activity and liquidation risks on the Hyperliquid exchange. Features include leaderboard tracking, scatter/liquidation charts, and comprehensive filtering/sorting capabilities.
**Tech Stack:**
- **Frontend:** HTML5, CSS3 (Modularized), JavaScript (ES6+ Modules)
- **Backend/Scripts:** Python (Analysis & Testing)
- **Data:** Local Storage for persistence, WebSocket/API for real-time data

## 2. Current Status
- **Repository State:** Critical - Git index file is corrupt (`fatal: index file corrupt`).
- **Codebase State:** Active development with recent fixes for settings persistence (detailed in `PERSISTENCE_FIXES.md`).
- **Pending Tasks:** Git repository recovery is the immediate blocker.

## 3. Technical Requirements
- **Git:** Must restore git functionality without data loss.
- **Environment:** Windows (PowerShell).
- **Dependencies:** Node.js (for potential future tooling), Python (for scripts).

## 4. Implementation Roadmap

### Phase 1: Git Repository Recovery (High Priority)
- [ ] **Step 1:** Remove the corrupt git index file (`.git/index`).
- [ ] **Step 2:** Reset the git index to scan current files (`git reset`).
- [ ] **Step 3:** Verify repository status (`git status`).
- [ ] **Step 4:** Create a "Recovery Commit" to secure the current state if needed.

### Phase 2: Project Health Check
- [ ] **Step 1:** Verify file integrity against known good states (if possible).
- [ ] **Step 2:** Run existing test scripts (`test_api.py`, `validate_dashboard.py`).
- [ ] **Step 3:** Verify frontend functionality (open `index.html`).

### Phase 3: Future Improvements (To Be Determined)
- [ ] Review `PERSISTENCE_FIXES.md` for any outstanding items.
- [ ] Optimize data worker performance.
- [ ] Enhance chart rendering efficiency.

## 5. Success Criteria
- **Git Recovery:** `git status` runs without error.
- **Data Integrity:** No source files are lost or corrupted during the recovery process.
- **Operational:** The application can be launched and tested successfully.

## 6. Milestone Breakdown
1.  **M1 - Git Fix:** Repository is accessible and clean.
2.  **M2 - Verification:** All tests pass and the app loads correctly.
