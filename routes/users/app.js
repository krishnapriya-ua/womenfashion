const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const userHelper=require('../../helpers/user-helper')
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../../model/user');
const Product = require('../../model/product');
const Cart=require('../../model/cart');
const Razorpay = require('razorpay');
const Order=require('../../model/order')
const Coupon=require('../../model/coupen')
const mongoose=require('mongoose')
const PDFDocument=require('pdfkit')
const fs=require('fs')
const path=require('path');
const { stream } = require('exceljs');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'krishnapriyaua@gmail.com',
        pass: 'txej uvva mwtl nzsq'
    }
});




const notLoggedIn = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

const checkLoggedIn = (req, res, next) => {
    if (req.session.user) {
        return res.redirect('/logout');
    }
    next();
};

const auth=(req,res,next)=>{
    if(req.session.user){
        return next()
    }
    else{
        
        return res.redirect('/login')
    }
}
router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    try {
        const userId = req.session.user?._id;
        const mostLovedProducts = await Product.find({ featured: true }).limit(4);
        const popularProducts = await Product.find().sort({ popularity: -1 }).limit(1); // Fetch multiple popular products

        if (userId) {
            const user = await User.findById(userId);
            if (user.isblocked) {
                req.session.destroy((err) => {
                    if (err) {
                        console.log('Error destroying session:', err);
                        return res.status(500).json('Server error');
                    }
                    return res.redirect('/login');
                });
                return;
            }
            const cart = await Cart.findOne({ user: userId }).populate('items.product');
            res.render('users/homepage', { user, cart, products: mostLovedProducts, popularProducts }); // Use popularProducts here
        } else {
            res.render('users/homepage', { user: null, cart: null, products: mostLovedProducts, popularProducts });
        }
    } catch (err) {
        console.error('Error retrieving data:', err);
        res.status(500).send('Error retrieving data');
    }
});




const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID, 
    key_secret: process.env.RAZORPAY_KEY_SECRET 
});




function verifyPaymentSignature(paymentId, razorpayOrderId, razorpaySignature) {
    const secret = process.env.RAZORPAY_KEY_SECRET; // Your secret key
    const generatedSignature = crypto.createHmac('sha256', secret)
                                     .update(`${razorpayOrderId}|${paymentId}`)
                                     .digest('hex');
    return generatedSignature === razorpaySignature;
}

router.post('/create-order', auth, async (req, res) => {
    try {
        const { totalPrice } = req.body;
        const price = parseFloat(totalPrice);

        if (isNaN(price)) {
            return res.status(400).json({ error: 'Invalid total price' });
        }

        // Create Razorpay order
        const razorpayOrder = await razorpayInstance.orders.create({
            amount: price * 100, // amount in paise
            currency: 'INR',
            receipt: `receipt_order_${Date.now()}`,
            payment_capture: '1' // auto capture
        });

        res.json({
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating Razorpay order' });
    }
});


router.get('/login', checkLoggedIn, (req, res) => {
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    res.render('users/login');
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json('All fields are necessary');
        }
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json('Invalid username or password');
        }
        if (user.isblocked) {
            return res.status(400).json('Sorry, your account has been blocked');
        }
        req.session.user = user;
        return res.json('Login successful');
    } catch (err) {
        console.error(err);
        res.status(500).json('Server error');
    }
});



router.get('/signup', checkLoggedIn, (req, res) => {
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    res.render('users/signup');
});

