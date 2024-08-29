const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Used for moving files
const Product = require('../../model/product');
const producthelpers = require('../../helpers/product-helpers');
const Category=require('../../model/category')
const Order=require('../../model/order')
const User=require('../../model/user')
const Coupon=require('../../model/coupen')
const Offer=require('../../model/offer')
const mongoose=require('mongoose');



const storage=multer.diskStorage({
    destination:(req,file,cb)=>{
        const uploadpath=path.join(__dirname,'../../public/product-images')
        if(!fs.existsSync){
            fs.mkdirSync(uploadpath,{recursive:true})
        }
        cb(null,uploadpath)
    },
    filename:(req,file,cb)=>{
        cb(null,file.originalname);
    }
})

const upload=multer({storage:storage});


router.get('/allproducts', async (req, res) => {
    try {
     
        const products = await Product.find().sort({createdAt:-1});
        const categories=await Category.find().sort({createdAt:-1})
        res.render('admin/allproducts', { products,categories});
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).send('Error fetching products');
    }
});


router.get('/add-product', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        const categories = await Category.find().sort({ createdAt: -1 });
        res.render('admin/add-product', { products, categories });
    } catch (err) {
        console.error('Error fetching products or categories:', err);
        res.status(500).send('Error fetching products or categories');
    }
});

router.get('/search', async (req, res) => {
    try {
        const query = req.query.query || '';
        let products;

        if (query.trim()) {
            // Find matching categories first
            const categories = await Category.find({ name: { $regex: new RegExp(query, 'i') } }).exec();
            const categoryIds = categories.map(category => category._id);

            // Find products matching the name or category IDs
            products = await Product.find({
                $or: [
                    { name: { $regex: new RegExp(query, 'i') } },
                    { category: { $in: categoryIds } }
                ]
            }).populate('category').sort({ createdAt: -1 }).exec();
        } else {
            products = await Product.find().populate('category').sort({ createdAt: -1 });
        }

        res.json(products);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).send('Error fetching products');
    }
});


router.post('/add-product', upload.array('images', 7), async (req, res) => {
    const { name, description, price, popularity, featured, discountcoupens, length, size, categoryName, style, fabric, care, stock, color, rating, reviews } = req.body;
    const imagefiles = req.files;

    try {
        const discountPercentage = parseFloat(discountcoupens) || 0;
        const originalPrice = parseFloat(price) || 0;
        let discountPrice = originalPrice * (discountPercentage / 100);
        const maxDiscount=1200
        discountPrice=discountPrice>maxDiscount?maxDiscount:discountPrice
        const discountPriceFixed = originalPrice-discountPrice

        console.log(`Original Price: ${originalPrice}`);
        console.log(`Discount Percentage: ${discountPercentage}`);
        console.log(`Discounted Price: ${discountPriceFixed}`);
        const category = await Category.findById(categoryName).exec();
        if (!category) {
            throw new Error('Category not found');
        }
        let categoryOffer = null;
        if (category) {
            const categoryDetails = await Category.findById(category);
            if (categoryDetails && categoryDetails.offer) {
                const categoryOfferPercentage = parseFloat(categoryDetails.offer) || 0;
                let categoryOfferPrice =originalPrice * (categoryOfferPercentage / 100);
                categoryOfferPrice=categoryOfferPrice>maxDiscount ? maxDiscount : categoryOfferPrice
                categoryOffer = originalPrice-categoryOfferPrice
            }
        }

        // Determine the final discount price
        let finalDiscountPrice;
        if (categoryOffer && categoryOffer < discountPriceFixed) {
            finalDiscountPrice = categoryOffer;
        } else {
            finalDiscountPrice = discountPriceFixed;
        }
        // Find category by ID
       

        const newProduct = {
            name,
            description,
            price,
            discountcoupens,
            discountprice: discountPriceFixed,
            length,
            size,
            category: category._id,
            style,
            fabric,
            care,
            stock,
            color,
            rating,
            reviews,
            popularity,
            featured,
            images: []
        };

        const productid = await producthelpers.addProduct(newProduct);
     
        if (imagefiles && imagefiles.length > 0) {
            imagefiles.forEach(file => {
                const orgname = file.originalname;
                newProduct.images.push(orgname);
            });
            await Product.findByIdAndUpdate(productid, { images: newProduct.images });
        }

        res.json({success:true})
  
    } catch (err) {
        console.log('Error:', err);
        res.status(500).json('Error in adding product');
    }
});


router.get('/edit-product/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category');
        if (!product) {
            return res.status(404).send('Product not found');
        }
        
        // Fetch categories for the form
        const categories = await Category.find();
        res.render('admin/edit-product', { product, categories });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching product');
    }
});


