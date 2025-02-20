const checkSession = (req, res, next) => {
    if (req.session.isAdmin) {
        next()
    } else {
        res.redirect("/admin/login")
    }
}
const isLogin = (req, res, next) => {

    if (req.session.isAdmin) {
        res.redirect("/admin/dashboard")
    } else {
        next()
    }
}

const errorHandler = (err , req , res, next)=>{
    console.error('Error:',err);

    res.status(err.status||500).json({
        success:false,
        message: err.message||'Internal server error'
    });
}

export default {
    checkSession,
    isLogin,
    errorHandler,
}