const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();

app.use(cors());

const upload = multer({ dest: "uploads/" });

app.post("/upload", upload.single("photo"), (req, res) => {

    const latitude = req.body.latitude;
    const longitude = req.body.longitude;

    console.log("Photo:", req.file);
    console.log("Location:", latitude, longitude);

    res.json({ message: "Report received" });
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});