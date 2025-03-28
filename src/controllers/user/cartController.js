import cartSchema from '../../models/cartModel.js'
import productSchema from '../../models/productModel.js'
import Category from '../../models/categoryModel.js'
import wishlistController from './wishlistController.js'
import Offer from '../../models/offerModel.js'
import { calculateFinalPrice } from '../../utils/calculateOffer.js'

const getCart  = async (req,res)=>{
    try{
        const userId = req.session.user;
        
        // Add error handling for stock issues
        let errorMessage = null;
        if (req.query.error === 'stock') {
            if (req.session.stockError) {
                errorMessage = req.session.stockError.map(error => 
                    `${error.productName} has only ${error.available} units available (you requested ${error.requested})`
                ).join('\n');
                delete req.session.stockError;
            }
        }

        //Get active categories
        const activeCategories = await Category.find({isActive:true}).distinct('_id');

        // Get active offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active',
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        });

        const cart = await cartSchema.findOne({
            userId
        }).populate({
            path:'items.productId',
            populate:{
                path:'categoriesId',
                match:{isActive:true}
            }
        });

        if(!cart){
            return res.render('user/cart',{
                cartItems:[],
                total:0,
                originalTotal: 0,
                totalDiscount: 0
            });
        }

        //Filter out items with inactive categories or products
        const validItems = cart.items.filter(item=>
            item.productId&&
            item.productId.categoriesId&&
            item.productId.isActive&&
            activeCategories.some(catId=>catId.equals(item.productId.categoriesId._id))
        );

        //Update cart if invalid items were removed
        if(validItems.length!==cart.items.length){
            cart.items=validItems;
            await cart.save();
        }

        // Process items with offers and check stock
        const updatedItems = await Promise.all(validItems.map(async item => {
            const product = item.productId;
            const quantity = parseInt(item.quantity) || 1;
            
            // Check stock for the specific size
            const sizeObj = product.size.find(s => s.size === item.size);
            const inStock = sizeObj && sizeObj.stock >= quantity;
            
            // Find applicable offers for this product
            const categoryOffer = activeOffers.find(offer => 
                offer.categoryId && offer.categoryId.equals(product.categoriesId._id)
            );
            const productOffer = activeOffers.find(offer => 
                offer.productIds && offer.productIds.some(id => id.equals(product._id))
            );

            // Calculate final price with offers
            const { finalPrice, appliedDiscount, discountPercentage, appliedOffer, originalPrice } = 
                calculateFinalPrice(product, categoryOffer, productOffer, item.size);

            const originalSubtotal = originalPrice * quantity;
            const finalSubtotal = finalPrice * quantity;
            const itemDiscount = originalSubtotal - finalSubtotal;

            // Update item in cart
            item.price = finalPrice;
            item.subtotal = finalSubtotal;
            item.originalPrice = originalPrice;
            item.discount = itemDiscount;
            item.discountPercentage = discountPercentage;
            item.appliedOffer = appliedOffer;

            return {
                product: {
                    _id: product._id,
                    productName: product.productName,
                    imageUrl: product.imageUrl,
                    stock: sizeObj ? sizeObj.stock : 0,
                    size: item.size,
                    inStock: inStock
                },
                quantity: quantity,
                price: finalPrice,
                originalPrice: originalPrice,
                subtotal: finalSubtotal,
                originalSubtotal: originalSubtotal,
                discount: itemDiscount,
                discountPercentage: discountPercentage,
                appliedOffer: appliedOffer
            };
        }));

        // Calculate totals
        const total = updatedItems.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
        const originalTotal = updatedItems.reduce((sum, item) => sum + (parseFloat(item.originalSubtotal) || 0), 0);
        const totalDiscount = originalTotal - total;

        // Update cart in database
        cart.items = cart.items.map((item, index) => ({
            ...item,
            price: updatedItems[index].price,
            subtotal: updatedItems[index].subtotal
        }));

        cart.total = total;
        await cart.save();

        res.render('user/cart', {
            cartItems: updatedItems,
            total: total,
            originalTotal: originalTotal,
            totalDiscount: totalDiscount,
            errorMessage,
            user: req.session.user
        });

    } catch(error) {
        console.error('Error fetching cart:', error);
        res.status(500).render('user/cart', {
            cartItems: [],
            total: 0,
            originalTotal: 0,
            totalDiscount: 0,
            error: 'Failed to load cart',
            user: req.session.user
        });
    }
};


