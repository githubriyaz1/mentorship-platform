document.addEventListener("DOMContentLoaded", () => {

    const token = localStorage.getItem('mentorConnectToken');
    if (!token) {
        // If no token, kick them out
        window.location.href = 'index.html';
        return;
    }

    const onboardingForm = document.getElementById('onboarding-form');
    onboardingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitButton = document.getElementById('create-profile-btn');
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating Profile...';

        const formData = {
            headline: document.getElementById('headline').value,
            bio: document.getElementById('bio').value,
            linkedin_url: document.getElementById('linkedin').value
        };

        try {
            const response = await fetch(`${API_BASE_URL}/create-profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                alert('Profile created! Welcome to the platform.');
                window.location.href = 'dashboard.html'; // All done, send to dashboard
            } else {
                alert('Error: ' + data.message);
                submitButton.disabled = false;
                submitButton.innerHTML = 'Create My Profile & Go to Dashboard';
            }

        } catch (err) {
            console.error('Onboarding error:', err);
            alert('Could not connect to server.');
            submitButton.disabled = false;
            submitButton.innerHTML = 'Create My Profile & Go to Dashboard';
        }
    });
});