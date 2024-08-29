const express = require('express');
const router = express.Router();
const User=require('../../model/user')
const Order=require('../../model/order')
const PDFDocument = require('pdfkit');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { Buffer } = require('buffer');
const path=require('path')
const Product=require('../../model/product')
const Category=require('../../model/category')
const moment=require('moment-timezone')
const Cart=require('../../model/cart')

const adminAuthentication = (req, res, next) => {
    const { username, password } = req.body;
    if (username === process.env.adminusername && password === process.env.adminpassword) {
        req.session.admin = username;
        return next();
    }
    res.status(401).json('Invalid admin credentials');
};


// Helper function to get order data
const getOrderData = async (startDate, endDate) => {
    return await Order.aggregate([
      { $match: { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } } },
      { $group: {
          _id: null,
          totalAmount: { $sum: '$totalPrice' },
          totalCount: { $sum: 1 }
        }
      }
    ]);
  };
  
  

router.get('/',async (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/adminpage');
    }
   
    res.set('Cache-Control', 'no-store, private, must-revalidate');
    res.render('admin/adminlogin');
});

router.post('/', adminAuthentication, (req, res) => {
    res.json({ success: true, message: 'Login successful' });
});


router.get('/adminpage', async (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin');
    }

    try {
        const bestsellingproduct = await getBestsellers(0, 5);

       const skipcategories=parseInt(req.query.skipcategories)||0;
       const limit=5;
       const bestsellingcategory=await Order.aggregate([
        {$unwind:'$items'},
        {$lookup:{from:'products',localField:'items.product',foreignField:'_id',as:'product'}},
        {$unwind:'$product'},
        {$group:{_id:'$product.category',totalQuantity:{$sum:'$items.quantity'}}},
        {$sort:{totalQuantity:-1}},
        {$skip:skipcategories},
        {$limit:limit}

       ])

       const categoryId=bestsellingcategory.map(c=>c._id)
       const categories=await Category.find({_id:{$in:categoryId}})
       const bestsellingcategorywithdetails = bestsellingcategory.map(c => {
        const category = categories.find(cat => cat._id.equals(c._id));
        return { ...category.toObject(), totalQuantity: c.totalQuantity };
    });


   
        // Calculate total revenue
        const totalRevenueResult = await Order.aggregate([
            { $match: { status: 'delivered' } }, // Only consider delivered orders
            { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } }
        ]);
        const totalRevenue = totalRevenueResult[0]?.totalRevenue || 0;

        // Count total orders
        const totalOrders = await Order.countDocuments();

        // Count total visitors (logged-in users)
        const totalVisitors = await User.countDocuments();

        // Count returned orders
        const returnedOrders = await Order.countDocuments({ status: 'returned' });

        // Get current date
        const now = new Date();

        // Monthly Sales Data
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const monthlySalesData = await Order.aggregate([
            { $match: { createdAt: { $gte: startOfYear }, status: 'delivered' } },
            {
                $group: {
                    _id: { $month: "$createdAt" },
                    totalRevenue: { $sum: "$totalPrice" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const monthlySales = Array(12).fill(0);
        monthlySalesData.forEach(sale => {
            monthlySales[sale._id - 1] = sale.totalRevenue;
        });

        // Weekly Sales Data
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of the current month
  const weeklySalesData = await Order.aggregate([
            { $match: { createdAt: { $gte: startOfMonth,$lte:endOfMonth }, status: 'delivered' } },
            {
                $group: {
                    _id: { $week: "$createdAt" },
                    totalRevenue: { $sum: "$totalPrice" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const weeklySales = Array(4).fill(0); // Assuming 4 weeks in a month
        weeklySalesData.forEach((sale, index) => {
            weeklySales[index] = sale.totalRevenue;
        });

        // Yearly Sales Data
        const startOfPastYears = new Date(now.getFullYear() - 4, 0, 1); // Last 5 years
        const yearlySalesData = await Order.aggregate([
            { $match: { createdAt: { $gte: startOfPastYears }, status: 'delivered' } },
            {
                $group: {
                    _id: { $year: "$createdAt" },
                    totalRevenue: { $sum: "$totalPrice" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const currentYear = now.getFullYear();
        const yearlySales = Array(5).fill(0);
        yearlySalesData.forEach(sale => {
            const yearIndex = currentYear - sale._id; // Correctly calculate the index
            yearlySales[4 - yearIndex] = sale.totalRevenue;
        });

        // Render the dashboard with all the data
        res.render('admin/adminpage', {
            totalRevenue,
            totalOrders,
            totalVisitors,
            returnedOrders,
            weeklySales,
            monthlySales,
            yearlySales,
            bestsellingproduct,
            bestsellingcategory:bestsellingcategorywithdetails,
            });
    } catch (err) {
        console.error('Error fetching dashboard metrics:', err);
        res.status(500).send('Internal Server Error');
    }
});


// Route for loading more bestsellers
router.get('/more-bestsellers', async (req, res) => {
    const skip = parseInt(req.query.skip) || 0;
    
    try {
        const bestsellingproduct = await getBestsellers(skip, 5);
        res.json(bestsellingproduct);
    } catch (err) {
        console.error('Error fetching more bestsellers:', err);
        res.status(500).json({ error: 'Failed to load more bestsellers' });
    }
});

// Helper function to fetch bestseller products
async function getBestsellers(skip, limit) {
    const bestsellingproduct = await Order.aggregate([
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.product',
                totalQuantity: { $sum: '$items.quantity' }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $skip: skip },
        { $limit: limit }
    ]);

    const productIds = bestsellingproduct.map(p => p._id);
    const products = await Product.find({ _id: { $in: productIds } });

    return bestsellingproduct.map(p => {
        const product = products.find(prod => prod._id.equals(p._id));
        return {
            ...product.toObject(),
            totalQuantity: p.totalQuantity
        };
    });
}

router.get('/adminpage/report', async (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin');
    }

    let { period, startDate, endDate } = req.query;

    try {
        let matchConditions = { status: 'delivered' };

        if (startDate && endDate) {
            matchConditions.createdAt = {
                $gte: new Date(moment(startDate).tz('Asia/Kolkata').startOf('day').format()),
                $lte: new Date(moment(endDate).tz('Asia/Kolkata').endOf('day').format())
            };
        }

        let salesData = [];
        let labels = [];
        let totalRevenue = 0;
        let totalOrders = 0;
        let totaldiscount=0;

        const today = new Date();
        const beginningOfToday = new Date(today.setHours(0, 0, 0, 0));
        const beginningOfThisWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        const beginningOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        switch (period) {
            case 'today':
                const startOfToday = moment().tz('Asia/Kolkata').startOf('day').toDate();
                const endOfToday = moment().tz('Asia/Kolkata').endOf('day').toDate();
                matchConditions.createdAt = { $gte: startOfToday, $lte: endOfToday };

                // Set startDate and endDate to today's date for rendering
                startDate = moment().tz('Asia/Kolkata').startOf('day').format('YYYY-MM-DD');
                endDate = moment().tz('Asia/Kolkata').endOf('day').format('YYYY-MM-DD');

                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    {
                        $group: {
                            _id: { $hour: { date: "$createdAt", timezone: "Asia/Kolkata" } },
                            totalRevenue: { $sum: "$totalPrice" },
                            totaldiscount:{$sum:"$discount"},
                            orderCount: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);

                labels = salesData.map(sale => `${sale._id}:00-${sale._id + 1}:00`);
                salesData = salesData.map(sale => ({
                    date: `${sale._id}:00-${sale._id + 1}:00`,
                    totalOrders: sale.orderCount,
                    totalRevenue: sale.totalRevenue,
                 
                    totaldiscount:sale.totaldiscount
                }));
                break;

            case 'thisWeek':
                matchConditions.createdAt = { $gte: beginningOfThisWeek };
                salesData = await getSalesData(matchConditions, "%d-%m-%Y", "$createdAt");
                labels = salesData.map(sale => sale._id);
                salesData = salesData.map(sale => ({
                    date: sale._id,
                    totalOrders: sale.orderCount,
                    totalRevenue: sale.totalRevenue,
                    totaldiscount:sale.totaldiscount
                }));
                break;

            case 'thisMonth':
                matchConditions.createdAt = { $gte: beginningOfThisMonth };
                salesData = await getSalesData(matchConditions, "%d-%m-%Y", "$createdAt");
                labels = salesData.map(sale => sale._id);
                salesData = salesData.map(sale => ({
                    date: sale._id,
                    totalOrders: sale.orderCount,
                    totalRevenue: sale.totalRevenue,
                    totaldiscount:sale.totaldiscount
                }));
                break;
                case 'thisYear':
                    const startOfYear = moment().tz('Asia/Kolkata').startOf('year').toDate();
                    const endOfYear = moment().tz('Asia/Kolkata').endOf('year').toDate();
                    matchConditions.createdAt = { $gte: startOfYear, $lte: endOfYear };
                
                    salesData = await Order.aggregate([
                        { $match: matchConditions },
                        {
                            $group: {
                                _id: { $month: "$createdAt" },
                                totalRevenue: { $sum: "$totalPrice" },
                                totaldiscount: { $sum: "$discount" },
                                orderCount: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ]);
                
                    labels = salesData.map(sale => `Month ${sale._id}`);
                    salesData = salesData.map(sale => ({
                        date: `Month ${sale._id}`,
                        totalOrders: sale.orderCount,
                        totalRevenue: sale.totalRevenue,
                        totaldiscount: sale.totaldiscount
                    }));
                    break;
                

            case 'daily':
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    {
                        $group: {
                            _id: { $dateToString: { format: "%d-%m-%Y", date: "$createdAt" } },
                            totalRevenue: { $sum: "$totalPrice" },
                            totaldiscount:{$sum:"$discount"},
                            orderCount: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);
                labels = salesData.map(sale => sale._id);
                salesData = salesData.map(sale => ({
                    date: sale._id,
                    totalOrders: sale.orderCount,
                    totalRevenue: sale.totalRevenue,
                    totaldiscount:sale.totaldiscount
                }));
                break;

            case 'weekly':
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    {
                        $group: {
                            _id: {
                                year: { $isoWeekYear: "$createdAt" },
                                week: { $isoWeek: "$createdAt" }
                            },
                            totalRevenue: { $sum: "$totalPrice" },
                            totaldiscount:{$sum:"$discount"},
                            orderCount: { $sum: 1 }
                        }
                    },
                    { $sort: { "_id.year": 1, "_id.week": 1 } }
                ]);
                labels = salesData.map(sale => `Week ${sale._id.week} `);
                salesData = salesData.map(sale => ({
                    date: `Week ${sale._id.week}`,
                    totalOrders: sale.orderCount,
                    totalRevenue: sale.totalRevenue,
                    totaldiscount:sale.totaldiscount
                }));
                break;

            case 'monthly':
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    {
                        $group: {
                            _id: { $month: "$createdAt" },
                            totalRevenue: { $sum: "$totalPrice" },
                            totaldiscount:{$sum:"$discount"},
                            orderCount: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);
                labels = salesData.map(sale => `Month ${sale._id}`);
                salesData = salesData.map(sale => ({
                    date: sale._id,
                    totalOrders: sale.orderCount,
                    totalRevenue: sale.totalRevenue,
                    totaldiscount:sale.totaldiscount
                }));
                break;

            case 'yearly':
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    {
                        $group: {
                            _id: { $year: "$createdAt" },
                            totalRevenue: { $sum: "$totalPrice" },
                            totaldiscount:{$sum:"$discount"},
                            orderCount: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);
                labels = salesData.map(sale => `Year ${sale._id}`);
                salesData = salesData.map(sale => ({
                    date: sale._id,
                    totalOrders: sale.orderCount,
                    totalRevenue: sale.totalRevenue,
                    totaldiscount:sale.totaldiscount
                }));
                break;

            default:
                throw new Error('Invalid period selected');
        }

        totalOrders = salesData.reduce((acc, sale) => acc + (sale.orderCount || 0), 0);
        totalRevenue = salesData.reduce((acc, sale) => acc + (sale.totalRevenue || 0), 0);
        totaldiscount = salesData.reduce((acc, sale) => acc + (sale.totaldiscount || 0), 0);

        res.render('admin/report', {
            period,
            startDate,
            endDate,
            salesData,
            labels,
            totalRevenue,
            totalOrders,
            totaldiscount

        });

    } catch (err) {
        console.error('Error generating report:', err);
        res.status(500).send('Internal Server Error');
    }
});

async function getSalesData(matchConditions, dateFormat, dateField) {
    return await Order.aggregate([
        { $match: matchConditions },
        {
            $group: {
                _id: { $dateToString: { format: dateFormat, date: dateField } },
                totalRevenue: { $sum: "$totalPrice" },
                totaldiscount:{$sum:"$discount"},
                orderCount: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);
}

router.post('/adminpage/report/pdf', async (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin');
    }

    const { period, startDate, endDate } = req.body;

    let matchConditions = { status: 'delivered' };

    if (startDate && endDate) {
        matchConditions.createdAt = { 
            $gte: new Date(moment(startDate).tz('Asia/Kolkata').startOf('day').toDate()), 
            $lte: new Date(moment(endDate).tz('Asia/Kolkata').endOf('day').toDate()) 
        };
    }

    let salesData = [];
    let labels = [];
    let totalRevenue = 0;
    let totalOrders = 0;
    let totaldiscount=0;

    try {
        switch (period) {
            case 'today':
                const today = moment().tz('Asia/Kolkata');
                matchConditions.createdAt = {
                    $gte: today.startOf('day').toDate(),
                    $lte: today.endOf('day').toDate()
                };
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    { $group: { _id: { $hour: "$createdAt" }, totalRevenue: { $sum: "$totalPrice" }, totaldiscount: { $sum: "$discount" }, orderCount: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]);
                
                // Adjust the hour to the correct time zone and format it
                labels = salesData.map(sale => {
                    let utcHour = sale._id;  // This is in UTC
                    let kolkataHour = moment().utcOffset("+05:30").hour(utcHour).format('hh:00 A');
                    return kolkataHour;
                });
                break;
            

            case 'thisWeek':
                matchConditions.createdAt = {
                    $gte: moment().tz('Asia/Kolkata').startOf('week').toDate(),
                    $lte: moment().tz('Asia/Kolkata').endOf('week').toDate()
                };
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    { $group: { _id: { $dayOfWeek: "$createdAt" },totaldiscount:{$sum:"$discount"}, totalRevenue: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]);
                labels = salesData.map(sale => `Day ${sale._id}`);
                break;

            case 'thisMonth':
                matchConditions.createdAt = {
                    $gte: moment().tz('Asia/Kolkata').startOf('month').toDate(),
                    $lte: moment().tz('Asia/Kolkata').endOf('month').toDate()
                };
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    { $group: { _id: { $dayOfMonth: "$createdAt" },totaldiscount:{$sum:"$discount"}, totalRevenue: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]);
                labels = salesData.map(sale => `Day ${sale._id}`);
                break;
                case 'thisYear':
                    salesData = await Order.aggregate([
                        { $match: matchConditions },
                        { $group: { _id: { $dateToString: { format: "%d-%m-%Y", date: "$createdAt" } },totaldiscount:{$sum:"$discount"}, totalRevenue: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
                        { $sort: { _id: 1 } }
                    ]);
                    labels = salesData.map(sale => sale._id);
                    break;
            case 'daily':
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    { $group: { _id: { $dateToString: { format: "%d-%m-%Y", date: "$createdAt" } },totaldiscount:{$sum:"$discount"}, totalRevenue: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]);
                labels = salesData.map(sale => sale._id);
                break;

            case 'weekly':
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    {
                        $group: {
                            _id: {
                                year: { $isoWeekYear: "$createdAt" },
                                week: { $isoWeek: "$createdAt" }
                            },
                            totalRevenue: { $sum: "$totalPrice" },
                            orderCount: { $sum: 1 },
                            totaldiscount:{$sum:"$discount"}
                        }
                    },
                    { $sort: { "_id.year": 1, "_id.week": 1 } }
                ]);
                labels = salesData.map(sale => `Week ${sale._id.week} ${sale._id.year}`);
                break;

            case 'monthly':
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    { $group: { _id: { $month: "$createdAt" },totaldiscount:{$sum:"$discount"}, totalRevenue: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]);
                labels = salesData.map(sale => `Month ${sale._id}`);
                break;

            case 'yearly':
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    { $group: { _id: { $year: "$createdAt" },totaldiscount:{$sum:"$discount"}, totalRevenue: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
                    { $sort: { _id: 1 } }
                ]);
                labels = salesData.map(sale => `Year ${sale._id}`);
                break;

            default:
                throw new Error('Invalid period selected');
        }

        totalRevenue = salesData.reduce((acc, sale) => acc + sale.totalRevenue, 0);
        totalOrders = salesData.reduce((acc, sale) => acc + sale.orderCount, 0);
        totaldiscount=salesData.reduce((acc,sale)=>acc+sale.totaldiscount,0);

        const reportsDir = path.join(__dirname, '..', '..', 'reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir);
        }

        const fileName = `Sales_Report_${Date.now()}.pdf`;
        const filePath = path.join(reportsDir, fileName);

        const doc = new PDFDocument();
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);
        doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke();
        doc.fontSize(12).text('REPORT', { align: 'center' });
        doc.fontSize(10).text(`Period: ${period}`);
        doc.fontSize(10).text(`Start Date: ${startDate}`);
        doc.fontSize(10).text(`End Date: ${endDate}`);
        doc.moveDown()
        doc.fontSize(10).text(`Total sales count: ${totalOrders}`);
        doc.fontSize(10).text(`Total order revenue: Rs. ${totalRevenue}`);
        doc.fontSize(10).text(`Total discount: Rs. ${totaldiscount}`);
   
        doc.moveDown();

        // Table Header
        // Explicitly set y-position for all headers
       const headerY = doc.y;

       doc.text('Date/Time', 50, headerY, { width: 150 });
        doc.text('Total Orders', 200, headerY, { width: 150 });
      doc.text('Total Revenue (Rs.)', 310, headerY, { width: 150 });
      doc.text('Discount given',450,headerY,{width:150})

      doc.moveDown();

        // Table Data
        labels.forEach((label, index) => {
            const rowY = doc.y;
            doc.text(label, 50, rowY, { width: 150 });
            doc.text(salesData[index].orderCount, 200, rowY, { width: 100 });
            doc.text(salesData[index].totalRevenue, 310, rowY, { width: 150 });
            doc.text(salesData[index].totaldiscount, 450, rowY, { width: 150 });
            doc.moveDown();
        })

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
        console.error('Error generating PDF:', error);
        res.status(500).send('Internal Server Error');
    }
});


router.get('/adminpage/report/excel', async (req, res) => { 
    if (!req.session.admin) {
        return res.redirect('/admin');
    }

    const { period, startDate, endDate } = req.query;
    let matchConditions = { status: 'delivered' };
        
    if (startDate && endDate) {
        matchConditions.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    let salesData = [];
    let labels = [];
    let totalOrders = 0;
    let totalRevenue = 0;

    switch (period) {
        case 'today':
            const today = moment().tz('Asia/Kolkata');
            matchConditions.createdAt = { 
                $gte: today.startOf('day').toDate(), 
                $lte: today.endOf('day').toDate() 
            };
            salesData = await Order.aggregate([
                { $match: matchConditions },
                { 
                    $group: { 
                        _id: { $hour: "$createdAt"  }, 
                        totalRevenue: { $sum: "$totalPrice" }, 
                        totaldiscount:{$sum:"$discount"},
                        orderCount: { $sum: 1 } 
                    } 
                },
                { $sort: { _id: 1 } }
            ]);
            labels = salesData.map(sale => `${sale._id}:00`);
            break; 

            case 'weekly':
                salesData = await Order.aggregate([
                    { $match: matchConditions },
                    {
                        $group: {
                            _id: {
                                year: { $isoWeekYear: "$createdAt" },
                                week: { $isoWeek: "$createdAt" }
                            },
                            totalRevenue: { $sum: "$totalPrice" },
                            totaldiscount: { $sum: "$discount" },
                            orderCount: { $sum: 1 }
                        }
                    },
                    { $sort: { "_id.year": 1, "_id.week": 1 } }
                ]);
                labels = salesData.map(sale => `Week ${sale._id.week} ${sale._id.year}`);
                break;

        case 'thisMonth':
            salesData = await Order.aggregate([
                { $match: matchConditions },
                { 
                    $group: { 
                        _id: { $dateToString: { format: "%d-%m-%Y", date: "$createdAt" } }, 
                        totalRevenue: { $sum: "$totalPrice" }, 
                        totaldiscount:{$sum:"$discount"},
                        orderCount: { $sum: 1 } 
                    } 
                },
                { $sort: { _id: 1 } }
            ]);
            labels = salesData.map(sale => sale._id);
            break;

        case 'thisYear':
            matchConditions.createdAt = { 
                $gte: moment().tz('Asia/Kolkata').startOf('year').toDate(), 
                $lte: moment().tz('Asia/Kolkata').endOf('year').toDate() 
            };
            salesData = await Order.aggregate([
                { $match: matchConditions },
                { 
                    $group: { 
                        _id: { $month: "$createdAt" }, 
                        totalRevenue: { $sum: "$totalPrice" }, 
                        totaldiscount:{$sum:"$discount"},
                        orderCount: { $sum: 1 } 
                    } 
                },
                { $sort: { _id: 1 } }
            ]);
            labels = salesData.map(sale => `Month ${sale._id}`);
            break;

        case 'daily':
            salesData = await Order.aggregate([
                { $match: matchConditions },
                { 
                    $group: { 
                        _id: { $dateToString: { format: "%d-%m-%Y", date: "$createdAt" } }, 
                        totalRevenue: { $sum: "$totalPrice" }, 
                        totaldiscount:{$sum:"$discount"},
                        orderCount: { $sum: 1 } 
                    } 
                },
                { $sort: { _id: 1 } }
            ]);
            labels = salesData.map(sale => sale._id);
            totalOrders = salesData.reduce((sum, sale) => sum + sale.orderCount, 0);
            totaldiscount=salesData.reduce((sum,sale)=>sum+sale.totaldiscount,0)
            totalRevenue = salesData.reduce((sum, sale) => sum + sale.totalRevenue, 0);
            break;

        case 'weekly':
            salesData = await Order.aggregate([
                { $match: matchConditions },
                {
                    $group: {
                        _id: {
                            year: { $isoWeekYear: "$createdAt" },
                            week: { $isoWeek: "$createdAt" }
                        },
                        totaldiscount:{$sum:"$discount"},
                        totalRevenue: { $sum: "$totalPrice" },
                        orderCount: { $sum: 1 }
                    }
                },
                { $sort: { "_id.year": 1, "_id.week": 1 } }
            ]);
            labels = salesData.map(sale => `Week ${sale._id.week} ${sale._id.year}`);
            totalOrders = salesData.reduce((sum, sale) => sum + sale.orderCount, 0);
            totalRevenue = salesData.reduce((sum, sale) => sum + sale.totalRevenue, 0);
            totaldiscount=salesData.reduce((sum,sale)=>sum+sale.totaldiscount,0)
            break;

        case 'monthly':
            salesData = await Order.aggregate([
                { $match: matchConditions },
                { 
                    $group: { 
                        _id: { $month: "$createdAt" }, 
                        totalRevenue: { $sum: "$totalPrice" }, 
                        totaldiscount:{$sum:"$discount"},
                        orderCount: { $sum: 1 } 
                    } 
                },
                { $sort: { _id: 1 } }
            ]);
            labels = salesData.map(sale => `Month ${sale._id}`);
            totalOrders = salesData.reduce((sum, sale) => sum + sale.orderCount, 0);
            totalRevenue = salesData.reduce((sum, sale) => sum + sale.totalRevenue, 0);
            totaldiscount=salesData.reduce((sum,sale)=>sum+sale.totaldiscount,0)
            break;

        case 'yearly':
            salesData = await Order.aggregate([
                { $match: matchConditions },
                { 
                    $group: { 
                        _id: { $year: "$createdAt" }, 
                        totalRevenue: { $sum: "$totalPrice" }, 
                        totaldiscount:{$sum:'$discount'},
                        orderCount: { $sum: 1 } 
                    } 
                },
                { $sort: { _id: 1 } }
            ]);
            labels = salesData.map(sale => `Year ${sale._id}`); 
            totalOrders = salesData.reduce((sum, sale) => sum + sale.orderCount, 0);
            totalRevenue = salesData.reduce((sum, sale) => sum + sale.totalRevenue, 0);
            totaldiscount=salesData.reduce((sum,sale)=>sum+sale.totaldiscount,0)
          
            break;

        default:
            throw new Error('Invalid period selected');
    }

    totalOrders = salesData.reduce((sum, sale) => sum + sale.orderCount, 0);
    totalRevenue = salesData.reduce((sum, sale) => sum + sale.totalRevenue, 0);
    totaldiscount = salesData.reduce((sum, sale) => sum + sale.totaldiscount, 0);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    worksheet.columns = [
        { header: 'Period', key: 'period', width: 20 },
        { header: 'Start Date', key: 'startDate', width: 20 },
        { header: 'End Date', key: 'endDate', width: 20 },
        { header: 'Label', key: 'label', width: 30 },
        { header: 'Total Orders', key: 'totalOrders', width: 20 },
        { header: 'Total Revenue (Rs.)', key: 'totalRevenue', width: 20 },
        { header: 'Total Discount (Rs.)', key: 'totaldiscount', width: 20 }
    ];

    // Add header row
    worksheet.addRow({ period, startDate, endDate });

    // Add data rows
    labels.forEach((label, index) => {
        worksheet.addRow({ 
            label, 
            totalOrders: salesData[index].orderCount, 
            totalRevenue: salesData[index].totalRevenue,
            totaldiscount: salesData[index].totaldiscount
        });
    });

    res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    await workbook.xlsx.write(res);
    res.end();
});







router.get('/users',async(req,res)=>{
    try {
        const user= await User.find()
        res.render('admin/users-list',{user})
    } catch (error) {
        console.log(error);
         res.status(500).json('server error')
    }
    
})

router.post('/block-user/:id',async(req,res)=>{
    try {
        await User.findByIdAndUpdate(req.params.id,{isblocked:true})
        res.redirect('/admin/users')

    } catch (error) {
        console.log(error)
        res.status(500).json('server error')
    }
})


router.post('/unblock-user/:id',async(req,res)=>{
    try {
        await User.findByIdAndUpdate(req.params.id,{isblocked:false})
        res.redirect('/admin/users')
    } catch (error) {
        console.log(error)
        res.status(500).json('server error')
    }
})


router.post('/logoutadmin', (req, res) => {
    if (req.session.admin) {
        delete req.session.admin;
        return res.json({ message: 'logout successfull' });
    } else {
        return res.status(400).json({ message: 'No admin session found' });
    }
});


module.exports = router;
