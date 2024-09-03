const express=require('express')
const bcrypt=require('bcrypt')
const router=express.Router()
const product=require('../../model/product')
const category=require('../../model/category')
const Cart=require('../../model/cart')
const Order=require('../../model/order')
const User=require('../../model/user')
const Coupon=require('../../model/coupen')

router.get('/', async (req, res) => {
    let sortCriteria = req.query.sort;
    let sortOption = {};
    let filterOptions = {};
    let selectedCategories = req.query.categories ? req.query.categories.split(',') : [];
    let minPrice = req.query.minPrice || 500;
    let maxPrice = req.query.maxPrice || 8000;
    let searchQuery = req.query.q;

    // Handling sort options
    if (sortCriteria === 'az') {
        sortOption = { name: 1 };
    } else if (sortCriteria === 'za') {
        sortOption = { name: -1 };
    } else if (sortCriteria === 'priceLowHigh') {
        sortOption = { price: 1 };
    } else if (sortCriteria === 'priceHighLow') {
        sortOption = { price: -1 };
    } else if (sortCriteria === 'featured') {
        sortOption = { featured: -1, name: 1 };
    } else if (sortCriteria === 'popularity') {
        sortOption = { popularity: -1 };
    } else if (sortCriteria === 'newArrivals') {
        sortOption = { createdAt: -1 };
    }

    // Handling category filter
    if (selectedCategories.length > 0) {
        filterOptions.category = { $in: selectedCategories };
    }

    // Handling price range filter
    if (minPrice && maxPrice) {
        filterOptions.discountprice = { $gte: minPrice, $lte: maxPrice };
    }

    // Handling search query only within the selected categories
    if (searchQuery) {
        filterOptions.name = { $regex: searchQuery, $options: 'i' };
    }

    // Fetching categories for filter options
    const categories = await category.find();

    // Fetching filtered and sorted products
    let products = await product.find(filterOptions).sort(sortOption).populate('category');

    res.render('users/product', {
        products,
        categories,
        selectedCategories,
        priceRange: { min: minPrice, max: maxPrice },
        searchQuery
    });
});

