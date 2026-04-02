# REBUSS Azure DevOps Dashboard

A **Chrome/Edge browser extension** that brings your Azure DevOps pull requests and sprint tasks directly into your browser's side panel — with smart filtering, real-time status tracking, and at-a-glance work item visibility.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)
![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-orange.svg)

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Developer Guide](#developer-guide)
- [Architecture](#architecture)
- [Security](#security)
- [License](#license)

---

## Features

### Pull Request Tracker

Monitor all active pull requests in your Azure DevOps project — no context switching required.

| Filter | What it shows |
|--------|--------------|
| **All** | Every open PR where your team is a reviewer |
| **Needs My Review** | PRs where your approval is still pending — your daily action list |
| **Approved** | PRs you have already approved |
| **My PR** | PRs you authored (active and drafts) |
| **Done** | PRs you have locally marked as finished |

Each PR card displays:
- Title linking directly to Azure DevOps
- Author, repository, and project
- Source → target branch reference
- Approval status badge (Approved, Needs Review, Waiting for Author, Rejected)
- Linked work items (tasks, bugs, features)
- **Done** checkbox for personal tracking

### Intelligent PR Classification

The extension automatically classifies every PR so that noise is minimised:

- **Draft PRs** are shown in a muted style — no action expected
- **Waiting for Author** PRs are muted only when no new commits have been pushed since your vote
- PRs you created never appear in the "Needs My Review" list
- Team votes can optionally be treated as your personal approval (configurable)

### Work Item Integration

Each PR card shows its linked Azure DevOps work items (tasks, bugs, epics, etc.) fetched from the API with in-memory caching for fast, efficient loading.

### Sprint & Active Tasks Footer

A collapsible footer shows:
- Your current team sprint with a direct link to the sprint board
- Your work items in **Active** state for the ongoing sprint

This feature is optional and requires a separate sprint team to be configured.

### Auto-Refresh

Never miss an update — the extension can automatically refresh PR data in the background:

- Configurable interval between **1 and 60 minutes** (default: 5 minutes)
- Uses Chrome's Alarms API — no battery-draining polling
- Toggle auto-refresh on or off from the settings page
- Manual refresh button always available in the panel header

---

## Quick Start

> **Prerequisites:** Google Chrome or Microsoft Edge with Developer Mode enabled.

1. **Clone or download** this repository.

2. **Open** `chrome://extensions/` (or `edge://extensions/`).

3. **Enable Developer mode** (toggle in the top-right corner).

4. **Click "Load unpacked"** and select the repository folder.

5. **Pin the extension** to the toolbar and click its icon to open the side panel.

6. **Open Settings** (⚙️ gear icon in the panel header) and fill in:
   - Azure DevOps **Organization** slug
   - **Project** name
   - **Team** name (used to find PRs where this team is a reviewer)
   - **Personal Access Token** (PAT) with *Code (Read)* scope

7. **Click "Test Connection"** to verify, then **Save**.

8. The panel will load your active pull requests immediately.

---

## Installation

### Requirements

| Requirement | Minimum version |
|-------------|----------------|
| Google Chrome | 114+ (Manifest V3) |
| Microsoft Edge | 114+ (Manifest V3) |
| Azure DevOps | Any hosted or on-premises instance supporting REST API 7.1 |

### Steps

1. Download or clone the repository:
   ```bash
   git clone https://github.com/rebuss/REBUSS.AzureDevOps.Dashboard.git
   cd REBUSS.AzureDevOps.Dashboard
   ```

2. No build step is required — the extension runs directly from source.

3. Load it in Chrome/Edge:
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the repository root folder

4. The extension icon appears in the toolbar. Click it to open the side panel.

---

## Configuration

All settings are managed from the **Options page**, accessible via the ⚙️ button in the panel header or via `chrome://extensions/` → *Details* → *Extension options*.

### Required Settings

| Setting | Description | Example |
|---------|-------------|---------|
| **Organization** | Your Azure DevOps organisation slug (the URL segment after `dev.azure.com/`) | `mycompany` |
| **Project** | The Azure DevOps project name | `MyProject` |
| **Team** | The team name whose PR reviews you want to track | `Backend Team` |
| **Personal Access Token** | A PAT with at least *Code (Read)* permission | *(secret)* |

#### Creating a Personal Access Token

1. Go to `https://dev.azure.com/{your-org}/_usersSettings/tokens`
2. Click **New Token**
3. Give it a descriptive name (e.g., "Dashboard Extension")
4. Set an expiry date
5. Under **Scopes**, select **Code → Read**
6. Click **Create** and copy the token immediately

### Optional Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Sprint Team** | A separate team name used to display the current sprint and your active tasks in the footer | *(empty – footer hidden)* |
| **Auto-Refresh** | Enable background data refresh | `on` |
| **Refresh Interval** | How often to refresh data (1–60 minutes) | `5` minutes |
| **Treat team vote as approval** | If the team voted *Approved*, count that as your personal approval when evaluating the "Needs My Review" filter | `off` |

### Test Connection

After entering your credentials, click **Test Connection** to validate that:
- The organisation, project, and team names are correct
- The PAT is valid and has sufficient permissions

A green success message confirms the connection is working.

---

## Usage

### Opening the Panel

Click the extension icon in the Chrome toolbar. A side panel appears on the right side of the browser window and automatically loads your pull requests.

### Navigating Filters

Use the tab bar at the top of the panel to switch between PR views:

- **All** — full list of open PRs for your team
- **Needs My Review** — focus mode: only PRs waiting for your approval
- **Approved** — PRs you have approved
- **My PR** — PRs you created
- **Done** — PRs you have personally checked off

### Marking a PR as Done

Each PR card has a **Done** checkbox in the top-right corner. Checking it moves the PR to the *Done* filter so it no longer appears in *Needs My Review* or *All*. This is a local setting stored in your browser.

### Refreshing Data

- **Manual refresh**: Click the 🔄 refresh icon in the panel header.
- **Auto-refresh**: Enable in settings with your preferred interval; a background alarm triggers the update automatically.

### Sprint Footer

If a **Sprint Team** is configured, the bottom of the panel shows:
- The current sprint name with a link to the sprint board
- Your personally assigned work items in **Active** state

Click the footer to expand or collapse it.

---

## Developer Guide

### Prerequisites

- Node.js 16 or later
- npm

### Setup

```bash
npm install
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run the full test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Check code for linting issues |
| `npm run lint:fix` | Automatically fix linting issues |
| `npm run format` | Format all source files with Prettier |
| `npm run format:check` | Check formatting without modifying files |

### Running Tests

```bash
npm test
```

Tests are written with [Vitest](https://vitest.dev/) and cover:

| Test file | Coverage area |
|-----------|--------------|
| `tests/prClassifier.test.js` | PR approval classification logic |
| `tests/pr-tracker-filter.test.js` | PR filter logic (Needs Review, Approved, etc.) |
| `tests/sprintService.test.js` | Sprint & active-task fetching |
| `tests/workItemService.test.js` | Work item caching & batching |
| `tests/dom-utils.test.js` | DOM utility helpers |
| `tests/constants.test.js` | Constant value validation |

### Code Style

- **Linting**: ESLint (see `eslint.config.mjs`)
- **Formatting**: Prettier with 120-character line width and single quotes (see `.prettierrc`)

---

## Architecture

```
├── background.js          Service worker – manages alarms & message routing
├── manifest.json          Chrome Manifest V3 declaration
│
├── core/
│   ├── constants.js       Shared constants (API versions, storage keys, vote values)
│   └── logger.js          Configurable logging utility
│
├── services/
│   ├── azureDevopsClient.js   Azure DevOps REST API wrapper
│   ├── configService.js       Read/write extension settings via chrome.storage
│   ├── prClassifier.js        Pure domain logic for PR status classification
│   ├── sprintService.js       Sprint & active-task aggregation
│   └── workItemService.js     Work item fetching with in-memory cache
│
├── features/
│   └── pr-tracker/
│       ├── pr-tracker.view.js  Main PR tracker UI (extends BaseView)
│       └── pr-tracker.css
│
├── shared/
│   ├── base-view.js       Abstract base class for all feature views
│   ├── dom-utils.js       DOM helper functions (createElement, escapeHtml, …)
│   └── tab-router.js      Lightweight tab registry with mount/unmount lifecycle
│
├── panel/
│   ├── panel.html         Side panel HTML shell
│   ├── panel.js           Panel bootstrap & tab router initialisation
│   └── panel.css
│
└── options/
    ├── options.html        Settings form
    ├── options.js
    └── options.css
```

### Design Patterns

| Pattern | Where used |
|---------|-----------|
| **View lifecycle** (`mount` → `render` → `refresh` → `unmount`) | `BaseView`, `PrTrackerView` |
| **Service layer** | `azureDevopsClient`, `configService`, `sprintService`, `workItemService` |
| **Tab router** | `TabRouter` in `shared/tab-router.js` |
| **In-memory cache** | `WorkItemService` — prevents redundant API calls within a session |
| **Message passing** | `background.js` ↔ `panel.js` via `chrome.runtime.sendMessage` |

### PR Vote Scale

```
+10  Approved
 +5  Approved with suggestions
  0  No vote
 -5  Waiting for Author
-10  Rejected
```

---

## Security

| Aspect | Implementation |
|--------|---------------|
| **PAT storage** | Stored in Chrome's sandboxed `chrome.storage.local` — inaccessible to web pages |
| **Authentication** | HTTP Basic Auth (`Authorization: Basic base64(":" + pat)`) |
| **Minimum scope** | Only *Code (Read)* permission is required |
| **XSS prevention** | All user-controlled values are passed through `escapeHtml()` before DOM insertion |
| **No external services** | All data flows exclusively between the extension and your Azure DevOps instance |

---

## License

MIT © 2026 REBUSS — see [LICENSE](./LICENSE) for full text.
