package main

import (
    "log"
    "net"
    "time"
    "io"
    "os"
    "strings"
    "encoding/json"
    "io/ioutil"
    "net/http"
)

type HandlerRequest struct {
    Request string
    Response chan string
}

var handlerMappings map[string]chan HandlerRequest

func handleConn(conn net.Conn) {
    defer func() {
        if err := recover(); err!=nil {
            log.Println("Recovering from panic: ",err)
        }
    } ()

    const recvCommandBufferLength = 64
    const recvDataBufferLength = 8192

    conn.Write([]byte("HELLO\n"))

    cmdBuf := make([]byte,recvCommandBufferLength)
    length,err := conn.Read(cmdBuf)

    if length >= recvCommandBufferLength {
        conn.Write([]byte("Error: Command string too long\n"))
        conn.Close()
        return
    }

    if(strings.TrimSpace(string(cmdBuf[:length])) != "INIT") {
        conn.Write([]byte("BAD REQUEST\n"))
        conn.Close()
        return
    }

    conn.Write([]byte("DATA REQUEST\n"))

    data := make([]byte,0)

    dataBuf := make([]byte,recvDataBufferLength)

    for {
        length,err = conn.Read(dataBuf)
        if err != nil && err != io.EOF {
            conn.Write([]byte("Error: Unable to read data\n"))
            conn.Close()
            return
        }
        data = append(data,dataBuf[:length]...)
        if length != recvDataBufferLength {
            break
        }
    }

    dataParsed := make([]string,0)

    err = json.Unmarshal(data,&dataParsed)

    if err!=nil {
        conn.Write([]byte("Error: Unable to parse data"))
        conn.Close()
        return
    }

    dataChannel := make(chan HandlerRequest)

    for _,reqApiName := range dataParsed {
        _,ok := handlerMappings[reqApiName]
        if ok {
            log.Println("API:",reqApiName,"already exists. Overriding.")
        }
        log.Println("Registering API:",reqApiName)
        handlerMappings[reqApiName] = dataChannel
    }

    for {
        reqBody := <-dataChannel

        if len(reqBody.Request) < 1 {
            reqBody.Response <- "Bad request body"
            continue
        }

        conn.Write([]byte(reqBody.Request))

        resp := make([]byte,0)
        respBuf := make([]byte,recvDataBufferLength)

        for {
            length,err = conn.Read(respBuf)
            if err != nil && err != io.EOF {
                conn.Write([]byte("Error: Unable to read data\n"))
                break
            }
            resp = append(resp,respBuf[:length]...)
            if length != recvDataBufferLength {
                break
            }
        }

        reqBody.Response <- string(resp)
    }
    
    conn.Close()
}

func startHttpListener() {
    http.HandleFunc("/api/",func(w http.ResponseWriter, r *http.Request) {
        parts := strings.SplitN(r.URL.Path,"/",3)
        if len(parts) != 3 {
            w.Write([]byte("Bad request"))
            return
        }

        targetHandler,ok := handlerMappings[parts[2]]
        if !ok {
            w.Write([]byte("Target API handler not found"))
            return
        }

        defer r.Body.Close()
        bodyData,err := ioutil.ReadAll(r.Body)
        if err != nil {
            w.Write([]byte("Unable to read request body"))
            return
        }

        apiResponse := make(chan string)

        reqData := make(map[string]string)

        reqData["apiName"] = parts[2]
        reqData["remoteAddr"] = strings.Split(r.RemoteAddr,":")[0]
        reqData["requestData"] = string(bodyData)

        reqJson,err := json.Marshal(reqData)
        if err != nil {
            w.Write([]byte("Unable to encode request data"))
            return
        }

        var hReq HandlerRequest

        hReq.Request = string(reqJson)
        hReq.Response = apiResponse

        targetHandler <- hReq

        w.Write([]byte(<-apiResponse))
    });

    http.ListenAndServe(":6066",nil)
}

func main() {
    unixSocketPath := "/tmp/HydroCloud_apiHub.sock"
    os.Remove(unixSocketPath)

    listenAddr,err := net.ResolveUnixAddr("unix",unixSocketPath)
    if err!=nil {
        log.Fatal(err)
    }

    listener,err := net.ListenUnix("unix",listenAddr)

    if err!=nil {
        log.Fatal(err)
    }

    log.Println("Listening on UNIX socket")

    handlerMappings = make(map[string]chan HandlerRequest)

    go startHttpListener()

    for {
        newConn,err := listener.Accept()
        if err!=nil {
            log.Println("Warning: Unable to accept the new connection")
            time.Sleep(1*time.Second)
            continue
        }
        go handleConn(newConn)
    }
}