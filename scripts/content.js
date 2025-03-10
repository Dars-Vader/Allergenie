const cartItems = document.getElementsByClassName("a-link-normal sc-product-link sc-product-title aok-block");

if (cartItems.length > 0) {
    const popup=document.createElement('div');
    popup.setAttribute("style","height:300px;width:300px;position:fixed;top:10px;right:10px;background-color: white; padding: 10px; border: 1px solid black; box-shadow: 2px 2px 10px rgba(0,0,0,0.3); z-index: 1000;color:red");
    document.body.appendChild(popup);
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
                    
                        const itemElement = document.createElement("p");
                        itemElement.innerHTML = `<strong>Ingredients:</strong> ${ingredientsText}`;
                        popup.appendChild(itemElement);
                    } else {
                        console.log("Product details table not found.");
                    }
                })
                .catch(error => console.error("Error fetching link:", link, error));
        }
    });
}