router.post('/edit-product/:id', upload.array('images', 6), async (req, res) => {
    const { name, description, price, category, stock, style, color, fabric, length, care, size, discountcoupens, popularity, featured } = req.body;
    const imageFiles = req.files;
    const croppedImages = req.body.croppedImages ? JSON.parse(req.body.croppedImages) : [];

    try {
        const discountPercentage = parseFloat(discountcoupens) || 0;
        const originalPrice = parseFloat(price) || 0;
        let discountPrice = originalPrice * (discountPercentage / 100);
        const maxDiscount = 1200;

        // Apply the discount cap
        if (discountPrice > maxDiscount) {
            discountPrice = maxDiscount;
        }

        const discountPriceFixed = originalPrice - discountPrice;

        // Calculate the actual discount percentage after applying the cap
        const actualDiscountPercentage = ((originalPrice - discountPriceFixed) / originalPrice) * 100;

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found', success: false });
        }

        let finalDiscountPrice = discountPriceFixed;
        let finalDiscountPercentage = actualDiscountPercentage;

        if (category) {
            const categoryDetails = await Category.findById(category).exec();
            if (categoryDetails) {
                const offer = await Offer.findOne({ category: categoryDetails._id });
                if (offer && offer.expiryDate > new Date()) {
                    const categoryOfferPercentage = offer.type === 'percentage' ? offer.discount : 0;
                    let categoryOfferPrice = originalPrice * (categoryOfferPercentage / 100);
                    categoryOfferPrice = categoryOfferPrice > maxDiscount ? maxDiscount : categoryOfferPrice;
                    const categoryDiscountPriceFixed = originalPrice - categoryOfferPrice;

                    const actualCategoryDiscountPercentage = ((originalPrice - categoryDiscountPriceFixed) / originalPrice) * 100;

                    if (categoryDiscountPriceFixed < finalDiscountPrice) {
                        finalDiscountPrice = categoryDiscountPriceFixed;
                        finalDiscountPercentage = actualCategoryDiscountPercentage;
                    }
                }
            }
        }

        // Update product details
        product.name = name;
        product.description = description;
        product.price = originalPrice;
        product.category = category;
        product.fabric = fabric;
        product.color = color;
        product.stock = stock;
        product.discountcoupens = finalDiscountPercentage.toFixed(2); // Save the actual discount percentage
        product.discountprice = finalDiscountPrice;
        product.length = length;
        product.style = style;
        product.care = care;
        product.size = size;
        product.popularity = popularity;
        product.featured = featured;

        // Handle cropped images
        if (Object.keys(croppedImages).length > 0) {
            const oldImages = product.images.slice(); // Make a copy of existing images

            Object.keys(croppedImages).forEach((imageName, index) => {
                if (croppedImages[imageName]) {
                    const oldImage = oldImages[index];
                    if (oldImage) {
                        const oldImagePath = path.join(__dirname, '../../public/product-images', oldImage);
                        if (fs.existsSync(oldImagePath)) {
                            fs.unlinkSync(oldImagePath);
                        }
                    }
                    const croppedImagePath = path.join(__dirname, '../../public/product-images', `cropped_${Date.now()}.png`);
                    fs.writeFileSync(croppedImagePath, Buffer.from(croppedImages[imageName], 'base64'));
                    product.images[index] = path.basename(croppedImagePath);
                }
            });
        } else if (imageFiles.length > 0) {
            const oldImagesToKeep = product.images.filter((_, index) => !imageFiles[index]);
            product.images.forEach((image, index) => {
                if (image && imageFiles[index]) {
                    const imagePath = path.join(__dirname, '../../public/product-images', image);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                }
            });
            const newImages = imageFiles.map(file => {
                const newImageName = Date.now() + path.extname(file.originalname);
                const newImagePath = path.join(__dirname, '../../public/product-images', newImageName);
                fs.renameSync(file.path, newImagePath);
                return newImageName;
            });
            product.images = [...oldImagesToKeep, ...newImages];
        }

        await product.save();
        res.redirect('/product/allproducts');
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating product', success: false });
    }
});



router.get('/delete-product/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).send('Product not found');
        }

       
        product.images.forEach(image => {
            if (image) {
                const imagePath = path.join(__dirname, '../../public/product-images', image);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
        });

        
        await Product.findByIdAndDelete(req.params.id);
        res.redirect('/product/allproducts');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error deleting product');
    }
});

router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find().exec();
        const products = await Product.find().populate('category').exec();

      

        res.render('admin/category-list', { categories, products });
    } catch (error) {
        console.error('Error fetching categories and products:', error);
        res.status(500).json('Server error');
    }
});



