// ==UserScript==
// @name        MFScript Console
// @namespace   mfaizsyahmi
// @description Adds a little CLI on pages, interpreting my home-brewn MFScript
// @include     *
// @version     0.7.1
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @grant       GM_xmlhttpRequest
// @grant       GM_getResourceText
// @grant       GM_info
// @grant       GM_openInTab
// @grant		GM_setClipboard
// @require     https://github.com/mfaizsyahmi/mfs-js-console/raw/master/util.js
// @require     https://github.com/mfaizsyahmi/mfs-js-console/raw/master/cmds.js
// @require     https://github.com/mfaizsyahmi/mfs-js-console/raw/master/addCmds.js
// add the @ to enable an extra js to load with this userscript
// require     addCmds2.js
// @resource    containerStyle  https://github.com/mfaizsyahmi/mfs-js-console/raw/master/container.css
// @resource    iframeStyle     https://github.com/mfaizsyahmi/mfs-js-console/raw/master/iframe.css
// @resource    autoexec        https://github.com/mfaizsyahmi/mfs-js-console/raw/master/autoexec.txt
// @noframes
// ==/UserScript==

// TO DO:
// autoexec /
// dom listener system
// dom event dispatch system /
// dom manipulation
// print to anywhere on page (using above system)
// js-like interval system (to complement the above)
// math expression
// click to execute commands /
// i18n
// revamp command system so that they can supply properties specifying help text, where it's not okay to varsubst, etc.
//   (looks like I'm doing what MC1.13 is doing)

// DEBUG
/*
function GM_getValue(sth,def) {return def;}
function GM_setValue(varname, value) {}
function GM_getResourceText() {}
*/
//GM_deleteValue('vars'); 
//GM_deleteValue('globalPosterRef')
//GM_deleteValue('aliases');

//namespaces
mfs = this.mfs || {};
mfs.c = mfs.c || {};

