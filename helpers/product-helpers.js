const Product = require('../model/product');

module.exports = {
    addProduct: async (productData) => {
        const product = new Product(productData);
        await product.save();
        return product._id;
    }
   
};