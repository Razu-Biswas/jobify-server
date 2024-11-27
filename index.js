require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());
// console.log(process.env.ACCESS_TOKEN_SECRET)
// user defined middlewares
const verifyToken = (req, res, next) => {
  // console.log(req.headers.authorization)
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "forbidden access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    console.log(err)
    if (err) {
      return res.status(401).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gvvjm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {



    const usersCollection = client.db("jobify").collection("users");
    const jobsCollection = client.db("jobify").collection("jobs");


    // verify admin middleware
    const verifyAuthorization = async (req, res, next) => {
      const email = req.decoded?.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAuthorized = user?.role === "superAdmin" || user?.role === "admin";
      if (!isAuthorized) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };


    // jwt related api
    app.post("/api/v1/jwt", (req, res) => {
      const email = req.body.email;
      // console.log(email)
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "24h" }
      );
      res.send({ token });
    });


    // api for inserting a new user in database
    app.post("/api/v1/user", async (req, res) => {
      const user = req.body;

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });


    // api for collect one specific user data
    app.get("/api/v1/users/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      console.log("email from params", req.params.email);
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await usersCollection.findOne(query);
      res.send(result);
    });


    // api for updating specific user
    app.patch("/api/v1/updateUser/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (!email === req.decoded?.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      const userInfo = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: userInfo.name,
          email: userInfo.email,
          image: userInfo.image,

        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });



    // api to get all user data
    app.get(
      "/api/v1/allUsers",
      verifyToken,
      verifyAuthorization,
      async (req, res) => {
        const result = await usersCollection.find().sort({ _id: -1 }).toArray();
        res.send(result);
      }
    );



    // api to update user status
    app.patch(
      "/api/v1/updateStatus/:id",
      verifyToken,
      verifyAuthorization,
      async (req, res) => {
        const data = req.body.status;
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: data,
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );



    // api to update user role
    app.patch(
      "/api/v1/updateRole/:id",
      verifyToken,
      verifyAuthorization,
      async (req, res) => {
        const data = req.body.role;
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: data,
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );



    // api to insert a job data
    app.post(
      "/api/v1/addJob",
      verifyToken,
      verifyAuthorization,
      async (req, res) => {
        const jobInfo = req.body;

        // console.log(jobInfo)
        const result = await jobsCollection.insertOne(jobInfo);
        res.send(result);
      }
    );



    // api to get all job data
    app.get(
      "/api/v1/allJobs",
      verifyToken,
      verifyAuthorization,
      async (req, res) => {
        const options = {
          sort: {
            _id: -1,
          },
          projection: {
            _id: 1,
            jobTitle: 1,
            postedTime: 1,
            status: 1,
            CompanyCover: 1,
          },
        };
        // const query = {}
        const result = await jobsCollection.find({}, options).toArray();
        res.send(result);
      }
    );

    // api to get draft to all published  job data
    app.get("/api/v1/publishedJobs", async (req, res) => {
      const query = { status: "published" };
      options = { projection: { blogContent: 0 } };
      const result = await jobsCollection
        .find(query, options)
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });



    // api to get latest published top jobs
    app.get('/api/v1/latestJobs', async (req, res) => {
      const query = { status: "published" };
      options = { projection: { jobContent: 0 } };
      const result = await jobsCollection
        .find(query, options)
        .limit(3)
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    })



    // api to update job status
    app.patch(
      "/api/v1/updateJobStatus/:id",
      verifyToken,
      verifyAuthorization,
      async (req, res) => {
        const data = req.body.status;
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: data,
          },
        };
        const result = await jobsCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );



    // api to delete a jobs
    app.delete(
      "/api/v1/deleteJob/:id",
      verifyToken,
      verifyAuthorization,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await jobsCollection.deleteOne(query);
        res.send(result);
      }
    );



    // api to get a job
    app.get("/api/v1/jobDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });





    // checking api for superAdmin
    app.get("/api/v1/superAdmin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (!email === req.decoded?.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      // console.log('SuperAdmin checking', user);

      let superAdmin = false;
      if (user?.role === "superAdmin") {
        superAdmin = user.role;
      }
      res.send(superAdmin);
    });





    // checking api for admin
    app.get("/api/v1/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (!email === req.decoded?.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);

      let admin = false;
      if (user?.role === "admin") {
        admin = user.role;
      }

      res.send(admin);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("JOBIFY SERVER IS RUNNING");
});

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
