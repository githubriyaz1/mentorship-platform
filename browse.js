document.addEventListener("DOMContentLoaded", () => {
    
    // This function will run as soon as the 'browse.html' page loads
    fetchMentors();

});

async function fetchMentors() {
    console.log("Fetching mentors...");
    const mentorGrid = document.getElementById('mentor-grid');
    
    if (!mentorGrid) return; // Safety check

    try {
        const response = await fetch('http://localhost:3001/mentors');
        
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
            const mentorCardHTML = `
                <div class="col-md-6 col-lg-4">
                    <div class="card glass-modal h-100">
                        <div class="card-body text-center d-flex flex-column">
                            <img src="https://placehold.co/100x100/FFFFFF/00b4d8?text=${mentor.name.charAt(0)}" class="rounded-circle mb-3 mx-auto" alt="${mentor.name}" style="width: 100px; height: 100px;">
                            <h5 class="card-title text-white">
                                ${mentor.name} <i class="bi bi-patch-check-fill text-primary" title="Verified"></i>
                            </h5>
                            <p class="text-cyan fw-bold">${mentor.headline}</p>
                            <p class="text-white-50 mb-4">${mentor.bio ? mentor.bio.substring(0, 100) + '...' : ''}</p>
                            
                            <!-- Skills (we'll add this later) -->
                            
                            <!-- 
                              FIX: Link to profile.html with the mentor's user_id 
                            -->
                            <a href="profile.html?id=${mentor.user_id}" class="btn btn-outline-light mt-auto">View Profile & Availability</a>
                        </div>
                    </div>
                </div>
            `;
            
            // Add the new card to the grid
            mentorGrid.innerHTML += mentorCardHTML;
        });

    } catch (error) {
        console.error("Error fetching mentors:", error);
        mentorGrid.innerHTML = `<p class="text-white-50">Could not connect to the server.</p>`;
    }
}