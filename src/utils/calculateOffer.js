//Calculate the final price after applying coupon
export const calculateFinalPrice = (product, categoryOffer, productOffer, selectedSize = null) => {
    let appliedDiscount = 0;
    let appliedOffer = null;

    // Apply category offer if exists
    if (categoryOffer) {
        const categoryDiscountAmount = categoryOffer.discount;
        if (categoryDiscountAmount > appliedDiscount) {
            appliedDiscount = categoryDiscountAmount;
            appliedOffer = categoryOffer;
        }
    }

    // Apply product offer if exists
    if (productOffer) {
        const productDiscountAmount = productOffer.discount;
        if (productDiscountAmount > appliedDiscount) {
            appliedDiscount = productDiscountAmount;
            appliedOffer = productOffer;
        }
    }

    // Get price based on selected size or minimum price
    let price;
    if (selectedSize) {
        const sizeObj = product.size.find(s => s.size === selectedSize);
        price = sizeObj ? sizeObj.price : Math.min(...product.size.map(size => size.price));
    } else {
        price = Math.min(...product.size.map(size => size.price));
    }

    // Get minimum and maximum prices from sizes
    const minPrice = Math.min(...product.size.map(size => size.price));
    const maxPrice = Math.max(...product.size.map(size => size.price));

    // Calculate final price with discount
    const finalPrice = appliedDiscount > 0 
        ? Math.round(price * (1 - appliedDiscount / 100))
        : price;

    // Calculate discount amount
    const discountAmount = appliedDiscount > 0 
        ? Math.round(price * (appliedDiscount / 100))
        : 0;

    return {
        finalPrice,
        appliedDiscount: discountAmount,
        discountPercentage: appliedDiscount,
        appliedOffer,
        minPrice,
        maxPrice,
        originalPrice: price
    };
}