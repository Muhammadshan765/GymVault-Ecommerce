import express from "express"
const router = express.Router();
import userController from "../controllers/user/userController.js";
import userMiddleware from "../middlewares/userMiddleware.js"
import shophomeController from "../controllers/user/shophomeController.js";

router.get('/login', userMiddleware.isLogin, userController.loadLogin)
router.post('/login', userController.postLogin)
router.get('/signup', userMiddleware.isLogin, userController.getSignUp)
router.post('/signup', userController.postSignUp)
router.post('/validate-otp', userController.postOtp)
router.post('/resend-otp', userController.postResendOtp)
router.get('/logout', userMiddleware.checkSession, userController.getLogout);

router.get("/home", shophomeController.getHome)

// router.get('/',shopnhomeController.getHome)
// router.get('/home',userMiddleware.checkSession,shopnhomeController.getHome)
// router.get('/shop', shopnhomeController.getShop);

export default router;









