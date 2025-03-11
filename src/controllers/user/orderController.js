import orderSchema from "../../models/orderModel.js";
import userSchema from "../../models/userModel.js";
import productSchema from "../../models/productModel.js";
import Wallet from "../../models/walletModel.js"
import razorpay from "../../utils/razorpay.js";
import PDFDocument from "pdfkit"
import crypto from "crypto"

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

        // Process refund if payment was made
        if (['wallet', 'online', 'razorpay'].includes(order.payment.method) &&
            order.payment.paymentStatus === 'completed') {

            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = await Wallet.create({ userId, balance: 0 });
            }

            // Calculate refund amount for this item
            const refundAmount = item.subtotal;

            wallet.balance += refundAmount;
            wallet.transactions.push({
                type: 'credit',
                amount: refundAmount,
                description: `Refund for cancelled item in order #${order.orderCode}`,
                orderId: order._id,
                date: new Date()
            });
             await wallet.save()

        }

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

        res.json({
            success: true,
            message: 'Return requested successfully'
        });

    } catch (error) {
        console.error('Return request error:', error);
        next(error);
    }
};

const generateInvoice = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user;

        const order = await orderSchema.findOne({ _id: orderId, userId })
            .populate('userId')
            .populate('items.product');

        if (!order) {

            return res.status(404).json({ message: 'Order not found' });
        }


        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderCode}.pdf`);
        doc.pipe(res);

        // Generate separate invoice for each item
        order.items.forEach((item, index) => {
            if (index > 0) {
                doc.addPage();
            }

            // Calculate base prices and taxes
            const TAX_RATE = 0.18;
            const CGST_RATE = 0.09;
            const SGST_RATE = 0.09;

            // Pre-tax calculations
            const preTaxPrice = item.price / (1 + TAX_RATE);
            const preTaxTotal = preTaxPrice * item.quantity;

            // Tax calculations
            const cgstAmount = preTaxTotal * CGST_RATE;
            const sgstAmount = preTaxTotal * SGST_RATE;
            const totalTax = cgstAmount + sgstAmount;

            // Discount calculations (if applicable)
            const originalTotal = preTaxTotal + totalTax;
            const finalAmount = item.subtotal; // This is already the discounted total
            const totalDiscount = originalTotal - finalAmount;

            // Add header with company logo and tax invoice text
            doc.fontSize(20)
                .text('TAX INVOICE', { align: 'center' })
                .moveDown();

            // Add company details (left side)
            doc.fontSize(10)
                .text('Sold By:', 50)
                .font('Helvetica-Bold')
                .text('GymVault')
                .font('Helvetica')
                .text('123 GYm Store')
                .text('Kerala, India - 682001')
                .text('Phone: +91 8089400529')
                .text('Email: support@GymVault.com')
                .text('GSTIN: 32ABCDE1234F1Z5');

            // Add Invoice Details (right side)
            doc.fontSize(10)
                .text(`Invoice Number: ${order.orderCode}-${index + 1}`, 300, doc.y - 90)
                .text(`Order Date: ${new Date(order.orderDate).toLocaleDateString('en-IN')}`, 300)
                .text(`Invoice Date: ${new Date().toLocaleDateString('en-IN')}`, 300);

            // Add Billing Details
            doc.moveDown()
                .text('Billing Address:')
                .font('Helvetica-Bold')
                .text(`${order.shippingAddress.fullName}`)
                .font('Helvetica')
                .text(order.shippingAddress.addressLine1)
                .text(order.shippingAddress.addressLine2 || '')
                .text(`${order.shippingAddress.city}, ${order.shippingAddress.state}`)
                .text(`PIN: ${order.shippingAddress.pincode}`)
                .text(`Phone: ${order.shippingAddress.mobileNumber}`)
                .moveDown();

            // Product Details Table
            doc.font('Helvetica-Bold');
            const tableTop = doc.y + 20;

            // Table Headers
            doc.text('Product Details', 50, tableTop)
                .text('HSN', 200, tableTop)
                .text('Qty', 250, tableTop)
                .text('Pre-tax Rate', 300, tableTop)
                .text('Taxable Amount', 400, tableTop)
                .text('Total', 500, tableTop);

            // Underline
            doc.moveTo(50, tableTop + 15)
                .lineTo(550, tableTop + 15)
                .stroke();

            // Product Details
            doc.font('Helvetica')
                .text(item.product.productName, 50, tableTop + 30)
                .text('6203', 200, tableTop + 30)
                .text(item.quantity.toString(), 250, tableTop + 30)
                .text(`₹${preTaxPrice.toFixed(2)}`, 300, tableTop + 30)
                .text(`₹${preTaxTotal.toFixed(2)}`, 400, tableTop + 30)
                .text(`₹${originalTotal.toFixed(2)}`, 500, tableTop + 30);

            // Price Breakdown
            const summaryTop = tableTop + 80;
            doc.moveTo(50, summaryTop).lineTo(550, summaryTop).stroke()
                .font('Helvetica-Bold')
                .text('Price Breakdown', 50, summaryTop + 20)
                .font('Helvetica');

            // Detailed Summary
            let currentY = summaryTop + 40;

            // Pre-tax amount
            doc.text('Pre-tax Amount:', 350, currentY)
                .text(`₹${preTaxTotal.toFixed(2)}`, 500, currentY);
            currentY += 20;

            // Tax details
            doc.text('CGST @ 9%:', 350, currentY)
                .text(`₹${cgstAmount.toFixed(2)}`, 500, currentY);
            currentY += 20;

            doc.text('SGST @ 9%:', 350, currentY)
                .text(`₹${sgstAmount.toFixed(2)}`, 500, currentY);
            currentY += 20;

            // Subtotal after tax
            doc.text('Total (Inc. Tax):', 350, currentY)
                .text(`₹${originalTotal.toFixed(2)}`, 500, currentY);
            currentY += 20;

            // Discount (if applicable)
            if (totalDiscount > 0) {
                doc.text('Discount Applied:', 350, currentY)
                    .text(`-₹${totalDiscount.toFixed(2)}`, 500, currentY);
                currentY += 20;
            }

            // Final amount
            doc.moveTo(350, currentY).lineTo(550, currentY).stroke();
            currentY += 10;
            doc.font('Helvetica-Bold')
                .text('Final Amount:', 350, currentY)
                .text(`₹${finalAmount.toFixed(2)}`, 500, currentY);

            // Amount in words
            currentY += 40;
            doc.font('Helvetica')
                .text('Amount in Words:', 50, currentY)
                .text(`${numberToWords(Math.round(finalAmount))} Rupees Only`, 150, currentY);

            // Add Footer (within the page)
            const footerTop = doc.page.height - 120;

            // Footer Border Top
            doc.moveTo(50, footerTop).lineTo(550, footerTop).stroke();

            // Footer Content
            doc.fontSize(8)
                .font('Helvetica')
                .text('Terms & Conditions:', 50, footerTop + 10)
                .text('1. This is a computer generated invoice.', 50, footerTop + 25)
                .text('2. All disputes are subject to Kerala jurisdiction.', 50, footerTop + 35)
                .text('3. E. & O. E.', 50, footerTop + 45);

            // Company Details in Footer
            doc.fontSize(8)
                .text('GymVault', 350, footerTop + 10)
                .text('123 GYM Street, Kerala - 682001', 350, footerTop + 25)
                .text('Email: support@GymVault.com | Phone: +91 8089400529', 350, footerTop + 35)
                .text('GSTIN: 32ABCDE1234F1Z5', 350, footerTop + 45);

            // Footer Border Bottom
            doc.moveTo(50, footerTop + 70).lineTo(550, footerTop + 70).stroke();

        });

        // Finalize PDF
        doc.end();

    } catch (error) {
        next(error)
    }
};
//helper function to convert number to word
function numberToWords(number) {
    return number.toString();
}

export default {
    getOrders,
    cancelOrder,
    requestReturnItem,
    generateInvoice,
    numberToWords
}


