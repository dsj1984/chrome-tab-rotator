/**
 * Chrome Tab Rotator Configuration
 * Default values - can be overridden via chrome.storage.local
 * 
 * Each URL entry can have its own rotation interval and reload setting.
 * 
 * To update settings programmatically (e.g., from a popup UI):
 * chrome.storage.local.set({
 *   rotatorConfig: {
 *     autoStartOnBrowserLaunch: true,
 *     useExistingWindow: true,
 *     urls: [
 *       { url: 'https://...', intervalSeconds: 30, reload: false },
 *       { url: 'https://...', intervalSeconds: 60, reload: true }
 *     ]
 *   }
 * });
 */

// Default configuration values
export const DEFAULT_CONFIG = {
    // Whether to automatically open the dashboard window when Chrome starts
    autoStartOnBrowserLaunch: true,

    // Whether to take over an existing window instead of creating a new popup
    useExistingWindow: true,

    urls: [
        { url: 'https://web.tabliss.io/', intervalSeconds: 5, reload: false },
        { url: 'https://client.pushover.net/', intervalSeconds: 5, reload: true },
        { url: 'https://uptime.betterstack.com/team/t489110/monitors', intervalSeconds: 5, reload: true },
        { url: 'https://finviz.com/map.ashx?t=sec', intervalSeconds: 5, reload: true },
        { url: 'https://stockanalysis.com/chart/VTI/', intervalSeconds: 5, reload: true },
        { url: 'https://text.npr.org/', intervalSeconds: 30, reload: true },
        { url: 'https://embed.windy.com/embed2.html?lat=42.973&lon=-73.827&zoom=8&level=surface&overlay=radar&menu=&message=&marker=&calendar=now&pressure=true&type=map&location=coordinates&detail=&metricTemp=°F&metricRain=in&metricWind=mph&radarRange=-1', intervalSeconds: 15, reload: false },
        { url: 'https://embed.windy.com/embed2.html?lat=42.973&lon=-73.827&zoom=8&level=surface&overlay=snowAccu&menu=&message=&marker=&calendar=now&pressure=true&type=map&location=coordinates&detail=&metricTemp=°F&metricRain=in&metricWind=mph', intervalSeconds: 15, reload: false }
    ]
};

// Storage key for configuration
export const CONFIG_STORAGE_KEY = 'rotatorConfig';
