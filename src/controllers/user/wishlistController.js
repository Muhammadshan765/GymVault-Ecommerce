import Wishlist from "../../models/wishlistModel.js";
import Product from "../../models/productModel.js";
import Offer from "../../models/offerModel.js";
import { calculateFinalPrice } from "../../utils/calculateOffer.js";

const getWishlist = async (req, res, next) => {
    try {
        const userId = req.session.user;

        // Get wishlist with populated products
        const wishlist = await Wishlist.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: {
                    path: 'categoriesId'
                }
            });

        if (!wishlist) {
            return res.render('user/wishlist', {
                wishlist: [],
                user: req.session.user
            });
        }

        // Process each product with offers and discounts
        const processedItems = await Promise.all(wishlist.items.map(async (item) => {
            const product = item.productId;

            // Fetch active offers for this product and its category
            const offers = await Offer.find({
                status: 'active',
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() },
                $or: [
                    { productIds: product._id },
                    { categoryId: product.categoriesId._id }
                ]
            });

            const productOffer = offers.find(offer =>
                offer.productIds && offer.productIds.some(id => id.equals(product._id))
            );

            const categoryOffer = offers.find(offer =>
                offer.categoryId && offer.categoryId.equals(product.categoriesId._id)
            );

            // Calculate final price with offers
            const priceDetails = calculateFinalPrice(product, categoryOffer, productOffer);

            // Process each size with its own price and offer
            const processedSizes = product.size.map(size => ({
                size: size.size,
                stock: size.stock,
                price: size.price,
                offerPrice: Math.round(size.price * (1 - (priceDetails.discountPercentage / 100)))
            }));

            return {
                ...item.toObject(),
                productId: {
                    ...product.toObject(),
                    originalPrice: priceDetails.minPrice,
                    maxPrice: priceDetails.maxPrice,
                    discountPrice: priceDetails.finalPrice,
                    offerApplied: priceDetails.appliedDiscount > 0,
                    offerPercentage: priceDetails.discountPercentage,
                    appliedOffer: priceDetails.appliedOffer,
                    size: processedSizes
                }
            };
        }));

        res.render('user/wishlist', {
            wishlist: processedItems,
            user: req.session.user
        });
    } catch (error) {
        next(error);
    }
};

const addToWishlist = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const { productId, size } = req.body;

        if (!size) {
            return res.status(400).json({
                success: false,
                message: 'Size is required'
            });
        }

        // Check if product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Validate size exists for product
        const sizeExists = product.size.some(s => s.size === size);
        if (!sizeExists) {
            return res.status(400).json({
                success: false,
                message: 'Invalid size selected'
            });
        }

        // Find or create wishlist
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
        }

        // Check if product with same size is already in wishlist
        const existingItem = wishlist.items.find(
            item => item.productId.toString() === productId && item.size === size
        );

        if (existingItem) {
            return res.status(400).json({
                success: false,
                message: 'Product with selected size already in wishlist'
            });
        }

        // Add to wishlist
        wishlist.items.push({ productId, size });
        await wishlist.save();

        res.json({
            success: true,
            message: 'Product added to wishlist'
        });

    } catch (error) {
        next(error);
    }
};

//   remove item from wishlist
const removeFromWishlist = async (userId, productId) => {
    try {
        const wish = await Wishlist.updateOne(
            { userId },
            { $pull: { items: { productId } } }
        );
        return wish.modifiedCount > 0;
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        return false;
    }
};

const removeWishlist = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const productId = req.params.productId;

        const removed = await removeFromWishlist(userId, productId);

        if (!removed) {
            return res.status(404).json({
                success: false,
                message: 'Product not found in wishlist'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Product removed from wishlist'
        });
    } catch (error) {
        next(error)
    }
};

// Function to remove item from wishlist when added to cart
const removeFromWishlistAfterCart = async (userId, productId) => {
    try {
        // const removed = 
        await removeFromWishlist(userId, productId);
        // if (removed) {
        //     console.log(`Product ${productId} removed from wishlist after adding to cart`);
        // }
    } catch (error) {
        console.error('Error removing from wishlist after cart:', error);
    }
};

export default {
    getWishlist,
    addToWishlist,
    removeWishlist,
    removeFromWishlistAfterCart
}

