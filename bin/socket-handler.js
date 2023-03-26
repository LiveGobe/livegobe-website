/**
 * 
 * @param {import("socket.io").Server} io 
 */
module.exports = function(io) {
    io.use((socket, next) => {
        if (!socket.request.user) return next(new Error("No User"))
        next();
    });

    io.on("connection", socket => {
        socket.emit("message", `User ${socket.request.user.name} connected`);
    });
}