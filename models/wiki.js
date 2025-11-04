const mongoose = require("mongoose");

const WikiSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        match: /^[a-z0-9-]+$/,  // Only lowercase letters, numbers, hyphens
        trim: true
    },
    language: {
        type: String,
        required: true,
        default: "en"
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    settings: {
        theme: {
            type: String,
            default: "default"
        },
        allowAnonymousRead: {
            type: Boolean,
            default: true
        },
        allowAnonymousEdit: {
            type: Boolean,
            default: false
        },
        defaultLayout: {
            type: String,
            default: "default"
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp on save
WikiSchema.pre("save", function(next) {
    this.updatedAt = new Date();
    next();
});

// Virtual for wiki's URL
WikiSchema.virtual("url").get(function() {
    return `/wikis/${this.name}`;
});

// Instance method to check if user can access this wiki
WikiSchema.methods.canAccess = function(user) {
    // Allow access if:
    // 1. Wiki allows anonymous read
    // 2. User is admin
    // 3. User has specific wiki permission
    return (
        this.settings.allowAnonymousRead ||
        (user && (
            user.hasRole("admin") ||
            user.hasWikiRole(this.name, "admin") ||
            user.hasWikiRole(this.name, "editor") ||
            user.hasWikiRole(this.name, "viewer")
        ))
    );
};

// Instance method to check if user can edit this wiki
WikiSchema.methods.canEdit = function(user) {
    if (!user) return false;
    
    return (
        user.hasRole("admin") ||
        user.hasWikiRole(this.name, "admin") ||
        user.hasWikiRole(this.name, "editor") ||
        (this.settings.allowAnonymousEdit && user)  // If anonymous edit allowed, any logged-in user can edit
    );
};

// Instance method to check if user is admin of this wiki
WikiSchema.methods.isAdmin = function(user) {
    if (!user) return false;
    
    return (
        user.hasRole("admin") ||
        user.hasWikiRole(this.name, "admin")
    );
};

// Static method to find accessible wikis for a user
WikiSchema.statics.findAccessible = async function(user) {
    const wikis = await this.find();
    return wikis.filter(wiki => wiki.canAccess(user));
};

// Export model
module.exports = mongoose.model("Wiki", WikiSchema);