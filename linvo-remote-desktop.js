#!/usr/bin/node0.6
/* 
 * This is ran on the machine that is supposed to be controlled
 * 	(probably by the Linvo Syncer which intercepts the RemoteDesktop event)
 * It starts a VNC server and connects to the WebSocket
 * 
 *   npm install ws base64 
 * 
 *  Usage: ./remote-desktop-client.js 6b32cc6c421b9059317889b7a51ab32c4775dc01efbd8f89280928e714ed4bbd
 * */


var WebSocket = require("ws"),
	net = require("net"),
	base64 = require("base64"),
	Buffer = require("buffer").Buffer,
	child = require("child_process");
	
var defaultVNCPort = 9500, /* system must block all external network requests to/from this port */
	remoteAgentURL = "ws://linvo-remote.jit.su";

var sessionID = process.argv[2];

if (!(sessionID && sessionID.length == 64))
	return console.error("usage: "+process.argv[1].split("/").pop()+" {sessionID}");

/*
 * WARNING: POTENTIAL BUG: a dangerous assumtion that
 * x11vnc will initialize the TCP connection before we're ready with our WebSocket
 * it should be ALWAYS fine, but it's not good to make assumptions like this
 * 
 */
child.exec("x11vnc -rfbport "+defaultVNCPort);

var client = new WebSocket(remoteAgentURL+"/in/"+sessionID),
	targetArgs = process.argv[0].toString().split(":"),
	target;

client.on("close", function()
{
	console.log("connection to the Linvo Remote Agent closed");
	process.exit();
});
client.on("open", function()
{
	/* OPen the target after we make sure we are ready to send */
	target = net.createConnection(defaultVNCPort, "localhost");
	
	target.on("data", function(data) { client.send(base64.encode(new Buffer(data))) });
	client.on("message", function(msg) { target.write(base64.decode(msg), "binary") });
});
