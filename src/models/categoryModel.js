import mongoose from "mongoose";


const categorySchema = new mongoose.Schema(
    {
        name:{
            type:String,
            required:[true,'category name is required'],
            trim:true,
            minlength:[1,'Category name cannot be empty'],
            maxlength:[10,'Category name must be atmost 10 letters'],
            match:[/^[A-Za-z]+$/,'Category name can only contail alphabets'],

        },
        description:{
            type:String,
            required:[true,'Description is required'],
            minlength:[25,'Description must be atleast 25 characters'],
            maxlength:[100,'Description must be atmost 100 characters'],
        },
        isActive:{
            type:Boolean,
            default:true
        },
        offer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Offer',
            default: null
        }
    },
    {
        timestamps:true
    }
);

const Category = mongoose.model('Category',categorySchema);

export default Category