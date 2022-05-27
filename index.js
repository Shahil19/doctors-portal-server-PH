const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8vkgo.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


// ---------------------------- JWT (middle ware function)
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization

    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized User" })
    }
    const token = authHeader.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            res.status(403).send({ message: "Forbidden Access" })
        }

        req.decoded = decoded
        next()
    });

}
// ---------------------------- JWT


async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db("doctors_portal").collection("service")
        const bookingCollection = client.db("doctors_portal").collection("booking")
        const userCollection = client.db("doctors_portal").collection("user")

        // GET method
        // get all services
        // app.get('/service', async (req, res) => {
        //     const query = req.query
        //     const cursor = serviceCollection.find(query)
        //     const result = await cursor.toArray()
        //     res.send(result)
        // })

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        // get available slots by removing booked slots
        /*   app.get("/available", async (req, res) => {
              const date = req.query.date || "May 24, 2022"
  
              // step 1: get all services 
              const services = await serviceCollection.find().toArray()
  
              // step 2: get the bookings of that day(date)
              const query = { date: date }
              const bookings = await bookingCollection.find(query).toArray()
  
              // step 3: for each service, find bookings for that service
              services.forEach(service => {
                  const serviceBookings = bookings.filter(b => b.treatment === service.name)
                  // const booked = serviceBookings.map(s => s.slot)
                  // service.booked = booked
                  service.booked = serviceBookings.map(s => s.slot)
              })
              res.send(services)
          })
           */

        // Get All users
        app.get("/users", verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray()
            // const decodedEmail = req.decoded?.email
            // if (decodedEmail === patientEmail) {
            //     const query = { patientEmail: patientEmail }
            //     const bookings = await bookingCollection.find(query).toArray()
            //     return res.send(bookings)
            // } else {
            //     return res.status(403).send({ message: "Forbidden Access" })
            // }
            res.send(users)
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // step 1:  get all services
            const services = await serviceCollection.find().toArray();

            // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each service
            services.forEach(service => {
                // step 4: find bookings for that service. output: [{}, {}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step 5: select slots for the service Bookings: ['', '', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                //step 7: set available to slots to make it easier 
                service.slots = available;
            });
            res.send(services);
        })

        app.get("/booking", verifyJWT, async (req, res) => {
            const patientEmail = req.query.patientEmail

            // console.log(req.decoded);
            const decodedEmail = req.decoded?.email

            if (decodedEmail === patientEmail) {
                const query = { patientEmail: patientEmail }
                const bookings = await bookingCollection.find(query).toArray()
                return res.send(bookings)
            } else {
                return res.status(403).send({ message: "Forbidden Access" })
            }

        })

        app.get("/admin/:email", async (req, res) => {
            const email = req.params.email
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === "Admin"
            res.send({ admin: isAdmin })
        })

        // --------------for admin role

        app.put("/user/admin/:email", verifyJWT, async (req, res) => {
            const email = req.params.email

            //------------------------ only admin can make another admin
            const requester = req.decoded.email
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === "Admin") {
                const filter = { email: email }
                const updateDoc = {
                    $set: {
                        role: "Admin"
                    },
                };
                const result = await userCollection.updateOne(filter, updateDoc)
                return res.send(result)
            } else {
                return res.status(403).send({ message: "Forbidden" })
            }

        })

        // ------------------ update / insert users
        app.put("/user/:email", async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    plot: user
                },
            };
            const result = await userCollection.updateOne(filter, updateDoc, options)

            // -------------------JWT
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET);
            // -------------------JWT
            res.send({ result, token })
        })
        // -----------------------

        // POST method
        // Booking
        app.post('/booking', async (req, res) => {
            const booking = req.body

            // find an appointment if it was booked before
            const query = { slot: booking.slot }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ acknowledged: false, result: `You already have an ${booking.treatment} appointment in ${booking.date} at ${booking.slot}` })
            }
            // -------------

            const result = await bookingCollection.insertOne(booking)
            res.send(result)
        })


        console.log("connected");
    } finally {

    }

}

run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World!')

})

app.get("/heroku", (req, res) => {
    res.send("heroku available")
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})