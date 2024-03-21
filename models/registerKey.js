const mongoose = require('mongoose');
const uuid = require("uuid");

const RegisterKeySchema = new mongoose.Schema({
    key: {
        type: String,
        default: uuid.v4()
    }
});

module.exports = RegisterKey = mongoose.model('RegisterKey', RegisterKeySchema);