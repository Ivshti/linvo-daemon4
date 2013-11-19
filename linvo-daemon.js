#!/usr/bin/node

/*
 * WARNING: see NOTICE
 * this needs a little re-work
 */

require("./linvoapp-constants.js");
var path = require("path"),
	fs = require("fs"),
	io = require("socket.io-client"),
	dbus = require("dbus"),
	child = require("child_process");

var authFile = path.join(process.env["HOME"], authKeyPath);
if (! fs.existsSync(authFile))
{
	console.error("Unable to continue: authentication file not found.")
	return 1;
}
if (! fs.existsSync(installationIDFile))
{
	console.error("Unable to continue: installation ID file not found.");
	return 1;
}

var authToken = fs.readFileSync(authFile).toString().trim(),
	installationID = fs.readFileSync(installationIDFile).toString().trim(),
	userID = process.getuid();

/* Authenticate and bind the events
 */
var socket = io.connect(apiUrl+"/?authKey="+encodeURIComponent(authToken)),
	LinvoApp,
	libnotify;

socket.on("update", function(userInfo)
{
	var inst = userInfo.installations[installationID];
	if (! (inst && inst.installedApps))
		return;
	
	var currentApps, newApps; 
	
	currentApps = fs.readdirSync(process.env["HOME"]+appsDir)
		.filter(function(n) { return n.match(linvoappExt+"$") == linvoappExt })
		.map(function(f) { return path.basename(f, linvoappExt) });
	
	newApps = Object.keys(inst.installedApps).map(function(appName)
	{
		return inst.installedApps[appName].map(function(version) { return appName+" "+version }) 
	})
	.reduce(function(a,b) { return a.concat(b) });
		
	var installedApps = newApps.filter(function(id) { return currentApps.indexOf(id) == -1 }),
		removedApps = currentApps.filter(function(id) { return newApps.indexOf(id) == -1 });
	
	/* Remove apps
	 */
	function deactivated(app)
	{
		fs.unlink(process.env["HOME"]+appsDir+app+linvoappExt);
		libnotify.Notification("Removed app", "The app "+app+" is now removed");
	}
	removedApps.forEach(function(app) 
	{
		if (! LinvoApp.Deactivate(process.env["HOME"]+appsDir+app+linvoappExt, {})) /* Already deactived */
			deactivated(app);
	});
	LinvoApp.AppDeactivated.onemit = function(args)
	{
		if (args.userID == userID)
			deactivated(path.basename(args.name, linvoappExt));
	}
	LinvoApp.AppDeactivated.enabled = true;	

	/* Install apps
	 */	
	installedApps.forEach(function(app)
	{
		libnotify.Notification("Installation started", "The app "+app+" is currently being installed");

		child.exec("( cd $HOME/'"+appsDir+"' ; wget 'http://linvo.org/dummy/"+app+"')", function() /* TODO: proper download link */
		{
			var appPath = process.env["HOME"]+appsDir+app+linvoappExt;
			if (! path.existsSync(appPath))
				return libnotify.Notification("Error", "Unable to download "+app);

			if (LinvoApp.Activate(appPath, {})) /* Already activated */
				libnotify.Notification("Ready", "The app "+app+" is ready.");
		});		
	});
	LinvoApp.AppRunnable.onemit = function(args)
	{
		if (args.userID == userID)
			libnotify.Notification("Ready", "The app "+path.basename(args.name, linvoappExt)+" is ready.");
	}	
});

socket.on("RemoteDesktop:"+installationID, function(remoteSessID)
{ 
	child.exec("linvo-remote-desktop "+remoteSessID, function(stderr, stdout)
	{
		console.log("linvo-remote-desktop closed, output: ", stderr, "\n", stdout);
	});
});

socket.on("error", function(args)
{
	console.error("Connect failed: probably an authentication error: ", args);
	process.exit(1);
});

/* DBus interfaces: notifications & LinvoApp
 */
dbus.start(function()
{
	libnotify = dbus.get_interface(dbus.session_bus(),"org.freedesktop.Notifications","/org/freedesktop/Notifications","org.freedesktop.Notifications");
	libnotify.Notification = function(shortdesc, longdesc) { libnotify.Notify("Linvo Daemon", 0, "", shortdesc, longdesc, [], {}, -1) }; /* A faster shortcut */
	
	LinvoApp = dbus.get_interface(dbus.system_bus(), servicePath, objectPath, interfacePath);
});
