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

//view order
router.get("/orders", userMiddleware.checkSession, orderController.getOrders)
router.patch("/orders/:orderId/items/:productId/cancel", userMiddleware.checkSession, orderController.cancelOrder)


export default router;









