// Default options
let options = {
    enableSort: true,
    enableGroups: true,
    groupThreshold: 4
};

const controller = {
    enableSort: async function(isEnabled) {
        options.enableSort = isEnabled;
        this.storeOptions();
    },

    enableGroups: async function(isEnabled) {
        options.enableGroups = isEnabled;
        this.storeOptions();
    },

    decreaseGroupThreshold: async function() {
        if (options.groupThreshold > 2) {
            options.groupThreshold--;
            this.storeOptions();
        }
    },

    increaseGroupThreshold: async function() {
        if (options.groupThreshold < 99) {
            options.groupThreshold++;
            this.storeOptions();
        }
    },

    loadOptions: async function() {
        const data = await chrome.storage.sync.get("options");
        Object.assign(options, data.options);
        console.log("LOAD OPTIONS:", options);
    },

    storeOptions: async function() {
        console.log("STORE OPTIONS:", options);
        chrome.storage.sync.set({ options });
    }
};

const ui = {
    enableSort: document.getElementById("enableSort"),
    enableGroups: document.getElementById("enableGroups"),
    groupThreshold: document.getElementById("groupThreshold"),
    decreaseGroupThreshold: document.getElementById("decreaseGroupThreshold"),
    increaseGroupThreshold: document.getElementById("increaseGroupThreshold"),

    updateAll: function() {
        this.enableSort.checked = options.enableSort;
        this.enableGroups.checked = options.enableGroups;
        this.groupThreshold.textContent = String(options.groupThreshold);
    },

    addEventListeners: function() {
        this.enableSort.addEventListener("change", async (event) => {
            await controller.enableSort(event.target.checked);
        });
        this.enableGroups.addEventListener("change", async (event) => {
            await controller.enableGroups(event.target.checked);
        });
        this.decreaseGroupThreshold.addEventListener("click", async () => {
            await controller.decreaseGroupThreshold();
            this.groupThreshold.textContent = String(options.groupThreshold);
        });
        this.increaseGroupThreshold.addEventListener("click", async () => {
            await controller.increaseGroupThreshold();
            this.groupThreshold.textContent = String(options.groupThreshold);
        });
    }
};

await controller.loadOptions();
ui.updateAll();
ui.addEventListeners();