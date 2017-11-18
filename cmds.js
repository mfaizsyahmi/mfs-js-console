// BUILT-IN COMMANDS
mfs = this.mfs || {};
mfs.c = mfs.c || {};
mfs.c.cmd = mfs.c.cmd||{};

// null command, does nothing
mfs.c.cmd.null = function() {}; // sinkhole

// TIME command
// arguments:
//  ISO 
mfs.c.cmd.time = function(argObj) {
	var now = new Date();
	var s;
	if (argObj.iso||argObj.ISO) { s = now.toISOString() }
	else if (argObj.t) { s = now.toTimeString() }
	else if (argObj.d) { s = now.toDateString() }
	else if (argObj.utc||argObj.UTC) { s = now.toUTCString() }
	else { s = now.toString() }
	
	mfs.c.util.outputVarOrPrint(argObj, s);
};

// LIST IMAGE from current doc or a specified url
// arguments:-
//  [0]: url to html page 
//  w, W: min/max width
//  h, H: min/max height
//  short: output short format
//  dims: show dimensions in output
//  thumb: output as thumbnails
mfs.c.cmd.listimg = function(args) {
	let outToVar = !!(args.outputvar || args.o);
	// main function, called as callback to ajax later in this fn
	let listimgCallback = function(docObj, args) {
		let o = [];
		let domlist = docObj.getElementsByTagName('img');
		let imgarray = [].slice.call(domlist);
		if (!outToVar) mfs.c.print(docObj.title + ' - ' + imgarray.length + ' images:');
		for(let i = 0; i < imgarray.length; i++) {	
			//filter properties
			if (imgarray[i].width < args.w || imgarray[i].width > args.W) continue;
			if (imgarray[i].height < args.h || imgarray[i].height > args.H) continue;
			
			var src = imgarray[i].dataset.src || imgarray[i].src; //lazyload support
			var s = mfs.c.state.regex.filename.exec(src);
			s = (!s || !args['short'])? src : s;
			var dims = (args.dims)? ' (' + imgarray[i].width + 'x' + imgarray[i].height +')' : '';
			
			// add to array
			if (outToVar) {
				o.push(src);
			} else if (args.thumb) {
				o.push('<span class="lnoutput mfs-c-gallery">' +(i+1)+ ': <a href="' +src+ '" title="' +src+ '" target="_blank"><img src="' +src+ '" style="max-width:150px"/></a></span>');
			} else {
				o.push('<span class="lnoutput normal">' +(i+1)+ ': <a href="' +src+ '" title="' +src+ '" target="_blank">' +s+ '</a>' +dims+ '</span>');
			}
		}
		if (outToVar) {
			mfs.c.util.outputVarOrPrint(args, o);
		} else {
			mfs.c.output.innerHTML += o.join('');
		}
	};
	
	// Async ajax layer for imglist. Allows ajax load of another document uri on which imglist is performed
	if(args[0]) {
		mfs.c.util.ajax(args[0], (r) => {
			if(r.status===200) {
				listimgCallback(r.responseXML, args);
			} else {
				mfs.c.print('Error loading ' + args[0] + ' : ' + r.status,5);
			}
		}, {responseType:'document'});
	} else {
		listimgCallback(document, args);
	}
};


