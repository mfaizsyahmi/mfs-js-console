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
	name:"ppap", 
	fn: function(argObj) {
		mfs.c.print('I have a pen');
		mfs.c.print('I have an apple');
		mfs.c.print('UHH');
		mfs.c.print('Apple Pen!');
	}
});