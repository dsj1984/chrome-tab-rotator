# Chrome Tab Rotator

A Chrome Extension (Manifest V3) that automatically rotates through dashboard URLs in a dedicated "App Mode" window (no address bar).

## Features

- **Popup Configuration UI**: Easy-to-use settings popup to configure URLs and options
- **Pre-load Tabs Mode**: Load all URLs in separate tabs for instant switching (no page load delay)
- **Per-URL Configuration**: Each URL has its own rotation interval and reload frequency
- **Configurable Reload Frequency**: Set how often each URL should refresh (every N visits)
- **Drag & Drop Reordering**: Easily reorder URLs in the popup UI
- **Auto-Start Control**: Configure whether to launch on browser startup
- **Use Existing Window**: Take over an existing window instead of creating a new one
- **Display Keep-Awake**: Prevents screen dimming while dashboard is active
- **Per-Profile Settings**: Configuration is stored per Chrome profile
- **Reliable Timing**: Uses `chrome.alarms` API to avoid throttling
- **Persistent State**: Remembers window state across service worker restarts

## Installation

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `chrome-tab-rotator` folder
5. Click the extension icon in the toolbar to configure

## Configuration

Click the extension icon in the toolbar to open the settings popup. You can configure:

### General Settings

| Option | Description |
|--------|-------------|
| **Auto-start on browser launch** | Automatically open dashboard when Chrome starts |
| **Use existing window** | Take over current window instead of creating new popup |
| **Pre-load tabs (instant switch)** | Load all URLs in separate tabs for instant switching |

### URL Settings

For each URL, you can configure:

| Option | Description |
|--------|-------------|
| **URL** | The dashboard URL to display |
| **Interval (sec)** | How long to show this URL before rotating |
| **Reload every N visits** | How often to force refresh (0 = never, 1 = every time) |

### Drag to Reorder

Use the ⋮⋮ handle on each URL card to drag and reorder URLs.

## Modes of Operation

### Pre-load Tabs Mode (Recommended)
When "Pre-load tabs" is enabled:
- All URLs are loaded in separate tabs at startup
- Switching between URLs is **instant** (no page load)
- Pages stay live and continue updating in the background
- Uses more memory but provides the smoothest experience
- Tabs are refreshed based on the "Reload every N visits" setting

### Standard Mode
When "Pre-load tabs" is disabled:
- Single tab navigates between URLs
- Each switch requires loading the page
- Uses less memory
- Cache-busting is applied based on reload settings

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Extension configuration |
| `background.js` | Service worker handling rotation logic |
| `config.js` | Default configuration values |
| `popup.html/css/js` | Settings popup UI |
| `content.js` | Content script for page transitions |

## Default Configuration

Edit `config.js` to change the default settings that appear on first install:

```javascript
export const DEFAULT_CONFIG = {
  autoStartOnBrowserLaunch: true,
  useExistingWindow: true,
  preloadTabs: true,
  urls: [
    { url: 'https://example.com/dashboard', intervalSeconds: 30, reloadEveryN: 0 },
    { url: 'https://example.com/metrics', intervalSeconds: 15, reloadEveryN: 3 }
  ]
};
```

### URL Entry Options

| Property | Type | Description |
|----------|------|-------------|
| `url` | string | The dashboard URL to display |
| `intervalSeconds` | number | How long to show this URL before rotating |
| `reloadEveryN` | number | Refresh every N visits (0 = never, 1 = always) |

## Updating the Extension

After making changes to any files:

1. Go to `chrome://extensions`
2. Find **Chrome Tab Rotator** in the list
3. Click the **reload icon** (↻) on the extension card
4. If the dashboard window is open, close and reopen it to apply changes

## Debugging

To view logs and debug the extension:

1. Go to `chrome://extensions`
2. Find **Chrome Tab Rotator**
3. Click **"Service worker"** link to open DevTools
4. View console logs for rotation events and errors

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Window doesn't open | Check for errors in service worker console |
| Rotation stops | The dashboard window may have been closed |
| Only one tab created | Check service worker logs for tab creation errors |
| Settings not saving | Make sure to click "Save Settings" button |
| Changes not applying | Reload extension and restart dashboard window |

## Notes

- Chrome enforces a minimum ~6-second interval for alarms
- Closing the dashboard window stops the rotation
- The extension opens the dashboard on first install/update
- Settings are per Chrome profile (stored in local storage)