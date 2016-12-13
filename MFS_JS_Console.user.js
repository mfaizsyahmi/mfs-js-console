// ==UserScript==
// @name        MFS JS Console
// @namespace   mfsfareast
// @description Something silly
// @include     *
// @version     0.2
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @grant       GM_xmlhttpRequest
// @grant       GM_getResourceText
// @require     util.js
// @require     cmds.js
// @require     addCmds.js
// @resource    containerStyle	https://github.com/mfaizsyahmi/mfs-js-console/raw/master/container.css
// @resource    iframeStyle		https://github.com/mfaizsyahmi/mfs-js-console/raw/master/iframe.css
// ==/UserScript==

// TO DO:
// - Use iframe container
// - implement printcache for globals
// - aliases


// DEBUG
/*
function GM_getValue(sth,def) {return def;}
function GM_setValue(varname, value) {}
function GM_getResourceText() {}
*/
// GM_deleteValue('vars'); 
//GM_deleteValue('globalPosterRef')
//GM_deleteValue('aliases');

//if (typeof unsafeWindow != 'undefined') window = unsafeWindow;

//namespaces
mfs = this.mfs || {};
mfs.c = mfs.c || {};

// private states
mfs.c.state = mfs.c.state || {
	init		: false, // initialized?
	visible		: false,
	title		: 'MFS Javascript Console',
	ver			: 'v0.2',
	togglekey	: '`',
	regex: {
		arg: /(^|\s)("([^"]*)"|-*[^\s]*)/g,
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
	global: false, // should be public
	//globalPosterRef: null;
	printcache: [],
	initOnPageLoad: false // should be public
};

// public vars (editable from command)
mfs.c.vars = JSON.parse(GM_getValue('vars',JSON.stringify({
	echo: 1,
	mru: 1,
	imgDlType: 'image/jpeg',
	imgDlDelay: 500,
	'genlinks-anyname': true,
	initOnPageLoad: false,
	global: false,
	cmd_varsubst: false,
	cmd_chain: false
})));

// container for aliases
mfs.c.aliases = JSON.parse(GM_getValue('aliases',"{}"));


// just a list of commands directly interpreted by parser
mfs.c.cmdlist=['echo','clear','cls','clc','help','reload','savevar','rem'];
// container for custom commands
mfs.c.addCmdTable = {}; // internal container, always nitialize
//mfs.c.customCommands = mfs.c.customCommands || []; // external


