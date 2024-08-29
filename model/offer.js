const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    name: { type: String, required: true },
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
        required: true,
        
    },
    usageLimit: {
        type: Number,
        default: 1,
        required:true
    },

    category:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Category',
        required:true
    },
});

const Offer = mongoose.model('offers', offerSchema);

module.exports = Offer;
