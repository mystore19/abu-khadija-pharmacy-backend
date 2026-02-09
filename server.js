require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(bodyParser.json());

/* ===============================
   BASIC ROUTE (fix Cannot GET /)
================================ */
app.get("/", (req, res) => {
  res.send("Abu-Khadija Pharmacy Backend is running...");
});

/* ===============================
   DATABASE CONNECTION
================================ */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

/* ===============================
   MODELS
================================ */

// PATIENT
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  password: String
});
const User = mongoose.model("User", UserSchema);

// DRUG
const DrugSchema = new mongoose.Schema({
  name: String,
  price: Number,
  stock: Number,
  description: String,
  image: String,
  createdAt: { type: Date, default: Date.now }
});
const Drug = mongoose.model("Drug", DrugSchema);

// ORDER
const OrderSchema = new mongoose.Schema({
  userId: String,
  drugs: Array,
  totalAmount: Number,
  deliveryAddress: String,
  status: { type: String, default: "Pending" },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model("Order", OrderSchema);

/* ===============================
   AUTH MIDDLEWARE
================================ */
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(403).send("Token required");

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send("Invalid token");
    req.userId = decoded.id;
    next();
  });
};

/* ===============================
   PATIENT ACCOUNT ROUTES
================================ */

// REGISTER
app.post("/api/register", async (req, res) => {
  const { name, email, phone, password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new User({
    name,
    email,
    phone,
    password: hashedPassword
  });

  await user.save();
  res.send("User registered");
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(404).send("User not found");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).send("Invalid password");

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});

/* ===============================
   DRUG ROUTES (ADMIN)
================================ */

// ADD DRUG
app.post("/api/drugs", async (req, res) => {
  const drug = new Drug(req.body);
  await drug.save();
  res.send("Drug added");
});

// GET ALL DRUGS
app.get("/api/drugs", async (req, res) => {
  const drugs = await Drug.find();
  res.json(drugs);
});

// UPDATE STOCK
app.put("/api/drugs/:id", async (req, res) => {
  await Drug.findByIdAndUpdate(req.params.id, req.body);
  res.send("Drug updated");
});

// DELETE DRUG
app.delete("/api/drugs/:id", async (req, res) => {
  await Drug.findByIdAndDelete(req.params.id);
  res.send("Drug deleted");
});

/* ===============================
   ORDER / CHECKOUT SYSTEM
================================ */

app.post("/api/orders", verifyToken, async (req, res) => {
  const { drugs, totalAmount, deliveryAddress } = req.body;

  // Reduce stock
  for (let item of drugs) {
    const drug = await Drug.findById(item.drugId);
    drug.stock -= item.quantity;
    await drug.save();
  }

  const order = new Order({
    userId: req.userId,
    drugs,
    totalAmount,
    deliveryAddress
  });

  await order.save();

  // SEND EMAIL RECEIPT
  sendEmail(order);

  // SEND WHATSAPP NOTIFICATION
  sendWhatsApp(order);

  res.send("Order placed successfully");
});

// TRACK ORDER
app.get("/api/orders", verifyToken, async (req, res) => {
  const orders = await Order.find({ userId: req.userId });
  res.json(orders);
});

/* ===============================
   EMAIL NOTIFICATION
================================ */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function sendEmail(order) {
  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: "New Pharmacy Order",
    text: `New order placed. Amount: ₦${order.totalAmount}`
  });
}

/* ===============================
   WHATSAPP BOT ALERT
================================ */
async function sendWhatsApp(order) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: process.env.ADMIN_WHATSAPP,
        type: "text",
        text: {
          body: `New order received. Total: ₦${order.totalAmount}`
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.log(err.response?.data || err.message);
  }
}

/* ===============================
   GOOGLE SHEETS INTEGRATION (READY)
================================ */
// (will activate after credentials added)

/* ===============================
   START SERVER
================================ */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
