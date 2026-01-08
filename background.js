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
        preloadTabs: storedConfig.preloadTabs ?? DEFAULT_CONFIG.preloadTabs,
        urls: storedConfig.urls || DEFAULT_CONFIG.urls
    };
}

/**
 * Get the current rotator state from storage
 * visitCounts tracks how many times each URL index has been visited
 * tabIds stores all tab IDs when using preload mode
 * preloadMode indicates if current session is using preload tabs
 */
async function getState() {
    const result = await chrome.storage.local.get(STATE_STORAGE_KEY);
    return result[STATE_STORAGE_KEY] || {
        windowId: null,
        tabId: null,
        tabIds: [], // Array of tab IDs for preload mode
        currentIndex: 0,
        visitCounts: {},
        preloadMode: false
    };
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
        tabIds: [],
        currentIndex: 0,
        visitCounts: {},
        preloadMode: false
    };
    await saveState(newState);

    // Schedule first rotation
    await scheduleNextRotation(firstUrl);

    console.log('Dashboard window created:', window.id);
    return window;
}

/**
 * Create a new popup window with all URLs preloaded in separate tabs
 * This enables instant switching between URLs
 */
async function createPreloadedWindow(config) {
    // Create window with first URL
    const window = await chrome.windows.create({
        url: config.urls[0].url,
        type: 'popup'
    });

    const tabIds = [window.tabs[0].id];
    console.log(`Created preload window ${window.id} with first tab ${tabIds[0]}`);

    // Create additional tabs for remaining URLs
    for (let i = 1; i < config.urls.length; i++) {
        try {
            const tab = await chrome.tabs.create({
                windowId: window.id,
                url: config.urls[i].url,
                active: false // Keep first tab active
            });
            tabIds.push(tab.id);
            console.log(`Created preload tab ${i}: ${tab.id} for ${config.urls[i].url}`);
        } catch (error) {
            console.error(`Failed to create tab ${i}:`, error);
        }
    }

    // Save state with all tab IDs
    const newState = {
        windowId: window.id,
        tabId: tabIds[0], // Active tab
        tabIds: tabIds,
        currentIndex: 0,
        visitCounts: {},
        preloadMode: true
    };
    await saveState(newState);

    // Schedule first rotation
    await scheduleNextRotation(config.urls[0]);

    console.log(`Preloaded window created with ${tabIds.length} tabs:`, tabIds);
    return window;
}

/**
 * Take over an existing window and preload all URLs in separate tabs
 */
async function takeoverExistingWindowPreload(config) {
    // Get all windows
    const windows = await chrome.windows.getAll({ populate: true });

    if (windows.length === 0) {
        console.log('No existing windows found for preload takeover');
        return null;
    }

    // Prefer the focused window, otherwise use the first normal window
    let targetWindow = windows.find(w => w.focused) ||
        windows.find(w => w.type === 'normal') ||
        windows[0];

    // Get the active tab in that window to use as first tab
    const firstTab = targetWindow.tabs.find(t => t.active) || targetWindow.tabs[0];

    if (!firstTab) {
        console.log('No tabs found in window');
        return null;
    }

    // Navigate first tab to first URL
    await chrome.tabs.update(firstTab.id, { url: config.urls[0].url });
    const tabIds = [firstTab.id];
    console.log(`Took over window ${targetWindow.id}, first tab ${firstTab.id}`);

    // Create additional tabs for remaining URLs
    for (let i = 1; i < config.urls.length; i++) {
        try {
            const tab = await chrome.tabs.create({
                windowId: targetWindow.id,
                url: config.urls[i].url,
                active: false
            });
            tabIds.push(tab.id);
            console.log(`Created preload tab ${i}: ${tab.id} for ${config.urls[i].url}`);
        } catch (error) {
            console.error(`Failed to create tab ${i}:`, error);
        }
    }

    // Save state with all tab IDs
    const newState = {
        windowId: targetWindow.id,
        tabId: tabIds[0],
        tabIds: tabIds,
        currentIndex: 0,
        visitCounts: {},
        preloadMode: true
    };
    await saveState(newState);

    // Schedule first rotation
    await scheduleNextRotation(config.urls[0]);

    console.log(`Preload takeover complete with ${tabIds.length} tabs:`, tabIds);
    return targetWindow;
}

/**
 * Initialize the dashboard - either take over existing window or create new
 * Uses preload mode if enabled for instant tab switching
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

    // Use preload mode if enabled (creates all tabs upfront)
    if (config.preloadTabs) {
        console.log('Using preload mode - creating all tabs upfront');

        // Try to use existing window if setting is enabled
        if (config.useExistingWindow) {
            const window = await takeoverExistingWindowPreload(config);
            if (window) {
                return;
            }
            console.log('Could not take over existing window, creating new one');
        }

        await createPreloadedWindow(config);
        return;
    }

    // Standard mode - single tab navigation
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
 * In preload mode: switches to the next pre-loaded tab (instant)
 * In standard mode: navigates single tab to next URL
 */
