import Order from "../../models/orderModel.js"
import { startOfYear, endOfYear, eachMonthOfInterval, format } from 'date-fns';
import Category from "../../models/categoryModel.js";



const getDashboard = async (req, res, next) => {
  try {
      const timeFrame = req.query.timeFrame;
      const productSort = req.query.productSort;
      const categorySort = req.query.categorySort || 'units';
      const currentDate = new Date();
      let startDate, endDate, dateFormat, groupBy;


      //set date RANGE based on tmeFrame

      switch (timeFrame) {
          case 'daily':
              startDate = new Date(currentDate.setHours(0, 0, 0, 0));
              endDate = new Date(currentDate.setHours(23, 59, 59, 999));
              dateFormat = 'HH:mm'; // Hours format
              groupBy = { $hour: '$orderDate' };
              break;
          case 'weekly':
              startDate = new Date(currentDate.setDate(currentDate.getDate() - 7));
              endDate = new Date();
              dateFormat = 'EEE'; // Day name format
              groupBy = { $dayOfWeek: '$orderDate' };
              break;
          case 'monthly':
              startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
              endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
              dateFormat = 'dd'; // Day of month format
              groupBy = { $dayOfMonth: '$orderDate' };
              break;
          default: // yearly
              startDate = startOfYear(new Date(currentDate.getFullYear(), 0));
              endDate = endOfYear(new Date(currentDate.getFullYear(), 0));
              dateFormat = 'MMM'; // Month name format
              groupBy = { $month: '$orderDate' };
      }

      //Get revnue data based on timeFrame
      const revenueData = await Order.aggregate([
          {
              $match: {
                  orderDate: { $gte: startDate, $lte: endDate },
                  'payment.paymentStatus': 'completed'
              }
          },
          {
              $group: {
                  _id: groupBy,
                  totalRevenue: { $sum: '$totalAmount' }
              }
          },
          {
              $sort: { _id: 1 }
          }
      ]);

      //format chart Data based on date frame
      let chartData;
      if (timeFrame === 'daily') {
          //24 hour format
          chartData = Array.from({ length: 24 }, (_, hour) => {
              const revenue = revenueData.find(d => d._id === hour);
              return {
                  time: `${hour}:00`,
                  revenue: revenue ? revenue.totalRevenue : 0
              };
          });
      } else if (timeFrame === 'weekly') {
          //last 7 days
          chartData = Array.from({ length: 7 }, (_, i) => {
              const date = new Date(startDate);
              date.setDate(date.getDate() + i);
              const revenue = revenueData.find(d => d._id === ((date.getDay() + 1) % 7 + 1));
              return {
                  time: format(date, 'EEE'),
                  revenue: revenue ? revenue.totalRevenue : 0
              };
          });
      } else if (timeFrame == 'monthly') {
          // Days in current month
          const daysInMonth = endDate.getDate();
          chartData = Array.from({ length: daysInMonth }, (_, i) => {
              const revenue = revenueData.find(d => d._id === (i + 1));
              return {
                  time: `${i + 1}`,
                  revenue: revenue ? revenue.totalRevenue : 0
              };
          });
      } else {
          // Months in year
          chartData = Array.from({ length: 12 }, (_, i) => {
              const revenue = revenueData.find(d => d._id === (i + 1));
              return {
                  time: format(new Date(currentDate.getFullYear(), i), 'MMM'),
                  revenue: revenue ? revenue.totalRevenue : 0
              };
          });
      }

      // Get total revenue for the year
      const yearlyRevenue = await Order.aggregate([
          {
              $match: {
                  orderDate: { $gte: startDate, $lte: endDate },
                  'payment.paymentStatus': 'completed'
              }
          },
          {
              $group: {
                  _id: null,
                  total: { $sum: '$totalAmount' }
              }
          }
      ]);

      // Get total orders count
      const totalOrders = await Order.countDocuments({
          orderDate: { $gte: startDate, $lte: endDate }
      });

      // Get completed orders count
      const completedOrders = await Order.countDocuments({
          orderDate: { $gte: startDate, $lte: endDate },
          'items.order.status': 'delivered'
      });


      // Calculate monthly growth
      const previousMonth = new Date();
      previousMonth.setMonth(previousMonth.getMonth() - 1);

      const currentMonthRevenue = await Order.aggregate([
          {
              $match: {
                  orderDate: {
                      $gte: new Date(currentDate.getFullYear(), new Date().getMonth(), 1),
                      $lte: new Date()
                  },
                  'payment.paymentStatus': 'completed'
              }
          },
          {
              $group: {
                  _id: null,
                  total: { $sum: '$totalAmount' }
              }
          }
      ]);


      const previousMonthRevenue = await Order.aggregate([
          {
              $match: {
                  orderDate: {
                      $gte: new Date(currentDate.getFullYear(), previousMonth.getMonth(), 1),
                      $lte: new Date(currentDate.getFullYear(), previousMonth.getMonth() + 1, 0)
                  },
                  'payment.paymentStatus': 'completed'
              }
          },
          {
              $group: {
                  _id: null,
                  total: { $sum: '$totalAmount' }
              }
          }
      ]);

      // Calculate growth percentage
      const currentMonthTotal = currentMonthRevenue[0]?.total || 0;
      const previousMonthTotal = previousMonthRevenue[0]?.total || 0;
      const growthPercentage = previousMonthTotal === 0 ? 100 :
          Math.round(((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100);


      // Get top selling products
      const topProducts = await Order.aggregate([
          {
              $match: {
                  orderDate: { $gte: startDate, $lte: endDate },
                  'payment.paymentStatus': 'completed',
                  'items.order.status': { $ne: 'cancelled' }
              }
          },
          { $unwind: '$items' },
          {
              $match: {
                  'items.order.status': { $ne: 'cancelled' }
              }
          },
          {
              $group: {
                  _id: '$items.product',
                  totalQuantity: { $sum: '$items.quantity' },
                  totalRevenue: { $sum: '$items.subtotal' }
              }
          },
          {
              $lookup: {
                  from: 'products',
                  localField: '_id',
                  foreignField: '_id',
                  as: 'productDetails'
              }
          },
          { $unwind: '$productDetails' },
          {
              $project: {
                  productName: '$productDetails.productName',
                  brand: '$productDetails.brand',
                  totalQuantity: 1,
                  totalRevenue: 1,
                  imageUrl: { $arrayElemAt: ['$productDetails.imageUrl', 0] }
              }
          },
          {
              $sort: productSort === 'revenue' ?
                  { totalRevenue: -1 } :
                  { totalQuantity: -1 }
          },
          { $limit: 10 }
      ]);

      // Get top  selling categories with dynamic sorting
      const topCategories = await Order.aggregate([
          {
              $match: {
                  orderDate: { $gte: startDate, $lte: endDate },
                  'payment.paymentStatus': 'completed',
                  'items.order.status': { $ne: 'cancelled' }
              }
          },
          { $unwind: '$items' },
          {
              $match: {
                  'items.order.status': { $ne: 'cancelled' }
              }
          },
          {
              $lookup: {
                  from: 'products',
                  localField: 'items.product',
                  foreignField: '_id',
                  as: 'productDetails'
              }
          },
          { $unwind: '$productDetails' },
          {
              $lookup: {
                  from: 'categories',
                  localField: 'productDetails.categoriesId',
                  foreignField: '_id',
                  as: 'categoryDetails'
              }
          },
          { $unwind: '$categoryDetails' },
          {
              $group: {
                  _id: '$categoryDetails._id',
                  categoryName: { $first: '$categoryDetails.name' },
                  totalQuantity: { $sum: '$items.quantity' },
                  // Calculate revenue using the actual price from items
                  totalRevenue: {
                      $sum: {
                          $multiply: [
                              { $subtract: ['$items.price', { $ifNull: ['$items.discountedPrice', 0] }] },
                              '$items.quantity'
                          ]
                      }
                  }
              }
          },
          {
              $match: {
                  // Ensure we only get active categories
                  '_id': {
                      $in: await Category.find({ isActive: true }).distinct('_id')
                  }
              }
          },
          {
              $project: {
                  _id: 1,
                  categoryName: 1,
                  totalQuantity: 1,
                  totalRevenue: 1
              }
          },
          {
              $sort: categorySort === 'revenue' ?
                  { totalRevenue: -1 } :  // Sort by total revenue if revenue is selected
                  { totalQuantity: -1 }   // Sort by total quantity if units is selected
          },
          { $limit: 10 }
      ]);

      res.render('admin/dashboard', {
          chartData: JSON.stringify(chartData),
          timeFrame,
          totalRevenue: yearlyRevenue[0]?.total || 0,
          totalOrders,
          completedOrders,
          growthPercentage,
          topProducts,
          topCategories,
          productSort,
          categorySort
      });


  } catch (next) {
      next(error)
  }
};

//  const getdashboard=(req,res)=>{
//   res.render("admin/dashboard")
// }

export default {
  getDashboard,
}