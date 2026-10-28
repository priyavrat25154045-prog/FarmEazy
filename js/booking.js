// FarmEazy Machinery Dataset & Online Booking Logic connected to Backend API

// Live machinery cache loaded from Backend
let machineryList = [];

// DOM Elements
const machineryGrid = document.getElementById("machineryGrid");
const machinerySearchInput = document.getElementById("machinerySearchInput");
const machineryCategoryFilter = document.getElementById("machineryCategoryFilter");
const machinerySortFilter = document.getElementById("machinerySortFilter");
const bookingModal = document.getElementById("bookingModal");
const closeBooking = document.getElementById("closeBooking");
const bookingForm = document.getElementById("bookingForm");
const bookingSuccessModal = document.getElementById("bookingSuccessModal");
const closeSuccessModal = document.getElementById("closeSuccessModal");

// Form Elements
const selectedTractor = document.getElementById("selectedTractor");
const selectedSpecs = document.getElementById("selectedSpecs");
const rateDisplay = document.getElementById("rateDisplay");
const bookingDurationUnit = document.getElementById("bookingDurationUnit");
const bookingDurationCount = document.getElementById("bookingDurationCount");
const durationLabel = document.getElementById("durationLabel");
const needDriverCheckbox = document.getElementById("needDriverCheckbox");
const driverOptionRow = document.getElementById("driverOptionRow");
const basePriceSummary = document.getElementById("basePriceSummary");
const driverPriceSummary = document.getElementById("driverPriceSummary");
const driverSummaryRow = document.getElementById("driverSummaryRow");
const totalPrice = document.getElementById("totalPrice");

// Active state for selected machinery item
let currentItem = null;

// ==========================================
// 1. BACKEND API INTEGRATION
// ==========================================

// Fetch machinery fleet from Backend /api/machinery
async function fetchMachineryFleet() {
    try {
        if (machineryGrid) {
            machineryGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <span class="empty-icon">⏳</span>
                    <h3>Loading machinery fleet from server...</h3>
                    <p>Connecting to FarmEazy secure live database.</p>
                </div>
            `;
        }

        const res = await fetch("/api/machinery");
        const json = await res.json();

        if (json.success && Array.isArray(json.data)) {
            // Map db columns to frontend properties
            machineryList = json.data.map(item => ({
                id: item.id,
                name: item.name,
                category: item.category,
                brand: item.brand,
                hp: item.hp,
                icon: item.icon,
                ratePerHour: item.rate_per_hour,
                ratePerDay: item.rate_per_day,
                driverChargePerHour: item.driver_charge_per_hour,
                location: item.location,
                distanceKm: item.distance_km,
                rating: item.rating,
                reviewsCount: item.reviews_count,
                tags: item.tags || [],
                specs: item.specs,
                withDriverAvailable: Boolean(item.with_driver_available)
            }));

            if (machineryList.length > 0) {
                currentItem = machineryList[0];
            }

            renderMachinery(machineryList);
        } else {
            throw new Error(json.message || "Failed to load machinery fleet.");
        }
    } catch (err) {
        console.error("Backend fetch error:", err);
        if (machineryGrid) {
            machineryGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <span class="empty-icon">⚠️</span>
                    <h3>Could not connect to backend</h3>
                    <p>${err.message}</p>
                    <button type="button" class="reset-filter-btn" onclick="fetchMachineryFleet()">Retry Connection</button>
                </div>
            `;
        }
    }
}

