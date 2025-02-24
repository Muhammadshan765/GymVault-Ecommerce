import userSchema from "../../models/userModel.js"

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



export default {
    getProfile,
    updateProfile
}