/**
 * Chrome Tab Rotator - Popup Configuration Script
 * Manages the settings UI and persists configuration to chrome.storage.local
 * Settings are per-profile since we use local storage
 */

import { DEFAULT_CONFIG, CONFIG_STORAGE_KEY } from './config.js';

// Drag and drop state
let draggedItem = null;

// DOM Elements
const autoStartCheckbox = document.getElementById('autoStart');
const useExistingCheckbox = document.getElementById('useExisting');
const preloadTabsCheckbox = document.getElementById('preloadTabs');
const urlListContainer = document.getElementById('urlList');
const urlCountSpan = document.getElementById('urlCount');
const addUrlBtn = document.getElementById('addUrl');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const urlItemTemplate = document.getElementById('urlItemTemplate');
const toast = document.getElementById('toast');

/**
 * Show a toast notification
 */
function showToast(message, duration = 2000) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

/**
 * Update the URL count display
 */
function updateUrlCount() {
    const count = urlListContainer.querySelectorAll('.url-item').length;
    urlCountSpan.textContent = `(${count})`;
}

/**
 * Create a URL item element from the template
 */
function createUrlItem(urlEntry = { url: '', intervalSeconds: 30, reloadEveryN: 0 }) {
    const template = urlItemTemplate.content.cloneNode(true);
    const item = template.querySelector('.url-item');

    const dragHandle = item.querySelector('.drag-handle');
    const urlInput = item.querySelector('.url-input');
    const intervalInput = item.querySelector('.interval-input');
    const reloadInput = item.querySelector('.reload-input');
    const deleteBtn = item.querySelector('.btn-delete');

    urlInput.value = urlEntry.url;
    intervalInput.value = urlEntry.intervalSeconds;
    // Support migration from old boolean reload to new reloadEveryN
    if (typeof urlEntry.reload === 'boolean') {
        reloadInput.value = urlEntry.reload ? 1 : 0;
    } else {
        reloadInput.value = urlEntry.reloadEveryN ?? 0;
    }

    // Delete button handler
    deleteBtn.addEventListener('click', () => {
        item.style.animation = 'slideIn 0.2s ease-out reverse';
        setTimeout(() => {
            item.remove();
            updateUrlCount();
        }, 180);
    });

    // Drag and drop handlers
    item.setAttribute('draggable', 'true');

    item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
        draggedItem = null;
        item.classList.remove('dragging');
        // Remove all drag-over classes
        document.querySelectorAll('.url-item').forEach(el => {
            el.classList.remove('drag-over');
        });
    });

    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedItem && draggedItem !== item) {
            item.classList.add('drag-over');
        }
    });

    item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
    });

    item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');

        if (draggedItem && draggedItem !== item) {
            const allItems = [...urlListContainer.querySelectorAll('.url-item')];
            const draggedIndex = allItems.indexOf(draggedItem);
            const dropIndex = allItems.indexOf(item);

            if (draggedIndex < dropIndex) {
                item.parentNode.insertBefore(draggedItem, item.nextSibling);
            } else {
                item.parentNode.insertBefore(draggedItem, item);
            }
        }
    });

    return item;
}

/**
 * Load configuration from storage and populate the UI
 */
async function loadConfig() {
    const result = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
    const config = result[CONFIG_STORAGE_KEY] || DEFAULT_CONFIG;

    // Set general settings
    autoStartCheckbox.checked = config.autoStartOnBrowserLaunch ?? DEFAULT_CONFIG.autoStartOnBrowserLaunch;
    useExistingCheckbox.checked = config.useExistingWindow ?? DEFAULT_CONFIG.useExistingWindow;
    preloadTabsCheckbox.checked = config.preloadTabs ?? DEFAULT_CONFIG.preloadTabs;

    // Clear existing URL items
    urlListContainer.innerHTML = '';

    // Add URL items
    const urls = config.urls || DEFAULT_CONFIG.urls;
    urls.forEach(urlEntry => {
        urlListContainer.appendChild(createUrlItem(urlEntry));
    });

    updateUrlCount();
}

/**
 * Collect configuration from the UI
 */
function collectConfig() {
    const urlItems = urlListContainer.querySelectorAll('.url-item');
    const urls = [];

    urlItems.forEach(item => {
        const url = item.querySelector('.url-input').value.trim();
        if (url) {
            urls.push({
                url: url,
                intervalSeconds: parseInt(item.querySelector('.interval-input').value) || 30,
                reloadEveryN: parseInt(item.querySelector('.reload-input').value) || 0
            });
        }
    });

    return {
        autoStartOnBrowserLaunch: autoStartCheckbox.checked,
        useExistingWindow: useExistingCheckbox.checked,
        preloadTabs: preloadTabsCheckbox.checked,
        urls: urls
    };
}

/**
 * Save configuration to storage
 */
async function saveConfig() {
    const config = collectConfig();

    if (config.urls.length === 0) {
        showToast('⚠️ Please add at least one URL');
        return;
    }

    await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: config });
    showToast('✓ Settings saved!');
    console.log('Configuration saved:', config);
}

/**
 * Reset configuration to defaults
 */
async function resetConfig() {
    if (confirm('Reset all settings to defaults?')) {
        await chrome.storage.local.remove(CONFIG_STORAGE_KEY);
        await loadConfig();
        showToast('✓ Reset to defaults');
    }
}

// Event Listeners
addUrlBtn.addEventListener('click', () => {
    urlListContainer.appendChild(createUrlItem());
    updateUrlCount();

    // Focus the new URL input
    const inputs = urlListContainer.querySelectorAll('.url-input');
    inputs[inputs.length - 1].focus();
});

saveBtn.addEventListener('click', saveConfig);
resetBtn.addEventListener('click', resetConfig);

// Initialize
document.addEventListener('DOMContentLoaded', loadConfig);
