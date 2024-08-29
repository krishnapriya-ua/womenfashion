const mongoose = require('mongoose');
const bcrypt=require('bcrypt')
const addressSchema = new mongoose.Schema({
    fullname: String,
    phonenumber: String,
    country: String,
    state: String,
    postcode: String,
    address: String,
    city: String,
    primary: { type: Boolean, default: false },
    createdAt:{
        type:Date,
        default:Date.now()
    } 
});

const userSchema = new mongoose.Schema({
    fullname: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: false,
        unique: true
    },
    phonenumber: {
        type: String,
        required: false
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: false
    },
    otp: String,
    otpexpires: Date,
    lastOtpResend: Date,

    googleId:{
        type:String,

    } ,
    status: {
        type: String,
        default: 'pending'
    },
    isblocked: {
        type: Boolean,
        default: false
    },
    addresses: [addressSchema],
    createdAt:{
        type:Date,
        default:Date.now()
    },
    wishlist: [{ type:mongoose.Schema.Types.ObjectId, ref: 'product' }],
    walletBalance: {
        type: Number,
        default: 0
    },
    lastLogin: {
        type: Date
    },
    resetPasswordToken: {
        type: String,
        default: null,
    },
    resetPasswordExpires: {
        type: Date,
        default: null,
    },

});




const User = mongoose.model('users', userSchema);

module.exports = User;
