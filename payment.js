// This runs as soon as the payment.html page loads
document.addEventListener("DOMContentLoaded", () => {

    // 1. Get the session ID we saved from the profile page
    const sessionId = localStorage.getItem('pendingBookingId');
    const token = localStorage.getItem('mentorConnectToken');

    if (!sessionId || !token) {
        alert('Error: No session selected or you are not logged in.');
        window.location.href = 'browse.html';
        return;
    }

    // 2. Fetch the session details to show a summary
    fetchSessionDetails(sessionId, token);

    // 3. Add listener to the "Pay" button
    const paymentForm = document.getElementById('payment-form');
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payButton = document.getElementById('pay-button');
        payButton.disabled = true;
        payButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';

        // 4. Call our *existing* /book API
        const success = await bookSession(sessionId, token);

        if (success) {
            alert('Payment successful! Session booked.');
            localStorage.removeItem('pendingBookingId'); // Clean up
            window.location.href = 'dashboard.html'; // Send to dashboard
        } else {
            alert('Booking failed. The session may no longer be available.');
            payButton.disabled = false;
            payButton.innerHTML = 'Pay & Book Session';
        }
    });
});

async function fetchSessionDetails(sessionId, token) {
    try {
        const response = await fetch(`${API_BASE_URL}/session-details/${sessionId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Session not found');
        }

        const session = await response.json();

        // Format the data
        const date = new Date(session.start_time);
        const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

        // 5. Fill in the summary
        document.getElementById('summary-mentor').textContent = session.mentor_name;
        document.getElementById('summary-time').textContent = `${formattedDate} at ${formattedTime}`;
        document.getElementById('summary-fee').textContent = `$${parseFloat(session.fee).toFixed(2)}`;

        // Show the content
        document.getElementById('payment-loading').classList.add('d-none');
        document.getElementById('payment-content').classList.remove('d-none');

    } catch (error) {
        alert('Error loading session details. Redirecting...');
        window.location.href = 'browse.html';
    }
}

async function bookSession(sessionId, token) {
    // This is the same function from profile.js, but now it returns true/false
    try {
        const response = await fetch(`${API_BASE_URL}/book`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ sessionId: sessionId })
        });
        return response.ok;
    } catch (error) {
        console.error('Booking error:', error);
        return false;
    }
}