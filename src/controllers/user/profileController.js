import userSchema from "../../models/userModel.js"
import { generateOTP, sendOTPEmail, sendEmailChangeOTP } from "../../utils/sendOtp.js"

const getProfile = async (req, res) => {
    try {
        const user = await userSchema.findById(req.session.user)
        res.render("user/profile", { user })
    } catch (error) {
        console.error("Error fetching profile", error);
        res.status(500).send("Error loading profile")
    }
};

const updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, email } = req.body
        //Validation 
        const nameRegex = /^[A-Za-z]+$/;
        const errors = [];

        //first name validation
        if (!firstName || firstName.trim().length === 0) {
            errors.push('First Name is required');
        } else if (firstName.trim().length < 3 || firstName.trim().length > 10) {
            errors.push('First name must be between 3 and 10');
        } else if (!nameRegex.test(firstName.trim())) {
            errors.push('First name can only contain letters');
        }

        //lastname validation
        if (!lastName || lastName.trim().length === 0) {
            errors.push('last Name is required');
        } else if (lastName.trim().length < 3 || lastName.trim().length > 10) {
            errors.push('Last name must be between 3 and 10');
        } else if (!nameRegex.test(lastName.trim())) {
            errors.push('Last name can only contain letters');
        }

        //if no validation error
        if (errors.length > 0) {
            return res.status(400).json({
                message: errors.join(',')
            });
        }

        //update if validation is correct
        await userSchema.findOneAndUpdate(
            { email: email.trim() },
            {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
            },
            { new: true }
        );
        res.status(200).json({
            message: "Profile updated successfully"
        });


    } catch (error) {
        console.error("Error updating profile", error);
        res.status(500).json({
            message: "Error updating profile"
        });
    }
};

// Add new methods for email update with OTP
const sendEmailOTP = async (req, res) => {
    try {
        const { newEmail } = req.body;
        const userId = req.session.user;
        
        // Get the user to check if they're using Google auth
        const user = await userSchema.findById(userId);
        
        // Check if user is authenticated via Google
        if (user.googleId) {
            return res.status(403).json({
                message: "Google-authenticated accounts cannot change their email address"
            });
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!newEmail || !emailRegex.test(newEmail.trim())) {
            return res.status(400).json({
                message: "Please provide a valid email address"
            });
        }
        
        // Check if email already exists for another user
        const existingUser = await userSchema.findOne({ email: newEmail.trim() });
        if (existingUser && existingUser._id.toString() !== userId) {
            return res.status(400).json({
                message: "Email already in use by another account"
            });
        }
        
        // Generate OTP using the utility function
        const otp = generateOTP();
        
        // Store OTP in session with expiry time (10 minutes)
        req.session.emailOTP = {
            code: otp,
            email: newEmail.trim(),
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
        };
        
        // Send OTP email using the specialized function for email changes
        await sendEmailChangeOTP(newEmail.trim(), otp);
        
        res.status(200).json({
            message: "OTP sent to your new email address"
        });
    } catch (error) {
        console.error("Error sending email OTP", error);
        res.status(500).json({
            message: "Error sending verification code"
        });
    }
};

const verifyEmailOTP = async (req, res) => {
    try {
        const { otp } = req.body;
        const userId = req.session.user;
        
        // Check if OTP exists and is valid
        if (!req.session.emailOTP || 
            req.session.emailOTP.expiresAt < Date.now() || 
            req.session.emailOTP.code !== otp) {
            return res.status(400).json({
                message: "Invalid or expired verification code"
            });
        }
        
        const newEmail = req.session.emailOTP.email;
        
        // Update user's email
        await userSchema.findByIdAndUpdate(
            userId,
            { email: newEmail },
            { new: true }
        );
        
        // Clear OTP from session
        delete req.session.emailOTP;
        
        res.status(200).json({
            message: "Email updated successfully",
            email: newEmail
        });
    } catch (error) {
        console.error("Error verifying email OTP", error);
        res.status(500).json({
            message: "Error updating email"
        });
    }
};

export default {
    getProfile,
    updateProfile,
    sendEmailOTP,
    verifyEmailOTP
}