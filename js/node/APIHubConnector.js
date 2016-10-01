var net = require("net");

const unixSocketPath = "/tmp/HydroCloud_apiHub.sock";

function doConnect(providedModules,callback) {
    var client = new net.Socket();
    var isRecv = false;
    var fullData = "";
    var totalLength = 0;
    var targetSize = 0;

    client.connect(unixSocketPath,function() {});

    client.on("end",function() {
        throw "APIHub connection unexpectedly terminated.";
    });

    client.on("data",function(dt) {
        switch(dt.toString().trim()) {
            case "HELLO":
                console.log("[HELLO]");
                client.write("INIT");
                break;
            case "DATA REQUEST":
                console.log("[DTRQ]");
                client.write(JSON.stringify(providedModules));
                break;
            default:
                if(!isRecv) {
                    targetSize = parseInt(dt.toString().trim());
                    isRecv = true;
                    console.log("[LENGTH] "+targetSize);
                    client.write("OK");
                } else {
                    console.log("[DATA] Length: "+dt.length+"/"+targetSize);
                    totalLength += dt.length;
                    fullData += dt.toString();
                    if(totalLength >= targetSize) {
                        console.log("[END]");
                        isRecv = false;
                        try {
                            var targetData = JSON.parse(fullData);
                        } catch(e) {
                            client.write("FAIL");
                            fullData = "";
                            totalLength = 0;
                            targetSize = 0;
                            return;
                        }
                        fullData = "";
                        targetSize = 0;
                        callback(targetData,function(text) {
                            console.log("[API SEND] Length: "+text.length.toString());
                            client.write(text);
                        });
                    }
                }
                break;
        }
    });
}

module.exports.init = function(providedModules,callback) {
    doConnect(providedModules,callback);
}