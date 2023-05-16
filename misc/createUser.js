const prompt = require("prompt");
const colors = require("@colors/colors/safe");
const User = require("../models/user");
const mongoose = require("mongoose");
const config = require("../config");
const bcrypt = require("bcrypt");

function clearLine() {
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine(1);
}

prompt.message = "";
prompt.delimiter = "";

prompt.start();

const prompts = {
    env: {
        name: "environment",
        description: colors.yellow("Environment (dev/prod):"),
        type: "string",
        required: true
    },
    username: {
        name: "username",
        description: colors.yellow("Username:"),
        type: "string",
        required: true
    },
    password: {
        name: "password",
        description: colors.yellow("Password:"),
        type: "string",
        required: true
    },
    name: {
        name: "name",
        description: colors.yellow("Name:"),
        type: "string"
    }
}

// Ask for environment
prompt.get(prompts.env, function(err, env) {
    if (err) {
        console.log(err);
        return;
    }
    env = env == "production" || env == "prod" || env == "p" ? "production" : "development"
    // Ask for username
    prompt.get(prompts.username, function(err, username) {
        if (err) {
            console.error(err);
            return;
        }
        username = username.username;
        // Ask for password
        prompt.get(prompts.password, function(err, password) {
            if (err) {
                console.error(err);
                return;
            }
            password = password.password;
            // Ask for name
            prompt.get(prompts.name, async function(err, name) {
                if (err) {
                    console.error(err);
                    return;
                }
                name = name.name;
                await mongoose.connect(env == "production" ? config.mongodb.uriProd : config.mongodb.uriDev, { useNewUrlParser: true })

                const user = new User({ username: username, password: bcrypt.hashSync(password, 10), name: name });
                await user.save();
                console.log(`User ${username} (${name}) created successfully`);
                mongoose.connection.close();
            });
        });
    });
});