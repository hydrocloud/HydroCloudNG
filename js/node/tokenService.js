var express = require("express");
var crypto = require("crypto");
var fs = require("fs");
var process = require("process");

try {
    var cfgData = JSON.parse(fs.readFileSync("tokenService_config.json"));
} catch(e) {
    console.log("Unable to load configuration");
    process.exit(1);
}

var app = express();
var hashSourcePrefix = "__TEST_PREFIX";

app.get("/getToken/:src",function(req,resp) {
    resp.send(crypto.createHash("sha256").update(hashSourcePrefix + req.params.src).digest("hex"));
});

var server = app.listen(6093,function() {
    console.log("Listening on "+server.address().address+":"+server.address().port);
});