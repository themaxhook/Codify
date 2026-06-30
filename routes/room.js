const express = require('express');
const router = express.Router();
const Room = require('../models/Room');

// Save room code permanently
router.post('/save', async (req, res) => {
    try {
        const { roomId, code, language } = req.body;

        if (!roomId) {
            return res.status(400).json({ error: 'roomId is required' });
        }

        // upsert = update if exists, create if not
        const room = await Room.findOneAndUpdate(
            { roomId },
            { code, language, savedAt: Date.now() },
            { upsert: true, new: true }
        );

        res.json({ success: true, room });
    } catch (err) {
        console.error('Save error:', err);
        res.status(500).json({ error: 'Failed to save room' });
    }
});

// Fetch saved room code (fallback when Redis is empty)
router.get('/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await Room.findOne({ roomId });

        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        res.json({ success: true, room });
    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch room' });
    }
});

module.exports = router;