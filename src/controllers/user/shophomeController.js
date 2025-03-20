import Product from '../../models/productModel.js';
import Category from '../../models/categoryModel.js';
import Offer from "../../models/offerModel.js"
import Wishlist from "../../models/wishlistModel.js";

const getHome = async (req, res) => {
    try {
        // Get active categories
        const activeCategories = await Category.find({ isActive: true }).distinct('_id');

        // Get active offers
        const activeOffers = await Offer.find({
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() },
            status: 'active'
        }).populate('categoryId');

        // Create maps for offers
        const productOfferMap = new Map();
        const categoryOfferMap = new Map();

        activeOffers.forEach(offer => {
            if (offer.offerType === 'product' && offer.productIds && offer.productIds.length > 0) {
                offer.productIds.forEach(productId => {
                    const productIdStr = productId.toString();
                    if (!productOfferMap.has(productIdStr) ||
                        productOfferMap.get(productIdStr).discount < offer.discount) {
                        productOfferMap.set(productIdStr, offer);
                    }
                });
            } else if (offer.offerType === 'category' && offer.categoryId) {
                const categoryIdStr = offer.categoryId._id.toString();
                if (!categoryOfferMap.has(categoryIdStr) ||
                    categoryOfferMap.get(categoryIdStr).discount < offer.discount) {
                    categoryOfferMap.set(categoryIdStr, offer);
                }
            }
        });

        // Fetch active products
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

        // Get user's wishlist if logged in
        let wishlistItems = [];
        if (req.session.user) {
            const wishlist = await Wishlist.findOne({ userId: req.session.user });
            if (wishlist) {
                wishlistItems = wishlist.items.map(item => item.productId.toString());
            }
        }

        // Process products with offers
        const processedProducts = products.map(product => {
            const productData = product.toObject();
            const productId = product._id.toString();

            // Get product-specific offer
            const productOffer = productOfferMap.get(productId);

            // Get category offer
            const categoryOffer = product.categoriesId ?
                categoryOfferMap.get(product.categoriesId._id.toString()) : null;

            // Calculate best discount
            let bestDiscount = 0;
            let appliedOffer = null;

            if (productOffer) {
                bestDiscount = Math.max(bestDiscount, productOffer.discount);
                appliedOffer = productOffer;
            }
            if (categoryOffer) {
                bestDiscount = Math.max(bestDiscount, categoryOffer.discount);
                appliedOffer = categoryOffer;
            }

            // Get minimum and maximum prices from sizes
            const minPrice = Math.min(...product.size.map(size => size.price));
            const maxPrice = Math.max(...product.size.map(size => size.price));

            // Calculate discounted price
            const discountedPrice = bestDiscount > 0 
                ? Math.round(minPrice * (1 - bestDiscount / 100))
                : minPrice;

            // Process each size with its own price and offer
            const processedSizes = product.size.map(size => ({
                size: size.size,
                stock: size.stock,
                price: size.price,
                offerPrice: Math.round(size.price * (1 - bestDiscount / 100))
            }));

            // Calculate total stock
            const totalStock = product.size.reduce((sum, size) => sum + size.stock, 0);

            // Check if product is in wishlist
            const isInWishlist = wishlistItems.includes(productId);

            return {
                ...productData,
                price: minPrice, // Original price
                maxPrice: maxPrice,
                offerPrice: discountedPrice, // Discounted price
                offerApplied: bestDiscount > 0,
                discountPercentage: bestDiscount,
                appliedOffer: appliedOffer,
                stock: totalStock,
                size: processedSizes,
                isInWishlist: isInWishlist
            };
        });

        res.render('user/home', {
            products: processedProducts,
            title: 'Home',
            isLoggedIn: !!req.session.user
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.render('user/home', {
            products: [],
            title: 'Home',
            isLoggedIn: !!req.session.user
        });
    }
};

const getShop = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 7;
        const search = req.query.search || '';
        const sort = req.query.sort || 'default';
        const size = req.query.size || '';
        const minPrice = req.query.minPrice ? Number(req.query.minPrice) : '';
        const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : '';
        const stock = req.query.stock || '';

        // Get active offers first
        const activeOffers = await Offer.find({
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() },
            status: 'active'
        }).populate('categoryId');

        // Create maps for both product and category offers
        const productOfferMap = new Map();
        const categoryOfferMap = new Map();

        activeOffers.forEach(offer => {
            if (offer.offerType === 'product') {
                offer.productIds.forEach(productId => {
                    // If multiple offers exist for same product, keep the highest discount
                    const existingOffer = productOfferMap.get(productId.toString());
                    if (!existingOffer || existingOffer.discount < offer.discount) {
                        productOfferMap.set(productId.toString(), offer);
                    }
                });
            } else if (offer.offerType === 'category' && offer.categoryId) {
                // If multiple offers exist for same category, keep the highest discount
                const existingOffer = categoryOfferMap.get(offer.categoryId.toString());
                if (!existingOffer || existingOffer.discount < offer.discount) {
                    categoryOfferMap.set(offer.categoryId.toString(), offer);
                }
            }
        });

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
        if (size && size !== '') {
            query['size'] = {
                $elemMatch: {
                    size: size,
                    stock: { $gt: 0 }
                }
            };
        }

        // Add stock filter
        if (stock === 'inStock') {
            query['size.stock'] = { $gt: 0 };
        } else if (stock === 'outOfStock') {
            // This will find products where all sizes have 0 stock
            query['size'] = { $not: { $elemMatch: { stock: { $gt: 0 } } } };
        }

        // Note: We'll handle price filtering after applying discounts
        // Removing the direct price query since it won't work with discounted prices

        // Build sort options
        let sortOptions = {};
        switch (sort) {
            case 'nameAZ':
                sortOptions.productName = 1;
                break;
            case 'nameZA':
                sortOptions.productName = -1;
                break;
            case 'priceLowToHigh':
            case 'priceHighToLow':
                // For price sorting, we'll handle it after applying offers
                sortOptions.createdAt = -1; // Default sorting, will be overridden
                break;
            case 'newArrivals':
                sortOptions.createdAt = -1;
                break;
            default:
                sortOptions.createdAt = -1;
        }

        // Get total count - we'll recalculate this after price filtering
        const totalProductsBeforeFilter = await Product.countDocuments(query);

        // Fetch products
        const allProducts = await Product.find(query)
            .populate('categoriesId')
            .sort(sortOptions);

        // Get user's wishlist if logged in
        let wishlistItems = [];
        if (req.session.user) {
            const wishlist = await Wishlist.findOne({ userId: req.session.user });
            if (wishlist) {
                wishlistItems = wishlist.items.map(item => item.productId.toString());
            }
        }

        // Process products and apply offers
        const productsWithPrices = allProducts.map(product => {
            const productData = product.toObject();
            const productId = product._id.toString();
            
            const productOffer = productOfferMap.get(productId);
            const categoryOffer = product.categoriesId ?
                categoryOfferMap.get(product.categoriesId.toString()) : null;

            // Calculate best discount
            let bestDiscount = 0;
            let appliedOffer = null;

            if (productOffer) {
                bestDiscount = Math.max(bestDiscount, productOffer.discount);
                appliedOffer = productOffer;
            }
            if (categoryOffer) {
                bestDiscount = Math.max(bestDiscount, categoryOffer.discount);
                appliedOffer = categoryOffer;
            }

            // Get minimum and maximum prices from sizes
            const minPrice = Math.min(...product.size.map(size => size.price));
            const maxPrice = Math.max(...product.size.map(size => size.price));

            // Calculate discounted price
            const discountedPrice = bestDiscount > 0 
                ? Math.round(minPrice * (1 - bestDiscount / 100))
                : minPrice;

            // Process each size with its own price and offer
            const processedSizes = product.size.map(size => ({
                size: size.size,
                stock: size.stock,
                price: size.price,
                offerPrice: Math.round(size.price * (1 - bestDiscount / 100))
            }));

            // Calculate total stock
            const totalStock = product.size.reduce((sum, size) => sum + size.stock, 0);

            // Check if product is in wishlist
            const isInWishlist = wishlistItems.includes(productId);

            return {
                ...productData,
                price: minPrice, // Original price
                maxPrice: maxPrice,
                offerPrice: discountedPrice, // Discounted price
                offerApplied: bestDiscount > 0,
                discountPercentage: bestDiscount,
                appliedOffer: appliedOffer,
                stock: totalStock,
                size: processedSizes,
                isInWishlist: isInWishlist,
                effectivePrice: discountedPrice // This is the price we'll use for filtering
            };
        });

        // Apply price-based sorting if needed
        if (sort === 'priceLowToHigh' || sort === 'priceHighToLow') {
            productsWithPrices.sort((a, b) => {
                const priceA = a.effectivePrice;
                const priceB = b.effectivePrice;
                
                return sort === 'priceLowToHigh' 
                    ? priceA - priceB  // Low to high
                    : priceB - priceA; // High to low
            });
        }

        // Apply price range filter now that we have calculated all effective prices
        let filteredProducts = productsWithPrices;
        if (minPrice || maxPrice) {
            filteredProducts = productsWithPrices.filter(product => {
                const effectivePrice = product.effectivePrice;
                
                if (minPrice && effectivePrice < minPrice) return false;
                if (maxPrice && effectivePrice > maxPrice) return false;
                return true;
            });
        }

        // Calculate pagination based on filtered products
        const totalProducts = filteredProducts.length;
        const totalPages = Math.ceil(totalProducts / limit);
        
        // Apply pagination to filtered products
        const paginatedProducts = filteredProducts.slice((page - 1) * limit, page * limit);

        const pagination = {
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        };

        // Handle AJAX requests
        if (req.xhr) {
            return res.json({
                products: paginatedProducts,
                pagination,
                isLoggedIn: !!req.session.user
            });
        }

        // Regular page load
        res.render('user/shop', {
            products: paginatedProducts,
            pagination,
            search,
            sort,
            isLoggedIn: !!req.session.user
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
            sort: 'default',
            isLoggedIn: !!req.session.user
        });
    }
};

export default {
    getHome,
    getShop,
};