// ==UserScript==
// @name        MFScript Console
// @namespace   mfsfareast
// @description Something silly
// @include     *
// @version     0.5
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @grant       GM_xmlhttpRequest
// @grant       GM_getResourceText
// @grant       GM_info
// @grant       GM_openInTab
// @require     https://github.com/mfaizsyahmi/mfs-js-console/raw/master/util.js
// @require     https://github.com/mfaizsyahmi/mfs-js-console/raw/master/cmds.js
// @require     https://github.com/mfaizsyahmi/mfs-js-console/raw/master/addCmds.js
// add the @ to enable an extra js to load with this userscript
// require     addCmds2.js
// @resource    containerStyle  https://github.com/mfaizsyahmi/mfs-js-console/raw/master/container.css
// @resource    iframeStyle     https://github.com/mfaizsyahmi/mfs-js-console/raw/master/iframe.css
// @resource    autoexec        https://github.com/mfaizsyahmi/mfs-js-console/raw/master/autoexec.txt
// ==/UserScript==

// TO DO:
// autoexec /
// dom listener system
// dom event dispatch system /
// dom manipulation
// print to anywhere on page
// js-like interval system (to complement the above)
// math expression
// click to execute commands /
// i18n

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
	ver			: GM_info.script.version || 'v0.4.2',
	infoURL		: 'https://github.com/mfaizsyahmi/mfs-js-console/',
	helpURL		: 'https://github.com/mfaizsyahmi/mfs-js-console/wiki/Commands',
	togglekey	: '`',
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
		audio: /.(mp3|ogg|wav)(\?|#|$)/i,
		timedbatch: /^(\d*)\b(.*)$/m
	},
	hist : [],
	imgDlQueue: [],
	imgDlTimeoutID: 0,
	parseQueue: [],
	parseTimeoutID: 0,
	//global: false, // should be public
	//globalPosterRef: null;
	printcache: [],
	//initOnPageLoad: false // should be public
};

// public vars (editable from command)
mfs.c.vars = JSON.parse(GM_getValue('vars',JSON.stringify({
	ajaxUseWhateverOrigin: false, // used to force-enable CORS
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
})));

// container for aliases
mfs.c.aliases = JSON.parse(GM_getValue('aliases', '{}'));

// just a list of commands directly interpreted by parser
mfs.c.cmdlist = ['echo', 'echomd', 'clear', 'cls', 'clc', 'help', 'reload', 'resetvar', 'savevar', 'rem'];
// container for custom commands
mfs.c.addCmdTable = {}; // internal container, always nitialize
//mfs.c.customCommands = mfs.c.customCommands || []; // external


