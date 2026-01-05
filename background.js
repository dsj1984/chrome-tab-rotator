/**
 * Chrome Tab Rotator - Background Service Worker
 * Manages a dedicated window that rotates through dashboard URLs.
 * Each URL can have its own rotation interval and reload setting.
 */

import { DEFAULT_CONFIG, CONFIG_STORAGE_KEY } from './config.js';

const ALARM_NAME = 'tab-rotator-alarm';
const STARTUP_ALARM_NAME = 'tab-rotator-startup';
const STATE_STORAGE_KEY = 'rotatorState';
const INITIALIZED_KEY = 'rotatorInitialized';

/**
 * Get the current configuration from storage, falling back to defaults
 */
async function getConfig() {
    const result = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
    const storedConfig = result[CONFIG_STORAGE_KEY] || {};

    return {
        autoStartOnBrowserLaunch: storedConfig.autoStartOnBrowserLaunch ?? DEFAULT_CONFIG.autoStartOnBrowserLaunch,
        useExistingWindow: storedConfig.useExistingWindow ?? DEFAULT_CONFIG.useExistingWindow,
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
 * Take over an existing window instead of creating a new one
 */
async function takeoverExistingWindow(config) {
    // Get all windows
    const windows = await chrome.windows.getAll({ populate: true });

    if (windows.length === 0) {
        console.log('No existing windows found');
        return null;
    }

    // Prefer the focused window, otherwise use the first normal window
    let targetWindow = windows.find(w => w.focused) ||
        windows.find(w => w.type === 'normal') ||
        windows[0];

    // Get the active tab in that window, or the first tab
    const targetTab = targetWindow.tabs.find(t => t.active) || targetWindow.tabs[0];

    if (!targetTab) {
        console.log('No tabs found in window');
        return null;
    }

    const firstUrl = config.urls[0];

    // Navigate the tab to our first URL
    await chrome.tabs.update(targetTab.id, { url: firstUrl.url });

    // Save state
    const newState = {
        windowId: targetWindow.id,
        tabId: targetTab.id,
        currentIndex: 0
    };
    await saveState(newState);

    // Schedule first rotation
    await scheduleNextRotation(firstUrl);

    console.log(`Took over existing window ${targetWindow.id}, tab ${targetTab.id}`);
    return targetWindow;
}

/**
 * Create a new popup window for the dashboard
 */
async function createNewWindow(config) {
    const firstUrl = config.urls[0];

    // Create new popup window (App Mode - no address bar)
    const window = await chrome.windows.create({
        url: firstUrl.url,
        type: 'popup'
    });

    // Save state
    const newState = {
        windowId: window.id,
        tabId: window.tabs[0].id,
        currentIndex: 0
    };
    await saveState(newState);

    // Schedule first rotation
    await scheduleNextRotation(firstUrl);

    console.log('Dashboard window created:', window.id);
    return window;
}

/**
 * Initialize the dashboard - either take over existing window or create new
 */
async function initializeDashboard() {
    const state = await getState();
    const config = await getConfig();

    // Check if we already have a tracked window
    if (await windowExists(state.windowId)) {
        console.log('Dashboard window already exists');
        return;
    }

    // Keep display awake to prevent screen dimming/sleep
    chrome.power.requestKeepAwake('display');
    console.log('Display keep-awake enabled');

    if (config.useExistingWindow) {
        const window = await takeoverExistingWindow(config);
        if (!window) {
            // Fallback to creating new window if takeover failed
            await createNewWindow(config);
        }
    } else {
        await createNewWindow(config);
    }
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
        // await initializeDashboard();
        return;
    }

    // Calculate next index
    const nextIndex = (state.currentIndex + 1) % config.urls.length;
    const nextUrlEntry = config.urls[nextIndex];

    // Send fade-out message to content script for smooth transition (non-blocking)
    try {
        await chrome.tabs.sendMessage(state.tabId, { action: 'fadeOut' });
        console.log('Fade-out complete');
    } catch (e) {
        // Content script may not be loaded (e.g., chrome:// pages, new tabs)
        console.log('Could not send fade message (expected on some pages)');
    }

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

        // Tab might be gone, try to reinitialize
        await stopAlarm();
        await saveState({ windowId: null, tabId: null, currentIndex: 0 });
        await initializeDashboard();
    }
}

/**
 * Check if we should auto-initialize on this session
 * Returns true if this is a new browser session and auto-start is enabled
 */
async function shouldAutoInitialize() {
    const config = await getConfig();
    if (!config.autoStartOnBrowserLaunch) {
        return false;
    }

    const state = await getState();
    // Don't initialize if we already have an active window
    if (await windowExists(state.windowId)) {
        return false;
    }

    return true;
}

/**
 * Handle alarm events
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        rotateToNextUrl();
    } else if (alarm.name === STARTUP_ALARM_NAME) {
        // Delayed startup - give Chrome time to fully load
        console.log('Startup alarm fired - initializing dashboard');
        if (await shouldAutoInitialize()) {
            await initializeDashboard();
        }
    }
});

/**
 * Handle window creation events - this is more reliable than onStartup
 * for detecting browser launch
 */
chrome.windows.onCreated.addListener(async (window) => {
    console.log('Window created:', window.id, 'type:', window.type);

    // Handle both normal windows and popup/app windows
    if (window.type !== 'normal' && window.type !== 'popup') {
        return;
    }

    // Check if we should auto-initialize
    if (await shouldAutoInitialize()) {
        console.log('Auto-start triggered by window creation');

        // Small delay to let the window fully load
        await chrome.alarms.clear(STARTUP_ALARM_NAME);
        await chrome.alarms.create(STARTUP_ALARM_NAME, {
            delayInMinutes: 0.05 // ~3 seconds
        });
    }
});

/**
 * Handle tab creation events - additional trigger for app mode
 * This fires even when Chrome launches with --app flag
 */
chrome.tabs.onCreated.addListener(async (tab) => {
    console.log('Tab created:', tab.id, 'windowId:', tab.windowId);

    // Check if we should auto-initialize
    if (await shouldAutoInitialize()) {
        console.log('Auto-start triggered by tab creation');

        // Small delay to let the tab fully load
        await chrome.alarms.clear(STARTUP_ALARM_NAME);
        await chrome.alarms.create(STARTUP_ALARM_NAME, {
            delayInMinutes: 0.05 // ~3 seconds
        });
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

        // Release keep-awake when dashboard closes
        chrome.power.releaseKeepAwake();
        console.log('Display keep-awake released');
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
 * Uses a short delay alarm to ensure Chrome is fully loaded
 */
chrome.runtime.onStartup.addListener(async () => {
    console.log('Extension startup detected - scheduling delayed initialization');

    // Clear any existing startup alarm
    await chrome.alarms.clear(STARTUP_ALARM_NAME);

    // Schedule initialization after a short delay (3 seconds)
    // This gives Chrome time to fully restore windows
    await chrome.alarms.create(STARTUP_ALARM_NAME, {
        delayInMinutes: 0.05 // ~3 seconds
    });
});

/**
 * Initialize on extension install/update
 */
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Extension installed/updated:', details.reason);
    initializeDashboard();
});
