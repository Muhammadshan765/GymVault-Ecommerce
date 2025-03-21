
import Category from "../../models/categoryModel.js"
 
const getcategory = async (req, res, next) => {
  try {
    const categories = await Category.find().sort({createdAt:-1});
    res.render("admin/category",{categories});
  } catch (error) {
    next(error)
  }
}


//add category

const addCategory = async (req, res, next) => {
  try {
      const { categoryName, categoryDescription } = req.body;
      const trimmedCategoryName = categoryName.trim();

      //Validate category
      if (!/^[A-Za-z]+$/.test(trimmedCategoryName)) {
          return res.status(400).send('Category can only contain Alphabets');
      }

      if (trimmedCategoryName.length > 20) {
          return res.status(400).send('Category name must not exceed 20 characters')
      }

      //capitaize first letter,rest lowercase
      const formattedCategoryName = trimmedCategoryName.charAt(0).toUpperCase() + trimmedCategoryName.slice(1).toLowerCase();

      //check if category name exists
      const existingCategory = await Category.findOne({
          name: { $regex: new RegExp(`${formattedCategoryName}$`, 'i') }
      });

      if (existingCategory) {
          return res.status(400).send('Category name already exists');
      }


      //validate categoryDescription 
      if (categoryDescription.length < 10 || categoryDescription.length > 100) {
          return res.status(400).send('Description must be between 10 and 100 characters');

      }


      const newCategory = new Category({
          name: formattedCategoryName,
          description: categoryDescription,
          isActive: true,
      });


      await newCategory.save();
      res.redirect('/admin/category');
  } catch (error) {
      next(error)
  }
};

 
//Edit category
const editCatagory = async (req, res, next) => {
  try {
      const { categoryId, categoryName, categoryDescription } = req.body;
      const trimmedCategoryName = categoryName.trim();

      //validate catagory name
      if (!/^[A-Za-z]+$/.test(trimmedCategoryName)) {
          return res.status(400).send('Catagory name can only contain alphabets');
      }

      if (trimmedCategoryName.length > 20) {
          return res.status(400).send('Category name must not exceed 20 characters');

      }

      //capitalise first letter
      const formattedCategoryName = trimmedCategoryName.charAt(0).toUpperCase() +
          trimmedCategoryName.slice(1).toLowerCase();

      // Check if category name already exists (excluding current category)
      const existingCategory = await Category.findOne({
          _id: { $ne: categoryId },
          name: { $regex: new RegExp(`^${formattedCategoryName}$`, 'i') }
      });

      if (existingCategory) {
          return res.status(400).send('Category name already exists.');
      }

      //validate category description
      if (categoryDescription.length < 10 || categoryDescription.length > 100) {
          return res.status(400).send(
              'Description must be between 10 and 100 characters.'
          );
      }

      await Category.findByIdAndUpdate(categoryId, {
          name: formattedCategoryName,
          description: categoryDescription,
      });

      res.redirect('/admin/category');

  } catch (error) {
      next(error)
  }
};

//soft delete
const
    toggleCategory = async (req, res, next) => {
        try {
            const { id } = req.query;

            //find and update the category
            const category = await Category.findById(id);
            if (!category) {
                return res.status(404).json({
                    message: 'Category not found'
                });
            }

            category.isActive = !category.isActive;
            await category.save();

            return res.status(200).json({
                success: true,
                message: `Category ${category.isActive ? 'show' : 'hidden'} successfully`
            });

        } catch (error) {
            next(error)

        }
    };


export default {
  getcategory,
  addCategory,
  editCatagory,
  toggleCategory,
}