// KisanSetu - Product search and category filter

const products = [
    {
        name: "tomatoes",
        price: 40,
        unit: "1kg",
        category: "vegetable"
    },
    {
        name: "potatoes",
        price: 30,
        unit: "1kg",
        category: "vegetable"
    },
    {
        name: "rice",
        price: 80,
        unit: "1kg",
        category: "cereal"
    },
    {
        name: "mangoes",
        price: 60,
        unit: "1kg",
        category: "fruit"
    }
];

const productList = document.getElementById("productList");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");

function getProductDisplay(product) {
    const details = {
        tomatoes: { icon: "🍅", name: "Fresh Tomatoes", description: "Directly from local farms" },
        potatoes: { icon: "🥔", name: "Fresh Potatoes", description: "Farm fresh potatoes" },
        rice: { icon: "🌾", name: "Premium Rice", description: "Quality farm rice" },
        mangoes: { icon: "🥭", name: "Fresh Mangoes", description: "Directly from local farms" }
    };

    return details[product.name] || {
        icon: "🌱",
        name: product.name.charAt(0).toUpperCase() + product.name.slice(1),
        description: "Directly from local farms"
    };
}

function displayProducts() {
    if (!productList || !searchInput || !categoryFilter) return;

    const searchText = searchInput.value.toLowerCase().trim();
    const selectedCategory = categoryFilter.value;

    const filteredProducts = products.filter(function (product) {
        const matchesSearch = product.name.toLowerCase().includes(searchText);
        const matchesCategory =
            selectedCategory === "all" || product.category === selectedCategory;

        return matchesSearch && matchesCategory;
    });

    productList.innerHTML = "";

    if (filteredProducts.length === 0) {
        productList.innerHTML = '<p class="no-products">No products found.</p>';
        return;
    }

    filteredProducts.forEach(function (product) {
        const display = getProductDisplay(product);
        const categoryName =
            product.category.charAt(0).toUpperCase() + product.category.slice(1);
        const pricePerKg = product.price;

        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
            <div class="product-image">${display.icon}</div>
            <div class="product-info">
                <span>${categoryName}</span>
                <h3>${display.name}</h3>
                <p>${display.description}</p>
                <div class="product-bottom">
                    <strong>₹${pricePerKg}/kg</strong>
                    <button type="button">Add</button>
                </div>
            </div>
        `;

        productList.appendChild(card);
    });
}

if (searchInput) {
    searchInput.addEventListener("input", displayProducts);
}

if (categoryFilter) {
    categoryFilter.addEventListener("change", displayProducts);
}

// Render the initial product cards.
displayProducts();
