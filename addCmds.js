/* addCmds.js
 * This is a file allowing you to edit and add custom commands to MFSJSC.
 * Adding custom commands is achieved by passing structured objects to a mfs.c.customCommands array.
 * The object should have the following properties:
 *  name: Name as typed. Should be unique. 
 *        If a native command, or another custom command exists with the same name the command will fail to register.
 *  fn:   The command function itself, accepting a single argObj object
 * 
 * Be sure to regularly make backups of this file, just in case an update overwrites this file.
 */

// Namespace declarations
var mfs = this.mfs || {};
mfs.c = mfs.c || {};
// The container array for custom commands
mfs.c.customCommands = mfs.c.customCommands || [];

mfs.c.customCommands.push({
	name:"anidb",
	namespace: 'mfs',
	description: 'WIP',
	fn: (argObj) => {
		var db = JSON.parse(mfs.c.vars.anidb || "{}");
		var actions = {
			"list" : (argObj) => {
				for(var n in db.animes) {}
			}
		}
	}
});

mfs.c.customCommands.push({
	name: "echolrc",
	namespace: 'mfs',
	description: 'Opens LRC files and print lyrics set to their timecodes',
	fn: (argObj) => {
		if (!argObj[0]) {
			mfs.c.print('Not enough arguments',5);
			return false;
		}
		var rgx = /^\[(\d+):(\d+\.\d+)\](.*)/;
		
		mfs.c.util.ajax(argObj[0], (r) => {
			if (r.status===200) {
				var text = decodeURI(encodeURI(r.responseText));
				var lines = text.split('\n');
				console.log(lines.length);
				for (var i=0; i<lines.length; i++) {
					var s = lines[i].replace(/<\d+:\d+.\d+>/gm,"");
					var m = rgx.exec(s);
					if (!m) continue;
					if (m[2]) {
						var t = Number(m[1])*60000 + Number(m[2])*1000;
						console.log(t, m[3]);
						setTimeout(function(s) {mfs.c.print(s, 2)}, t, m[3]);
					}
				}
			} else {
				mfs.c.print('welp',5)
			}
		})
	}
})
