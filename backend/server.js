// --- 1. Import Packages ---
require('dotenv').config(); // Load environment variables
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const xss = require('xss'); // Import xss for sanitization

// --- 2. Setup App ---
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in .env');
    process.exit(1);
}

// --- 3. Setup Middleware ---
app.use(cors());
app.use(express.json());

// --- 4. MySQL Database Connection ---
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
}).promise();

console.log(`✅ Connected to MySQL database (${process.env.DB_NAME})`);


// --- 5. Auth Middleware (Bouncers) ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (token == null) return res.status(401).json({ message: 'No token provided.' });
    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) return res.status(403).json({ message: 'Invalid token.' });
        req.user = userPayload;
        next();
    });
};

const adminBouncer = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access forbidden. Admins only.' });
    }
    next(); // They are an admin, let them pass
};

// --- Validation Helpers ---
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    // Min 8 chars, at least one letter and one number
    const re = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    return re.test(password);
}


// --- 6. API Routes (ALL must be before app.listen) ---
app.get('/', (req, res) => { res.json({ message: '👋 Welcome to the MentorConnect API!' }); });

// === User Registration Route ===
app.post('/register', async (req, res) => {
    // Sanitize inputs
    const name = xss(req.body.name);
    const email = xss(req.body.email);
    const password = req.body.password; // Don't sanitize password, we hash it
    const role = xss(req.body.role);

    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: 'Please provide all fields.' });
    }

    if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format.' });
    }

    if (!validatePassword(password)) {
        return res.status(400).json({ message: 'Password must be at least 8 characters long and contain at least one letter and one number.' });
    }

    try {
        let verificationStatus = 'verified';
        if (role === 'mentor') {
            verificationStatus = 'pending';
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const query = 'INSERT INTO Users (name, email, password_hash, role, verification_status) VALUES (?, ?, ?, ?, ?)';
        const values = [name, email, password_hash, role, verificationStatus];

        const [results] = await dbPool.query(query, values);
        console.log('User registered:', results.insertId);

        return res.status(201).json({ message: 'User registered successfully!', userId: results.insertId });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Email already exists.' });
        }
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error during registration.' });
    }
});

// === User Login Route ===
app.post('/login', async (req, res) => {
    const email = xss(req.body.email);
    const password = req.body.password;

    if (!email || !password) { return res.status(400).json({ message: 'Please provide email and password.' }); }
    try {
        const query = 'SELECT * FROM Users WHERE email = ?';
        const [results] = await dbPool.query(query, [email]);
        if (results.length === 0) { return res.status(404).json({ message: 'User not found.' }); }

        const user = results[0];

        if (user.role === 'mentor' && user.verification_status !== 'verified') {
            return res.status(401).json({ message: 'Your mentor account is still pending approval.' });
        }
        const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordMatch) { return res.status(401).json({ message: 'Invalid credentials.' }); }

        const payload = { userId: user.user_id, role: user.role, name: user.name };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
        console.log(`User ${user.email} logged in successfully.`);
        return res.status(200).json({ message: 'Login successful!', token: token, name: user.name, role: user.role });
    } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Get All Verified Mentors Route ===
app.get('/mentors', async (req, res) => {
    const query = `
        SELECT u.user_id, u.name, mp.headline, mp.bio,
            (SELECT COUNT(*) FROM Mentorship_Sessions ms WHERE ms.mentor_id = u.user_id AND ms.status = 'completed') as completed_sessions
        FROM Users u
        JOIN Mentor_Profiles mp ON u.user_id = mp.user_id
        WHERE u.role = 'mentor' AND u.verification_status = 'verified';
    `;
    try {
        const [results] = await dbPool.query(query);
        return res.status(200).json(results);
    } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error fetching mentors.' });
    }
});

