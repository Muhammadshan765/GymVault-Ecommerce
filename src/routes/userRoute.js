import express, { Router } from "express"
const router = express.Router();
import userController from "../controllers/user/userController.js";
import userMiddleware from "../middlewares/userMiddleware.js"
import shophomeController from "../controllers/user/shophomeController.js";
import viewProductController from "../controllers/user/viewProductController.js";
import profileController from "../controllers/user/profileController.js"
import addressController from "../controllers/user/addressController.js";
import cartController from "../controllers/user/cartController.js";
import checkoutController from "../controllers/user/checkoutController.js";
import orderController from "../controllers/user/orderController.js";
import wishlistController from "../controllers/user/wishlistController.js";
import walletController from "../controllers/user/walletController.js";
import couponController from "../controllers/user/couponController.js";

// user signup & login
router.get('/signup', userMiddleware.isLogin, userController.getSignUp)
router.post('/signup', userController.postSignUp)
router.get('/login', userMiddleware.isLogin, userController.loadLogin)
router.post('/login', userController.postLogin)

//user otp
router.post('/validate-otp', userController.postOtp)
router.post('/resend-otp', userController.postResendOtp)

// user logout
router.get('/logout', userMiddleware.checkSession, userController.getLogout);

//user google login 
router.get('/auth/google', userMiddleware.isLogin, userController.getGoogle)
router.get('/auth/google/callback', userMiddleware.isLogin, userController.getGoogleCallback)


//user home page
router.get("/", shophomeController.getHome)
router.get("/home", userMiddleware.checkSession, shophomeController.getHome)
router.get("/shop", shophomeController.getShop)

//view product
router.get("/product/:id", userMiddleware.checkSession, viewProductController.getProductDetails)

//forgot password & change Password 
router.get("/forgot-password", userController.getForgotPassword)
router.post("/forgot-password/send-otp", userController.sendForgotPasswordOTP)
router.post("/forgot-password/verify-otp", userController.verifyForgotPasswordOTP)
router.post("/forgot-password/reset-password", userController.resetPassword)
router.get("/change-password", userMiddleware.checkSession, userController.getChangePassword)
router.post("/change-password", userMiddleware.checkSession, userController.postChangePassword)

//user profile
router.get("/profile", userMiddleware.checkSession, profileController.getProfile)
router.patch("/profile/update", userMiddleware.checkSession, profileController.updateProfile)
router.post("/profile/send-email-otp", userMiddleware.checkSession, profileController.sendEmailOTP)
router.post("/profile/verify-email-otp", userMiddleware.checkSession, profileController.verifyEmailOTP)

//user address
router.get("/address", userMiddleware.checkSession, addressController.getAddress)
router.post("/address/add", userMiddleware.checkSession, addressController.addAddress)
router.put("/address/:id", userMiddleware.checkSession, addressController.editAddress)
router.delete("/address/:id", userMiddleware.checkSession, addressController.deleteAddress)

//user cart
router.get("/cart", userMiddleware.checkSession, cartController.getCart)
router.post("/cart/add", userMiddleware.checkSession, cartController.addToCart)
router.patch("/cart/update-quantity", userMiddleware.checkSession, cartController.updateQuantity)
router.delete("/cart/remove/:productId", userMiddleware.checkSession, cartController.removeFromCart)

//checkout
router.get("/checkout", userMiddleware.checkSession, checkoutController.getCheckoutPage)
router.post("/checkout/place-order", userMiddleware.checkSession, checkoutController.placeOrder)
router.get("/order-success", userMiddleware.checkSession, checkoutController.getOrderSuccessPage)

//view order
router.get("/orders", userMiddleware.checkSession, orderController.getOrders)
router.patch("/orders/:orderId/items/:productId/cancel", userMiddleware.checkSession, orderController.cancelOrder)
router.post("/orders/:orderId/items/:productId/return", userMiddleware.checkSession, orderController.requestReturnItem)

//wishlist
router.get("/wishlist", userMiddleware.checkSession,userMiddleware.errorHandler,wishlistController.getWishlist)
router.post("/wishlist/add", userMiddleware.checkSession, userMiddleware.errorHandler,wishlistController.addToWishlist)
router.delete("/wishlist/remove/:productId", userMiddleware.checkSession, userMiddleware.errorHandler,wishlistController.removeWishlist)

//wallet 
router.get("/wallet",userMiddleware.checkSession,userMiddleware.errorHandler,walletController.getWallet)
router.post("/checkout/wallet-payment",userMiddleware.checkSession,userMiddleware.errorHandler,checkoutController.walletPayment)



//coupon 
router.get("/coupons",userMiddleware.checkSession,userMiddleware.errorHandler,couponController.getCoupons)

router.get("/checkout/available-coupons",userMiddleware.checkSession,userMiddleware.errorHandler,checkoutController.getAvailableCoupons)
router.post("/checkout/apply-coupon",userMiddleware.checkSession,userMiddleware.errorHandler,checkoutController.applyCoupon)
router.post("/checkout/remove-coupon",userMiddleware.checkSession,userMiddleware.errorHandler,checkoutController.removeCoupon)

//Razorpay
router.post('/checkout/create-razorpay-order',userMiddleware.checkSession,userMiddleware.errorHandler,checkoutController.createRazorpayOrder)
router.post('/checkout/verify-payment',userMiddleware.checkSession,userMiddleware.errorHandler,checkoutController.verifyPayment)
router.post("/checkout/payment-failed",userMiddleware.checkSession,userMiddleware.errorHandler,checkoutController.handlePaymentFailure) 

// invoice & retry payment
router.get("/orders/:orderId/invoice",userMiddleware.checkSession,userMiddleware.errorHandler,orderController.generateInvoice)
router.post("/orders/:orderId/retry-payment",userMiddleware.checkSession,userMiddleware.errorHandler,orderController.retryPayment)
router.post("/orders/:orderId/verify-retry-payment",userMiddleware.checkSession,userMiddleware.errorHandler,orderController.verifyRetryPayment)


export default router;









