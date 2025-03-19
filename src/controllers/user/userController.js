import userSchema from '../../models/userModel.js'
import bcrypt from 'bcrypt'
import validatePassword from '../../utils/validatePaasword.js'
import passport from 'passport';
import { generateOTP, sendOTPEmail } from "../../utils/sendOtp.js"

const saltRounds = 10;

const loadLogin = (req, res) => {
    res.render('user/login', { message: req.query.message, alertType: req.query.alertType });
};


const getSignUp = (req, res) => {

    try {
        res.render('user/signup')
    } catch (error) {
        console.error('Error rendering signup page:', error);
        res.status(500).render('error', {
            message: 'Error loading signup page',
            error: error.message
        });

    }
}


const postSignUp = async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        //Validate firstname
        if (!firstName || !/^[a-zA-Z]{3,10}$/.test(firstName.trim())) {
            return res.status(400).json({
                success: false,
                message: 'First name should contain only letters (3-10 characters)'
            });
        }

        //Validate lastname
        if (!lastName || !/^[a-zA-Z]{1,10}$/.test(lastName.trim())) {
            return res.status(400).json({

                success: false,
                message: 'Last name should contain only letters (1-10 characters)'
            });
        }

        //Validate Email
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }


        // Validate password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                success: false,
                message: passwordValidation.message
            });
        }

        //check if the user exists
        const existingUser = await userSchema.findOne({ email });

        if (existingUser && !existingUser.isVerified) {
            await userSchema.deleteOne({ _id: existingUser._id });
        } else if (existingUser) {
            const message = !existingUser.password
                ? "This email is linked to a Google login. Please log in with Google."
                : "Email already registered";

            return res.status(400).json({
                success: false,
                message
            });
        }

        const otp = generateOTP();
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new userSchema({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email,
            password: hashedPassword,
            otp,
            otpExpiresAt: Date.now() + 120000,
            otpAttempts: 0
        });


        await newUser.save();

        //debug new user
        console.log(newUser);

        //Schedule deletion after OTP expiry
        setTimeout(async () => {
            const user = await userSchema.findOne({ email });
            if (user && !user.isVerified) {
                await userSchema.deleteOne({ _id: user._id });
            }
        }, 180000);

        await sendOTPEmail(email, otp);
        res.json({
            success: true,
            message: "OTP sent succesfully",
            email: email
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Signup Failed'
        });

    }
}

const postOtp = async (req, res) => {
    try {
        const { userOtp, email } = req.body;
        const user = await userSchema.findOne({ email, otp: userOtp });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP'
            });
        }

        if (Date.now() > user.otpExpiresAt) {
            if (user.otpAttempts >= 3) {
                return res.status(400).json({
                    error: 'Too many attempts.Please signup again'
                });
            }
            return res.status(400).json({
                error: 'OTP Expired'
            });
        }

        if (user.otpAttempts >= 3) {
            return res.status(400).json({
                error: 'Too many attempts.Please signup again'
            });
        }

        //IF otp matches
        if (user.otp === userOtp) {
            await userSchema.findOneAndUpdate(user._id, {
                $set: { isVerified: true },
                $unset: { otp: 1, otpExpiresAt: 1, otpAttempts: 1 }
            });

            req.session.user = user._id;
            return res.json({
                success: true,
                message: 'OTP verified successfully',
                redirectUrl: '/login'
            });

        } else {
            return res.status(400).json({
                error: 'Invalid OTP'
            });
        }

    } catch (error) {
        console.error('OTP verification error:', error);
        return res.status(500).json({
            error: 'OTP verification failed'
        })
    }
}


const postResendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await userSchema.findOne({ email, isVerified: false });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if max attempts reached
        if (user.otpAttempts >= 3) {
            return res.status(400).json({
                success: false,
                message: 'Maximum attempts reached. Please signup again.'
            });
        }

        // Generate new OTP and update user
        const newOtp = generateOTP();
        user.otp = newOtp;
        user.otpExpiresAt = Date.now() + 120000;


        user.otpAttempts = (user.otpAttempts || 0) + 1;
        await user.save();

        //debug user
        console.log(user);

        // Send new OTP
        await sendOTPEmail(email, newOtp);

        res.json({
            success: true,
            message: 'OTP resent successfully'
        });

    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend OTP'
        });
    }
};


const getGoogle = (req, res, next) => {
    //store the trigger in session before rediretion
    req.session.authTrigger = req.query.trigger;

    passport.authenticate("google", {
        scope: ["email", "profile"],
    })(req, res, next);
};

const getGoogleCallback = (req, res, next) => {
    passport.authenticate("google", { failureRedirect: "/login" }, async (err, profile) => {
        try {
            if (err || !profile) {
                return res.redirect("/login?message=Authentication failed&alertType=error");
            }

            const existingUser = await userSchema.findOne({ email: profile.email });
            const names = profile.displayName.split(' ');
            const firstName = names[0];
            const lastName = names.slice(1).join(' ')

            //if user exists check if blocked
            if (existingUser) {
                if (existingUser.blocked) {
                    return res.redirect('/login?message=Your account has been blocked.&alertType=error');
                }

                //update googleId if it dosent exist ans unset otp attempts
                await userSchema.findByIdAndUpdate(existingUser._id, {
                    $set: { googleId: existingUser.googleId || profile.id },
                    $unset: { otpAttempts: 1 }
                });
                req.session.user = existingUser._id;
                return res.redirect("/home");
            }

            //if user dosent exist, create profile
            const newUser = new userSchema({
                firstName: firstName,
                lastName: lastName,
                email: profile.email,
                googleId: profile.id,
                isVerified: true,
            });

            await newUser.save();
            await userSchema.findByIdAndUpdate(newUser._id, {
                $unset: { otpAttempts: 1 }
            });

            req.session.user = newUser._id;
            return res.redirect("/home");
        } catch (error) {
            console.error("Google authentication error", error);
            return res.redirect("/login?message=Authentication failed&alerttype=error");
        }
    })(req, res, next);
};

