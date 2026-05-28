'use strict';

let _io = null;

const socketManager = {
    init(io) {
        _io = io;
    },

    emitToUser(userId, event, data) {
        if (_io) _io.to(`user:${userId}`).emit(event, data);
    },

    emit(event, data) {
        if (_io) _io.emit(event, data);
    },

    getIo() {
        return _io;
    },
};

module.exports = socketManager;
