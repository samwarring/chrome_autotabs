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
        console.log("SORTED TABS:", keyedTabs.map((keyedTab) => keyedTab.tab.url));

        // Compute how far each tab needs to move
        for (let newIndex = 0; newIndex < keyedTabs.length; newIndex++) {
            keyedTabs[newIndex].newIndex = newIndex;
            keyedTabs[newIndex].distance = Math.abs(keyedTabs[newIndex].tab.index - newIndex);
        }

        // Sort the tabs again, this time by how far they need to move.
        keyedTabs.sort((a, b) => b.distance - a.distance);

        // Move the tabs
        for (const keyedTab of keyedTabs) {
            await chrome.tabs.move(keyedTab.tab.id, { index: keyedTab.newIndex });
        }
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

    getLogicalGroups: async function() {
        // Get info about existing groups.
        const tabs = await this.getAllTabs();
        const groupInfos = new Map();
        for (const tab of tabs) {
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
        return groupInfos;
    },

    getCollapsedGroupTitles: async function() {
        const tabGroups = await chrome.tabGroups.query({});
        const collapsedGroupTitles = new Set();
        for (const tabGroup of tabGroups) {
            if (tabGroup.collapsed) {
                collapsedGroupTitles.add(tabGroup.title);
            }
        }
        return collapsedGroupTitles;
    },

    groupAllTabs: async function(collapsedGroupTitles) {        
        const groupInfos = await this.getLogicalGroups();
        console.log("LOGICAL GROUPS:", groupInfos);

        // Look at each logical group.
        for (const groupInfo of groupInfos) {
            const groupKey = groupInfo[0];
            const groupIds = groupInfo[1].groupIds;
            const groupTabs = groupInfo[1].tabs;
            if (groupTabs.length >= this.groupThreshold) {
                // This logical group has enough tabs to be an actual tab group. Make a new group!
                const tabIds = groupTabs.map((tab) => tab.id);
                console.log("GROUP TABS", { groupKey });
                const tabGroupId = await chrome.tabs.group({ tabIds });

                // If the logical group previously existed, preserve its "collapsed" state.
                const collapsed = collapsedGroupTitles.has(groupKey);                

                await chrome.tabGroups.update(tabGroupId, { title: groupKey, color: "grey", collapsed });
            }
            else {//if (groupIds.length > 1 || !groupIds.has(-1)) {
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
    //console.log("tabs.onActivated(", activeInfo, ")");
});

// Deprecated: Use onActivated
// chrome.tabs.onActiveChanged.addListener((tabId, selectInfo) => {
//     console.log("tabs.onActiveChanged(", tabId, selectInfo, ")");
// });

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    //console.log("tabs.onAttached(", tabId, attachInfo, ")");
});

chrome.tabs.onCreated.addListener((tab) => {
    //console.log("tabs.onCreated(", tab, ")");
});

chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    //console.log("tabs.onDetached(", tabId, detachInfo, ")");
});

// Deprecated: Use onHighlighted
// chrome.tabs.onHighlightChanged.addListener((selectInfo) => {
//     console.log("tabs.onHighlightChanged(", selectInfo, ")");
// });

chrome.tabs.onHighlighted.addListener((highlightInfo) => {
    //console.log("tabs.onHighlighted(", highlightInfo, ")");
});

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
    console.log("tabs.onMoved(", tabId, moveInfo, ")");
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    console.log("tabs.onRemoved(", tabId, removeInfo, ")");
    const collapsedGroupTitles = await organizer.getCollapsedGroupTitles();
    await organizer.groupAllTabs(collapsedGroupTitles);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    //console.log("tabs.onReplaced(", addedTabId, removedTabId, ")");
});

// Deprecated:Use onActivated
// chrome.tabs.onSelectionChanged.addListener((tabId, selectInfo) => {
//     console.log("tabs.onSelectionChanged(", tabId, selectInfo, ")");
// });

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if ('url' in changeInfo || 'groupId' in changeInfo) {
        console.log("tabs.onUpdated(", tabId, changeInfo, tab, ")");
    }
    if ('url' in changeInfo) {
        // Information about the current groups, before we go and move everything around.
        const collapsedGroupTitles = await organizer.getCollapsedGroupTitles();
        
        await organizer.sortAllTabs();
        await organizer.groupAllTabs(collapsedGroupTitles);
    }
});

chrome.tabs.onZoomChange.addListener((zoomChangeInfo) => {
    //console.log("tabs.onZoomChange(", zoomChangeInfo, ")");
});
