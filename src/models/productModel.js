import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    productName: {
        type: String,
        required: true,
        trim: true
    },
    brand: {
        type: String,
        required: true,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    categoriesId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
    },
    description: {
        type: String,
        required: true,
        trim: true,
        minLength: 10,
        maxLength: 250
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    size: {
        type: [{
            size: {
                type: String,
                required: true
            },
            stock: {
                type: Number,
                required: true,
                min: 0
            }
        }],
        required: true,
        validate: {
            validator: function(sizeStock) {
                return sizeStock && sizeStock.length > 0;
            },
            message: 'At least one size with stock must be selected'
        }
    },
    imageUrl: {
        type: [String],
        required: true,
    },
    offer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Offer'
    },
    offerPrice: {
        type: Number,
        min: 0
    },
    offerApplied: {
        type: Boolean,
        default: false
    },
    offerType: {
        type: String,
        enum: ['product', 'category', 'none'],
        default: 'none'
    }
}, 
{ timestamps: true });

export default mongoose.model("Product", productSchema);