const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
       
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to add items to cart'
            });
        }

        const { productId, quantity, size } = req.body;
       
        // Validate size is provided
        if (!size) {
            return res.status(400).json({
                success: false,
                message: 'Please select a size'
            });
        }

        // Get product with populated category
        const product = await productSchema.findById(productId).populate('categoriesId');
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if product is active and category is active
        if (!product.isActive || !product.categoriesId || !product.categoriesId.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Product is not available'
            });
        }

        // Validate size exists and has stock
        const sizeObj = product.size.find(s => s.size === size);
        if (!sizeObj) {
            return res.status(400).json({
                success: false,
                message: 'Invalid size selected'
            });
        }

        if (sizeObj.stock < quantity) {
            return res.status(400).json({
                success: false,
                message: 'Not enough stock available'
            });
        }

        // Get active offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active',
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        });

        // Find applicable offers
        const categoryOffer = activeOffers.find(offer => 
            offer.categoryId && offer.categoryId.equals(product.categoriesId._id)
        );
        const productOffer = activeOffers.find(offer => 
            offer.productIds && offer.productIds.some(id => id.equals(product._id))
        );

        // Calculate final price with offers
        const { finalPrice, appliedDiscount, discountPercentage, appliedOffer } = 
            calculateFinalPrice(product, categoryOffer, productOffer);

        let cart = await cartSchema.findOne({ userId });
        if (!cart) {
            cart = new cartSchema({
                userId,
                items: [{
                    productId,
                    quantity: parseInt(quantity),
                    price: finalPrice,
                    size: size,
                    subtotal: finalPrice * parseInt(quantity),
                    originalPrice: sizeObj.price,
                    discountPercentage: discountPercentage,
                    appliedOffer: appliedOffer
                }]
            });
        } else {
            // Check if product with same size exists in cart
            const existingItem = cart.items.find(item =>
                item.productId.toString() === productId &&
                item.size === size
            );

            if (existingItem) {

                  // Calculate new quantity
                  const newQuantity = existingItem.quantity + parseInt(quantity);

                  // Check if new quantity exceeds limit
                  if (newQuantity > 3) {
                      return res.status(400).json({
                          success: false,
                          message: `Cannot add more items. Maximum limit is 3 (Current quantity: ${existingItem.quantity})`
                      });
                  }
  
                  // Update quantity and price
                  existingItem.quantity = newQuantity;
                  existingItem.price = finalPrice;
                  existingItem.subtotal = finalPrice * newQuantity;
                  existingItem.originalPrice = sizeObj.price;
                  existingItem.discountPercentage = discountPercentage;
                  existingItem.appliedOffer = appliedOffer;
                // Item already exists in cart
                return res.status(200).json({
                    success: true,
                    alreadyInCart: true,
                    message: 'Item is already in your cart',
                    cartCount: cart.items.length
                });
            } else {
                // Add new item
                cart.items.push({
                    productId,
                    quantity: parseInt(quantity),
                    price: finalPrice,
                    size: size,
                    subtotal: finalPrice * parseInt(quantity),
                    originalPrice: sizeObj.price,
                    discountPercentage: discountPercentage,
                    appliedOffer: appliedOffer
                });
            }
        }

        // Calculate cart totals
        const total = cart.items.reduce((sum, item) => sum + item.subtotal, 0);
        cart.total = total;
        await cart.save();

        // Remove from wishlist after successfully adding to cart
        await wishlistController.removeFromWishlistAfterCart(userId, productId);
       
        res.json({ 
            success: true, 
            message: 'Item added to cart',
            cartCount: cart.items.length
        });

    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add item to cart',
            error: error.message
        });
    }
};

