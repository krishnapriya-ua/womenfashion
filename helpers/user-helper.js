const User = require('../model/user');
const Cart = require('../model/cart');

// Define the userHelper functions
module.exports = {
    findUserById: async (userId) => {
        return await User.findById(userId);
    },
    // Add other necessary functions here
};
