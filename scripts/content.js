console.log("Allergenie content script running...");

const cartItems = document.getElementsByClassName("a-link-normal sc-product-link sc-product-title aok-block");

if (cartItems.length > 0) {
    // Inject styles.css into the page
    const link = document.createElement("styles");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("styles.css");
    document.head.appendChild(link);

    // Create the popup container
    const popup = document.createElement("div");
    popup.classList.add("allergenie-popup");

    // Title and close button
    popup.innerHTML = `
        <div class="allergenie-header">
            <strong>Allergenie Scan Results</strong>
            <button id="closePopup">✖</button>
        </div>
        <div id="allergenie-content">Scanning...</div>
    `;

    document.body.appendChild(popup);

    // Close button functionality
    document.getElementById("closePopup").addEventListener("click", () => popup.remove());

    // Load user allergens from storage
    chrome.storage.sync.get("allergens", (data) => {
        const allergens = data.allergens || [];
        let flaggedProducts = [];
        let scanResults = [];

        // Convert to lowercase for comparison
        const allergenSet = new Set(allergens.map(a => a.toLowerCase()));

        // Process each cart item
        let fetchPromises = Array.from(cartItems).map(item => {
            let link = item.getAttribute("href");
            if (link && !link.startsWith("http")) {
                link = "https://www.amazon.in" + link;
            }

            console.log("Fetching product:", link);
            
            return fetch(link)
                .then(response => response.text())
                .then(html => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, "text/html");
                    const productTable = doc.querySelector("#productDetails_techSpec_section_1");

                    let ingredientsText = "Ingredients not found";

                    if (productTable) {
                        const rows = productTable.querySelectorAll("tr");

                        rows.forEach(row => {
                            const th = row.querySelector("th");
                            if (th && th.innerText.trim().toLowerCase() === "ingredients") {
                                const td = row.querySelector("td.a-size-base.prodDetAttrValue");
                                if (td) {
                                    ingredientsText = td.innerText.trim();
                                }
                            }
                        });
                    }

                    console.log(`Extracted ingredients for ${link}:`, ingredientsText);

                    // Check for allergens
                    let containsAllergen = false;
                    allergens.forEach(allergen => {
                        if (ingredientsText.toLowerCase().includes(allergen)) {
                            containsAllergen = true;
                        }
                    });

                    // Store results
                    if (containsAllergen) {
                        flaggedProducts.push(link);
                        scanResults.push(`<p class="allergen-warning">⚠️ <strong>Contains allergens:</strong> ${ingredientsText}</p>`);
                    } else {
                        scanResults.push(`<p>✅ <strong>No allergens detected.</strong> ${ingredientsText}</p>`);
                    }
                    
                    chrome.runtime.sendMessage({ flaggedProducts });
                })
                .catch(error => console.error("Error fetching link:", link, error));
        });

        // Once all fetches complete, update the UI
        Promise.all(fetchPromises).then(() => {
            document.getElementById("allergenie-content").innerHTML = scanResults.join("");

            if (flaggedProducts.length > 0) {
                alert("⚠️ Some items in your cart contain allergens!");
            }
        });
    });
};
