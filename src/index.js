import express from "express"
import cors from "cors"
import joi from "joi"
import { MongoClient, ObjectId } from "mongodb"
import dotenv from "dotenv"
import dayjs from "dayjs"

const app = express()
dotenv.config()
app.use(cors())
app.use(express.json())

const mongoClient = new MongoClient(process.env.MONGO_URI)
let db

mongoClient.connect().then(() => {
  db = mongoClient.db("test")
})

const userSchema = joi.object({
  name: joi.string().required(),
})

const messagesSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().required().valid("message", "private_message"),
})

//REMOVER USUARIOS INATIVOS
async function removeInactiveUsers(){
let dateNow = Date.now()
const users = await db.collection("users").find({}).toArray()
const inactiveUsers = users.filter( e => (dateNow - e.lastStatus) > 10000 )
if(inactiveUsers){
  let today = dayjs().locale("pt-br").format("HH:mm:ss")
  inactiveUsers.forEach( async (e) => {
    await db.collection("users").deleteOne({_id: ObjectId(e._id)})
    await db.collection("messages").insertOne({
      from: e.name,
      to: 'Todos',
      text: 'sai da sala...',
      type: 'status',
      time: today
    })
  });
}
}

setInterval(removeInactiveUsers, 15000)

// PARTICIPANTS
app.post("/participants", async (req, res) => {
  const user = req.body
  const validation = userSchema.validate(user, { abortEarly: false })
  if (validation.error) {
    const error = validation.error.details.map((detail) => detail.message)
    res.status(422).send(error)
    return
  }

  try {
    const userCheck = await db.collection("users").findOne({ name: user.name })
    if (userCheck) {
      res.sendStatus(409)
      return
    }
    await db.collection("users").insertOne({
      name: user.name,
      lastStatus: Date.now(),
    })
    return res.sendStatus(201)
  } catch (error) {
    console.log(error)
  }
})

app.get("/participants", async (req, res) => {
  try {
    const users = await db.collection("users").find({}).toArray()
    res.send(users)
  } catch (error) {
    console.log(error)
  }
})

// MESSAGES
app.post("/messages", async (req, res) => {
  const message = req.body
  const from = req.headers.user
  const validation = messagesSchema.validate(message, { abortEarly: false })
  if (validation.error) {
    const error = validation.error.details.map((detail) => detail.message)
    res.status(422).send(error)
    return
  }
  if (message.to !== "Todos") {
    const checkOnlineUser = await db
      .collection("users")
      .find({ name: message.to })
    if (!checkOnlineUser) {
      res.status(422).send("Participante não está na lista")
      return
    }
  }
  if(!from){
   res.status(400)
   return
  }

  try {
    let today = dayjs().locale("pt-br").format("HH:mm:ss")
    await db.collection("messages").insertOne({
      from: from,
      to: message.to,
      text: message.text,
      type: message.type,
      time: today
    })
    return res.sendStatus(201)
  } catch (error) {
    console.log(error)
  }
})

app.get("/messages", async (req, res) => {
  const user = req.headers.user
  const limit = parseInt(req.query.limit)
  try {
    const users = await db.collection("messages").find({}).toArray()
    const validMessages = users.filter((e) => e.from === user || e.to === user || e.to === "Todos" && e.type === "message")
    if(limit){
      const limitMessages = validMessages.filter((e, idx) => idx < limit)
      res.send(limitMessages)
      return
    }
    res.send(validMessages)
  } catch (error) {
    console.log(error)
  }
})

// STATUS
app.post("/status", async (req, res) => {
  const user = req.headers.user
  try{
    const activeUser = await db.collection("users").findOne({name: user})
    if(!activeUser){
      return res.sendStatus(404)
    }
    await db.collection("users").updateOne({_id: ObjectId(activeUser._id)}, {$set:{lastStatus: Date.now()}})
    res.sendStatus(200)
  }catch(error){
    console.log(error)
  }
})


app.listen(5000, () => console.log("Server running in port: 5000"))
