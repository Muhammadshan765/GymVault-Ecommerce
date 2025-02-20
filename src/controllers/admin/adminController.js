


const loadLogin = (req, res) => {
  res.render('admin/login')
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body

    //input validation
    if (!email || !password) {
      return res.staus(400).json({
        success: false,
        message: "Email and password are required"
      })
    }


    //Email formate validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }


    //check crediatials against enviromet varables

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      req.session.isAdmin = true;
      return res.status(200).json({
        success: true,
        redirectUrl: '/admin/dashboard'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalied email or password"
      });
    }

  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occured during login"
    });
  }
}

const logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login")
  })
}

export default {
  loadLogin,
  login,
  logout
}
