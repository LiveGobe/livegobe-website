const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    imageLink: {
        type: String,
        default: ""
    },
    mods: [{
        name: {
            type: String,
            required: true
        },
        modId: {
            type: String
        },
        author: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        versions: [{
            version: {
                type: String,
                required: true
            },
            gameVersion: {
                type: String
            },
            uploadedAt: {
                type: Date,
                required: true,
                default: new Date()
            }
        }],
        tags: [String],
        iconLink: {
            type: String,
            default: ""
        }
    }]
});

module.exports = ModsPortalGame = mongoose.model('modsportalgame', GameSchema);