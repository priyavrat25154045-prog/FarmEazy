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


// Product list element

const productList =
    document.getElementById("productList");


// Search input

const searchInput =
    document.getElementById("searchInput");


// Category filter

const categoryFilter =
    document.getElementById("categoryFilter");


// ========================================
// 2. PRODUCT FILTER FUNCTION
// ========================================

function displayProducts() {

    const searchText =
        searchInput.value.toLowerCase().trim();

    const selectedCategory =
        categoryFilter.value;


    // Filter products

    const filteredProducts =
        products.filter(function(product) {

            const matchesSearch =
                product.name
                    .toLowerCase()
                    .includes(searchText);


            const matchesCategory =
                selectedCategory === "all" ||
                product.category === selectedCategory;


            return matchesSearch && matchesCategory;

        });


    // Clear old results

    productList.innerHTML = "";


    // Show filtered products

    filteredProducts.forEach(function(product) {

        const li =
            document.createElement("li");


        li.textContent =
            product.name +
            " - ₹" +
            product.price +
            "/" +
            product.unit;


        productList.append(li);

    });


    // If no product found

    if (filteredProducts.length === 0) {

        const li =
            document.createElement("li");

        li.textContent =
            "No products found.";

        productList.append(li);

    }

}


// ========================================
// 3. PRODUCT SEARCH
// ========================================

searchInput.addEventListener(
    "input",
    function() {

        displayProducts();

    }
);


// ========================================
// 4. CATEGORY FILTER
// ========================================

categoryFilter.addEventListener(
    "change",
    function() {

        displayProducts();

    }
);


// =====================// ========================================
// KISANSETU - JAVASCRIPT
// ========================================


// ========================================
// 1. FARM PRODUCTS
// ========================================


    
        
// 5. TRACTOR BOOKING
// ========================================


// Modal

const bookingModal =
    document.getElementById("bookingModal");


// Close button

const closeBooking =
    document.getElementById("closeBooking");


// Booking form

const bookingForm =
    document.getElementById("bookingForm");


// Selected tractor name

const selectedTractor =
    document.getElementById("selectedTractor");


// Price per hour

const pricePerHour =
    document.getElementById("pricePerHour");


// Number of hours

const bookingHours =
    document.getElementById("bookingHours");


// Total price

const totalPrice =
    document.getElementById("totalPrice");


// All Book Now buttons

const bookButtons =
    document.querySelectorAll(".book-btn");


// Current tractor price

let currentPrice = 700;


// ========================================
// 6. OPEN BOOKING MODAL
// ========================================

bookButtons.forEach(function(button) {

    button.addEventListener(
        "click",
        function(event) {

            // Stop link from jumping

            event.preventDefault();


            // Find the tractor card

            const tractorCard =
                button.closest(".tractor-card");


            // Get tractor name

            const tractorName =
                tractorCard
                    .querySelector(
                        ".tractor-title h3"
                    )
                    .textContent
                    .trim();


            // Get tractor price

            const priceText =
                tractorCard
                    .querySelector(
                        ".tractor-bottom strong"
                    )
                    .textContent
                    .trim();


            // Convert ₹700 to 700

            currentPrice =
                parseInt(
                    priceText.replace("₹", "")
                );


            // Put tractor name in modal

            selectedTractor.textContent =
                tractorName;


            // Put price in modal

            pricePerHour.textContent =
                "₹" + currentPrice;


            // Default hours

            bookingHours.value = 1;


            // Calculate initial total

            totalPrice.textContent =
                "₹" + currentPrice;


            // Open modal

            bookingModal.classList.add(
                "active"
            );

        }
    );

});


// ========================================
// 7. CALCULATE TOTAL PRICE
// ========================================

bookingHours.addEventListener(
    "input",
    function() {

        let hours =
            parseInt(
                bookingHours.value
            );


        // If empty or invalid

        if (!hours || hours < 1) {

            hours = 1;

        }


        // Maximum 12 hours

        if (hours > 12) {

            hours = 12;

            bookingHours.value = 12;

        }


        // Calculate total

        const total =
            currentPrice * hours;


        // Display total

        totalPrice.textContent =
            "₹" + total;

    }
);


// ========================================
// 8. CLOSE MODAL
// ========================================

closeBooking.addEventListener(
    "click",
    function() {

        bookingModal.classList.remove(
            "active"
        );

    }
);


// ========================================
// 9. CLOSE MODAL BY CLICKING OUTSIDE
// ========================================

bookingModal.addEventListener(
    "click",
    function(event) {

        if (
            event.target === bookingModal
        ) {

            bookingModal.classList.remove(
                "active"
            );

        }

    }
);


// ========================================
// 10. CONFIRM BOOKING
// ========================================

bookingForm.addEventListener(
    "submit",
    function(event) {

        // Stop page refresh

        event.preventDefault();


        // Get location

        const location =
            document.getElementById(
                "bookingLocation"
            ).value;


        // Get date

        const date =
            document.getElementById(
                "bookingDate"
            ).value;


        // Get time

        const time =
            document.getElementById(
                "bookingTime"
            ).value;


        // Get hours

        const hours =
            parseInt(
                bookingHours.value
            );


        // Calculate total

        const total =
            currentPrice * hours;


        // Confirmation message

        alert(

            "🎉 Booking Request Sent!\n\n" +

            "🚜 Tractor: " +
            selectedTractor.textContent +

            "\n📍 Location: " +
            location +

            "\n📅 Date: " +
            date +

            "\n🕐 Time: " +
            time +

            "\n⏱️ Hours: " +
            hours +

            "\n💰 Total: ₹" +
            total +

            "\n\n" +

            "Farmer/tractor owner will " +
            "confirm your booking."

        );


        // Close modal

        bookingModal.classList.remove(
            "active"
        );


        // Reset form

        bookingForm.reset();


        // Reset hours

        bookingHours.value = 1;

    }
);


// ========================================
// 11. ESC KEY SE MODAL CLOSE
// ========================================

document.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key === "Escape"
        ) {

            bookingModal.classList.remove(
                "active"
            );

        }

    }
);