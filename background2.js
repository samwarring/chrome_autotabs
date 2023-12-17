// Used to compare strings
const collator = new Intl.Collator();

// Extension options
const options = {
    enableSort: true,
    enableGroups: true,
    groupThreshold: 4,
    groupColors: [
        ["google", "blue"],
        ["stackoverflow", "orange"],
        ["duckduckgo", "red"],
    ],
};

// A class whose objects hold all relevant information about a tab.
class Tab {

    // tab: Tab object returned from the chrome extension API.
    constructor(tab) {
        this.id = tab.id;
        this.groupId = tab.groupId;
        this.index = tab.index;
        this.desiredIndex = -1;
        this.moveDistance = 0;

        // Calculate the reversed hostname without TLD.
        const url = new URL(tab.url);
        let hostParts = url.host.split('.');
        if (hostParts.length > 1) {
            hostParts.pop();
            hostParts.reverse();
        }
        this.hostParts = hostParts;
        this.path = url.pathname;
    }

    // otherTab: Another instance of Tab.
    // returns: -1 if this tab should be sorted before otherTab
    //          0 if this tab should be sorted equally with otherTab
    //          1 if this tab should be sorted after otherTab.
    //
    // Tabs are sorted alphabetically by reversed domain name, then
    // by path for those tabs that share a reversed domain name.
    compareTo(otherTab) {
        // Minimum number of host parts to compare.
        const minPartsLen = Math.min(
            this.hostParts.length, otherTab.hostParts.length);
        
        // Compare by host parts
        for (let i = 0; i < minPartsLen; i++) {
            const result = collator.compare(
                this.hostParts[i], otherTab.hostParts[i]);
            if (result != 0) {
                // Difference between host parts.
                return result;
            }
        }
        
        // Host parts up to the minimum size were equal.
        if (this.hostParts.length == otherTab.hostParts.length) {
            // Reversed hostnames were the same. Compare by path.
            return collator.compare(this.path, otherTab.path);
        }
        else if (this.hostParts.length < otherTab.hostParts.length) {
            // This hostname was shorter. This tab gets sorted first.
            return -1;
        }
        else {
            // The otherTab's hostname was shorter. That tab gets sorted first.
            return 1;
        }
    }
}

// A class whose objects manage an individual browser window.
class Window {

    // windowId: id of the window according to the extension API.
    constructor(windowId) {
        this._id = windowId;
        this._tabs = []
        this._numPinnedTabs = 0;
        this._hostTreeRoot = this._makeHostTreeNode();
        this._groupMap = {};
        this._groupList = [];
    }

    // Sorts and groups all tabs in the window.
    async sortAndGroupTabs() {
        const startTime = new Date();

        await this._loadTabs();
        this._constructHostTree();
        this._constructGroupMap();
        this._constructGroupList();
        await this._moveTabs();
        await this._groupTabs();

        const endTime = new Date();
        const elapsed = endTime - startTime;
        console.log("Reorganized", this._tabs.length, "tabs in", elapsed, "ms");
    }

    // Retrieves all tabs in the window.
    async _loadTabs() {
        const tabs = await chrome.tabs.query({
            url: [
                "http://*/*",
                "https://*/*"
            ],
            windowId: this._id,
            pinned: false
        });
        for (const tab of tabs) {
            this._tabs.push(new Tab(tab));
        }
        const pinnedTabs = await chrome.tabs.query({
            windowId: this._id,
            pinned: true
        });
        this._numPinnedTabs = pinnedTabs.length;
    }

    // Constructs an empty node for the host tree.
    _makeHostTreeNode() {
        return {
            childTabs: [],
            childHosts: {}
        };
    }

    // Constructs the host tree.
    _constructHostTree() {
        this._hostTreeRoot = this._makeHostTreeNode();
        // Add each tab to the host tree.
        for (const tab of this._tabs) {

            // Find or create the node in the host tree by iterating over the
            // tab's host parts.
            let node = this._hostTreeRoot;
            for (const hostPart of tab.hostParts) {
                if (!(hostPart in node.childHosts)) {
                    node.childHosts[hostPart] = this._makeHostTreeNode();
                }
                node = node.childHosts[hostPart];
            }
            node.childTabs.push(tab);
        }
    }

    // Constructs the groupMap which maps groupName to [tabs]
    _constructGroupMap() {
        this._groupMap = {};
        for (const [hostPart, node] of
            Object.entries(this._hostTreeRoot.childHosts)) {
            
            // Make groups from all descendant nodes.
            const ungroupedTabs = this._constructGroupMapRecursive(
                node, hostPart);

            // Any remaining ungrouped nodes get grouped for this top-level
            // host part.
            if (ungroupedTabs.length > 0) {
                this._groupMap[hostPart] = ungroupedTabs;
            }
        }
    }

    // Constructs part of the groupMap by visiting the given node and its
    // descendants.
    //
    // node: a node from the host tree
    // groupName: name of the group to be created if there are enough
    //            ungrouped tabs.
    // returns: list of tabs that don't yet belong to a group.
    _constructGroupMapRecursive(node, groupName) {
        // Tabs immediately under this node don't have a group yet.
        let ungroupedTabs = [];
        ungroupedTabs.push(...node.childTabs);

        // Visit descendants first.
        for (const [hostPart, childNode] of Object.entries(node.childHosts)) {
            let childResult = this._constructGroupMapRecursive(
                childNode, groupName + ' ' + hostPart);
            ungroupedTabs.push(...childResult);
        }

        // If enough tabs remain ungrouped, make a group for them.
        if (ungroupedTabs.length >= options.groupThreshold) {
            this._groupMap[groupName] = ungroupedTabs;
            return [];
        }
        else {
            return ungroupedTabs;
        }
    }

