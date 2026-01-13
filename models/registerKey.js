const mongoose = require('mongoose');
const uuid = require("uuid");

const RegisterKeySchema = new mongoose.Schema({
    key: {
        type: String,
        default: uuid.v4()
    },
    count: {
        type: Number,
        default: 1
    }
});

module.exports = RegisterKey = mongoose.model('RegisterKey', RegisterKeySchema);