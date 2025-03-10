import cartSchema from '../../models/cartModel.js';
import addressSchema from '../../models/addressModel.js';
import productSchema from '../../models/productModel.js';
import orderSchema from '../../models/orderModel.js';
import Coupon from '../../models/couponModel.js';
import razorpay from '../../utils/razorpay.js';
import crypto from 'crypto';


// Helper function (keep this at the top of the file)
function calculateProportionalDiscounts(items, totalDiscount) {
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    return items.map(item => {
        const itemTotal = item.price * item.quantity;
        const proportionalRatio = itemTotal / totalAmount;
        const itemDiscount = totalDiscount * proportionalRatio;
        const discountPerUnit = itemDiscount / item.quantity;
        return {
            ...item,
            discountedPrice: Number((item.price - discountPerUnit).toFixed(2)),
            subtotal: Number((item.quantity * (item.price - discountPerUnit)).toFixed(2))
        };
    });
}

const getCheckoutPage = async (req, res) => {
    try {
        //get users addresses
        const addresses = await addressSchema.find({
            userId: req.session.user
        });

        //get cart items with populated product details
        const cart = await cartSchema.findOne({ userId: req.session.user })
            .populate({
                path: 'items.productId',
                model: 'Product',
                select: 'productName size price'
            });

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.redirect('/cart');
        }

        //populate product details and calculate subtotals
        const populatedCart = await cartSchema.findOne({ userId: req.session.user })
            .populate({
                path: 'items.productId',
                model: 'Product',
                select: 'productName imageUrl price stock'
            });


        //check stock availability with detailed logging
        const stockValidationResults = populatedCart.items.map(item => ({
            productName: item.productId.productName,
            requested: item.quantity,
            available: item.productId.stock,
            hasError: item.productId.stock < item.quantity
        }));

        const hasStockError = stockValidationResults.some(item => item.hasError);

        if (hasStockError) {

            // Store the detailed error information in session
            req.session.stockError = stockValidationResults.filter(item => item.hasError);
            return res.redirect('/cart?error=stock');
        }



        //format cart items for the template 
        const cartItems = populatedCart.items.map(item => ({
            product: {
                _id: item.productId._id,
                productName: item.productId.productName,
                imageUrl: item.productId.imageUrl,
            },
            quantity: item.quantity,
            price: item.price,
            subtotal: item.quantity * item.price
        }));

        //calculate total
        const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

        res.render('user/checkout', {
            addresses,
            cartItems,
            total,
            user: req.session.user
        });
    } catch (error) {
        console.error('Checkout page error', error);
        res.status(500).render('notFound', {
            message: 'Error loading checkout page',
            user: req.session.user
        });
    }
};

const placeOrder = async (req, res) => {
    try {
        const { addressId, paymentMethod } = req.body;
        const userId = req.session.user;

        // Validate inputs
        if (!addressId || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Get cart and validate
        const cart = await cartSchema.findOne({ userId })
            .populate({
                path: 'items.productId',
                model: 'Product',
                select: 'productName size price'
            });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Calculate the total amount
        const finalAmount = cart.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

        // Validate COD payment method
        if (paymentMethod === 'cod' && finalAmount > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Cash on Delivery is not available for orders above ₹1000. Please choose a different payment method.'
            });
        }

        const orderItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.price,
            size: item.size,
            subtotal: item.quantity * item.price,
            order: {
                status: paymentMethod === 'cod' ? 'processing' : 'pending',
                statusHistory: [{
                    status: paymentMethod === 'cod' ? 'processing' : 'pending',
                    date: new Date(),
                    comment: paymentMethod === 'cod' ?
                        'Order confirmed with cash on delivery' :
                        'Order placed, awaiting payment'
                }]
            },
            return: {
                isReturnRequested: false,
                reason: null,
                requestDate: null,
                status: null,
                adminComment: null,
                isReturnAccepted: false
            }
        }));

        //get address 
        const address = await addressSchema.findOne({
            _id: addressId,
            userId
        });

        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Delivery address not found'
            });
        }

        const order = await orderSchema.create({
            userId,
            items: orderItems,
            totalAmount: finalAmount,
            shippingAddress: {
                fullName: address.fullName,
                mobileNumber: address.mobileNumber,
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2,
                city: address.city,
                state: address.state,
                pincode: address.pincode
            },
            payment: {
                method: paymentMethod,
                paymentStatus: paymentMethod === 'cod' ? 'processing' : 'completed'
            }
        });

        //update product stock
        for (const item of orderItems) {
            await productSchema.findOneAndUpdate(
                {
                    _id: item.product,
                    'size.size': item.size
                },
                {
                    $inc: {
                        'size.$.stock': -item.quantity
                    }
                }
            );
        }

        //clear cart 
        await cartSchema.findByIdAndUpdate(cart._id, {
            items: [],
            totalAmount: 0
        });

        res.json({
            success: true,
            message: 'Order placed successfully',
            orderId: order.orderCode
        });

    } catch (error) {
        console.error('Place order error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error placing order'
        });
    }
}

