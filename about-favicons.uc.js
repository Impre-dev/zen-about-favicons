// ==UserScript==
// @name           About Favicons
// @version        1.0.0
// @description    Custom favicons for about:* pages
// @author         Impre
// @include        main
// ==/UserScript==

(function () {
    'use strict';

    // SVG icons — encoded at runtime via encodeURIComponent
    const ICONS = {
        'about:config': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="context-fill" fill-opacity="context-fill-opacity" d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 3a5 5 0 110 10 5 5 0 010-10zm0 2a3 3 0 100 6 3 3 0 000-6z"/><circle cx="8" cy="8" r="1.5" fill="context-fill"/></svg>',
        'about:preferences': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="context-fill" fill-opacity="context-fill-opacity" d="M14 3h-4V1a1 1 0 10-2 0v2H2a1 1 0 000 2h6v2a1 1 0 102 0V5h4a1 1 0 100-2zm0 6H8a1 1 0 100 2h6a1 1 0 100-2zm0 4H4a1 1 0 100 2h10a1 1 0 100-2z"/></svg>',
        'about:addons': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="context-fill" fill-opacity="context-fill-opacity" d="M14 6h-1V4a1 1 0 00-1-1h-2V2a2 2 0 10-4 0v1H4a1 1 0 00-1 1v2H2a2 2 0 100 4h1v2a1 1 0 001 1h2v1a2 2 0 104 0v-1h2a1 1 0 001-1v-2h1a2 2 0 100-4z"/></svg>',
        'about:support': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="context-fill" fill-opacity="context-fill-opacity" d="M8 0a8 8 0 100 16A8 8 0 008 0zm1 12H7v-4h2v4zm0-6H7V4h2v2z"/></svg>',
        'about:debugging': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="context-fill" fill-opacity="context-fill-opacity" d="M9 1a1 1 0 10-2 0v1H5a3 3 0 00-3 3v1H1a1 1 0 100 2h1v3a3 3 0 003 3h1v1a1 1 0 102 0v-1h2a3 3 0 003-3V8h1a1 1 0 100-2h-1V5a3 3 0 00-3-3H9V1z"/></svg>',
    };

    // Build data URIs
    const FAVICON_MAP = {};
    for (const [url, svg] of Object.entries(ICONS)) {
        FAVICON_MAP[url] = 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    function normalizeAboutUrl(url) {
        return url.split('#')[0].split('?')[0].replace(/\/$/, '');
    }

    function applyFavicon(tab) {
        if (!tab || !tab.linkedBrowser) return;
        const url = tab.linkedBrowser.currentURI.spec;
        const normalized = normalizeAboutUrl(url);
        const iconUrl = FAVICON_MAP[normalized];
        if (!iconUrl) return;
        if (tab.getAttribute('image') === iconUrl) return;
        tab.setAttribute('image', iconUrl);
    }

    function applyToAllTabs() {
        if (!window.gBrowser) { setTimeout(applyToAllTabs, 500); return; }
        for (const tab of gBrowser.tabs) applyFavicon(tab);
    }

    function onTabAttrModified(event) {
        if (!event.target || !event.target.linkedBrowser) return;
        const changed = event.detail?.changed;
        if (!changed || changed.includes('image') || changed.includes('label') || changed.includes('busy')) {
            applyFavicon(event.target);
        }
    }

    function init() {
        if (window.__aboutFaviconsPatched) return;
        if (!window.gBrowser || !gBrowser.tabContainer) { setTimeout(init, 500); return; }
        window.__aboutFaviconsPatched = true;

        gBrowser.tabContainer.addEventListener('TabAttrModified', onTabAttrModified);
        gBrowser.tabContainer.addEventListener('TabOpen', (e) => setTimeout(() => applyFavicon(e.target), 200));
        applyToAllTabs();
        console.log('[AboutFavicons] patch applied');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
