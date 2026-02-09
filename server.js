const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let drugs = [];
let orders = [];
let patients = [];

// add drug
app.post('/add-drug', (req,res)=>{
  drugs.push(req.body);
  res.send("Drug added");
});

// get all drugs
app.get('/products', (req,res)=>{
  res.json(drugs);
});

// save order
app.post('/orders', (req,res)=>{
  orders.push(req.body);
  res.send("Order saved");
});

// register patient
app.post('/patients', (req,res)=>{
  patients.push(req.body);
  res.send("Patient created");
});

app.listen(5000, ()=> console.log("Abu-Khadija Pharmacy Server Running"));