const getAvailableCoupons = async (req, res, next) => {
    try {
        const userId = req.session.user;

        //get only active coupons within valid date range
        const coupons = await Coupon.find({
            isActive: true,
            startDate: { $lte: new Date() },
            expiryDate: { $gte: new Date() }
        }).select('-usedBy');

        //get users cart total for minimuun purchase validation
        const cart = await cartSchema.findOne({
            userId
        }).populate('items.productId');


        const cartTotal = cart.items.reduce(
            (sum, item) => sum + (item.quantity * item.price), 0
        );


        //add validation info to each coupon
        const processedCoupons = await Promise.all(coupons.map(async (coupon) => {
            const userUsageCount = await Coupon.countDocuments({
                code: coupon.code,
                'usedBy.userId': userId
            });


            return {
                ...coupon.toObject(),
                isApplicable:
                    cartTotal >= coupon.minimumPurchase &&
                    (!coupon.totalCoupon || coupon.usedCouponCount < coupon.totalCoupon) &&
                    userUsageCount < coupon.userUsageLimit
            };
        }));

        res.json({
            success: true,
            coupons: processedCoupons
        });
    } catch (error) {
        next(error)
    }
};


const applyCoupon = async (req, res, next) => {
    try {
        const { code } = req.body;
        const userId = req.session.user;

        //find the coupon
        const coupon = await Coupon.findOne({
            code: code.toUpperCase(),
            isActive: true,
            startDate: { $lte: new Date() },
            expiryDate: { $gte: new Date() }
        });

        if (!coupon) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired coupon'
            });
        }

        // Check total coupon usage limit first
        if (coupon.totalCoupon !== null) {
            if (coupon.usedCouponCount >= coupon.totalCoupon) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon limit has been exceeded. This coupon is no longer available.'
                });
            }
        }

        // Check individual user usage limit
        const userUsageCount = coupon.usedBy.filter(
            usage => usage.userId.toString() === userId.toString()
        ).length;

        if (userUsageCount >= coupon.userUsageLimit) {
            return res.status(400).json({
                success: false,
                message: `You have exceeded the usage limit (${coupon.userUsageLimit}) for this coupon`
            });
        }

        //get cart total 
        const cart = await cartSchema.findOne({ userId })
            .populate('items.productId');

        const cartTotal = cart.items.reduce(
            (sum, item) => sum + (item.quantity * item.price),
            0
        );

        //check minimum purchase required
        if (cartTotal < coupon.minimumPurchase) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minimumPurchase} required`
            });
        }

        //calculate discount 
        let discount = (cartTotal * coupon.discountPercentage) / 100;
        if (coupon.maximumDiscount) {
            discount = Math.min(discount, coupon.maximumDiscount);
        }

        res.json({
            success: true,
            discount,
            couponCode: coupon.code,
            message: 'Coupon applied successfully'
        });

    } catch (error) {
        next(error)
    }
}

const removeCoupon = async (req, res, next) => {
    try {
        res.json({
            success: true,
            message: 'Coupon removed successfully'
        });
    } catch (error) {
        next(error)
    }
}


const createRazorpayOrder = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const { addressId, couponCode } = req.body;

        // Get cart and validate
        const cart = await cartSchema.findOne({ userId })
            .populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Check stock availability for each item's specific size
        for (const item of cart.items) {
            const sizeData = item.productId.size.find(s => s.size === item.size);
            if (!sizeData) {
                return res.status(400).json({
                    success: false,
                    message: `Size ${item.size} not found for product ${item.productId.productName}`
                });
            }
            if (sizeData.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${item.productId.productName} in size ${item.size}. Available: ${sizeData.stock}, Requested: ${item.quantity}`
                });
            }
        }

        // Get address
        const address = await addressSchema.findOne({
            _id: addressId,
            userId
        });

        if (!address) {
            return res.status(400).json({
                success: false,
                message: 'Delivery address not found'
            });
        }

        // Calculate total with coupon discount
        const cartTotal = cart.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
        let couponDiscount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode });
            if (coupon) {
                couponDiscount = Math.min(
                    (cartTotal * coupon.discountPercentage) / 100,
                    coupon.maximumDiscount || Infinity
                );
            }
        }
        const finalAmount = cartTotal - couponDiscount;

        // Create razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(finalAmount * 100),
            currency: "INR",
            receipt: `order_${Date.now()}`
        });

        // Prepare initial items with all required fields including size
        const initialItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.price,
            size: item.size,  // Include size from cart item
            subtotal: item.quantity * item.price  // Add subtotal as it's required
        }));

        // Calculate proportional discounts and prepare order items
        const discountedItems = calculateProportionalDiscounts(initialItems, couponDiscount);
        const orderItems = discountedItems.map(item => ({
            ...item,
            order: {
                status: 'processing',
                statusHistory: [{
                    status: 'processing',
                    date: new Date(),
                    comment: 'Order initiated'
                }]
            }
        }));

        // Store order details in session
        req.session.pendingOrder = {
            razorpayOrderId: razorpayOrder.id,
            orderData: {
                userId,
                items: orderItems,  // Now includes size for each item
                totalAmount: finalAmount,
                coupon: couponCode ? {
                    code: couponCode,
                    discount: couponDiscount
                } : {},
                shippingAddress: {
                    fullName: address.fullName,
                    mobileNumber: address.mobileNumber,
                    addressLine1: address.addressLine1,
                    addressLine2: address.addressLine2,
                    city: address.city,
                    state: address.state,
                    pincode: address.pincode
                },
                payment: {
                    method: 'razorpay',
                    paymentStatus: 'processing'
                }
            }
        };

        res.json({
            success: true,
            key: process.env.RAZORPAY_KEY_ID,
            order: razorpayOrder,
            orderId: razorpayOrder.id
        });

    } catch (error) {
        next(error);
    }
};



