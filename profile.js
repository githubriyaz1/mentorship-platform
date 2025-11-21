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
        const response = await fetch(`${API_BASE_URL}/mentor/${id}`);

        if (!response.ok) {
            loadingSpinner.innerHTML = `<p class="text-white">Error: Mentor not found.</p>`;
            return;
        }

        const data = await response.json();
        const profile = data.profile;
        const sessions = data.sessions;
        const feedback = data.feedback;

        // 3. Fill in the profile data
        // Use textContent for user-generated strings where possible, but name has an icon
        const nameEl = document.getElementById('profile-name');
        nameEl.textContent = profile.name + ' ';
        const icon = document.createElement('i');
        icon.className = 'bi bi-patch-check-fill text-primary';
        nameEl.appendChild(icon);

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

                const col = document.createElement('div');
                col.className = 'col-md-4';

                const btn = document.createElement('button');
                btn.className = 'btn btn-outline-light w-100 p-3';
                btn.setAttribute('data-session-id', session.session_id);

                const icon = document.createElement('i');
                icon.className = 'bi bi-calendar-check';

                btn.appendChild(icon);
                btn.appendChild(document.createTextNode(` ${formattedDate}`));
                btn.appendChild(document.createElement('br'));
                btn.appendChild(document.createTextNode(formattedTime));

                btn.addEventListener('click', () => {
                    bookSession(session.session_id);
                });

                col.appendChild(btn);
                sessionsGrid.appendChild(col);
            });

        } else {
            sessionsGrid.innerHTML = `<p class="text-white-50">No available sessions found.</p>`;
        }

        // 6. Fill in the feedback
        const feedbackList = document.getElementById('profile-feedback');
        feedbackList.innerHTML = '';
        if (feedback.length > 0) {
            feedback.forEach(review => {
                const div = document.createElement('div');
                div.className = 'glass-input p-3';

                const headerDiv = document.createElement('div');
                headerDiv.className = 'd-flex justify-content-between';

                const h5 = document.createElement('h5');
                h5.className = 'text-white mb-0';
                h5.textContent = review.rater_name;
                headerDiv.appendChild(h5);

                const spanStars = document.createElement('span');
                spanStars.className = 'fs-6';

                for (let i = 0; i < 5; i++) {
                    const starIcon = document.createElement('i');
                    starIcon.className = `bi ${i < review.score ? 'bi-star-fill' : 'bi-star'} text-primary`;
                    spanStars.appendChild(starIcon);
                }
                headerDiv.appendChild(spanStars);
                div.appendChild(headerDiv);

                const pComment = document.createElement('p');
                pComment.className = 'text-white-50 mt-2 mb-0';
                pComment.textContent = `"${review.comments}"`;
                div.appendChild(pComment);

                feedbackList.appendChild(div);
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