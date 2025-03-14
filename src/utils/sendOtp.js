import nodemailer from 'nodemailer'
import { config } from "dotenv"

config()

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    service: "gmail",
    port: 587,
    auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
    },
});


export const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString()


export const sendOTPEmail = async (email, otp) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL,
            to: email,
            subject: "GymVault - Verify Your Account",
            html: `
                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 10px;">
                    <h1 style="color: #007bff; text-align: center;">Welcome to GymVault</h1>
                    <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; margin-top: 20px;">
                        <h2 style="color: #343a40; text-align: center;">Your Verification Code</h2>
                        <p style="font-size: 24px; font-weight: bold; text-align: center; color: #28a745; letter-spacing: 8px; margin: 20px 0;">
                            ${otp}
                        </p>
                        <p style="color: #6c757d; text-align: center;">
                             Please use this code to verify your GymVault account.<br>
                            This code will expire in 10 minutes.
                        </p>
                    </div>
                    <p style="color: #dc3545; font-size: 12px; text-align: center; margin-top: 20px;">
                         If you didn't request this code, please ignore this email..
                    </p>
                </div>
            `
        });
    } catch (error) {
        console.error("Error sending OTP to email:", error);
    }
};

export const sendEmailChangeOTP = async (email, otp) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL,
            to: email,
            subject: "GymVault - Verify Your Email Change",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 10px;">
                    <h1 style="color: #007bff; text-align: center;">GymVault Email Verification</h1>
                    <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; margin-top: 20px;">
                        <h2 style="color: #343a40; text-align: center;">Your Email Change Verification Code</h2>
                        <p style="font-size: 24px; font-weight: bold; text-align: center; color: #28a745; letter-spacing: 8px; margin: 20px 0;">
                            ${otp}
                        </p>
                        <p style="color: #6c757d; text-align: center;">
                            Please use this code to verify your new email address.<br>
                            This code will expire in 10 minutes.
                        </p>
                    </div>
                    <p style="color: #dc3545; font-size: 12px; text-align: center; margin-top: 20px;">
                        If you didn't request to change your email, please secure your account immediately.
                    </p>
                </div>
            `
        });
    } catch (error) {
        console.error("Error sending email change OTP:", error);
        throw error; // Re-throw to handle in the controller
    }
};
