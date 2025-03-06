import Wallet from "../../models/walletModel.js"
import userSchema from "../../models/userModel.js"

const getWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        const user = await userSchema.findById(userId);

        //find or create wallet
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = await Wallet.create({ userId });

        }

        // get recent transactions 
        const transactions = wallet.transactions.sort((a, b) => b.date - a.date);


        res.render('user/wallet', {
            wallet,
            transactions,
            user
        });
    } catch (error) {
        console.error('Get wallet error', error);
        res.status(500).json({
            message: 'Error feteching wallet details',
            user: req.session.user
        });

    }
};

export default{
    getWallet
}