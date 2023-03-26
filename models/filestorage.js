const mongoose = require('mongoose');

const StorageSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
        required: true
    },
    size: {
        type: Number,
        default: 0
    },
    maxSize: {
        type: Number,
        required: true,
        default: 1 * 1024 * 1024 * 1024,
        min: 1 * 1024 * 1024,
        max: 1 * 1024 * 1024 * 1024 * 1024
    },
    folders: [{
        name: {
            type: String,
            required: true
        },
        description: String,
        path: {
            type: String,
            required: true
        }
    }],
    files: [{
        name: {
            type: String,
            required: true
        },
        description: String,
        path: {
            type: String,
            required: true
        },
        date: {
            type: Date,
            required: true,
            default: new Date()
        },
        size: {
            type: Number,
            required: true
        },
        private: {
            type: Boolean,
            required: true,
            default: true
        },
        md5: {
            type: String,
            required: true
        }
    }]
});

StorageSchema.methods.getFolderSize = function (name, path) {
    let size = 0;
    this.files.forEach(file => {
        if (file.path == path + name + "/") size += file.size;
    });
    this.folders.forEach(folder => {
        if (folder.path == path + name + "/") size += this.getFolderSize(folder.name, folder.path);
    });
    return size;
};

module.exports = FileStorage = mongoose.model('FileStorage', StorageSchema);