mfs.c.cmd.dlimg = function(args) {
	if (args.clear) { // clear the queue
		mfs.c.state.imgDlQueue = [];
		clearTimeout(mfs.c.state.imgDlTimeoutID);
		mfs.c.state.imgDlTimeoutID = 0;
		mfs.c.print('cleared download queue',3);
		return 0;
	} else if (args.listqueue) { // list queue
		for(var i=0; i<mfs.c.state.imgDlQueue.length; i++) {
			mfs.c.print(mfs.c.state.imgDlQueue[i].src)
		}
	} else if (args[0]||args[1]||args[2]) { // download image from the provided url patter n and number range
		mfs.c.print('Downloading the specified images...');
		
		var s = args[0],
		numrange = [],
		rgx = /*mfs.c.state.regex.filename4 ||*/ /([^/\\&\?]+)(\.\w{3,4})(?=([\?&].*$|$))/,
		s = (mfs.c.vars["genlinks-anyname"])? s.replace(rgx, "$$1$2") : s;
		//console.log(sp);
		
		if (typeof args[3]!== 'undefined') { // more than three arguments, assume list of items
			for(var n in args) {
				if (args.hasOwnProperty(n) && !isNaN(args[n]) ) {
					numrange.push( Number( args[n] ) );
				}
			}
		} else { // three arguments or less, assume range
			var start = Number(args[1]) || 1,
				end  = Number(args[2])	|| 10;//,
				//d = (start < end)? 1 : -1;
			for(var i=start; i<=end; i++) {
				numrange.push(i);
			}
		}
		
		for(var i=0; i<=numrange.length; i++) {
			var imgEl= document.createElement('img');
			imgEl.src = s.replace('$1',numrange[i].toString().padStart(args.pad, '0'));
			imgarray.push(imgEl);
		}
		console.log(imgarray);
		
	} else if (args.selector) { // custom selector
		mfs.c.print('Downloading images from the given selector...');
		var imgarray = document.querySelectorAll(args.selector);
	} else { // no arguments, download images on the page
		mfs.c.print('Downloading images on this page...');
		//var domlist = document.getElementsByTagName('img')//[].slice.call(domlist)
		var imgarray = document.getElementsByTagName('img');
	}
	
	var checklist=[];
	var fileregex = mfs.c.state.regex.filename2 || /[^/\\&\?]+\.\w{3,4}(?=([\?&].*$|$))/g;
	for (var i=0; i<imgarray.length; i++) {	
		// discard improperly named resources (hopefully non-img tags too)
		if (fileregex.exec(imgarray[i].src)==null) continue;
		// filter properties
		if (imgarray[i].width<args["w"] || imgarray[i].width>args["W"]) continue;
		if (imgarray[i].height<args["h"] || imgarray[i].height>args["H"]) continue;
		if (checklist.indexOf(imgarray[i].src)>-1) continue;
		checklist.push(imgarray[i].src);
		mfs.c.state.imgDlQueue.push(imgarray[i]); //finalist
	}
	// call img dl queue worker
	mfs.c.util.processImgDlQueue();
};

// list all links on page
mfs.c.cmd.listlink = function(argObj) {
	// URL Filtering Stuff
	// -supported parts
	//  -for regexp append _rgx e.g. "pathname_rgx"
	const urlPropList = ["protocol", "hostname", "pathname", "search", "hash"];
	// -check if value string is in the form of regexp
	// (must still have the slashes)
	const regPattern = /\/(.+)\/([iu]*)/;
	// -holds the match value strings or regexps
	var matchObj = {};
	// -parse argument object for url filtering
	for(let a = 0; a < urlPropList.length; a++) {
		// string
		if (argObj[urlPropList[a]]) matchObj[urlPropList[a]] = argObj[urlPropList[a]];
		// regex. because pathnames can be confused with regex notations they use different sets of argument names
		if (argObj[urlPropList[a] + "_rgx"]) {
			let argMatch = regPattern.exec(argObj[urlPropList[a]+ "_rgx"]); // extract pattern and flag part
			if (argMatch) matchObj[urlPropList[a]] = new RegExp(argMatch[1], argMatch[2]);
		}
	}
	// special case for local hostname
	if (argObj.hostname === '.') matchObj.hostname = location.hostname;
	
	// ref to document object. opens up possibility for handling any ajaxed document
	var docObj = document;
	// select all link elements (exclude javascript)
	var domList = docObj.querySelectorAll('a:not([href^="javascript:"])[href]');
	var urlList = [];
	// iterate all link elements and filter
	domList.forEach( function(el) {
		let urlObj = new URL(el.href);
		let fail = false;
		for (let a in matchObj) {
			if (matchObj.hasOwnProperty(a)) {
				// try to fail match
				if (urlObj.protocol === "javascript:") {
					fail = true;
				} else if (typeof matchObj[a] === 'string' && matchObj[a] !== urlObj[a]) {
					fail = true;
				} else if (typeof matchObj[a].exec === 'function' && !matchObj[a].exec(urlObj[a])) {
					fail = true;
				}
			}
		}
		if (!fail) urlList.push(urlObj.href);
	});
	
	// report back
	if (argObj.outputvar || argObj.o) { // output to var
		mfs.c.util.outputVarOrPrint(argObj, urlList);
	} else { // output to console
		mfs.c.print(urlList.length + ' matching links on page');
		let printArray = [];
		let fmtLink = mfs.c.util.htmlLink; // shorthand
		
		// iterate URL array, print the links
		for(var i=0; i<urlList.length; i++) {
			if (argObj.short) {
				printArray.push(fmtLink(urlList[i], i+1));
			} else {
				printArray.push(`${i+1}: ${fmtLink(urlList[i])}`);
			}
		}
		mfs.c.print(printArray.join( (argObj.short) ? " " : "\n"));
	}
}

