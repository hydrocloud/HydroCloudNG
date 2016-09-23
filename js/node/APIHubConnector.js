var net = require("net");

const unixSocketPath = "/tmp/HydroCloud_apiHub.sock";

function doConnect(providedModules,callback) {
    var client = new net.Socket();

    client.connect(unixSocketPath,function() {});

    client.on("data",function(dt) {
        switch(dt.toString().trim()) {
            case "HELLO":
                client.write("INIT");
                break;
            case "DATA REQUEST":
                client.write(JSON.stringify(providedModules));
                break;
            default:
                callback(JSON.parse(dt.toString()),function(text) {
                    client.write(text);
                });
                break;
        }
    });
}

module.exports.init = function(providedModules,callback) {
    doConnect(providedModules,callback);
}