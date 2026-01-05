/**
 * Chrome Tab Rotator - Content Script
 * Handles smooth fade transitions between dashboard pages.
 */

// Function to inject transition styles
function injectStyles() {
    // Check if already injected
    if (document.getElementById('rotator-transition-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'rotator-transition-styles';
    style.textContent = `
    body {
      transition: opacity 0.3s ease-in-out !important;
    }
    body.rotator-fade-out {
      opacity: 0 !important;
    }
  `;

    // Append to head or documentElement if head not ready
    const target = document.head || document.documentElement;
    if (target) {
        target.appendChild(style);
    }
}

// Try to inject styles as soon as possible
if (document.head || document.documentElement) {
    injectStyles();
} else {
    // Wait for DOM to be ready enough
    document.addEventListener('DOMContentLoaded', injectStyles);
}

// Fade in when the page loads
document.addEventListener('DOMContentLoaded', () => {
    injectStyles(); // Ensure styles are injected
    setTimeout(() => {
        if (document.body) {
            document.body.classList.remove('rotator-fade-out');
        }
    }, 50);
});

// Also handle already-loaded pages
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    injectStyles();
    setTimeout(() => {
        if (document.body) {
            document.body.classList.remove('rotator-fade-out');
        }
    }, 50);
}

// Listen for fade-out messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'fadeOut') {
        injectStyles(); // Ensure styles exist
        if (document.body) {
            document.body.classList.add('rotator-fade-out');
        }
        // Wait for transition to complete before responding
        setTimeout(() => {
            sendResponse({ success: true });
        }, 350); // Slightly longer than the CSS transition
        return true; // Keep the message channel open for async response
    }
});
