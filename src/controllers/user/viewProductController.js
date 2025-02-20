import Product from '../../models/productModel.js';

const getProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId)
            .populate('categoriesId');

        if (!product) {
            return res.status(404).redirect('/home');
        }

        // Find related products from the same category
        const relatedProducts = await Product.find({
            categoriesId: product.categoriesId,
            isActive: true,
            _id: { $ne: productId }
        })
        .limit(4);

        // Process the product data
        const processedProduct = {
            ...product.toObject(),
            productName: product.productName || '',
            brand: product.brand || '',
            description: product.description || '',
            price: product.price || 0,
            size: product.size || [], // This is already the array of {size, stock} objects
            imageUrl: product.imageUrl || [],
            rating: product.rating || 0
        };

        // Calculate total stock
        processedProduct.stock = processedProduct.size.reduce((total, item) => total + (item.stock || 0), 0);

        const processedRelatedProducts = relatedProducts.map(p => ({
            ...p.toObject(),
            productName: p.productName || '',
            brand: p.brand || '',
            price: p.price || 0,
            imageUrl: p.imageUrl || []
        }));

        res.render('user/viewProduct', {
            product: processedProduct,
            relatedProducts: processedRelatedProducts,
            title: processedProduct.productName
        });

    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).redirect('/home');
    }
};

export default {
    getProductDetails,
}; 