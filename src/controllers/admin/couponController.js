import Coupon from "../../models/couponModel.js";

const getCoupons = async (req, res, next) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.render('admin/coupon', { coupons });
    } catch (error) {
        next(error)
    }
};

const addCoupons = async (req, res, next) => {
    try {
        const {
            code,
            description,
            discountPercentage,
            minimumPurchase,
            maximumDiscount,
            startDate,
            expiryDate,
            totalCoupon,
            userUsageLimit
        } = req.body;

        // Validate description
        if (!description || description.trim().length === 0) {
            return res.status(400).json({ message: 'Description is required' });
        }

        if (description.length > 100) {
            return res.status(400).json({ message: 'Description must be less than 100 characters' });
        }

        // Validate discount percentage
        if (discountPercentage < 0 || discountPercentage > 100) {
            return res.status(400).json({ message: 'Discount percentage must be between 0 and 100' });
        }

        // Parse dates and validate using timestamps for consistent timezone handling
        const startTimestamp = new Date(startDate).getTime();
        const expiryTimestamp = new Date(expiryDate).getTime();
        const nowTimestamp = Date.now();

        // Validate start date isn't in the past
        if (startTimestamp < nowTimestamp) {
            return res.status(400).json({ message: 'Start date cannot be in the past' });
        }

        // Validate expiry date is after start date
        if (expiryTimestamp <= startTimestamp) {
            return res.status(400).json({ message: 'Expiry date must be after start date' });
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({ message: 'Coupon code already exists' });
        }

        // Create new coupon - store the original Date objects to maintain proper timezone info
        const newCoupon = new Coupon({
            code: code.toUpperCase(),
            description: description.trim(),
            discountPercentage,
            minimumPurchase: minimumPurchase || 0,
            maximumDiscount: maximumDiscount || null,
            startDate: new Date(startDate),
            expiryDate: new Date(expiryDate),
            totalCoupon: totalCoupon || 1,
            userUsageLimit: userUsageLimit || 1
        });

        await newCoupon.save();
        res.status(200).json({
            message: 'Coupon added successfully'
        });

    } catch (error) {
        next(error)
    }
};

const deleteCoupon = async (req, res, next) => {
    try {
        const deletedCoupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!deletedCoupon) {
            return res.status(404).json({
                message: 'coupon not found'
            });
        }

        res.status(200).json({
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        next(error)
    }
};


export default {
    getCoupons,
    addCoupons,
    deleteCoupon
}