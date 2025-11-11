// This runs as soon as the profile.html page loads
document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Get the Mentor's ID from the URL
    const params = new URLSearchParams(window.location.search);
    const mentorId = params.get('id'); 

    if (!mentorId) {
        document.getElementById('profile-container').innerHTML = `<p class="text-white">Error: No mentor ID provided.</p>`;
        return;
    }

    // 2. Fetch the data for this specific mentor
    fetchMentorProfile(mentorId);
});

async function fetchMentorProfile(id) {
    const loadingSpinner = document.getElementById('loading-spinner');
    const profileContent = document.getElementById('profile-content');

    try {
        const response = await fetch(`http://localhost:3001/mentor/${id}`);
        
        if (!response.ok) {
            loadingSpinner.innerHTML = `<p class="text-white">Error: Mentor not found.</p>`;
            return;
        }

        const data = await response.json();
        const profile = data.profile;
        const sessions = data.sessions;
        const feedback = data.feedback; 

        // 3. Fill in the profile data
        document.getElementById('profile-name').innerHTML = `${profile.name} <i class="bi bi-patch-check-fill text-primary"></i>`;
        document.getElementById('profile-headline').textContent = profile.headline;
        document.getElementById('profile-bio').textContent = profile.bio;
        document.getElementById('profile-linkedin').href = profile.linkedin_url;
        document.getElementById('profile-img').src = `https://placehold.co/150x150/FFFFFF/00b4d8?text=${profile.name.charAt(0)}`;
        document.getElementById('profile-img').alt = profile.name;

        document.getElementById('profile-skills').innerHTML = ''; 

        // 4. Fill in the available sessions
        const sessionsGrid = document.getElementById('profile-sessions');
        sessionsGrid.innerHTML = ''; 

        if (sessions.length > 0) {
            sessions.forEach(session => {
                const date = new Date(session.start_time);
                const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

                const sessionButtonHTML = `
                    <div class="col-md-4">
                        <button class="btn btn-outline-light w-100 p-3" data-session-id="${session.session_id}">
                            <i class="bi bi-calendar-check"></i>
                            ${formattedDate}<br>
                            ${formattedTime}
                        </button>
                    </div>
                `;
                sessionsGrid.innerHTML += sessionButtonHTML;
            });

            // 5. Add click listeners to all session buttons
            sessionsGrid.querySelectorAll('button').forEach(button => {
                button.addEventListener('click', () => {
                    const sessionId = button.getAttribute('data-session-id');
                    // --- UPDATED LOGIC ---
                    // Don't ask to confirm, just go to payment
                    bookSession(sessionId); 
                });
            });

        } else {
            sessionsGrid.innerHTML = `<p class="text-white-50">No available sessions found.</p>`;
        }

        // 6. Fill in the feedback
        const feedbackList = document.getElementById('profile-feedback');
        feedbackList.innerHTML = ''; 
        if (feedback.length > 0) {
            feedback.forEach(review => {
                let stars = '';
                for(let i = 0; i < 5; i++) {
                    stars += `<i class="bi ${i < review.score ? 'bi-star-fill' : 'bi-star'} text-primary"></i>`;
                }
                feedbackList.innerHTML += `
                    <div class="glass-input p-3">
                        <div class="d-flex justify-content-between">
                            <h5 class="text-white mb-0">${review.rater_name}</h5>
                            <span class="fs-6">${stars}</span>
                        </div>
                        <p class="text-white-50 mt-2 mb-0">"${review.comments}"</p>
                    </div>
                `;
            });
        } else {
            feedbackList.innerHTML = `<p class="text-white-50">This mentor has no reviews yet.</p>`;
        }

        // 7. Hide the spinner and show the content
        loadingSpinner.classList.add('d-none');
        profileContent.classList.remove('d-none');

    } catch (error) {
        console.error("Error fetching mentor profile:", error);
        loadingSpinner.innerHTML = `<p class="text-white">Error loading profile. Could not connect to server.</p>`;
    }
}


// --- UPDATED BOOKING FUNCTION ---
function bookSession(sessionId) {
    const token = localStorage.getItem('mentorConnectToken');
    if (!token) {
        alert('You must be logged in to book a session.');
        return;
    }

    // 1. Save the ID so the next page can get it
    localStorage.setItem('pendingBookingId', sessionId);
    
    // 2. Redirect to the payment page
    window.location.href = 'payment.html';
}