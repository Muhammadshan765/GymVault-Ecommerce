import User from "../../models/userModel.js"


const getcustomers=async(req,res)=>{
  try{
  const page = parseInt(req.query.page)||1;
  const limit = 8;
  const skip = (page-1)*limit;


  const totalUsers = await User.countDocuments();
  const totalPages = Math.ceil(totalUsers/limit);

  const userList = await User.find()
  .sort({createdAt:-1})
  .skip(skip)
  .limit(limit);

  if(req.xhr){
      return res.render('admin/customers',{
          userList,
          pagination:{
              currentPage:page,
              totalPages,
              hasNextPage:page<totalPages,
              hasPrevPage:page>1,
              nextPage:page+1,
              prevPage:page-1
          }
      });
  }


  res.render('admin/customers',{
      userList,
      pagination: {
          currentPage: page,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          nextPage: page + 1,
          prevPage: page - 1
      }
  });
  }catch(error){
      console.error(error);
      if(req.xhr){
          return res.status(500).json({error:'Failed to fetch users'});
      }
      res.status(500).send('Server error');
  }
};


const getToggle = async(req , res)=>{
  try {
      const userId = req.params.id;

      
      
      const user = await User.findById(userId);

      if(!user){
          return res.status(404).json({error:'User not found'});
      }

      user.blocked = !user.blocked;
      await user.save()

      if(req.xhr||req.headers.accept.indexOf('json')>-1){
          return res.json({
              sucess:'true',
              message:`User sucessfully ${user.blocked?'blocked':'unblocked'}`
          });
      }

      res.redirect('/admin/customers');
      
  } catch (err) {
      console.error('err');
      if(req.xhr||req.headers.accept.indexOf('json')>-1){
          return res.status(500).json({error:'Server error'});
      }

      res.status(500).send('Server error');
  }
};


export default{
  getcustomers,
  getToggle
}






