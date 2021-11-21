const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const admin = require("firebase-admin");
const ObjectId = require("mongodb").ObjectId;
const app = express();
const fileUpload = require("express-fileupload");

const port = process.env.PORT || 5000;

const serviceAccount = require("./react-firebase-auth-reca-9ff6e-firebase-adminsdk-90yfb-35e2aa3533.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(cors());
app.use(express.json());
app.use(fileUpload());

// setup mongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3myda.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function verifyToken(req, res, next) {
  if (req?.headers?.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }
  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db("doctors_portal");
    const appointmentsCollection = database.collection("appointments");
    const usersCollection = database.collection("users");
    const doctorsCollection = database.collection("doctors");
    // POST API of single appointment
    app.post("/appointments", async (req, res) => {
      const newUser = req.body;
      console.log(newUser);
      const result = await appointmentsCollection.insertOne(req.body);
      res.json(result);
    });
    // POST API of single user
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const result = await usersCollection.insertOne(newUser);
      res.json(result);
    });
    // GET API of all appointments
    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req.query.email;
      const date = new Date(req.query.date).toLocaleDateString();
      const query = { pEmail: email, date: date };
      const cursor = appointmentsCollection.find(query);
      const result = await cursor.toArray();
      res.json(result);
    });
    // GET API of admins
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });

    app.get("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await appointmentsCollection.findOne(query);
      res.json(result);
    });
    // UPDATE API
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });
    // UPDATE API for add admin
    app.put("/users/admin", verifyToken, async (req, res) => {
      // console.log(req.decodedEmail);
      if (req.decodedEmail) {
        const query = await usersCollection.findOne({
          email: req.decodedEmail,
        });
        if (query.role === "admin") {
          const user = req.body;
          const filter = { email: user.email };
          const updateDoc = {
            $set: {
              role: "admin",
            },
          };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        } else {
          res
            .status(403)
            .json({ message: "you have no access to make admin!" });
        }
      }
    });
    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    });

    app.get("/doctors", async (req, res) => {
      const result = doctorsCollection.find({});
      const doctors = await result.toArray();
      res.json(doctors);
    });

    app.post("/doctors", async (req, res) => {
      const name = req.body.name;
      const email = req.body.email;
      const pic = req.files.image;
      const picData = pic.data;
      const encodedPic = picData.toString("base64");
      const imageBuffer = Buffer.from(encodedPic, "base64");
      const doctor = {
        name,
        email,
        image: imageBuffer,
      };
      const result = await doctorsCollection.insertOne(doctor);
      res.json(result);
    });

    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment: payment,
        },
      };
      const result = await appointmentsCollection.updateOne(filter, updateDoc);
      res.json(result);
    });
  } finally {
    //   await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("welcome to doctor portal server!!!");
});
app.listen(port, () => {
  console.log(`listening to http://localhost:${port}`);
});
