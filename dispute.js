document.addEventListener("DOMContentLoaded", () => {

    // 1. Get the booking ID we saved
    const bookingId = localStorage.getItem('disputeBookingId');
    const token = localStorage.getItem('mentorConnectToken');

    if (!bookingId || !token) {
        alert('Error: No booking selected or you are not logged in.');
        window.location.href = 'dashboard.html';
        return;
    }

    // 2. Fill the form
    document.getElementById('dispute-booking-id').value = bookingId;

    // 3. Add listener to the submit button
    const disputeForm = document.getElementById('dispute-form');
    disputeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const reason = document.getElementById('dispute-reason').value;
        const submitButton = document.getElementById('dispute-submit-btn');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';

        try {
            const response = await fetch(`${API_BASE_URL}/raise-dispute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ bookingId: bookingId, reason: reason })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Success! ' + data.message);
                localStorage.removeItem('disputeBookingId'); // Clean up
                window.location.href = 'dashboard.html'; // Send back to dashboard
            } else {
                alert('Failed: ' + data.message);
                submitButton.disabled = false;
                submitButton.innerHTML = 'Submit Dispute';
            }

        } catch (error) {
            console.error('Dispute error:', error);
            alert('Could not connect to the server.');
            submitButton.disabled = false;
            submitButton.innerHTML = 'Submit Dispute';
        }
    });
});