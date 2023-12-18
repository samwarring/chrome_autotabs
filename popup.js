// Default options
let options = {
    groupThreshold: 4,
    altDomains: [
        ["www.google.com", "search.google.com"],
    ],
    groupColors: [
        ["google", "blue"],
        ["stackoverflow", "orange"],
        ["duckduckgo", "red"],
    ],
};

// Used for string comparisons.
const collator = new Intl.Collator();

const controller = {
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

    addAltDomain: async function(pattern, domain) {
        if (pattern.trim() != '' && domain.trim() != '') {
            let foundEntry = false;
            for (const entry of options.altDomains) {
                if (collator.compare(pattern, entry[0]) == 0) {
                    foundEntry = true;
                    entry[1] = domain;
                }
            }
            if (!foundEntry) {
                options.altDomains.push([pattern, domain]);
            }
            this.storeOptions();
        }
    },

    removeAltDomain: async function(pattern) {
        for (let i = 0; i < options.altDomains.length; i++) {
            if (collator.compare(pattern, options.altDomains[i][0]) == 0) {
                options.altDomains.splice(i, 1);
            }
        }
        this.storeOptions();
    },

    addGroupColor: async function(groupName, color) {
        if (groupName) {
            let foundEntry = false;
            for (const entry of options.groupColors) {
                if (collator.compare(groupName, entry[0]) == 0) {
                    foundEntry = true;
                    entry[1] = color;
                }
            }
            if (!foundEntry) {
                options.groupColors.push([groupName, color]);
            }
            this.storeOptions();
        }
    },

    removeGroupColor: async function(groupName) {
        if (groupName) {
            for (let i = 0; i < options.groupColors.length; i++) {
                if (collator.compare(groupName, options.groupColors[i][0]) == 0) {
                    options.groupColors.splice(i, 1);
                }
            }
            this.storeOptions();
        }
    },

    loadOptions: async function() {
        //await chrome.storage.sync.clear();
        const data = await chrome.storage.sync.get("options");
        Object.assign(options, data.options);
        console.log("LOAD OPTIONS:", options);
    },

    storeOptions: async function() {
        console.log("STORE OPTIONS:", options);
        chrome.storage.sync.set({ options });
    },
};

const ui = {
    groupThreshold: document.getElementById("groupThreshold"),
    decreaseGroupThreshold: document.getElementById("decreaseGroupThreshold"),
    increaseGroupThreshold: document.getElementById("increaseGroupThreshold"),
    altDomainAdd: document.getElementById("altDomainAdd"),
    altDomainPattern: document.getElementById("altDomainPattern"),
    altDomainDomain: document.getElementById("altDomainDomain"),
    altDomainList: document.getElementById("altDomainList"),
    altDomainTemplate: document.getElementById("altDomainTemplate"),
    newGroupColorAdd: document.getElementById("newGroupColorAdd"),
    newGroupColorColor: document.getElementById("newGroupColorColor"),
    newGroupColorName: document.getElementById("newGroupColorName"),
    groupColorList: document.getElementById("groupColorList"),
    groupColorTemplate: document.getElementById("groupColorTemplate"),

    updateAll: function() {
        this.groupThreshold.textContent = String(options.groupThreshold);
        this.updateAltDomains();
        this.updateGroupColorSelect();
        this.updateGroupColors();
    },

    updateAltDomains: function() {
        this.altDomainList.textContent = '';
        const entries = Array.from(options.altDomains);
        entries.sort((e1, e2) => collator.compare(e1[0], e2[0]));
        for (const altDomain of entries) {
            const pattern = altDomain[0];
            const domain = altDomain[1];
            this.addAltDomain(pattern, domain);
        }
    },

    addAltDomain: function(pattern, domain) {
        const listItem = this.altDomainTemplate.content.firstElementChild.cloneNode(true);
        const button = listItem.querySelector("input[type='button']");
        const label = listItem.querySelector("label");
        label.textContent = pattern + " → " + domain;
        this.altDomainList.append(listItem);

        button.addEventListener("click", () => {
            controller.removeAltDomain(pattern);
            this.altDomainList.removeChild(listItem);
        });
    },

    updateGroupColorSelect: function() {
        const value = this.newGroupColorColor.value;
        const color = "var(--color-tab-" + value + ")";
        this.newGroupColorColor.style.backgroundColor = color;
    },

    updateGroupColors: function() {
        this.groupColorList.textContent = '';
        const entries = Array.from(options.groupColors);
        entries.sort((e1, e2) => collator.compare(e1[0], e2[0]));
        for (const groupColor of entries) {
            const groupName = groupColor[0];
            const color = groupColor[1];
            this.addGroupColor(groupName, color);
        }
    },

    addGroupColor: function(groupName, color) {
        const listItem = this.groupColorTemplate.content.firstElementChild.cloneNode(true);
        const button = listItem.querySelector("input[type='button']");
        const label = listItem.querySelector("label");
        label.textContent = groupName;
        label.classList.add(color);
        this.groupColorList.append(listItem);

        button.addEventListener("click", () => {
            controller.removeGroupColor(groupName);
            this.groupColorList.removeChild(listItem);
        });
    },

    addEventListeners: function() {
        this.decreaseGroupThreshold.addEventListener("click", async () => {
            await controller.decreaseGroupThreshold();
            this.groupThreshold.textContent = String(options.groupThreshold);
        });
        this.increaseGroupThreshold.addEventListener("click", async () => {
            await controller.increaseGroupThreshold();
            this.groupThreshold.textContent = String(options.groupThreshold);
        });
        this.altDomainAdd.addEventListener("click", async () => {
            const pattern = this.altDomainPattern.value;
            const domain = this.altDomainDomain.value;
            await controller.addAltDomain(pattern, domain);
            this.updateAltDomains();
        });
        this.newGroupColorColor.addEventListener("change", (event) => {
            this.updateGroupColorSelect();
        });
        this.newGroupColorAdd.addEventListener("click", async () => {
            const groupName = this.newGroupColorName.value;
            const color = this.newGroupColorColor.value;
            await controller.addGroupColor(groupName, color);
            this.updateGroupColors();
        });
    }
};

await controller.loadOptions();
ui.updateAll();
ui.addEventListeners();