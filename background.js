const organizer = {
    collator: new Intl.Collator(),

    getAllTabs: async function() {
        return chrome.tabs.query({
            url: [
                "http://*/*",
                "https://*/*"
            ]
        });
    },

    getSortKey: function(tab) {
        const url = new URL(tab.url);
        const parts = url.host.split('.');
        if (parts.length > 1) {
            parts.pop();
            parts.reverse();
        }
        parts.push(url.pathname);
        return parts;
    },

    compareSortKeys: function(key1, key2) {
        const min_length = Math.min(key1.length, key2.length);
        for (let i = 0; i < min_length; i++) {
            const result = this.collator.compare(key1[i], key2[i]);
            if (result != 0) {
                return result;
            }
        }
        if (key1.length == key2.length) {
            return 0;
        }
        else if (key1.length < key2.length) {
            return -1;
        }
        else {
            return 1;
        }
    },

    sortAllTabs: async function() {
        const tabs = await this.getAllTabs();
        const keyedTabs = [];
        for (const tab of tabs) {
            const keyedTab = {
                tab: tab,
                key: this.getSortKey(tab)
            };
            keyedTabs.push(keyedTab);
        }

        keyedTabs.sort((a, b) => this.compareSortKeys(a.key, b.key));

        console.log("SORTED TABS:")
        keyedTabs.forEach((keyedTab, index, _) => {
            console.log(keyedTab.tab.url);
            chrome.tabs.move(keyedTab.tab.id, { index });
        })
    },
};


// Necessary?
// chrome.runtime.onStartup.addListener(() => {
//     console.log("tab_organizer - runtime.onStartup")
// });

chrome.tabs.onActivated.addListener((activeInfo) => {
    console.log("tabs.onActivated(", activeInfo, ")");
});

// Deprecated: Use onActivated
// chrome.tabs.onActiveChanged.addListener((tabId, selectInfo) => {
//     console.log("tabs.onActiveChanged(", tabId, selectInfo, ")");
// });

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    console.log("tabs.onAttached(", tabId, attachInfo, ")");
});

chrome.tabs.onCreated.addListener((tab) => {
    console.log("tabs.onCreated(", tab, ")");
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    console.log("tabs.onDetached(", tabId, detachInfo, ")");
});

// Deprecated: Use onHighlighted
// chrome.tabs.onHighlightChanged.addListener((selectInfo) => {
//     console.log("tabs.onHighlightChanged(", selectInfo, ")");
// });

chrome.tabs.onHighlighted.addListener((highlightInfo) => {
    console.log("tabs.onHighlighted(", highlightInfo, ")");
});

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
    console.log("tabs.onMoved(", tabId, moveInfo, ")");
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log("tabs.onRemoved(", tabId, removeInfo, ")");
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    console.log("tabs.onReplaced(", addedTabId, removedTabId, ")");
});

// Deprecated:Use onActivated
// chrome.tabs.onSelectionChanged.addListener((tabId, selectInfo) => {
//     console.log("tabs.onSelectionChanged(", tabId, selectInfo, ")");
// });

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    console.log("tabs.onUpdated(", tabId, changeInfo, tab, ")");
    if ('url' in changeInfo) {
        await organizer.sortAllTabs();
    }
});

chrome.tabs.onZoomChange.addListener((zoomChangeInfo) => {
    console.log("tabs.onZoomChange(", zoomChangeInfo, ")");
});