// private states
mfs.c.state = { /*mfs.c.state ||*/
	init		: false, // initialized?
	visible		: false,
	title		: GM_info.script.name || 'MFScript Console',
	ver			: GM_info.script.version || 'v0.7.1',
	infoURL		: 'https://github.com/mfaizsyahmi/mfs-js-console/',
	helpURL		: 'https://github.com/mfaizsyahmi/mfs-js-console/wiki/Commands',
	toggleKey   : {key: '`', altKey: false },
	promptKey   : {key: '', altKey: false },
	regex: {
		// improved dbl quote escaping from stackoverflow.com/a/481587
		//arg: /(?:^|\s+)("([^\\"]*|\\.*)"|'([^\\']*|\\.*)'|-*[^\s]+)/g,
		arg: /(?:^|\s+)("([^"]*|\\.*)"|'([^']*|\\.*)'|-*[^\s]+)/g,
		argx: /(?:^|\s+)(?:(['"])(.*?)\1|(-*[^\s]+))/g,
		// filenames from stackoverflow.com/a/26253039
		filename: /[^/\\&\?]+(?=([\?&].*$|$))/, // (no ext check)
		filename2: /[^/\\&\?]+\.\w{3,4}(?=([\?&].*$|$))/, // (ext check)
		filename3: /([^/\\&\?]+)\.\w{3,4}(?=([\?&].*$|$))/, // (exclude ext)
		filename4: /([^/\\&\?]+)(\.\w{3,4})(?=([\?&].*$|$))/, // separate name and ext
		video: /.(webm|mp4|ogv)(\?|#|$)/i,
		audio: /.(mp3|ogg|wav|flac)(\?|#|$)/i,
		timedbatch: /^(\d*)\b(.*)$/m
	},
	hist : [],
	imgDlQueue: [],
	imgDlTimeoutID: 0,
	parseQueue: [],
	parsingQueue: false,
	promptCmd: false, // whether current command is parsed from an input opened with prompt key (will close after a short pause)
	promptCmdTimeout: 2000,
	//global: false, // should be public
	//globalPosterRef: null; // stored in GM
	printcache: [],
	varToState: ['initOnPageLoad', 'global'] // var values to copy over to state
	//initOnPageLoad: false // should be public
};

// public vars (editable from command)
// stack implementation allows for the env. var state to be pushed and popped, 
//  provided mfs.c.var references the top of stack at all times
mfs.c.varStack = [JSON.parse(GM_getValue('vars', JSON.stringify({
	ajaxUseWhateverOrigin: false, // used to force-enable CORS
	autoexec_src: 'resource', // "resource" use GM_getResourceText (default), "value" use GM_getValue
	echo: 1,
	mru: 1,
	imgDlType: 'image/jpeg',
	imgDlDelay: 500,
	'genlinks-anyname': true,
	initOnPageLoad: false,
	global: false,
	globalInterval: 1000,
	cmd_varsubst: true,
	cmd_chain: true,
	cmd_escape: true
}) ))];
// initialize to point to top of stack
mfs.c.vars = mfs.c.varStack[mfs.c.varStack.length-1];

// container for aliases
// prop:
//  [alias name] : [alias string]
mfs.c.aliases = JSON.parse(GM_getValue('aliases', '{}'));

// container for custom commands
mfs.c.addCmdTable = {}; // internal container, always nitialize
//mfs.c.customCommands = mfs.c.customCommands || []; // external

// core commands
mfs.c.commands = mfs.c.commands || [];
mfs.c.commands = mfs.c.commands.concat([{
	name: 'rem',
	description: 'Marks reminder in batch scripts; it does nothing',
	fn: () => {;} // do nothing
}, {
	names: ['echo', 'echomd', 'echocr'],
	description: 'Prints text to the console',
	fn: (argObj) => {
		let printOptions = {
			parseMarkdown: (argObj._commandName === 'echomd'),
			clearLastLine: (argObj._commandName === 'echocr')
		};
		mfs.c.print(argObj._argStr, 'normal', printOptions);
	}
}, {
	names: ['clear', 'cls', 'clr'],
	description: 'Clears the console',
	fn: (argObj) => {
		if (argObj.textonly) {
			Array.prototype.forEach.call(mfs.c.output.querySelectorAll('.lnoutput'), (node) => {
				node.parentNode.removeChild( node );
			}); // stackoverflow.com/a/13125840
		} else if (argObj.lastline) {
			mfs.c.output.lastElementChild.remove();
		} else { mfs.c.output.innerHTML = ''}
	}
}, {
	name: 'debug',
	hidden: true,
	description: 'Prints the argument object as parsed',	
	fn: (argObj) => {
		console.log(argsObj);
		mfs.c.print( JSON.stringify(argsObj), 'debug');
	}
}, {
	name: 'reload',
	description: 'Reloads the current page',
	fn: (argObj) => { location.reload() }
}, {
	name: 'open',
	description: 'Open a URL',	
	fn: (argObj) => { if(argObj.hasOwnProperty('0')) location.assign(argsObj[0]);
	}
}, {
	name: 'opentab',
	description: 'Open URL(s) on new tab(s)',	
	fn: (argObj) => {
		let i = 0;
		while (argObj.hasOwnProperty(i) && i < 32) {
			GM_openInTab(argsObj[i]);
			i++;
		}
	}
}, {
	name: 'pushvar',
	description: 'Pushes the variable stack',
	fn: () => {mfs.c.pushVarStack()}
}, {
	name: 'popvar',
	description: 'Pops the variable stack',
	fn: () => {mfs.c.popVarStack()}
}, {
	name: 'savevar',
	description: 'Commits current variable stack to browser storage',
	fn: () => {mfs.c.pushVarStack()}
}, {
	name: 'resetvar',
	description: 'Reset variables to defaults',
	fn: (argObj) => {
		if (argObj.confirm) {
			GM_setValue('vars', undefined);
			mfs.c.print('Vars reset. Reload to take effect.', 3);
		} else {
			mfs.c.print('Confirm reset variables? [yes](cmd:resetvar -confirm;cls -lastline) [no](cmd:cls -lastline)',
			'important',{parseMarkdown:true});
		}
	}
}, {
	name: 'toggleconsole',
	description: 'Toggle console',
	fn: (argObj) => { mfs.c.toggle(argObj[0]) }
}, {
	name: 'global',
	description: 'Turns global mode on/off',
	fn: (argObj) => {
		mfs.c.vars.global = isNaN(argObj[0])? 0 : Number(argObj[0]) || 0;
		mfs.c.globalSetup(mfs.c.vars.global);
	}
}, {
	name: 'help',
	description: 'Display help',
	fn: (argObj) => {
		let lines = [];
		for (let cmd of mfs.c.commands) {
			if (cmd.hidden) continue;
			for (let cmdName of cmd.names || [cmd.name]) {
				let nameCol = cmdName + ((cmd.custom)? '*' : '');
				let space = (argObj.short) ? '' : ' '.repeat(Math.max(1, 12 - nameCol.length));
				let desc = (argObj.short) ? '' : cmd.description || '';
				lines.push(`${nameCol}${space}${desc}`);
			}
		}
		lines.sort();
		mfs.c.print(lines.join('\n'));
		mfs.c.print('* Custom command')
		if (mfs.c.state.helpURL) {
			mfs.c.print(`Check out the [wiki page on Github](${mfs.c.state.helpURL})`, 3, {parseMarkdown: true});
		}
	}
}]);

// PARSE ROUTINE
mfs.c.parse = function(s, batch) {
	// echo. suppress if batch
	if (!batch && mfs.c.vars.echo) {mfs.c.print(s, 1);}
	
	// add to datalist (MRU list)
	// note: Do this BEFORE varsubst!
	if (!batch && mfs.c.vars.mru && mfs.c.state.hist.indexOf(s) == -1) {
		mfs.c.state.hist.push(s);
		let opt = document.createElement('option'),
		t = document.createTextNode(s);
		opt.appendChild(t);
		mfs.c.histDOM.appendChild(opt);
	}
	
	// substitute variables
	// IDEA: do this after argObj(), to its values
	let sp = (mfs.c.vars.cmd_varsubst === 1)? mfs.c.varSubst(s) : s;
	sp = sp.trim();
	
	// get namespace and command name
	let cmdPattern = /^(?:([\S]*?(?=:)):)?([\S]*)\b/ig;
	let cmdMatch = cmdPattern.exec(sp);
	let cmdNamespace = cmdMatch[1];
	let cmdName = cmdMatch[2];//.toLowerCase();
	// finding matching arguments early on to get argument specs for argObj
	let cmdMatches = mfs.c.commands.filter( cmd => (cmd.names && cmd.names.includes(cmdName) ) || cmd.name===cmdName );
	if (cmdMatches.length > 1) cmdMatches = cmdMatches.filter( cmd => cmd.namespace === cmdNamespace);
	if (cmdMatches.length > 1) console.log(`Multiple matching commands found! Will proceed with the first one.`, cmdMatches);
	let argSpec = (cmdMatches.length) ? cmdMatches[0].argSpec || {} : {};
	
	// get and parse arguments
	let args = '';
	let argsObj = {};
	if (sp.indexOf(' ') > 0) {
		args = sp.substr(sp.indexOf(' ') + 1);
		argsObj = mfs.c.argObj(args, argSpec);
		argsObj._commandName = cmdName; // adds the original command name as a property
	}
	// varsubst args string here, after argObj, for the echo commands
	if (mfs.c.vars['cmd_varsubst'] === 2) {
		args = mfs.c.varSubst(args);
		argsObj._argStr = args;
	}
	
	// start executing commands
	if (cmdMatches.length) {
		cmdMatches[0].fn(argsObj);
	} else if (mfs.c.aliases && mfs.c.aliases.hasOwnProperty(cmdName)) { // parse alias
		// prepare array of commands
		let cmdlist = mfs.c.aliases[cmdName].split(';');
		
		// substitute alias arguments into command array NOW
		for (let aj = 0; aj < cmdlist.length; aj++) {
			cmdlist[aj] = mfs.c.util.txtfmt(cmdlist[aj], argsObj);
		}
		
		// pass array to parseBatch for further, *proper* processing
		console.log('batch parse from alias', cmdName);
		mfs.c.parseBatch(cmdlist, true);
		
	} else { 
		mfs.c.print(`Unknown command: ${cmdName}`, 5);
	}
	
	// chaining
	//if (batch && mfs.c.vars.cmd_chain && mfs.c.state.parseQueue.length) {
		// this function should no longer be required to call processParseQueue
		// instead processParseQueue loops the queue by itself
		
		/* 
		 * mfs.c.state.parseQueue.shift();
		 * console.log(mfs.c.state.parseQueue.length);
		 * mfs.c.processParseQueue();
		 */
	//}
};

// batch parsing
// NOTE: special rule for alias commands
//       current command (ought to be an alias cmd at idx 0) should be removed and replaced with the new commands
//  also, alias is true when cmdArray came from expanding an alias
mfs.c.parseBatch = function(cmdArray, alias) {
	if (!cmdArray || !cmdArray.length) return;
	
	if (mfs.c.vars.cmd_chain && alias) { // special alias processing
		// IMPORTANT: processParseQueue will shift the first item out after the parse that lead here, 
		// so new items must be inserted after the first item
		let curItem = mfs.c.state.parseQueue[0];
		let otherItems = mfs.c.state.parseQueue.slice(1);
		mfs.c.state.parseQueue = [].concat(curItem, cmdArray, otherItems);
		// only initiate parseQueue when it's not alraedy running
		if (!mfs.c.state.parsingQueue) mfs.c.processParseQueue();
		
	} else if (mfs.c.vars.cmd_chain) { // chained
		mfs.c.state.parseQueue = mfs.c.state.parseQueue.concat(cmdArray);
		// only initiate parseQueue when it's not alraedy running
		if (!mfs.c.state.parsingQueue) mfs.c.processParseQueue();
		
	} else { // non-chaining, timeout all at once
		for(var i = 0; i < cmdArray.length; i++) {
			setTimeout( (s) => { mfs.c.parse(s, true) }, 0, cmdArray[i]);
		}
	}
}

mfs.c.processParseQueue = function () {
	// function called while already parsing queue -> abort the new call
	if (mfs.c.state.parsingQueue) return;
	
	if (!mfs.c.state.parseQueue.length) {
		return;
	} else if (mfs.c.state.parseQueue.length > 1000) {
		console.log('WARNING: too many queued commands!!');
		// clear the queue;
		mfs.c.state.parseQueue = [];
		return;
	}
	
	debugger;
	// trying out synchronous parsing of the queue, to get "for" to work correctly
	mfs.c.state.parsingQueue = true;
	while (mfs.c.state.parseQueue.length) {
		// console.log('Current Parse Queue: \n\n' + mfs.c.state.parseQueue.join('\n'))
		// note: parse can push alias commands into queue
		try {
			mfs.c.parse(mfs.c.state.parseQueue[0], true);
		} catch(e) {
			// we don't want errors in parsing the queue from keeping the parsingQueue flag on
			console.log('error parsing queued command: ', mfs.c.state.parseQueue[0]);
		}
		mfs.c.state.parseQueue.shift();
	}
	mfs.c.state.parsingQueue = false;
}

// moved out from "exec" command
mfs.c.parseTimedBatch = function (s) {
	var lines = s.split('\n');
	var rgx = mfs.c.state.regex.timedbatch || /^(\d*)\b(.*)$/m;
	var m; // match array
	var t; // timestamp
	var s; // command string
	var tout = []; // array for timeouts
	var cmdlist = []; // list of commands
	
	for (var i = 0; i < lines.length; i++) {
		m = rgx.exec(lines[i]);
		if (!m) continue;
		t = Number(m[1]) || 0; // timecode
		s = m[2].trim();     // the rest of the command
		s = s.split('//')[0];// rmv comments
		if (t > 0) { // timed, set timeout 
			tout.push( setTimeout( (s) => {mfs.c.parse(s, true)}, t, s));
		} else if (s) { // non-timed & non-empty, put in list
			cmdlist.push(s);
		}
	}
	// pass cmdlist to batch parser 
	if (cmdlist.length) mfs.c.parseBatch(cmdlist);
}

// argument object constructor - the keystone of the script
mfs.c.argObj = function (args) {
	if(args.length === 0) return {};
	
	const pattern = /*mfs.c.state.regex.argx ||*/ /(?:^|\s+)(?:(['"])(.*?)\1|([\S]+|\d+))/g;
	var match;
	// [0]: whole match
	// [1]: quotes. don't use
	// [2]: text inside quotes
	// [3]: normal text including switch
	const mStr = (match) => {
		let val = match[3] || match[2];
		if (mfs.c.vars['cmd_varsubst'] == 2) val = mfs.c.varSubst(val);		
		return val;
	};
	const mKey = (match) => match[3] && match[3].length > 1 && match[3].substr(0, 1) == '-' && isNaN(match[3].substr(1));
	
	/*
	var t = mfs.c.state.regex.arg || /(?:^|\s+)("([^\\"]*|\\.*)"|'([^\\']*|\\.*)'|-*[^\s]+)/g;
	var m;    // match array, where:
		      //  [0]: whole match (rarely used) 
			  //  [1]: key, switch, or value w/quotes
			  //  [2]: value w/out dbl quotes, if any
			  //  [3]: value w/out single quote, if any
	*/
	var i = 0;  // unnamed value index counter
	var c = 0;  // token counter (fixed limit of 200)
	var key;
	var expectValue = false; // flag next token as value to a key
	var o = {}; // output object
	o._argStr = (mfs.c.vars['cmd_varsubst'] === 2) ? mfs.c.varSubst(args): args;
	
	while(match = pattern.exec(args)) {
		if(expectValue && mKey(match) ) {
			// value expected from previous key but current is also a key => prev is switch
			o[key] = true;
		}
		if (mKey(match)) {
			//key, keep and look forward to value
			//(if a digit follows the dash, treat as value or text!)
			key = mStr(match).substr(1);
			expectValue = true;
		} else if (expectValue) {
			// value of keyvalue pair
			o[key] = mStr(match);
			expectValue = false;
		} else {
			// regular arguments
			o[i] = mStr(match);
			i++;
		}
		c++;
		if (c > 200) break; // loop hell prevention
	}
	if (expectValue) o[key] = true; // when loop has ended but still expecting value, treat that key as switch
	return o;
};

// VARIABLE CONTROL SYSTEM
// to control how exposed variables are retrieved and set
mfs.c.pushVarStack = function() {
	// make a deep copy of the top var object in the stack
	let copy = JSON.parse(JSON.stringify(mfs.c.varStack[mfs.c.varStack.length-1]))
	mfs.c.varStack.push(copy);
	// fix mfs.c.var to point to the new top of stack
	mfs.c.vars = mfs.c.varStack[mfs.c.varStack.length - 1];
	console.log(`stack height: ${mfs.c.varStack.length}`);
}
mfs.c.popVarStack = function() {
	if (mfs.c.varStack.length > 1) mfs.c.varStack.pop();
	// fix mfs.c.var to point to the new top of stack
	mfs.c.vars = mfs.c.varStack[mfs.c.varStack.length - 1];
	console.log(`stack height: ${mfs.c.varStack.length}`);
}

// returns a copy of the full variable collection, including dynamic ones
mfs.c.fullVarObj = function() {
	// gets a copy of the vars JSON object
	let varObj = JSON.parse(JSON.stringify(mfs.c.vars));
	
	// initialize other stuff
	const now = new Date();
	
	// dynamic vars
	const dynamicVars = {
		location: location.href,
		fulldate: now.toString(),
		date: now.toDateString(),
		time: now.toTimeString(),
		ver: mfs.c.state.ver,
		oLocation: location,
		oDate: {
			year: now.getFullYear(),
			month: now.getMonth() + 1,
			day: now.getDate(),
			weekday: now.getDay(),
			hours: now.getHours(),
			minutes: now.getMinutes(),
			seconds: now.getSeconds(),
			tzOffset: now.getTimezoneOffset()
		}
	};
	// let varObj overwrite the dynamic vars
	return Object.assign({}, dynamicVars, varObj);
}
// an alias to the function, but in property getter form
Object.defineProperty(mfs.c, 'fullvars', { get: mfs.c.fullVarObj });

mfs.c.varSubst = function (s) {
	// retrieves the full variable collection
	// note: method used to be here; moved to provide dynamic vars elsewhere
	var varObj = mfs.c.fullVarObj();

	// go and subst
	// TODO: REPLACE THIS TO SUPPORT inclusion of JSON objects into the string
	s = mfs.c.util.txtfmt2(s, varObj);
	return s;
}

// Switches to editor mode which displays a textarea and save/close buttons
// options is an object which contains the following:
//  getter: fn to get the text content (required)
//  setter: fn that gets passed the text when saving
//  title: what you're editing
//  close: tells the fn we want to close the editor
mfs.c.showEditor = function(options = {}) {
	// requires getter and setter be set, or close argument
	if (!options.close && (!options.getter || !options.setter)) return;
	// settings
	let settings = Object.assign({
		title: 'Editor',
		close: false
	}, options);
	
	const frameDoc = mfs.c.frame.contentDocument;
	// toggle editor view
	frameDoc.body.classList.toggle('editor', !settings.close);
	if (settings.close) {
		// remove all editor dom elements
		frameDoc.querySelectorAll('#mfs-c-editor, #mfs-c-editor-header').forEach(el => el.remove());
		return;
	} else {
		// create dom elements
		let editor = frameDoc.createElement('textarea');
		editor.id = 'mfs-c-editor';
		editor.value = settings.getter();
		
		let header = frameDoc.createElement('div');
		header.id = 'mfs-c-editor-header';
		header.innerHTML = `<div id="mfs-c-editor-cmd">[<span id="mfs-c-editor-save">Save</span>] [<span id="mfs-c-editor-close">Close</span>]</div>
		  <span id="mfs-c-editor-title">${settings.title}</span>`;
		  
		frameDoc.body.appendChild(header);
		frameDoc.body.appendChild(editor);
		
		header.querySelector('#mfs-c-editor-save').addEventListener('click', () => { settings.setter(editor.value) });
		header.querySelector('#mfs-c-editor-close').addEventListener('click', () => { mfs.c.showEditor({close:true}) });
	}
}

// PRINT ROUTINE
// s: the string to print
// type: see the var typedef below
// options: can hold the following properties:-
//   htmlescape: whether to escape html (certain commands prints html fragments)
//   fromGlobal: if true, do not propagate
//   parseMarkdown: parses partial markdown syntax
//   clearLastLine: replaces last line with this
//   append: append to last line
//   lineNumber: put line numbers
mfs.c.print = function(str, type, options = {}) {
	const typedef = { // type definition
		0: 'normal',
		1: 'input',
		2: 'textdump',
		3: 'info',
		4: 'warn',
		5: 'error',
		6: 'important',
		99: 'debug',
		normal: 'normal',
		input: 'input',
		text: 'textdump',
		textdump: 'textdump',
		info: 'info',
		warn: 'warn',
		warning: 'warn',
		error: 'error',
		important: 'important',
		gallery : 'mfs-c-gallery',
		debug: 'debug'
	};
	var blackliststr = mfs.c.vars.blacklist || "";
	var blacklist = blackliststr.split("|");
	var now = new Date();
	
	// set type 
	if (typeof type === 'undefined') type = 0;
	var stype = typedef.hasOwnProperty(type) ? typedef[type] : 'normal';
	
	let oel;
	// [optional] parse markdown
	if (options.parseMarkdown) str = mfs.c.util.markdown(str);
	// [optional] remove last output child
	if (options.clearLastLine) {
		mfs.c.output.lastElementChild.remove();
	}
	// if only clear last line with no string, don't print anything
	//if (options.clearLastLine && str.length === 0) return;
	
	// setup output element
	if (options.append) {
		oel = mfs.c.output.lastElementChild;
	} else {
		oel = document.createElement('span');
		oel.className = "lnoutput " + stype;
		oel.dataset.timestamp = now.toUTCString();
		oel.dataset.timetext = now.toLocaleTimeString();
	}
	
	lines = str.replace(/\t/g,'    ').split('\n');
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];
		if (options.lineNumber) line = `${i}: ${line}`;
		if (options.htmlEscape) {
			for (let blacklistItem of blacklist) {
				line = line.replace(blacklistItem, "¦".repeat(blacklistItem.length) );
			}
			oel.appendChild(document.createTextNode(line));
			oel.appendChild(document.createElement('br'));
		} else if (stype === 'mfs-c-gallery') {
			// NOTE: line must consist of only the URL for this
			oel.innerHTML += `<a href="${line}" title="${line}" target="_blank"><img src="${line}"></a>`
		} else { 
			// normal output
			oel.innerHTML += line + ((i==0) ? '' : '<br>');
		}
	}
	mfs.c.output.appendChild(oel);
	
	// scroll to element (FF only!)
	oel.scrollIntoView();
	
	if ( mfs.c.isGlobalPoster() && !options.fromGlobal ) {
		// adding item to printcache here...
		var now = new Date(),
			jsonow = now.toJSON(),
			data = {
				"time": jsonow,
				"s": s,
				"type": type,
				"htmlescape": htmlescape
			};
		mfs.c.state.printcache.push(data);
		//console.log(mfs.c.state.printcache);
	}
};

// COMMAND ADD-IN PARSER SUB
// custom cmds in a object array
// format: [{name:string, fn: function(){}},...]
mfs.c.parseAddCmds = function() {
	if (!mfs.c.customCommands || !mfs.c.customCommands.length) return;
	var list = mfs.c.customCommands,		
		tbl = mfs.c.addCmdTable;
	for (let i = 0; i < list.length; i++) {
		if(typeof list[i] != 'object' || typeof list[i].name != 'string' || typeof list[i].fn != 'function') {
			mfs.c.print('Error: Invalid data type for custom command list item #' +i, 5);
		} else if (tbl[ list[i].name ]) {
			mfs.c.print('Error: Custom command of that name already exists! item #' + i,5);
		} else {
			tbl[ list[i].name ] = list[i].fn;
		}
		
		// for the new commands collection
		mfs.c.registerAddCommand(list[i]);
	}
}

// handles addition of custom commands
mfs.c.registerAddCommand = function(obj) {
	let outObj = {custom: true};
	
	// check that namespace is provided
	if (!obj.namespace) {
		console.log('Error registering custom command: no namespace provided (required)');
		return false;
	}
	
	// check that name(s) are provided
	if (Array.isArray(obj.names)) {
		outObj.names = obj.names;
	} else if (obj.name) {
		outObj.name = obj.name;
	} else {
		console.log('Error registering custom command: no name (required)');
		return false;
	}
	
	// copy the rest of the properties
	outObj.description = obj.description;
	outObj.helpText = obj.helpText;
	outObj.argSpec = obj.argSpec;
	outObj.fn = obj.fn;
	
	// push command object
	mfs.c.commands.push(outObj);
	return true;
}


// GLOBAL system
// check if we're the global poster
mfs.c.isGlobalPoster = () => mfs.c.vars.global && GM_getValue('globalPosterRef', null) === location.href;

// a global var property for use with global mode
// globalSetup should have authority to assign mfs.c.vars to this property
// todo: sort out push/pop with this
Object.defineProperty(mfs.c, 'globalVars', { 
	get: () => JSON.parse(GM_getValue('globalVars') || null),
	set: (val) => GM_setValue(JSON.stringify(val))
});

// sets focus on this page
mfs.c.globalFocus = function () {
	if ( !mfs.c.vars.global || document.visibilityState !== 'visible') return;
	
	// set the global poster ref, and get the stored printcache
	GM_setValue('globalPosterRef', location.href);
	mfs.c.state.printcache = JSON.parse(GM_getValue('printcache','[]'));
}

// on pages with global mode on this gets run at an interval
mfs.c.globalInterval = function () {
	const now = new Date();
	if ( mfs.c.isGlobalPoster() ) { // is poster?
		var activecache = mfs.c.state.printcache || [];
		
		// poster is in charge of clearing the print cache
		for (var i = activecache.length - 1; i >= 0; i--) {
			var printtime = new Date(activecache[i].time)
			if (now - printtime > 10000) { // past 10 seconds
				activecache.splice(i, 1); // remove
			}
		}
		GM_setValue('printcache', JSON.stringify(activecache) );
		
	} else { // listener
		var listencache = JSON.parse(GM_getValue('printcache','[]'));
		var owncache = mfs.c.state.printcache;
		
		// see if there's new stuff cached
		for (var i = 0; i < listencache.length; i++) {
			var data = listencache[i];
			if (owncache.findIndex( item => item.time === data.time ) < 0 ) { // if item in listencache doesn't exist in owncache
				mfs.c.print(data.s, data.type, {htmlEscape: data.htmlescape} );
				owncache.push(data);
			}
		}
	}
}

// sets the global mode on/off
mfs.c.globalSetup = function (val = false) {
	const onVisChangeFn = () => { mfs.c.globalFocus() };
	
	if (val) {
		// listen for focus
		document.addEventListener('visibilitychange', onVisChangeFn );
		mfs.c.globalIntervalID = setInterval( () => { mfs.c.globalInterval() }, Number(mfs.c.vars.globalInterval) || 1000 );
		mfs.c.globalFocus(); // assume page that runs this is in focus
		// mfs.c.vars = mfs.c.globalVars;
		mfs.c.print('Global mode enabled', 3);
	} else {
		document.removeEventListener('visibilitychange', onVisChangeFn );
		clearInterval(mfs.c.globalIntervalID);
		// mfs.c.vars = mfs.c.varStack[mfs.c.varStack.length - 1];
		mfs.c.print('Global mode disabled', 3);
	}
	
}

// toggles visibility of the console, as well as taking focus on and off it
mfs.c.toggle = function(visible) {
	// if not set, invert
	if (visible === undefined) visible = !mfs.c.state.visible;
	// convert value to boolean, then assign to state
	mfs.c.state.visible = !!visible;
	mfs.c.container.style.display = (mfs.c.state.visible) ? "block" : "none";
	if (visible) {
		mfs.c.input.focus();
	} else {
		mfs.c.input.blur();
		
		// all these to get focus back to parent
		var meh = document.createElement('input');
		meh.style.visible = "hidden";
		meh.style.position = "fixed"; // prevent page scrolling to bottom on focus
		document.body.appendChild(meh);
		parent.focus();
		meh.focus();
		meh.blur();
		document.body.removeChild(meh);
	}
}

// MAIN INITIALIZATION ROUTINE
mfs.c.init = function () {
	const c = mfs.c;
	// check that cmd and util modules are loaded
	console.log(`mfs console modules status:\n  cmd:${!!mfs.c.cmd}\n  util:${!!mfs.c.util}`);
	
	// Stage 1: container and iframe first
	c.container = document.createElement('div');
	c.container.id = "mfs-c-container";
	
	c.frame = document.createElement('iframe');
	c.frame.id = 'mfs-c-frame';
	
	c.styleEl = document.createElement('style');
	c.styleEl.innerHTML = GM_getResourceText('containerStyle');
	
	// stage 2: inside the iframe
	c.frame.addEventListener('load', function consoleFrameLoad(e) {
		const frameDoc = c.frame.contentDocument;
		
		c.input = frameDoc.createElement('input');
		c.input.type = 'text';
		c.input.id   = 'mfs-c-input';
		c.histDOM = frameDoc.createElement('datalist');
		c.histDOM.id = 'mfs-c-inputlist';
		c.input.setAttribute('list','mfs-c-inputlist');
	
		c.output = frameDoc.createElement('div');
		c.output.id  = 'mfs-c-output';
	
		c.frameStyleEl = frameDoc.createElement('style');
		c.frameStyleEl.innerHTML = GM_getResourceText('iframeStyle');
		
		frameDoc.head.appendChild(c.frameStyleEl);
		frameDoc.body.appendChild(c.input);
		frameDoc.body.appendChild(c.histDOM);
		frameDoc.body.appendChild(c.output);
		
		// add keypress event listener to the iframe
		c.frame.contentWindow.addEventListener('keypress', function consoleKeypress(e) {
			// common routines to hide the console
			if (mfs.c.state.editor) {
				return;
			} else if ( mfs.c.util.objMatch(e, mfs.c.state.toggleKey, false) ) { // check if toggle key is pressed
				e.preventDefault();
				mfs.c.toggle(false);
			}

			// now check if user presses enter
			if (!c.input.value.length) return false;
			if (e.key == "Enter" || e.key == "Return") {
				c.parse(c.input.value);
				c.input.value = "";
				if (mfs.c.state.promptCmd) setTimeout( () => {mfs.c.toggle(false)} , mfs.c.state.promptCmdTimeout || 2000);
			} else if (e.key == "Escape") {
				c.input.value = "";
				if (mfs.c.state.promptCmd) setTimeout( () => {mfs.c.toggle(false)} , mfs.c.state.promptCmdTimeout || 2000);				
			}
		});
		
		c.output.addEventListener('click', function consoleClick(e) {
			var t = e.target;
			while (t != c.output) { // traverse the DOM
				//t.className.match(/\binput\b/ig)
				if (t.classList.contains('input')) {
					c.input.value = t.innerText;
					return;
				} else if (t.classList.contains('cmd')) {
					var cmdlist = t.dataset.cmd.split(';');
					c.parseBatch(cmdlist);
					return;
				} else {t = t.parentNode;}
			}
		});
		
		c.print([c.state.title, c.state.ver].join(' '));
		c.cmd.time({});
		
		// run autoexec
		let autoexec;
		if (c.vars.autoexec_src === 'value') {
			autoexec = GM_getValue('autoexec') || GM_getResourceText('autoexec');
		} else if (c.vars.autoexec_src === 'resource') {
			autoexec = GM_getResourceText('autoexec');
		} else {
			// defaults to resourcetext
			autoexec = GM_getResourceText('autoexec');
		}
		if (autoexec) c.parseTimedBatch(autoexec);
		
		c.state.loaded = true;
		console.log('mfs js console loaded');
		if(c.state.visible) c.input.focus();
	});	
	
	// append everything into place
	c.container.appendChild(c.frame);
	document.body.appendChild(c.container);
	document.head.appendChild(c.styleEl);
	c.container.style.display = "none";
	
	// some other subs to call
	c.parseAddCmds();
	if (c.vars.global) {c.globalSetup(c.vars.global)}
};

// listen for toggle key on parent page
document.addEventListener('keypress', function pageKeypress(e) {
	//if (e.key !== mfs.c.state.togglekey || e.ctrlKey) {
	let matchFn = mfs.c.util.objMatch;
	let toggleKey = mfs.c.state.toggleKey;
	let promptKey = mfs.c.state.promptKey;
	if ( !matchFn(e, toggleKey, false) && !matchFn(e, promptKey, false) ) {
		//fires just the togglekey without the ctrl
		// idk how to make this work :(
		//var raised = new KeyboardEvent('keypress', {key:'`'});
		//document.activeElement.dispatchEvent(raised);
		return;
	}
	e.preventDefault();
	
	if (!mfs.c.state.loaded) {
		mfs.c.init();
		// mfs.c.parseAddCmds();
	}
	mfs.c.state.promptCmd = matchFn(e, promptKey); // whether toggle is by prompt key
	
	mfs.c.toggle();
});

if (mfs.c.vars.initOnPageLoad) mfs.c.init();

//if (mfs.c.util) {console.log('util module is loaded')}
//if (mfs.c.cmd) {console.log('cmd module is loaded')}
//console.log('mfs js console - loaded:', (mfs.c.util)?'util':'', (mfs.c.cmd)?'cmd':'');
