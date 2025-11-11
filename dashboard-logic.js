// This runs as soon as the dashboard.html page loads
document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. Get User Info ---
    const token = localStorage.getItem('mentorConnectToken');
    const userName = localStorage.getItem('mentorConnectUser');
    const userRole = localStorage.getItem('mentorConnectRole'); 

    // --- 2. Auth Check ("Gatekeeper") ---
    if (!token) {
        alert("You must be logged in to see this page.");
        window.location.href = 'index.html';
        return;
    }

    // --- 3. Customize Header ---
    const welcomeHeader = document.getElementById('welcome-header');
    if (userName) {
        const firstName = userName.split(' ')[0];
        welcomeHeader.textContent = `Welcome back, ${firstName}!`;
    }

    // --- 4. Call the correct API based on role ---
    if (userRole === 'mentee') {
        fetchMyBookings(token);
    } else if (userRole === 'mentor') {
        checkMentorProfile(token); // This will call fetchMySessions
        
        // Add the "Add Slot" listener (runs once)
        const createSessionForm = document.getElementById('create-session-form');
        if (createSessionForm) {
            createSessionForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const startTime = document.getElementById('session-start-time').value;
                const fee = document.getElementById('session-fee').value;
                const newSession = await createSession(token, startTime, fee);
                if (newSession) {
                    const availableList = document.getElementById('mentor-available-list');
                    const newCard = createSessionCard(newSession, 'available');
                    const noSlotsMsg = availableList.querySelector('p');
                    if (noSlotsMsg && noSlotsMsg.textContent.includes("no available slots")) {
                        noSlotsMsg.innerHTML = '';
                    }
                    availableList.innerHTML += newCard;
                    createSessionForm.reset();
                }
            });
        }
    } else if (userRole === 'admin') {
        fetchPendingMentors(token);
        fetchOpenDisputes(token);
        fetchAdminStats(token); 
        fetchCancellationRequests(token);
    } else {
        document.getElementById('dash-loading-spinner').innerHTML = '<p>Error: Unknown user role.</p>';
    }

    // --- 5. Feedback Modal Logic (runs once) ---
    const feedbackModal = document.getElementById('feedbackModal');
    if (feedbackModal) {
        const feedbackModalInstance = new bootstrap.Modal(feedbackModal);
        feedbackModal.addEventListener('show.bs.modal', (event) => {
            const button = event.relatedTarget;
            const sessionId = button.getAttribute('data-session-id');
            document.getElementById('feedback-session-id').value = sessionId;
        });
        const feedbackForm = document.getElementById('feedback-form');
        feedbackForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const sessionId = document.getElementById('feedback-session-id').value;
            const score = document.getElementById('feedback-score').value;
            const comments = document.getElementById('feedback-comments').value;
            const success = await submitFeedback(token, sessionId, score, comments);
            if (success) {
                alert('Feedback submitted successfully!');
                feedbackModalInstance.hide();
                const button = document.querySelector(`.btn-leave-feedback[data-session-id="${sessionId}"]`);
                if (button) {
                    button.textContent = 'Feedback Submitted';
                    button.disabled = true;
                }
            } else {
                alert('Error submitting feedback.');
            }
        });
    }

    // --- 6. Event Delegation for all dynamic buttons ---
    const dashboardContent = document.getElementById('dashboard-content');
    
    // Listener for "Mark as Complete"
    dashboardContent.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('btn-complete-session')) {
            const button = e.target;
            const sessionId = button.getAttribute('data-session-id');
            const success = await completeSession(token, sessionId);
            if (success) {
                alert('Session marked as complete!');
                fetchMySessions(token); // Refresh the mentor list
            } else {
                alert('Failed to complete session.');
            }
        }
    });

    // Listener for "Cancel Session"
    dashboardContent.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('btn-cancel-session')) {
            const button = e.target;
            const sessionId = button.getAttribute('data-session-id');
            const reason = prompt("Please provide a reason. This will be sent to the admin for approval:");
            if (reason) {
                const success = await requestCancellation(token, sessionId, reason);
                if (success) {
                    alert('Cancellation request submitted to admin.');
                    button.textContent = 'Pending Approval';
                    button.disabled = true;
                } else {
                    alert('Failed to submit request.');
                }
            } else {
                alert('Cancellation aborted.');
            }
        }
    });

    // --- NEW: Listener for "Delete Available Slot" ---
    dashboardContent.addEventListener('click', async (e) => {
        const button = e.target.closest('.btn-delete-slot'); // Use closest to get icon
        if (button) {
            const sessionId = button.getAttribute('data-session-id');
            if (confirm('Are you sure you want to delete this available slot? This cannot be undone.')) {
                const success = await deleteSlot(token, sessionId);
                if (success) {
                    alert('Slot deleted.');
                    // Remove the card from the UI
                    document.getElementById(`session-card-${sessionId}`).remove();
                } else {
                    alert('Failed to delete slot. It might be booked.');
                }
            }
        }
    });

    // Listener for "Verify Mentor"
    dashboardContent.addEventListener('click', async (e) => {
        const button = e.target.closest('.btn-verify-mentor'); 
        if (button) {
            const mentorId = button.getAttribute('data-mentor-id');
            if (confirm(`Are you sure you want to verify this mentor?`)) {
                const success = await verifyMentor(token, mentorId);
                if (success) {
                    alert('Mentor verified!');
                    document.getElementById(`mentor-row-${mentorId}`).remove();
                } else {
                    alert('Verification failed.');
                }
            }
        }
    });

    // Listener for "Resolve Dispute"
    dashboardContent.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('btn-resolve-dispute')) {
            const button = e.target;
            const disputeId = button.getAttribute('data-dispute-id');
            const notes = prompt('Enter resolution notes (e.g., "Refunded mentee, warned mentor"):');
            if (notes) {
                const success = await resolveDispute(token, disputeId, notes);
                if (success) {
                    alert('Dispute resolved!');
                    document.getElementById(`dispute-row-${disputeId}`).remove();
                } else {
                    alert('Failed to resolve dispute.');
                }
            }
        }
    });

    // Listener for "Raise Dispute" (on mentee dash)
    dashboardContent.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('btn-raise-dispute')) {
            const button = e.target;
            const bookingId = button.getAttribute('data-booking-id');
            localStorage.setItem('disputeBookingId', bookingId);
            window.location.href = 'dispute.html';
        }
    });

    // Listener for "Approve Cancellation"
    dashboardContent.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('btn-approve-cancellation')) {
            const button = e.target;
            const requestId = button.getAttribute('data-request-id');
            const notes = prompt('Enter resolution notes (e.g., "Approved, mentee refunded."):');
            if (notes) {
                const success = await approveCancellation(token, requestId, notes);
                if (success) {
                    alert('Cancellation Approved.');
                    document.getElementById(`cancellation-row-${requestId}`).remove();
                } else {
                    alert('Failed to approve request.');
                }
            }
        }
    });

});

