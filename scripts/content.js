const cartItems = document.getElementsByClassName("a-link-normal sc-product-link sc-product-title aok-block");

if (cartItems.length > 0) {
    Array.from(cartItems).forEach(item => {
        let link = item.getAttribute("href");
        
        if (link) {
            if (!link.startsWith("http")) {
                link = "https://www.amazon.in" + link;
            }
            fetch(link)
                .then(response => response.text())
                .then(html => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, "text/html");
                    const productTable = doc.querySelector("#productDetails_techSpec_section_1");

                    if (productTable) {
                        const rows = productTable.querySelectorAll("tr");
                        let ingredientsText = "Ingredients not found";

                        rows.forEach(row => {
                            const th = row.querySelector("th");
                            if (th && th.innerText.trim() === "Ingredients") {
                                const td = row.querySelector("td.a-size-base.prodDetAttrValue");
                                if (td) {
                                    ingredientsText = td.innerText.trim();
                                }
                            }
                        });
                    
                        console.log("Extracted Ingredients:", ingredientsText);
                    } else {
                        console.log("Product details table not found.");
                    }
                })
                .catch(error => console.error("Error fetching link:", link, error));
        }
    });
}