// AV - adds media to console output
mfs.c.cmd.av = function(argObj) {
	if(!argObj[0]) {
		mfs.c.print('Not enough arguments',5);
		return false;
	}
	
	var i=0,elemlist=[];
	while(argObj[i]) {
		url = argObj[i];
		if (url.match(/.(webm|mp4|ogv)$/ig)!==null) {
			elemlist[i] = document.createElement('video');
		} else if (url.match(/.(ogg|mp3|wav|flac)$/ig)!==null) {
			elemlist[i] = document.createElement('audio');
		}
		if(elemlist[i]!==undefined) {
			elemlist[i].controls=!argObj.nocontrols;
			elemlist[i].autoplay= argObj.autoplay;
			elemlist[i].loop    = argObj.loop;
			
			source=document.createElement('source');
			source.src=url;
			elemlist[i].appendChild(source);
			mfs.c.output.appendChild(elemlist[i]);
		}
		i++;
	}
	return elemlist;
};

/* genlinks - generate links with name ranging between two numbers
 * vars: genlinks-anyname - if true any filename will be accepted
 * args: short - output a terse format
 *       pad - well uh pad the numbers with zeroes
 */
mfs.c.cmd.genlinks = function(argObj) {
	if (!argObj[0]) {
		mfs.c.print('Not enough arguments',5);
		return false;
	}
	var s = argObj[0],
		numrange = [],
		rgx = /*mfs.c.state.regex.filename4 ||*/ /([^/\\&\?]+)(\.\w{3,4})(?=([\?&].*$|$))/,
		sp = (mfs.c.vars["genlinks-anyname"])? s.replace(rgx, "$$1$2") : s;
		//console.log(sp);
		
	if(typeof argObj[3]!== 'undefined') { // more than three arguments, assume list of items
		for(var n in argObj) {
			if (argObj.hasOwnProperty(n) && !isNaN(argObj[n]) ) {
				numrange.push( Number( argObj[n] ) );
			}
		}
	} else { // three arguments or less, assume range
		var start=Number(argObj[1]) || 1,
			end  =Number(argObj[2])	|| 10;
		for(var i=start; i<=end; i++) {
			numrange.push(i);
		}
	}
	
	var printStr = "";
	var numStr;
	for(var i=0; i<numrange.length; i++) {
		if (i) printStr += (argObj.short)? " " : "\n";
		numStr = numrange[i].toString().padStart(argObj.pad, '0');
		printStr += mfs.c.util.htmlLink(sp.replace('$1', numStr), (argObj.short)? numStr: undefined);
	}
	mfs.c.print(printStr);
};

// TYPE - print contents of text file
// arguments:
// [0] url to text
// outputvar, o: put the text to this var
mfs.c.cmd.type = function(argObj) {
	if (!argObj[0]) {
		mfs.c.print('Not enough arguments',5);
		return false;
	}
	mfs.c.util.ajax(argObj[0],function(r){
		if(r.status==200) {
			var s = decodeURI(encodeURI(r.responseText));
			
			mfs.c.util.outputVarOrPrint(argObj, s);
		} else {
			mfs.c.print('Error loading ' +argObj[0]+ ' : ' +r.status+ ' - ' +r.statusText,5);
		}
	});
};

// EXEC - batch file parsing with timestamp support
mfs.c.cmd.exec = function(argObj) {
	if (!argObj[0]) {
		mfs.c.print('Not enough arguments',5);
		return false;
	}
	mfs.c.util.ajax(argObj[0], function(r){
		if(r.status==200) {
			mfs.c.parseTimedBatch(r.responseText)
		} else {
			mfs.c.print('Error loading ' + argObj[0] + ' : ' + r.status, 5);
		}
	});
};