router.post('/signup', async (req, res) => {
    const { fullname, username, phonenumber, email, password } = req.body;
    try {
        if (!fullname || !username || !phonenumber || !email || !password) {
            return res.status(400).json({ message: 'All fields are necessary' });
        }
        let user = await User.findOne({ $or: [{ username }, { email }] });
        if (user) {
            return res.status(400).json({ message: 'Username or email already exists' });
        }
        const parsedphonenumber = parsePhoneNumberFromString(phonenumber);
        if (!parsedphonenumber || !parsedphonenumber.isValid()) {
            return res.status(400).json({ message: 'Invalid phone number' });
        }
       
        const otp = crypto.randomInt(100000, 999999).toString();
        const otpexpires = new Date(Date.now() + 5 * 60 * 1000);

        user = new User({
            fullname,
            username,
            email,
            phonenumber: parsedphonenumber.number,
            password: await bcrypt.hash(password, 10),
            otp,
            otpexpires,
            status: 'pending'
        });

        await user.save();

        await transporter.sendMail({
            from: 'krishnapriyaua@gmail.com',
            to: email,
            subject: 'Your OTP code',
            text: `Your OTP code is ${otp}`
        });
       
        req.session.pendingUser = { email };
        return res.render('users/verifyotp', { email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});
router.get('/verifyotp', (req, res) => {
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    const pendingUser = req.session.pendingUser;
    if (!pendingUser) {
        return res.redirect('/signup');
    }
   
    res.render('users/verifyotp', { email: pendingUser.email });
});


router.post('/verifyotp', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        if (user.otpexpires < Date.now()) {
            return res.status(400).json({ message: 'OTP has expired' });
        }

        user.otp = undefined;
        user.otpexpires = undefined;
        user.status = 'active';

        await user.save();

        req.session.pendingUser = null;

        return res.json({ message: 'OTP verified successfully', redirect: '/login' });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error' });
    }
});


router.post('/resendotp', async (req, res) => {
    const pendingUser = req.session.pendingUser;
    if (!pendingUser || !pendingUser.email) {
        return res.status(400).json({ message: 'User not found' });
    }

    try {
        const user = await User.findOne({ email: pendingUser.email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        // Check if the cooldown period has passed
        const cooldownPeriod = 20 * 1000; // 15 seconds
        const currentTime = Date.now();
        if (user.lastOtpResend && (currentTime - user.lastOtpResend.getTime() < cooldownPeriod)) {
            const timeLeft = Math.ceil((cooldownPeriod - (currentTime - user.lastOtpResend.getTime())) / 1000);
            return res.status(400).json({ message: `Please wait ${timeLeft} seconds before requesting a new OTP` });
        }

        // Generate and save new OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        const otpexpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiration
        user.otp = otp;
        user.otpexpires = otpexpires;
        user.lastOtpResend = new Date(); // Update the resend timestamp
        await user.save();

        // Send OTP email
        await transporter.sendMail({
            from: 'krishnapriyaua@gmail.com',
            to: pendingUser.email,
            subject: 'Your OTP code',
            text: `Your OTP code is ${otp}`
        });

        return res.json({ message: 'OTP has been sent, please check your email' });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Server error' });
    }
});


router.get('/logout', notLoggedIn, (req, res) => {
    const username = req.session.user ? req.session.user.username : '';
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    res.render('users/logout', { username });
});

router.post('/logout', (req, res) => {
    if (req.session.user) {
        delete req.session.user;
     res.status(200).json({ message: 'Logout successful' });
    } else {
        return res.status(400).json({ message: 'Already logged out' });
    }
});



router.get('/about', (req, res) => {
    console.log(req.session.user)

    res.render('users/about');
});


// Route to add a product to the cart
router.post('/add-to-cart/:id', auth, async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user._id;
        const maxquantity=10;
        
        const product = await Product.findById(productId).sort({createdAt:-1})
        if (!product) {
            return res.status(404).send({message:'Product not found'});
        }
       if(product.stock===0){
        return res.status(400).json('currently product is not available')
       }
       const user=req.session.user;
       if(!user){
        return res.status(400).json('please login')
       }

        const availablequan=Math.min(maxquantity,product.stock)
        let cart = await Cart.findOne({ user: userId }).sort({createdAt:-1});
        if (!cart) {
            // Create a new cart if it doesn't exist
            cart = new Cart({ user: userId, items: [], totalQty: 0, totalPrice: 0,actualprice:0 });
        }

        // Check if the product is already in the cart
        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

        if (itemIndex > -1) {
            if(cart.items[itemIndex].quantity<availablequan){
            cart.items[itemIndex].quantity++;
            cart.items[itemIndex].discountprice = cart.items[itemIndex].quantity * product.discountprice;
            cart.items[itemIndex].price=cart.items[itemIndex].quantity*product.price;
            

            }
            else{
                return res.status(400).send({message:'Maximum quantity reached for this product'})
            }
        } else {
            // If the product is not in the cart, add it
            cart.items.push({
                product: productId,
                quantity: 1,
                discountprice: product.discountprice,
                price:product.price
            });
        }

        // Update the total quantity and total price
        cart.totalQty = cart.items.reduce((acc, item) => acc + item.quantity, 0);
        cart.totalPrice = cart.items.reduce((acc, item) => acc + item.discountprice, 0);
        cart.actualprice = cart.items.reduce((acc, item) => acc + item.price, 0);

        // Save the cart
        await cart.save();

        res.json({message:'Product added to  cart'}) // Redirect to the cart page or product details page
    } catch (err) {
        console.error(err);
        res.status(500).send('Error adding product to cart');
    }
});

// Route to increase quantity of a product in the cart
router.post('/add-to-cart/increase/:id',  async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user._id;
        const maxQuantity = 10;


        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if(product.stock===0){
            return res.status(400).json({message:'Product is not available'})
        }
       const availablequan=Math.min(maxQuantity,product.stock)
        const cart = await Cart.findOne({ user: userId });

        if (!cart) {
            return res.status(404).send('Cart not found');
        }

        
        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

        if (itemIndex > -1) {
            if (cart.items[itemIndex].quantity < availablequan) {
                const product = await Product.findById(productId);
                cart.items[itemIndex].quantity++;
                cart.items[itemIndex].discountprice = cart.items[itemIndex].quantity * product.discountprice;
                cart.items[itemIndex].price = cart.items[itemIndex].quantity * product.price;


                
                cart.totalQty = cart.items.reduce((acc, item) => acc + item.quantity, 0);
                cart.totalPrice = cart.items.reduce((acc, item) => acc + item.discountprice, 0);
                cart.actualprice = cart.items.reduce((acc, item) => acc + item.price, 0);

                await cart.save();

                return res.status(200).send('Quantity increased'); // Ensure this is the only response sent
            } 
            else {
                
                return res.status(400).json({message:'Maximum quantity reached for this product'}); // Correct error message
            }
        } else {
            return res.status(404).send('Product not found in cart');
        }
    } catch (err) {
        console.error(err);
        return res.status(500).send('Error updating cart');
    }
});

