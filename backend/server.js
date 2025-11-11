// --- 1. Import Packages ---
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- 2. Setup App ---
const app = express();
const PORT = 3001;
const JWT_SECRET = 'my-super-secret-key-for-mentorship-app';

// --- 3. Setup Middleware ---
app.use(cors());
app.use(express.json());

// --- 4. MySQL Database Connection ---
const dbPool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Allahuakbar@786', // Your password
    database: 'mentorship_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
}).promise(); // Use .promise() to enable async/await

console.log('✅ Connected to MySQL database (mentorship_db)');


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


// --- 6. API Routes (ALL must be before app.listen) ---
app.get('/', (req, res) => { res.json({ message: '👋 Welcome to the MentorConnect API!' }); });

// === User Registration Route ===
app.post('/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) { return res.status(400).json({ message: 'Please provide all fields.' }); }
    try {
        let verificationStatus = 'verified'; 
        if (role === 'mentor') {
            verificationStatus = 'pending'; 
        }
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const query = 'INSERT INTO Users (name, email, password_hash, role, verification_status) VALUES (?, ?, ?, ?, ?)';
        const values = [name, email, password_hash, role, verificationStatus];
        const [results] = await dbPool.query(query, values);
        console.log('User registered:', results.insertId);
        return res.status(201).json({ message: 'User registered successfully!', userId: results.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') { return res.status(400).json({ message: 'Email already exists.' }); }
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Server error during registration.' });
    }
});

// === User Login Route ===
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
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
        if(sessionResults.length === 0) {
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
        return res.status(500).json({ message: 'Server error creating session.' }); // <-- THE FIX IS HERE
    }
});

