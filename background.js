// Used to compare strings
const collator = new Intl.Collator();

// Extension options
const options = {
    groupThreshold: 4,
    altDomains: [
        ["^www.google.com/search.*$", "search.google.com"],
        ["^www.google.com/maps.*$", "maps.google.com"]
    ],
    groupColors: [
        ["google", "blue"],
        ["stackoverflow", "orange"],
        ["duckduckgo", "red"],
    ],
    autoCollapseEnabled: true,
    autoCollapseLimit: 3,

    getGroupColor: function(groupName) {
        let color = null;
        const nameParts = groupName.split(' ');
        let nameSearch = '';
        // Find a rule for each subdomain of the group name. The longest
        // match wins.
        for (const namePart of nameParts) {
            if (nameSearch == '') {
                nameSearch = namePart;
            }
            else {
                nameSearch += ' ' + namePart;
            }
            for (const colorRule of this.groupColors) {
                if (colorRule[0] == nameSearch) {
                    color = colorRule[1];
                }
            }
        }
        return color;
    },

    getHostParts: function(url) {
        // First, check for an alternate domain
        let host = url.host;
        let hostAndPath = url.host + url.pathname;
        for (const altDomain of this.altDomains) {
            const pattern = altDomain[0];
            const replacement = altDomain[1];
            let compiledPattern = null;
            try {
                compiledPattern = new RegExp(pattern);
            } catch (err) {
                // If pattern was not valid regex, ignore it.
                continue;
            }
            if (hostAndPath.match(compiledPattern)) {
                host = replacement;
            }
        }

        // If the host is an IPv4 address, use that as it's own hostPart
        const ipv4Pattern = new RegExp(
            "^([0-9]|[0-9]{2}|1[0-9]{2}|2[0-4][0-9]|25[0-5])" +         // first octet
            "([.]([0-9]|[0-9]{2}|1[0-9]{2}|2[0-4][0-9]|25[0-5])){3}" +  // next 3 octets
            "(:[0-9]+)?$");                                             // port number
        if (host.match(ipv4Pattern) != null) {
            return [host];
        }

        // If the host is just one token, use that. Otherwise, strip
        // the last token and reverse the remaining tokens.
        let hostParts = host.split('.');
        if (hostParts.length > 1) {
            hostParts.pop();
            hostParts.reverse();
        }
        return hostParts;
    }
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
        try {
            const url = new URL(tab.url);
            this.hostParts = options.getHostParts(url);    
            this.path = url.pathname;
        } catch (error) {
            this.hostParts = [];
            this.path = "";
        }
    }

    // otherTab: Another instance of Tab.
    // returns: -1 if this tab should be sorted before otherTab
    //          0 if this tab should be sorted equally with otherTab
    //          1 if this tab should be sorted after otherTab.
    //
    // Tabs are sorted alphabetically by reversed domain name, then
    // by path for those tabs that share a reversed domain name. If
    // the paths are also the same, then preserve the existing sorted
    // order of the tabs.
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
            const pathCompare = collator.compare(this.path, otherTab.path);
            if (pathCompare == 0) {
                // Paths were the same. Preserve existing order.
                if (this.index < otherTab.index) {
                    return -1;
                } else if (this.index == otherTab.index) {
                    // This should never happen.
                    return 0;
                } else {
                    return 1;
                }
            } else {
                return pathCompare;
            }
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
        this._activeTabGroups = [];
    }

    // Sorts and groups all tabs in the window.
    async sortAndGroupTabs() {
        console.log("Organizing window", this._id);
        const startTime = new Date();

        await this._loadTabs();
        this._constructHostTree();
        this._constructGroupMap();
        this._constructGroupList();
        await this._moveTabs();
        await this._groupTabs();

        const endTime = new Date();
        const elapsed = endTime - startTime;

        console.log("Organizing window", this._id, "- done,",
                    this._tabs.length, "tabs,", elapsed, "ms");
    }

    // Auto-collapses least recently used tab groups.
    async setCurrentTabGroup(tabGroupId) {
        this._touchTabGroup(tabGroupId);
        await this._collapseInactiveTabGroups();
    }

    // ------------------------------------------------------------------------
    // Private methods

    // Retrieves all tabs in the window.
    async _loadTabs() {
        const tabs = await chrome.tabs.query({
            windowId: this._id,
            pinned: false
        });
        this._tabs = [];
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
        
        // If the window contains tabs with unknown URLs (e.g. the url is not http or https),
        // put those tabs in a special group without a name.
        if (this._hostTreeRoot.childTabs.length > 0) {
            this._groupMap[""] = this._hostTreeRoot.childTabs;
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
        console.debug("Group list", this._groupList);
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
            if (tab.moveDistance > 0) {
                await chrome.tabs.move(tab.id, { index: tab.desiredIndex });
            }
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

            if (group.tabs.length < options.groupThreshold || group.name == "") {
                // Not enough tabs to form a physical group.
                // OR this is a special group containing tabs with unknown URLs (which
                // should always be kept ungrouped).
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
        console.debug("Enforce ungroup", group.name);
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
            console.log("Ungroup", group.name);
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
        console.debug("Enforce group", group.name);
        
        // Check the current group ids to see if the desired group already
        // exists among them.
        let targetGroupId = null;
        let requireCreate = true;
        let requireMove = false;
        let requireColor = false;
        const groupColor = options.getGroupColor(group.name);
        for (const [groupIdStr, tabIds] of Object.entries(currentGroupIds)) {
            // XXX: keys are always strings. Need to treat as int.
            const groupId = parseInt(groupIdStr);
            if (groupId == -1) {
                // One of the tabs doesn't belong to any tab group.
                requireMove = true;
                continue;
            }
            let tabGroup = {};
            try {
                tabGroup = await chrome.tabGroups.get(groupId);
            } catch (error) {
                // The group for this tab may have just been dissolved, which
                // could cause an error getting the tab group here. Ignore it.
            }
            if (tabGroup.title == group.name) {
                // One of the tabs belongs to the desired tab group.
                requireCreate = false;
                targetGroupId = groupId;
                
                // Check if the color needs to be updated.
                if (groupColor != null && tabGroup.color != groupColor) {
                    requireColor = true;
                }
                continue;
            }
            // One of the tabs belongs to the wrong tab group.
            requireMove = true;
        }

        // If no updates required, then we're done.
        if (!requireCreate && !requireMove && !requireColor) {
            return;
        }

        // Get list of all tab ids in the logical group.
        const tabIds = group.tabs.map((tab) => tab.id);

        // Used to update the new/existing group if necessary.
        let updateProperties = {};

        if (requireCreate) {
            console.log("Create group", group.name);
            // Target group was not found, make a new group.
            targetGroupId = await chrome.tabs.group({
                createProperties: { windowId: this._id },
                tabIds
            });
            updateProperties.title = group.name;
            requireColor = true;
        }
        else if (requireMove) {
            console.log("Modify group", group.name);
            // Target group already exists. Move tabs to that group.
            await chrome.tabs.group({ tabIds, groupId: targetGroupId });
        }

        // Update group name/color if necessary.
        if (requireColor && groupColor != null) {
            updateProperties.color = groupColor;
        }
        if (Object.keys(updateProperties).length > 0) {
            await chrome.tabGroups.update(targetGroupId, updateProperties);
        }
    }

    // Move tabGroupId to the front of the list of active tab groups, and remove
    // inactive tab group ids from the list.
    _touchTabGroup(tabGroupId) {
        if (tabGroupId == chrome.tabGroups.TAB_GROUP_ID_NONE) {
            // Active tab is not in a group.
            return;
        }
        const currentPos = this._activeTabGroups.indexOf(tabGroupId);
        if (currentPos == 0) {
            // Tab group already active.
            return;
        }
        else if (currentPos != -1) {
            // Recent tab group is re-visited. Move to front.
            this._activeTabGroups.splice(currentPos, 1);
            this._activeTabGroups.unshift(tabGroupId);
        }
        else {
            // Visiting an inactive tab group. Evict the least-recently
            // used tab group (if necessary).
            this._activeTabGroups.unshift(tabGroupId);
            if (this._activeTabGroups.length > options.autoCollapseLimit) {
                this._activeTabGroups.pop();
            }
        }
    }

    // Collapse inactive tab groups according to the current settings.
    async _collapseInactiveTabGroups() {
        if (!options.autoCollapseEnabled) {
            return;
        }
        
        // Get all non-collapsed (i.e. expanded) tab groups.
        let tabGroups = null;
        try {
            tabGroups = await chrome.tabGroups.query({windowId: this._id, collapsed: false});
        } catch (error) {
            console.error(error);
            return;
        }
        
        await tabGroups.forEach(async (tabGroup) => {
            if (this._activeTabGroups.indexOf(tabGroup.id) == -1) {
                // Tab group not found in active tab groups. This tab group needs to
                // be collapsed.
                try {
                    console.log("Window", this._id, "collapsing group:", tabGroup.title);
                    await chrome.tabGroups.update(tabGroup.id, {collapsed: true});
                } catch (error) {
                    console.error(error);
                }
            }
        });
    }
}

// Manages the collection of all opened windows.
const windows = {
    _map: new Map(),

    getWindow: function(windowId) {
        if (!this._map.has(windowId)) {
            this._map.set(windowId, new Window(windowId));
        }
        return this._map.get(windowId);
    },

    removeWindow: function(windowId) {
        this._map.delete(windowId);
    },
};

// The URLCache maps each tab ID to its URL. When a tab is updated, we check
// the URLCache to determine if the URL has changed significantly. If not,
// then we will avoid re-sorting the window.
const urlCache = {
    _urls: new Map(),

    isTabUrlChanged: function(tab) {
        let newUrl = null;
        try {
            newUrl = new URL(tab.url);
        } catch (error) {
            // The URL cannot be parsed (could be a local PDF file). Clear
            // the tab from the cache and always consider the URL changed.
            this._urls.delete(tab.id);
            return true;
        }
        if (this._urls.has(tab.id)) {
            const oldUrl = this._urls.get(tab.id);
            if (oldUrl.host == newUrl.host && oldUrl.pathname == newUrl.pathname) {
                return false;
            }
        }
        this._urls.set(tab.id, newUrl);
        return true;
    },

    removeTab: function(tabId) {
        this._urls.delete(tabId);
    },
};

// Wrap the service worker logic with an immediately-invoked function expression
// (IIFE). This allows await-ing the results of APIs at the "top-level".
(async () => {
    console.log("Tab Harmony service worker starting...");

    // Load the current extension options.
    const storage = await chrome.storage.sync.get();
    Object.assign(options, storage.options);
    console.log("Loaded options:", options);

    // Register callback when settings get updated.
    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area == 'sync') {
            Object.assign(options, changes.options.newValue);
            console.log("Updated options:", options);

            // Reorganize tabs in all windows.
            const chromeWindows = await chrome.windows.getAll({
                windowTypes: ['normal']
            });
            for (const chromeWindow of chromeWindows) {
                await windows.getWindow(chromeWindow.id).sortAndGroupTabs();
            }
        };
    });

    // Register callback when a tab gets updated.
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (("url" in changeInfo || changeInfo.status == "complete") &&
            urlCache.isTabUrlChanged(tab)) {

            await windows.getWindow(tab.windowId).sortAndGroupTabs();
        } else {
            console.debug("Ignoring tab update:", changeInfo, tab);
        }
    });

    // Register callback when a tab gets closed.
    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
        if (!removeInfo.isWindowClosing) {
            urlCache.removeTab(tabId);
            await windows.getWindow(removeInfo.windowId).sortAndGroupTabs();
        }
    });

    // Register callback when a tab gets created.
    chrome.tabs.onCreated.addListener(async (tab) => {
        if (tab.status == "complete") {
            await windows.getWindow(tab.windowId).sortAndGroupTabs();
        }
    });

    // Register callback when a tab is selected.
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        // Get the tab's group
        const tab = await chrome.tabs.get(activeInfo.tabId);
        
        // Unfortunately, we cannot collapse the tab groups right away, or we may
        // get an error saying "Tabs cannot be edited right now (user may be dragging
        // a tab)". The workaround is to delay the auto-collapsing by a short period.
        setTimeout(async () => {
            await windows.getWindow(tab.windowId).setCurrentTabGroup(tab.groupId);
        }, 100 /* ms */);
    });

})();
