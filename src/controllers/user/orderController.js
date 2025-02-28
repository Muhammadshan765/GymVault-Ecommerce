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




export default {
    getOrders,
    cancelOrder
}