// Render Machinery Cards
function renderMachinery(items) {
    if (!machineryGrid) return;
    machineryGrid.innerHTML = "";

    if (!items || items.length === 0) {
        machineryGrid.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🚜</span>
                <h3>No machinery found</h3>
                <p>Try searching with another keyword like 'Mahindra', 'Harvester', 'Rotavator' or clear filters.</p>
                <button type="button" class="reset-filter-btn" onclick="resetFilters()">Reset All Filters</button>
            </div>
        `;
        return;
    }

    items.forEach(item => {
        const card = document.createElement("article");
        card.className = "machinery-card";
        card.setAttribute("data-id", item.id);

        const tagsHtml = (item.tags || []).map(t => `<span class="tag-chip">${t}</span>`).join("");

        card.innerHTML = `
            <div class="machinery-image-wrap">
                <div class="machinery-emoji-badge">${item.icon}</div>
                <span class="badge-status">● Live Available</span>
                <span class="badge-hp">${item.hp}</span>
            </div>

            <div class="machinery-body">
                <div class="machinery-header">
                    <div>
                        <span class="machinery-category">${item.category.toUpperCase()} • ${item.brand}</span>
                        <h3 class="machinery-title">${item.name}</h3>
                    </div>
                    <div class="rating-pill">⭐ ${item.rating} <span class="review-count">(${item.reviewsCount})</span></div>
                </div>

                <p class="machinery-location">📍 ${item.location}</p>
                <p class="machinery-specs-summary">${item.specs}</p>

                <div class="machinery-tags">
                    ${tagsHtml}
                </div>

                <div class="pricing-matrix">
                    <div class="price-box">
                        <span class="price-label">Hourly</span>
                        <div class="price-value">₹${item.ratePerHour} <span>/hr</span></div>
                    </div>
                    <div class="price-box highlight">
                        <span class="price-label">Daily (Full Day)</span>
                        <div class="price-value">₹${item.ratePerDay} <span>/day</span></div>
                    </div>
                </div>

                <div class="card-footer">
                    <div class="driver-feature">
                        ${item.withDriverAvailable ? '👨‍🌾 Verified Driver Available' : '🔧 Attachment / Machine Only'}
                    </div>
                    <button type="button" class="book-action-btn" onclick="openBookingModal('${item.id}')">
                        Book Now 🚜
                    </button>
                </div>
            </div>
        `;
        machineryGrid.appendChild(card);
    });
}

// Reset Filters
window.resetFilters = function() {
    if (machinerySearchInput) machinerySearchInput.value = "";
    if (machineryCategoryFilter) machineryCategoryFilter.value = "all";
    if (machinerySortFilter) machinerySortFilter.value = "recommended";
    filterMachinery();
};

// Filter & Sort Logic
function filterMachinery() {
    const query = (machinerySearchInput ? machinerySearchInput.value : "").toLowerCase().trim();
    const category = machineryCategoryFilter ? machineryCategoryFilter.value : "all";
    const sort = machinerySortFilter ? machinerySortFilter.value : "recommended";

    let filtered = machineryList.filter(item => {
        const matchesQuery = 
            item.name.toLowerCase().includes(query) ||
            item.brand.toLowerCase().includes(query) ||
            item.specs.toLowerCase().includes(query) ||
            item.location.toLowerCase().includes(query) ||
            (item.tags && item.tags.some(t => t.toLowerCase().includes(query)));

        const matchesCat = category === "all" || item.category === category;

        return matchesQuery && matchesCat;
    });

    // Sorting
    if (sort === "price-low") {
        filtered.sort((a, b) => a.ratePerHour - b.ratePerHour);
    } else if (sort === "price-high") {
        filtered.sort((a, b) => b.ratePerHour - a.ratePerHour);
    } else if (sort === "rating") {
        filtered.sort((a, b) => b.rating - a.rating);
    } else if (sort === "distance") {
        filtered.sort((a, b) => a.distanceKm - b.distanceKm);
    }

    renderMachinery(filtered);
}

// Open Booking Modal for a chosen machine
window.openBookingModal = function(id) {
    const found = machineryList.find(m => m.id === id);
    if (!found) return;

    currentItem = found;
    if (selectedTractor) selectedTractor.textContent = found.name;
    if (selectedSpecs) selectedSpecs.textContent = `${found.hp} • ${found.location}`;

    // Update rate display in modal
    updateRateDisplay();

    // Reset date/time fields
    const today = new Date().toISOString().split("T")[0];
    const dateInput = document.getElementById("bookingDate");
    if (dateInput) {
        dateInput.value = today;
        dateInput.min = today;
    }

    const timeInput = document.getElementById("bookingTime");
    if (timeInput && !timeInput.value) {
        timeInput.value = "08:00";
    }

    // Driver availability toggle
    if (driverOptionRow) {
        if (found.withDriverAvailable) {
            driverOptionRow.style.display = "flex";
            if (needDriverCheckbox) needDriverCheckbox.checked = true;
        } else {
            driverOptionRow.style.display = "none";
            if (needDriverCheckbox) needDriverCheckbox.checked = false;
        }
    }

    // Recalculate price
    calculateBookingTotal();

    if (bookingModal) {
        bookingModal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
};

function updateRateDisplay() {
    if (!rateDisplay || !currentItem) return;
    const unit = bookingDurationUnit ? bookingDurationUnit.value : "hours";
    if (unit === "hours") {
        rateDisplay.textContent = `₹${currentItem.ratePerHour}/hour`;
        if (durationLabel) durationLabel.textContent = "⏱️ Number of Hours";
        if (bookingDurationCount) {
            bookingDurationCount.min = "1";
            bookingDurationCount.max = "14";
            if (parseInt(bookingDurationCount.value, 10) > 14) bookingDurationCount.value = "4";
        }
    } else {
        rateDisplay.textContent = `₹${currentItem.ratePerDay}/day`;
        if (durationLabel) durationLabel.textContent = "📅 Number of Days";
        if (bookingDurationCount) {
            bookingDurationCount.min = "1";
            bookingDurationCount.max = "30";
            if (parseInt(bookingDurationCount.value, 10) > 30) bookingDurationCount.value = "1";
        }
    }
}

// Price Calculation
function calculateBookingTotal() {
    if (!currentItem) return;

    const unit = bookingDurationUnit ? bookingDurationUnit.value : "hours";
    let count = parseInt(bookingDurationCount ? bookingDurationCount.value : "1", 10) || 1;
    if (count < 1) count = 1;

    let baseRate = unit === "hours" ? currentItem.ratePerHour : currentItem.ratePerDay;
    let baseAmount = baseRate * count;

    let driverAmount = 0;
    const needDriver = needDriverCheckbox && needDriverCheckbox.checked && currentItem.withDriverAvailable;

    if (needDriver) {
        if (unit === "hours") {
            driverAmount = currentItem.driverChargePerHour * count;
        } else {
            // Day driver charge approx 8 hours work
            driverAmount = (currentItem.driverChargePerHour * 8) * count;
        }
        if (driverSummaryRow) driverSummaryRow.style.display = "flex";
    } else {
        if (driverSummaryRow) driverSummaryRow.style.display = "none";
    }

    const grandTotal = baseAmount + driverAmount;

    if (basePriceSummary) {
        basePriceSummary.textContent = `₹${baseAmount.toLocaleString("en-IN")} (${count} ${unit})`;
    }
    if (driverPriceSummary) {
        driverPriceSummary.textContent = `+ ₹${driverAmount.toLocaleString("en-IN")}`;
    }
    if (totalPrice) {
        totalPrice.textContent = `₹${grandTotal.toLocaleString("en-IN")}`;
    }
}

// Modal Close Handlers
function closeModal() {
    if (bookingModal) {
        bookingModal.classList.remove("active");
        document.body.style.overflow = "";
    }
}

if (closeBooking) {
    closeBooking.addEventListener("click", closeModal);
}

if (bookingModal) {
    bookingModal.addEventListener("click", function (e) {
        if (e.target === bookingModal) closeModal();
    });
}

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        closeModal();
        if (bookingSuccessModal) bookingSuccessModal.classList.remove("active");
    }
});

// Event Listeners for Dynamic Calculation
if (bookingDurationUnit) {
    bookingDurationUnit.addEventListener("change", () => {
        updateRateDisplay();
        calculateBookingTotal();
    });
}

if (bookingDurationCount) {
    bookingDurationCount.addEventListener("input", calculateBookingTotal);
}

if (needDriverCheckbox) {
    needDriverCheckbox.addEventListener("change", calculateBookingTotal);
}

// ==========================================
// 2. BACKEND POST BOOKING SUBMISSION
// ==========================================
if (bookingForm) {
    bookingForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const submitBtn = bookingForm.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : "";

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = "⏳ Transmitting Booking to Server...";
            }

            const location = document.getElementById("bookingLocation").value.trim();
            const phone = document.getElementById("bookingPhone").value.trim();
            const date = document.getElementById("bookingDate").value;
            const time = document.getElementById("bookingTime").value;
            const workType = document.getElementById("bookingWorkType").value;
            const unit = bookingDurationUnit.value;
            const count = bookingDurationCount.value;
            const driverSelected = needDriverCheckbox && needDriverCheckbox.checked && currentItem.withDriverAvailable;
            const total = totalPrice.textContent;

            const payload = {
                machineryId: currentItem ? currentItem.id : "unknown",
                machineryName: currentItem ? currentItem.name : "Tractor",
                farmerLocation: location,
                farmerPhone: phone,
                bookingDate: date,
                bookingTime: time,
                planType: unit,
                durationCount: parseInt(count, 10),
                workType: workType,
                withDriver: Boolean(driverSelected),
                totalAmount: total
            };

            // Call Backend /api/bookings
            const response = await fetch("/api/bookings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Failed to save booking on backend.");
            }

            const b = result.booking;

            // Populate and display success modal with persistent database record
            const summaryBox = document.getElementById("successBookingDetails");
            if (summaryBox) {
                summaryBox.innerHTML = `
                    <div class="booking-receipt">
                        <div class="receipt-row"><span>Status:</span> <strong style="color: #15803d;">● ${b.status} (Saved in Database)</strong></div>
                        <div class="receipt-row"><span>Booking Reference:</span> <strong>#${b.booking_code}</strong></div>
                        <div class="receipt-row"><span>Machinery:</span> <strong>${b.machinery_name}</strong></div>
                        <div class="receipt-row"><span>Service Time:</span> <strong>${b.booking_date} at ${b.booking_time}</strong></div>
                        <div class="receipt-row"><span>Duration:</span> <strong>${b.duration_count} ${b.plan_type}</strong></div>
                        <div class="receipt-row"><span>Work Category:</span> <strong>${b.work_type}</strong></div>
                        <div class="receipt-row"><span>Operator:</span> <strong>${b.with_driver ? "Included (Verified Operator)" : "Self Driven / Attachment Only"}</strong></div>
                        <div class="receipt-row"><span>Village / Field:</span> <strong>${b.farmer_location}</strong></div>
                        <div class="receipt-row"><span>Farmer Mobile:</span> <strong>+91 ${b.farmer_phone}</strong></div>
                        <div class="receipt-row total"><span>Total Payable:</span> <strong>${b.total_amount}</strong></div>
                    </div>
                `;
            }

            window.lastConfirmedBooking = {
                machineryName: b.machinery_name,
                farmerLocation: b.farmer_location,
                driverName: b.with_driver ? "Rampal Singh (Operator)" : "Self Driven",
                etaMins: 10
            };

            closeModal();
            if (bookingSuccessModal) {
                bookingSuccessModal.classList.add("active");
                document.body.style.overflow = "hidden";
            }

            bookingForm.reset();
            // Automatically refresh the bookings table and driver partner dashboard
            fetchRecentBookings();
            renderDriverPartnerDashboard();
        } catch (error) {
            console.error("Booking submission error:", error);
            alert("⚠️ Booking Error: " + error.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    });
}

// ==========================================
// 3. FETCH & DISPLAY RECENT BOOKINGS FROM DB
// ==========================================
async function fetchRecentBookings() {
    const container = document.getElementById("recentBookingsContainer");
    if (!container) return;

    try {
        container.innerHTML = `<div style="text-align:center; padding: 25px; color:#64748b;">⏳ Fetching live records from SQLite database...</div>`;

        const res = await fetch("/api/bookings");
        const json = await res.json();

        if (json.success && Array.isArray(json.data)) {
            if (json.data.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 35px 20px; color: #64748b;">
                        <span style="font-size: 32px; display:block; margin-bottom: 8px;">📋</span>
                        <p>No farm bookings recorded in database yet.</p>
                        <small>Book any tractor or machinery above to test live backend saving!</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="db-table-responsive">
                    <table class="db-orders-table">
                        <thead>
                            <tr>
                                <th>Booking Ref</th>
                                <th>Equipment</th>
                                <th>Farmer Location</th>
                                <th>Mobile</th>
                                <th>Date & Time</th>
                                <th>Duration</th>
                                <th>Total</th>
                                <th>DB Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${json.data.map(b => `
                                <tr>
                                    <td><strong class="order-ref">#${b.booking_code}</strong></td>
                                    <td><strong>${b.machinery_name}</strong></td>
                                    <td>📍 ${b.farmer_location}</td>
                                    <td>📞 +91 ${b.farmer_phone}</td>
                                    <td>${b.booking_date} at ${b.booking_time}</td>
                                    <td>${b.duration_count} ${b.plan_type}</td>
                                    <td><strong class="order-price">${b.total_amount}</strong></td>
                                    <td><span class="order-badge-confirmed">● ${b.status}</span></td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `;
        }
    } catch (e) {
        container.innerHTML = `<div style="color: #ef4444; padding: 15px;">Failed to fetch bookings from backend: ${e.message}</div>`;
    }
}
window.fetchRecentBookings = fetchRecentBookings;

if (closeSuccessModal) {
    closeSuccessModal.addEventListener("click", function () {
        if (bookingSuccessModal) {
            bookingSuccessModal.classList.remove("active");
            document.body.style.overflow = "";
        }
    });
}

// Search and Filter Listeners
if (machinerySearchInput) machinerySearchInput.addEventListener("input", filterMachinery);
if (machineryCategoryFilter) machineryCategoryFilter.addEventListener("change", filterMachinery);
if (machinerySortFilter) machinerySortFilter.addEventListener("change", filterMachinery);

// Quick Filter Chips (Hero / Category buttons)
window.filterCategory = function(cat) {
    if (machineryCategoryFilter) {
        machineryCategoryFilter.value = cat;
        filterMachinery();
        const section = document.getElementById("machinerySection");
        if (section) section.scrollIntoView({ behavior: "smooth" });
    }
};

// ==========================================
// 4. LIVE TRACTOR GPS TRACKER SIMULATION (UBER STYLE)
// ==========================================
let trackerInterval = null;
let currentTrackingData = null;

function openGpsTracker(bookingInfo) {
    const trackerModal = document.getElementById("liveTrackerModal");
    if (!trackerModal) return;

    currentTrackingData = bookingInfo || {
        machineryName: "Mahindra 575 DI XP Plus",
        farmerLocation: "Taraori, Karnal",
        driverName: "Rampal Singh",
        etaMins: 12
    };

    const destEl = document.getElementById("trackerDestName");
    const driverEl = document.getElementById("trackerDriverName");
    const machineEl = document.getElementById("trackerMachineryName");
    const etaBubble = document.getElementById("tractorLiveEta");
    const speedEl = document.getElementById("telemetrySpeed");
    const distEl = document.getElementById("telemetryDist");
    const tractorMarker = document.getElementById("movingTractor");

    if (destEl) destEl.textContent = currentTrackingData.farmerLocation || "Farmer's Field";
    if (driverEl) driverEl.textContent = currentTrackingData.driverName || "Rampal Singh";
    if (machineEl) machineEl.textContent = currentTrackingData.machineryName || "Mahindra 575 DI";

    trackerModal.classList.add("active");
    document.body.style.overflow = "hidden";

    // Animate the tractor along the simulated map
    let progress = 0; // 0% to 100%
    if (trackerInterval) clearInterval(trackerInterval);

    trackerInterval = setInterval(() => {
        progress += 0.8;
        if (progress > 95) progress = 95; // Stays close to destination

        // Update tractor coordinates on map (moves from bottom-left to top-right)
        const leftPercent = 15 + (progress * 0.70);
        const topPercent = 75 - (progress * 0.55);

        if (tractorMarker) {
            tractorMarker.style.left = `${leftPercent}%`;
            tractorMarker.style.top = `${topPercent}%`;
        }

        const remainingKm = Math.max(0.3, (3.2 * (1 - progress / 100))).toFixed(1);
        const remainingEta = Math.max(1, Math.round(12 * (1 - progress / 100)));
        const simulatedSpeed = (18 + Math.sin(progress) * 4).toFixed(0);

        if (distEl) distEl.textContent = `${remainingKm} km`;
        if (etaBubble) etaBubble.textContent = `ETA ${remainingEta} Mins`;
        if (speedEl) speedEl.textContent = `${simulatedSpeed} km/h`;

        // Update step timeline
        const step2 = document.getElementById("step2");
        const step3 = document.getElementById("step3");
        if (progress > 85) {
            if (step2) step2.classList.replace("active", "completed");
            if (step3) step3.classList.add("active");
        }
    }, 400);
}
window.openGpsTracker = openGpsTracker;

const closeTrackerBtn = document.getElementById("closeTrackerModal");
if (closeTrackerBtn) {
    closeTrackerBtn.addEventListener("click", () => {
        const trackerModal = document.getElementById("liveTrackerModal");
        if (trackerModal) {
            trackerModal.classList.remove("active");
            document.body.style.overflow = "";
        }
        if (trackerInterval) clearInterval(trackerInterval);
    });
}

// Hook up "Track Tractor Live on Map" from Success Modal
const launchGpsTrackerBtn = document.getElementById("launchGpsTrackerBtn");
if (launchGpsTrackerBtn) {
    launchGpsTrackerBtn.addEventListener("click", () => {
        if (bookingSuccessModal) bookingSuccessModal.classList.remove("active");
        openGpsTracker(window.lastConfirmedBooking);
    });
}

// ==========================================
// 5. SMART FUEL & ACREAGE ESTIMATOR ENGINE
// ==========================================
window.runAgriCalculation = function() {
    const crop = document.getElementById("calcCropType")?.value || "wheat";
    const stage = document.getElementById("calcWorkStage")?.value || "ploughing";
    const acreage = parseFloat(document.getElementById("calcAcreage")?.value) || 5;
    const soil = document.getElementById("calcSoilType")?.value || "medium";

    // Work rate benchmarks (hours per acre)
    let baseHoursPerAcre = 1.3;
    let dieselLitresPerHour = 5.0;
    let avgMachineRatePerHour = 700;

    if (stage === "ploughing") {
        baseHoursPerAcre = 1.3;
        dieselLitresPerHour = 5.2;
    } else if (stage === "harvesting") {
        baseHoursPerAcre = 0.8;
        dieselLitresPerHour = 9.5;
        avgMachineRatePerHour = 1400;
    } else if (stage === "leveling") {
        baseHoursPerAcre = 1.6;
        dieselLitresPerHour = 4.8;
        avgMachineRatePerHour = 850;
    } else if (stage === "seeding") {
        baseHoursPerAcre = 1.0;
        dieselLitresPerHour = 4.5;
        avgMachineRatePerHour = 650;
    }

    // Soil coefficient
    let soilMultiplier = 1.0;
    if (soil === "light") soilMultiplier = 0.85;
    if (soil === "heavy") soilMultiplier = 1.25;

    const totalHours = (acreage * baseHoursPerAcre * soilMultiplier).toFixed(1);
    const totalDiesel = (totalHours * dieselLitresPerHour).toFixed(1);
    const totalCost = Math.round(totalHours * avgMachineRatePerHour);
    // Manual labor savings comparison (manual takes ~6-8 days labor per acre @ ₹450/day)
    const manualEquivalentCost = Math.round(acreage * 4500);
    const netSavings = Math.max(3000, manualEquivalentCost - totalCost);

    // Update UI elements
    const summaryTitle = document.getElementById("calcSummaryTitle");
    const hoursEl = document.getElementById("calcEstHours");
    const dieselEl = document.getElementById("calcEstDiesel");
    const costEl = document.getElementById("calcEstCost");
    const savingsEl = document.getElementById("calcEstSavings");
    const proTipEl = document.getElementById("calcProTip");

    if (summaryTitle) summaryTitle.textContent = `${acreage} Acres • ${stage.toUpperCase()} (${crop.toUpperCase()})`;
    if (hoursEl) hoursEl.textContent = `${totalHours} Hours`;
    if (dieselEl) dieselEl.textContent = `${totalDiesel} Litres`;
    if (costEl) costEl.textContent = `₹${totalCost.toLocaleString("en-IN")}`;
    if (savingsEl) savingsEl.textContent = `₹${netSavings.toLocaleString("en-IN")}`;

    if (proTipEl) {
        if (stage === "leveling") {
            proTipEl.textContent = "Laser land leveling reduces seasonal irrigation water usage by 25-30% and increases crop yield uniformity by 8%.";
        } else if (stage === "harvesting") {
            proTipEl.textContent = "Booking a combine harvester during peak afternoon hours reduces grain moisture losses and saves 2 extra round-trips.";
        } else {
            proTipEl.textContent = "Using a 50+ HP tractor with a multi-speed rotavator saves up to 18% diesel on medium/heavy soils compared to traditional cultivators.";
        }
    }
};

// ==========================================
// 6. MANDI RATES & WEATHER ADVISORY LOADER
// ==========================================
async function fetchAgriIntelligence() {
    try {
        const res = await fetch("/api/agri-intelligence");
        const json = await res.json();
        if (json.success && json.weather && Array.isArray(json.mandi)) {
            // Update Weather UI
            const tempEl = document.getElementById("weatherTemp");
            const locEl = document.getElementById("weatherLocation");
            const condEl = document.getElementById("weatherCondition");
            const advEl = document.getElementById("weatherAdvisory");
            const subEl = document.getElementById("weatherSub");

            if (tempEl) tempEl.textContent = json.weather.temperature;
            if (locEl) locEl.textContent = json.weather.location;
            if (condEl) condEl.textContent = json.weather.condition;
            if (advEl) advEl.textContent = json.weather.advisoryAlert;
            if (subEl) subEl.textContent = `Humidity: ${json.weather.humidity} • Wind: ${json.weather.windSpeed} • Rain Risk: ${json.weather.rainChance}`;

            // Update Mandi Table
            const mandiTable = document.getElementById("mandiTableBody");
            if (mandiTable) {
                mandiTable.innerHTML = json.mandi.map(m => `
                    <div class="mandi-row">
                        <div class="crop-info">
                            <strong>${m.crop}</strong>
                            <span>${m.mandi} (${m.state})</span>
                        </div>
                        <div class="mandi-price">
                            <strong>₹${m.modalPrice.toLocaleString("en-IN")}</strong>
                            <span class="${m.trend === 'up' ? 'trend-up' : m.trend === 'down' ? 'trend-down' : 'trend-stable'}">
                                ${m.change} ${m.trend === 'up' ? '▲' : m.trend === 'down' ? '▼' : '—'}
                            </span>
                        </div>
                    </div>
                `).join("");
            }
        }
    } catch (e) {
        console.error("Agri intelligence fetch error:", e);
    }
}

// ==========================================
// 7. DRIVER & OWNER PARTNER TRIP DASHBOARD
// ==========================================
async function renderDriverPartnerDashboard() {
    const listContainer = document.getElementById("driverBookingOrdersList");
    if (!listContainer) return;

    try {
        const res = await fetch("/api/bookings");
        const json = await res.json();
        const orders = json.data || [];

        if (orders.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-driver-state">
                    <span>🚜</span>
                    <h4>No Pending Farm Work Requests</h4>
                    <p>New booking alerts from local farmers will appear here in real time.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = orders.map(order => `
            <div class="driver-order-card ${order.status === 'Completed' ? 'status-completed' : ''}">
                <div class="order-top-row">
                    <span class="order-code-badge">ORDER #${order.booking_code}</span>
                    <span class="order-status-pill status-${order.status ? order.status.toLowerCase().replace(/\s+/g, '-') : 'confirmed'}">
                        ● ${order.status}
                    </span>
                </div>

                <div class="order-body-grid">
                    <div>
                        <h4 class="order-machinery-title">${order.machinery_name}</h4>
                        <p class="order-work-detail">🌾 Work: <strong>${order.work_type}</strong> (${order.duration_count} ${order.plan_type})</p>
                        <p class="order-farm-loc">📍 Destination: <strong>${order.farmer_location}</strong></p>
                    </div>

                    <div class="order-financials">
                        <span class="fare-label">Trip Earnings</span>
                        <strong class="fare-amount">${order.total_amount}</strong>
                        <span class="date-label">📅 ${order.booking_date} (${order.booking_time})</span>
                    </div>
                </div>

                <div class="driver-action-buttons">
                    <button type="button" class="btn-track-route" onclick="openGpsTracker({
                        machineryName: '${order.machinery_name}',
                        farmerLocation: '${order.farmer_location}',
                        driverName: 'Rampal Singh',
                        etaMins: 12
                    })">
                        🛰️ Live GPS Radar
                    </button>

                    ${order.status === 'Confirmed' ? `
                        <button type="button" class="btn-driver-accept" onclick="updateOrderStatus(${order.id}, 'Accepted')">
                            ✅ Accept Order
                        </button>
                    ` : ''}

                    ${order.status === 'Accepted' ? `
                        <button type="button" class="btn-driver-start" onclick="updateOrderStatus(${order.id}, 'On The Way')">
                            🚜 Start Trip (On The Way)
                        </button>
                    ` : ''}

                    ${order.status === 'On The Way' ? `
                        <button type="button" class="btn-driver-work" onclick="updateOrderStatus(${order.id}, 'Work In Progress')">
                            🌾 Arrived & Start Farm Work
                        </button>
                    ` : ''}

                    ${order.status === 'Work In Progress' ? `
                        <button type="button" class="btn-driver-done" onclick="updateOrderStatus(${order.id}, 'Completed')">
                            🏁 Mark Job Completed
                        </button>
                    ` : ''}

                    ${order.status === 'Completed' ? `
                        <span class="job-paid-badge">✓ Payment Received from Farmer</span>
                    ` : ''}
                </div>
            </div>
        `).join("");
    } catch (e) {
        console.error("Driver dashboard error:", e);
    }
}

window.updateOrderStatus = async function(orderId, newStatus) {
    try {
        const res = await fetch(`/api/bookings/${orderId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });
        const result = await res.json();
        if (result.success) {
            renderDriverPartnerDashboard();
            fetchRecentBookings();
        } else {
            alert(result.message || "Failed to update status");
        }
    } catch (err) {
        alert("Error updating order: " + err.message);
    }
};

