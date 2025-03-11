import Product from '../../models/productModel.js';
import { calculateFinalPrice } from '../../utils/calculateOffer.js';
import Offer from "../../models/offerModel.js"


const getProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId)
            .populate('categoriesId');

        if (!product || !product.isActive) {
            return res.status(404).redirect('/home');
        }

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

        // Process the product data
        const processedProduct = {
            ...product.toObject(),
            productName: product.productName || '',
            brand: product.brand || '',
            description: product.description || '',
            originalPrice: priceDetails.minPrice,
            maxPrice: priceDetails.maxPrice,
            discountPrice: priceDetails.finalPrice,
            offerApplied: priceDetails.appliedDiscount > 0,
            offerPercentage: priceDetails.discountPercentage,
            appliedOffer: priceDetails.appliedOffer,
            size: product.size.map(size => ({
                size: size.size,
                stock: size.stock,
                price: size.price,
                offerPrice: Math.round(size.price * (1 - (priceDetails.discountPercentage / 100)))
            })),
            imageUrl: product.imageUrl || [],
            rating: product.rating || 0
        };

        // Calculate total stock
        processedProduct.stock = processedProduct.size.reduce((total, item) => total + (item.stock || 0), 0);

        // Initialize selectedSize with the first available size
        const selectedSize = processedProduct.size.length > 0 ? processedProduct.size[0].size : null;

        // Find related products from the same category
        const relatedProducts = await Product.find({
            categoriesId: product.categoriesId,
            isActive: true,
            _id: { $ne: productId }
        })
        .limit(4);

        // Process related products with discounts
        const processedRelatedProducts = await Promise.all(relatedProducts.map(async (p) => {
            const productOffers = await Offer.find({
                status: 'active',
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() },
                $or: [
                    { productIds: p._id },
                    { categoryId: p.categoriesId }
                ]
            });

            const pProductOffer = productOffers.find(offer =>
                offer.productIds && offer.productIds.some(id => id.equals(p._id))
            );

            const pCategoryOffer = productOffers.find(offer =>
                offer.categoryId && offer.categoryId.equals(p.categoriesId)
            );

            const pPriceDetails = calculateFinalPrice(p, pCategoryOffer, pProductOffer);

            // Process each size with its own price and offer
            const processedSizes = p.size.map(size => ({
                size: size.size,
                stock: size.stock,
                price: size.price,
                offerPrice: Math.round(size.price * (1 - (pPriceDetails.discountPercentage / 100)))
            }));

            return {
                ...p.toObject(),
                productName: p.productName || '',
                brand: p.brand || '',
                originalPrice: pPriceDetails.minPrice,
                maxPrice: pPriceDetails.maxPrice,
                discountPrice: pPriceDetails.finalPrice,
                offerApplied: pPriceDetails.appliedDiscount > 0,
                offerPercentage: pPriceDetails.discountPercentage,
                appliedOffer: pPriceDetails.appliedOffer,
                imageUrl: p.imageUrl || [],
                size: processedSizes
            };
        }));

        res.render('user/viewProduct', {
            product: processedProduct,
            relatedProducts: processedRelatedProducts,
            title: processedProduct.productName,
            selectedSize: selectedSize
        });

    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).redirect('/home');
    }
};

export default {
    getProductDetails,
}; 