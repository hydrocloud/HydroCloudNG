var crypto = require("crypto");
var process = require("process");
var http = require("http");
var fs = require("fs");
var querystring = require("querystring");
var randomstring = require("randomstring");
var dbClient = require("mongodb").MongoClient;

var apihub = require("../APIHubConnector.js");
var kwdetector = require("./qqGroupBot_kwDetector.js");
var studentServiceCenter = require("./qqGroupBot_studentServiceCenter.js");

var turingBotKey = "";

var dbContext = null;

function turingBotRequest(userHash, msg, callback, callbackArg) {
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
                callback("聊天回复接口请求失败。",callbackArg);
                return;
            }
            if(!retText) {
                callback("未获取到回复文本。",callbackArg);
                return;
            }
            callback(retText,callbackArg);
        });
    });
    newRequest.write(reqAsString);
    newRequest.end();
}

var cfg = JSON.parse(fs.readFileSync("MicroService_qqGroupBot_config.json"));

turingBotKey = cfg.turingBotKey;
if(!turingBotKey || typeof(turingBotKey) != "string") {
    console.log("Item not found or invalid: turingBotKey");
    process.exit(1);
}

function RemoteTarget() {
    this.actionQueue = [];

    this.recentMessages = [];

    this.queueAction = function(actionName, actionArgs) {
        this.actionQueue.push({
            name: actionName,
            args: actionArgs
        });
    };

    this.sendGroupMessage = function(groupId, content) {
        console.log("[SEND] ["+groupId.toString()+"] "+content);
        this.queueAction("sendGroupMessage",{
            "groupId": groupId,
            "msg": content
        });
    };

    this.shutupGroupMember = function(groupId, userId, duration) {
        this.queueAction("shutupGroupMember",{
            "groupId": groupId,
            "userId": userId,
            "duration": duration
        });
    };

    this.setMemberCard = function(groupId, userId, content) {
        this.queueAction("setMemberCard",{
            "groupId": groupId,
            "userId": userId,
            "content": content
        });
    };

    this.flushActionQueue = function() {
        var resp = JSON.stringify(this.actionQueue);
        this.actionQueue = [];
        return resp;
    };

    this.onFlushActionQueue = function(callback) {
        callback(this.flushActionQueue());
    };

    this.specialPatts = [
        {
            pattern: new RegExp("禁言"),
            handler: kwdetector.doShutupGroupMemberOnKw
        },
        {
            pattern: new RegExp("^\/google"),
            handler: kwdetector.doGoogleOnKw
        },
        {
            pattern: new RegExp("^\/baidu"),
            handler: kwdetector.doBaiduOnKw
        },
        {
            pattern: new RegExp("^\/whoami$"),
            handler: kwdetector.doWhoamiOnKw
        },
        {
            pattern: new RegExp("^\/ping"),
            handler: kwdetector.doPingOnKw
        },
        {
            pattern: new RegExp("^\/mtr"),
            handler: kwdetector.doMtrOnKw
        }
    ];

    this.onMsgInput = function(reqRawData) {
            try {
                var reqData = JSON.parse(reqRawData,"utf-8");
            } catch(e) {
                return;
            }

            try {
                if(typeof(reqData.userId) != "number") var userId = parseInt(reqData.userId);
                else var userId = reqData.userId;

                if(typeof(reqData.groupId) != "number") var groupId = parseInt(reqData.groupId);
                else var groupId = reqData.groupId;

                var msg = reqData.msg;
            } catch(e) {
                return;
            }

            if(!userId || !groupId || !msg) {
                return;
            }

            if(typeof(msg) != "string") {
                this.sendGroupMessage(groupId, "Invalid message value type");
                return;
            }

            console.log("[RECV] ["+groupId.toString()+"] "+msg);

            var currentUserId = groupId.toString() + "#" + userId.toString();

            this.recentMessages.push({
                user: currentUserId,
                msg: msg
            });

            var equalCount = 0;

            if(this.recentMessages.length >= 1) {
                var prevMsg = null;

                for(var i = this.recentMessages.length - 1; i >= 0; i--) {
                    if(this.recentMessages[i].user != currentUserId) continue;
                    if(prevMsg === null || this.recentMessages[i].msg === prevMsg) equalCount++;
                    else break;
                    prevMsg = this.recentMessages[i].msg;
                }
            }

            if(equalCount >= 5) {
                this.shutupGroupMember(groupId,userId,180);
                this.sendGroupMessage(groupId,"[CQ:at,qq="+userId.toString()+"] 发送相同内容消息过多，已禁言。");
                return;
            } else if(equalCount >= 3) {
                this.sendGroupMessage(groupId,"[CQ:at,qq="+userId.toString()+"] 请勿刷屏。");
                return;
            }

            for(id in this.specialPatts) {
                var patt = this.specialPatts[id];
                try {
                    if(patt.pattern.test(msg)) patt.handler(groupId,userId,msg,this);
                } catch(e) {
                    console.log(e);
                }
            }

            var startsWithChat_patt = new RegExp("^\/chat");

            if(startsWithChat_patt.test(msg)) turingBotRequest(crypto.createHash("sha256").update(userId.toString() + groupId.toString()).digest("hex").substring(0,8),msg,function(rv,targetClass) {
                targetClass.sendGroupMessage(groupId, rv);
            },this);
    };

    return this;
}

