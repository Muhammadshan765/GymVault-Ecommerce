//Calculate the final price after aplying coupon
export const calculateFinalPrice = (product, categoryOffer, productOffer) => {
    let finalPrice = product.price;
    let appliedDiscount = 0;
    let appliedOffer = null;

    //Apply category offer if exists
    if (categoryOffer) {
        const categoryDiscountAmount = (finalPrice * categoryOffer.discount) / 100;
        if (categoryDiscountAmount > appliedDiscount) {
            appliedDiscount = categoryDiscountAmount;
            appliedOffer = categoryOffer;
        }
    }

    //Apply product offer if exists
    if (productOffer) {
        const productDiscountAmount = (finalPrice * productOffer.discount) / 100;
        if (productDiscountAmount > appliedDiscount) {
            appliedDiscount = productDiscountAmount;
            appliedOffer = productOffer;
        }
    }

    finalPrice -= appliedDiscount;
    return {
        finalPrice: Math.round(finalPrice),
        appliedDiscount: Math.round(appliedDiscount),
        discountPercentage: appliedOffer ? appliedOffer.discount : 0,
        appliedOffer: appliedOffer
    };
}