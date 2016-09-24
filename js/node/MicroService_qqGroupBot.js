var crypto = require("crypto");
var process = require("process");
var http = require("http");
var fs = require("fs");
var querystring = require("querystring");
var apihub = require("./APIHubConnector.js");
var kwdetector = require("./qqGroupBot_kwDetector.js");

var turingBotKey = "";

var actionQueue = [];

var recentMessages = [];

function queueAction(actionName, actionArgs) {
    actionQueue.push({
        name: actionName,
        args: actionArgs
    });
}

function sendGroupMessage(groupId, content) {
    queueAction("sendGroupMessage",{
        "groupId": groupId,
        "msg": content
    });
}
module.exports.sendGroupMessage = sendGroupMessage;

function shutupGroupMember(groupId, userId, duration) {
    queueAction("shutupGroupMember",{
        "groupId": groupId,
        "userId": userId,
        "duration": duration
    });
}
module.exports.shutupGroupMember = shutupGroupMember;

function setMemberCard(groupId, userId, content) {
    queueAction("setMemberCard",{
        "groupId": groupId,
        "userId": userId,
        "content": content
    });
}
module.exports.setMemberCard = setMemberCard;

function flushActionQueue() {
    var resp = JSON.stringify(actionQueue);
    actionQueue = [];
    return resp;
}

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

var cfg = JSON.parse(fs.readFileSync("MicroService_qqGroupBot_config.json"));

turingBotKey = cfg.turingBotKey;
if(!turingBotKey || typeof(turingBotKey) != "string") {
    console.log("Item not found or invalid: turingBotKey");
    process.exit(1);
}

function onFlushActionQueue(callback) {
    callback(flushActionQueue());
}

var specialPatts = [
    {
        pattern: new RegExp("禁言"),
        handler: kwdetector.doShutupGroupMemberOnKw
    }
];

function onMsgInput(reqRawData) {
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
            sendGroupMessage(groupId, "Invalid message value type");
            return;
        }

        var currentUserId = groupId.toString() + "#" + userId.toString();

        recentMessages.push({
            user: currentUserId,
            msg: msg
        });

        var equalCount = 0;

        if(recentMessages.length >= 1) {
            var prevMsg = null;

            for(var i = recentMessages.length - 1; i >= 0; i--) {
                if(recentMessages[i].user != currentUserId) continue;
                if(prevMsg === null || recentMessages[i].msg === prevMsg) equalCount++;
                else break;
                prevMsg = recentMessages[i].msg;
            }
        }

        if(equalCount >= 5) {
            shutupGroupMember(groupId,userId,180);
            sendGroupMessage(groupId,"[CQ:at,qq="+userId.toString()+"] 发送相同内容消息过多，已禁言。");
            return;
        } else if(equalCount >= 3) {
            sendGroupMessage(groupId,"[CQ:at,qq="+userId.toString()+"] 请勿刷屏。");
            return;
        }

        for(id in specialPatts) {
            var patt = specialPatts[id];
            try {
                if(patt.pattern.test(msg)) patt.handler(groupId,userId,msg);
            } catch(e) {
                console.log(e);
            }
        }

        var startsWithChat_patt = new RegExp("^\/chat");

        if(startsWithChat_patt.test(msg)) turingBotRequest(crypto.createHash("sha256").update(userId.toString() + groupId.toString()).digest("hex").substring(0,8),msg,function(rv) {
            sendGroupMessage(groupId, rv);
        });
}

apihub.init([
    "qqGroupMsgInput",
    "qqGroupFlushActionQueue"
],function(reqData,callback) {
    console.log("API request: "+reqData.apiName);
    switch(reqData.apiName) {
        case "qqGroupMsgInput":
            onMsgInput(reqData.requestData);
            callback("OK");
            break;
        case "qqGroupFlushActionQueue":
            onFlushActionQueue(callback);
            break;
    }
})
