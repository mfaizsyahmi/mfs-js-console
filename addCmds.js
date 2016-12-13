var mfs = this.mfs || {};
mfs.c = mfs.c || {};
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