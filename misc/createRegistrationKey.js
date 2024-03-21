const prompt = require("prompt");
const colors = require("@colors/colors/safe");
const RegisterKey = require("../models/registerKey");
const mongoose = require("mongoose");
const config = require("../config");
const bcrypt = require("bcrypt");

prompt.message = "";
prompt.delimiter = "";

prompt.start();

const prompts = {
    env: {
        name: "env",
        description: colors.yellow("Environment (dev/prod):"),
        type: "string",
        required: true
    }
}

// Ask for environment
prompt.get(prompts.env, async function(err, env) {
    if (err) {
        console.log(err);
        return;
    }

    env = env.env == "production" || env.env == "prod" || env.env == "p" ? "production" : "development"
    await mongoose.connect(env == "production" ? config.mongodb.uriProd : config.mongodb.uriDev)
    const registerKey = new RegisterKey();
    await registerKey.save();
    console.log(colors.yellow(`Registration key: `) + colors.green(registerKey.key));
    console.log(colors.yellow(`Registration link: `) + colors.green(`${(env == "production" ? "https" : "http") + "://" + (env == "production" ? config.domainName : `localhost:${config.port}`) + "/register?" + new URLSearchParams("key=" + registerKey.key)}`));
    mongoose.connection.close();
});