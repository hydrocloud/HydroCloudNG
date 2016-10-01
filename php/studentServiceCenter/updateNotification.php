<?php
    require "vendor/autoload.php";

    session_start();

    $db = (new MongoDB\Client()) -> studentServiceCenter;
    if(!$db) exit("数据库连接失败。");

    $reqData = json_decode(file_get_contents("php://input"));
    if(!$reqData
        || !$reqData -> targetClassId
        || !$reqData -> message
        || !is_int($reqData -> targetClassId)
        || !is_string($reqData -> message)
    ) {
        exit("请求格式错误。");
    }

    $targetClass = $db -> classes -> findOne(array(
        "classId" => $reqData -> targetClassId
    ));

    if(!$targetClass) {
        exit("通知发送失败：未找到目标班级。");
    }

    $db -> messageQueue -> insertOne(array(
        "targetQQGroupId" => $targetClass["qqGroupId"],
        "content" => "【通知】" . $reqData -> message
    ));

    echo "通知已加入目标队列。";
?>