// PARSE ROUTINE
mfs.c.parse = function(s, batch) {
	// echo. suppress if batch
	if (!batch && mfs.c.vars.echo) {mfs.c.print(s, 1);}
	
	// add to datalist (MRU list)
	// note: Do this BEFORE varsubst!
	if (!batch && mfs.c.vars.mru && mfs.c.state.hist.indexOf(s)==-1) {
		mfs.c.state.hist.push(s);
		var opt = document.createElement('option'),
		t = document.createTextNode(s);
		opt.appendChild(t);
		mfs.c.histDOM.appendChild(opt);
	}
	
	// substitute variables
	var sp = (mfs.c.vars['cmd_varsubst'])? mfs.c.varSubst(s) : s;
	//sp = (mfs.c.vars['cmd_escape'])? mfs.c.util.typeEscape(sp):sp;
	sp = sp.trim();
	
	// parse command and args
	var cmd = sp.trim();
	var args = '';
	var argsObj = {};
	if(sp.indexOf(' ')>0) {
		cmd = sp.substr(0,sp.indexOf(' ')).trim().toLowerCase();
		args = sp.substr(sp.indexOf(' ')+1);
		argsObj = mfs.c.argObj(args);
		argsObj.commandName = cmd; // adds the original command name as a property
	}
	
	// start executing commands
	switch(cmd) {
		case 'rem': // batch rem, do nothing
			break;
		case 'echomd': // echo with partial markdown syntax support (for adding links)
			args = mfs.c.util.markdown(args); // moved
			// fall through to the next command, the normal echo
		case 'echo':
			mfs.c.print(args,2);
			break;
		case 'echocr': // removes last line (simulates carriage return)
			mfs.c.output.lastElementChild.remove();
			break;
		case 'clear':
		case 'cls':
		case 'clc':
			if (argsObj.textonly) {
				Array.prototype.forEach.call(mfs.c.output.querySelectorAll('.lnoutput'), function nodeRemoveSelf(node) {
					node.parentNode.removeChild( node );
				}); // stackoverflow.com/a/13125840
			} else { mfs.c.output.innerHTML=''}
			break;
		case 'debug': // test the argObj parser
			console.log(argsObj);
			mfs.c.print( JSON.stringify(argsObj) ); 
			break;
		case 'reload': // reload page
			location.reload();
			break;
		case 'open': // open new url
			if (argsObj.hasOwnProperty('0')) {
				location.assign(argsObj[0]);
			}
			break;
		case 'opentab': // open in new tab
			var opencount = 0; // hard limiter
			for(var n in argsObj) {
				if (argsObj.hasOwnProperty(n) && !isNaN(n) && opencount<10) {
					GM_openInTab(argsObj[n]);
					opencount++;
				}
			}
			break;
		case 'help': // list all commands
			var li = [].slice.call(mfs.c.cmdlist);
			for (let key in mfs.c.cmdTable) {
				if(mfs.c.cmdTable.hasOwnProperty(key)) li.push(key);
			}
			for (let key in mfs.c.addCmdTable) {
				if(mfs.c.addCmdTable.hasOwnProperty(key)) li.push(key + '*');
			}
			li.sort();
			mfs.c.print(li.join( argsObj.s ? '  ': '\n'));
			mfs.c.print('* Custom command')
			if (mfs.c.state.hasOwnProperty('helpURL')) {
				mfs.c.fprint('Check out the <a href="$1" target="_blank">wiki page on Github</a>',[mfs.c.state.helpURL],3)
			}
			break;
		case 'savevar': // commit vars to localstorage
			GM_setValue('vars',JSON.stringify(mfs.c.vars));
			if (!argsObj.noalias) GM_setValue('aliases', JSON.stringify(mfs.c.aliases) ); // save
			mfs.c.print('Saved',3); 
			break;
		case 'resetvar': // reset var in localstorage
			GM_setValue('vars', undefined);
			if (!argsObj.noalias) GM_setValue('aliases', undefined); // save
			mfs.c.print('Vars and aliases reset. Reload to take effect.',3); 
			break;
		case "global": // turns global mode on/off
			mfs.c.vars.global = isNaN(argsObj[0])? 0 : Number(argsObj[0]) || 0;
			mfs.c.globalSetup(mfs.c.vars.global);
			break;
			
		default:
			var done = false;
			
			// lookup command table
			for(var key in mfs.c.cmdTable) {
				if(mfs.c.cmdTable.hasOwnProperty(key) && cmd==key) {
					mfs.c.cmdTable[key](argsObj);
					done=true;
					break;
				}
			}
			
			// additional commands
			if (!done && mfs.c.addCmdTable) {
				// goes through additional command list
				for(var key in mfs.c.addCmdTable) {
					if(mfs.c.addCmdTable.hasOwnProperty(key) && cmd===key) {
						mfs.c.addCmdTable[key](argsObj);
						done=true;
						break;
					}
				}
			}
			
			// aliases
			if (!done && mfs.c.aliases && mfs.c.aliases.hasOwnProperty(cmd)) { // parse alias
				console.log('found alias: ' + cmd);
				// prepare array of commands
				var cmdlist = mfs.c.aliases[cmd].split(';');
				
				// substitute arguments into command array NOW
				for (var aj = 0; aj < cmdlist.length; aj++) {
					cmdlist[aj] = mfs.c.util.txtfmt(cmdlist[aj], argsObj);
				}
				
				// pass array to parseBatch for further, *proper* processing
				mfs.c.parseBatch(cmdlist, true);
				done = true;
			}
			
			//if (!done) mfs.c.print('Unknown command: '+cmd,5);
			if (!done) mfs.c.print(`Unknown command: ${cmd}`,5);
	}
	
	// chaining
	if (batch && mfs.c.vars.cmd_chain && mfs.c.state.parseQueue.length) {
		mfs.c.state.parseQueue.shift();
		mfs.c.processParseQueue();
	}
};

