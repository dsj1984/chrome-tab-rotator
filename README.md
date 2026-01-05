# Chrome Tab Rotator

A Chrome Extension (Manifest V3) that automatically rotates through dashboard URLs in a dedicated "App Mode" window (no address bar).

## Features

- **App Mode Window**: Opens dashboards in a clean popup window without the address bar
- **Per-URL Configuration**: Each URL can have its own rotation interval and reload setting
- **Auto-Start Control**: Configure whether to launch on browser startup
- **Reliable Timing**: Uses `chrome.alarms` API to avoid throttling
- **Stylebot Compatible**: Standard URL navigation allows CSS injectors to detect changes
- **Persistent State**: Remembers window state across service worker restarts

## Installation

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `chrome-tab-rotator` folder
5. The extension will automatically open a maximized dashboard window

## Configuration

Edit `config.js` to customize:

```javascript
export const DEFAULT_CONFIG = {
  // Auto-start dashboard when Chrome launches
  autoStartOnBrowserLaunch: true,
  
  // URLs with per-item settings
  urls: [
    { url: 'https://example.com/dashboard1', intervalSeconds: 30, reload: false },
    { url: 'https://example.com/dashboard2', intervalSeconds: 60, reload: true }
  ]
};
```

### URL Entry Options

| Property | Type | Description |
|----------|------|-------------|
| `url` | string | The dashboard URL to display |
| `intervalSeconds` | number | How long to show this URL before rotating |
| `reload` | boolean | Force reload after navigating to this URL |

### Global Options

| Property | Type | Description |
|----------|------|-------------|
| `autoStartOnBrowserLaunch` | boolean | Open dashboard window when Chrome starts |

## Updating the Extension

After making changes to any files:

1. Go to `chrome://extensions`
2. Find **Chrome Tab Rotator** in the list
3. Click the **reload icon** (↻) on the extension card
4. If the dashboard window is open, close and reopen it to apply changes

Alternatively, you can reload by:
- Pressing the "Update" button at the top of `chrome://extensions` (updates all extensions)
- Disabling and re-enabling the extension

## Dynamic Configuration (for Popup UI)

Settings can be updated programmatically without editing source files:

```javascript
chrome.storage.local.set({
  rotatorConfig: {
    autoStartOnBrowserLaunch: true,
    urls: [
      { url: 'https://metrics.example.com', intervalSeconds: 120, reload: true },
      { url: 'https://alerts.example.com', intervalSeconds: 30, reload: false }
    ]
  }
});
```

Changes to `urls` take effect on the next rotation. Changes to `autoStartOnBrowserLaunch` take effect on the next Chrome restart.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Window doesn't open | Check for errors in `chrome://extensions` |
| Rotation stops | The dashboard window may have been closed |
| Styles not applying | Ensure `reload` is `false` for that URL |
| Changes not applying | Reload the extension at `chrome://extensions` |

## Notes

- Chrome enforces a minimum ~1-minute interval for alarms in production
- Closing the dashboard window stops the rotation
- The extension always opens the dashboard on first install/update