router.post('/add-to-cart/decrease/:id',  async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user._id;

        // Find the cart for the user
        const cart = await Cart.findOne({ user: userId });

        if (!cart) {
            return res.status(404).send('Cart not found');
        }

        // Find the item in the cart
        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

        if (itemIndex > -1) {
            const product = await Product.findById(productId);
            if (cart.items[itemIndex].quantity > 1) {
                // Decrease quantity and update price
                cart.items[itemIndex].quantity--;
                cart.items[itemIndex].discountprice = cart.items[itemIndex].quantity * product.discountprice;
                cart.items[itemIndex].price = cart.items[itemIndex].quantity * product.price;

                // Update cart totals
                cart.totalQty = cart.items.reduce((acc, item) => acc + item.quantity, 0);
                cart.totalPrice = cart.items.reduce((acc, item) => acc + item.discountprice, 0);
                cart.actualprice = cart.items.reduce((acc, item) => acc + item.price, 0);

                await cart.save();
                return res.status(200).send('Quantity decreased'); // Ensure to return here
            }
             else {
                // Remove the item if quantity is 1
                cart.items.splice(itemIndex, 1);
                cart.totalQty = cart.items.reduce((acc, item) => acc + item.quantity, 0);
                cart.totalPrice = cart.items.reduce((acc, item) => acc + item.price, 0);

                await cart.save();
                return res.status(200).send('Item removed'); // Ensure to return here
            }
        }
         else {
            return res.status(404).send('Item not found in cart'); // Handle case where item is not found
        }
    } catch (err) {
        console.error(err);
        return res.status(500).send('Error updating cart'); // Ensure to return here
    }
});



router.post('/add-to-cart/remove/:id',  async (req, res) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user._id;

        // Find the cart for the user
        const cart = await Cart.findOne({ user: userId });

        if (!cart) {
            return res.status(404).send('Cart not found');
        }

        // Find the item in the cart
        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

        if (itemIndex > -1) {
            // Remove the item from the cart
            cart.items.splice(itemIndex, 1);

            // Update cart totals
            cart.totalQty = cart.items.reduce((acc, item) => acc + item.quantity, 0);
            cart.totalPrice = cart.items.reduce((acc, item) => acc + item.discountprice, 0);
            cart.actualprice = cart.items.reduce((acc, item) => acc + item.price, 0);

            await cart.save();
        }

        res.status(200).send('Product removed');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating cart');
    }
});

// Route to view the cart
router.get('/cart', auth, async (req, res) => {
    try {
       const productId=req.params.id
        const user = await userHelper.findUserById(req.session.user._id);
        
        if (!user) {
            return res.status(404).send('User not found');
        }
        req.session.buyNowProductId = null;
        const product=await Product.findById(productId).sort({createdAt:-1})
     
        const cart = await Cart.findOne({ user: req.session.user._id }).populate('items.product').sort({createdAt:-1});

        if (!cart) {
            return res.render('users/cart', { cart: { items: [], totalQty: 0, totalPrice: 0,actualprice:0 } });
        }
        const discountAmount = cart.items.reduce((acc, item) => acc + (item.price - item.discountprice), 0);
        const hasOutOfStock = cart.items.some(item => item.product.stock === 0);
        res.render('users/cart', { cart,product,hasOutOfStock,discountAmount });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving cart');
    }
});