var tokenMappings = {};

function onMsgInput_withToken(reqRawData) {
    try {
        var reqData = JSON.parse(reqRawData,"utf-8");
    } catch(e) {
        return;
    }

    if(!reqData.token || typeof(reqData.token) != "string") return;

    target = tokenMappings[reqData.token];
    if(!target) return;

    target.onMsgInput(reqRawData);
}

function onFlushActionQueue_withToken(reqRawData, callback) {
    try {
        var reqData = JSON.parse(reqRawData,"utf-8");
    } catch(e) {
        callback("[]")
        return;
    }

    if(!reqData.token || typeof(reqData.token) != "string") {
        callback("[]");
        return;
    }

    target = tokenMappings[reqData.token];
    if(!target) {
        callback("[]");
        return;
    }

    target.onFlushActionQueue(callback);
}

function onProvideStudentServiceCenter_withToken(reqRawData) {
    try {
        var reqData = JSON.parse(reqRawData,"utf-8");
    } catch(e) {
        return;
    }

    if(!reqData.token || typeof(reqData.token) != "string") return;

    target = tokenMappings[reqData.token];
    if(!target) return;

    studentServiceCenter.startPullMessageQueue(target);
}

function generateToken() {
    var token = randomstring.generate(16);

    tokenMappings[token] = new RemoteTarget();

    dbContext.collection("tokens").insert({
        "token": token,
        "enabled": 1
    },function(err,result){});

    return token;
}

dbClient.connect("mongodb://127.0.0.1:27017/MicroService_qqGroupBot",function(err, db) {
    if(err) {
        throw "Error while connecting to database";
    }

    dbContext = db;

    dbContext.collection("tokens").find({"enabled":1}).toArray(function(err,result) {
        for(var key in result) {
            tokenMappings[result[key].token] = new RemoteTarget();
        }
        apihub.init([
            "qqGroupGetToken",
            "qqGroupMsgInput",
            "qqGroupFlushActionQueue",
            "qqGroupProvideStudentServiceCenter"
        ],function(reqData,callback) {
            console.log("API request: "+reqData.apiName);
            switch(reqData.apiName) {
                case "qqGroupGetToken":
                    callback(generateToken());
                    break;
                case "qqGroupMsgInput":
                    onMsgInput_withToken(reqData.requestData);
                    callback("OK");
                    break;
                case "qqGroupFlushActionQueue":
                    onFlushActionQueue_withToken(reqData.requestData,callback);
                    break;
                case "qqGroupProvideStudentServiceCenter":
                    onProvideStudentServiceCenter_withToken(reqData.requestData);
                    callback("OK");
                    break;
            }
        });
    });
});