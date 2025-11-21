document.addEventListener("DOMContentLoaded", () => {

    // This function will run as soon as the 'browse.html' page loads
    fetchMentors();

});

async function fetchMentors() {
    console.log("Fetching mentors...");
    const mentorGrid = document.getElementById('mentor-grid');

    if (!mentorGrid) return; // Safety check

    try {
        const response = await fetch(`${API_BASE_URL}/mentors`);

        if (!response.ok) {
            mentorGrid.innerHTML = `<p class="text-white-50">Error loading mentors.</p>`;
            return;
        }

        const mentors = await response.json();

        if (mentors.length === 0) {
            mentorGrid.innerHTML = `<p class="text-white-50">No mentors found. Check back soon!</p>`;
            return;
        }

        // Clear the grid before adding new cards
        mentorGrid.innerHTML = '';

        // Loop through each mentor and create a card
        mentors.forEach(mentor => {
            const col = document.createElement('div');
            col.className = 'col-md-6 col-lg-4';

            const card = document.createElement('div');
            card.className = 'card glass-modal h-100';

            const cardBody = document.createElement('div');
            cardBody.className = 'card-body text-center d-flex flex-column';

            // Image
            const img = document.createElement('img');
            img.src = `https://placehold.co/100x100/FFFFFF/00b4d8?text=${mentor.name.charAt(0)}`;
            img.className = 'rounded-circle mb-3 mx-auto';
            img.alt = mentor.name;
            img.style.width = '100px';
            img.style.height = '100px';
            cardBody.appendChild(img);

            // Name
            const h5 = document.createElement('h5');
            h5.className = 'card-title text-white';
            h5.textContent = mentor.name + ' ';
            const icon = document.createElement('i');
            icon.className = 'bi bi-patch-check-fill text-primary';
            icon.title = 'Verified';
            h5.appendChild(icon);
            cardBody.appendChild(h5);

            // Headline
            const pHeadline = document.createElement('p');
            pHeadline.className = 'text-cyan fw-bold';
            pHeadline.textContent = mentor.headline;
            cardBody.appendChild(pHeadline);

            // Bio
            const pBio = document.createElement('p');
            pBio.className = 'text-white-50 mb-4';
            pBio.textContent = mentor.bio ? (mentor.bio.substring(0, 100) + '...') : '';
            cardBody.appendChild(pBio);

            // Button
            const aBtn = document.createElement('a');
            aBtn.href = `profile.html?id=${mentor.user_id}`;
            aBtn.className = 'btn btn-outline-light mt-auto';
            aBtn.textContent = 'View Profile & Availability';
            cardBody.appendChild(aBtn);

            card.appendChild(cardBody);
            col.appendChild(card);
            mentorGrid.appendChild(col);
        });

    } catch (error) {
        console.error("Error fetching mentors:", error);
        mentorGrid.innerHTML = `<p class="text-white-50">Could not connect to the server.</p>`;
    }
}