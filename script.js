// This runs immediately when the script file is loaded
console.log("MentorConnect script loaded!");

// --- A function to update the navbar ---
function updateNavbar() {
    const token = localStorage.getItem('mentorConnectToken');
    const navContainer = document.getElementById('nav-container');

    if (!navContainer) return; // Exit if no nav container on page

    let navLinks = `
        <li class="nav-item">
            <a class="nav-link" href="index.html">Home</a>
        </li>
        <li class="nav-item">
            <a class="nav-link" href="browse.html">Browse Mentors</a>
        </li>
    `;

    if (token) {
        // User is logged in
        navLinks += `
            <li class="nav-item ms-lg-2">
                <a href="dashboard.html" class="btn btn-primary hero-btn me-2">Dashboard</a>
                <button class="btn btn-outline-light" id="logout-button">Logout</button>
            </li>
        `;
    } else {
        // User is logged out
        navLinks += `
            <li class="nav-item ms-lg-2">
                <button class="btn btn-outline-light" data-bs-toggle="modal" data-bs-target="#loginModal">
                    Login / Sign Up
                </button>
            </li>
        `;
    }

    navContainer.innerHTML = navLinks;

    // We must re-add the logout listener if it exists
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            console.log("Logging out...");
            localStorage.removeItem('mentorConnectToken');
            localStorage.removeItem('mentorConnectUser');
            localStorage.removeItem('mentorConnectRole');
            updateNavbar(); // Re-run to update UI
            
            // If on a protected page, redirect to home
            const currentPage = window.location.pathname;
            if (currentPage.includes('dashboard.html') || 
                currentPage.includes('profile.html') || 
                currentPage.includes('browse.html') ||
                currentPage.includes('payment.html') ||
                currentPage.includes('dispute.html')) {
                 window.location.href = 'index.html';
            }
        });
    }
}

// This waits for the *entire HTML page* to load
document.addEventListener("DOMContentLoaded", () => {
    
    console.log("DOM fully loaded and parsed");

    // --- Check login status as soon as page loads ---
    updateNavbar();

    // --- Get the Modal Instance ---
    const loginModalElement = document.getElementById('loginModal');
    const loginModalInstance = loginModalElement ? new bootstrap.Modal(loginModalElement) : null;
    
    // --- 1. SIGNUP FORM LOGIC ---
    const signupForm = document.querySelector("#pills-signup form");
    if (signupForm) {
        signupForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const name = document.getElementById("signupName").value;
            const email = document.getElementById("signupEmail").value;
            const password = document.getElementById("signupPassword").value;
            const role = document.getElementById("signupRole").value;

            if (role === "Register as...") {
                alert("Please select a role (Mentee or Mentor).");
                return;
            }

            const formData = { name, email, password, role };
            
            try {
                const response = await fetch('http://localhost:3001/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    let alertMessage = `Welcome, ${name}! Please log in to continue.`;
                    if (role === 'mentor') {
                        alertMessage = `Welcome, ${name}! Your mentor account is created and is pending admin approval. You will be able to log in once verified.`;
                    }
                    alert(alertMessage);
                    
                    signupForm.reset();
                    // Switch to login tab
                    const loginTab = document.getElementById('pills-login-tab');
                    if (loginTab) new bootstrap.Tab(loginTab).show();
                } else {
                    alert(`Registration failed: ${data.message}`);
                }
            } catch (error) {
                console.error("Signup error:", error);
                alert("Could not connect to the server.");
            }
        });
    }

    // --- 2. LOGIN FORM LOGIC ---
    const loginForm = document.querySelector("#pills-login form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = document.getElementById("loginEmail").value;
            const password = document.getElementById("loginPassword").value;
            const formData = { email, password };

            try {
                const response = await fetch('http://localhost:3001/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                const data = await response.json();

                if (response.ok) {
                    // Store token AND user info
                    localStorage.setItem('mentorConnectToken', data.token);
                    localStorage.setItem('mentorConnectUser', data.name);
                    localStorage.setItem('mentorConnectRole', data.role);
                    
                    alert(`Welcome back, ${data.name}!`);
                    loginForm.reset();
                    if (loginModalInstance) loginModalInstance.hide();
                    
                    // Redirect to dashboard
                    window.location.href = 'dashboard.html';

                } else {
                    alert(`Login failed: ${data.message}`);
                }
            } catch (error) {
                console.error("Login error:", error);
                alert("Could not connect to the server.");
            }
        });
    }

    // --- 3. "Become a Mentor" Button Logic ---
    const becomeMentorBtn = document.getElementById('become-mentor-btn');
    if (becomeMentorBtn) {
        
        const signupTab = document.getElementById('pills-signup-tab');

        becomeMentorBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Stop the '#' link from jumping
            
            // 1. Show the modal
            if (loginModalInstance) loginModalInstance.show();
            
            // 2. Switch to the "Sign Up" tab
            if (signupTab) {
                new bootstrap.Tab(signupTab).show();
            }

            // 3. Pre-select the "Mentor" role
            const roleDropdown = document.getElementById('signupRole');
            if (roleDropdown) {
                roleDropdown.value = 'mentor';
            }
        });
    }

}); // <-- This is the END of the single DOMContentLoaded listener
