// server.js (FULL) — Roadalysis Backend (Node + Express + MongoDB)
// Supports BOTH:
// 1) ESP8266 style: GET /api/data?LATITUDE=...&LONGITUDE=...&VIBRATION=...&LEVEL=...&SPEED=...&token=12345
// 2) Mobile-app style (NEW): POST /api/data  with JSON body { latitude, longitude, jerk_value/vibration, level, speed, token, timestamp, t_nano }

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================
// DB CONNECT
// ============================================
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.log('❌ MongoDB Error:', err));

// ============================================
// SCHEMA + MODEL
// ============================================
const jerkDataSchema = new mongoose.Schema({
  latitude:  Number,
  longitude: Number,
  vibration: Number,     // stored value (jerk)
  level:     String,
  speed:     Number,
  token:     String,

  // Optional but useful for debugging alignment:
  t_nano:    Number,     // nano millis() when sample produced

  // App can pass timestamp; otherwise defaults to now
  timestamp: { type: Date, default: Date.now },
});

const JerkData = mongoose.model('JerkData', jerkDataSchema);

// ============================================
// API ENDPOINTS
// ============================================

/**
 * 0️⃣ NEW: Receive data from Mobile App (JSON POST)
 * Example body:
 * {
 *   "latitude": 28.45,
 *   "longitude": 77.02,
 *   "jerk_value": 1.2,
 *   "level": "Bad",
 *   "speed": 30,
 *   "token": "12345",
 *   "timestamp": "2026-05-03T16:30:00.000Z",
 *   "t_nano": 183976
 * }
 */