// Capture last confirmed booking for one-click tracker launch
const origBookingFormSubmit = bookingForm ? bookingForm.onsubmit : null;

// ==========================================
// 8. COMMUNITY MACHINERY POOLING (UBER POOL)
// ==========================================
async function fetchMachineryPools() {
    const grid = document.getElementById("poolingCardsGrid");
    if (!grid) return;

    try {
        const res = await fetch("/api/pools");
        const json = await res.json();
        const pools = json.data || [];

        if (pools.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:#64748b;">No active pooling clusters right now. Check back soon!</div>`;
            return;
        }

        grid.innerHTML = pools.map(p => `
            <div class="pool-card">
                <div class="pool-card-header">
                    <span class="pool-discount-pill">${p.savingsPercent} DISCOUNT</span>
                    <span class="pool-status-badge">● ${p.status}</span>
                </div>

                <h3 class="pool-title">${p.title}</h3>
                <p class="pool-work-tag">🚜 Machine: <strong>${p.machine}</strong></p>
                <p class="pool-loc-tag">📍 Location: <strong>${p.village}</strong></p>
                <p class="pool-time-tag">⏰ Target Date: <strong>${p.targetDate}</strong></p>

                <div class="pool-progress-block">
                    <div class="pool-slots-label">
                        <span>Slots Filled: <strong>${p.filledSlots} of ${p.totalSlots} Farmers</strong></span>
                        <span>${Math.round((p.filledSlots / p.totalSlots) * 100)}%</span>
                    </div>
                    <div class="pool-progress-bar">
                        <div class="pool-progress-fill" style="width: ${(p.filledSlots / p.totalSlots) * 100}%;"></div>
                    </div>
                    <div class="pool-farmers-list">
                        ${p.farmersJoined.map(f => `<span class="farmer-tag-pill">👨‍🌾 ${f}</span>`).join(" ")}
                    </div>
                </div>

                <div class="pool-pricing-row">
                    <div>
                        <span class="p-regular-rate">Standard: <del>${p.standardRate}</del></span>
                        <div class="p-pool-rate">${p.perAcreDiscountRate}</div>
                    </div>
                    <button type="button" class="btn-join-pool" onclick="joinMachinePool('${p.id}', '${p.title}')">
                        Join Pool 🤝
                    </button>
                </div>
            </div>
        `).join("");
    } catch (e) {
        console.error("Pool fetch error:", e);
    }
}

