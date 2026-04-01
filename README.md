# TruthLens - Chrome Extension

AI-powered fact-checking and research assistant using Chrome's built-in AI

## Overview

TruthLens is a Chrome Extension MV3 that provides:
- **Fact Check** - Extract claims and surface independent fact checks with citations
- **Analyst Chat** - On-device first (Chrome Prompt API, Gemini Nano), Firebase AI Logic cloud fallback
- **Search Overlay** - Summarize top results, highlight claim conflicts, expose sources
- **Report Export** - 1-page Decision Brief (Markdown → PDF)

## Architecture

```
/bg/sw.ts                # service worker: capability checks, APIs, caching, Firebase fallback
/content/content.ts      # selection bubble, text extraction, SERP parsing helpers
/panel/App.tsx           # React side panel (Tabs: Claims • Chat • Brief)
/options/Options.tsx     # toggles: cloud fallback, Feed Guard (experimental)
/lib/adapters/*          # factcheck, summarizer, prompt, writer, pdf, firebase
/lib/state/*             # Zustand store, React Query caches
manifest.json            # MV3, sidePanel, contextMenus, permissions
```

## Development Status

### ✅ Phase 1: Foundation (Agent 1) - COMPLETE
- [x] Chrome Extension MV3 manifest with proper permissions
- [x] Service worker with context menus and capability checks
- [x] Basic message passing between content script and service worker
- [x] Keyboard shortcuts (Alt+Shift+T/F/A)
- [x] Basic side panel structure
- [x] TypeScript configuration and build system

### 🚧 Phase 2: UI & Intelligence (Agents 2-5) - PENDING
- [ ] React + Vite + Tailwind + shadcn/ui stack
- [ ] Panel with three tabs: Claims • Chat • Brief
- [ ] AI adapters for Chrome Prompt API, Summarizer API, Fact Check Tools
- [ ] State management and caching layer

### 🚧 Phase 3: Export (Agent 6) - PENDING
- [ ] PDF export functionality
- [ ] Decision Brief generation

## Quick Start

1. **Build the extension:**
   ```bash
   npm install
   npm run build
   ```

2. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

3. **Test basic functionality:**
   - Click the TruthLens icon to open side panel
   - Right-click on any webpage to see context menus
   - Try keyboard shortcuts: Alt+Shift+T (toggle panel), Alt+Shift+F (fact-check), Alt+Shift+A (ask analyst)

## Permissions Justification

- `activeTab` - Access current tab for text extraction
- `scripting` - Inject content scripts for selection bubbles
- `storage` - Cache fact-check results and user preferences
- `sidePanel` - Display the main TruthLens interface
- `contextMenus` - Right-click fact-checking options
- `https://factchecktools.googleapis.com/*` - Google Fact Check Tools API
- `https://www.google.com/*` - SERP overlay on Google Search
- `<all_urls>` - Text extraction from any webpage (user-initiated only)

## Features

### Context Menus
- **Selection:** "Fact-check with TruthLens"
- **Page:** "Fact-check this page"
- **Both:** "Ask analyst (TruthLens)"

### Keyboard Shortcuts
- `Alt+Shift+T` - Toggle side panel
- `Alt+Shift+F` - Fact-check current selection
- `Alt+Shift+A` - Ask analyst (chat)

### Selection Bubble
- Appears when text is highlighted
- Buttons: **Fact-check** | **Ask analyst**

## Development

```bash
# Install dependencies
npm install

# Build for development
npm run build

# Watch mode (rebuilds on changes)
npm run watch

# Clean build directory
npm run clean
```

## Testing

Currently in Phase 1 - basic integration tests will be added in Phase 2.

## Contributing

This project follows a multi-agent development approach. See `docs/AGENT_PROMPTS.md` for detailed agent assignments and development workflow.

## License

MIT License - see LICENSE file for details.