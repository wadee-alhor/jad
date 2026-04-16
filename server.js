const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const SECRET_KEY = process.env.SECRET_KEY || "super_secret_wa_clone";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/wa_clone";

mongoose.connect(MONGO_URI).then(() => console.log("DB Connected")).catch(err => console.log(err));

// --- Database Schemas ---
const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    about: { type: String, default: "مرحباً أنا أستخدم واتساب" },
    friends: [{ type: String }]
});

const MessageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    text: String,
    time: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);

const auth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: "No token" });
    try {
        req.user = jwt.verify(token, SECRET_KEY);
        next();
    } catch { res.status(403).json({ error: "Invalid token" }); }
};

// --- APIs ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        await new User({ name, email, password: hashed }).save();
        res.json({ message: "Registered successfully" });
    } catch (err) {
        res.status(400).json({ error: "Email already exists" });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, SECRET_KEY);
    res.json({ token, name: user.name });
});

app.get('/api/search/:query', auth, async (req, res) => {
    const users = await User.find({ 
        $or: [{ name: { $regex: req.params.query } }, { email: { $regex: req.params.query } }],
        email: { $ne: req.user.email } 
    }).select('name email');
    res.json(users);
});

app.post('/api/add-friend', auth, async (req, res) => {
    const { friendEmail } = req.body;
    const friend = await User.findOne({ email: friendEmail });
    if(!friend) return res.status(404).json({error: "User not found"});
    
    await User.updateOne({ email: req.user.email }, { $addToSet: { friends: friendEmail } });
    await User.updateOne({ email: friendEmail }, { $addToSet: { friends: req.user.email } });
    res.json({ message: "Friend added" });
});

app.get('/api/friends', auth, async (req, res) => {
    const user = await User.findOne({ email: req.user.email });
    const friends = await User.find({ email: { $in: user.friends } }).select('name email about');
    res.json(friends);
});

app.get('/api/messages/:with', auth, async (req, res) => {
    const messages = await Message.find({
        $or: [
            { sender: req.user.email, receiver: req.params.with },
            { sender: req.params.with, receiver: req.user.email }
        ]
    }).sort({ time: 1 });
    res.json(messages);
});

// --- Socket.io for Realtime ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Auth error"));
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return next(new Error("Auth error"));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    socket.join(socket.user.email);
    
    socket.on('send-message', async (data) => {
        const newMsg = new Message({ sender: socket.user.email, receiver: data.to, text: data.text });
        await newMsg.save();
        io.to(data.to).emit('receive-message', newMsg);
    });

    socket.on('call-user', (data) => {
        io.to(data.to).emit('incoming-call', { signal: data.signalData, from: socket.user.name, fromEmail: socket.user.email });
    });

    socket.on('answer-call', (data) => {
        io.to(data.to).emit('call-accepted', data.signal);
    });

    socket.on('end-call', (data) => {
        io.to(data.to).emit('call-ended');
    });
});

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));