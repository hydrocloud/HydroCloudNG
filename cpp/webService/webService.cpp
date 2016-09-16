#include <string>
#include <iostream>
#include <fstream>
#include <sstream>
#include <map>

#include <boost/algorithm/string.hpp>

#include <curl/curl.h>
#include <curl/easy.h>

#include "crow_all.h"

using namespace std;

map<string,string> apiBackendUrls;

size_t saveReplyDataToStringStream(void *data, size_t size, size_t blocks, void *targetPtr) {
    stringstream& ss = *(stringstream*)targetPtr;
    ss.write((char*)data,size*blocks);
    return size*blocks;
}

crow::json::wvalue apiBackendRequest(const string& apiName, const crow::json::rvalue& reqData) {
    crow::json::wvalue ret;
    ret["reply"] = "";
    ret["code"] = 0;

    CURL *curl = curl_easy_init();

    auto targetUrlItr = apiBackendUrls.find(apiName);
    if(targetUrlItr == apiBackendUrls.end()) {
        ret["code"] = 1;
        return ret;
    }

    string targetUrl = targetUrlItr -> second;
    if(!reqData.has("data")) {
        ret["code"] = 2;
        return ret;
    }
    crow::json::rvalue rdt = reqData["data"];

    if(rdt.t() != crow::json::type::String) {
        ret["code"] = 3;
        return ret;
    }

    string requestData = rdt.s();

    curl_easy_setopt(curl,CURLOPT_URL,targetUrl.c_str());
    curl_easy_setopt(curl,CURLOPT_POST,1);
    curl_easy_setopt(curl,CURLOPT_POSTFIELDS,requestData.c_str());

    stringstream ss;

    curl_easy_setopt(curl,CURLOPT_WRITEFUNCTION,saveReplyDataToStringStream);
    curl_easy_setopt(curl,CURLOPT_WRITEDATA,&ss);

    curl_easy_perform(curl);

    curl_easy_cleanup(curl);

    ret["reply"] = ss.str().c_str();

    return ret;
}

void loadBackendUrls(ifstream cfg) {
    if(!cfg.is_open()) {
        throw runtime_error("Bad file stream");
    }
    string cfgData;
    string buf;

    while(!cfg.eof()) {
        getline(cfg,buf);
        cfgData += buf;
    }

    auto cfgJson = crow::json::load(cfgData);
    if(!cfgJson || cfgJson.t() != crow::json::type::Object) {
        throw runtime_error("Unable to parse config");
    }
    for(auto itr = cfgJson.begin();itr != cfgJson.end();itr++) {
        if(itr->t() != crow::json::type::String) {
            throw runtime_error("Bad data type");
        }
        apiBackendUrls[itr->key()] = itr->s();
    }
}

int main(int argc, char *argv[]) {
    curl_global_init(CURL_GLOBAL_ALL);

    if(argc<2) {
        cout<<"Missing config file path"<<endl;
        return 1;
    }

    loadBackendUrls(ifstream(argv[1]));

    crow::SimpleApp app;
    CROW_ROUTE(app,"/ping").methods("GET"_method)([]() {
        crow::response resp;
        resp.code = 200;
        resp.set_header("Server","HydroCloud Web Service");
        resp.set_header("Content-Type","text/html");
        resp.body = "Pong";
        return resp;
    });
    CROW_ROUTE(app,"/api/<string>").methods("GET"_method,"POST"_method)([](const crow::request& req, const string& arg) {
        crow::response resp;
        crow::json::wvalue retJson;

        resp.code = 200;
        resp.set_header("Server","HydroCloud API Service");
        resp.set_header("Content-Type","application/json");

        retJson["data"] = "";
        retJson["err"] = 0;

        vector<string> reqUrlParts;
        boost::split(reqUrlParts,req.url,boost::is_any_of("/"));

        if(reqUrlParts.size() != 3) {
            retJson["err"] = 1;
            resp.body = crow::json::dump(retJson);
            return resp;
        }

        string apiName = reqUrlParts[2];
        crow::json::rvalue reqData = crow::json::load(req.body);
        if(!reqData) {
            retJson["err"] = 2;
            resp.body = crow::json::dump(retJson);
            return resp;
        }

        retJson["data"] = apiBackendRequest(apiName, reqData);
        
        resp.body = crow::json::dump(retJson);
        return resp;
    });
    app.port(2333).multithreaded().run();
    return 0;
}