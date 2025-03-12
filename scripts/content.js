console.log("Allergenie content script running...");

// Detect the page type
if (window.location.href.includes("/gp/cart/view.html")) {
    console.log("Detected cart page, scanning cart items...");
    scanCartItems();
} else {
    console.log("Detected search results page, scanning search results...");
    scanSearchResults();
}

function scanCartItems() {
    const cartItems = document.getElementsByClassName("a-link-normal sc-product-link sc-product-title aok-block");

    if (cartItems.length > 0) {
        // Inject styles.css into the page
        const link = document.createElement("link");
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

            const allergenSet = new Set(allergens.map(a => a.toLowerCase()));

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

                        let containsAllergen = false;
                        allergens.forEach(allergen => {
                            if (ingredientsText.toLowerCase().includes(allergen)) {
                                containsAllergen = true;
                            }
                        });

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

            Promise.all(fetchPromises).then(() => {
                document.getElementById("allergenie-content").innerHTML = scanResults.join("");

                if (flaggedProducts.length > 0) {
                    alert("⚠️ Some items in your cart contain allergens!");
                }
            });
        });
    }
}

function scanSearchResults() {
    chrome.storage.sync.get("allergens", (data) => {
        const allergens = data.allergens || [];
        console.log("Scanning search results with allergens:", allergens);

        if (allergens.length === 0) {
            console.log("No allergens saved yet, skipping scan");
            chrome.runtime.sendMessage({ flaggedProducts: [] });
            return;
        }

        let flaggedProducts = [];

        const productElements = document.querySelectorAll(".s-result-item[data-asin]:not([data-asin=''])");
        console.log(`Found ${productElements.length} products to scan`);

        if (productElements.length === 0) {
            console.log("Trying alternative product selectors");
            tryAlternativeProductScan(allergens, flaggedProducts);
            return;
        }

        productElements.forEach((product) => {
            let productText = product.textContent.toLowerCase();
            let titleElement = product.querySelector("h2 a span, h2 span, .a-text-normal");
            let productTitle = titleElement ? titleElement.textContent.toLowerCase() : "";

            if (!productTitle) {
                productTitle = productText;
            }

            let foundAllergens = [];

            allergens.forEach(allergen => {
                const allergenTerm = allergen.trim().toLowerCase();
                if (allergenTerm !== "") {
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

    if (flaggedProducts.length > 0) {
        console.log(`Found ${flaggedProducts.length} products containing allergens:`, flaggedProducts);
        chrome.runtime.sendMessage({ flaggedProducts });
    } else {
        console.log("✅ No allergen-containing products found.");
        chrome.runtime.sendMessage({ flaggedProducts: [] });
    }
}
