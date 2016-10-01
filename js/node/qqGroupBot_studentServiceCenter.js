var dbClient = require("mongodb").MongoClient;

var dbContext;

var targetRemoteSession = null;

dbClient.connect("mongodb://127.0.0.1:27017/studentServiceCenter",function(err,db) {
    if(err) {
        throw err
    }
    dbContext = db;
});

module.exports.startPullMessageQueue = function(rs) {
    if(!rs || targetRemoteSession) return;
    targetRemoteSession = rs;
    console.log("[*] Starting studentServiceCenter message queue pulling timer");
    setInterval(pullMessageQueue,10000);
};

function pullMessageQueue() {
    console.log("[SSC] [PULL_MESSAGE_QUEUE] Pulling...");
    dbContext.collection("messageQueue").find({}).toArray(function(err,result) {
        if(err || result.length <= 0) return;
        dbContext.collection("messageQueue").remove({});
        console.log("[SSC] [PULL_MESSAGE_QUEUE] Length: "+result.length);
        for(var id in result) {
            var msg = result[id];
            if(typeof(msg.targetQQGroupId) != "number"
                || typeof(msg.content) != "string"
            ) {
                console.log("[SSC] [PULL_MESSAGE_QUEUE] Illegal types: "+typeof(msg.targetQQGroupId) + " and " + typeof(msg.content));
                continue;
            }
            targetRemoteSession.sendGroupMessage(msg.targetQQGroupId,msg.content);
        }
    });
}