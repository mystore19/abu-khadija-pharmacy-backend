require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

/* ================================
   DATABASE CONNECTION (MongoDB)
================================ */

mongoose.connect(process.env.MONGO_URI)
.then(()=> console.log("MongoDB connected"))
.catch(err => console.log(err));


/* ================================
   MODELS
================================ */

// DRUG MODEL
const Drug = mongoose.model("Drug", {
  name: String,
  price: Number,
  stock: Number,
  description: String,
  image: String,
  createdAt: { type: Date, default: Date.now }
});

// PATIENT MODEL
const Patient = mongoose.model("Patient", {
  name: String,
  email: String,
  phone: String,
  password: String,
  createdAt: { type: Date, default: Date.now }
});

// ORDER MODEL
const Order = mongoose.model("Order", {
  patientName: String,
  phone: String,
  address: String,
  drugs: Array,
  total: Number,
  status: { type: String, default: "Pending" },
  createdAt: { type: Date, default: Date.now }
});


/* ================================
   EMAIL SETUP
================================ */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


/* ================================
   WHATSAPP ALERT FUNCTION
================================ */

async function sendWhatsApp(message){
  try{
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: process.env.ADMIN_WHATSAPP,
        type: "text",
        text: { body: message }
      },
      {
        headers:{
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  }catch(err){
    console.log("WhatsApp error", err.message);
  }
}


/* ================================
   AUTHENTICATION
================================ */

function auth(req,res,next){
  const token = req.headers.authorization;
  if(!token) return res.status(401).send("Unauthorized");

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded)=>{
    if(err) return res.status(403).send("Invalid token");
    req.user = decoded;
    next();
  });
}


/* ================================
   ADMIN: ADD DRUG
================================ */

app.post("/api/drugs", async(req,res)=>{
  const drug = new Drug(req.body);
  await drug.save();
  res.send("Drug added");
});


/* ================================
   GET ALL DRUGS
================================ */

app.get("/api/drugs", async(req,res)=>{
  const drugs = await Drug.find();
  res.json(drugs);
});


/* ================================
   UPDATE STOCK
================================ */

app.put("/api/drugs/:id", async(req,res)=>{
  await Drug.findByIdAndUpdate(req.params.id, req.body);
  res.send("Drug updated");
});


/* ================================
   PATIENT REGISTER
================================ */

app.post("/api/register", async(req,res)=>{
  const hashed = await bcrypt.hash(req.body.password,10);

  const patient = new Patient({
    name:req.body.name,
    email:req.body.email,
    phone:req.body.phone,
    password:hashed
  });

  await patient.save();
  res.send("Account created");
});


/* ================================
   PATIENT LOGIN
================================ */

app.post("/api/login", async(req,res)=>{
  const patient = await Patient.findOne({ email:req.body.email });
  if(!patient) return res.send("User not found");

  const valid = await bcrypt.compare(req.body.password, patient.password);
  if(!valid) return res.send("Invalid password");

  const token = jwt.sign({ id:patient._id }, process.env.JWT_SECRET);
  res.json({ token });
});


/* ================================
   PLACE ORDER
================================ */

app.post("/api/orders", async(req,res)=>{

  const order = new Order(req.body);
  await order.save();

  // reduce stock
  for(const item of req.body.drugs){
    await Drug.updateOne(
      { _id:item.id },
      { $inc:{ stock:-item.qty } }
    );
  }

  // send whatsapp alert
  sendWhatsApp(`New order from ${req.body.patientName}`);

  // send email receipt
  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: "New Pharmacy Order",
    text: JSON.stringify(req.body)
  });

  res.send("Order placed");
});


/* ================================
   GET ALL ORDERS
================================ */

app.get("/api/orders", async(req,res)=>{
  const orders = await Order.find().sort({ createdAt:-1 });
  res.json(orders);
});


/* ================================
   UPDATE ORDER STATUS
================================ */

app.put("/api/orders/:id", async(req,res)=>{
  await Order.findByIdAndUpdate(req.params.id, req.body);
  res.send("Order updated");
});


/* ================================
   GOOGLE SHEETS SYNC
================================ */

app.post("/api/sync-sheet", async(req,res)=>{
  await axios.post(process.env.GOOGLE_SHEET_WEBHOOK, req.body);
  res.send("Synced to Google Sheets");
});


/* ================================
   SERVER START
================================ */

app.listen(process.env.PORT || 5000, ()=>{
  console.log("Abu-Khadija Pharmacy Backend Running");
});
