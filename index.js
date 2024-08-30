const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');
const connect = mongoose.connect('mongodb://localhost:27017/womenfashion');
const exhbs=require('express-handlebars')
const passport=require('passport')
const moment=require('moment')

const hbs = exhbs.create({
    extname: 'hbs',
    helpers: {
        inc: function(value) {
            return parseInt(value) + 1;
        },
        lt: (a, b) => a < b,
        eq: (a, b) => a.toString() === b.toString(),
        not: (value) => !value,
        and: (a, b) => a && b,
        pq: (a, b) => {
            if (a == null || b == null) {
                return false;
            }
            return a.toString() === b.toString();
        },
        add:(a,b)=>a+b,
        formatDate: function(date) {
            return moment(date).format('MMMM Do YYYY, h:mm:ss a');
        },
        format: function(date) {
            return moment(date).format('MMMM Do YYYY');
        },
        inArray: (array, value) => {
            return array.includes(value);
        },
        json: function(context) {
            return JSON.stringify(context);
        },
        uppercase: function (str) {
            return str.toUpperCase();
        }
    },
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault: true
    }
});

connect.then(() => {
    console.log('db connected');
}).catch(() => {
    console.log('db not connected');
});

require('dotenv').config();
require('./helpers/passport-setup')

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));


app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 36000000 }
    
}));
app.use(passport.initialize());
app.use(passport.session());


app.engine('hbs',hbs.engine)
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));





const authRoutes = require('./routes/auth/auth'); // Adjust path as needed
app.use('/auth', authRoutes);


const appRoute = require('./routes/users/app');
const shopRoute = require('./routes/users/shop');




const adminroute = require('./routes/admin/admin');
const productroute=require('./routes/admin/product')


app.use('/', appRoute);
app.use('/shop', shopRoute);

app.use('/admin', adminroute);
app.use('/product',productroute)


app.use((req, res, next) => {
    res.locals.session=req.session
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});






