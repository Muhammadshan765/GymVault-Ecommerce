import Product from "../../models/productModel.js"
import Category from "../../models/categoryModel.js"
import path from "path"
import fs from "fs"
import upload from "../../utils/multer.js"

 

// Add these validation functions at the top of the file
const validateProductName = (name) => {
    // Remove extra spaces and check length
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 10) {
        throw new Error('Product name must be between 3 and 50 characters');
    }
    
    // Allow letters, numbers, spaces, and basic punctuation
    const nameRegex = /^[a-zA-Z0-9\s]+$/;
    if (!nameRegex.test(trimmedName)) {
        throw new Error('Product name contains invalid characters');
    }
    
    return trimmedName;
};

const validateBrand = (brand) => {
    // Remove extra spaces and check length
    const trimmedBrand = brand.trim();
    if (trimmedBrand.length < 2 || trimmedBrand.length > 10) {
        throw new Error('Brand name must be between 2 and 30 characters');
    }
    
    // Allow letters, numbers, spaces, and hyphens
    const brandRegex = /^[a-zA-Z0-9\s]+$/;
    if (!brandRegex.test(trimmedBrand)) {
        throw new Error('Brand name contains invalid characters');
    }
    
    return trimmedBrand;
};

// Render Product Management Page
const getproducts = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 6; // Changed to 6 items per page
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalProducts = await Product.countDocuments();
        const totalPages = Math.ceil(totalProducts / limit);

        // Fetch paginated products with populated references
        const products = await Product.find()
            .populate('categoriesId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Sanitize products for JSON serialization
        const sanitizedProducts = products.map(product => {
            const sanitized = product.toObject();
            return {
                ...sanitized,
                _id: sanitized._id.toString(),
                categoriesId: {
                    _id: sanitized.categoriesId._id.toString(),
                    name: sanitized.categoriesId.name
                },
                imageUrl: sanitized.imageUrl || []
            };
        });

        // Calculate pagination info
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;
        const nextPage = hasNextPage ? page + 1 : null;
        const prevPage = hasPrevPage ? page - 1 : null;

        res.render('admin/products', {
            products: sanitizedProducts,
            categories: await Category.find(),
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts,
                hasNextPage,
                hasPrevPage,
                nextPage,
                prevPage,
                pages: Array.from({ length: totalPages }, (_, i) => i + 1)
            }
        });
    } catch (error) {
        next(error);
    }
};

// Add New Product
const addProduct = async (req, res, next) => {
    const uploadMultiple = upload.array('images', 3);

    uploadMultiple(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message });
        }

        try {
            // Check if files were uploaded
            if (!req.files || req.files.length !== 3) {
                return res.status(400).json({ message: 'Please upload exactly 3 images' });
            }

            // Validate file types and sizes
            for (const file of req.files) {
                if (file.size > 5 * 1024 * 1024) { // 5MB limit
                    return res.status(400).json({ message: 'Each image must be less than 5MB' });
                }

                const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
                if (!validTypes.includes(file.mimetype)) {
                    return res.status(400).json({ message: 'Invalid file type. Only JPG, JPEG, PNG, and WebP are allowed' });
                }
            }

            const {
                productName,
                brand,
                categoriesId,
                description,
                sizeStock // This will be a JSON string from the form
            } = req.body;

            // Validate required fields
            if (!productName || !brand || !categoriesId || !description || !sizeStock) {
                return res.status(400).json({ message: 'All fields are required' });
            }

            // Parse and validate size-stock data
            let sizeStockArray;
            try {
                sizeStockArray = JSON.parse(sizeStock);
                if (!Array.isArray(sizeStockArray) || sizeStockArray.length === 0) {
                    throw new Error('Invalid size and stock data');
                }

                // Validate each size-stock-price pair
                sizeStockArray.forEach(({ size, stock, price }) => {
                    if (!size || typeof stock !== 'number' || stock < 0 || stock > 1000) {
                        throw new Error('Invalid stock value for size ' + size);
                    }
                    if (typeof price !== 'number' || price < 0 || price > 100000) {
                        throw new Error('Invalid price value for size ' + size);
                    }
                });
            } catch (error) {
                return res.status(400).json({ message: error.message });
            }

            // Validate product name and brand
            let validatedName, validatedBrand;
            try {
                validatedName = validateProductName(productName);
                validatedBrand = validateBrand(brand);
            } catch (validationError) {
                return res.status(400).json({ message: validationError.message });
            }

            // Check for duplicate product name
            const existingProduct = await Product.findOne({
                productName: validatedName
            });
            
            if (existingProduct) {
                return res.status(400).json({ message: 'A product with this name already exists' });
            }

            // Process and save the images
            const imageUrls = req.files.map(file => `/static/uploads/products/${file.filename}`);

            // Calculate total stock
            const totalStock = sizeStockArray.reduce((sum, item) => sum + item.stock, 0);

            const newProduct = new Product({
                productName: validatedName,
                brand: validatedBrand,
                categoriesId,
                description: description.trim(),
                size: sizeStockArray,
                imageUrl: imageUrls,
                stock: totalStock,
                isActive: true
            });

            await newProduct.save();
            res.status(201).json({ message: 'Product added successfully' });

        } catch (error) {
            // Delete uploaded files if there's an error
            if (req.files) {
                req.files.forEach(file => {
                    const filePath = path.join(process.cwd(), 'public', 'uploads', 'products', file.filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                });
            }
            
            console.error('Error adding product:', error);
            res.status(400).json({ message: error.message || 'Error adding product' });
        }
    });
};

