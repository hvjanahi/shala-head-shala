require('./config/config');
const express = require('express');
const socketIO = require('socket.io');
const http = require('http');
const moment = require('moment');
const { mongoose } = require('./db/mongoose');
const { User } = require('./models/user');
const { generateMessage, generateLocationMessage } = require('./utils/message');
const { isRealString } = require('./utils/validation');
const { Users } = require('./utils/users');

const path = require('path');
const publicPath = path.join(__dirname, '../public');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const port = process.env.PORT;
let users = new Users();

/* [Usage]
 * // Send an event to everybody in the room 'The Office Fans'
 * io.emit -> io.to('The Office Fans').emit
 * // Send an event to everybody in the room 'The Office Fans' except for the current user
 * socket.broadcast.emit -> socket.broadcast.to('The Office Fans').emit
 * // Send an event to specific user
 * socket.emit
 */

// app.use(bodyParser.json());
app.use(express.static(publicPath));

io.on('connection', (socket) => {
  console.log('New user connected');

  socket.on('join', (params, callback) => {
    if (!isRealString(params.name) || !isRealString(params.room)) {
      return callback('Name and room name are required.');
    } else if (users.getUserList(params.room).indexOf(params.name) !== -1) {
      return callback('Name has already been taken.');
    }
    socket.join(params.room);
    // Remove the user from previous room (if have one)
    users.removeUser(socket.id);
    users.addUser(socket.id, params.name, params.room);
    io.to(params.room).emit('updateUserList', users.getUserList(params.room));
    socket.emit('newMessage', generateMessage('Admin', `Welcome to the chat app! You are currently in the room ${params.room}.`));
    socket.broadcast.to(params.room).emit('newMessage', generateMessage('Admin', `${params.name} has joined.`));
    callback();
  });
  socket.on('createMessage', (message, callback) => {
    const user = users.getUser(socket.id);
    if (user && isRealString(message.text)) {
      const time = moment(new Date().getTime()).toString();
      io.to(user.room).emit('newMessage', {
        from: user.name,
        text: message.text,
        createdAt: time,
      });
      User.findByIdAndUpdate(user.id, {
        $push: {
          message: message.text,
          createdAt: time,
        },
      }, (error, foundUser) => {
        if (!foundUser) {
          new User({
            _id: user.id,
            name: user.name,
            room: user.room,
            message: message.text,
            createdAt: time,
          }).save();
        }
      });
    }
    callback();
  });

  socket.on('createLocationMessage', (coords) => {
    const user = users.getUser(socket.id);
    if (user) {
      io.to(user.room).emit('newLocationMessage', generateLocationMessage(user.name, coords.latitude, coords.longitude));
      const time = moment(new Date().getTime()).toString();
      User.findByIdAndUpdate(user.id, {
        $push: {
          message: `Send location: ${coords.latitude}, ${coords.longitude}`,
          createdAt: time,
        },
      }, (error, foundUser) => {
        if (!foundUser) {
          new User({
            _id: user.id,
            name: user.name,
            room: user.room,
            message: `Send location: ${coords.latitude}, ${coords.longitude}`,
            createdAt: time,
          }).save();
        }
      });
    }
  });

  socket.on('disconnect', () => {
    let user = users.removeUser(socket.id);

    if (user) {
      io.to(user.room).emit('updateUserList', users.getUserList(user.room));
      io.to(user.room).emit('newMessage', generateMessage('Admin', `${user.name} has left.`));
    }
  });
});

server.listen(port, () => {
  console.log(`Server is up and running at port ${port}`);
});

module.exports = { app };