    // Sorts the groupMap alphabetically, and sorts the tabs within each group
    // alphabetically.
    _constructGroupList() {
        this._groupList = [];
        let groupNames = Object.keys(this._groupMap);
        groupNames.sort();
        for (const groupName of groupNames) {
            let group = {
                name: groupName,
                tabs: []
            };
            group.tabs.push(...this._groupMap[groupName]);
            group.tabs.sort((t1, t2) => t1.compareTo(t2));
            this._groupList.push(group);
        }
    }

    async _moveTabs() {
        // Calculate desired index and move-distance of each tab.
        let tabs = [];
        let index = this._numPinnedTabs;
        for (const group of this._groupList) {
            for (const tab of group.tabs) {
                tab.desiredIndex = index++;
                tab.moveDistance = Math.abs(tab.desiredIndex - tab.index);
                tabs.push(tab);
            }
        }

        // Sort tabs by move distance, with greatest move distance coming first.
        tabs.sort((t1, t2) => t2.moveDistance - t1.moveDistance);

        // Move the tabs. By moving tabs with greatest move-distance first, we
        // may find other tabs don't need to be moved by the time we get to them.
        for (const tab of tabs) {
            await chrome.tabs.move(tab.id, { index: tab.desiredIndex });
        }
    }

    async _groupTabs() {
        for (const group of this._groupList) {
            // Put tabs into buckets according to their current tabGroup id.
            let groupIds = {};
            for (const tab of group.tabs) {
                if (!(tab.groupId in groupIds)) {
                    groupIds[tab.groupId] = [];
                }
                groupIds[tab.groupId].push(tab.id);
            }

            if (group.tabs.length < options.groupThreshold) {
                // Not enough tabs to form a physical group.
                await this._enforceTabUngroup(group, groupIds);
            }
            else {
                // These tabs should form a distinct physical group.
                await this._enforceTabGroup(group, groupIds);
            }
        }
    }

    // Ensure that the tabs in this logical group get ungrouped if necessary.
    //
    // group: object from the group list
    // currentGroupIds: mapping of existing group id => [tab id] for all tabs
    //                  in this logical group.
    async _enforceTabUngroup(group, currentGroupIds) {
        let tabsInAnyGroup = [];
        for (const [groupIdStr, tabIds] of Object.entries(currentGroupIds)) {
            // XXX: keys are always strings. Need to treat as int.
            const groupId = parseInt(groupIdStr);
            if (groupId != -1) {
                // These tabs currently belong to a tab group.
                tabsInAnyGroup.push(...tabIds);
            }
        }
        if (tabsInAnyGroup.length > 0) {
            // Ungroup any tabs that currently belong to a tab group.
            console.log("Ungrouping", group.name);
            await chrome.tabs.ungroup(tabsInAnyGroup);
        }
    }

    // Ensure that the tabs in this logical group get put into their own
    // distinct group if necessary.
    //
    // group: object from the group list
    // currentGroupIds: mapping of existing group id => [tab id] for all tabs
    //                  in this logical group.
    async _enforceTabGroup(group, currentGroupIds) {
        // Check the current group ids to see if the desired group already
        // exists among them.
        let targetGroupId = null;
        let updateRequired = false;
        for (const [groupIdStr, tabIds] of Object.entries(currentGroupIds)) {
            // XXX: keys are always strings. Need to treat as int.
            const groupId = parseInt(groupIdStr);
            if (groupId == -1) {
                // One of the tabs doesn't belong to any tab group.
                updateRequired = true;
                continue;
            }
            const tabGroup = await chrome.tabGroups.get(groupId);
            if (tabGroup.title == group.name) {
                // One of the tabs belongs to the desired tab group.
                targetGroupId = groupId;
                continue;
            }
            // One of the tabs belongs to the wrong tab group.
            updateRequired = true;
        }

        // If no updates required, then we're done.
        if (!updateRequired) {
            return;
        }

        // Get list of all tab ids in the logical group.
        const tabIds = group.tabs.map((tab) => tab.id);

        if (targetGroupId == null) {
            console.log("Grouping", group.name, "- make new group");
            // Target group was not found, make a new group.
            const tabGroupId = await chrome.tabs.group({
                createProperties: { windowId: this._id },
                tabIds
            });
            await chrome.tabGroups.update(tabGroupId, {
                title: group.name
            });
        }
        else {
            console.log("Grouping", group.name, "- add to existing group");
            // Target group already exists. Move tabs to that group.
            await chrome.tabs.group({ tabIds, groupId: targetGroupId });
        }
    }
}

// Wrap the service worker logic with an immediately-invoked function expression
// (IIFE). This allows await-ing the results of APIs at the "top-level".
(async () => {
    console.log("Tab Harmony service worker starting...");

    // Load the current extension options.
    const storage = await chrome.storage.sync.get();
    Object.assign(options, storage.options);
    console.log("Loaded options:", options);

    // Register callback when a tab gets updated.
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if ('url' in changeInfo) {
            const window = new Window(tab.windowId);
            await window.sortAndGroupTabs();
        }
    });

    // Register callback when a tab gets closed.
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
        if (!removeInfo.isWindowClosing) {
            const window = new Window(removeInfo.windowId);
            await window.sortAndGroupTabs();
        }
    });
})();