// alias - register an alias
// args: [0] - alias name
//       [1] - string of commands
mfs.c.cmd.alias = function(argObj) {
	if (!argObj[0]) { // print list of aliases 
		var alist = [];
		for (var a in mfs.c.aliases) {
			if (mfs.c.aliases.hasOwnProperty(a)) { alist.push( [a, '"' + mfs.c.aliases[a] +'"' ].join(': ') ) }
		}
		alist.sort();
		var count = alist.length || 0;
		mfs.c.fprint('$1 aliases in total', [count.toString()], 3);
		if (alist.length) { mfs.c.print( alist.join('\n') ); }
		
	} else if (!argObj[1] || (argObj.hasOwnProperty('commandName') && argObj.commandName==='unalias') ) { // remove alias
		if (mfs.c.aliases.hasOwnProperty(argObj[0]) ) {delete mfs.c.aliases[ argObj[0] ];}
		mfs.c.print('Cleared alias. "savevar" to make permanent.',3);
		
	} else if (argObj[1]) { // add alias
		//if (mfs.c.cmdTable.hasOwnProperty(argObj[0]) || mfs.c.addCmdTable.hasOwnProperty(argObj[0]) ) {
		//	mfs.c.print('Created/updated alias. "savevar" to make permanent.',3);
		//} else {
			mfs.c.aliases[ argObj[0] ] = argObj[1]; // always override existing aliases
			mfs.c.print('Created/updated alias. "savevar" to make permanent.',3);
		//}
	}
};

// VAR - moved here after it expanded to do query selection
// "var name $ selector prop [name]"
// flags:
//  -append: adds to string/array
//  -add: adds to number
mfs.c.cmd.vars = function(argsObj) {
	if (!argsObj[0]) {  // print vars
		var varlist = [];
		for(let key in mfs.c.vars) {
			let val = (mfs.c.vars.hasOwnProperty(key)) ? mfs.c.vars[key] : null;
			if (Array.isArray(val)) { // value is array
				/*for (let i = 0; i < val.length; i++) { // loop through array
					varlist.push(`${key}[${i}] = ${val[i]}`);
				}*/
				varlist.push(`${key} = Array ${JSON.stringify(val)}`);
			} else if (typeof val === 'object' && val.constructor === Object) { // type is object
				/*for (let objKey in val) {
					varlist.push(`${key}[${objKey}] = ${val[objKey]}`);
				}*/
				varlist.push(`${key} = Object ${JSON.stringify(val)}`);
			} else {
				varlist.push(`${key} = ${val}`);
			}
		}
		varlist.sort();
		mfs.c.print(varlist.join('\n'));
	} else { // set var
		let key = argsObj[0];
		
		let value;
		if (argsObj[1]==='$' && argsObj[3]) { // args satisfy query syntax
			// do a query selection and get the attribute value
			let nl = document.querySelectorAll(argsObj[2]);
			let i = argsObj.offset || 0;
			switch(argsObj[3]) { // what property to read
			case "attr":
				value = (argsObj[4])? nl[i].getAttribute( argsObj[4] ): el.innerText;
				break;
			case "text":
				value = nl[i].innerText;
				break;
			case "count":
				value = nl.length;
				break;
			}
		} else if (argsObj.prompt) { // prompt value
			value = prompt(`Enter value for variable "${key}"`);
		} else { // ordinary value 
			value = argsObj[1] || undefined 
		}
		
		// try to parse json
		try {
			let valParsed = JSON.parse(value || null);
			if (valParsed) value = valParsed;
		} catch(e) {
			// ignore json parse errors
		}
		value = isNaN(value)? value: Number(value); //conv to number if possible
		
		if (argsObj.append && Array.isArray(mfs.c.vars[key])) { // append mode on array
			mfs.c.vars[key].push(value);
		} else if (argsObj.append && typeof mfs.c.vars[key] === 'string') { // append mode on string
			mfs.c.vars[key] += value;
		} else if (argsObj.add && !isNaN(mfs.c.vars[key]) ) { // add on number
			mfs.c.vars[key] += value;
		} else {
			mfs.c.vars[key] = value;
		}
		mfs.c.print(`${key} = ${JSON.stringify(mfs.c.vars[key])}`);
	}
	
}


