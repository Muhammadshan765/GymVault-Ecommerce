import orderSchema from '../../models/orderModel.js';
import productSchema from '../../models/productModel.js';

const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page || 1);
        const limit = 5;
        const skip = (page - 1) * limit;

        //get filter parameters
        const status = req.query.status;
        const dateFrom = req.query.dateFrom;
        const dateTo = req.query.dateTo;

        //build filter object 
        let filter = {};

        //exclude pending status by default 
        filter['items.order.status'] = { $ne: 'pending' };

        //add additional status filter if provided
        if (status) {
            filter['items.order.status'] = status;
        }

        if (dateFrom || dateTo) {
            filter.orderDate = {};
            if (dateFrom) filter.orderDate.$gte = new Date(dateFrom);
            if (dateTo) filter.orderDate.$lte = new Date(dateTo);
        }

        // Add filter to also show orders with return requests
        filter = {
            $or: [
                { 'items.order.status': { $ne: 'pending' } },
                { 'items.return.isReturnRequested': true }
            ]
        };

        const totalOrders = await orderSchema.countDocuments(filter);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await orderSchema.find(filter)
            .populate('userId', 'firstName lastName email')
            .populate('items.product')
            .sort({ orderDate: -1 })
            .skip(skip)
            .limit(limit);

        // Process orders to handle null products and add return information
        const processedOrders = orders.map(order => {
            const orderObj = order.toObject();
            orderObj.items = orderObj.items.map(item => ({
                ...item,
                product: item.product || {
                    _id: 'unavailable',
                    productName: 'Product Unavailable',
                    imageUrl: ['/images/placeholder.jpg'],
                    price: item.price || 0
                },
                // Add return status information
                return: item.return || {
                    isReturnRequested: false,
                    status: null,
                    requestDate: null
                }
            }));
            return orderObj;
        });

        res.render('admin/orders', {
            orders: processedOrders,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            admin: req.session.admin
        });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).render('admin/error', {
            message: 'Error fetching orders',
            error,
            admin: req.session.admin
        });
    }
};


const updateItemStatus = async (req, res, next) => {
    try {
        const { orderId, productId } = req.params;
        const { status } = req.body;

        const order = await orderSchema.findById(orderId)
            .populate('items.product');

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const item = order.items.find(item =>
            item.product._id.toString() === productId
        );

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // Update item status
        item.order.status = status;
        item.order.statusHistory.push({
            status,
            date: new Date(),
            comment: `Status updated to ${status} by admin`
        });

        if (status === 'cancelled') {
            // Restore stock
            await productSchema.findByIdAndUpdate(
                item.product._id,
                { $inc: { stock: item.quantity } }
            );

            // Check if all items in the order are cancelled
            const allItemsCancelled = order.items.every(item => item.order.status === 'cancelled');

            // If all items are cancelled, update payment status to cancelled
            if (allItemsCancelled) {
                order.payment.paymentStatus = 'cancelled';
            }
        } else if (status === 'delivered' && order.payment.method === 'cod') {
            // Check if all items are either delivered or cancelled
            const allItemsCompleted = order.items.every(item =>
                item.order.status === 'delivered' || item.order.status === 'cancelled'
            );

            // Update payment status for COD orders when all items are delivered/cancelled
            if (allItemsCompleted) {
                order.payment.paymentStatus = 'completed';
            }
        }

        // Use markModified to ensure Mongoose detects nested updates
        order.markModified('items');
        order.markModified('payment');

        await order.save();
        res.json({ success: true, message: 'Item status updated successfully' });

    } catch (error) {
        next(error)
    }
};

const handleReturnRequest = async (req, res, next) => {
    try {
        const { orderId, productId } = req.params;
        const { returnStatus, adminComment } = req.body;

        const order = await orderSchema.findById(orderId)
            .populate('items.product');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const item = order.items.find(item =>
            item.product._id.toString() === productId
        );

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        // Update return status and related fields
        if (returnStatus === 'approved') {
            item.order.status = 'returned';
            item.return.status = 'approved';
            item.return.adminComment = adminComment;
            item.return.isReturnAccepted = true;
            
            // Add to status history
            item.order.statusHistory.push({
                status: 'returned',
                date: new Date(),
                comment: `Return approved by admin: ${adminComment}`
            });

            // Update product stock
            await productSchema.findOneAndUpdate(
                {
                    _id: productId,
                    'size.size': item.size
                },
                {
                    $inc: { 'size.$.stock': item.quantity }
                }
            );

            // Update payment status if payment was made
            if (['wallet', 'online', 'razorpay'].includes(order.payment.method)) {
                order.payment.paymentStatus = 'refunded';
            }
        } else if (returnStatus === 'rejected') {
            item.order.status = 'delivered';
            item.return.status = 'rejected';
            item.return.adminComment = adminComment;
            item.return.isReturnAccepted = false;

            // Add to status history
            item.order.statusHistory.push({
                status: 'delivered',
                date: new Date(),
                comment: `Return rejected by admin: ${adminComment}`
            });
        }

        // Mark modified paths
        order.markModified('items');
        order.markModified('payment');

        await order.save();

        res.json({
            success: true,
            message: 'Return request handled successfully'
        });

    } catch (error) {
        console.error('Error in handleReturnRequest:', error);
        next(error);
    }
};

export default {
    getOrders,
    updateItemStatus,
    handleReturnRequest
}




