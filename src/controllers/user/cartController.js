import cartSchema from '../../models/cartModel.js'
import productSchema from '../../models/productModel.js'
import Category from '../../models/categoryModel.js'
import wishlistController from './wishlistController.js'

const getCart  = async (req,res)=>{
    try{
        const userId = req.session.user;
        
       
        // Add error handling for stock issues
        let errorMessage = null;
        if (req.query.error === 'stock') {
           
            
            if (req.session.stockError) {
                errorMessage = req.session.stockError.map(error => 
                    `${error.productName} has only ${error.available} units available (you requested ${error.requested})`
                ).join('\n');
               
                // Clear the error after displaying
                delete req.session.stockError;
            }
        }

        //Get active categoris
        const activeCategories = await Category.find({isActive:true}).distinct('_id');

        const cart = await cartSchema.findOne({
            userId
        }).populate({
            path:'items.productId',
            populate:{
                path:'categoriesId',
                match:{isActive:true}
            }
        });

        if(!cart){
            return res.render('user/cart',{
                cartItems:[],
                total:0
            });
        }

        //Filter out items with inactive categories or products
        const validItems = cart.items.filter(item=>
            item.productId&&
            item.productId.categoriesId&&
            item.productId.isActive&&
            activeCategories.some(catId=>catId.equals(item.productId.categoriesId._id))
        );

        //Update cart if invalid items were removed
        if(validItems.length!==cart.items.length){
            cart.items=validItems;
            await cart.save();
        }

        //process remaining items (removed offer processing)
        const updatedItems = await Promise.all(validItems.map(async item=>{
            const product = item.productId;
            const quantity = parseInt(item.quantity) || 1;
            const currentPrice = product.price; // Use product price directly
            const subtotal = currentPrice * quantity;

            // Update item in cart
            item.price = currentPrice;
            item.subtotal = subtotal;

            return {
                product:{
                    _id:product._id,
                    productName:product.productName,
                    imageUrl:product.imageUrl,
                    stock:product.stock,
                    size:product.size
                },
                quantity:quantity,
                price:currentPrice,
                subtotal:subtotal
            };
        }));

        //calculate total
        const total = updatedItems.reduce((sum,item)=>{
            return sum+(parseFloat(item.subtotal)||0);
        },0);

        //updatr cart in database
        cart.items = cart.items.map((item,index)=>({
            ...item,
            price:updatedItems[index].price,
            subtotal:updatedItems[index].subtotal
        }));

        cart.total =total;
        await cart.save();

        res.render('user/cart',{
            cartItems:updatedItems,total:total,errorMessage,user:req.session.user
        });
        

    }catch(error){
        console.error('Error fetching cart:',error);
        res.status(500).render('user/cart',{
            cartItems:[],
            total:0,
            error:'Failed to load cart',
            user: req.session.user
        });
        
    }
};


const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
       
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to add items to cart'
            });
        }

        const { productId, quantity, size } = req.body;
       
        
        // Validate size is provided
        if (!size) {
            return res.status(400).json({
                success: false,
                message: 'Please select a size'
            });
        }

        let cart = await cartSchema.findOne({ userId });
        const product = await productSchema.findById(productId);

        if (!cart) {
            cart = new cartSchema({
                userId,
                items: [{
                    productId,
                    quantity: parseInt(quantity),
                    price: product.price,
                    size: size  // Make sure size is included
                }]
            });
        } else {
            //check if the product already exists in the cart with same size
            const existingItem = cart.items.find(item=>
                item.productId.toString() === productId &&
                item.size === size
            );

            if(existingItem){
                //calculate new quantity
                const newQuantity = existingItem.quantity + parseInt(quantity);

                //check if new quantity exceeds limit
                if(newQuantity > 3){
                    return res.status(400).json({
                        message: `Cannot add more items. Maximum limit is 3 (Current quantity: ${existingItem.quantity})`
                    });
                }

                //update quantity and price
                existingItem.quantity = newQuantity;
                existingItem.price = product.price;
                existingItem.subtotal = newQuantity * product.price;
            } else {
                //add new item if product doesn't exist in the cart
                cart.items.push({
                    productId,
                    quantity: parseInt(quantity),
                    price: product.price,
                    size: size,  // Make sure size is included
                    subtotal: parseInt(quantity) * product.price
                });
            }
        }

        const savedCart = await cart.save();

        // Remove from wishlist after successfully adding to cart
        await wishlistController.removeFromWishlistAfterCart(userId, productId);
       
        res.json({ success: true, message: 'Item added to cart' });

    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add item to cart',
            error: error.message
        });
    }
};

//Update quantity in cart
const updateQuantity = async (req,res)=>{
    try{
        const {productId,quantity}=req.body;
        const userId = req.session.user;

        if(quantity<1){
            return res.status(400).json({
                message:'Quantity must be atleast one'
            });
        }

        //check product availability and stock
        const product = await productSchema.findById(productId).populate({
            path: 'categoriesId',
            match: { isActive: true }
        });

        if(!product||!product.isActive||!product.categoriesId){
            return res.status(400).json({
                message:'Product is not available'
            });
        }

        if(product.stock<quantity){
            return res.status(400).json({
                message:'Not enough stock available'
            });
        }

        //find and update cart
        const cart  =  await cartSchema.findOne({userId});
        if(!cart){
            return res.status(404).json({
                message:'Cart not found'
            });
        }

        const cartItem = cart.items.find(item=>item.productId.toString()===productId);
        if(!cartItem){
            return res.status(404).json({
                message:'Product not found in cart'
            });
        }

        cartItem.quantity = quantity;
        await cart.save();



        //Calculat new total
        const updatedCart = await cartSchema.findOne({userId}).populate('items.productId');
        const cartItems = updatedCart.items.map(item=>({
            product:item.productId,
            quantity:item.quantity,
            price:item.price,
            subtotal:item.quantity*item.price
        }));

        const total = cartItems.reduce((sum,item)=>sum+item.subtotal,0);

        res.status(200).json({ 
            success: true,
            message: 'Quantity updated successfully',
            quantity: quantity,
            subtotal: quantity * cartItem.price,
            total: total
        });
    }catch(error){
        console.error('Error updating quantity:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to update quantity' 
        });
    }
};

const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.session.user;

        // Find the cart
        const cart = await cartSchema.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        // Remove the item
        cart.items = cart.items.filter(item => 
            item.productId.toString() !== productId);

        await cart.save();

        // Calculate new totals
        const updatedCart = await cartSchema.findOne({ userId }).populate('items.productId');
        const cartItems = updatedCart.items.map(item => ({
            product: item.productId,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.quantity * item.price
        }));

        const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

        res.status(200).json({ 
            message: 'Item removed from cart',
            total,
            itemCount: cart.items.length
        });

    } catch (error) {
        console.error('Error removing item from cart:', error);
        res.status(500).json({ message: 'Failed to remove item from cart' });
    }
};

export default {
    getCart,
    addToCart,
    updateQuantity,
    removeFromCart,
};