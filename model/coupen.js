const mongoose = require('mongoose');


const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true
    },
    discount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    expiryDate: {
        type: Date,
        required: true
    },
    usageLimit: {
        type: Number,
        default: 1
    },
    usedCount: {
        type: Number,
        default: 0
    },
    category:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Category'
    },
    product:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'product'
    }
});

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;
