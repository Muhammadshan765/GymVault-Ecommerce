import orderSchema from "../../models/orderModel.js";
import userSchema from "../../models/userModel.js";
import productSchema from "../../models/productModel.js";

const getOrders = async (req, res) => {
    try {
            const user = await userSchema.findById(req.session.user)
            const userId= req.session.user
            const page=parseInt(req.query.page) || 1;
            const limit=5;

            const totalOrders = await orderSchema.countDocuments({userId})
            const totalPages = Math.ceil(totalOrders/limit);

            const orders = await orderSchema.find({userId})
            .sort({createdAt:-1})
            .skip((page-1)*limit)
            .limit(limit)
            .populate('items.product')

         // Process orders to handle null products
         const processedOrders = orders.map(order => {
            const orderObj = order.toObject();
            orderObj.items = orderObj.items.map(item => ({
                ...item,
                product: item.product || {
                    productName: 'Product Unavailable',
                    imageUrl: ['/images/placeholder.jpg'], // Provide a default image path
                    price: item.price || 0
                }
            }));
            return orderObj;
        });
            
        res.render("user/viewOrder",{
          orders:processedOrders,
          currentPage:page,
          totalPages,
          hasNextPage:page<totalPages,
          hasPreviousPage:page>1,
          user
        });



    } catch (error) {

        console.error('Get orders error', error);
        res.status(500).json({
            message: 'Error fetching orders'
        });

    }
}

const cancelOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { reason } = req.body;
        const userId = req.session.user;

        const order = await orderSchema.findOne({ _id: orderId, userId })
            .populate('items.product');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const itemIndex = order.items.findIndex(item =>
            item.product._id.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in order'
            });
        }

        const item = order.items[itemIndex];

        if (!['pending', 'processing'].includes(item.order.status)) {
            return res.status(400).json({
                success: false,
                message: 'This item cannot be cancelled at this stage'
            });
        }

        // Get the product
        const product = await productSchema.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Get the size from the cart/order history
        const orderSize = item.size;

        // Find the specific size in the product's size array
        const sizeIndex = product.size.findIndex(s => s.size === orderSize);

        if (sizeIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Size not found in product'
            });
        }

        // Calculate new stock for the specific size
        const currentStock = product.size[sizeIndex].stock;
        const quantityToAdd = Number(item.quantity);
        const newStock = currentStock + quantityToAdd;

        // Update the stock for the specific size
        product.size[sizeIndex].stock = newStock;
        await product.save();

        //update item status
        item.order.status = 'cancelled';
        item.order.statusHistory.push({
            status: 'cancelled',
            date: new Date(),
            comment: `Item cancelled by user:${reason}`
        });

        await order.save();

        res.json({
            success: true,
            message: 'Item cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel item error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error cancelling item'
        });
    }
};

const requestReturnItem = async (req, res, next) => {
    try {
        console.log("requested ITem Route");
        
        const { orderId, productId } = req.params;
        const { reason } = req.body;
        const userId = req.session.user;

        const order = await orderSchema.findOne({ _id: orderId, userId })
            .populate('items.product');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        //find the specific item
        const itemIndex = order.items.findIndex(item =>
            item.product._id.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in order'
            });
        }

        const item = order.items[itemIndex];

        //check if item is delivered
        if (item.order.status !== 'delivered') {
            return res.status(400).json({
                success: false,
                message: 'Only delivered items can be returned'
            });
        }

        //check if return is already requested
        if (item.return?.isReturnRequested) {
            return res.status(400).json({
                success: false,
                message: 'Return already requested for this item'
            });
        }

        //check return window
        const deliveryDate = item.order.statusHistory
            .find(h => h.status === 'delivered')?.date;

        if (!deliveryDate) {
            return res.status(400).json({
                success: false,
                message: 'Delivery date not found'
            });
        }

        const daysSinceDelivery = Math.floor(
            (Date.now() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceDelivery > 7) {
            return res.status(400).json({
                success: false,
                message: 'Return window has expired'
            });
        }

        //update return status for the item 
        item.return = {
            isReturnRequested: true,
            reason: reason,
            requestDate: new Date(),
            status: 'pending',
            adminComment: null,
            isReturnAccepted: false
        };

        //update item status and add to history
        item.order.status = 'processing';  // Using a valid enum value
        item.order.statusHistory.push({
            status: 'processing',          // Using the same valid enum value
            date: new Date(),
            comment: `Return requested: ${reason}`
        });

        //update payment status if payment was made
        if (['wallet', 'online', 'razorpay'].includes(order.payment.method) &&
            order.payment.paymentStatus === 'completed') {
            order.payment.paymentStatus = 'processing';  // Using a valid enum value
        }

        // Mark the modified paths
        order.markModified('items');
        order.markModified('payment');

        await order.save();
        console.log(order,"retrun requested");
        
        res.json({
            success: true,
            message: 'Return requested successfully'
        });

    } catch (error) {
        console.error('Return request error:', error);
        next(error);
    }
};


export default {
    getOrders,
    cancelOrder,
    requestReturnItem
}