const postLogin = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        //server side validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        //Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        //Find user 
        const user = await userSchema.findOne({ email });

        // chexk if user exists
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Your email is not registered'
            });
        }

        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: 'This email is linked to a Google login. Please log in with Google.'
            })
        }

        //check if the user is verified
        if (!user.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Please verify yoour email first'
            });
        }

        //Check if the user is blocked
        if (user.blocked) {
            return res.status(400).json({
                success: false,
                message: 'Your account is blocked'
            });
        }

        //Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        //Set session
        req.session.user = user._id;
        req.session.userEmail = user.email;
        req.session.userName = user.firstName;

        //Return success response with resdirect URL
        return res.json({
            success: true,
            message: 'Login successful',
            redirectUrl: '/home'
        });
    } catch (error) {
        console.error('login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Login Failed'
        });
    }
};


const getLogout = (req, res) => {
    // Instead of destroying the entire session, just delete user-specific keys
    delete req.session.user;
    delete req.session.userEmail;
    delete req.session.userName;
    
    // Regenerate the session to ensure old data is completely cleared for this user
    req.session.save(() => {
        res.redirect('/login');
    });
}

const getForgotPassword = (req, res) => {
    try {
        res.render('user/forgotPassword');
    } catch (error) {
        console.error('Error rendering forgot passwordpage', error);
        res.status(500).render('error', {
            message: 'Error loading forgot password page',
            error: error.message
        });

    }
};

const sendForgotPasswordOTP = async (req, res) => {
    try {
        const { email } = req.body;

        //find user
        const user = await userSchema.findOne({ email, isVerified: true });
        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        if (!user.password) {
            return res.status(400).json({
                message: 'Email linked is linked to google login .Please login with Google.'
            });
        }


// Generate and save OTP
        const otp = generateOTP();
        user.otp = otp;
        user.otpExpiresAt = Date.now() + 120000;
        user.otpAttempts = 0;
        await user.save();
        //sent otp      
        await sendOTPEmail(email, otp);
        res.status(200).json({
            message: 'OTP sent succesfully'
        });
    } catch (error) {
        console.error('Send OTP error', error);
        res.status(500).json({
            message: 'Failed to sent OTP'
        });

    }
};


const verifyForgotPasswordOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await userSchema.findOne({
            email,
            otp,
            otpExpiresAt: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                message: 'invalid or expired otp'
            });
        }

        //increment attept
        user.otpAttempts += 1;
        if (user.otpAttempts >= 3) {
            await userSchema.findByIdAndUpdate(user._id, {
                $unset: { otp: 1, otpExpiresAt: 1, otpAttempts: 1 }
            });
            return res.status(400).json({
                mesage: "Too many attempts please try again"
            });
        }
        await user.save();

        if (user.otp !== otp) {
            return res.status(400).json({
                message: 'Invalid OTP'
            });
        }

        res.status(200).json({
            message: 'OTP verified successfully'
        });


    } catch (error) {
        console.error('verify OTP error:', error);
        res.status(500).json({
            message: 'Failed to verify OTP'
        });

    }
};


const resetPassword = async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        const user = await userSchema.findOne({ email });
        if (!user) {
            return res.status(404).json({
                message: 'user not found'
            });
        }



        //validate new password
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                message: passwordValidation.message
            });
        }

        //hash new password
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        //updsate password and remove otp  fields
        await userSchema.findByIdAndUpdate(user._id, {
            $set: { password: hashedPassword },
            $unset: { otp: 1, otpExpiresAt: 1, otpAttempts: 1 }
        });
        res.status(200).json({
            message: 'Password reset successfully'
        });


    } catch (error) {
        console.error('Reset password error', error);
        res.status(500).json({
            message: 'failed to reset password'
        });

    }
};

const getChangePassword = async (req, res) => {
    try {
        //get user  from session 
        const userId = req.session.user;
        const user = await userSchema.findById(userId);

        if (!user) {
            return res.redirect('/login');
        }


        //check if its google login by checking for password
        if (!user.password) {
            return res.redirect('/profile');
        }

        //pass the user object to the view
        res.render('user/changePassword', { user });
    } catch (error) {
        console.error('Get change password error', error);
        res.status(500).render('error', {
            message: "Error loading change password page",
            error: error.message
        });

    }
};


const postChangePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.session.user;

        const user = await userSchema.findById(userId);
        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        //verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({
                message: 'Current password is incorrect'
            });
        }

        //validate new password
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                message: passwordValidation.message
            });
        }

        //hash new password
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        //update new password
        await userSchema.findByIdAndUpdate(userId, {
            password: hashedPassword
        });
        res.status(200).json({
            message: 'Password Updated Succesfully'
        });

    } catch (error) {
        console.error('Change password Error', error);
        res.status(500).json({
            message: 'Failed to update password'
        });

    }
};





export default {
    loadLogin,
    getSignUp,
    postSignUp,
    postOtp,
    postResendOtp,
    getGoogle,
    getGoogleCallback,
    postLogin,
    getLogout,
    getForgotPassword,
    sendForgotPasswordOTP,
    verifyForgotPasswordOTP,
    resetPassword,
    getChangePassword,
    postChangePassword
}





