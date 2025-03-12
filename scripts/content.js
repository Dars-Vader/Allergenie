console.log("Allergenie content script running...");

if (window.location.href.includes("/gp/cart/view.html")) {
    console.log("Detected cart page, scanning cart items...");
    scanCartItems();
} else if (window.location.href.includes("/s")){
    console.log("Detected search results page, scanning search results...");
    scanSearchResults();
}

function createPopup(title) {
    const popup = document.createElement("div");
    popup.classList.add("allergenie-popup");

    popup.innerHTML = `
        <div class="allergenie-header">
            <strong>${title}</strong>
            <button id="closePopup">✖</button>
        </div>
        <div id="allergenie-content" style="max-height: 300px; overflow-y: auto; padding: 10px; border: 1px solid #ccc; scrollbar-width: thin; scrollbar-color: #888 #f1f1f1;">Scanning...</div>
        <button id="loadMore" class="allergenie-header">Load More</button>
    `;

    document.body.appendChild(popup);
    document.getElementById("closePopup").addEventListener("click", () => popup.remove());

    return popup;
}

function extractIngredients(doc) {
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

    return ingredientsText;
}

// ====== CART SCANNING FUNCTION ======
function scanCartItems() {
    console.log("Starting cart scan...");
    
    const cartItems = document.getElementsByClassName("a-link-normal sc-product-link sc-product-title aok-block");

    if (cartItems.length === 0) {
        console.log("No cart items found");
        return;
    }

    // Create popup to display results
    const popup = createPopup("Allergenie - Cart Scan Results");
    document.getElementById("allergenie-content").innerHTML = "<p>Scanning products for allergens...</p>";

    // Get allergens from storage
    chrome.storage.sync.get("allergens", (data) => {
        const allergens = data.allergens || [];
        console.log(`Checking for allergens: ${allergens.join(", ")}`);
        
        if (allergens.length === 0) {
            document.getElementById("allergenie-content").innerHTML = 
                "<p>⚠️ No allergens are configured. Please add allergens in the extension settings.</p>";
            return;
        }
        
        // Process unique product URLs
        const productUrls = new Set();
        
        // Collect all unique product URLs
        let fetchPromises = Array.from(cartItems).map(item => {
            let link = item.getAttribute("href");
            if (link && !link.startsWith("http")) {
                link = "https://www.amazon.in" + link;
            }
            if (link) {
                productUrls.add(link);
            }
        });
        
        console.log(`Processing ${productUrls.size} unique products from cart`);
        
        // Store flagged products
        const flaggedProducts = [];
        let completedRequests = 0;
        
        // Process each unique URL
        productUrls.forEach(url => {
            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${url}: ${response.status}`);
                    }
                    return response.text();
                })
                .then(html => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, "text/html");
                    
                    // Get product title
                    const title = doc.querySelector("#productTitle") ? 
                                  doc.querySelector("#productTitle").textContent.trim() : 
                                  "Product";
                    
                    // Get product image
                    const imageElement = doc.querySelector("#landingImage, #imgBlkFront");
                    const imageUrl = imageElement ? imageElement.getAttribute("src") : "";
                    
                    // Extract ingredients
                    const ingredientsText = extractIngredients(doc);
                    
                    // Check for allergens
                    const foundAllergens = [];
                    allergens.forEach(allergen => {
                        if (ingredientsText.toLowerCase().includes(allergen.toLowerCase())) {
                            foundAllergens.push(allergen);
                        }
                    });
                    
                    // If allergens found, add to flagged products
                    if (foundAllergens.length > 0) {
                        flaggedProducts.push({
                            title: title,
                            url: url,
                            ingredients: ingredientsText,
                            allergens: foundAllergens,
                            imageUrl: imageUrl
                        });
                    }
                    
                    // Update completed count
                    completedRequests++;
                    
                    // If all requests complete, display results
                    if (completedRequests === productUrls.size) {
                        displayResults(flaggedProducts, "cart");
                    }
                })
                .catch(error => {
                    console.error(`Error processing ${url}:`, error);
                    
                    // Update completed count even on error
                    completedRequests++;
                    
                    // If all requests complete, display results
                    if (completedRequests === productUrls.size) {
                        displayResults(flaggedProducts, "cart");
                    }
                });
        });
    });
}

// ====== SEARCH SCANNING FUNCTION ======
function scanSearchResults() {
    console.log("Starting search results scan...");
    
    // Get allergens from storage
    chrome.storage.sync.get("allergens", (data) => {
        const allergens = data.allergens || [];
        console.log(`Checking for allergens: ${allergens.join(", ")}`);
        
        if (allergens.length === 0) {
            console.log("No allergens saved yet, skipping scan");
            return;
        }

        // Create popup to display results
        const popup = createPopup("Allergenie - Search Scan Results");
        document.getElementById("allergenie-content").innerHTML = "<p>Scanning search results for safe products...</p>";
        
        // Find product elements
        const productElements = document.querySelectorAll(".s-result-item[data-asin]:not([data-asin=''])");
        console.log(`Found ${productElements.length} search result items`);
        
        if (productElements.length === 0) {
            document.getElementById("allergenie-content").innerHTML = 
                "<p>No search results found to scan.</p>";
            return;
        }
        
        // Limit initial scan to first 20 products for performance
        const productsToScan = Array.from(productElements).slice(0, 20);
        
        // Store safe products
        const safeProducts = [];
        const flaggedProducts = [];
        let completedRequests = 0;
        
        // Process each product
        productsToScan.forEach(product => {
            // Get product link
            let productLink = product.querySelector("a.a-link-normal.s-no-outline")?.getAttribute("href");
            if (!productLink) {
                productLink = product.querySelector("a[href*='/dp/']")?.getAttribute("href");
            }
            
            if (!productLink) {
                console.log("Could not find product link for an item");
                completedRequests++;
                return;
            }
            
            if (!productLink.startsWith("http")) {
                productLink = "https://www.amazon.in" + productLink;
            }
            
            // Get product thumbnail from search results
            const thumbnailElement = product.querySelector("img.s-image");
            const thumbnailUrl = thumbnailElement ? thumbnailElement.getAttribute("src") : "";
            
            // Get product title from search results
            const titleElement = product.querySelector("h2 .a-link-normal");
            const titleText = titleElement ? titleElement.textContent.trim() : "Product";
            
            fetch(productLink)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${productLink}: ${response.status}`);
                    }
                    return response.text();
                })
                .then(html => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, "text/html");
                    
                    // Get product details
                    const title = doc.querySelector("#productTitle") ? 
                                  doc.querySelector("#productTitle").textContent.trim() : 
                                  titleText;
                    
                    // Get high-quality product image if available
                    const imageElement = doc.querySelector("#landingImage, #imgBlkFront");
                    const imageUrl = imageElement ? imageElement.getAttribute("src") : thumbnailUrl;
                    
                    // Extract ingredients
                    const ingredientsText = extractIngredients(doc);
                    
                    // Check for allergens
                    const foundAllergens = [];
                    allergens.forEach(allergen => {
                        if (ingredientsText.toLowerCase().includes(allergen.toLowerCase())) {
                            foundAllergens.push(allergen);
                        }
                    });
                    
                    // Categorize product
                    if (foundAllergens.length > 0) {
                        flaggedProducts.push({
                            title: title,
                            url: productLink,
                            ingredients: ingredientsText,
                            allergens: foundAllergens,
                            imageUrl: imageUrl
                        });
                    } else {
                        safeProducts.push({
                            title: title,
                            url: productLink,
                            ingredients: ingredientsText,
                            imageUrl: imageUrl
                        });
                    }
                    
                    // Update completed count
                    completedRequests++;
                    
                    // If all requests complete, display results
                    if (completedRequests === productsToScan.length) {
                        displayResults(safeProducts, "search");
                    }
                })
                .catch(error => {
                    console.error(`Error processing ${productLink}:`, error);
                    
                    // Update completed count even on error
                    completedRequests++;
                    
                    // If all requests complete, display results
                    if (completedRequests === productsToScan.length) {
                        displayResults(safeProducts, "search");
                    }
                });
        });
    });
}