//Update quantity in cart
const updateQuantity = async (req,res)=>{
    try{
        const {productId, quantity, size}=req.body;
        const userId = req.session.user;

        if(quantity<1){
            return res.status(400).json({
                message:'Quantity must be atleast one'
            });
        }

        // Get active offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            status: 'active',
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        });

        //check product availability and stock
        const product = await productSchema.findById(productId).populate({
            path: 'categoriesId',
            match: { isActive: true }
        });

        if(!product||!product.isActive||!product.categoriesId){
            return res.status(400).json({
                message:'Product is not available'
            });
        }

        //find and update cart
        const cart = await cartSchema.findOne({userId}).populate({
            path: 'items.productId',
            populate: {
                path: 'categoriesId',
                match: { isActive: true }
            }
        });

        if(!cart){
            return res.status(404).json({
                message:'Cart not found'
            });
        }

        // Find the specific variant in cart (match both productId AND size)
        const cartItem = cart.items.find(item=>
            item.productId._id.toString()===productId && 
            item.size === size
        );
        
        if(!cartItem){
            return res.status(404).json({
                message:'Product variant not found in cart'
            });
        }

        // Check stock for the specific size
        const sizeObj = product.size.find(s => s.size === size);
        if (!sizeObj || sizeObj.stock < quantity) {
            return res.status(400).json({
                message: 'Not enough stock available for this size'
            });
        }

        // Calculate prices with offers
        const categoryOffer = activeOffers.find(offer => 
            offer.categoryId && offer.categoryId.equals(product.categoriesId._id)
        );
        const productOffer = activeOffers.find(offer => 
            offer.productIds && offer.productIds.some(id => id.equals(product._id))
        );

        const { finalPrice, appliedDiscount, discountPercentage, originalPrice } = 
            calculateFinalPrice(product, categoryOffer, productOffer, size);

        // Update cart item
        cartItem.quantity = quantity;
        cartItem.price = finalPrice;
        cartItem.subtotal = finalPrice * quantity;
        cartItem.originalPrice = originalPrice;
        await cart.save();

        // Calculate totals for all items
        let total = 0;
        let originalTotal = 0;

        cart.items.forEach(item => {
            const itemProduct = item.productId;
            const itemQuantity = item.quantity;
            const { finalPrice, originalPrice } = calculateFinalPrice(
                itemProduct, 
                activeOffers.find(o => o.categoryId && o.categoryId.equals(itemProduct.categoriesId._id)),
                activeOffers.find(o => o.productIds && o.productIds.some(id => id.equals(itemProduct._id))),
                item.size
            );
            
            total += finalPrice * itemQuantity;
            originalTotal += originalPrice * itemQuantity;
        });

        res.status(200).json({ 
            success: true,
            message: 'Quantity updated successfully',
            quantity: quantity,
            price: finalPrice,
            originalPrice: originalPrice,
            subtotal: finalPrice * quantity,
            originalSubtotal: originalPrice * quantity,
            discountPercentage: discountPercentage,
            total: total,
            originalTotal: originalTotal,
            totalDiscount: originalTotal - total,
            itemCount: cart.items.length
        });

    }catch(error){
        console.error('Error updating quantity:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update quantity' 
        });
    }
};

const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.params;
        const { size } = req.body; // Get size from request body
        const userId = req.session.user;

        // Find the cart
        const cart = await cartSchema.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        // Remove the specific variant (match both productId AND size)
        cart.items = cart.items.filter(item => 
            !(item.productId.toString() === productId && item.size === size));

        await cart.save();

        // Calculate new totals
        const updatedCart = await cartSchema.findOne({ userId }).populate('items.productId');
        const cartItems = updatedCart.items.map(item => ({
            product: item.productId,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.quantity * item.price
        }));

        const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

        res.status(200).json({ 
            message: 'Item removed from cart',
            total,
            itemCount: cart.items.length
        });

    } catch (error) {
        console.error('Error removing item from cart:', error);
        res.status(500).json({ message: 'Failed to remove item from cart' });
    }
};

export default {
    getCart,
    addToCart,
    updateQuantity,
    removeFromCart,
};