// PARSE ROUTINE
mfs.c.parse = function(s, batch) {
	// echo. suppress if batch
	if(!batch && mfs.c.vars.echo) {mfs.c.print(s,1);}
	// substitute variables
	if (mfs.c.vars['cmd_varsubst']) { s = mfs.c.util.txtfmt2(s, mfs.c.vars) }
	
	// parse command and args
	var cmd=s.trim(),
		args='',
		argsObj={};
	if(s.indexOf(' ')>0) {
		cmd = s.substr(0,s.indexOf(' ')).trim().toLowerCase();
		args = s.substr(s.indexOf(' ')+1);
		argsObj = mfs.c.argObj(args);
	}
	
	// start executing commands
	switch(cmd) {
		case 'rem': // batch rem, do nothing
			break;
		case 'echo':
			mfs.c.print(args,2);
			break;
		case 'clear':
		case 'cls':
		case 'clc':
			if (argsObj.textonly) {
				Array.prototype.forEach.call(document.querySelectorAll('.lnoutput'), function( node ) {
					node.parentNode.removeChild( node );
				}); // stackoverflow.com/a/13125840
			} else { mfs.c.output.innerHTML='';}
			break;
		case 'debug': // test the argObj parser
			console.log(argsObj);
			mfs.c.print( JSON.stringify(argsObj) ); 
			break;
		case 'reload':
			location.reload();
			break;
		case 'help':
			var li=[].slice.call(mfs.c.cmdlist);
			for (var key in mfs.c.cmdTable) {
				if(mfs.c.cmdTable.hasOwnProperty(key)) li.push(key);
			}
			for (var key in mfs.c.addCmdTable) {
				if(mfs.c.addCmdTable.hasOwnProperty(key)) li.push(key);
			}
			li.sort();
			mfs.c.print(li.join('\n'));
			break;
		//case 'var':
			//break;
		case 'savevar':
			GM_setValue('vars',JSON.stringify(mfs.c.vars));
			mfs.c.print('Saved',3); 
			break;
			
		default:
			var done=false;
			
			// lookup command table
			for(var key in mfs.c.cmdTable) {
				if(cmd==key) {
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
			if (!done && mfs.c.aliases.hasOwnProperty(cmd)) { // parse alias
				console.log('found alias');
				var cmdlist = mfs.c.aliases[cmd].split(';');
				
				if (mfs.c.vars.cmd_chain) { // chained
					mfs.c.state.parseQueue.push(cmdlist);
					mfs.c.util.parseQueue(cmdlist[0],argsObj);
				} else { // non-chaining, timeout all at same time
					for(var aidx=0; aidx<cmdlist.length; aidx++) {
						setTimeout( function(s, argsObj) {
							mfs.c.parse( mfs.c.util.txtfmt(s, argsObj), true )
						}(cmdlist[aidx],argsObj), 0);
					}
				}
				done=true;
			}
			
			if (!done) mfs.c.print('Unknown command: '+cmd,5);
	}
	
	// add to datalist (MRU list)
	if(!batch && mfs.c.vars.mru && mfs.c.state.hist.indexOf(s)==-1) {
		mfs.c.state.hist.push(s);
		var opt = document.createElement('option'),
			t = document.createTextNode(s);
		opt.appendChild(t);
		mfs.c.histDOM.appendChild(opt);
	}
	
	// chaining
	if (batch && mfs.c.vars.cmd_chain && mfs.c.state.parseQueue.length) {
		mfs.c.state.parseQueue.shift();
		/*if (mfs.c.state.parseQueue.length) {
			mfs.c.state.parseTimeoutID = setTimeout( function(s) {
				mfs.c.parse(s,true)
			}(mfs.c.state.parseQueue[0]), 0)
		}*/
		mfs.c.util.parseQueue(s, argsObj);
	}
};
mfs.c.argObj = function(args) {
	if(args.length==0) return {};
	
	//split arguments keyvalue object
	var o={}, m,i=0,c=0,expectValue=false;
	
	var t= mfs.c.state.regex.arg || /(^|\s)("([^"]*)"|-*[^\s]*)/g;
	while(m = t.exec(args)) {
		if(expectValue && m[2].substr(0,1)=='-') {
			//prev is switch
			o[key]=true;
		}
		if (m[2].substr(0,1)=='-') {
			//key, keep and look forward to value
			key=m[2].substr(1);
			expectValue=true;
		} else if (expectValue) {
			// value of keyvalue pair
			o[key]=m[3]||m[2];
			expectValue=false;
		} else {
			// regular arguments
			o[i]=m[3]||m[2];
			i++;
		}
		c++;
		if(c>100)break; // loop hell prevention
	}
	if (expectValue) o[key]=true; // when loop has ended but still expecting value, treat key as switch
	//o['_n']=i;
	return o;
};

// PRINT ROUTINE
// s: the string to print
// type: see the var typedef below
// htmlescape: whether to escape html (certain commands prints html fragments)
// fromGlobal: if true, do not propagate
mfs.c.print = function(s, type, htmlescape, fromGlobal) {
	var typedef = { // type definition
		0: 'normal',
		1: 'input',
		2: 'textdump',
		3: 'info',
		4: 'warn',
		5: 'error',
		6: 'important'
	};
	var blackliststr = mfs.c.vars.blacklist || "",
		blacklist = blackliststr.split(),
		now = new Date();
	
	if (typeof type === 'undefined') type = 0;
	stype = typedef.hasOwnProperty(type)? typedef[type] : 'normal';
	var oel = document.createElement('span');
	oel.className="lnoutput " + stype;
	oel.dataset.timestamp = now.toUTCString();
	oel.dataset.timetext = now.toLocaleTimeString();
	lines = s.replace(/\t/g,'    ').split('\n');
	
	if(htmlescape) {
		for(var i=0; i<lines.length; i++) {
			for(var j=0; j<blacklist.length; j++) {
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
		var now = new Date();
		mfs.c.state.printcache.push({
			time: now.toJSON(),
			s: s,
			type: type,
			htmlescape: htmlescape
		})
	}
};
mfs.c.fprint=function(s,args,type) {
	mfs.c.print(mfs.c.util.txtfmt(s,args),type);
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
	console.log(tbl)
}

// register individual cmds
// typename: name of command as typed on console
// objname : key name in table
/*mfs.c.addCmd = function(typename, objname, fn) {
	if(mfs.c.addCmdTable[objname]) {
		mfs.c.print('Error: Command of that name already exists!',5);
	} else {
		mfs.c.addCmd[objname] = fn; // fn container
		mfs.c.addCmdTable[typename] = mfs.c.addCmd[objname]; // name lookup table
	}
};
mfs.c.rmvCmd = function(objname) {
	//
};
*/

// GLOBAL system
mfs.c.globalFocus = function(e) {
	// on focus, set the global poster ref, and get the stored printcache
	if ( mfs.c.vars.global ) {
		GM_setValue('globalPosterRef', location.href);
		mfs.c.state.printcache = GM_getValue('printcache')
	}
}
mfs.c.globalInterval = function() {
	var now = new Date();
	if( mfs.c.util.isGlobalPoster() ) { // is poster?
		var activecache = mfs.c.state.printcache;
		
		// poster is in charge of clearing the print cache
		for(var i=activecache.length-1; i>=0; i--) {
			var printtime = new Date(activecache[i].time)
			if (now - printtime > 10000) { // past 10 seconds
				activecache.splice(i,1); // remove
			}
		}
		GM_setValue('printcache', JSON.stringify(activecache) );
		
	} else { // listener
		var activecache = GM_getValue('printcache',[]);
		
		// see if there's new stuff cached
		for(var i=activecache.length-1; i>=0; i--) {
			var printtime = new Date(activecache[i].time)
			if (now - printtime < 0) { // past 10 seconds
				mfs.c.print(activecache[i].s, activecache[i].type, activecache[i].htmlescape)
			}
		}
	}
}

mfs.c.globalSetup = function(val) {
	if(val) {
		// listen for focus
		document.addEventListener('focus', mfs.c.globalFocus(e) );
		mfs.c.globalIntervalID = setInterval( function() {mfs.c.globalInterval() }, 500 )
	} else {
		document.removeEventListener('focus', mfs.c.globalFocus(e) );
		clearInterval(mfs.c.globalIntervalID)
	}
	
}


// MAIN INITIALIZATION ROUTINE
mfs.c.init = function() {
	// Stage 1: container and iframe first
	mfs.c.container = document.createElement('div');
	mfs.c.container.id = "mfs-c-container";
	//mfs.c.container.style.overflow = 'auto';
	//mfs.c.container.style.resize = 'both';
	//mfs.c.container.style.display = 'none'
	
	mfs.c.frame = document.createElement('iframe');
	mfs.c.frame.id = 'mfs-c-frame';
	
	
	mfs.c.styleEl = document.createElement('style');
	mfs.c.styleEl.innerHTML = GM_getResourceText('containerStyle');
	
	// stage 2: inside the iframe
	mfs.c.frame.addEventListener('load', function (e) {
		console.log('iframe is loading...')
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
		mfs.c.frame.contentWindow.addEventListener('keypress', function(e){
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
		
		mfs.c.output.addEventListener('click',function(e){
			var t = e.target;
			while(t!=mfs.c.output){
				if(t.className.match(/\binput\b/ig)) {
					mfs.c.input.value=t.innerText;
					return;
				} else {t = t.parentNode;}
			}
		});
		console.log('checkpoint listen');
		
		mfs.c.print([mfs.c.state.title, mfs.c.state.ver].join(' '));
		mfs.c.cmd.time({});
		
		mfs.c.state.loaded=true;
		console.log('mfs js console loaded');
		if(mfs.c.state.visible) mfs.c.input.focus();
	});	
	
	// append everything into place
	mfs.c.container.appendChild(mfs.c.frame);
	document.body.appendChild(mfs.c.container);
	document.head.appendChild(mfs.c.styleEl);
	mfs.c.container.style.display="none";
	
};

// listen for toggle key on parent page
document.addEventListener('keypress',function(e) {
	if(e.key!==mfs.c.state.togglekey || e.ctrlKey) return false;
	e.preventDefault();
	
	if (!mfs.c.state.loaded) {
		mfs.c.init();
		mfs.c.parseAddCmds();
	}
	
	mfs.c.state.visible=!mfs.c.state.visible;
	mfs.c.container.style.display = (mfs.c.state.visible) ? "block" : "none";
	if(mfs.c.state.visible) mfs.c.input.focus();
});

if (mfs.c.vars.initOnPageLoad) {mfs.c.init();}

if (mfs.c.util) {console.log('util module is loaded')}
if (mfs.c.cmd) {console.log('cmd module is loaded')}
console.log('mfs js console - end of file');