router.get('/userinfo/:id',auth, async (req, res) => {
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    const user = await User.findById(req.params.id).sort({createdAt:-1});
    res.render('users/userinfo', { user });
});




router.get('/edit-address/:userId/:addressId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).sort({createdAt:-1});
        if (user) {
          
            
            const address = user.addresses.id(req.params.addressId);
            res.render('users/address-edit', { user, address });
        } else {
            res.status(404).json('User not found');
        }
    } catch (error) {
        console.log(error);
        res.status(500).json('Error fetching address');
    }
});


router.post('/set-primary-address', async (req, res) => {
    const { userId, addressId } = req.body;

    try {
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).send('User not found');
        }

        // Ensure addresses is an array before iterating
        if (Array.isArray(user.addresses)) {
            user.addresses.forEach(address => {
                address.primary = address._id.toString() === addressId ? true : false;
            });
        }

        // Save the updated user
        await user.save();

       return res.status(200).json({ message: 'Primary address updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});



router.post('/edit-address/:userId/:addressId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        const address = user.addresses.id(req.params.addressId)

        // Update address details
        address.fullname = req.body.fullname;
        address.phonenumber = req.body.phonenumber;
        address.address = req.body.address;
        address.city = req.body.city;
        address.country = req.body.country;
        address.state = req.body.state;
        address.postcode = req.body.postcode;

        // Save changes
        await user.save();

        res.redirect(`/address-management/${user._id}`);
    } catch (error) {
        console.log(error);
        res.status(500).json('Error updating address');
    }
});

router.post('/delete-address/:userId/:addressId', async (req, res) => {
    try {
        // Find the user
        const user = await User.findById(req.params.userId);

        // Remove the address
        user.addresses.id(req.params.addressId).deleteOne();

        // Save changes
        await user.save();

        res.redirect(`/address-management/${user._id}`);
    } catch (error) {
        console.log(error);
        res.status(500).json('Error deleting address');
    }
});

router.get('/address-management/:id', auth, async (req, res) => {
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json('User not found');
        }

        // Sort addresses by createdAt in descending order
        user.addresses.sort((a, b) => b.createdAt - a.createdAt);

        res.render('users/address-management', { user });
    } catch (error) {
        console.error(error);
        res.status(500).json('Error fetching user');
    }
});

router.get('/add-address/:id', auth, async (req, res) => {
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    const user = await User.findById(req.params.id);
    res.render('users/add-address', { user });
});

router.post('/add-address/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const newAddress = {
            fullname: req.body.fullname,
            phonenumber: req.body.phonenumber,
            country: req.body.country,
            state: req.body.state,
            postcode: req.body.postcode,
            address: req.body.address,
            city: req.body.city,
            createdAt: new Date() // Set createdAt field
        };
        await User.findByIdAndUpdate(userId, {
            $push: { addresses: newAddress }
        });

        res.redirect(`/address-management/${userId}`);
    } catch (error) {
        console.log(error);
        res.status(500).json('Error adding address');
    }
});



router.get('/account-management/:id',auth, async(req,res)=>{
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    const user=await User .findById(req.params.id).sort({createdAt:-1});
    res.render('users/account-management',{user})
})

router.get('/edit-account/:id',auth, async(req,res)=>{
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    const user=await User .findById(req.params.id).sort({createdAt:-1});
    res.render('users/edit-account',{user})
})


router.post('/edit-account/:id',async(req,res)=>{
    try {
        const userid=req.params.id;
        const{email}=req.body
        let existinguser =  await User.findOne({ email: email, _id: { $ne: userid } });

        if (existinguser) {
            return res.status(400).json( ' email already exists,please try another email' );
        }
        const updateaccount={
           
            fullname:req.body.fullname,
            username:req.body.username,
            email:req.body.email,
            phonenumber:req.body.phonenumber,
            
        }
        await User.findByIdAndUpdate(userid,{$set:updateaccount})
        return res.status(200).json({message:'Account editted successfully'})
    } catch (error) {
        console.log(error)
        res.status(500).json('error editing address')
    }
})