app.post('/api/data', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      jerk_value,   // preferred key from app
      vibration,    // allowed alias
      level,
      speed,
      token,
      timestamp,
      t_nano,
    } = req.body;

    // Token policy:
    // Option A (strict): require token for app too
    // if (token !== '12345') return res.status(401).json({ error: 'Invalid token' });

    // Option B (loose): allow missing token (current behavior)
    // (still accepts token if provided)

    const vib = (jerk_value ?? vibration);

    if (latitude == null || longitude == null || vib == null) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['latitude', 'longitude', 'jerk_value (or vibration)'],
      });
    }

    const newData = new JerkData({
      latitude:  parseFloat(latitude),
      longitude: parseFloat(longitude),
      vibration: parseFloat(vib),
      level:     level || 'UNKNOWN',
      speed:     parseFloat(speed) || 0,
      token:     token || 'app',
      t_nano:    t_nano != null ? Number(t_nano) : undefined,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    await newData.save();

    console.log('📍 Data received from APP:', {
      latitude: newData.latitude,
      longitude: newData.longitude,
      vibration: newData.vibration,
      level: newData.level,
      speed: newData.speed,
      t_nano: newData.t_nano,
      timestamp: newData.timestamp,
    });

    return res.json({
      status: 'success',
      message: 'Data saved to MongoDB',
      data: newData,
    });

  } catch (error) {
    console.error('❌ Error saving APP data:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * 1️⃣ Receive data from ESP8266 (querystring GET)
 * Example:
 * /api/data?LATITUDE=28.45&LONGITUDE=77.02&VIBRATION=1.2&LEVEL=MODERATE&SPEED=30&token=12345
 */
app.get('/api/data', async (req, res) => {
  try {
    const { LATITUDE, LONGITUDE, VIBRATION, LEVEL, SPEED, token } = req.query;

    // Validate token (kept strict for ESP)
    if (token !== '12345') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Validate required fields
    if (!LATITUDE || !LONGITUDE || !VIBRATION) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newData = new JerkData({
      latitude:  parseFloat(LATITUDE),
      longitude: parseFloat(LONGITUDE),
      vibration: parseFloat(VIBRATION),
      level:     LEVEL || 'UNKNOWN',
      speed:     parseFloat(SPEED) || 0,
      token:     token,
      timestamp: new Date(),
    });

    await newData.save();

    console.log('📍 Data received from ESP:', {
      lat: LATITUDE,
      lng: LONGITUDE,
      vibration: VIBRATION,
      level: LEVEL,
      speed: SPEED,
    });

    return res.json({
      status:  'success',
      message: 'Data saved to MongoDB',
      data:    newData,
    });

  } catch (error) {
    console.error('❌ Error saving ESP data:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * 2️⃣ Get all jerk data (for mobile app)
 */
app.get('/api/jerk-data', async (req, res) => {
  try {
    const data = await JerkData.find().sort({ timestamp: -1 }).limit(1000);

    const formattedData = data.map((item, index) => ({
      id:         item._id.toString(),
      latitude:   item.latitude,
      longitude:  item.longitude,
      jerk_value: item.vibration, // vibration → jerk_value for UI
      address:    item.level
                    ? `${item.level} — Loc ${index + 1}`
                    : `Location ${index + 1}`,
      level:      item.level,
      speed:      item.speed,
      timestamp:  item.timestamp,
      t_nano:     item.t_nano,
    }));

    console.log(`📊 Sending ${formattedData.length} records to app`);
    return res.json(formattedData);

  } catch (error) {
    console.error('❌ Error fetching data:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * 3️⃣ Get latest data only
 */
app.get('/api/latest', async (req, res) => {
  try {
    const latest = await JerkData.findOne().sort({ timestamp: -1 });
    if (!latest) return res.status(404).json({ message: 'No data found' });
    return res.json(latest);
  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * 4️⃣ Get stats summary
 */
app.get('/api/stats', async (req, res) => {
  try {
    const total = await JerkData.countDocuments();

    const stats = await JerkData.aggregate([
      {
        $group: {
          _id:     null,
          avgJerk: { $avg: '$vibration' },
          maxJerk: { $max: '$vibration' },
          minJerk: { $min: '$vibration' },
          total:   { $sum: 1 },
        },
      },
    ]);

    const levelCounts = await JerkData.aggregate([
      { $group: { _id: '$level', count: { $sum: 1 } } },
    ]);

    return res.json({
      total,
      stats: stats[0] || {},
      levelCounts,
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * 5️⃣ Delete a record
 */
app.delete('/api/data/:id', async (req, res) => {
  try {
    const deleted = await JerkData.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Record not found' });
    return res.json({ status: 'success', message: 'Data deleted' });
  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * 6️⃣ Delete ALL data (use carefully)
 */
app.delete('/api/data', async (req, res) => {
  try {
    const result = await JerkData.deleteMany({});
    return res.json({
      status:  'success',
      message: `Deleted ${result.deletedCount} records`,
    });
  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * 7️⃣ Health check
 */
app.get('/api/health', async (req, res) => {
  try {
    const total = await JerkData.countDocuments();
    const latest = await JerkData.findOne().sort({ timestamp: -1 });

    return res.json({
      status:        'Server is running ✅',
      timestamp:     new Date().toISOString(),
      database:      mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌',
      totalRecords:  total,
      lastDataAt:    latest?.timestamp || 'No data yet',
      endpoints: {
        data_post_app: 'POST /api/data (JSON body)',
        data_get_esp:  'GET /api/data?LATITUDE=&LONGITUDE=&VIBRATION=&LEVEL=&SPEED=&token=12345',
        fetch:         'GET /api/jerk-data',
        latest:        'GET /api/latest',
        stats:         'GET /api/stats',
        health:        'GET /api/health',
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'Error', error: error.message });
  }
});

// ============================================
// LISTEN
// ============================================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('🚀 ================================');
  console.log(`🚀  Server running on ${HOST}:${PORT}`);
  console.log('🚀 ================================');
  console.log('');
  console.log('🖥️  Local URLs:');
  console.log(`   Health:  http://127.0.0.1:${PORT}/api/health`);
  console.log(`   Data:    http://127.0.0.1:${PORT}/api/jerk-data`);
  console.log('');
});