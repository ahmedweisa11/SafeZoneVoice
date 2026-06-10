const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const ADMIN_PASSWORD = "RMITK";

const users = {};
const admins = new Set();

io.on("connection", (socket) => {

  // JOIN ROOM
  socket.on("join-room", ({ nickname, password }) => {

    const roomId = "main-room";
    socket.join(roomId);

    const isAdmin = password === ADMIN_PASSWORD;

    users[socket.id] = {
      nickname,
      roomId,
      muted: !isAdmin,
      isAdmin: isAdmin
    };

    if (isAdmin) admins.add(socket.id);

    socket.emit("room-data", {
      isAdmin: users[socket.id].isAdmin,
      users: getUsers(roomId)
    });

    io.to(roomId).emit("users-update", getUsers(roomId));
    socket.to(roomId).emit("user-joined", socket.id);
  });

  // USERS LIST
  function getUsers(roomId) {
    return Object.keys(users)
      .filter(id => users[id]?.roomId === roomId)
      .map(id => ({
        id,
        nickname: users[id].nickname,
        muted: users[id].muted,
        isAdmin: users[id].isAdmin
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

  // 🔇 MUTE (FIXED)
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

  // DISCONNECT CLEANUP
  socket.on("disconnect", () => {
    const user = users[socket.id];

    if (user) {
      const roomId = user.roomId;

      delete users[socket.id];
      admins.delete(socket.id);

      io.to(roomId).emit("users-update", getUsers(roomId));
    }
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
