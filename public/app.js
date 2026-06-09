const socket = io();

let localStream;
let peerConnections = {};
let roomId;
let myId;
let myIsAdmin = false;

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

socket.on("connect", () => {
  myId = socket.id;
});

async function joinRoom() {
  roomId = document.getElementById("room").value;
  const nickname = document.getElementById("nickname").value;
  const password = document.getElementById("password").value || "";

  if (!roomId || !nickname) return alert("Fill all fields");

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  socket.emit("join-room", {
    roomId,
    nickname,
    password
  });

  document.getElementById("status").innerText =
    "Joined as " + nickname;
}

// ROOM DATA
socket.on("room-data", (data) => {

  myIsAdmin = data.isAdmin;

  document.getElementById("adminPanel").style.display =
    myIsAdmin ? "block" : "none";

  renderUsers(data.users);
});

socket.on("users-update", renderUsers);

// USERS
function renderUsers(users) {
  const list = document.getElementById("usersList");
  list.innerHTML = "";

  users.forEach(u => {
    const div = document.createElement("div");

    div.innerHTML = `
      <b>${u.nickname}</b>
      ${u.isAdmin ? "👑" : ""}
      ${u.muted ? "🔇" : "🔊"}
      <button onclick="muteUser('${u.id}')">Mute</button>
      <button onclick="kickUser('${u.id}')">Kick</button>
    `;

    list.appendChild(div);
  });
}

// ADMIN ACTIONS
function kickUser(id) {
  socket.emit("kick-user", { targetId: id });
}

function muteUser(id) {
  socket.emit("toggle-mute", { targetId: id });
}

// KICK EVENT
socket.on("kicked", () => {
  alert("You were kicked");
  location.reload();
});

// MUTE FIX
socket.on("mute-update", ({ targetId, muted }) => {
  const pc = peerConnections[targetId];

  if (pc) {
    pc.getReceivers().forEach(receiver => {
      if (receiver.track.kind === "audio") {
        receiver.track.enabled = !muted;
      }
    });
  }
});

// WEBRTC
socket.on("user-joined", id => createPeer(id, true));

function createPeer(id, initiator) {
  const pc = new RTCPeerConnection(config);

  peerConnections[id] = pc;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = e => {
    document.getElementById("remoteAudio").srcObject = e.streams[0];
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("ice-candidate", { candidate: e.candidate, to: id });
    }
  };

  if (initiator) {
    pc.createOffer().then(o => {
      pc.setLocalDescription(o);
      socket.emit("offer", { offer: o, to: id });
    });
  }

  return pc;
}

socket.on("offer", async ({ offer, from }) => {
  const pc = createPeer(from, false);

  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", { answer, to: from });
});

socket.on("answer", async ({ answer, from }) => {
  const pc = peerConnections[from];
  if (pc) await pc.setRemoteDescription(answer);
});

socket.on("ice-candidate", async ({ candidate, from }) => {
  const pc = peerConnections[from];
  if (pc) await pc.addIceCandidate(candidate);
});