router.post('/buy-now/:id', auth, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const user=await User.findById(userId)
        const productId = req.params.id;
        const maxQuantity = 10;
 

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(400).json('Product not found');
        }
      

        if (product.stock === 0) {
            return res.status(400).json({message:'This product is currently not available'});
        }

        const availableQuantity = Math.min(product.stock, maxQuantity);

       
        req.session.buyNowProductId = productId;

        
        return res.json({ message: 'Proceeding to checkout' });
    } catch (err) {
        console.log(err);
        res.status(500).json('Error');
    }
});
router.get('/buynow', auth, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(400).json('User not found');
        }

        let products;
        let totalQty;
        let totalPrice;

        // Check if a coupon is applied
       
        if (req.session.buyNowProductId) {
            const productId = req.session.buyNowProductId;
            const product = await Product.findById(productId);
            if (!product) {
                return res.status(400).json('Product not found');
            }
            if (product.stock === 0) {
                return res.status(400).json('This product is currently not available');
            }

            products = [{
                ...product._doc,
                quantity: 1,
                totalItemPrice: product.discountprice
            }];
            totalQty = 1;
            totalPrice = product.discountprice;

        } else {
            const cart = await Cart.findOne({ user: userId }).populate('items.product');

            if (!cart) {
                return res.status(400).json('Cart not found');
            }

            products = cart.items.map(item => ({
                ...item.product._doc,
                quantity: item.quantity,
                totalItemPrice: item.price
            }));
            totalQty = cart.totalQty;
            totalPrice = cart.totalPrice;
        }

      

        const primaryAddress = user.addresses.find(address => address.primary) || null;

        res.render('users/buynow', {
            user,
            products,
            totalQty,
            totalPrice,
            primaryAddress,
            walletBalance: user.walletBalance
        });

    } catch (err) {
        console.log(err);
        res.status(500).json('Error');
    }
});



router.post('/pay-now', auth, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { paymentMethod, addressId, totalPrice: clientTotalPrice, couponCode } = req.body;

        const user = await User.findById(userId).populate('addresses');
        if (!user) {
            return res.status(400).json('User not found');
        }

        if (!addressId) {
            return res.status(400).json('Address is required');
        }

        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(400).json('Address not found');
        }

        let finalTotalPrice = clientTotalPrice;

        console.log('Initial Total Price:', clientTotalPrice);

        if (couponCode) {

            const coupon = await Coupon.findOne({ code: couponCode });
            if (coupon) {
                console.log('entering coupon')
                if (coupon.expiryDate < new Date()) {
                    return res.status(400).json({ message: 'Coupon has expired.' });
                }

                if (coupon.usedCount >= coupon.usageLimit) {
                    return res.status(400).json({ message: 'Coupon usage limit exceeded.' });
                }
                console.log('saying discount')
                let discountAmount = 0;
                if (coupon.type === 'percentage') {
                    discountAmount = (clientTotalPrice * coupon.discount) / 100;
                } else if (coupon.type === 'fixed') {
                    discountAmount = coupon.discount;
                }
               console.log('make calculations')
                finalTotalPrice -= discountAmount;
               console.log('said finaltotalprice')
                // Ensure finalTotalPrice does not go below zero
                finalTotalPrice = Math.max(finalTotalPrice, 0);

                console.log('Discount Applied:', discountAmount);
                console.log('Final Total Price after Discount:', finalTotalPrice);

                coupon.usedCount += 1;
                await coupon.save();
                console.log('saved coupon')
            }
        }

        console.log('Final Total Price for Payment:', finalTotalPrice);
        // Add delivery charges if payment method is 'wallet'
       

        if (paymentMethod === 'razorpay') {
            const razorpayOrder = await razorpayInstance.orders.create({
                amount: finalTotalPrice * 100, // amount in paise
                currency: 'INR',
                receipt: `receipt_order_${Date.now()}`,
                payment_capture: '1' // auto capture
            });
            

            return res.json({
                orderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                key: process.env.RAZORPAY_KEY_ID,
              
            });
        }

        if (paymentMethod === 'wallet') {
            if (user.walletBalance < finalTotalPrice) {
                return res.status(400).json({ message: 'Insufficient wallet balance' });
            }

          
            console.log('Wallet Balance Before Deduction:', user.walletBalance);
          
            user.walletBalance -= finalTotalPrice;
            await user.save();

            console.log('Wallet Balance After Deduction:', user.walletBalance);
        }
       
       

        await placeOrder(req, res, user, address, paymentMethod, finalTotalPrice);

    } catch (error) {
        console.error(error);
        res.status(500).json('Error placing order');
    }
});