router.get('/categories/add', (req, res) => {
    res.render('admin/add-category');
});


router.post('/categories/add', async (req, res) => {
    try {
        const { name } = req.body;
        const newCategory = new Category({ name });
        await newCategory.save();
        res.redirect('/product/categories');
    } catch (error) {
        console.error('Error adding category:', error);
        res.status(500).send('Server error');
    }
});

router.get('/categories/edit/:id', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).send('Category not found');
        }
        res.render('admin/edit-category', { category });
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).send('Server error');
    }
});


router.post('/categories/edit/:id', async (req, res) => {
    try {
        const { name } = req.body;
        await Category.findByIdAndUpdate(req.params.id, { name });
        res.redirect('/product/categories');
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).send('Server error');
    }
});

router.post('/categories/delete/:id', async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).send('Server error');
    }
});


router.get('/orders',  async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('user') 
            .populate('items.product')
            .sort({createdAt:-1})
            .exec();
       
        const ordersWithPrimaryAddress = orders.map(order => {
            const primaryAddress = order.user && order.user.addresses
                ? order.user.addresses.find(address => address.primary)
                : null;

            return {
                ...order._doc,
                primaryAddress
            };
        });

        const returnRequests = ordersWithPrimaryAddress.filter(order => order.returnRequested);
 
        res.render('admin/orders', { orders: ordersWithPrimaryAddress, returnRequests });
    } catch (error) {
        console.error('Error fetching orders:', error);
        return res.status(500).json('Error fetching orders');
    }
});


router.post('/approve-return/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId).populate('user'); // Assuming Order model has a reference to the User model

        if (!order) {
            return res.status(400).json('Order not found');
        }

        if (!order.returnRequested) {
            return res.status(400).json('No return request found for this order');
        }

        // Update the order status and mark return as completed
        order.status = 'returned';
        order.returnRequested = false;
        await order.save();

        // Credit the amount to the user's wallet
        const refundAmount = order.totalPrice; // Adjust as needed based on your schema
        const user = order.user; // Populated user from the order
        user.walletBalance += refundAmount;
        await user.save();

        res.status(200).json({ message: 'Return approved and amount credited to wallet successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json('Server error');
    }
});


router.post('/orders/change-status/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        const newStatus = req.body.status;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(400).json('Order not found');
        }

        order.status = newStatus;
        await order.save();

        res.json({ message: 'Order status updated successfully' });
    } catch (error) {
        console.log(error);
        return res.status(500).json('Error updating order status');
    }
});



router.post('/orders/cancel/:id', async (req, res) => {
    try {
        const orderId = req.params.id;

        const order = await Order.findById(orderId).populate('user');
        if (!order) {
            return res.status(400).json('Order not found');
        }

        if (order.status !== 'pending') {
            return res.status(400).json('Only pending orders can be cancelled');
        }

        order.status = 'cancelled';
        await order.save();
        const refundAmount = order.totalPrice; // Adjust as needed based on your schema
        const user = order.user; // Populated user from the order
        user.walletBalance += refundAmount;
        await user.save();
        res.json({ message: 'Order cancelled and amount credited to users wallet successfully' });
    } catch (error) {
        console.log(error);
        return res.status(500).json('Error cancelling order');
    }
});

router.post('/update-stock/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('Product ID:', productId); // Add this line to debug
        const newStock = req.body.stock;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(400).json('Product not found');
        }

        product.stock = newStock;
        await product.save();

        res.json({ message: 'Stock quantity updated successfully' });
    } catch (error) {
        console.log(error);
        res.status(500).json('Error updating stock quantity');
    }
});



router.get('/coupon', async (req, res) => {

   
    try {
      const categories=await Category.find();
      const products=await Product.find()
      const coupons=await Coupon.find()
      const offers=await Offer.find().populate('category')

        
       
        res.render('admin/coupen-management', { coupons,categories,products,offers }); // Adjust the path to your partial view
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).send('Error fetching coupons');
    }
});


router.post('/coupon/add', async (req, res) => {
    try {
        const { code, discount, type, expiryDate, usageLimit,category,product } = req.body;

        // Check if the coupon code already exists
        const existingCoupon = await Coupon.findOne({ code });
        if (existingCoupon) {
            return res.status(400).json({ message: 'Coupon code already exists' });
        }

        const newCoupon = new Coupon({ code, discount, type, expiryDate, usageLimit,category,product });
        await newCoupon.save();
        res.status(200).json( 'Coupon added successfully' );
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error' });
    }
});



