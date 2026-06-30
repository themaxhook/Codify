const mongoose = require("mongoose");
const RoomSchema = new mongoose.Schema({
    roomId : {
        type:String,
        required:true,
        unique:true
    },
    code : {
        type: String,
        default:''
    },
    language : {
        type:String,
        default:'javascript'
    },
    savedAt : {
        type:Date,
        default:Date.now(),
    }
});

module.exports = mongoose.model('Room', RoomSchema);