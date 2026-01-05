/**
 * Chrome Tab Rotator - Background Service Worker
 * Manages a dedicated popup window that rotates through dashboard URLs.
 * Each URL can have its own rotation interval and reload setting.
 */

import { DEFAULT_CONFIG, CONFIG_STORAGE_KEY } from './config.js';

const ALARM_NAME = 'tab-rotator-alarm';
const STATE_STORAGE_KEY = 'rotatorState';

/**
 * Get the current configuration from storage, falling back to defaults
 */
async function getConfig() {
    const result = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
    const storedConfig = result[CONFIG_STORAGE_KEY] || {};

    return {
        urls: storedConfig.urls || DEFAULT_CONFIG.urls
    };
}

/**
 * Get the current rotator state from storage
 */
async function getState() {
    const result = await chrome.storage.local.get(STATE_STORAGE_KEY);
    return result[STATE_STORAGE_KEY] || { windowId: null, tabId: null, currentIndex: 0 };
}

/**
 * Save the rotator state to storage
 */
async function saveState(state) {
    await chrome.storage.local.set({ [STATE_STORAGE_KEY]: state });
}

/**
 * Check if a window still exists
 */
async function windowExists(windowId) {
    if (!windowId) return false;
    try {
        await chrome.windows.get(windowId);
        return true;
    } catch {
        return false;
    }
}

/**
 * Schedule the next rotation alarm based on the current URL's interval
 */
async function scheduleNextRotation(urlEntry) {
    // Clear any existing alarm
    await chrome.alarms.clear(ALARM_NAME);

    const intervalSeconds = urlEntry.intervalSeconds || 30;
    const intervalMinutes = intervalSeconds / 60;

    await chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: Math.max(intervalMinutes, 0.1) // Minimum ~6 seconds for testing
    });

    console.log(`Next rotation scheduled in ${intervalSeconds} seconds`);
}

/**
 * Create the dedicated dashboard window
 */
async function createDashboardWindow() {
    const state = await getState();
    const config = await getConfig();

    // Check if window already exists
    if (await windowExists(state.windowId)) {
        console.log('Dashboard window already exists');
        return;
    }

    const firstUrl = config.urls[0];

    // Create new popup window (App Mode - no address bar)
    const window = await chrome.windows.create({
        url: firstUrl.url,
        type: 'popup',
        state: 'maximized'
    });

    // Save the window and tab IDs
    const newState = {
        windowId: window.id,
        tabId: window.tabs[0].id,
        currentIndex: 0
    };
    await saveState(newState);

    // Schedule the first rotation based on the first URL's interval
    await scheduleNextRotation(firstUrl);

    console.log('Dashboard window created:', window.id);
}

/**
 * Stop the rotation alarm
 */
async function stopAlarm() {
    await chrome.alarms.clear(ALARM_NAME);
    console.log('Rotation alarm stopped');
}

/**
 * Rotate to the next URL
 */
async function rotateToNextUrl() {
    const state = await getState();
    const config = await getConfig();

    // Check if window still exists
    if (!(await windowExists(state.windowId))) {
        console.log('Dashboard window was closed, stopping rotation');
        await stopAlarm();

        // Optionally recreate the window
        // Uncomment the next line to auto-recreate the window when closed
        // await createDashboardWindow();
        return;
    }

    // Calculate next index
    const nextIndex = (state.currentIndex + 1) % config.urls.length;
    const nextUrlEntry = config.urls[nextIndex];

    try {
        // Navigate to the new URL
        await chrome.tabs.update(state.tabId, { url: nextUrlEntry.url });

        // If reload is enabled for this URL, reload after navigation
        if (nextUrlEntry.reload) {
            // Small delay to ensure navigation completes, then reload
            setTimeout(async () => {
                try {
                    await chrome.tabs.reload(state.tabId);
                } catch (e) {
                    console.log('Reload failed:', e);
                }
            }, 500);
        }

        // Update state
        await saveState({ ...state, currentIndex: nextIndex });

        // Schedule next rotation based on this URL's interval
        await scheduleNextRotation(nextUrlEntry);

        console.log(`Rotated to URL ${nextIndex + 1}/${config.urls.length}: ${nextUrlEntry.url} (interval: ${nextUrlEntry.intervalSeconds}s, reload: ${nextUrlEntry.reload})`);
    } catch (error) {
        console.error('Error rotating URL:', error);

        // Tab might be gone, try to recreate window
        await stopAlarm();
        await saveState({ windowId: null, tabId: null, currentIndex: 0 });
        await createDashboardWindow();
    }
}

/**
 * Handle alarm events
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        rotateToNextUrl();
    }
});

/**
 * Handle window close events
 */
chrome.windows.onRemoved.addListener(async (windowId) => {
    const state = await getState();

    if (windowId === state.windowId) {
        console.log('Dashboard window closed by user');
        await stopAlarm();
        await saveState({ windowId: null, tabId: null, currentIndex: 0 });
    }
});

/**
 * Listen for storage changes to apply new config dynamically
 */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local' && changes[CONFIG_STORAGE_KEY]) {
        console.log('Configuration updated');
        // Config will be read on next rotation
    }
});

/**
 * Initialize on extension startup (browser restart)
 */
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension startup - creating dashboard window');
    createDashboardWindow();
});

/**
 * Initialize on extension install/update
 */
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Extension installed/updated:', details.reason);
    createDashboardWindow();
});