// --- Gatekeeper for Mentors ---
async function checkMentorProfile(token) {
    try {
        const response = await fetch('http://localhost:3001/check-profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.hasProfile) {
            fetchMySessions(token);
        } else {
            alert('Welcome! Please complete your mentor profile to continue.');
            window.location.href = 'onboarding.html';
        }
    } catch (err) {
        alert('Error checking your profile. Please try again.');
        logout();
    }
}

// --- Function for Mentees ---
async function fetchMyBookings(token) {
    const response = await fetch('http://localhost:3001/my-bookings', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const menteeDash = document.getElementById('mentee-dashboard');
    const list = document.getElementById('mentee-bookings-list');
    if (response.ok) {
        const bookings = await response.json();
        list.innerHTML = '';
        if (bookings.length === 0) {
            list.innerHTML = `<p class="text-white-50">You have no upcoming sessions. <a href="browse.html">Browse mentors</a> to book one!</p>`;
        } else {
            bookings.forEach(booking => { list.innerHTML += createMenteeBookingCard(booking); });
        }
    } else {
        list.innerHTML = `<p class="text-danger">Error loading your bookings.</p>`;
    }
    document.getElementById('dash-loading-spinner').classList.add('d-none');
    menteeDash.classList.remove('d-none');
}
// --- Helper to create mentee card ---
function createMenteeBookingCard(booking) {
    const date = new Date(booking.start_time);
    const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    let cardClass = 'glass-input p-3';
    let actionButton = '';

    if (booking.status === 'completed') {
        cardClass = 'glass-input p-3 bg-secondary bg-opacity-25';
        if (booking.feedback_given > 0) {
            actionButton = '<button class="btn btn-outline-success btn-sm mt-2" disabled>Feedback Submitted</button>';
        } else {
            actionButton = `<button class="btn btn-outline-light btn-sm mt-2 btn-leave-feedback" 
                                data-bs-toggle="modal" data-bs-target="#feedbackModal"
                                data-session-id="${booking.session_id}">
                                Leave Feedback
                              </button>`;
        }
    } else if (booking.status === 'booked') {
        actionButton = `<button class="btn btn-outline-danger btn-sm mt-2 btn-raise-dispute"
                        data-booking-id="${booking.booking_id}">
                        Report an Issue
                      </button>`;
    } else if (booking.status === 'pending_cancellation') {
        cardClass = 'glass-input p-3 bg-warning bg-opacity-10';
        actionButton = `<span class="badge bg-warning text-dark mt-2">Cancellation Pending</span>`;
    } else if (booking.status === 'canceled') {
        cardClass = 'glass-input p-3 bg-danger bg-opacity-10';
        actionButton = `<span class="badge bg-danger mt-2">Session Canceled</span>`;
    }

    return `
        <div class="col-md-6">
            <div class="${cardClass}">
                <h5 class="text-white">Session with ${booking.mentor_name}</h5>
                <p class="text-white-50 mb-0">
                    <i class="bi bi-calendar-check"></i> ${formattedDate} at ${formattedTime}
                </p>
                ${actionButton}
            </div>
        </div>`;
}

// --- Function for Mentors ---
async function fetchMySessions(token) {
    const response = await fetch('http://localhost:3001/my-sessions', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const mentorDash = document.getElementById('mentor-dashboard');
    const bookedList = document.getElementById('mentor-booked-list');
    if (response.ok) {
        const sessions = await response.json();
        renderMentorSessions(sessions);
    } else {
        bookedList.innerHTML = `<p class="text-danger">Error loading your sessions.</p>`;
    }
    
    document.getElementById('dash-loading-spinner').classList.add('d-none');
    mentorDash.classList.remove('d-none');
}

// --- Function for Admins ---
async function fetchPendingMentors(token) {
    const response = await fetch('http://localhost:3001/admin/pending-mentors', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const adminDash = document.getElementById('admin-dashboard');
    const list = document.getElementById('admin-pending-list');
    if (response.ok) {
        const mentors = await response.json();
        list.innerHTML = '';
        if (mentors.length === 0) {
            list.innerHTML = `<p class="text-white-50">No mentors are currently pending approval.</p>`;
        } else {
            mentors.forEach(mentor => {
                const date = new Date(mentor.created_at);
                const formattedDate = date.toLocaleDateString();
                list.innerHTML += `
                    <div class="col-12" id="mentor-row-${mentor.user_id}">
                        <div class="glass-input p-3 d-flex justify-content-between align-items-center">
                            <div>
                                <h5 class="text-white mb-0">${mentor.name}</h5>
                                <p class="text-white-50 mb-0">${mentor.email} (Registered: ${formattedDate})</p>
                            </div>
                            <button class="btn btn-success btn-verify-mentor" data-mentor-id="${mentor.user_id}">
                                <i class="bi bi-patch-check-fill"></i> Verify
                            </button>
                        </div>
                    </div>`;
            });
        }
    } else {
        list.innerHTML = `<p class="text-danger">Error loading pending mentors.</p>`;
    }
    adminDash.classList.remove('d-none');
}
async function fetchOpenDisputes(token) {
    const response = await fetch('http://localhost:3001/admin/open-disputes', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const list = document.getElementById('admin-disputes-list');
    if (response.ok) {
        const disputes = await response.json();
        list.innerHTML = '';
        if (disputes.length === 0) {
            list.innerHTML = `<p class="text-white-50">No open disputes.</p>`;
        } else {
            disputes.forEach(dispute => {
                list.innerHTML += `
                    <div class="col-12" id="dispute-row-${dispute.dispute_id}">
                        <div class="glass-input p-3">
                            <div class="d-flex justify-content-between align-items-center">
                                <h5 class="text-white mb-0">Dispute #${dispute.dispute_id}</h5>
                                <button class="btn btn-warning btn-resolve-dispute" data-dispute-id="${dispute.dispute_id}">
                                    Resolve
                                </button>
                            </div>
                            <p class="text-white-50 mt-2 mb-1">Raised by: ${dispute.mentee_name}</p>
                            <p class="text-white-50 mb-0">Reason: "${dispute.reason}"</p>
                        </div>
                    </div>
                `;
            });
        }
    } else {
        list.innerHTML = `<p class="text-danger">Error loading disputes.</p>`;
    }
}
async function fetchAdminStats(token) {
    try {
        const response = await fetch('http://localhost:3001/admin/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('stats-revenue').textContent = `$${parseFloat(stats.totalRevenue).toFixed(2)}`;
            document.getElementById('stats-sessions').textContent = stats.totalSessions;
            const ctx = document.getElementById('statsChart').getContext('2d');
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Mentees', 'Mentors'],
                    datasets: [{
                        label: 'User Breakdown',
                        data: [stats.totalMentees, stats.totalMentors],
                        backgroundColor: ['rgba(0, 180, 216, 0.7)', 'rgba(255, 255, 255, 0.7)'],
                        borderColor: ['rgba(0, 180, 216, 1)', 'rgba(255, 255, 255, 1)'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { labels: { color: '#ffffff' }}}
                }
            });
        }
    } catch (err) {
        console.error('Error fetching stats:', err);
    }
    document.getElementById('dash-loading-spinner').classList.add('d-none');
}
async function fetchCancellationRequests(token) {
    const response = await fetch('http://localhost:3001/admin/cancellation-requests', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const list = document.getElementById('admin-cancellation-list');
    if (response.ok) {
        const requests = await response.json();
        list.innerHTML = '';
        if (requests.length === 0) {
            list.innerHTML = `<p class="text-white-50">No pending cancellation requests.</p>`;
        } else {
            requests.forEach(req => {
                list.innerHTML += `
                    <div class="col-12" id="cancellation-row-${req.request_id}">
                        <div class="glass-input p-3">
                            <div class="d-flex justify-content-between align-items-center">
                                <h5 class="text-white mb-0">Request #${req.request_id} (Session ${req.session_id})</h5>
                                <button class="btn btn-success btn-approve-cancellation" data-request-id="${req.request_id}">
                                    Approve
                                </button>
                            </div>
                            <p class="text-white-50 mt-2 mb-1">Mentor: ${req.mentor_name}</p>
                            <p class="text-white-50 mb-0">Reason: "${req.reason}"</p>
                        </div>
                    </div>
                `;
            });
        }
    } else {
        list.innerHTML = `<p class="text-danger">Error loading requests.</p>`;
    }
}


// --- Helper Functions ---
async function resolveDispute(token, disputeId, resolutionNotes) {
    try {
        const response = await fetch('http://localhost:3001/admin/resolve-dispute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({ disputeId, resolutionNotes })
        });
        return response.ok;
    } catch (err) {
        console.error('Resolve dispute error:', err);
        return false;
    }
}
async function verifyMentor(token, mentorId) { 
    try {
        const response = await fetch('http://localhost:3001/admin/verify-mentor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({ mentorId })
        });
        return response.ok;
    } catch (err) {
        console.error('Verify mentor error:', err);
        return false;
    }
}
function renderMentorSessions(sessions) {
    const bookedList = document.getElementById('mentor-booked-list');
    const availableList = document.getElementById('mentor-available-list');
    bookedList.innerHTML = ''; 
    availableList.innerHTML = '';
    const booked = sessions.filter(s => s.status === 'booked');
    const available = sessions.filter(s => s.status === 'available');
    const pending = sessions.filter(s => s.status === 'pending_cancellation');
    
    if (booked.length === 0) { bookedList.innerHTML = `<p class="text-white-50">You have no upcoming booked sessions.</p>`; } 
    else { booked.forEach(session => { bookedList.innerHTML += createSessionCard(session, 'booked'); }); }
    
    if (available.length === 0) { availableList.innerHTML = `<p class="text-white-50">You have no available slots.</p>`; } 
    else { available.forEach(session => { availableList.innerHTML += createSessionCard(session, 'available'); }); }

    if (pending.length > 0) {
        if (booked.length === 0) bookedList.innerHTML = '';
        pending.forEach(session => { bookedList.innerHTML += createSessionCard(session, 'pending_cancellation'); });
    }
}
function createSessionCard(session, type) {
    const date = new Date(session.start_time);
    const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    
    if (type === 'booked') {
        return `
            <div class="col-md-6" id="session-card-${session.session_id}">
                <div class="glass-input p-3 bg-primary bg-opacity-10">
                    <h5 class="text-white">Session with ${session.mentee_name || '...'}</h5>
                    <p class="text-white-50 mb-2">
                        <i class="bi bi-calendar-check"></i> ${formattedDate} at ${formattedTime}
                    </p>
                    <button class="btn btn-outline-light btn-sm btn-complete-session me-2" data-session-id="${session.session_id}">
                        Mark as Complete
                    </button>
                    <button class="btn btn-outline-danger btn-sm btn-cancel-session" data-session-id="${session.session_id}">
                        Request Cancellation
                    </button>
                </div>
            </div>`;
    } else if (type === 'pending_cancellation') {
        return `
            <div class="col-md-6" id="session-card-${session.session_id}">
                <div class="glass-input p-3 bg-warning bg-opacity-10">
                    <h5 class="text-white">Session with ${session.mentee_name || '...'}</h5>
                    <p class="text-white-50 mb-2">
                        <i class="bi bi-calendar-check"></i> ${formattedDate} at ${formattedTime}
                    </p>
                    <button class="btn btn-warning btn-sm" disabled>
                        Cancellation Pending
                    </button>
                </div>
            </div>`;
    } else { // type === 'available'
        // --- THIS IS THE FIX ---
        return `
            <div class="col-md-4" id="session-card-${session.session_id}">
                <div class="glass-input p-3 position-relative">
                    <p class="text-white-50 mb-0">
                        <i class="bi bi-calendar-event"></i> ${formattedDate} at ${formattedTime}
                    </p>
                    <button class="btn btn-outline-danger btn-sm btn-delete-slot position-absolute" 
                            style="top: 5px; right: 5px;" 
                            data-session-id="${session.session_id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>`;
    }
}
async function createSession(token, startTime, fee) {
    try {
        const response = await fetch('http://localhost:3001/create-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({ startTime, fee })
        });
        const data = await response.json();
        if (response.ok) {
            alert('Success! ' + data.message);
            return data.newSession;
        } else {
            alert('Failed: ' + data.message);
            return null;
        }
    } catch (err) {
        console.error('Create session error:', err);
        alert('Could not connect to server.');
        return null;
    }
}
async function completeSession(token, sessionId) {
    try {
        const response = await fetch('http://localhost:3001/complete-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({ sessionId })
        });
        return response.ok;
    } catch (err) {
        console.error('Complete session error:', err);
        return false;
    }
}
async function requestCancellation(token, sessionId, reason) {
    try {
        const response = await fetch('http://localhost:3001/request-cancellation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ sessionId, reason })
        });
        return response.ok;
    } catch (err) {
        console.error('Cancel session error:', err);
        return false;
    }
}
async function approveCancellation(token, requestId, adminNotes) {
    try {
        const response = await fetch('http://localhost:3001/admin/approve-cancellation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({ requestId, adminNotes })
        });
        return response.ok;
    } catch (err) {
        console.error('Approve cancellation error:', err);
        return false;
    }
}
async function submitFeedback(token, sessionId, score, comments) {
    try {
        const response = await fetch('http://localhost:3001/submit-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({ sessionId, score, comments })
        });
        return response.ok;
    } catch (err) {
        console.error('Submit feedback error:', err);
        return false;
    }
}

// --- NEW: Helper to call delete-slot API ---
async function deleteSlot(token, sessionId) {
    try {
        const response = await fetch(`http://localhost:3001/delete-slot/${sessionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (err) {
        console.error('Delete slot error:', err);
        return false;
    }
}

function logout() {
    localStorage.removeItem('mentorConnectToken');
    localStorage.removeItem('mentorConnectUser');
    localStorage.removeItem('mentorConnectRole');
    window.location.href = 'index.html';
}