// batch parsing
// NOTE: special rule for alias commands - current command 
//       (ought to be an alias cmd at idx 0) should be removed and replaced with the new commands
mfs.c.parseBatch = function(cmdArray, alias) {
	if (!cmdArray || !cmdArray.length) return;
	
	if (mfs.c.vars.cmd_chain && alias) { // special alias processing
		mfs.c.state.parseQueue.shift();
		mfs.c.state.parseQueue = [].concat(cmdArray, mfs.c.state.parseQueue);
		mfs.c.processParseQueue();
	} else if (mfs.c.vars.cmd_chain) { // chained
		mfs.c.state.parseQueue = mfs.c.state.parseQueue.concat(cmdArray);
		//console.log(mfs.c.state.parseQueue)
		mfs.c.processParseQueue();
		
	} else { // non-chaining, timeout all at once
		for(var i=0; i<cmdArray.length; i++) {
			setTimeout( function parseTimeoutFn(s) { 
				mfs.c.parse(s,true);
			}, 0, cmdArray[i]);
		}
	}
}

mfs.c.processParseQueue = function () {
	if (!mfs.c.state.parseQueue.length) {
		mfs.c.state.parseTimeoutID = 0;
		return;
	} else if (mfs.c.state.parseQueue.length>1000) {
		console.log('WARNING: too many queued commands!!');
		return;
	}
	
	mfs.c.state.parseTimeoutID = setTimeout( function parseQueueFn(s){
		console.log(`parsing queued command: ${s}`)
		mfs.c.parse(s, true);
		//mfs.c.state.parseQueue.shift();
	}(mfs.c.state.parseQueue[0]), 0);
}

// moved out from "exec" command
mfs.c.parseTimedBatch = function (s) {
	var lines = s.split('\n');
	var rgx = mfs.c.state.regex.timedbatch || /^(\d*)\b(.*)$/m;
	var m; // match array
	var t; // timestamp
	var s; // command string
	var tout=[]; // array for timeouts
	var cmdlist=[]; // list of commands
	
	for (var i = 0; i < lines.length; i++) {
		m = rgx.exec(lines[i]);
		if (!m) continue;
		t = Number(m[1])||0; // timecode
		s = m[2].trim();     // the rest of the command
		s = s.split('//')[0];// rmv comments
		if (t > 0) { // timed, set timeout 
			tout.push( setTimeout(function(s){mfs.c.parse(s,true);},t,s));
		} else if (s) { // non-timed & non-empty, put in list
			cmdlist.push(s);
		}
	}
	// pass cmdlist to batch parser 
	if (cmdlist.length) mfs.c.parseBatch(cmdlist) 
}

