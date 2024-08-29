const mongoose = require('mongoose');


// Define the Cart schema
const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users', // Reference to the User model
        required: true
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'product', // Reference to the Product model
            required: true
        },
        quantity: {
            type: Number,
            default: 1
        },
        price: {
            type: Number,
            required: true
        },
        createdAt:{
            type:Date,
            default:Date.now
        }
    }],
    totalQty: {
        type: Number,
        default: 0
    },
    totalPrice: {
        type: Number,
        default: 0
    },
    totalactual:{
        type:Number,
        default:0
    },
    status:{
        type:String,
        enum:['pending','delivered','cancelled','shipped','returned','paid','payment pending'],
        default:'pending'
    },
    returnRequested:{
        type:Boolean,
        default:false

    },
    createdAt:{
        type:Date,
        default:Date.now
    },
    payment:{
        type:String,
        enum:['COD','UPI','creditcard','netbanking','wallet','razorpay'],
        required:true
    },
    coupon:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Coupon',
        
    },
    discount:{
        type:Number,
        default:0
    },
    address:{
        fullname:String,
        address:String,
        country:String,
        state:String,
        postcode:String,
        phonenumber:String

        }
});

// Create and export the Cart model
const Order = mongoose.model('order', orderSchema);
module.exports = Order;
