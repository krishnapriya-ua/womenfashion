const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../model/user'); // Adjust the path as needed

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, cb) => {
    try {
        // Check if user already exists in our db
        const existingUser = await User.findOne({ googleId: profile.id });

        if (existingUser) {
            return cb(null, existingUser);
        }

        // Create new user with Google profile information
        const newUser = new User({
            googleId: profile.id,
            fullname: profile.displayName || '', 
            username:profile.displayName||'',
            email: profile.emails[0].value || '',
            phonenumber:profile.phonenumber||'',
            password:profile.password||''
            // Add additional fields as needed
        });

        await newUser.save();
        console.log(newUser);
        cb(null, newUser);
    } catch (err) {
        cb(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
    done(null, user.id); // Store the user ID in the session
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id); // Retrieve user data from the database
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});
