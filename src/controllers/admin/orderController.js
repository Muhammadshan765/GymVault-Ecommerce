import orderSchema from '../../models/orderModel.js';
import productSchema from '../../models/productModel.js';
import Wallet from '../../models/walletModel.js';

const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page || 1);
        const limit = 10;
        const skip = (page - 1) * limit;

        // Get filter parameters
        const status = req.query.status;
        const dateFrom = req.query.dateFrom;
        const dateTo = req.query.dateTo;
        const searchQuery = req.query.search ? req.query.search.trim() : '';

        // Build filter object 
        let filter = {};

        // Exclude pending status by default 
        if (!status) {
            filter['items.order.status'] = { $ne: 'pending' };
        } else {
            // Add status filter if provided
            filter['items.order.status'] = status;
        }

        // Add date range filters if provided
        if (dateFrom || dateTo) {
            filter.orderDate = {};
            if (dateFrom) filter.orderDate.$gte = new Date(dateFrom);
            if (dateTo) filter.orderDate.$lte = new Date(dateTo);
        }

        // Build the base filter with OR condition for pending and return requests
        let baseFilter = {
            $or: [
                { 'items.order.status': { $ne: 'pending' } },
                { 'items.return.isReturnRequested': true }
            ]
        };

        // If status filter is provided, override the default filter
        if (status) {
            baseFilter = {
                $or: [
                    { 'items.order.status': status },
                    { 'items.return.isReturnRequested': true, 'items.return.status': status === 'returned' ? 'approved' : status }
                ]
            };
        }

        // Create search filter if search query is provided
        let searchFilter = {};
        if (searchQuery) {
            // Look up orders where the orderCode, customer info or product name matches the search query
            searchFilter = {
                $or: [
                    { orderCode: { $regex: searchQuery, $options: 'i' } }, // Case-insensitive search on order code
                    { 'userId.firstName': { $regex: searchQuery, $options: 'i' } },
                    { 'userId.lastName': { $regex: searchQuery, $options: 'i' } },
                    { 'userId.email': { $regex: searchQuery, $options: 'i' } },
                    { 'items.product.productName': { $regex: searchQuery, $options: 'i' } }
                ]
            };
        }

        // Combine date filters with base and search filters
        let finalFilter = baseFilter;
        if (dateFrom || dateTo) {
            finalFilter.$and = [baseFilter, { orderDate: filter.orderDate }];
        }

        // Get total orders count for pagination
        const ordersQuery = orderSchema.find(finalFilter);
        
        // Apply search filter through aggregation if search is specified
        let orders;
        let totalOrders;
        
        if (searchQuery) {
            // We need to use aggregation for text search across populated fields
            const aggregatePipeline = [
                // Populate user and product data
                { $lookup: { 
                    from: 'users', 
                    localField: 'userId', 
                    foreignField: '_id', 
                    as: 'userInfo' 
                }},
                { $unwind: '$userInfo' },
                { $lookup: { 
                    from: 'products', 
                    localField: 'items.product', 
                    foreignField: '_id', 
                    as: 'productInfo' 
                }},
                // Match orders based on search criteria
                { $match: {
                    $or: [
                        { orderCode: { $regex: searchQuery, $options: 'i' } },
                        { 'userInfo.firstName': { $regex: searchQuery, $options: 'i' } },
                        { 'userInfo.lastName': { $regex: searchQuery, $options: 'i' } },
                        { 'userInfo.email': { $regex: searchQuery, $options: 'i' } },
                        { 'productInfo.productName': { $regex: searchQuery, $options: 'i' } }
                    ]
                }},
                // Apply status filter
                { $match: status ? { 'items.order.status': status } : { 'items.order.status': { $ne: 'pending' } } },
                // Apply date filter if exists
                ...(dateFrom || dateTo ? [{ $match: { orderDate: filter.orderDate } }] : []),
                // Count for pagination
                { $count: 'total' }
            ];
            
            const countResult = await orderSchema.aggregate(aggregatePipeline);
            totalOrders = countResult.length > 0 ? countResult[0].total : 0;
            
            // Get orders with pagination
            orders = await orderSchema.aggregate([
                // Same lookup and matching as above
                { $lookup: { 
                    from: 'users', 
                    localField: 'userId', 
                    foreignField: '_id', 
                    as: 'userInfo' 
                }},
                { $unwind: '$userInfo' },
                { $lookup: { 
                    from: 'products', 
                    localField: 'items.product', 
                    foreignField: '_id', 
                    as: 'productInfo' 
                }},
                { $match: {
                    $or: [
                        { orderCode: { $regex: searchQuery, $options: 'i' } },
                        { 'userInfo.firstName': { $regex: searchQuery, $options: 'i' } },
                        { 'userInfo.lastName': { $regex: searchQuery, $options: 'i' } },
                        { 'userInfo.email': { $regex: searchQuery, $options: 'i' } },
                        { 'productInfo.productName': { $regex: searchQuery, $options: 'i' } }
                    ]
                }},
                { $match: status ? { 'items.order.status': status } : { 'items.order.status': { $ne: 'pending' } } },
                ...(dateFrom || dateTo ? [{ $match: { orderDate: filter.orderDate } }] : []),
                // Sorting, skipping and limiting
                { $sort: { orderDate: -1 } },
                { $skip: skip },
                { $limit: limit }
            ]);
            
            // Get populated data
            orders = await orderSchema.populate(orders, [
                { path: 'userId', select: 'firstName lastName email' },
                { path: 'items.product' }
            ]);
        } else {
            // Use the standard query approach if no search
            totalOrders = await orderSchema.countDocuments(finalFilter);
            orders = await orderSchema.find(finalFilter)
                .populate('userId', 'firstName lastName email')
                .populate('items.product')
                .sort({ orderDate: -1 })
                .skip(skip)
                .limit(limit);
        }
        
        const totalPages = Math.ceil(totalOrders / limit);

        // Process orders to handle null products and add return information
        const processedOrders = orders.map(order => {
            const orderObj = order.toObject ? order.toObject() : order;
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
            status: status || '',  // Pass selected status to view
            search: searchQuery,   // Pass search query to view
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

            // Process refund to wallet if payment was made
            if (['wallet', 'online', 'razorpay'].includes(order.payment.method)) {
                // Find or create user wallet
                const wallet = await Wallet.findOne({ userId: order.userId });
                
                if (wallet) {
                    // Calculate refund amount for this item
                    const refundAmount = item.subtotal;
                    
                    // Add refund to wallet
                    wallet.balance += refundAmount;
                    wallet.transactions.push({
                        type: 'credit',
                        amount: refundAmount,
                        description: `Refund for returned item in order #${order.orderCode}`,
                        orderId: order._id,
                        date: new Date()
                    });
                    
                    await wallet.save();
                    
                    // Update payment status
                    order.payment.paymentStatus = 'refunded';
                    
                    // Add additional status history entry for refund
                    item.order.statusHistory.push({
                        status: 'refund completed',
                        date: new Date(),
                        comment: `Refund of ₹${refundAmount} processed to wallet`
                    });
                }
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




