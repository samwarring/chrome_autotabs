const organizer = {
    groupThreshold: 4,
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

    sortAllTabs: async function(tabs) {
        const keyedTabs = [];
        for (const tab of tabs) {
            const keyedTab = {
                tab: tab,
                key: this.getSortKey(tab)
            };
            keyedTabs.push(keyedTab);
        }

        keyedTabs.sort((a, b) => this.compareSortKeys(a.key, b.key));
        console.log("SORTED TABS:", keyedTabs.map((keyedTab) => keyedTab.tab.url));

        keyedTabs.forEach(async (keyedTab, index, _) => {
            await chrome.tabs.move(keyedTab.tab.id, { index });
        })
    },

    getGroupKey: function(tab) {
        const url = new URL(tab.url);
        const parts = url.host.split('.');
        if (parts.length > 1) {
            return parts[parts.length - 2];
        }
        else {
            return parts[0];
        }
    },

    groupAllTabs: async function(tabs) {        
        // Get info about existing groups.
        //console.log("GROUP IDS:");
        const groupInfos = new Map();
        for (const tab of tabs) {
            //console.log(tab.url, "=>", tab.groupId);
            const groupKey = this.getGroupKey(tab);
            if (groupInfos.has(groupKey)) {
                const info = groupInfos.get(groupKey);
                info.tabs.push(tab);
                info.groupIds.add(tab.groupId);
            }
            else {
                const groupIds = new Set();
                groupIds.add(tab.groupId);
                groupInfos.set(groupKey, {
                    tabs: [tab],
                    groupIds
                });
            }
        }

        console.log("LOGICAL GROUPS:", groupInfos);

        // Look at each logical group.
        for (const groupInfo of groupInfos) {
            const groupKey = groupInfo[0];
            const groupIds = groupInfo[1].groupIds;
            const groupTabs = groupInfo[1].tabs;
            if (groupTabs.length >= this.groupThreshold) {
                // This logical group has enough tabs to be an actual tab group.
                
                if (groupIds.has(-1) || groupIds.size > 1) {
                    // Not all tabs are part of the same group. Make it so!
                    
                    const tabIds = groupTabs.map((tab) => tab.id);
                    console.log("GROUP TABS", { groupKey });
                    const tabGroupId = await chrome.tabs.group({ tabIds });
                    await chrome.tabGroups.update(tabGroupId, { title: groupKey, color: "grey" });
                    //await chrome.tabGroups.update(tabGroup, { title: group[0], color: "grey" });
                }
            }
            else if (groupIds.length > 1 || !groupIds.has(-1)) {
                // This logical group has too few tabs to be an actual tab group.
                console.log("UNGROUP TABS", { groupKey });
                const tabIds = groupTabs.map((tab) => tab.id);
                await chrome.tabs.ungroup(tabIds);
            }
        }
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

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    console.log("tabs.onRemoved(", tabId, removeInfo, ")");
    const tabs = await organizer.getAllTabs();
    await organizer.groupAllTabs(tabs);
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
        const tabs = await organizer.getAllTabs();
        await organizer.sortAllTabs(tabs);
        await organizer.groupAllTabs(tabs);
    }
});

chrome.tabs.onZoomChange.addListener((zoomChangeInfo) => {
    console.log("tabs.onZoomChange(", zoomChangeInfo, ")");
});