router.get('/cat', async (req, res) => {
    try {
        // Extract query parameters
        let categories = req.query.categories;
        if (typeof categories === 'string') {
            categories = categories.split(',');
        } else if (!Array.isArray(categories)) {
            categories = [];
        }

        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || Infinity;
        const sort = req.query.sort || 'relevance'; // Default to 'relevance' or other default sorting

        // Build query object
        let query = {
            price: { $gte: minPrice, $lte: maxPrice }
        };

        if (categories.length > 0) {
            query.category = { $in: categories };
        }

        // Define sorting options
        let sortOptions = {};
        switch (sort) {
            case 'az':
                sortOptions.name = 1;
                break;
            case 'za':
                sortOptions.name = -1;
                break;
            case 'priceLowHigh':
                sortOptions.price = 1;
                break;
            case 'priceHighLow':
                sortOptions.price = -1;
                break;
            case 'featured':
                sortOptions.featured = -1; // Assuming higher values mean more featured
                break;
            case 'popularity':
                sortOptions.popularity = -1; // Assuming higher values mean more popular
                break;
            case 'newArrivals':
                sortOptions.createdAt = -1; // Assuming a 'createdAt' field for new arrivals
                break;
            default:
                sortOptions.relevance = -1; // Default sort order
        }

        // Fetch products from database
        const products = await product.find(query).sort(sortOptions).exec();

        // Send response
        res.json({ products });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/details/:id',async(req,res)=>{
    const products=await product.findById(req.params.id).populate('category')
    const userId=req.session.user?._id
    
    if (!products) {
        return res.status(404).send('Product not found');
    }
   let isinwishlist=false
   if(userId){
    const user=await User.findById(userId)
    isinwishlist=user.wishlist.includes(req.params.id)
   }
  
    res.render('users/product detail',{
        products:products,
        isinwishlist,
        breadcrumbs:[
             { name: 'Home', url: '/' },
            { name: 'Shop', url: '/shop' },
           
            { name: product.name, url: '#' }
        ],
        
    })
})

const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

router.get('/relatedproducts/:productId', async (req, res) => {
    const productId = req.params.productId;
    const currentProduct = await product.findById(productId);

    let relatedProducts = await product.find({
        category: currentProduct.category,
        _id: { $ne: productId }
    });

    relatedProducts = shuffleArray(relatedProducts); // Shuffle the products
    relatedProducts = relatedProducts.slice(0, 4); // Limit to 4 products

    res.json(relatedProducts);
});


router.get('/details/:id/detailed', async (req, res) => {
    try {
        const products = await product.findById(req.params.id);
        if (!product) {
            return res.status(404).send('Product not found');
        }
        res.render('users/imgdetailed', { products });
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        const selectedCategories = req.query.categories ? req.query.categories.split(',') : [];

        let categoryFilter = {};
        if (selectedCategories.length > 0) {
            categoryFilter = { category: { $in: selectedCategories } };
        }

        // Step 1: Find matching categories
        const matchingCategories = await category.find({
            name: new RegExp(query, 'i')
        }).select('_id');

        // Step 2: Find matching products
        const products = await product.find({
            $and: [
                {
                    $or: [
                        { name: new RegExp(query, 'i') },
                        { category: { $in: matchingCategories.map(cat => cat._id) } }
                    ]
                },
                categoryFilter
            ]
        });

        res.json({ products });
    } catch (error) {
        console.error(error);
        return res.status(500).json('Server error');
    }
});



router.post('/wishlist',async(req,res)=>{
    try {
        const userId=req.session.user?._id
        const productId=req.body.productId

        if(!userId){
            return res.status(400).json({message:'user not authenticated'})
        }

        const products=await product.findById(productId)
        if(!products){
            return res.status(400).json('product not found')
        }

        const user=await User.findById(userId)
        if(!user){
            return res.status(400).json('user not found')
        }

        if(user.wishlist.includes(productId)){
            return res.status(400).json({message:'product is already in wishlist'})
        }
        user.wishlist.push(productId)
        await user.save()
        res.status(200).json({message:'product added to wishlist'})
    } catch (error) {
        console.log(error)
        return res.status(500).json('server error')
    }
})

router.get('/wishlist',async(req,res)=>{
    try {
        const userId=req.session.user?._id;
       if(!userId){
        return res.redirect('/login')

       }
       const user=await User.findById(userId).populate('wishlist')
       if(!user){
        return res.render('users/wishlist',{message:'user not found'})
       }
     const wishlistProducts=user.wishlist;
      res.render('users/wishlist',{wishlistProducts})



    } catch (error) {
        console.log(error)
        return res.status(500).json('server error')
    }
})



router.post('/cart/add', async (req, res) => {
    try {
        const userId = req.session.user._id; // Get user ID from session
        const productId = req.body.productId;

        // Find the product
        const products = await product.findById(productId).sort({createdAt:-1});
        if (!products) {
            return res.status(404).send({ message: 'Product not found' });
        }

        // Find the user's cart or create a new one
        let cart = await Cart.findOne({ user: userId }).sort({createdAt:-1});
        if (!cart) {
            cart = new Cart({ user: userId }).sort({createdAt:-1});
        }

        // Check if the product is already in the cart
        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId)
        if (itemIndex > -1) {
            // Update quantity if item is already in the cart
            cart.items[itemIndex].quantity += 1;
        } else {
            // Add new item to the cart
            cart.items.push({
                product: productId,
                quantity: 1,
                price: products.price
            });
        }

        // Recalculate totals
        cart.totalQty = cart.items.reduce((total, item) => total + item.quantity, 0);
        cart.totalPrice = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);

        await cart.save()

        // Remove the product from wishlist
        const user = await User.findById(userId);
        user.wishlist = user.wishlist.filter(item => item.toString() !== productId.toString());
        await user.save();

        res.status(200).send({ message: 'Product moved to cart' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Error moving product to cart' });
    }
});


router.post('/wishlist/remove',async(req,res)=>{
    try {
        const userId = req.session.user._id; // Get user ID from session
        const productId = req.body.productId;

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        // Check if the product is in the wishlist
        if (!user.wishlist.includes(productId)) {
            return res.status(404).send({ message: 'Product not found in wishlist' });
        }

        // Remove the product from the wishlist
        user.wishlist = user.wishlist.filter(item => item.toString() !== productId.toString());
        await user.save();

        // Send success message and redirect to wishlist
       
        res.status(200).json({message:'product removed from wishlist'})
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Error removing item from wishlist' });
    }
})

router.get('/categories', async (req, res) => {
    try {
        const categories = await category.find(); // Fetch all categories
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



router.get('/categories/:categoryName', async (req, res) => {
    try {
        const categoryName = req.params.categoryName;

        
        const categories = await category.findOne({ name: categoryName });
        if (!categories) {
            return res.status(404).send('Category not found');
        }

    
        const products = await product.find({ category: categories._id }).populate('category');

      
        res.render('users/product-cat', { 
            products: products,
            categoryName: categoryName 
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send('Server Error');
    }
});


module.exports=router