// ====== SHARED DISPLAY FUNCTION ======
function displayResults(products, mode) {
    // Clear existing content
    const contentElement = document.getElementById("allergenie-content");
    const loadMoreButton = document.getElementById("loadMore");
    
    if (mode === "cart") {
        // Display flagged products from cart
        if (products.length === 0) {
            contentElement.innerHTML = "<p>✅ No allergens detected in your cart items.</p>";
            loadMoreButton.style.display = "none";
            return;
        }
        
        // Sort flagged products by number of allergens (descending)
        products.sort((a, b) => b.allergens.length - a.allergens.length);
        
        // Generate HTML for each flagged product
        const resultsHTML = products.map(product => `
            <div class="allergen-product" style="margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 10px;">
                <h3 style="margin: 5px 0;">⚠️ ${product.title}</h3>
                <div style="display: flex; align-items: flex-start;">
                    ${product.imageUrl ? 
                      `<img src="${product.imageUrl}" alt="${product.title}" style="width: 60px; margin-right: 10px;">` : 
                      ''}
                    <div>
                        <p><strong>Contains allergens:</strong> ${product.allergens.join(", ")}</p>
                        <p><a href="${product.url}" target="_blank">View product</a></p>
                        <div class="ingredients-section">
                            <p class="preview">Ingredients: ${product.ingredients.split(" ").slice(0, 10).join(" ")}...</p>
                            <p class="full-ingredients" style="display: none;">Ingredients: ${product.ingredients}</p>
                            <button class="toggle-ingredients" style="background: none; border: none; color: blue; text-decoration: underline; cursor: pointer;">Show all ingredients</button>
                        </div>
                    </div>
                </div>
            </div>
        `).join("");
        
        contentElement.innerHTML = `
            <p style="font-weight: bold; color: #d9534f;">
                Found ${products.length} product${products.length === 1 ? '' : 's'} containing allergens:
            </p>
            ${resultsHTML}
        `;
        
        loadMoreButton.style.display = "none";
    } else if (mode === "search") {
        // Display safe products from search
        if (products.length === 0) {
            contentElement.innerHTML = "<p>❌ No allergen-safe products found in the search results.</p>";
            loadMoreButton.style.display = "none";
            return;
        }
        
        // Initially display first 5 items
        let visibleProducts = products.slice(0, 5);
        
        // Generate HTML for safe products
        const renderProductHTML = (productList) => {
            return productList.map(product => `
                <div class="safe-product" style="margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 10px;">
                    <h3 style="margin: 5px 0;">✅ ${product.title}</h3>
                    <div style="display: flex; align-items: flex-start;">
                        ${product.imageUrl ? 
                          `<img src="${product.imageUrl}" alt="${product.title}" style="width: 60px; margin-right: 10px;">` : 
                          ''}
                        <div>
                            <p><a href="${product.url}" target="_blank">View product</a></p>
                            <div class="ingredients-section">
                                <p class="preview">Ingredients: ${product.ingredients.split(" ").slice(0, 10).join(" ")}...</p>
                                <p class="full-ingredients" style="display: none;">Ingredients: ${product.ingredients}</p>
                                <button class="toggle-ingredients" style="background: none; border: none; color: blue; text-decoration: underline; cursor: pointer;">Show all ingredients</button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join("");
        };
        
        contentElement.innerHTML = `
            <p style="font-weight: bold; color: #28a745;">
                Found ${products.length} allergen-safe product${products.length === 1 ? '' : 's'}:
            </p>
            ${renderProductHTML(visibleProducts)}
        `;
        
        // Show "Load More" button if there are more products
        if (products.length > 5) {
            loadMoreButton.style.display = "block";
            loadMoreButton.textContent = `Load More (${5}/${products.length})`;
            
            // Handle load more click
            loadMoreButton.onclick = () => {
                visibleProducts = products;
                contentElement.innerHTML = `
                    <p style="font-weight: bold; color: #28a745;">
                        Found ${products.length} allergen-safe product${products.length === 1 ? '' : 's'}:
                    </p>
                    ${renderProductHTML(visibleProducts)}
                `;
                loadMoreButton.style.display = "none";
                
                // Add event listeners to ingredient toggles
                document.querySelectorAll(".toggle-ingredients").forEach(btn => {
                    btn.addEventListener("click", toggleIngredients);
                });
            };
        } else {
            loadMoreButton.style.display = "none";
        }
    }
    
    // Add event listeners to ingredient toggles
    document.querySelectorAll(".toggle-ingredients").forEach(btn => {
        btn.addEventListener("click", toggleIngredients);
    });
    
    function toggleIngredients(event) {
        const section = event.target.closest(".ingredients-section");
        section.querySelector(".preview").style.display = "none";
        section.querySelector(".full-ingredients").style.display = "block";
        event.target.style.display = "none";
    }
}
