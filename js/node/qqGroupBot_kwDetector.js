var request = require("request");
var spawn = require("child_process").spawn;

function splitBaiduResult(orig) {
    var parts = orig.split("data-tools='");
    if(parts.length < 2) return [];

    var results = [];

    for(var i=1;i<parts.length;i++) {
        var tStr = parts[i].split("}'>",2)[0] + "}";
        try {
            var tData = JSON.parse(tStr);
        } catch(e) {
            continue;
        }
        results.push(tData);
    }

    return results;
}

module.exports.doShutupGroupMemberOnKw = function(groupId, userId, msg, parentClass) {
    parentClass.shutupGroupMember(groupId, userId, 120);
    parentClass.sendGroupMessage(groupId, "好的，你已被禁言。");
}

module.exports.doPingOnKw = function(groupId, userId, msg, parentClass) {
    var parts = msg.split(" ");
    var matcher = new RegExp("^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})){3}$");
    if(parts.length != 2 || !matcher.test(parts[1])) {
        parentClass.sendGroupMessage(groupId,"请求参数不合法。")
        return;
    }
    var targetIpAddr = parts[1];
    var pingProcess = spawn("ping",["-c","4",targetIpAddr]);
    var output = "";
    pingProcess.stdout.on("data",function(dt) {
        output += dt;
    });
    pingProcess.on("exit",function() {
        parentClass.sendGroupMessage(groupId,output);
    });
}

module.exports.doMtrOnKw = function(groupId, userId, msg, parentClass) {
    var parts = msg.split(" ");
    var matcher = new RegExp("^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})){3}$");
    if(parts.length != 2 || !matcher.test(parts[1])) {
        parentClass.sendGroupMessage(groupId,"请求参数不合法。")
        return;
    }
    var targetIpAddr = parts[1];
    var mtrProcess = spawn("mtr",["--report","--aslookup","-c","4",targetIpAddr]);
    var output = "";
    mtrProcess.stdout.on("data",function(dt) {
        output += dt;
    });
    mtrProcess.on("exit",function() {
        parentClass.sendGroupMessage(groupId,output);
    });
}

module.exports.doBaiduOnKw = function(groupId, userId, msg, parentClass) {
    var parts = msg.split(" ");
    if(parts.length < 2) {
        parentClass.sendGroupMessage(groupId, "请求格式错误。");
        return;
    }

    var targetKeyword = "";
    for(var i=1;i<parts.length;i++) targetKeyword += parts[i].trim() + " ";
    targetKeyword = targetKeyword.trim();

    request.get("http://www.baidu.com/s?wd="+encodeURIComponent(targetKeyword),function(err,resp,body) {
        if(err) {
            parentClass.sendGroupMessage(groupId,"请求失败。");
        }
        if(resp.statusCode != 200) {
            parentClass.sendGroupMessage(groupId,"请求失败: "+resp.statusCode.toString());
            return;
        }

        try {
            var results = splitBaiduResult(body);
        } catch(e) {
            parentClass.sendGroupMessage(groupId,"数据解析失败: "+e);
            return;
        }

        var output = "";
        var totalCount = results.length, doneCount = 0;

        for(var i=0;i<results.length;i++) {
            (function() {
                var id = i;
                request.get({
                    "uri": results[i].url,
                    "followRedirect": false
                },function(err,resp,body) {
                    doneCount++;

                    if(err) return;
//                    console.log("Fetch URL done, count: "+doneCount + "/"+totalCount);
                    var targetUrl = "";
                    if(resp.statusCode != 302 && resp.statusCode != 301) {
                        if(resp.statusCode != 200) {
                            console.log("Bad status code: "+resp.statusCode);
                            return;
                        }
                        try {
                            targetUrl = body.split("URL='")[1].split("'\">")[0];
                            if(!targetUrl) throw "Unable to get URL";
                        } catch(e) {
                            console.log("Failed to parse response: "+e);
                            return;
                        }
                    } else {
                        targetUrl = resp.headers.location;
                    }
                    output += "["+(id+1).toString()+"] "+results[id].title+" | "+targetUrl+"\n";
                    if(doneCount == totalCount) parentClass.sendGroupMessage(groupId,output.trim());
                });
            })();
        }
    });
}

module.exports.doGoogleOnKw = function(groupId, userId, msg, parentClass) {
    var parts = msg.split(" ",2);
    if(parts.length != 2) {
        parentClass.sendGroupMessage(groupId, "请求格式错误。");
        return;
    }

    var targetKeyword = "";
    for(var i=1;i<parts.length;i++) targetKeyword += parts[i].trim() + " ";
    targetKeyword = targetKeyword.trim();

    request.get(
        "https://www.googleapis.com/customsearch/v1?key=AIzaSyAM1WP0-L7NWcTNUulc-ggI3e_7ovIWmq4&cx=006431901905483214390:i3yxhoqkzo0&num=3&alt=json&q="
            +encodeURIComponent(targetKeyword),
        function(err,resp,body) {
            if(err) {
                parentClass.sendGroupMessage(groupId,"请求失败。");
            }
            if(resp.statusCode != 200) {
                parentClass.sendGroupMessage(groupId,"请求失败: "+resp.statusCode.toString());
                return;
            }
            try {
                var result = JSON.parse(body);
                var items = result.items;
                if(!items || typeof(items) != "object") throw "Bad data type: "+typeof(items);
            } catch(e) {
                parentClass.sendGroupMessage(groupId,"数据解析失败: "+e);
                return;
            }

            var output = "";

            for(var i=0;i<items.length;i++) {
                output += "["+(i+1).toString()+"] "+items[i].title+" | "+items[i].link+"\n";
            }

            parentClass.sendGroupMessage(groupId,output.trim());
        }
    );
}

module.exports.doWhoamiOnKw = function(groupId, userId, msg, parentClass) {
    parentClass.sendGroupMessage(groupId,"[CQ:at,qq="+userId+"]\n群号: "+groupId+"\n用户 QQ: "+userId);
}