// === Mark Session as Complete ===
app.post('/complete-session', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') { return res.status(403).json({ message: 'Access forbidden.' }); }
    const mentorId = req.user.userId;
    const { sessionId } = req.body;
    if (!sessionId) { return res.status(400).json({ message: 'Session ID is required.' }); }
    const query = `
        UPDATE Mentorship_Sessions
        SET status = 'completed'
        WHERE session_id = ? AND mentor_id = ? AND status = 'booked';
    `;
    try {
        const [results] = await dbPool.query(query, [sessionId, mentorId]);
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Session not found or not in "booked" state.' });
        }
        return res.status(200).json({ message: 'Session marked as complete!' });
    } catch (err) {
        console.error('Complete session error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Mentor Request Cancellation ===
app.post('/request-cancellation', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') {
        return res.status(403).json({ message: 'Access forbidden.' });
    }
    const mentorId = req.user.userId;
    const { sessionId, reason } = req.body;
    if (!sessionId || !reason) {
        return res.status(400).json({ message: 'Session ID and reason are required.' });
    }
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
            [sessionId, mentorId, reason]
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

// === Mentor Delete Available Slot ===
app.delete('/delete-slot/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') {
        return res.status(403).json({ message: 'Access forbidden.' });
    }
    const mentorId = req.user.userId;
    const sessionId = req.params.id;
    if (!sessionId) {
        return res.status(400).json({ message: 'Session ID is required.' });
    }
    const query = `
        DELETE FROM Mentorship_Sessions
        WHERE session_id = ? AND mentor_id = ? AND status = 'available';
    `;
    try {
        const [results] = await dbPool.query(query, [sessionId, mentorId]);
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Slot not found, already booked, or you do not own it.' });
        }
        return res.status(200).json({ message: 'Available slot deleted successfully.' });
    } catch (err) {
        console.error('Delete slot error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin Route - Get Pending Mentors ===
app.get('/admin/pending-mentors', authenticateToken, adminBouncer, async (req, res) => {
    const query = `
        SELECT user_id, name, email, created_at
        FROM Users
        WHERE role = 'mentor' AND verification_status = 'pending'
        ORDER BY created_at ASC;
    `;
    try {
        const [results] = await dbPool.query(query);
        return res.status(200).json(results);
    } catch (err) {
        console.error('Admin fetch error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin Route - Verify a Mentor ===
app.post('/admin/verify-mentor', authenticateToken, adminBouncer, async (req, res) => {
    const { mentorId } = req.body;
    if (!mentorId) { return res.status(400).json({ message: 'Mentor ID is required.' }); }
    const query = `
        UPDATE Users
        SET verification_status = 'verified'
        WHERE user_id = ? AND role = 'mentor';
    `;
    try {
        const [results] = await dbPool.query(query, [mentorId]);
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Mentor not found or already verified.' });
        }
        return res.status(200).json({ message: 'Mentor verified successfully!' });
    } catch (err) {
        console.error('Admin verify error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Submit Feedback ===
app.post('/submit-feedback', authenticateToken, async (req, res) => {
    const raterId = req.user.userId;
    const { sessionId, score, comments } = req.body;
    if (req.user.role !== 'mentee') { return res.status(403).json({ message: 'Only mentees can leave feedback.' }); }
    if (!sessionId || !score) { return res.status(400).json({ message: 'Session ID and score are required.' }); }
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
        await dbPool.query(insertQuery, [sessionId, raterId, rateeId, score, comments]);
        return res.status(201).json({ message: 'Feedback submitted successfully!' });
    } catch (err) {
        console.error('Feedback error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Raise a Dispute ===
app.post('/raise-dispute', authenticateToken, async (req, res) => {
    const raisedById = req.user.userId;
    const { bookingId, reason } = req.body;
    if (!bookingId || !reason) { return res.status(400).json({ message: 'Booking ID and reason are required.' }); }
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
        await dbPool.query(insertQuery, [bookingId, raisedById, reason]);
        return res.status(201).json({ message: 'Dispute raised successfully.' });
    } catch (err) {
        console.error('Dispute error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin Get Open Disputes ===
app.get('/admin/open-disputes', authenticateToken, adminBouncer, async (req, res) => {
    const query = `
        SELECT d.dispute_id, d.booking_id, d.reason, d.created_at, u.name as mentee_name
        FROM Disputes d
        JOIN Users u ON d.raised_by_id = u.user_id
        WHERE d.status = 'open'
        ORDER BY d.created_at ASC;
    `;
    try {
        const [results] = await dbPool.query(query);
        return res.status(200).json(results);
    } catch (err) {
        console.error('Dispute fetch error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin Resolve Dispute ===
app.post('/admin/resolve-dispute', authenticateToken, adminBouncer, async (req, res) => {
    const adminId = req.user.userId;
    const { disputeId, resolutionNotes } = req.body;
    if (!disputeId || !resolutionNotes) { return res.status(400).json({ message: 'Dispute ID and resolution notes are required.' }); }
    const query = `
        UPDATE Disputes
        SET status = 'resolved', resolved_by_admin_id = ?, resolution_notes = ?
        WHERE dispute_id = ? AND status = 'open';
    `;
    try {
        const [results] = await dbPool.query(query, [adminId, resolutionNotes, disputeId]);
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Dispute not found or already resolved.' });
        }
        return res.status(200).json({ message: 'Dispute resolved.' });
    } catch (err) {
        console.error('Dispute resolve error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin Get Stats ===
app.get('/admin/stats', authenticateToken, adminBouncer, async (req, res) => {
    try {
        const queries = `
            SELECT COUNT(*) as totalMentees FROM Users WHERE role = 'mentee';
            SELECT COUNT(*) as totalMentors FROM Users WHERE role = 'mentor' AND verification_status = 'verified';
            SELECT COUNT(*) as totalSessions FROM Mentorship_Sessions WHERE status = 'completed';
            SELECT SUM(fee) as totalRevenue FROM Mentorship_Sessions WHERE status = 'completed';
        `;
        const [results] = await dbPool.query(queries);
        const stats = {
            totalMentees: results[0][0].totalMentees,
            totalMentors: results[1][0].totalMentors,
            totalSessions: results[2][0].totalSessions,
            totalRevenue: results[3][0].totalRevenue || 0
        };
        return res.status(200).json(stats);
    } catch (err) {
        console.error('Admin stats error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Check if Mentor Profile Exists ===
app.get('/check-profile', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') {
        return res.status(403).json({ message: 'Not a mentor.' });
    }
    const mentorId = req.user.userId;
    const query = 'SELECT * FROM Mentor_Profiles WHERE user_id = ?';
    try {
        const [results] = await dbPool.query(query, [mentorId]);
        if (results.length > 0) {
            return res.status(200).json({ hasProfile: true });
        } else {
            return res.status(200).json({ hasProfile: false });
        }
    } catch (err) {
        console.error('Check profile error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Mentor Create Profile ===
app.post('/create-profile', authenticateToken, async (req, res) => {
    if (req.user.role !== 'mentor') {
        return res.status(403).json({ message: 'Only mentors can create a profile.' });
    }
    const mentorId = req.user.userId;
    const { headline, bio, linkedin_url } = req.body;
    if (!headline || !bio) {
        return res.status(400).json({ message: 'Headline and bio are required.' });
    }
    const query = 'INSERT INTO Mentor_Profiles (user_id, headline, bio, linkedin_url) VALUES (?, ?, ?, ?)';
    try {
        await dbPool.query(query, [mentorId, headline, bio, linkedin_url]);
        return res.status(201).json({ message: 'Profile created successfully!' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Profile already exists.' });
        }
        console.error('Create profile error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin Get Cancellation Requests ===
app.get('/admin/cancellation-requests', authenticateToken, adminBouncer, async (req, res) => {
    const query = `
        SELECT cr.request_id, cr.session_id, cr.reason, u.name as mentor_name
        FROM Cancellation_Requests cr
        JOIN Users u ON cr.mentor_id = u.user_id
        WHERE cr.status = 'pending';
    `;
    try {
        const [results] = await dbPool.query(query);
        return res.status(200).json(results);
    } catch (err) {
        console.error('Fetch cancellation requests error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});

// === Admin Approve Cancellation ===
app.post('/admin/approve-cancellation', authenticateToken, adminBouncer, async (req, res) => {
    const adminId = req.user.userId;
    const { requestId, adminNotes } = req.body;
    if (!requestId) {
        return res.status(400).json({ message: 'Request ID is required.' });
    }
    const connection = await dbPool.getConnection();
    await connection.beginTransaction();
    try {
        const [reqResults] = await connection.query(
            'SELECT * FROM Cancellation_Requests WHERE request_id = ? AND status = "pending" FOR UPDATE',
            [requestId]
        );
        if (reqResults.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ message: 'Request not found or already handled.' });
        }
        const request = reqResults[0];
        await connection.query(
            'UPDATE Cancellation_Requests SET status = "approved", resolved_by_admin_id = ?, admin_notes = ? WHERE request_id = ?',
            [adminId, adminNotes, requestId]
        );
        await connection.query(
            'UPDATE Mentorship_Sessions SET status = "canceled", cancellation_reason = ? WHERE session_id = ?',
            [request.reason, request.session_id]
        );
        await connection.query(
            'UPDATE Bookings SET payment_status = "refunded" WHERE session_id = ?',
            [request.session_id]
        );
        await connection.commit();
        connection.release();
        return res.status(200).json({ message: 'Cancellation approved.' });
    } catch (err) {
        await connection.rollback();
        connection.release();
        console.error('Approve cancellation error:', err);
        return res.status(500).json({ message: 'Server error.' });
    }
});


// --- 7. Start The Server (MUST BE LAST) ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});