// === Get ONE Mentor's Profile Route ===
app.get('/mentor/:id', async (req, res) => {
    const mentorId = req.params.id;
    if (!mentorId) { return res.status(400).json({ message: 'Mentor ID is required.' }); }
    try {
        const profileQuery = `
            SELECT u.user_id, u.name, mp.headline, mp.bio, mp.linkedin_url
            FROM Users u JOIN Mentor_Profiles mp ON u.user_id = mp.user_id
            WHERE u.user_id = ? AND u.role = 'mentor' AND u.verification_status = 'verified';
        `;
        const sessionsQuery = `
            SELECT session_id, start_time, duration_minutes, fee
            FROM Mentorship_Sessions
            WHERE mentor_id = ? AND status = 'available' AND start_time > NOW()
            ORDER BY start_time ASC;
        `;
        const feedbackQuery = `
            SELECT f.score, f.comments, u.name as rater_name
            FROM Feedback f
            JOIN Users u ON f.rater_id = u.user_id
            WHERE f.ratee_id = ?
            ORDER BY f.created_at DESC;
        `;
        const [profileResults] = await dbPool.query(profileQuery, [mentorId]);
        const [sessionsResults] = await dbPool.query(sessionsQuery, [mentorId]);
        const [feedbackResults] = await dbPool.query(feedbackQuery, [mentorId]);
        if (profileResults.length === 0) { return res.status(404).json({ message: 'Mentor not found or not verified.' }); }
        const mentorData = {
            profile: profileResults[0],
            sessions: sessionsResults,
            feedback: feedbackResults
        };
        return res.status(200).json(mentorData);
    } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Get Session Details Route ===
app.get('/session-details/:id', authenticateToken, async (req, res) => {
    const sessionId = req.params.id;
    const query = `
        SELECT 
            ms.session_id, ms.start_time, ms.fee, u.name as mentor_name
        FROM Mentorship_Sessions ms
        JOIN Users u ON ms.mentor_id = u.user_id
        WHERE ms.session_id = ? AND ms.status = 'available';
    `;
    try {
        const [results] = await dbPool.query(query, [sessionId]);
        if (results.length === 0) {
            return res.status(404).json({ message: 'Session not found or is no longer available.' });
        }
        return res.status(200).json(results[0]);
    } catch (err) {
        console.error('Session details error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Book a Session Route ===
app.post('/book', authenticateToken, async (req, res) => {
    const menteeId = req.user.userId;
    const menteeRole = req.user.role;
    const { sessionId } = req.body;
    if (menteeRole !== 'mentee') { return res.status(403).json({ message: 'Only mentees can book sessions.' }); }
    if (!sessionId) { return res.status(400).json({ message: 'Session ID is required.' }); }
    const connection = await dbPool.getConnection();
    await connection.beginTransaction();
    try {
        const sessionQuery = 'SELECT * FROM Mentorship_Sessions WHERE session_id = ? AND status = "available" FOR UPDATE';
        const [sessionResults] = await connection.query(sessionQuery, [sessionId]);
        if (sessionResults.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({ message: 'Session just became unavailable.' });
        }
        const updateQuery = `UPDATE Mentorship_Sessions SET mentee_id = ?, status = 'booked' WHERE session_id = ?`;
        await connection.query(updateQuery, [menteeId, sessionId]);
        const bookingQuery = `INSERT INTO Bookings (session_id, mentee_id, payment_status) VALUES (?, ?, 'paid');`;
        const [bookingResults] = await connection.query(bookingQuery, [sessionId, menteeId]);
        await connection.commit();
        connection.release();
        return res.status(200).json({ message: 'Session booked successfully!', bookingId: bookingResults.insertId });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('Booking error:', err);
        return res.status(500).json({ message: 'Server error during booking.' });
    }
});

// === Get Mentee's Bookings Route ===
app.get('/my-bookings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentee') { return res.status(403).json({ message: 'Access forbidden.' }); }
    const menteeId = req.user.userId;
    const query = `
        SELECT 
            ms.session_id, b.booking_id, ms.start_time, ms.status, u.name as mentor_name,
            (SELECT COUNT(*) FROM Feedback f WHERE f.session_id = ms.session_id AND f.rater_id = ?) as feedback_given
        FROM Mentorship_Sessions ms
        JOIN Users u ON ms.mentor_id = u.user_id
        JOIN Bookings b ON b.session_id = ms.session_id AND b.mentee_id = ms.mentee_id
        WHERE ms.mentee_id = ? AND (ms.status = 'booked' OR ms.status = 'completed' OR ms.status = 'canceled' OR ms.status = 'pending_cancellation')
        ORDER BY ms.start_time ASC;
    `;
    try {
        const [results] = await dbPool.query(query, [menteeId, menteeId]);
        return res.status(200).json(results);
    } catch (err) {
        console.error('Dashboard error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Get Mentor's Sessions Route ===
app.get('/my-sessions', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') { return res.status(403).json({ message: 'Access forbidden.' }); }
    const mentorId = req.user.userId;
    const query = `
        SELECT ms.session_id, ms.start_time, ms.status, u.name as mentee_name
        FROM Mentorship_Sessions ms
        LEFT JOIN Users u ON ms.mentee_id = u.user_id
        WHERE ms.mentor_id = ? AND ms.status IN ('booked', 'available', 'completed', 'pending_cancellation')
        ORDER BY ms.start_time ASC;
    `;
    try {
        const [results] = await dbPool.query(query, [mentorId]);
        return res.status(200).json(results);
    } catch (err) {
        console.error('Dashboard error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Mentor Create Session Route ===
app.post('/create-session', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') { return res.status(403).json({ message: 'Access forbidden. Only mentors can create sessions.' }); }
    const mentorId = req.user.userId;
    const { startTime, duration, fee } = req.body;
    if (!startTime) { return res.status(400).json({ message: 'Start time is required.' }); }

    // Validate start time is in the future
    const sessionDate = new Date(startTime);
    if (sessionDate <= new Date()) {
        return res.status(400).json({ message: 'Session start time must be in the future.' });
    }

    const query = `
        INSERT INTO Mentorship_Sessions (mentor_id, start_time, duration_minutes, fee, status)
        VALUES (?, ?, ?, ?, 'available');
    `;
    const sessionDuration = duration || 60;
    const sessionFee = fee || 0.00;
    try {
        const [results] = await dbPool.query(query, [mentorId, startTime, sessionDuration, sessionFee]);
        res.status(201).json({
            message: 'Session created successfully!',
            newSession: { session_id: results.insertId, start_time: startTime, status: 'available', mentee_name: null }
        });
    } catch (err) {
        console.error('Create session error:', err);
        return res.status(500).json({ message: 'Server error creating session.' });
    }
});

// === Mark Session as Complete ===
app.post('/complete-session', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') { return res.status(403).json({ message: 'Access forbidden.' }); }
    const mentorId = req.user.userId;
    const { sessionId } = req.body;
    if (!sessionId) { return res.status(400).json({ message: 'Session ID is required.' }); }
    try {
        const [results] = await dbPool.query(
            'UPDATE Mentorship_Sessions SET status = "completed" WHERE session_id = ? AND mentor_id = ? AND status = "booked"',
            [sessionId, mentorId]
        );
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Session not found or not in "booked" state.' });
        }
        return res.status(200).json({ message: 'Session marked as complete.' });
    } catch (err) {
        console.error('Complete session error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Mentor Request Cancellation Route ===
app.post('/request-cancellation', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') {
        return res.status(403).json({ message: 'Access forbidden.' });
    }
    const mentorId = req.user.userId;
    const { sessionId, reason } = req.body;
    if (!sessionId || !reason) {
        return res.status(400).json({ message: 'Session ID and reason are required.' });
    }

    // Sanitize reason
    const sanitizedReason = xss(reason);

    const connection = await dbPool.getConnection();
    await connection.beginTransaction();
    try {
        const [session] = await connection.query(
            'SELECT * FROM Mentorship_Sessions WHERE session_id = ? AND mentor_id = ? AND status = "booked"',
            [sessionId, mentorId]
        );
        if (session.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ message: 'Session not found or not in "booked" state.' });
        }
        await connection.query(
            'UPDATE Mentorship_Sessions SET status = "pending_cancellation" WHERE session_id = ?',
            [sessionId]
        );
        await connection.query(
            'INSERT INTO Cancellation_Requests (session_id, mentor_id, reason) VALUES (?, ?, ?)',
            [sessionId, mentorId, sanitizedReason]
        );
        await connection.commit();
        connection.release();
        return res.status(200).json({ message: 'Cancellation request submitted to admin.' });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('Cancel request error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Mentor Delete Available Slot Route ===
app.delete('/delete-slot/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') { return res.status(403).json({ message: 'Access forbidden.' }); }
    const mentorId = req.user.userId;
    const sessionId = req.params.id;

    try {
        const [results] = await dbPool.query(
            'DELETE FROM Mentorship_Sessions WHERE session_id = ? AND mentor_id = ? AND status = "available"',
            [sessionId, mentorId]
        );
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Slot not found or not available.' });
        }
        return res.status(200).json({ message: 'Slot deleted successfully.' });
    } catch (err) {
        console.error('Delete slot error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Create/Update Mentor Profile Route ===
app.post('/create-profile', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') { return res.status(403).json({ message: 'Access forbidden.' }); }
    const mentorId = req.user.userId;
    const { headline, bio, linkedin_url } = req.body;
    if (!headline || !bio) { return res.status(400).json({ message: 'Headline and Bio are required.' }); }

    // Sanitize inputs
    const sanitizedHeadline = xss(headline);
    const sanitizedBio = xss(bio);
    const sanitizedLinkedin = xss(linkedin_url);

    try {
        const query = `
            INSERT INTO Mentor_Profiles (user_id, headline, bio, linkedin_url)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE headline = VALUES(headline), bio = VALUES(bio), linkedin_url = VALUES(linkedin_url)
        `;
        await dbPool.query(query, [mentorId, sanitizedHeadline, sanitizedBio, sanitizedLinkedin]);
        return res.status(201).json({ message: 'Profile updated successfully!' });
    } catch (err) {
        console.error('Profile error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Check if Mentor Has Profile Route ===
app.get('/check-profile', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') { return res.status(403).json({ message: 'Access forbidden.' }); }
    const mentorId = req.user.userId;
    try {
        const [results] = await dbPool.query('SELECT * FROM Mentor_Profiles WHERE user_id = ?', [mentorId]);
        return res.status(200).json({ hasProfile: results.length > 0 });
    } catch (err) {
        console.error('Check profile error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Submit Feedback Route ===
app.post('/submit-feedback', authenticateToken, async (req, res) => {
    const raterId = req.user.userId;
    const { sessionId, score, comments } = req.body;
    if (req.user.role !== 'mentee') { return res.status(403).json({ message: 'Only mentees can leave feedback.' }); }
    if (!sessionId || !score) { return res.status(400).json({ message: 'Session ID and score are required.' }); }

    // Sanitize comments
    const sanitizedComments = xss(comments);

    try {
        const sessionQuery = 'SELECT mentor_id FROM Mentorship_Sessions WHERE session_id = ? AND mentee_id = ? AND status = "completed"';
        const [sessionResults] = await dbPool.query(sessionQuery, [sessionId, raterId]);
        if (sessionResults.length === 0) {
            return res.status(404).json({ message: 'You cannot review this session. It must be completed.' });
        }
        const rateeId = sessionResults[0].mentor_id;
        const duplicateCheckQuery = 'SELECT feedback_id FROM Feedback WHERE session_id = ? AND rater_id = ?';
        const [duplicateResults] = await dbPool.query(duplicateCheckQuery, [sessionId, raterId]);
        if (duplicateResults.length > 0) {
            return res.status(409).json({ message: 'You have already reviewed this session.' });
        }
        const insertQuery = 'INSERT INTO Feedback (session_id, rater_id, ratee_id, score, comments) VALUES (?, ?, ?, ?, ?)';
        await dbPool.query(insertQuery, [sessionId, raterId, rateeId, score, sanitizedComments]);
        return res.status(201).json({ message: 'Feedback submitted successfully!' });
    } catch (err) {
        console.error('Feedback error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Raise a Dispute Route ===
app.post('/raise-dispute', authenticateToken, async (req, res) => {
    const raisedById = req.user.userId;
    const { bookingId, reason } = req.body;
    if (!bookingId || !reason) { return res.status(400).json({ message: 'Booking ID and reason are required.' }); }

    // Sanitize reason
    const sanitizedReason = xss(reason);

    const bookingQuery = 'SELECT * FROM Bookings WHERE booking_id = ? AND mentee_id = ?';
    const [bookingResults] = await dbPool.query(bookingQuery, [bookingId, raisedById]);
    if (bookingResults.length === 0) {
        return res.status(403).json({ message: 'You cannot raise a dispute for this booking.' });
    }
    const duplicateQuery = 'SELECT * FROM Disputes WHERE booking_id = ?';
    const [dupResults] = await dbPool.query(duplicateQuery, [bookingId]);
    if (dupResults.length > 0) {
        return res.status(409).json({ message: 'A dispute for this booking already exists.' });
    }
    const insertQuery = 'INSERT INTO Disputes (booking_id, raised_by_id, reason) VALUES (?, ?, ?)';
    try {
        await dbPool.query(insertQuery, [bookingId, raisedById, sanitizedReason]);
        return res.status(201).json({ message: 'Dispute raised successfully.' });
    } catch (err) {
        console.error('Dispute error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin: Get Pending Mentors ===
app.get('/admin/pending-mentors', authenticateToken, adminBouncer, async (req, res) => {
    try {
        const [results] = await dbPool.query('SELECT user_id, name, email, created_at FROM Users WHERE role = "mentor" AND verification_status = "pending"');
        res.status(200).json(results);
    } catch (err) {
        console.error('Admin pending mentors error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin: Verify Mentor ===
app.post('/admin/verify-mentor', authenticateToken, adminBouncer, async (req, res) => {
    const { mentorId } = req.body;
    if (!mentorId) { return res.status(400).json({ message: 'Mentor ID is required.' }); }
    try {
        await dbPool.query('UPDATE Users SET verification_status = "verified" WHERE user_id = ?', [mentorId]);
        res.status(200).json({ message: 'Mentor verified successfully.' });
    } catch (err) {
        console.error('Admin verify mentor error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin: Get Open Disputes ===
app.get('/admin/open-disputes', authenticateToken, adminBouncer, async (req, res) => {
    try {
        const query = `
            SELECT d.dispute_id, d.reason, u.name as mentee_name
            FROM Disputes d
            JOIN Users u ON d.raised_by_id = u.user_id
            WHERE d.status = 'open';
        `;
        const [results] = await dbPool.query(query);
        res.status(200).json(results);
    } catch (err) {
        console.error('Admin disputes error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin: Resolve Dispute ===
app.post('/admin/resolve-dispute', authenticateToken, adminBouncer, async (req, res) => {
    const adminId = req.user.userId;
    const { disputeId, resolutionNotes } = req.body;
    if (!disputeId || !resolutionNotes) { return res.status(400).json({ message: 'Dispute ID and resolution notes are required.' }); }

    // Sanitize notes
    const sanitizedNotes = xss(resolutionNotes);

    const query = `
        UPDATE Disputes
        SET status = 'resolved', resolved_by_admin_id = ?, resolution_notes = ?
        WHERE dispute_id = ? AND status = 'open';
    `;
    try {
        const [results] = await dbPool.query(query, [adminId, sanitizedNotes, disputeId]);
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Dispute not found or already resolved.' });
        }
        return res.status(200).json({ message: 'Dispute resolved.' });
    } catch (err) {
        console.error('Admin resolve dispute error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin: Get Cancellation Requests ===
app.get('/admin/cancellation-requests', authenticateToken, adminBouncer, async (req, res) => {
    try {
        const query = `
            SELECT cr.request_id, cr.session_id, cr.reason, u.name as mentor_name
            FROM Cancellation_Requests cr
            JOIN Users u ON cr.mentor_id = u.user_id
            WHERE cr.status = 'pending';
        `;
        const [results] = await dbPool.query(query);
        res.status(200).json(results);
    } catch (err) {
        console.error('Admin cancellation requests error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin: Approve Cancellation ===
app.post('/admin/approve-cancellation', authenticateToken, adminBouncer, async (req, res) => {
    const adminId = req.user.userId;
    const { requestId, adminNotes } = req.body;
    if (!requestId) { return res.status(400).json({ message: 'Request ID is required.' }); }

    // Sanitize notes
    const sanitizedNotes = xss(adminNotes);

    const connection = await dbPool.getConnection();
    await connection.beginTransaction();
    try {
        const [reqResult] = await connection.query('SELECT * FROM Cancellation_Requests WHERE request_id = ?', [requestId]);
        if (reqResult.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ message: 'Request not found.' });
        }
        const sessionId = reqResult[0].session_id;

        await connection.query(
            'UPDATE Cancellation_Requests SET status = "approved", resolved_by_admin_id = ?, admin_notes = ? WHERE request_id = ?',
            [adminId, sanitizedNotes, requestId]
        );
        await connection.query(
            'UPDATE Mentorship_Sessions SET status = "canceled" WHERE session_id = ?',
            [sessionId]
        );
        await connection.commit();
        connection.release();
        return res.status(200).json({ message: 'Cancellation approved.' });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('Admin approve cancellation error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin: Get Stats ===
app.get('/admin/stats', authenticateToken, adminBouncer, async (req, res) => {
    try {
        const [mentees] = await dbPool.query('SELECT COUNT(*) as count FROM Users WHERE role = "mentee"');
        const [mentors] = await dbPool.query('SELECT COUNT(*) as count FROM Users WHERE role = "mentor"');
        const [sessions] = await dbPool.query('SELECT COUNT(*) as count FROM Mentorship_Sessions WHERE status = "completed"');
        const [revenue] = await dbPool.query('SELECT SUM(fee) as total FROM Mentorship_Sessions WHERE status = "completed"');

        res.status(200).json({
            totalMentees: mentees[0].count,
            totalMentors: mentors[0].count,
            totalSessions: sessions[0].count,
            totalRevenue: revenue[0].total || 0
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// --- 7. Start Server ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});