# Chrome Tab Rotator

A Chrome Extension (Manifest V3) that automatically rotates through dashboard URLs in a dedicated "App Mode" window (no address bar).

## Features

- **App Mode Window**: Opens dashboards in a clean popup window without the address bar
- **Configurable Rotation**: Easy-to-edit URL list and timing in `config.js`
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
// URLs to rotate through
export const URLS = [
  'https://example.com/dashboard1',
  'https://example.com/dashboard2',
  'https://example.com/dashboard3'
];

// Rotation interval in seconds
export const ROTATION_INTERVAL_SECONDS = 30;

// true = reload page, false = navigate (recommended for Stylebot)
export const RELOAD_ON_ROTATION = false;
```

After editing, reload the extension at `chrome://extensions`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Window doesn't open | Check for errors in `chrome://extensions` |
| Rotation stops | The dashboard window may have been closed |
| Styles not applying | Ensure `RELOAD_ON_ROTATION` is `false` |

## Notes

- Chrome enforces a minimum 1-minute interval for alarms in production
- Closing the dashboard window stops the rotation
- The extension auto-starts when Chrome launches