const options = {
    enableSort: true,
    enableGroups: true,
    groupThreshold: 4,
    groupColors: [],
};

const loadedOptions = chrome.storage.sync.get().then((items) => {
    Object.assign(options, items.options);
    console.log("LOADED OPTIONS:", options);
});

const organizer = {
    collator: new Intl.Collator(),

    getAllTabs: async function(windowId) {
        return chrome.tabs.query({
            url: [
                "http://*/*",
                "https://*/*"
            ],
            windowId,
            pinned: false
        });
    },

    getPinnedTabs: async function(windowId) {
        return chrome.tabs.query({
            pinned: true
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

    sortAllTabs: async function(windowId) {
        const tabs = await this.getAllTabs(windowId);
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

        // We are only dealing with unpinned tabs. All tab positions need to be
        // offset by the number of pinned tabs.
        const pinnedTabs = await this.getPinnedTabs(windowId);
        const numPinnedTabs = pinnedTabs.length;

        // Compute how far each tab needs to move
        for (let i = 0; i < keyedTabs.length; i++) {
            const newIndex = i + numPinnedTabs;
            keyedTabs[i].newIndex = newIndex;
            keyedTabs[i].distance = Math.abs(keyedTabs[i].tab.index - newIndex);
        }

        // Sort the tabs again, this time by how far they need to move.
        keyedTabs.sort((a, b) => b.distance - a.distance);

        // Move the tabs
        for (const keyedTab of keyedTabs) {
            await chrome.tabs.move(keyedTab.tab.id, { index: keyedTab.newIndex });
        }
    },

    getSetValue: function(set) {
        for (const value of set) {
            return value;
        }
        return null;
    },

    getPositiveSetValue: function(set) {
        for (const value of set) {
            if (value > 0) {
                return value;
            }
        }
        return null;
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

    getGroupColor: function(groupName) {
        for (const entry of options.groupColors) {
            if (this.collator.compare(groupName, entry[0]) == 0) {
                return entry[1];
            }
        }
        return null;
    },

    getLogicalGroups: async function(windowId) {
        // Get info about existing groups.
        const tabs = await this.getAllTabs(windowId);
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

    groupAllTabs: async function(windowId) {        
        const groupInfos = await this.getLogicalGroups(windowId);
        console.log("LOGICAL GROUPS:", groupInfos);

        // Look at each logical group.
        for (const groupInfo of groupInfos) {
            const groupKey = groupInfo[0];
            const groupIds = groupInfo[1].groupIds;
            const groupTabs = groupInfo[1].tabs;
            if (groupTabs.length >= options.groupThreshold) {
                // This logical group has enough tabs to be an actual tab group.
                let makeNewGroup = true;
                let moveToGroupId = -1;
                if (groupIds.size == 1 && !groupIds.has(-1)) {
                    // All tabs in the logical group already share a tab group.
                    const tabGroupId = this.getSetValue(groupIds);
                    const tabGroup = await chrome.tabGroups.get(tabGroupId);
                    if (tabGroup.title == groupKey) {
                        // And they are in the correct group.
                        makeNewGroup = false;
                    }
                }
                else if (groupIds.size > 1) {
                    // Tabs are split up. Maybe some are in the correct group,
                    // but maybe none are in the correct group.
                    for (const tabGroupId of groupIds.values()) {
                        if (tabGroupId != -1) {
                            const tabGroup = await chrome.tabGroups.get(tabGroupId);
                            if (tabGroup.title == groupKey) {
                                // At least one is in the correct group.
                                makeNewGroup = false;
                                moveToGroupId = tabGroupId;
                                break;
                            }
                        }
                    }
                }

                if (makeNewGroup) {
                    // None of the tabs were in the right group. Make a new one.
                    console.log("NEW TAB GROUP", { groupKey });
                    const tabIds = groupTabs.map((tab) => tab.id);
                    const tabGroupId = await chrome.tabs.group({ 
                        createProperties: { windowId },
                        tabIds
                    });
                    const updateProperties = {
                        title: groupKey
                    };
                    const groupColor = this.getGroupColor(groupKey);
                    if (groupColor) {
                        updateProperties.color = groupColor;
                    }
                    await chrome.tabGroups.update(tabGroupId, updateProperties);
                }
                else if (moveToGroupId != -1) {
                    // At least one tab was in the right group. Add the missing tabs to it.
                    console.log("ADD TO TAB GROUP", { groupKey });
                    const tabIds = (groupTabs
                        .filter((tab) => tab.groupId != moveToGroupId)
                        .map((tab) => tab.id));
                    await chrome.tabs.group({ tabIds, groupId: moveToGroupId });
                    const groupColor = this.getGroupColor(groupKey);
                    if (groupColor) {
                        await chrome.tabGroups.update(moveToGroupId, { color: groupColor });
                    }
                }
                else {
                    // All tabs already in the right group. Only need to fix the color if necessary.
                    const tabGroupId = this.getSetValue(groupIds);
                    const groupColor = this.getGroupColor(groupKey);
                    if (groupColor) {
                        await chrome.tabGroups.update(tabGroupId, { color: groupColor });
                    }
                }
            }
            else {
                // This logical group has too few tabs to be an actual tab group.
                if (groupIds.size > 1 || this.getSetValue(groupIds) != -1) {
                    // At least one of the tabs belongs to a group. Ungroup them all.
                    console.log("UNGROUP TABS", { groupKey });
                    const tabIds = groupTabs.map((tab) => tab.id);
                    await chrome.tabs.ungroup(tabIds);
                }
            }
        }
    },

    ungroupAllTabs: async function(windowId) {
        const tabs = await this.getAllTabs(windowId);
        const tabIds = tabs.map((tab) => tab.id);
        await chrome.tabs.ungroup(tabIds);
    },

    updateGroupColors: async function(windowId) {
        const tabGroups = await chrome.tabGroups.query({ windowId });
        for (const tabGroup of tabGroups) {
            const desiredColor = this.getGroupColor(tabGroup.title);
            if (desiredColor && desiredColor != tabGroup.color) {
                console.log("UPDATE GROUP COLOR", { title: tabGroup.title, color: desiredColor });
                await chrome.tabGroups.update(tabGroup.id, { color: desiredColor });
            }
        }
    },

    handleOptionsUpdate: async function(newOptions) {
        const oldOptions = {};
        Object.assign(oldOptions, options);
        Object.assign(options, newOptions);
        const windows = await chrome.windows.getAll();

        for (const window of windows) {
            if (!oldOptions.enableSort && newOptions.enableSort) {
                await this.sortAllTabs(window.id);
            }
            if (newOptions.enableGroups && (!oldOptions.enableGroups ||
                                            (oldOptions.groupThreshold != newOptions.groupThreshold))) {
                await this.groupAllTabs(window.id);
            }
            else if (!newOptions.enableGroups && oldOptions.enableGroups) {
                await this.ungroupAllTabs(window.id);
            }
            else {
                await this.updateGroupColors();
            }
        }
    }
};

const tabUrlCache = {
    urls: new Map(),
    isInitialized: false,

    initialze: async function() {
        if (!this.isInitialized) {
            const tabs = await organizer.getAllTabs();
            for (const tab of tabs) {
                this.urls.set(tab.id, new URL(tab.url));
            }
            this.isInitialized = true;
        }
    },

    removeTab: function(tabId) {
        this.urls.delete(tabId);
    },

    isTabKeyChanged: function(tab) {
        const newUrl = new URL(tab.url);
        if (this.urls.has(tab.id)) {
            const oldUrl = this.urls.get(tab.id);
            if (oldUrl.host == newUrl.host && oldUrl.pathname == newUrl.pathname) {
                return false;
            }
        }
        this.urls.set(tab.id, newUrl);
        return true;
    }
};

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
    console.log("tabs.onMoved(", tabId, moveInfo, ")");
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    if (!removeInfo.isWindowClosing) {
        console.log("tabs.onRemoved(", tabId, removeInfo, ")");
        await loadedOptions;
        if (options.enableGroups) {
            await organizer.groupAllTabs(removeInfo.windowId);
        }
        tabUrlCache.removeTab(tabId);
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if ('url' in changeInfo && tabUrlCache.isTabKeyChanged(tab)) {
        console.log("tabs.onUpdated(", tabId, changeInfo, tab, ")");
        await tabUrlCache.initialze();
        await loadedOptions;
        if (options.enableSort) {
            await organizer.sortAllTabs(tab.windowId);
        }
        if (options.enableGroups) {
            await organizer.groupAllTabs(tab.windowId);
        }
    }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area == 'sync') {
        console.log("storage.onChanged(", changes, area, ")");
        await organizer.handleOptionsUpdate(changes.options.newValue);
    }
});