window.joinMachinePool = async function(poolId, poolTitle) {
    const acres = prompt(`🌾 Enter your farm area (in Acres) to join "${poolTitle}":`, "4");
    if (!acres) return;

    try {
        const res = await fetch(`/api/pools/${poolId}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acreage: `${acres} Acres` })
        });
        const result = await res.json();
        alert(result.message || "Joined pool successfully!");
        fetchMachineryPools();
    } catch (e) {
        alert("Error joining pool: " + e.message);
    }
};

// ==========================================
// 9. AI CROP DOCTOR & MACHINERY MATCHER
// ==========================================
window.runCropDiagnosis = async function() {
    const crop = document.getElementById("doctorCropSelect")?.value || "Wheat";
    const symptom = document.getElementById("doctorSymptomSelect")?.value || "yellow";
    const btn = document.querySelector(".btn-diagnose");

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = "🧠 AI Engine Analyzing Crop Symptoms...";
        }

        const res = await fetch("/api/crop-doctor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ crop, symptom })
        });
        const json = await res.json();

        if (json.success && json.diagnosis) {
            const d = json.diagnosis;
            const card = document.getElementById("doctorResultCard");
            const sev = document.getElementById("diagSeverity");
            const dis = document.getElementById("diagDisease");
            const trt = document.getElementById("diagTreatment");
            const mac = document.getElementById("diagMachine");
            const ben = document.getElementById("diagBenefit");

            if (sev) sev.textContent = `${d.severity.toUpperCase()} SEVERITY`;
            if (dis) dis.textContent = d.disease;
            if (trt) trt.textContent = d.treatment;
            if (mac) mac.textContent = d.recommendedMachine;
            if (ben) ben.textContent = d.benefit;

            if (card) {
                card.style.animation = "none";
                card.offsetHeight; // trigger reflow
                card.style.animation = "pulseHighlight 0.6s ease";
            }
        }
    } catch (e) {
        alert("Diagnosis error: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "⚡ Run Instant AI Diagnosis & Match Machine";
        }
    }
};

// Initialize render on load from Backend API
document.addEventListener("DOMContentLoaded", () => {
    fetchMachineryFleet();
    fetchRecentBookings();
    fetchAgriIntelligence();
    renderDriverPartnerDashboard();
    fetchMachineryPools();
});


