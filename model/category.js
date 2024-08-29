const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: String,
    description: String ,
    createdAt: { type: Date, default: Date.now ,index:true,},
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
