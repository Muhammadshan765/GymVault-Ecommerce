import express from "express"
const router = express.Router();
import userController from "../controllers/user/userController.js";
import userMiddleware from "../middlewares/userMiddleware.js"
import shophomeController from "../controllers/user/shophomeController.js";
import viewProductController from "../controllers/user/viewProductController.js";

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
router.get('/auth/google',userMiddleware.isLogin,userController.getGoogle)
router.get('/auth/google/callback',userMiddleware.isLogin,userController.getGoogleCallback)


//user home page
router.get("/",shophomeController.getHome)
router.get("/home",userMiddleware.checkSession, shophomeController.getHome)
router.get("/shop",shophomeController.getShop)

//view product
 router.get("/product/:id",userMiddleware.checkSession,viewProductController.getProductDetails)

//  router.get('/product/:id', userMiddleware.checkSession, viewProductController.getProductDetails);

export default router;









