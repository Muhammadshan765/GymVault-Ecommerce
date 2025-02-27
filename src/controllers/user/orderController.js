import orderSchema from "../../models/orderModel.js";
import userSchema from "../../models/userModel.js";

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

export default {
    getOrders
}
