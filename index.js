'use strict';

// server setup
const Hapi = require('hapi');
const notp = require('notp');

// pn532 setup
const pn532 = require('pn532');
const SerialPort = require('serialport').SerialPort;
const serialPort = new SerialPort(process.env.SERIALPORT, { baudrate: 115200 });
const options = {
  pollInterval: 500
};
const rfid = new pn532.PN532(serialPort, options);

// other setup
const request = require('request');
const path = require('path');
const moment = require('moment');

const server = new Hapi.Server({
  connections: {
    routes: {
      files: {
        relativeTo: path.join(__dirname, 'app')
      }
    }
  }
});

server.connection({
  port: process.env.PORT || 1337
});

server.register(require('inert'), (err) => {

  if (err) {
    throw err;
  }

  server.start((err) => {
    if (err) {
      throw err;
    }
    log('info', 'Server running at: ' + server.info.uri);
  });
});

const io = require('socket.io')(server.listener);

io.on('connection', function(socket){
  log('client <strong>connected</strong>');

  socket.on('disconnect', function(){
    log('client <strong>disconnected</strong>');
  });
});

server.route({
  method: 'GET',
  path: '/',
  handler: (request, reply) => {
    log('base route');
    return reply.file('index.html');
  }
});

log('Initialising...');

rfid.on('ready', function() {
  log('PN532 initialised');

  console.log('Listening for a tag scan...');
  var authTimeout = setTimeout(function() {
    log('Timeout: no tag scanned');
  }, 100000);
  rfid.on('tag', function(tag) {
    if (tag) {
      log('tag found');
      clearTimeout(authTimeout);
    } else {
      log('undefined tag');
    }
    log('tag uid:', tag.uid);
    if (tag.uid === process.env.NFCID) {
      log('is katy');

      const totpToken = notp.totp.gen(process.env.TOTP_KEY);
      log('totpToken: ' + totpToken);

      request({
        uri: 'http://kmoe.herokuapp.com/auth',
        method: 'POST',
        timeout: 20000,
        json: true,
        body: {
          token: totpToken,
        },
      }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
          log(body);
        }
      });

    } else {
      log('not katy');
    }
  });
});

function log() {
  const message = Array.prototype.slice.call(arguments).join(' ');
  console.log(message);
  if (io) {
    io.emit('log', moment().format() + ': ' + message);
  }
}