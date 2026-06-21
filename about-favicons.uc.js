// ==UserScript==
// @name           About Favicons
// @version        4.0.0
// @description    Custom favicons for about:* pages — reads PNG from disk, writes to favicons.sqlite
// @author         Impre
// @include        main
// ==/UserScript==

(function () {
    'use strict';

    // Map of about:* pages to icon filenames in the icons/ subfolder
    const ICON_MAP = {
        'about:config': 'config.png',
        'about:preferences': 'preferences.png',
        'about:addons': 'addons.png',
        'about:support': 'support.png',
        'about:debugging': 'debugging.png',
    };

    // Path to the icons folder (relative to the profile)
    const MOD_ID = 'zen-about-favicons';
    const ICONS_DIR = PathUtils.join(PathUtils.profileDir, 'chrome', 'sine-mods', MOD_ID, 'icons');

    // Expiration = 1 year from now (in microseconds)
    const EXPIRATION = (Date.now() + 365 * 24 * 60 * 60 * 1000) * 1000;

    // Cache: page URL -> file:// URL for tab override
    const tabIconUrls = {};

    /**
     * Write favicons directly into favicons.sqlite using raw SQL.
     * Reads PNG files from disk at runtime — no base64 needed.
     */
    async function injectFaviconsIntoSQLite() {
        try {
            const { Sqlite } = ChromeUtils.importESModule('resource://gre/modules/Sqlite.sys.mjs');
            const faviconsPath = PathUtils.join(PathUtils.profileDir, 'favicons.sqlite');

            // Get a read-only Places connection to use Firefox's hash() function
            const pConn = await PlacesUtils.promiseDBConnection();

            // Open favicons.sqlite for writing
            const fav = await Sqlite.openConnection({ path: faviconsPath });

            let success = 0;

            for (const [pageURL, iconFile] of Object.entries(ICON_MAP)) {
                try {
                    const iconPath = PathUtils.join(ICONS_DIR, iconFile);

                    // Check if file exists
                    if (!(await IOUtils.exists(iconPath))) {
                        console.warn(`[AboutFavicons] Icon not found: ${iconPath}`);
                        continue;
                    }

                    // Read the PNG file as bytes
                    const iconBytes = await IOUtils.read(iconPath);

                    // Build the file:// URL for tab override
                    const fileUrl = 'file:///' + iconPath.replace(/\\/g, '/').replace(/ /g, '%20');
                    tabIconUrls[pageURL] = fileUrl;

                    // Use Firefox's hash() function to compute hashes
                    const phResult = await pConn.execute('SELECT hash(:u) h', { u: pageURL });
                    const pageHash = Number(phResult[0].getResultByName('h'));

                    const ihResult = await pConn.execute('SELECT hash(:u) h', { u: fileUrl });
                    const iconHash = Number(ihResult[0].getResultByName('h'));

                    // 1. Upsert icon data into moz_icons
                    await fav.execute(
                        'INSERT OR IGNORE INTO moz_icons (icon_url, fixed_icon_url_hash, width, root, color, expire_ms, flags, data) VALUES (:u, :h, 512, 0, 0, :e, 0, :d)',
                        { u: fileUrl, h: iconHash, d: iconBytes, e: EXPIRATION }
                    );
                    await fav.execute(
                        'UPDATE moz_icons SET data = :d, expire_ms = :e WHERE icon_url = :u',
                        { u: fileUrl, d: iconBytes, e: EXPIRATION }
                    );

                    // Get icon ID
                    const iconIdResult = await fav.execute('SELECT id FROM moz_icons WHERE icon_url = :u', { u: fileUrl });
                    const iconId = iconIdResult[0].getResultByName('id');

                    // 2. Upsert page into moz_pages_w_icons
                    await fav.execute(
                        'INSERT OR IGNORE INTO moz_pages_w_icons (page_url, page_url_hash) VALUES (:u, :h)',
                        { u: pageURL, h: pageHash }
                    );
                    await fav.execute(
                        'UPDATE moz_pages_w_icons SET page_url_hash = :h WHERE page_url = :u',
                        { u: pageURL, h: pageHash }
                    );

                    // Get page ID
                    const pageIdResult = await fav.execute('SELECT id FROM moz_pages_w_icons WHERE page_url = :u', { u: pageURL });
                    const pageId = pageIdResult[0].getResultByName('id');

                    // 3. Link page <-> icon
                    await fav.execute(
                        'INSERT OR REPLACE INTO moz_icons_to_pages (page_id, icon_id, expire_ms) VALUES (:p, :i, :e)',
                        { p: pageId, i: iconId, e: EXPIRATION }
                    );

                    success++;
                } catch (e) {
                    console.error('[AboutFavicons] Error injecting', pageURL, e);
                }
            }

            await fav.close();
            console.log(`[AboutFavicons] Injected ${success}/${Object.keys(ICON_MAP).length} favicons from ${ICONS_DIR}`);
        } catch (e) {
            console.error('[AboutFavicons] SQLite injection failed:', e);
        }
    }

    function normalizeAboutUrl(url) {
        return url.split('#')[0].split('?')[0].replace(/\/$/, '');
    }

    function applyFaviconToTab(tab) {
        if (!tab || !tab.linkedBrowser) return;
        const url = tab.linkedBrowser.currentURI.spec;
        const normalized = normalizeAboutUrl(url);
        const iconUrl = tabIconUrls[normalized];
        if (!iconUrl) return;
        if (tab.getAttribute('image') === iconUrl) return;
        tab.setAttribute('image', iconUrl);
    }

    function applyToAllTabs() {
        if (!window.gBrowser) { setTimeout(applyToAllTabs, 500); return; }
        for (const tab of gBrowser.tabs) applyFaviconToTab(tab);
    }

    function onTabAttrModified(event) {
        if (!event.target || !event.target.linkedBrowser) return;
        const changed = event.detail?.changed;
        if (!changed || changed.includes('image') || changed.includes('label') || changed.includes('busy')) {
            applyFaviconToTab(event.target);
        }
    }

    function init() {
        if (window.__aboutFaviconsPatched) return;
        if (!window.gBrowser || !gBrowser.tabContainer) { setTimeout(init, 500); return; }
        window.__aboutFaviconsPatched = true;

        // 1. Write favicons directly into favicons.sqlite (covers urlbar + titlebar + bookmarks)
        injectFaviconsIntoSQLite();

        // 2. Override tab image for immediate display
        gBrowser.tabContainer.addEventListener('TabAttrModified', onTabAttrModified);
        gBrowser.tabContainer.addEventListener('TabOpen', (e) => setTimeout(() => applyFaviconToTab(e.target), 200));
        applyToAllTabs();

        console.log('[AboutFavicons] v4.0 initialized (PNG from disk + SQLite direct-write)');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') init();
    else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