// argument object constructor - the keystone of the script
mfs.c.argObj = function (args) {
	if(args.length==0) return {};
	
	const pattern = /*mfs.c.state.regex.argx ||*/ /(?:^|\s+)(?:(['"])(.*?)\1|([\S]+|\d+))/g;
	var match;
	// [0]: whole match
	// [1]: quotes. don't use
	// [2]: text inside quotes
	// [3]: normal text including switch
	const mStr = (match) => match[3] || match[2];
	const mKey = (match) => match[3].substr(0,1) == '-' && isNaN(match[3].substr(1,1));
	
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

mfs.c.varSubst = function (s) {
	// gets a copy of the vars JSON object
	var varObj = JSON.parse(JSON.stringify(mfs.c.vars));
	
	// initialize other stuff
	var now = new Date();
	
	// adds special dynamic vars
	varObj.location = varObj.location || location.href;
	varObj.fulldate = varObj.fulldate || now.toString();
	varObj.date = varObj.date || now.toDateString();
	varObj.time = varObj.time || now.toTimeString();
	varObj.ver = varObj.ver || mfs.c.state.ver;
	
	// go and subst
	s = mfs.c.util.txtfmt2(s, varObj);
	return s;
}

// PRINT ROUTINE
// s: the string to print
// type: see the var typedef below
// htmlescape: whether to escape html (certain commands prints html fragments)
// fromGlobal: if true, do not propagate
mfs.c.print = function(s, type, htmlescape, fromGlobal) {
	const typedef = { // type definition
		0: 'normal',
		1: 'input',
		2: 'textdump',
		3: 'info',
		4: 'warn',
		5: 'error',
		6: 'important'
	};
	var blackliststr = mfs.c.vars.blacklist || "";
	var blacklist = blackliststr.split("|");
	var now = new Date();
	
	if (typeof type === 'undefined') type = 0;
	stype = typedef.hasOwnProperty(type) ? typedef[type] : 'normal';
	var oel = document.createElement('span');
	oel.className="lnoutput " + stype;
	oel.dataset.timestamp = now.toUTCString();
	oel.dataset.timetext = now.toLocaleTimeString();
	lines = s.replace(/\t/g,'    ').split('\n');
	
	if (htmlescape) {
		for (var i=0; i<lines.length; i++) {
			for (var j=0; j<blacklist.length; j++) {
				lines[i] = lines[i].replace(blacklist[j], "¦".repeat(blacklist[j].length) );
			}
			oel.appendChild(document.createTextNode(lines[i]));
			oel.appendChild(document.createElement('br'));
		}
	} else { oel.innerHTML+=lines.join('<br/>'); }
	mfs.c.output.appendChild(oel);
	
	// scroll to element (FF only!)
	oel.scrollIntoView();
	
	if ( mfs.c.util.isGlobalPoster() && !fromGlobal ) {
		console.log('adding item to printcache here...')
		var now = new Date(),
			jsonow = now.toJSON(),
			data = {
				"time": jsonow,
				"s": s,
				"type": type,
				"htmlescape": htmlescape
			};
		mfs.c.state.printcache.push(data);
		console.log(mfs.c.state.printcache);
	}
};
mfs.c.fprint=function(s,args,type) {
	mfs.c.print( mfs.c.util.txtfmt(s,args), type);
};


// COMMAND ADD-IN PARSER SUB
// custom cmds in a object array
// format: [{name:string, fn: function(){}},...]
mfs.c.parseAddCmds = function() {
	if (!mfs.c.customCommands.length) return;
	var list = mfs.c.customCommands,		
		tbl = mfs.c.addCmdTable;
	for (var i=0; i< list.length; i++) {
		if(typeof list[i]!= 'object' || typeof list[i].name != 'string' || typeof list[i].fn != 'function') {
			mfs.c.print('Error: Invalid data type for custom command list item #' +i, 5);
		} else if (tbl[ list[i].name ]) {
			mfs.c.print('Error: Custom command of that name already exists! item #' + i,5);
		} else {
			tbl[ list[i].name ] = list[i].fn;
		}
	}
}

// GLOBAL system
mfs.c.globalFocus = function () {
	// on focus, set the global poster ref, and get the stored printcache
	if ( mfs.c.vars.global && document.visibilityState === 'visible') {
		GM_setValue('globalPosterRef', location.href);
		mfs.c.state.printcache = JSON.parse(GM_getValue('printcache','[]'));
	}
}

mfs.c.globalInterval = function () {
	var now = new Date();
	if (mfs.c.util.isGlobalPoster()) { // is poster?
		var activecache = mfs.c.state.printcache || [];
		
		// poster is in charge of clearing the print cache
		for (var i=activecache.length-1; i>=0; i--) {
			var printtime = new Date(activecache[i].time)
			if (now - printtime > 10000) { // past 10 seconds
				activecache.splice(i,1); // remove
			}
		}
		GM_setValue('printcache', JSON.stringify(activecache) );
		//console.log(location.href, activecache);
		
	} else { // listener
		var listencache = JSON.parse(GM_getValue('printcache','[]'));
		var owncache = mfs.c.state.printcache;
		
		// see if there's new stuff cached
		for (var i = 0; i < listencache.length; i++) {
			var data = listencache[i];
			if (owncache.findIndex(function(item){
				return item.time === data.time
			}) < 0 ) { // if item in listencache doesn't exist in owncache
				mfs.c.print(data.s, data.type, data.htmlescape);
				owncache.push(data);
			}
		}
		//console.log(location.href, listencache);
	}
}

mfs.c.globalSetup = function (val = false) {
	if (val) {
		// listen for focus
		document.addEventListener('visibilitychange', function visChange(e) {mfs.c.globalFocus() } );
		mfs.c.globalIntervalID = setInterval( function globalIntervalFn() {mfs.c.globalInterval() }, Number(mfs.c.vars.globalInterval)||1000 );
		mfs.c.globalFocus(); // assume page that runs this is in focus
		mfs.c.print('Global mode enabled', 3);
	} else {
		document.removeEventListener('visibilitychange', function visChange(e) {mfs.c.globalFocus() } );
		clearInterval(mfs.c.globalIntervalID);
		mfs.c.print('Global mode disabled', 3);
	}
	
}


// MAIN INITIALIZATION ROUTINE
mfs.c.init = function () {
	// Stage 1: container and iframe first
	mfs.c.container = document.createElement('div');
	mfs.c.container.id = "mfs-c-container";
	
	mfs.c.frame = document.createElement('iframe');
	mfs.c.frame.id = 'mfs-c-frame';
	
	mfs.c.styleEl = document.createElement('style');
	mfs.c.styleEl.innerHTML = GM_getResourceText('containerStyle');
	
	// stage 2: inside the iframe
	mfs.c.frame.addEventListener('load', function consoleFrameLoad(e) {
		//var fbody = mfs.c.frame.contentDocument.body;
		
		mfs.c.input = mfs.c.frame.contentDocument.createElement('input');
		mfs.c.input.type = 'text';
		mfs.c.input.id   = 'mfs-c-input';
		mfs.c.histDOM = mfs.c.frame.contentDocument.createElement('datalist');
		mfs.c.histDOM.id = 'mfs-c-inputlist';
		mfs.c.input.setAttribute('list','mfs-c-inputlist');
	
		mfs.c.output = mfs.c.frame.contentDocument.createElement('div');
		mfs.c.output.id  = 'mfs-c-output';
	
		mfs.c.frameStyleEl = mfs.c.frame.contentDocument.createElement('style');
		mfs.c.frameStyleEl.innerHTML = GM_getResourceText('iframeStyle');
		
		mfs.c.frame.contentDocument.body.appendChild(mfs.c.input);
		mfs.c.frame.contentDocument.body.appendChild(mfs.c.histDOM);
		mfs.c.frame.contentDocument.body.appendChild(mfs.c.output);
		mfs.c.frame.contentDocument.head.appendChild(mfs.c.frameStyleEl);
		
		// add keypress event listener to the iframe
		mfs.c.frame.contentWindow.addEventListener('keypress', function consoleKeypress(e){
			// check if toggle key is pressed
			if(e.key===mfs.c.state.togglekey && e.ctrlKey==false) {
				mfs.c.state.visible=!mfs.c.state.visible;
				mfs.c.container.style.display = (mfs.c.state.visible) ? "block" : "none";
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
				
				e.preventDefault();
			}

			// now check if user presses enter
			if (mfs.c.input.value.length==0) return false;
			if (e.key=="Enter" || e.key=="Return") {
				mfs.c.parse(mfs.c.input.value);
				mfs.c.input.value="";
			} else if (e.key=="Escape") {
				mfs.c.input.value="";
			}
		});
		
		mfs.c.output.addEventListener('click', function consoleClick(e) {
			var t = e.target;
			while (t != mfs.c.output) { // traverse the DOM
				//t.className.match(/\binput\b/ig)
				if (t.classList.contains('input')) {
					mfs.c.input.value = t.innerText;
					return;
				} else if (t.classList.contains('cmd')) {
					var cmdlist = t.dataset.cmd.split(';');
					mfs.c.parseBatch(cmdlist);
					return;
				} else {t = t.parentNode;}
			}
		});
		
		mfs.c.print([mfs.c.state.title, mfs.c.state.ver].join(' '));
		mfs.c.cmd.time({});
		// run autoexec
		var autoexec = GM_getValue('autoexec') || GM_getResourceText('autoexec');
		if (autoexec) mfs.c.parseTimedBatch(autoexec);
		
		mfs.c.state.loaded = true;
		console.log('mfs js console loaded');
		if(mfs.c.state.visible) mfs.c.input.focus();
	});	
	
	// append everything into place
	mfs.c.container.appendChild(mfs.c.frame);
	document.body.appendChild(mfs.c.container);
	document.head.appendChild(mfs.c.styleEl);
	mfs.c.container.style.display="none";
	
	// some other subs to call
	mfs.c.parseAddCmds();
	if (mfs.c.vars.global) {mfs.c.globalSetup(mfs.c.vars.global);}
};

// listen for toggle key on parent page
document.addEventListener('keypress', function pageKeypress(e) {
	if (e.key!==mfs.c.state.togglekey || e.ctrlKey) {
		//fires just the togglekey without the ctrl
		// idk how to make this work :(
		var raised = new KeyboardEvent('keypress', {key:'`'});
		document.activeElement.dispatchEvent(raised);
		return;
	}
	e.preventDefault();
	
	if (!mfs.c.state.loaded) {
		mfs.c.init();
		// mfs.c.parseAddCmds();
	}
	
	mfs.c.state.visible=!mfs.c.state.visible;
	mfs.c.container.style.display = (mfs.c.state.visible) ? "block" : "none";
	if(mfs.c.state.visible) mfs.c.input.focus();
});

if (mfs.c.vars.initOnPageLoad) {mfs.c.init();}

//if (mfs.c.util) {console.log('util module is loaded')}
//if (mfs.c.cmd) {console.log('cmd module is loaded')}
//console.log('mfs js console - loaded:', (mfs.c.util)?'util':'', (mfs.c.cmd)?'cmd':'');
