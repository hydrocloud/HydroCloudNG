module.exports.doShutupGroupMemberOnKw = function(groupId, userId, msg) {
    module.parent.exports.shutupGroupMember(groupId, userId, 120);
    module.parent.exports.sendGroupMessage(groupId, "好的，你已被禁言。");
}