// Get Product Details for Editing
const getProductDetails = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('categoriesId');

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Convert to plain object and sanitize
        const sanitizedProduct = {
            ...product.toObject(),
            _id: product._id.toString(),
            categoriesId: {
                _id: product.categoriesId._id.toString(),
                name: product.categoriesId.name
            },
            // Ensure size array is properly formatted with all required fields
            size: product.size.map(sizeItem => ({
                size: sizeItem.size,
                stock: sizeItem.stock,
                price: sizeItem.price
            })),
            imageUrl: product.imageUrl || [],
            isActive: product.isActive,
            productName: product.productName,
            brand: product.brand,
            description: product.description
        };

        res.json(sanitizedProduct);
    } catch (error) {
        next(error);
    }
};

// Update Product
const updateProduct = async (req, res,next) => {
    const uploadMultiple = upload.array('images', 3);

    uploadMultiple(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message });
        }

        try {
            const { 
                productId, 
                productName, 
                brand, 
                categoriesId, 
                description, 
                price, 
                sizeStock 
            } = req.body;
            
            // Get existing product
            const existingProduct = await Product.findById(productId);
            if (!existingProduct) {
                return res.status(404).json({ message: 'Product not found' });
            }

            // Parse and validate size-stock data
            let sizeStockArray;
            try {
                sizeStockArray = JSON.parse(sizeStock);
                if (!Array.isArray(sizeStockArray) || sizeStockArray.length === 0) {
                    throw new Error('Invalid size and stock data');
                }

                // Validate each size-stock-price pair
                sizeStockArray.forEach(({ size, stock, price }) => {
                    if (!size || typeof stock !== 'number' || stock < 0 || stock > 1000) {
                        throw new Error('Invalid stock value for size ' + size);
                    }
                    if (typeof price !== 'number' || price < 0 || price > 100000) {
                        throw new Error('Invalid price value for size ' + size);
                    }
                });
            } catch (error) {
                next(error)
            }

            // Handle image updates
            let updatedImageUrls = [...existingProduct.imageUrl];
            
            if (req.files && req.files.length > 0) {
                // For each new image uploaded
                req.files.forEach((file, index) => {
                    // Replace the image URL at the corresponding index
                    updatedImageUrls[index] = `/static/uploads/products/${file.filename}`;
                    
                    // Delete the old image file
                    const oldImageUrl = existingProduct.imageUrl[index];
                    if (oldImageUrl) {
                        const oldImagePath = path.join(process.cwd(), 'public', oldImageUrl);
                        try {
                            if (fs.existsSync(oldImagePath)) {
                                fs.unlinkSync(oldImagePath);
                            }
                        } catch (error) {
                            console.error('Error deleting old image:', error);
                        }
                    }
                });
            }

            // Update product in database
            const updatedProduct = await Product.findByIdAndUpdate(
                productId,
                {
                    productName: productName.trim(),
                    brand: brand.trim(),
                    categoriesId,
                    description: description.trim(),
                    price: parseFloat(price),
                    size: sizeStockArray, // Use the parsed and validated size-stock array
                    imageUrl: updatedImageUrls
                },
                { new: true }
            );

            res.status(200).json({ message: 'Product updated successfully' });

        } catch (error) {
            // Clean up any uploaded files if there's an error
            if (req.files) {
                req.files.forEach(file => {
                    const filePath = path.join(process.cwd(), 'public', 'uploads', 'products', file.filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                });
            }
            
            res.status(500).json({ message: error.message || 'Error updating product' });
        }
    });
};

// Toggle Product Status
const toggleProductStatus = async (req, res,next) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        product.isActive = !product.isActive;
        await product.save();

        res.json({
            message: 'Product status updated',
            isActive: product.isActive
        });
    } catch (error) {
        next(error)
    }
};

export default { getproducts, addProduct, getProductDetails, updateProduct, toggleProductStatus }


 
