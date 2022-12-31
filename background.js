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
                    const tabGroupId = await chrome.tabs.group({ tabIds });
                    await chrome.tabGroups.update(tabGroupId, { title: groupKey, color: "grey" });
                }
                else if (moveToGroupId != -1) {
                    // At least one tab was in the right group. Add the missing tabs to it.
                    console.log("ADD TO TAB GROUP", { groupKey });
                    const tabIds = (groupTabs
                        .filter((tab) => tab.groupId != moveToGroupId)
                        .map((tab) => tab.id));
                    await chrome.tabs.group({ tabIds, groupId: moveToGroupId });
                }
            }
            else {
                // This logical group has too few tabs to be an actual tab group.
                console.log("UNGROUP TABS", { groupKey });
                const tabIds = groupTabs.map((tab) => tab.id);
                await chrome.tabs.ungroup(tabIds);
            }
        }
    },
};

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
    console.log("tabs.onMoved(", tabId, moveInfo, ")");
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    console.log("tabs.onRemoved(", tabId, removeInfo, ")");
    const collapsedGroupTitles = await organizer.getCollapsedGroupTitles();
    await organizer.groupAllTabs(collapsedGroupTitles);
});

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
