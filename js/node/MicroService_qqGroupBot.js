var express = require("express");
var crypto = require("crypto");
var process = require("process");
var http = require("http");
var fs = require("fs");
var iconv = require("iconv-lite");
var querystring = require("querystring");

var turingBotKey = "";

function turingBotRequest(userHash, msg, callback) {
    var reqData = {
        key: turingBotKey,
        info: msg,
        userid: userHash
    };
    var reqAsString = querystring.stringify(reqData);

    var newRequest = http.request({
        method: "POST",
        host: "www.tuling123.com",
        port: 80,
        path: "/openapi/api",
        headers: {
            "Content-Type":"application/x-www-form-urlencoded",
            "Content-Length":reqAsString.length
        }
    },function(resp) {
        var data = "";
        resp.on("data",function(dt) {
            data += dt;
        });
        resp.on("end",function() {
            try {
                var retData = JSON.parse(data);
                var retText = retData.text;
            } catch(e) {
                callback("聊天回复接口请求失败。");
                return;
            }
            if(!retText) {
                callback("未获取到回复文本。");
                return;
            }
            callback(retText);
        });
    });
    newRequest.write(reqAsString);
    newRequest.end();
}

var app = express();

var cfg = JSON.parse(fs.readFileSync("MicroService_qqGroupBot_config.json"));

turingBotKey = cfg.turingBotKey;
if(!turingBotKey || typeof(turingBotKey) != "string") {
    console.log("Item not found or invalid: turingBotKey");
    process.exit(1);
}

app.post("/msgInput",function(req,resp) {
    var reqRawData = "";

    req.on("data",function(dt) {
        reqRawData += dt;
    });
    req.on("end",function() {
        try {
            var reqData = JSON.parse(reqRawData,"utf-8");
        } catch(e) {
            resp.send("Unable to parse request data");
            return;
        }

        try {
            if(typeof(reqData.userId) != "number") var userId = parseInt(reqData.userId);
            else var userId = reqData.userId;

            if(typeof(reqData.groupId) != "number") var groupId = parseInt(reqData.groupId);
            else var groupId = reqData.groupId;

            var msg = reqData.msg;
        } catch(e) {
            resp.send("Invalid values");
            return;
        }

        if(!userId || !groupId || !msg) {
            resp.send("Missing values");
            return;
        }

        if(typeof(msg) != "string") {
            resp.send("Invalid message value type");
            return;
        }

        turingBotRequest(crypto.createHash("sha256").update(userId.toString() + groupId.toString()).digest("hex").substring(0,8),msg,function(rv) {
            resp.send(rv);
        });
    });
});

var server = app.listen(6094,function() {
    console.log("Server listening on %s:%s",server.address().address,server.address().port);
});