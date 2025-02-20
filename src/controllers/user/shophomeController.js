import Product from '../../models/productModel.js';
import Category from '../../models/categoryModel.js';

const getHome = async (req, res) => {
    try {
        // Get IDs of active categories
        const activeCategories = await Category.find({ isActive: true }).distinct('_id');

        // Fetch active products with active categories
        const products = await Product.find({ 
            isActive: true,
            categoriesId: { $in: activeCategories }
        })
        .populate({
            path: 'categoriesId',
            match: { isActive: true }
        })
        .sort({ createdAt: -1 })
        .limit(5);

        // Filter out products where category wasn't populated (extra safety check)
        const filteredProducts = products.filter(product => product.categoriesId);

        res.render('user/home', { 
            products: filteredProducts,
            title: 'Home'
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.render('user/home', { 
            products: [],
            title: 'Home'
        });
    }
};

const getShop = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const search = req.query.search || '';
        const sort = req.query.sort || 'default';
        const size = req.query.size || '';
        const minPrice = req.query.minPrice ? Number(req.query.minPrice) : '';
        const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : '';
        const stock = req.query.stock || '';

        // Get active categories
        const activeCategories = await Category.find({ isActive: true }).distinct('_id');

        // Build base query
        let query = { 
            isActive: true,
            categoriesId: { $in: activeCategories }
        };

        // Add search filter
        if (search) {
            query.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }

        // Add size filter
        if (size) {
            query.size = { $in: [size.size] };
        }

        // Add price range filter
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = Number(minPrice);
            if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        // Add stock filter
        if (stock === 'inStock') {
            query.stock = { $gt: 0 };
        } else if (stock === 'outOfStock') {
            query.stock = 0;
        }

        // Build sort options
        let sortOptions = {};
        switch (sort) {
            case 'priceLowToHigh':
                sortOptions.price = 1;
                break;
            case 'priceHighToLow':
                sortOptions.price = -1;
                break;
            case 'newArrivals':
                sortOptions.createdAt = -1;
                break;
            default:
                sortOptions.createdAt = -1;
        }

        // Get total count
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Fetch products
        const products = await Product.find(query)
            .populate('categoriesId')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(limit);

        const pagination = {
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        };

        // Handle AJAX requests
        if (req.xhr) {
            return res.json({
                products: products,
                pagination
            });
        }

        // Regular page load
        res.render('user/shop', {
            products: products,
            pagination,
            search,
            sort
        });

    } catch (error) {
        console.error('Shop page error:', error);
        if (req.xhr) {
            return res.status(500).json({ error: 'Error loading products' });
        }
        res.render('user/shop', {
            products: [],
            pagination: { 
                currentPage: 1, 
                totalPages: 1, 
                hasNextPage: false, 
                hasPrevPage: false 
            },
            search: '',
            sort: 'default'
        });
    }
};

export default {
    getHome,
    getShop,
};