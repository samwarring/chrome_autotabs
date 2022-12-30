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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    console.log("tabs.onUpdated(", tabId, changeInfo, tab, ")");
});

chrome.tabs.onZoomChange.addListener((zoomChangeInfo) => {
    console.log("tabs.onZoomChange(", zoomChangeInfo, ")");
});
