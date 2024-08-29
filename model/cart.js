const mongoose = require('mongoose');

// Define the Cart schema
const cartSchema = new mongoose.Schema({
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
        discountprice:{
            type:Number,
            default:0
        }
    }],
    totalQty: {
        type: Number,
        default: 0
    },
    totalPrice: {
        type: Number,
        default: 0
    } ,
    createdAt:{
        type:Date,
        default:Date.now()
    },
    actualprice:{
        type:Number,
        default:0
    }
});


const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