// Function to place an order after payment success
async function placeOrder(req, res, user, address, paymentMethod, finalTotalPrice,ispaymentpending=false) {
    try {
        let product;
        let discountAmount=0
        if (req.session.buyNowProductId) {
            const productId = req.session.buyNowProductId;
            product = await Product.findById(productId);

            if (!product) {
                return res.status(400).json('Product not found');
            }
            if (product.stock <= 0) {
                return res.status(400).json('Product out of stock');
            }
             discountAmount = product.price-product.discountprice
             discountAmount=Math.min(discountAmount,1200) 
            const order = new Order({
                user: user._id,
                items: [{
                    product: product._id,
                    quantity: 1,
                    price: product.discountprice
                }],
                totalQty: 1,
                totalPrice:finalTotalPrice,
                status: ispaymentpending?'payment pending':'pending',
                address:{
                    fullname:address.fullname,
                    address:address.address,
                    state:address.state,
                    country:address.country,
                    state:address.state,
                    postcode:address.postcode,
                    phonenumber:address.phonenumber
                },
                payment: paymentMethod,
                primaryAddress: address,
                discount:discountAmount
            });


            await order.save();
          if(!ispaymentpending){
            product.stock -= 1;
            await product.save();
          }
            req.session.buyNowProductId = null;
            res.json({ message: 'Order placed successfully', orderId: order._id });
        } else {
            const cart = await Cart.findOne({ user: user._id }).populate('items.product');
            if (!cart) {
                return res.status(400).json('Cart not found');
            }

            const items = cart.items.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.price
            }));
             discountAmount = cart.totalPrice-finalTotalPrice
            discountAmount=Math.min(discountAmount,1200)
            const order = new Order({
                user: user._id,
                items,
                totalQty: cart.totalQty,
                totalPrice:finalTotalPrice,
                status:ispaymentpending?'payment pending': 'pending',
                address:{
                    fullname:address.fullname,
                    address:address.address,
                    state:address.state,
                    country:address.country,
                    state:address.state,
                    postcode:address.postcode,
                    phonenumber:address.phonenumber
                },
                payment: paymentMethod,
                primaryAddress: address,
                discount:discountAmount
            });

            await order.save();

            for (const item of cart.items) {
                const product = await Product.findById(item.product._id);
                if (product&& !ispaymentpending) {
                    product.stock -= item.quantity;
                    await product.save();
                }
            }

            cart.items = [];
            cart.totalQty = 0;
            cart.totalPrice = 0;
            await cart.save();

            res.json({ message: 'Order placed successfully', orderId: order._id });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json('Error placing order');
    }
}




router.post('/pay-now/apply-coupon', async (req, res) => {
    const { couponCode, totalPrice } = req.body;

    try {
       
       
        const coupon = await Coupon.findOne({ code: couponCode });
        console.log('coupon found')
        if (!coupon) {
            return res.status(400).json({ message: 'Invalid coupon code.' });
        }

        if (coupon.expiryDate < new Date()) {
            return res.status(400).json({ message: 'Coupon has expired.' });
        }

        if (coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ message: 'Coupon usage limit exceeded.' });
        }
        console.log('discountamount discoveered')
        // Calculate discount amount
        let discountAmount = 0;
        console.log('checking fixed')
        if (coupon.type === 'percentage') {
            discountAmount = (totalPrice * coupon.discount) / 100;
        } else if (coupon.type === 'fixed') {
            discountAmount = coupon.discount;
        }
        
        // Calculate new total amount
        const newTotalAmount = totalPrice - discountAmount;
        console.log('reducing amount')

        // Update coupon used count
        coupon.usedCount += 1;
        console.log('increse used count')
        await coupon.save();
        console.log('save coupon')
        res.json({ newTotalAmount,discountAmount });
    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({ message: 'Server error' });
    }
});







