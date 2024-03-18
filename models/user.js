const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const uuid = require("uuid");

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    name: {
        type: String,
        default: 'empty'
    },
    password: {
        type: String,
        required: true
    },
    apiKey: {
        type: String,
        default: uuid.v4()
    },
    permissions: [{
        type: String,
        lowercase: true
    }]
});

UserSchema.methods.validPassword = function(password) {
    return bcrypt.compareSync(password, this.password);
};

UserSchema.methods.hasRole = function(perm) {
    return this.permissions.includes(perm.toLowerCase());
}

UserSchema.methods.allowFilestorage = function() {
    return this.hasRole("admin") || this.hasRole("filestorage");
}

module.exports = User = mongoose.model('User', UserSchema);