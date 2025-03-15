import express from "express";
import nocache from "nocache";
import session from "express-session";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import expressEjsLayouts from "express-ejs-layouts"; 

import connectDb from "./configs/db.js";
import adminRoute from "./routes/adminRoute.js"
import userRoute from "./routes/userRoute.js"
import passport from "passport"; 
import googleAuth from "./utils/googleAuth.js";


const app = express()
dotenv.config();
app.use(nocache())
connectDb();


app.use(session({
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24
  }
}))

//initialize passport
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(expressEjsLayouts);

app.use(express.static(path.join(__dirname, '../public')));
app.use('/static', express.static(path.join(__dirname, '../public/static')));
 
  

app.use("/admin", adminRoute)
app.use("/",userRoute)

// 404 handler 
app.use((req, res) => {
  res.status(404).render('notFound')
});


const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log("server connected successfully");
})
