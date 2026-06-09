const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const ADMIN_PASSWORD = "Real Madrid Is the King";

const users = {};
const admins = new Set();

io.on("connection", (socket) => {

  socket.on("join-room", ({ roomId, nickname, password }) => {

    socket.join(roomId);

    const isAdmin = password === ADMIN_PASSWORD;

    users[socket.id] = {
      nickname,
      roomId,
      muted: false
    };

    if (isAdmin) {
      admins.add(socket.id);
    }

    socket.emit("room-data", {
      isAdmin,
      users: getUsers(roomId)
    });

    io.to(roomId).emit("users-update", getUsers(roomId));
    socket.to(roomId).emit("user-joined", socket.id);
  });

  function getUsers(roomId) {
    return Object.keys(users)
      .filter(id => users[id]?.roomId === roomId)
      .map(id => ({
        id,
        nickname: users[id].nickname,
        muted: users[id].muted,
        isAdmin: admins.has(id)
      }));
  }

  // WEBRTC
  socket.on("offer", d =>
    io.to(d.to).emit("offer", { offer: d.offer, from: socket.id })
  );

  socket.on("answer", d =>
    io.to(d.to).emit("answer", { answer: d.answer, from: socket.id })
  );

  socket.on("ice-candidate", d =>
    io.to(d.to).emit("ice-candidate", { candidate: d.candidate, from: socket.id })
  );

  // 🚫 KICK
  socket.on("kick-user", ({ targetId }) => {
    if (admins.has(socket.id)) {
      io.to(targetId).emit("kicked");
      io.sockets.sockets.get(targetId)?.disconnect();
    }
  });

  // 🔇 MUTE FIX
  socket.on("toggle-mute", ({ targetId }) => {
    if (admins.has(socket.id)) {

      users[targetId].muted = !users[targetId].muted;

      io.to(users[targetId].roomId).emit("mute-update", {
        targetId,
        muted: users[targetId].muted
      });

      io.to(users[targetId].roomId).emit(
        "users-update",
        getUsers(users[targetId].roomId)
      );
    }
  });

  // CLEANUP
  socket.on("disconnect", () => {
    delete users[socket.id];
    admins.delete(socket.id);
  });

});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});
