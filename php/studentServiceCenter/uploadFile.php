<?php
    require "vendor/autoload.php";
    require 'qiniu/loader.php';
    require "config.php";

    session_start();

    $db = (new MongoDB\Client()) -> studentServiceCenter;
    if(!$db) exit("数据库连接失败。");

    $targetClassId = (int)$_POST["targetClassId"];
    $remoteToken = $_POST["token"];

    if(!$targetClassId || !$remoteToken) exit("参数错误。");

    if($_SESSION["studentServiceCenter_uploadFile_request_".(string)$remoteToken]) exit("重复请求。");
    $_SESSION["studentServiceCenter_uploadFile_request_".(string)$remoteToken] = true;

    if ($_FILES["file"]["error"] > 0) {
        exit("错误：" . $_FILES["file"]["error"]);
    }

    $parts = explode("/",$_FILES["file"]["name"]);
    if(count($parts)>1) exit("非法的文件名。");

    if($_FILES["file"]["size"] / 1024 > 65536) exit("文件过大。");

    $targetObjectPath = "studentServiceCenter/files/" . substr(md5((string)rand() . (string)rand() . (string)rand() . (string)rand()), 0, 8) . "/" . $_FILES["file"]["name"];

    $qnClient = Qiniu\Qiniu::create(array(
        "access_key" => getConfig()["qn_access_key"],
        "secret_key" => getConfig()["qn_secret_key"],
        "bucket" => "hydrocloud"
    ));

    $res = $qnClient -> uploadFile($_FILES["file"]["tmp_name"],$targetObjectPath);

    if(!$res->ok()) exit("上传失败。");

    echo "上传成功，文件地址：http://hydrocloud-qn.do-u-like.me/" . $targetObjectPath . "\n";

    $targetClass = $db -> classes -> findOne(array(
        "classId" => $targetClassId
    ));

    if(!$targetClass) {
        exit("通知发送失败：未找到目标班级。");
    }

    $db -> messageQueue -> insertOne(array(
        "targetQQGroupId" => $targetClass["qqGroupId"],
        "content" => "【文件】" . "http://hydrocloud-qn.do-u-like.me/" . $targetObjectPath
    ));

    echo "通知已加入目标队列。";
?>