// if. finally a way to construct basic logic in the console.
// arguments:
//  [0]: string1 OR regexp
//  [1]: comparison operator OR the word "in"
//  [2]: string2
//  [3]: command if true
//  [4]: the word "else"
//  [5]: command if false
mfs.c.cmd.if = function(argObj) {
	if (!argObj[3]) { // need 4 arguments minimum
		mfs.c.print('Not enough arguments!', 5);
	} else if (argObj[1]==='in') { // regex matching
		var rgx = new RegExp(argObj[0], (argObj.i)?"i":"" );
		if ( rgx.exec(argObj[2]) ) mfs.c.parseBatch(argObj[3].split(';'));
		
	} else {
		var a = 0,
			v1 = argObj[0],
			op = argObj[1],
			v2 = argObj[2];
		
		// all conditionals here. if any is true adds 1 to a.
		a += (op==='==' && v1===v2)? 1: 0;
		a += (op==='!=' && v1!= v2)? 1: 0;
		a += (op==='>'  && v1 > v2)? 1: 0;
		a += (op==='>=' && v1>= v2)? 1: 0;
		a += (op==='<'  && v1 < v2)? 1: 0;
		a += (op==='<=' && v1<= v2)? 1: 0;
		
		if (a) { // at the end, if a is nonzero, at least one conditional is true
			mfs.c.parseBatch(argObj[3].split(';'));
		} else if (argObj[4].toLowerCase()==='else' && argObj[5]) {
			mfs.c.parseBatch(argObj[5].split(';'));
		}
	}
}

// for - loops
// arguments:
//  [0]: variable name. will use the vars space for varsubst
//  [1]: start value
//  [2]: end value
//  [3]: command to run
//  -step n: step value (put in quotes if negative)
// TODO: loop through array. [1]=in, [2]=array var
// TODO: query selections, [1]=inSelector, [2]=selector
mfs.c.cmd.for = function(argObj) {
	// store a reference to the named variable if it's defined
	let varcopy = ( mfs.c.vars.hasOwnProperty([argObj[0]]) )? mfs.c.vars[argObj[0]]: undefined;
	let varcopy2 = (argObj.indexvar && mfs.c.vars.hasOwnProperty([argObj.indexvar])) ? mfs.c.vars[argObj.indexvar] : undefined;
	// steps:
	// 1) figure out type of loop
	// 2) build an array of values based on loop type
	// 3) go through each item in that array, passing its value to the command
	
	// array holding the values as per step 2
	let valueArray = [];
	
	// figure out type of loop and fill the above array
	if (!isNaN(argObj[1]) && !isNaN(argObj[2])) { // both are numbers, consider an index loop
		let a = parseInt(argObj[1]) || 1;
		let b = parseInt(argObj[2]) || 10;
		let h = parseInt(argObj.step) || (a>b)? -1: 1;
		for (let i = a; (h>0 && i <= b) || (h<0 && i >= b); i += h) {
			valueArray.push(i);
		}
	} else if (argObj[1] === 'in' && mfs.c.vars.hasOwnProperty(argObj[2]) && Array.isArray(mfs.c.vars[argObj[2]])) {
		// arg 1 is "in", var of that name exists, var is an array
		let arrayVar = mfs.c.vars[argObj[2]];
		for (let i = 0; i < arrayVar.length; i++) {
			valueArray.push(arrayVar[i]);
		}
	} else {
		mfs.c.print('Not enough arguments, or arguments are of the incorrect type', 5);
	}
	if (!argObj[3]) { // no command given
		mfs.c.print('No command specified.', 5);
		return;
	}
	
	// now to do the loop
	for (var i = 0; i < valueArray.length; i++ ) {
		if (argObj.indexvar) mfs.c.vars[argObj.indexvar] = i;
		mfs.c.vars[argObj[0]] = valueArray[i];
		mfs.c.parse( argObj[3], true );
	}
	
	// restore original var of the same name
	mfs.c.vars[argObj[0]] = varcopy;
	if (argObj.indexvar) mfs.c.vars[argObj.indexvar] = varcopy2;
}

