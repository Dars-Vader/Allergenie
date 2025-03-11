console.log("Allergenie content script running...");

// Wait for the page to fully load
window.addEventListener("load", () => {
    console.log("Page fully loaded, scanning for allergens now");
    scanForAllergens();
});

function scanForAllergens() {
    chrome.storage.sync.get("allergens", (data) => {
        const allergens = data.allergens || [];
        console.log("Scanning with allergens:", allergens);
        
        if (allergens.length === 0) {
            console.log("No allergens saved yet, skipping scan");
            chrome.runtime.sendMessage({ flaggedProducts: [] });
            return; // No allergens saved, skip scan
        }

        let flaggedProducts = [];
        
        // First try specific product cards
        const productElements = document.querySelectorAll(".s-result-item[data-asin]:not([data-asin=''])");
        console.log(`Found ${productElements.length} products to scan`);
        
        if (productElements.length === 0) {
            // If no products found with that selector, try a more general approach
            console.log("Trying alternative product selectors");
            tryAlternativeProductScan(allergens, flaggedProducts);
            return;
        }
        
        productElements.forEach((product) => {
            // Get the entire text content of the product card
            let productText = product.textContent.toLowerCase();
            let titleElement = product.querySelector("h2 a span, h2 span, .a-text-normal");
            let productTitle = titleElement ? titleElement.textContent.toLowerCase() : "";
            
            // If no title found, use the whole product card text
            if (!productTitle) {
                productTitle = productText;
            }
            
            let foundAllergens = [];
            
            allergens.forEach(allergen => {
                // Only consider non-empty allergens and do word boundary checks
                const allergenTerm = allergen.trim().toLowerCase();
                if (allergenTerm !== "") {
                    // Create a regex that matches the word with boundaries where possible
                    const allergenRegex = new RegExp('\\b' + allergenTerm + '\\b', 'i');
                    
                    if (allergenRegex.test(productTitle) || productTitle.includes(allergenTerm)) {
                        foundAllergens.push(allergen);
                    }
                }
            });

            if (foundAllergens.length > 0) {
                console.log(`🚨 Found allergen in product: "${productTitle.substring(0, 50)}..." (⚠️ Contains: ${foundAllergens.join(", ")})`);
                flaggedProducts.push({
                    title: productTitle.length > 50 ? productTitle.substring(0, 50) + "..." : productTitle,
                    allergens: foundAllergens
                });
            }
        });

        // Send flagged products to popup.js
        if (flaggedProducts.length > 0) {
            console.log(`Found ${flaggedProducts.length} products containing allergens:`, flaggedProducts);
            chrome.runtime.sendMessage({ flaggedProducts });
        } else {
            console.log("✅ No allergen-containing products found.");
            chrome.runtime.sendMessage({ flaggedProducts: [] });
        }
    });
}

function tryAlternativeProductScan(allergens, flaggedProducts) {
    // Try to find product titles with more general selectors
    const productTitles = document.querySelectorAll(".a-text-normal, .a-size-base-plus, .a-size-medium");
    console.log(`Found ${productTitles.length} potential product titles with alternative selectors`);
    
    productTitles.forEach((element) => {
        const text = element.textContent.toLowerCase();
        let foundAllergens = [];
        
        allergens.forEach(allergen => {
            const allergenTerm = allergen.trim().toLowerCase();
            if (allergenTerm !== "" && text.includes(allergenTerm)) {
                foundAllergens.push(allergen);
            }
        });
        
        if (foundAllergens.length > 0) {
            // Check if this product is already in our flagged list
            const isDuplicate = flaggedProducts.some(product => 
                product.title.toLowerCase().includes(text.substring(0, 20))
            );
            
            if (!isDuplicate) {
                console.log(`🚨 Found allergen in product: "${text.substring(0, 50)}..." (⚠️ Contains: ${foundAllergens.join(", ")})`);
                flaggedProducts.push({
                    title: text.length > 50 ? text.substring(0, 50) + "..." : text,
                    allergens: foundAllergens
                });
            }
        }
    });
    
    // Scan the entire page for allergen mentions as a fallback
    const pageText = document.body.textContent.toLowerCase();
    let foundPageAllergens = [];
    
    allergens.forEach(allergen => {
        const allergenTerm = allergen.trim().toLowerCase();
        if (allergenTerm !== "" && pageText.includes(allergenTerm)) {
            foundPageAllergens.push(allergen);
        }
    });
    
    if (foundPageAllergens.length > 0 && flaggedProducts.length === 0) {
        flaggedProducts.push({
            title: "Allergens found on page (exact products not identified)",
            allergens: foundPageAllergens
        });
    }
    
    // Send flagged products to popup.js
    if (flaggedProducts.length > 0) {
        console.log(`Found ${flaggedProducts.length} products containing allergens:`, flaggedProducts);
        chrome.runtime.sendMessage({ flaggedProducts });
    } else {
        console.log("✅ No allergen-containing products found.");
        chrome.runtime.sendMessage({ flaggedProducts: [] });
    }
}

// Listen for messages from popup.js to rescan the page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "rescan") {
        console.log("Received rescan request");
        scanForAllergens();
    }
});

// Run scan immediately when script loads, not just on page load
console.log("Running initial scan");
setTimeout(scanForAllergens, 1000); // Slight delay to ensure page elements are available