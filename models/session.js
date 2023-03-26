const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
    expires: Date,
    lastModified: Date,
    session: {
        cookie: {
            originalMaxAge: Number,
            expires: Date,
            secure: {
                type: mongoose.Schema.Types.Mixed,
                enum: [true, false, "Auto"]
            },
            httpOnly: Boolean,
            domain: String,
            path: String,
            sameSite: {
                type: mongoose.Schema.Types.Mixed,
                enum: [true, false, 'Strict', 'Lax', 'None'],
            }
        },
        passport: {
            user: String
        }
    }
});

module.exports = Session = mongoose.model('Session', SessionSchema);