// Route to verify Razorpay payment and then place the order
router.post('/verify-payment', async (req, res) => {
    try {
        const { orderId, paymentId, razorpaySignature } = req.body;

        const body = orderId + "|" + paymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpaySignature) {
            // Payment is verified, place the order
            const user = await User.findById(req.session.user._id).populate('addresses');
            const address = user.addresses.id(req.body.addressId);
            await placeOrder(req, res, user, address, 'razorpay', req.body.totalPrice);
        } else {
            res.status(400).json({ message: 'Payment verification failed' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json('Error verifying payment');
    }
});


router.get('/order-now', auth, async (req, res) => {
    try {
        const userId = req.session.user._id;

        // Fetch the most recent order for the user
        const latestOrder = await Order.findOne({ user: userId })
            .sort({ createdAt: -1 }) // Sort by creation date, most recent first
            .populate('items.product')
            .exec();

        if (!latestOrder) {
            return res.render('users/view-orders', { orders: [] });
        }

        // Sort items within the order if needed
        latestOrder.items.sort((a, b) => b.createdAt - a.createdAt);

        res.render('users/order-now', { orders: [latestOrder] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/order-details/:orderId',auth,async(req,res)=>{
    try {
        const userId=req.session.user?._id
        const user=await User.findById(userId)
        const orderId=req.params.orderId
        const orders=await Order.findOne({_id:orderId,user:userId})
            .populate('items.product')
            .exec()
        if(!orders){
            return res.status(400).json('order not found')
        }
        const primaryAddress=orders.address
        res.render('users/order-details',{orders,primaryAddress})
    } catch (error) {
        console.log(error)
        return res.status(400).json('server error')
        
    }
   
})


router.get('/invoice/:orderId', auth, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId).populate('items.product').exec();

        if (!order) {
            return res.status(400).json('Order not found');
        }

        const directory = path.join(__dirname, '../invoices');
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }

        const doc = new PDFDocument();
        const fileName = `invoice_${orderId}.pdf`;
        const filePath = path.join(directory, fileName);
        console.log('Directory:', directory);
        console.log('File Path:', filePath);

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Draw border
        doc.rect(40, 40, 520, 740).stroke();

        // Header
        doc.fontSize(16).text(' INVOICE', { align: 'center' });
        doc.moveDown();

        // Order details
        doc.fontSize(10).text(`Order Id: ${order._id}`, { align: 'left' });
        doc.text(`Order Date: ${order.createdAt.toLocaleDateString()} ${order.createdAt.toLocaleTimeString()}`, { align: 'left' });
        doc.moveDown();
        doc.text(`Invoice No: ${order._id}`, { align: 'left' });
        doc.text(`Invoice Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'left' });
        doc.moveDown();

        // Seller Information
        doc.fontSize(12).text('Sold By:', { underline: true });
        doc.fontSize(10).text('Women Fashion-For minimalists, Private Limited', { align: 'left' });
        doc.text('Palakkad District, Kerala, INDIA', { align: 'left' });
        doc.moveDown();

        // Addresses - Billing and Shipping Side-by-Side
        

        const address = order.address;
        const billingAddressText = `${address.fullname || ''}\n${address.address || ''}\n${address.state || ''}, ${address.country || ''}\n${address.postcode || ''}\nPhone: ${address.phonenumber || ''}`;
        const shippingAddressText = `${address.fullname || ''}\n${address.address || ''}\n${address.state || ''}, ${address.country || ''}\n${address.postcode || ''}\nPhone: ${address.phonenumber || ''}`;

          doc.text('Billing Address:', { underline: true, align: 'left' });
         
          doc.fontSize(10).text(billingAddressText, { align: 'left' });
     
       
          doc.moveDown();
      
      
          doc.text('Shipping Address:', { underline: true, align: 'left' });
        
          doc.fontSize(10).text(shippingAddressText, { align: 'left' });
     
       
        doc.moveDown();

        // Declaration
        doc.fontSize(12).text('Declaration:', { underline: true });
        doc.moveDown();
        doc.fontSize(10).text('The goods sold are intended for end user consumption and not for resale. E. & O.E.', { align: 'left' });
        doc.moveDown();

        // Product Details
        doc.fontSize(12).text('Products:', { underline: true });
        doc.moveDown();

        order.items.forEach(item => {
            const description = `${item.product.name || 'No Description'}`;
            const qty = item.quantity || 0;
            const total = item.product.discountprice || 0;

            doc.fontSize(10).text(`Product: ${description}`, { align: 'left' });
            doc.text(`Quantity: ${qty}`, { align: 'left' });
            doc.text(`Total Price: Rs.${total.toFixed(2)}`, { align: 'left' });
            doc.moveDown();
        });

        // Total
        doc.fontSize(12).text('TOTAL:', { underline: true });
        doc.moveDown();
        doc.fontSize(10).text(`TOTAL QTY: ${order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)}`, { align: 'left' });
        doc.text(`TOTAL PRICE: Rs.${(order.totalPrice || 0).toFixed(2)}`, { align: 'left' });
        doc.text('All values are in INR', { align: 'left' });

        // Authorized Signature
        doc.moveDown().fontSize(12).text('Ordered Through:', { underline: true });
        doc.moveDown();
        doc.fontSize(10).text('Women Fashion-For minimalists, Private Limited', { align: 'left' });
        doc.moveDown().text('Authorized Signature:', { align: 'left' });
        doc.text('_________________________', { align: 'left' });

        doc.end();

        stream.on('finish', () => {
            res.download(filePath, fileName, (err) => {
                if (err) {
                    console.error('Error sending PDF:', err);
                    res.status(500).send('Error generating PDF');
                } else {
                    fs.unlinkSync(filePath);
                }
            });
        });

    } catch (error) {
        console.log(error);
        res.status(500).json('Server error');
    }
});

router.get('/view-orders', auth, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const orders = await Order.find({ user: userId })
        .sort({createdAt:-1})
        .populate('items.product')
      
        .exec();
        orders.forEach(order => {
            order.items.sort((a, b) => b.createdAt - a.createdAt); // Sort items within the order
        });

        res.render('users/view-orders', { orders });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});


router.post('/view-orders/cancel/:id',auth,async(req,res)=>{
    try{

    
    const orderId=req.params.id;
    const order=await Order.findById(orderId)
    if(!order){
        return res.status(400).json('order not found')
    }
    if(order.status!=='pending'){
        return res.status(400).json('only pending orders can be cancelled')
    }

    order.status='cancelled'
    await order.save()

    const user = await User.findById(order.user._id);
 
   user.walletBalance+=order.totalPrice
    await user.save();
    res.json({ message: 'Order cancelled and wallet credited', walletBalance: user.walletBalance });
}
catch(error){
    console.log(error)
    res.status(500).json('server error')
}
})

router.post('/view-orders/return/:id', auth, async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(400).json('Order not found');
        }

        if (order.status !== 'delivered') {
            return res.status(400).json({message:'Return request can only be made for delivered orders'});
        }

        if (order.returnRequested) {
            return res.status(400).json({message:'Return request already made for this order'});
        }

        order.returnRequested = true;
        
        await order.save();
       
        // Respond with success message
        res.status(200).json({message:'Return request has been successfully submitted.'});
    } catch (error) {
        console.error(error);
        res.status(500).json('Server error');
    }
});
 




// Route to render the password recovery form
router.get('/forgot-password', (req, res) => {
    res.render('users/forgot-password'); // Render a view with the form
});

// POST route to handle the password reset request
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'No account with that email found' });
        }

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        await user.save();
        console.log('Token saved:', user.resetPasswordToken);
        console.log('Token expiry saved:', new Date(user.resetPasswordExpires));

        const mailOptions = {
            to: user.email,
            from: 'krishnapriyaua@gmail.com',
            subject: 'Password Reset Request',
            text: `Please click on the following link, or paste this into your browser to reset your password:\n\n
                   http://${req.headers.host}/reset-password/${token}\n\n`
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error('Error sending email:', err);
                return res.status(500).json({ message: 'Error sending email' });
            }
            console.log('Password reset email sent:', info.response);
            res.status(200).json({ message: 'Password reset email sent' });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    try {
        console.log('Received token:', token);

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            console.log('Token not found or expired');
            return res.render('error', { message: 'Password reset token is invalid or has expired.' });
        }

        console.log('Token validation succeeded:', token);
        res.render('users/reset-password', { token });
    } catch (err) {
        console.error('Error finding user:', err);
        res.status(500).send('Server error');
    }
});