// Regex replace
// arguments:
//  -outputvar, -o: output result to this variable name
//  [0]: input string
//  [a], a=1,3,5,7... : regex pattern. put /between slashes/ to define custom flags
//  [a+1]: replacement string
//  -i: case-insensitive
//  -g: global matching
mfs.c.cmd.replace = function(argObj) {
	if (!argObj[0]) {
		mfs.c.print('Not enough arguments', 5);
		return;
	}
	var patternmatch = /\/(.*)\/([igmu]*)|(.*)/;
	// 1: full regex str
	// 2: full regex flags
	// 3: regex str only
	var s = mfs.c.varSubst(argObj[0]);
	var rgxArray = [];
	var defFlags = [];
	if (argObj.i || argObj.I) defFlags.push("i");
	if (argObj.g || argObj.G) defFlags.push("g");
	if (argObj.m || argObj.M) defFlags.push("m");
	if (argObj.u || argObj.U) defFlags.push("u");
	
	var i = 1;
	while (argObj[i]) {
		var matchPart = patternmatch.exec(argObj[i]);
		if (matchPart===null) {
			mfs.c.print("Error: Unable to parse argument #" +i+ " as regular expression.", 5)
			continue;
		}
		var replacePart = argObj[i+1] || "";
		
		if (matchPart[1]) {
			// full regex supplied
			var newRegex = new RegExp(matchPart[1], matchPart[2]);
			console.log(newRegex);//DEBUG
			rgxArray.push([newRegex, replacePart]);
		} else if (matchPart[3]) {
			var newRegex = new RegExp(matchPart[3], defFlags.join(""));
			rgxArray.push([newRegex, replacePart]);
		}
		i += 2;
	}
	
	for (var j=0; j<rgxArray.length; j++) {
		s = s.replace(rgxArray[j][0], rgxArray[j][1]);
	}
	
	mfs.c.util.outputVarOrPrint(argObj, s);
}

// DOM MANIPULATION COMMANDS
// domEvent - dispatch event on elements
// Arguments:
//  [0]: selector
//  [1]: event name
//  -all: dispatch to all matched elements
//  (other keyvalues will be included in the event object) 
mfs.c.cmd.domEvent = function(argObj) {
	if (!argObj[1]) {
		mfs.c.print('Not enough arguments!',5);
		return;
	}
	
	// select the elements
	var el = document.querySelectorAll(argObj[0]);
	if (!el.length) return;
	
	// prepares the event property object
	var prop = {};
	for (var n in argObj) {
		if (!argObj.hasOwnProperty(n) || !isNaN(n) || n==='commandName' || n==='all') continue;
		prop[n] = argObj[n];
	}
	prop.bubbles = prop.bubbles || true;
	prop.cancellable = prop.cancellable || true;
	
	// construct the event
	switch (argObj[1]) {
	case 'click':
		var event = new MouseEvent(argObj[1], prop);
		break;
	case 'keypress':
		var event = new KeyboardEvent(argObj[1], prop);
		break;
	default:
		// given event not supported
		mfs.c.print('Unknown event type: '+argObj[1], 5);
		return;
	}

	// dispatch the event
	for (var i = 0; i===0 || (argObj.all && i<el.length) ; i++) {
		el[i].dispatchEvent(event);
	}
}

// command table (name as typed : fn)
mfs.c.cmdTable = {
	"listimg"	: mfs.c.cmd.listimg,
	"imglist"	: mfs.c.cmd.listimg,
	"listlink"	: mfs.c.cmd.listlink,
	"linklist"	: mfs.c.cmd.listlink,
	"time"		: mfs.c.cmd.time,		// disp time
	"play"		: mfs.c.cmd.av,			// play web media
	"genlinks"	: mfs.c.cmd.genlinks,	// given string and 2 ranges, generate links
	"dlimg"		: mfs.c.cmd.dlimg,		// dl images, can take same arg as genlinks
	"type"		: mfs.c.cmd.type,		// type file
	"exec"		: mfs.c.cmd.exec, 		// batch parser
	"alias"		: mfs.c.cmd.alias,		// alias registrar
	"unalias"	: mfs.c.cmd.alias,
	"var"		: mfs.c.cmd.vars,		// variable get/set and query selector
	"set"		: mfs.c.cmd.vars,		// synonym
	"if"		: mfs.c.cmd.if,
	"for"		: mfs.c.cmd.for,
	"replace"	: mfs.c.cmd.replace,
	"dom_event"	: mfs.c.cmd.domEvent
};