const verifyPayment = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId
        } = req.body;

        // Verify signature
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature !== expectedSign) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        // Handle payment retry case
        if (orderId) {
            const order = await orderSchema.findOne({
                _id: orderId,
                userId,
                'payment.method': 'razorpay'
            });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found or already processed'
                });
            }

            // Update order with payment details
            order.payment.paymentStatus = 'completed';
            order.payment.razorpayTransaction = {
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature
            };

            // Update status for all items
            order.items.forEach(item => {
                item.order.status = 'processing';
                item.order.statusHistory.push({
                    status: 'processing',
                    date: new Date(),
                    comment: 'Payment completed successfully'
                });
            });

            await order.save();

            return res.json({
                success: true,
                message: 'Payment verified successfully',
                orderId: order.orderCode
            });
        }

        // Handle new order case
        const pendingOrder = req.session.pendingOrder;
        if (!pendingOrder || pendingOrder.razorpayOrderId !== razorpay_order_id) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order session'
            });
        }

        // Get cart and validate
        const cart = await cartSchema.findOne({ userId })
            .populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Create order with completed payment status
        const order = await orderSchema.create({
            ...pendingOrder.orderData,
            payment: {
                method: 'razorpay',
                paymentStatus: 'completed',
                razorpayTransaction: {
                    razorpayOrderId: razorpay_order_id,
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature
                }
            }
        });

        // Update product stock with correct schema structure
        for (const item of cart.items) {
            await productSchema.findOneAndUpdate(
                {
                    _id: item.productId._id,
                    'size.size': item.size
                },
                {
                    $inc: {
                        'size.$.stock': -item.quantity
                    }
                }
            );
        }

        // Clear cart
        await cartSchema.findByIdAndUpdate(cart._id, {
            items: [],
            totalAmount: 0
        });

        // Clear session data
        delete req.session.pendingOrder;
        delete req.session.appliedCoupon;

        res.json({
            success: true,
            message: 'Order placed successfully',
            orderId: order.orderCode
        });

    } catch (error) {
        next(error);
    }
};

const handlePaymentFailure = async (req, res, next) => {
    try {
        const { error, razorpay_order_id } = req.body;
        const userId = req.session.user;
        const pendingOrder = req.session.pendingOrder;

        if (!pendingOrder) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order session'
            });
        }

        // Update order items with pending status
        const orderItems = pendingOrder.orderData.items.map(item => ({
            ...item,
            order: {
                status: 'pending',
                statusHistory: [{
                    status: 'pending',
                    date: new Date(),
                    comment: 'Payment failed: ' + (error.description || 'Payment was not completed')
                }]
            }
        }));

        // Create or update order with failed status
        const orderData = {
            ...pendingOrder.orderData,
            items: orderItems,
            payment: {
                method: 'razorpay',
                paymentStatus: 'failed',
                razorpayTransaction: {
                    razorpayOrderId: razorpay_order_id
                }
            }
        };

        let order;
        if (pendingOrder.orderId) {
            // Update existing failed order
            order = await orderSchema.findByIdAndUpdate(
                pendingOrder.orderId,
                orderData,
                { new: true }
            );
        } else {
            // Create new failed order
            order = await orderSchema.create(orderData);
        }

        // Clear the cart after creating the order
        const cart = await cartSchema.findOne({ userId });
        if (cart) {
            await cartSchema.findByIdAndUpdate(cart._id, {
                items: [],
                totalAmount: 0
            });
        }

        // Clear the pending order from session
        delete req.session.pendingOrder;

        res.json({
            success: false,
            message: 'Payment failed',
            orderId: order.orderCode,
            error: error.description || 'Payment was not completed'
        });

    } catch (error) {
        next(error)
    }
}

export default {
    getCheckoutPage,
    placeOrder,
    getAvailableCoupons,
    applyCoupon,
    removeCoupon,
    createRazorpayOrder,
    verifyPayment,
    handlePaymentFailure
}