router.put('/coupon/edit',async(req,res)=>{
    try {
        const{couponId,code,discount,type,expiryDate,usageLimit}=req.body;
        await Coupon.findByIdAndUpdate(couponId,{code,discount,type,expiryDate,usageLimit});
        res.status(200).json('coupon edited successfully')

    } catch (error) {
        console.log(error)
        res.status(500).json('failed to edit coupon')
    }
})


router.delete('/coupon/delete',async(req,res)=>{
    try {
        const{couponId}=req.body;
        await Coupon.findByIdAndDelete(couponId)
        res.status(200).json('coupon deleted successfully')
    } catch (error) {
        console.log(error)
        res.status(500).json('server error')
    }
})

// Add an offer
router.post('/offer/add', async (req, res) => {
    try {
        const { name, discount, type, expiryDate,  category } = req.body;

        if (!expiryDate ) {
            return res.status(400).send({ message: 'Expiry date and usage limit are required.' });
        }

        const exist = await Offer.findOne({ name });
        if (exist) {
            return res.status(400).send({ message: 'Offer already exists.' });
        }

        const newOffer = new Offer({
            name,
            discount,
            type,
            expiryDate,
           
            category
        });

        await newOffer.save();

        // Apply the discount to all products in the specified category
        await applyDiscountToCategory(category, discount, type);

        res.status(201).send({ message: 'Offer added successfully!' });
    } catch (error) {
        console.error('Error adding offer:', error);
        res.status(500).send({ message: 'Failed to add the offer.' });
    }
});

async function applyDiscountToCategory(categoryId, discount, type) {
    try {
        const maxDiscount=1200;
        const products = await Product.find({ category: categoryId });
        console.log(categoryId, 'id');

        for (let product of products) {
            let basePrice = product.price;
            let newOfferPrice;
            let offerPercentage=0

            console.log(basePrice, 'baseprice');

            // Calculate the new offer price based on the discount type
            if (type === 'percentage') {
                if (discount >= 0 && discount <= 100) {

                    let calculatedDiscount = (basePrice * discount) / 100;
                    if(calculatedDiscount>maxDiscount){
                        calculatedDiscount=maxDiscount
                    }
                    newOfferPrice=basePrice-calculatedDiscount
                    offerPercentage=((calculatedDiscount/basePrice)*100).toFixed(2)
                } else {
                    console.error('Invalid percentage discount value:', discount);
                    continue; // Skip applying invalid discount
                }
            } else if (type === 'fixed') {
                newOfferPrice = basePrice - discount;
                if (newOfferPrice < 0) {
                    console.error('Fixed discount results in a negative price:', newOfferPrice);
                    continue; // Skip applying invalid discount
                }
            }

            console.log(newOfferPrice, 'newprice');

            // Determine the final discount price to apply
            let finalDiscountPrice;
            let finalDiscountPercentage;

            if (product.discountprice) {
               if(newOfferPrice<product.discountprice){
                finalDiscountPrice = newOfferPrice;
                finalDiscountPercentage=offerPercentage
                
               } 
               else{
                finalDiscountPrice=product.discountprice
                finalDiscountPercentage=product.discountcoupens
               }
            } else {
                // If no existing discountprice, use the newOfferPrice
                finalDiscountPrice = newOfferPrice;
                finalDiscountPercentage=offerPercentage
            }

            console.log(finalDiscountPrice, 'finalDiscountPrice');

      
            if (finalDiscountPrice >= 0) {
                await Product.findByIdAndUpdate(product._id, {
                     discountprice: finalDiscountPrice,
                     discountcoupens:finalDiscountPercentage
                     });
            } else {
                console.error('Final discount price is negative:', finalDiscountPrice);
            }
        }
    } catch (error) {
        console.error('Error applying discount to category:', error);
    }
}



// Edit an offer
router.put('/offer/edit', async (req, res) => {
    try {
        const { offerId, name, discount, type, expiryDate,  category } = req.body;
        
        await Offer.findByIdAndUpdate(offerId, {
            name,
            discount,
            type,
            expiryDate,
          
            category
        });
        
        await applyDiscountToCategory(category, discount, type);
        res.status(200).send({ message: 'Offer updated successfully!' });
    } catch (error) {
        console.error('Error updating offer:', error);
        res.status(500).send({ message: 'Failed to update the offer.' });
    }
});

// Delete an offer
router.delete('/offer/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await Offer.findByIdAndDelete(id);
        res.status(200).send({ message: 'Offer deleted successfully!' });
    } catch (error) {
        console.error('Error deleting offer:', error);
        res.status(500).send({ message: 'Failed to delete the offer.' });
    }
});


module.exports = router;
