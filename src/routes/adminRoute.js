import express from "express";
const router = express.Router();
import adminController from "../controllers/admin/adminController.js";
import dashboardController from "../controllers/admin/dashboardController.js"
import productsController from "../controllers/admin/productsController.js"
import customersController from "../controllers/admin/customersController.js";
import categoryController from "../controllers/admin/categoryController.js";
import adminMiddleware from "../middlewares/adminMiddleware.js";
import orderController from "../controllers/admin/orderController.js";
import couponController from "../controllers/admin/couponController.js";
import offerController from "../controllers/admin/offerController.js";


//Admin Routes
router.get("/login", adminMiddleware.isLogin, adminController.loadLogin);
router.post("/login", adminController.login)
router.get("/dashboard", adminMiddleware.checkSession, dashboardController.getdashboard)
router.get("/customers",adminMiddleware.checkSession,adminMiddleware.errorHandler, customersController.getcustomers)
router.post("/user/:id/toggle-block",adminMiddleware.checkSession,adminMiddleware.errorHandler,customersController.getToggle)
router.get("/logout", adminController.logout)

 
//Category Routes
router.get("/category", adminMiddleware.checkSession, adminMiddleware.errorHandler, categoryController.getcategory)
router.post("/category/add", adminMiddleware.checkSession, adminMiddleware.errorHandler, categoryController.addCategory)
router.post("/category/edit", adminMiddleware.checkSession, adminMiddleware.errorHandler, categoryController.editCatagory)
router.get("/category/toggle", adminMiddleware.checkSession, adminMiddleware.errorHandler, categoryController.toggleCategory)

//Product Routes
router.get("/products", adminMiddleware.checkSession, adminMiddleware.errorHandler, productsController.getproducts)
router.post("/products/add", adminMiddleware.checkSession, adminMiddleware.errorHandler, productsController.addProduct)
router.get("/products/:id", adminMiddleware.checkSession, adminMiddleware.errorHandler, productsController.getProductDetails)
router.post("/products/edit/:id", adminMiddleware.checkSession, adminMiddleware.errorHandler, productsController.updateProduct)
router.post("/products/toggle-status/:id", adminMiddleware.checkSession, adminMiddleware.errorHandler, productsController.toggleProductStatus)

//order routes
router.get("/orders",adminMiddleware.checkSession,orderController.getOrders)
router.patch("/orders/:orderId/items/:productId/status",adminMiddleware.checkSession,adminMiddleware.errorHandler,orderController.updateItemStatus)
router.post("/orders/:orderId/items/:productId/return",adminMiddleware.checkSession,adminMiddleware.errorHandler,orderController.handleReturnRequest)

//coupon routes
router.get("/coupon",adminMiddleware.checkSession,adminMiddleware.errorHandler,couponController.getCoupons)
router.post("/coupons/add",adminMiddleware.checkSession,adminMiddleware.errorHandler,couponController.addCoupons)
router.delete("/coupons/delete/:id",adminMiddleware.checkSession,adminMiddleware.errorHandler,couponController.deleteCoupon)

//offer routes
router.get("/offers",adminMiddleware.checkSession,adminMiddleware.errorHandler,offerController.getOffers)
router.post("/offers",adminMiddleware.checkSession,adminMiddleware.errorHandler,offerController.createOffer)
router.put("/offers/:offerId",adminMiddleware.checkSession,adminMiddleware.errorHandler,offerController.updateOffer)
router.delete("/offers/:offerId",adminMiddleware.checkSession,adminMiddleware.errorHandler,offerController.deleteOffer)


export default router;