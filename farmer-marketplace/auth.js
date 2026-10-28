
async function apiRequest(url, data) {
    const options = {
        method: data !== undefined ? "POST" : "GET",
        credentials: "same-origin",
        headers: data !== undefined
            ? { "Content-Type": "application/json" }
            : {}
    };

    if (data !== undefined) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.message || "Request failed.");
    }

    return result;
}

function showAuthMessage(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#dc2626" : "#15803d";
}

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const passwordInput = document.getElementById("password");
    const showPassword = document.getElementById("showPassword");
    const roleInputs = document.querySelectorAll('input[name="role"]');

    const message =
        document.getElementById("loginMessage") ||
        document.getElementById("registerMessage");

    // Check URL parameters for role preset (e.g. login.html?role=owner)
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get("role");
    if (roleParam && (roleParam === "owner" || roleParam === "farmer")) {
        const matchingRadio = document.querySelector(`input[name="role"][value="${roleParam}"]`);
        if (matchingRadio) {
            matchingRadio.checked = true;
            updateRoleUI(roleParam);
        }
    }

    // Handle Role Switching Tabs
    if (roleInputs.length > 0) {
        roleInputs.forEach(radio => {
            radio.addEventListener("change", () => {
                updateRoleUI(radio.value);
            });
        });
    }

    function updateRoleUI(role) {
        const roleTabs = document.querySelectorAll(".role-tab");
        roleTabs.forEach(tab => {
            if (tab.getAttribute("data-role") === role) {
                tab.classList.add("active");
            } else {
                tab.classList.remove("active");
            }
        });

        // Update form helper text & button labels
        const loginBtn = document.querySelector(".login-button");
        const roleBadge = document.getElementById("activeRoleBadge");
        const extraOwnerFields = document.querySelectorAll(".owner-only-field");

        if (role === "owner") {
            if (loginBtn && loginForm) loginBtn.textContent = "Login to Machinery Partner Portal →";
            if (loginBtn && registerForm) loginBtn.textContent = "Register as Machinery Partner →";
            if (roleBadge) roleBadge.textContent = "TRACTOR & MACHINERY OWNER";
            extraOwnerFields.forEach(f => f.style.display = "block");
        } else {
            if (loginBtn && loginForm) loginBtn.textContent = "Login to Farmer Account →";
            if (loginBtn && registerForm) loginBtn.textContent = "Register as Farmer Customer →";
            if (roleBadge) roleBadge.textContent = "FARMER / CUSTOMER";
            extraOwnerFields.forEach(f => f.style.display = "none");
        }
    }

    // Show/hide password
    if (showPassword && passwordInput) {
        showPassword.addEventListener("change", () => {
            passwordInput.type = showPassword.checked ? "text" : "password";
        });
    }

    // Login Submission
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const submitButton = loginForm.querySelector('button[type="submit"]');
            const selectedRole = document.querySelector('input[name="role"]:checked')?.value || "farmer";

            try {
                if (submitButton) submitButton.disabled = true;
                showAuthMessage(message, "Authenticating...");

                const result = await apiRequest("/api/login", {
                    usernameOrEmail: document.getElementById("username").value.trim(),
                    password: passwordInput.value,
                    role: selectedRole
                });

                showAuthMessage(message, result.message || "Login successful!");

                // Redirect: If owner, can open with partner status
                setTimeout(() => {
                    window.location.href = "/index.html";
                }, 400);
            } catch (error) {
                showAuthMessage(message, error.message, true);
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }

    // Register Submission
    if (registerForm) {
        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const submitButton = registerForm.querySelector('button[type="submit"]');
            const selectedRole = document.querySelector('input[name="role"]:checked')?.value || "farmer";

            try {
                if (submitButton) submitButton.disabled = true;
                showAuthMessage(message, "Creating your FarmEazy account...");

                const payload = {
                    name: document.getElementById("fullName").value.trim(),
                    username: document.getElementById("username").value.trim(),
                    email: document.getElementById("email").value.trim(),
                    phone: document.getElementById("phone") ? document.getElementById("phone").value.trim() : "",
                    role: selectedRole,
                    password: passwordInput.value
                };

                const result = await apiRequest("/api/register", payload);

                showAuthMessage(message, result.message || "Registration successful!");

                setTimeout(() => {
                    window.location.href = "/index.html";
                }, 400);
            } catch (error) {
                showAuthMessage(message, error.message, true);
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }

    // Homepage authentication status & Navbar UI
    const isHomePage =
        window.location.pathname === "/" ||
        window.location.pathname.endsWith("/index.html");

    if (!isHomePage) return;

    // Hide login links and show the logged-in user's panel & Add Machine button for owners
    async function updateAuthUI() {
        try {
            const result = await apiRequest("/api/me");

            const loginLinks = document.querySelectorAll(".login-btn, nav a[href*='login.html']");
            const nav = document.querySelector("header.navbar nav");
            let panel = document.getElementById("authStatusPanel");
            let addMachineNavBtn = document.getElementById("addMachineNavBtn");

            if (result.loggedIn && result.user) {
                // Hide generic Login links
                loginLinks.forEach((link) => {
                    link.hidden = true;
                    link.style.setProperty("display", "none", "important");
                });

                // If user is a Tractor / Machinery Owner/Driver, show "➕ List Machine" in navbar!
                if (result.user.role === "owner") {
                    if (!addMachineNavBtn && nav) {
                        addMachineNavBtn = document.createElement("a");
                        addMachineNavBtn.id = "addMachineNavBtn";
                        addMachineNavBtn.href = "#listMachineSection";
                        addMachineNavBtn.className = "partner-badge-nav";
                        addMachineNavBtn.innerHTML = "🚜 + List My Machine";
                        nav.appendChild(addMachineNavBtn);
                    }
                    // Also reveal the Owner machinery listing section on homepage
                    const listSection = document.getElementById("listMachineSection");
                    if (listSection) listSection.style.display = "block";
                }

                if (!panel) {
                    panel = document.createElement("div");
                    panel.id = "authStatusPanel";
                    panel.className = "auth-status";

                    const roleBadge = document.createElement("span");
                    roleBadge.className = "user-role-pill";
                    roleBadge.textContent = result.user.role === "owner" ? "🚜 Partner Owner" : "🌾 Farmer";

                    const welcome = document.createElement("span");
                    welcome.id = "authWelcome";

                    const logoutButton = document.createElement("button");
                    logoutButton.type = "button";
                    logoutButton.textContent = "Logout";

                    logoutButton.addEventListener("click", async () => {
                        logoutButton.disabled = true;
                        try {
                            await apiRequest("/api/logout", {});
                            window.location.href = "/index.html";
                        } catch (error) {
                            alert(error.message);
                            logoutButton.disabled = false;
                        }
                    });

                    panel.appendChild(roleBadge);
                    panel.appendChild(welcome);
                    panel.appendChild(logoutButton);
                    document.body.appendChild(panel);
                }

                const welcome = panel.querySelector("#authWelcome");
                if (welcome) {
                    welcome.textContent = `Hello, ${result.user.name}`;
                }
            } else {
                // Logged out: show Login links again
                loginLinks.forEach((link) => {
                    link.hidden = false;
                    link.style.removeProperty("display");
                });

                if (panel) panel.remove();
                if (addMachineNavBtn) addMachineNavBtn.remove();
            }
        } catch (error) {
            console.error("Could not check login status:", error);
        }
    }

    updateAuthUI();
});