// POST route to handle the password reset
router.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).send('Password reset token is invalid or has expired.');
        }

        user.password = await bcrypt.hash(password, 10); // Hash the new password
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();
        res.status(200).json({message:'Password has been reset successfully.'});
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


// Render the Buy Now page
router.get('/apply-coupon', (req, res) => {
    res.render('users/buynow');
});

// Handle coupon application
router.post('/apply-coupon', async (req, res) => {
    const { couponCode, totalPrice } = req.body;

    try {
        const price = parseFloat(totalPrice);
        if (isNaN(price)) {
            return res.status(400).json({ success: false, message: 'Invalid total price' });
        }

        let discount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode });
            if (!coupon) {
                return res.status(400).json({ success: false, message: 'Invalid coupon code' });
            }

            if (coupon.expiryDate < new Date()) {
                return res.status(400).json({ success: false, message: 'Coupon has expired' });
            }

            if (coupon.usageLimit <= coupon.usedCount) {
                return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
            }

            // Calculate discount
            if (coupon.type === 'percentage') {
                discount = (price * coupon.discount) / 100;
            } else if (coupon.type === 'fixed') {
                discount = coupon.discount;
            }

            // Update coupon usage count
            coupon.usedCount += 1;
            await coupon.save();
        }

        const newTotalAmount = price - discount;

        res.json({
            success: true,
            discount: discount.toFixed(2),
            newTotalAmount: newTotalAmount.toFixed(2),
            message: 'Coupon applied successfully'
        });
    } catch (error) {
        console.error(error); // Log the error for debugging
        res.status(500).json({ success: false, message: 'Server error' });
    }
});



module.exports = router;
