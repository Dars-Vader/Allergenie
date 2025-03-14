document.addEventListener("DOMContentLoaded", () => {
    const allergenInput = document.getElementById("allergenInput");
    const saveButton = document.getElementById("saveAllergens");
    const statusMessage = document.getElementById("status");
    
    console.log("Popup initialized");

    // Load saved allergens
    chrome.storage.sync.get("allergens", (data) => {
        const allergens = data.allergens || [];
        console.log("Loaded saved allergens:", allergens);
        if (allergens.length > 0) {
            allergenInput.value = allergens.join(", ");
        }
    });

    // Save allergens
    saveButton.addEventListener("click", () => {
        const allergens = allergenInput.value
            .split(",")
            .map(a => a.trim().toLowerCase())
            .filter(a => a !== ""); // Filter out empty strings
            
        console.log("Saving allergens:", allergens);

        chrome.storage.sync.set({ allergens }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving allergens:", chrome.runtime.lastError);
                statusMessage.innerText = "Error saving!";
            } else {
                console.log("Successfully saved allergens:", allergens);
                statusMessage.innerText = "Saved!";
                
                // Ask content script to rescan with new allergens
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    if (tabs[0]) {
                        console.log("Sending rescan message to tab:", tabs[0].id);
                        chrome.tabs.sendMessage(tabs[0].id, {action: "rescan"}, (response) => {
                            // Handle potential error if content script isn't ready
                            if (chrome.runtime.lastError) {
                                console.warn("Error sending message:", chrome.runtime.lastError);
                                // Try scanning after a delay
                                setTimeout(() => {
                                    chrome.tabs.sendMessage(tabs[0].id, {action: "rescan"});
                                }, 1000);
                            }
                        });
                    }
                });
            }
        });
    });

    // Request current flagged products from active tab's content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0] && tabs[0].url.includes("amazon")) {
            
            // Try to get results from content script
            chrome.tabs.sendMessage(tabs[0].id, {action: "rescan"}, (response) => {
                // Handle potential error if content script isn't ready
                if (chrome.runtime.lastError) {
                    console.warn("Error sending initial message:", chrome.runtime.lastError);                }
            });
        }
    });

});