document.addEventListener("DOMContentLoaded", () => {
    const allergenInput = document.getElementById("allergenInput");
    const saveButton = document.getElementById("saveAllergens");
    const statusMessage = document.getElementById("status");
    const flaggedList = document.getElementById("flaggedList");

    // Load saved allergens
    chrome.storage.sync.get("allergens", (data) => {
        if (data.allergens) {
            console.log("Loaded allergens from storage:", data.allergens);
            allergenInput.value = data.allergens.join(", ");
        }
    });

    // Save allergens
    saveButton.addEventListener("click", () => {
        const allergens = allergenInput.value.split(",").map(a => a.trim().toLowerCase());

        chrome.storage.sync.set({ allergens }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving allergens:", chrome.runtime.lastError);
                statusMessage.innerText = "Error saving!";
            } else {
                console.log("Successfully saved allergens:", allergens);
                statusMessage.innerText = "Saved!";
            }
        });
    });

    // Get flagged products from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.flaggedProducts) {
            flaggedList.innerHTML = "";
            message.flaggedProducts.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item;
                flaggedList.appendChild(li);
            });
        }
    });
});