async function rotateToNextUrl() {
    const state = await getState();
    const config = await getConfig();

    console.log('=== ROTATION DEBUG ===');
    console.log('Current state:', JSON.stringify(state));
    console.log('Config URLs count:', config.urls.length);
    console.log('Current index:', state.currentIndex);
    console.log('Preload mode:', state.preloadMode);

    // Check if window still exists
    if (!(await windowExists(state.windowId))) {
        console.log('Dashboard window was closed, stopping rotation');
        await stopAlarm();
        return;
    }

    // Calculate next index
    const nextIndex = (state.currentIndex + 1) % config.urls.length;
    const nextUrlEntry = config.urls[nextIndex];

    console.log('Next index:', nextIndex);
    console.log('Next URL:', nextUrlEntry?.url);

    if (!nextUrlEntry) {
        console.error('ERROR: No URL entry found at index', nextIndex);
        console.log('Config URLs:', JSON.stringify(config.urls));
        return;
    }

    try {
        // Track visit count for this URL index
        const visitCounts = state.visitCounts || {};
        const currentVisitCount = (visitCounts[nextIndex] || 0) + 1;
        visitCounts[nextIndex] = currentVisitCount;

        // Determine if we should reload (reloadEveryN: 0=never, 1=always, N=every N visits)
        let reloadEveryN = nextUrlEntry.reloadEveryN;
        if (reloadEveryN === undefined && typeof nextUrlEntry.reload === 'boolean') {
            reloadEveryN = nextUrlEntry.reload ? 1 : 0;  // Migration from old format
        }
        reloadEveryN = reloadEveryN || 0;

        const shouldReload = reloadEveryN > 0 && (currentVisitCount % reloadEveryN === 0);
        console.log(`Visit #${currentVisitCount} for URL index ${nextIndex}, reloadEveryN: ${reloadEveryN}, shouldReload: ${shouldReload}`);

        // === PRELOAD MODE: Switch between existing tabs ===
        if (state.preloadMode && state.tabIds && state.tabIds.length > 0) {
            const nextTabId = state.tabIds[nextIndex];

            if (!nextTabId) {
                console.error('ERROR: No tab ID found for index', nextIndex);
                return;
            }

            // Activate the next tab (instant switch!)
            await chrome.tabs.update(nextTabId, { active: true });
            console.log(`PRELOAD MODE: Switched to tab ${nextTabId} (instant)`);

            // Reload the tab if needed (based on reloadEveryN)
            if (shouldReload) {
                await chrome.tabs.reload(nextTabId, { bypassCache: true });
                console.log(`Reloaded tab ${nextTabId} (visit #${currentVisitCount}, reloadEveryN: ${reloadEveryN})`);
            }

            // Update state
            const newState = {
                ...state,
                tabId: nextTabId,
                currentIndex: nextIndex,
                visitCounts: visitCounts
            };
            await saveState(newState);

        } else {
            // === STANDARD MODE: Navigate single tab ===
            // Send fade-out message to content script for smooth transition
            try {
                await chrome.tabs.sendMessage(state.tabId, { action: 'fadeOut' });
                console.log('Fade-out complete');
            } catch (e) {
                console.log('Could not send fade message (expected on some pages)');
            }

            // Add cache-busting parameter if reload is enabled for this visit
            let urlToNavigate = nextUrlEntry.url;
            if (shouldReload) {
                const separator = nextUrlEntry.url.includes('?') ? '&' : '?';
                urlToNavigate = `${nextUrlEntry.url}${separator}_cb=${Date.now()}`;
                console.log('Cache-busting URL:', urlToNavigate);
            }

            await chrome.tabs.update(state.tabId, { url: urlToNavigate });
            console.log('STANDARD MODE: Navigated tab', state.tabId, 'to', nextUrlEntry.url);

            // Update state
            const newState = { ...state, currentIndex: nextIndex, visitCounts: visitCounts };
            await saveState(newState);
        }

        // Schedule next rotation based on this URL's interval
        await scheduleNextRotation(nextUrlEntry);

        console.log(`Rotated to URL ${nextIndex + 1}/${config.urls.length}: ${nextUrlEntry.url} (interval: ${nextUrlEntry.intervalSeconds}s, reloadEveryN: ${reloadEveryN}, visit: ${currentVisitCount})`);
    } catch (error) {
        console.error('Error rotating URL:', error);

        // Tab might be gone, try to reinitialize
        await stopAlarm();
        await saveState({ windowId: null, tabId: null, tabIds: [], currentIndex: 0, visitCounts: {}, preloadMode: false });
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
