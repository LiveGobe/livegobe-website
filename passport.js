const LocalStrategy = require('passport-local').Strategy;
const CustomStrategy = require('passport-custom').Strategy;

const User = require('./models/user');

module.exports = function(passport) {
    // Create local strategy (username and password)
    passport.use(new LocalStrategy((username, password, done) => {
        User.findOne({ username: username }).then(user => {
            // Check if user exists
            if (!user) return done(null, false, { message: 'Incorrect username' });
            
            // Check if password is correct
            if (!user.validPassword(password)) return done(null, false, { message: 'Incorrect password' });
            
            // Return user
            return done(null, user);
        }).catch(err => { return done(err) });
    }));
    
    // Create custom strategy
    passport.use(new CustomStrategy((req, done) => {
        let apiKey = req.header("X-API-Key") || req.query._apiKey || req.body._apiKey;
        let username = req.header("X-API-Login") || req.query._username || req.body._username;
        let password = req.header("X-API-Password") || req.query._password || req.body._password;
        
        // Check if API key or username and password are provided
        if (!apiKey && !(username && password)) return done(null, false, { message: 'Missing username and password, or API key' });

        // Use API key if provided
        if (apiKey) User.findOne({ apiKey: apiKey }).then(user => {
            if (!user) return done(null, false, { message: 'Incorrect API key' });

            return done(null, user);
        }).catch(err => { return done(err) });
        // Use username and password otherwise
        else User.findOne({ username: username }).then(user => {
            if (!user) return done(null, false, { message: 'Incorrect username' });

            // Check if password is correct
            if (!user.validPassword(password)) return done(null, false, { message: 'Incorrect password' });

            return done(null, user);
        }).catch(err => { return done(err) });
    }));

    // Serialize user into the session
    passport.serializeUser(function(user, done) {
        done(null, user.id);
    });
    
    // Deserialize user from the session
    passport.deserializeUser(function(id, done) {
        User.findById(id).then(user => {
            done(null, user);
        }).catch(err => {
            done(err);
        })
    });
};