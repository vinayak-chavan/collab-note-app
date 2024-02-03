import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';

const app = express();
app.use(cors());

dotenv.config();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.get('/', (req, res) => {
  res.send('Hello from the server!');
});

const socketID_to_Users_Map = {};
const roomID_to_Code_Map = {};

const getUsersinRoom = async (roomId, io) => {
  const socketList = await io.in(roomId).allSockets();
  const userslist = [];
  socketList.forEach(each => {
    (each in socketID_to_Users_Map) && userslist.push(socketID_to_Users_Map[each].username);
  });
  return userslist;
};

const updateUserslistAndCodeMap = async (io, socket, roomId) => {
  socket.in(roomId).emit("member left", { username: socketID_to_Users_Map[socket.id].username });
  delete socketID_to_Users_Map[socket.id];
  const userslist = await getUsersinRoom(roomId, io);
  socket.in(roomId).emit("updating client list", { userslist: userslist });
  userslist.length === 0 && delete roomID_to_Code_Map[roomId];
};

io.on('connection', socket => {
  console.log('A user connected', socket.id);

  socket.on("when a user joins", async ({ roomId, username }) => {
    socketID_to_Users_Map[socket.id] = { username };
    socket.join(roomId);
    const userslist = await getUsersinRoom(roomId, io);
    socket.in(roomId).emit("updating client list", { userslist: userslist });
    io.to(socket.id).emit("updating client list", { userslist: userslist });
    if (roomId in roomID_to_Code_Map) {
      io.to(socket.id).emit("on language change", { languageUsed: roomID_to_Code_Map[roomId].languageUsed });
      io.to(socket.id).emit("on code change", { code: roomID_to_Code_Map[roomId].code });
    }
    socket.in(roomId).emit("new member joined", { username });
  });

  socket.on("update code", ({ roomId, code }) => {
    if (roomId in roomID_to_Code_Map) {
      roomID_to_Code_Map[roomId]['code'] = code;
    } else {
      roomID_to_Code_Map[roomId] = { code };
    }
  });

  socket.on("syncing the code", ({ roomId }) => {
    if (roomId in roomID_to_Code_Map) {
      socket.in(roomId).emit("on code change", { code: roomID_to_Code_Map[roomId].code });
    }
  });

  socket.on("leave room", ({ roomId }) => {
    socket.leave(roomId);
    updateUserslistAndCodeMap(io, socket, roomId);
  });

  socket.on("disconnecting", (reason) => {
    socket.rooms.forEach(eachRoom => {
      if (eachRoom in roomID_to_Code_Map) {
        updateUserslistAndCodeMap(io, socket, eachRoom);
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`listening on port : ${PORT}`);
});
