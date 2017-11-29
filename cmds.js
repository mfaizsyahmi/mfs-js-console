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
	let outToVar = !!(args.outputvar || args.o || false);
	// main function, called as callback to ajax later in this fn
	let listimgCallback = function(docObj, args) {
		let o = [];
		let domlist = docObj.getElementsByTagName('img');
		let imgarray = [].slice.call(domlist);
		for(let i = 0, c = 1; i < imgarray.length; i++) {	
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
				//o.push('<span class="lnoutput mfs-c-gallery">' +(c)+ ': <a href="' +src+ '" title="' +src+ '" target="_blank"><img src="' +src+ '" style="max-width:150px"/></a></span>');
				o.push(`<span class="lnoutput mfs-c-gallery">${c}: <a href="${src}" title="${src}" target="_blank"><img src="${src}" style="max-width:150px"/></a></span>`);
			} else {
				//o.push('<span class="lnoutput normal">' +(c)+ ': <a href="' +src+ '" title="' +src+ '" target="_blank">' +s+ '</a>' +dims+ '</span>');
				o.push(`<span class="lnoutput normal">${c}: <a href="${src}" title="${src}" target="_blank">${s}</a>${dims}</span>`);
			}
			c++;
		}
		if (outToVar) {
			mfs.c.util.outputVarOrPrint(args, o);
		} else {
			mfs.c.print(`${docObj.title} - ${o.length} matching images:`);			
			mfs.c.output.innerHTML += o.join('');
		}
		console.log(o);
	};
	
	// Async ajax layer for imglist. Allows ajax load of another document uri on which imglist is performed
	if(args[0]) {
		mfs.c.util.ajax(args[0], (r) => {
			if(r.status === 200) {
				listimgCallback(r.responseXML, args);
			} else {
				mfs.c.print(`Error loading ${args[0]} : ${r.status}`, 5);
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
		s = (mfs.c.fullVarObj()["genlinks-anyname"])? s.replace(rgx, "$$1$2") : s;
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
		sp = (mfs.c.fullVarObj()["genlinks-anyname"])? s.replace(rgx, "$$1$2") : s;
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
	mfs.c.util.ajax(argObj[0], (r) => {
		if (r.status === 200) {
			var s = decodeURI(encodeURI(r.responseText));
			mfs.c.util.outputVarOrPrint(argObj, s);
		} else {
			mfs.c.print(`Error loading ${argObj[0]} : ${r.status} - ${r.statusText}`, 5);
		}
	});
};

// EXEC - batch file parsing with timestamp support
mfs.c.cmd.exec = function(argObj) {
	if (!argObj[0]) {
		mfs.c.print('Not enough arguments',5);
		return false;
	}
	mfs.c.util.ajax(argObj[0], function(r) {
		if(r.status == 200) {
			mfs.c.parseTimedBatch(r.responseText);
		} else {
			mfs.c.print('Error loading ' + argObj[0] + ' : ' + r.status, 5);
		}
	});
};

// alias - register an alias
// args: [0] - alias name
//       [1] - string of commands
// also processes "unalias" command
mfs.c.cmd.alias = function(argObj) {
	if (!argObj[0]) { // print list of aliases 
		var alist = [];
		for (var a in mfs.c.aliases) {
			if (mfs.c.aliases.hasOwnProperty(a)) alist.push( `${a}: "${mfs.c.aliases[a]}"`)
		}
		alist.sort();
		var count = alist.length || 0;
		mfs.c.print(`${count} aliases in total`, 3);
		if (alist.length) { mfs.c.print( alist.join('\n') ); }
		
	} else if (!argObj[1] || (argObj._commandName && argObj._commandName === 'unalias') ) { // remove alias
		if (mfs.c.aliases.hasOwnProperty(argObj[0]) ) delete mfs.c.aliases[ argObj[0] ];
		mfs.c.print('Cleared alias. "savevar" to make permanent.', 3);
		
	} else if (argObj[1]) { // add alias
		//if (mfs.c.cmdTable.hasOwnProperty(argObj[0]) || mfs.c.addCmdTable.hasOwnProperty(argObj[0]) ) {
		//	mfs.c.print('Created/updated alias. "savevar" to make permanent.',3);
		//} else {
			mfs.c.aliases[ argObj[0] ] = argObj[1]; // always override existing aliases
			mfs.c.print('Created/updated alias. "savevar" to make permanent.', 3);
		//}
	}
};

// VAR - moved here after it expanded to do query selection
// "var name $ selector prop [name]"
// flags:
//  -append: adds to string/array
//  -add: adds to number
mfs.c.cmd.vars = function(argsObj) {
	const isArr = obj => Array.isArray(obj);
	const isObj = obj => (typeof obj === 'object' && obj.constructor === Object);
	
	if (!argsObj[0]) {  // print vars
		var varlist = [];
		for(let key in mfs.c.fullVarObj()) {
			let val = (mfs.c.fullVarObj().hasOwnProperty(key)) ? mfs.c.fullVarObj()[key] : null;
			if (isArr(val)) { // value is array
				/*
				for (let i = 0; i < val.length; i++) { // loop through array
					varlist.push(`${key}[${i}] = ${val[i]}`);
				}*/
				varlist.push(`${key} = Array ${JSON.stringify(val)}`);
			} else if (isObj(val)) { // type is object
				/*
				for (let objKey in val) {
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
		
		// translates object notation in key and returns a reference to the children of mfs.c.vars as defined in said notation
		// eg. if mfs.c.vars.testobj is object "testobj.child" points to testobj with child as key
		// if object notation traversal fail will return the last found object, or full key (including dot) if none found
		// properties:
		//   obj: reference to the parent object
		//   key: name of the last key
		let target = mfs.c.util.objectNotationValue(mfs.c.fullVarObj(), key, true, true);
		console.log(target);
		
		let value;
		if (argsObj[1] === '$' && argsObj[3]) { // args satisfy query syntax
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
			value = prompt(argsObj.prompt || `Enter value for variable "${key}"`);
		} else { // ordinary value 
			value = argsObj[1];
		}
		
		// try to parse json
		try {
			let valParsed = JSON.parse(value || null);
			if (valParsed) value = valParsed;
		} catch(e) {
			// ignore json parse errors
		}
		value = isNaN(value)? value: Number(value); //conv to number if possible
		
		if (argsObj.append && isArr(target.obj[target.key])) { // append mode on array
			target.obj[target.key].push(value);
		} else if (argsObj.append && typeof target.obj[target.key] === 'string') { // append mode on string
			target.obj[target.key] += value;
		} else if (argsObj.append && isObj(target.obj[target.key]) && isObj(value)) { // append on object
			Object.assign(target.obj[target.key], value);
		} else if (argsObj.add && !isNaN(target.obj[target.key]) ) { // add on number
			target.obj[target.key] += value;
		} else if (argsObj.delete || argsObj.delet) { // DELET THIS
			delete target.obj[target.key];
		} else {
			target.obj[target.key] = value;
		}
		mfs.c.print(`${key} = ${JSON.stringify(target.obj[target.key])}`);
	}
	
}


// if. finally a way to construct basic logic in the console.
// supports logic chaining. see below
// arguments:
//  [n + 0]: string1 OR regexp
//  [n + 1]: comparison operator
//  [n + 2]: string2
//  [n + 3]: command if true
//  [n + 4]: the word "else"
//  [n + 5]: command if false OR the word "if"
//   n starts at 0. if [n + 5] is "if" 6 is added to it and the logic chain continues
mfs.c.cmd.if = function(argObj) {
	const isArr = a => (Array.isArray(a));
	const isObj = a => (typeof a === 'object' && a.constructor === Object);
	const lc = s => (typeof s === 'string')? s.toLowerCase(): s;
	const str = v => v.toString();
	const patternmatch = /\/([^/]*?)\/([igmu]*)/i;
	
	const containFn = (a, b) => { // a contains b
		if (isArr(a)) { // if a is array
			return a.includes(b);
		} else if (isObj(a)) { // if a is object
			return a.hasOwnProperty(b);
		} else { // a is string/number
			let match = patternmatch.exec(b);
			if (match) {
				b = new RegExp(match[1], match[2]); // if a is regexp
				return (str(a).search(b) >= 0);
			} else {
				return str(a).includes(b);
			}
		}
	};
	const compareFn = {
		'==' : (a, b) => (a === b), // equals
		'!=' : (a, b) => (a !== b), // not equals
		'>'  : (a, b) => (a >   b), // greater than
		'>=' : (a, b) => (a >=  b), // greater than or equal to
		'<'  : (a, b) => (a <   b), // less than
		'<=' : (a, b) => (a <=  b), // less than or equal to
		'*=' : (a, b) => containFn(a, b), // a contains b
		'contains' : (a, b) => containFn(a, b), // same as above
		'in' : (a, b) => containFn(b, a) // reverse of contains
	};
	
	let iteration = 0;
	let logicChainContinue = false;
	do {
		let offset = iteration * 6;
		if (!argObj[offset + 3]) { // need 4 arguments minimum
			mfs.c.print(`Not enough arguments in comparison block #${iteration + 1}!`, 5);			
		} else {
			let a  = argObj[offset + 0];
			let op = argObj[offset + 1];
			let b  = argObj[offset + 2];
			
			// try and parse JSON in variables a and b
			try {
				a = JSON.parse(a);
				b = JSON.parse(b);
			} catch (e) {
				; // don't do anything... shouganai ¯\_(?)_/¯ 
			}
			
			let result = (compareFn.hasOwnProperty(op))? compareFn[op](a, b) : false;
			
			logicChainContinue = false;
			if (result) {
				mfs.c.parseBatch(argObj[offset + 3].split(';'));
			} else if (lc(argObj[offset + 4]) === 'else' && lc(argObj[offset + 5]) === 'if') {
				// if chain continues
				logicChainContinue = true;
				iteration++;
			} else if (lc(argObj[offset + 4]) === 'else' && argObj[offset + 5]) {
				mfs.c.parseBatch(argObj[offset + 5].split(';'));
			}
		}
	} while (logicChainContinue);
}

/* for - loops
 * MODE 1: iterate integer in and between two numbers
 *  [0]: variable name. will use the vars space for varsubst
 *  [1]: start value
 *  [2]: end value
 *  [3]: command to run
 *  -step n: step value (put in quotes if negative)
 * MODE 2: iterate values of array/object
 *  [0]: variable name. will use the vars space for varsubst
 *  [1]: keyword "in"
 *  [2]: object notation pointing to the array/object
 *  [3]: command to run
 *  -indexvar: name of variable holding the loop index
 *  -keyvar:   name of variable holding key when looping object values
 * TODO: query selections, [1]=inSelector, [2]=selector
 */
mfs.c.cmd.for = function(argObj) {
	// back up var stack 
	mfs.c.pushVarStack();
	
	/* steps:
	 * 1) figure out type of loop
	 * 2) build an array of values based on loop type
	 * 3) go through each item in that array, passing its value to the command
	 */
	
	// array holding the values as per step 2
	let valueVarName; // todo: the var name in argument [0] holding the iteration value
	let keyVarName;  // todo: index or key for the iteration value
	let keyArray = [];
	let valueArray = [];
	
	// figure out type of loop and fill the above array
	if (!isNaN(argObj[1]) && !isNaN(argObj[2])) {
		// both are numbers, consider an index loop
		let a = parseInt(argObj[1]) || 1;
		let b = parseInt(argObj[2]) || 10;
		let h = parseInt(argObj.step) || (a > b)? -1: 1;
		for (let i = a; (h > 0 && i <= b) || (h < 0 && i >= b); i += h) {
			valueArray.push(i);
		}
		valueVarName = argObj[0];
		
	} else if (argObj[1] === 'in') {
		// object/array iteration mode
		// first get reference to the object (supports dot notation and access to child objects)
		let varRef = mfs.c.util.objectNotationValue(mfs.c.fullVarObj(), argObj[2], true, true);
		// check type
		if (Array.isArray(varRef.obj[varRef.key])) { // is Array
			// push its items to the value array
			for (let item of varRef.obj[varRef.key]) {
				valueArray.push(item);
			}
		} else if (typeof varRef.obj[varRef.key] === 'object' && varRef.obj[varRef.key].constructor === Object) { // is object
			// get the object keys
			keyArray = Object.keys();
			// iterate those keys to get the values making sure the key and value array corresponds to each other
			for (let key in keyArray) {
				valueArray.push(varRef.obj[varRef.key][key]);
			}
		} else {
			mfs.c.print('Couldn\'t parse array/object specified', 5);
			return;
		}
		// todo: define both key and value in this argument, separated by a separator
		// though tbh setting it with switches work just as well
		valueVarName = argObj[0];
		
	} else {
		mfs.c.print('Not enough arguments, or arguments are of the incorrect type', 5);
		return;
	}
	if (!argObj[3]) { // no command given
		mfs.c.print('No command specified.', 5);
		return;
	}
	
	// now to do the loop
	for (var i = 0; i < valueArray.length; i++ ) {
		console.log(`For loop iteration #${i}`)
		if (argObj.indexvar) mfs.c.vars[argObj.indexvar] = i;
		if (argObj.keyvar && keyArray.length) mfs.c.vars[argObj.keyvar] = keyArray[i];
		mfs.c.vars[valueVarName] = valueArray[i];
		mfs.c.parseBatch(argObj[3].split(';'));
	}
	
	// restore original var of the same name
	mfs.c.popVarStack();	
}

/* Regex replace
 * arguments:
 *  -outputvar, -o: output result to this variable name
 *  [0]: input string
 *  [a], a=1,3,5,7... : regex pattern. put /between slashes/ to define custom flags
 *  [a+1]: replacement string
 *  -i: case-insensitive
 *  -g: global matching
 */
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
		if (matchPart === null) {
			mfs.c.print(`Error: Unable to parse argument #${i} as regular expression.`, 5)
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
	
	for (let j = 0; j < rgxArray.length; j++) {
		s = s.replace(rgxArray[j][0], rgxArray[j][1]);
	}
	
	mfs.c.util.outputVarOrPrint(argObj, s);
}

// DOM MANIPULATION COMMANDS
// the common function returning supported events and its properties
mfs.c.cmd._domEventCommon = function() {
	
	let sharedEventProps = ['bubbles', 'cancelable', 'ctrlKey', 'shiftKey', 'altKey', 'metaKey'];
	return {
		// defines which event name corresponds to which event name
		// also define event shortcuts with base event name and default prop for that shortcut (eg rightclick)
		eventTypes: {
			click: {event: MouseEvent, prop: {}},
			click_right: {event: MouseEvent, base: 'click', prop: {button: 2}},
			click_middle: {event: MouseEvent, base: 'click', prop: {button: 1}},
			keypress: {event: KeyboardEvent, prop: {}},
			keypress_enter: {event: KeyboardEvent, base: 'keypress', prop: {key: 'Return'}},
			keypress_esc: {event: KeyboardEvent, base: 'keypress', prop: {key: 'Escape'}}
		},
		eventProps: {
			click: [...sharedEventProps, 'screenX', 'screenY', 'clientX', 'clientY', 'button', 'buttons'],
			keypress: [...sharedEventProps, 'key']
		}
	};
};

// domEvent - dispatch event on elements
// Arguments:
//  [0]: selector
//  [1]: event name
//  -all: dispatch to all matched elements
//   event properties shall be included as keyvalues. only supported prop names are passed to event
mfs.c.cmd.domEvent = function(argObj) {
	//retrieves supported event types and properties
	const {eventTypes, eventProps} = mfs.c.cmd._domEventCommon();
	
	if (argObj.help) {
		mfs.c.print(`Supported events: ${Object.keys(eventTypes).join(' ')}`, 3);
		mfs.c.print('Supported event properties:', 3);
		for (let n in eventProps) {
			mfs.c.print(`  ${n}: ${eventProps[n].join(' ')}`, 3);
		}
	} else if (!argObj[1]) {
		mfs.c.print('Not enough arguments!', 5);
		return;
	} else if (!eventTypes[argObj[1]]) {
		mfs.c.print(`Unrecognized/unsupported event: ${argObj[1]}`, 5);
		return;
	}
	
	// select the elements
	let el = document.querySelectorAll(argObj[0]);
	if (!el.length) return;
	
	// get event name (includes shortcut names)
	let eventName = argObj[1];
	// base event name (if shortcut). this would be a valid event name
	let eventBase = eventTypes[eventName].base || eventName;
	let eventRef = eventTypes[eventName].event;
	
	// prepares the event property object
	let prop = Object.assign({}, eventTypes[eventName].prop);
	for (let n in argObj) {
		if (argObj.hasOwnProperty(n) && eventProps[eventBase].includes(n)) prop[n] = argObj[n];
	}
	prop.bubbles = prop.bubbles || true;
	prop.cancellable = prop.cancellable || true;
	
	// construct the event
	let event = new eventRef(eventBase, prop);

	// dispatch the event
	let count = 0;
	for (let i = 0; i === 0 || (argObj.all && i < el.length) ; i++) {
		el[i].dispatchEvent(event);
		count++;
	}
	mfs.c.print(`${count} event(s) dispatched.`, 3);
}


// domListen: Listens to events on the page and executes a command
// Arguments:
//  [0]: selector
//  [1]: event name
//  [2]: command
//  -clear: clear the listener
//   event properties shall be included as keyvalues. only supported prop names are passed to event
mfs.c.cmd.domListen = function(argObj) {
	//WIP
	//retrieves supported event types and properties
	const {eventTypes, eventProps} = mfs.c.cmd._domEventCommon();
	
}

mfs.c.cmd.domSpy = function(argObj) {
	const spyEvent = e => {
		if (!mfs.c.vars.domspy) return;
		
		let el = e.target;
		let tag = el.nodeName.toLowerCase();
		let id = (el.id) ? `#${el.id}`: '';
		let classes = (el.classList.length) ? [null].concat(Array.from(el.classList)).join('.') : '';
		let attr = el.attributes;
		let attrOutLines = [];
		for (let i = 0; i < attr.length; i++) {
			attrOutLines.push(`  ${attr[i].name} = ${attr[i].value}`);
		}
		
		mfs.c.print(`${tag}${classes}${id}\n${attrOutLines.join('\n')}`, 2, {clearLastLine: true});
	};
	
	mfs.c.vars.domspy = !!argObj[0];
	if (!argObj[0]) {
		document.body.removeEventListener('mouseover', spyEvent, true);
		mfs.c.print('Domspy disabled.', 0);
	} else {
		document.body.addEventListener('mouseover', spyEvent, true);
		mfs.c.print('Domspy enabled. Hover over items.', 0);
	}
}

// i don't even know
mfs.c.cmd.wait = async function(argObj) {
	if (!argObj[1]) {
		mfs.c.print( 'Not enough parameters', 3);
		return;
	}
	console.log('wait start');
	
	let duration = argObj[0] || 0;
	await mfs.c.util.delayedResolve(duration, true);
	console.log('wait continue', argObj[1]);
	mfs.c.parseBatch(argObj[1].split(';'));
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
	"dom_event"	: mfs.c.cmd.domEvent,
	"domspy"	: mfs.c.cmd.domSpy,
	"wait"		: mfs.c.cmd.wait
};

// new command table
mfs.c.commands = mfs.c.commands || [];
mfs.c.commands = mfs.c.commands.concat([{
	names: ['imglist', 'listimg'],
	description: 'List images on current or given page URL',
	fn: mfs.c.cmd.listimg
}, {
	names: ['linklist', 'listlink'],
	description: 'List links on current page',
	fn: mfs.c.cmd.listlink
}, {
	name: 'time',
	description: 'Displays time',
	fn: mfs.c.cmd.time
}, {
	name: 'play',
	description: 'Plays HTML5 audio/video',
	fn: mfs.c.cmd.av
}, {
	name: 'genlinks',
	description: 'Generate links with regular numeric pattern',
	fn: mfs.c.cmd.genlinks
}, {
	name: 'dlimg',
	description: 'Download images from current page or from a range of numbers',
	fn: mfs.c.cmd.dlimg
}, {
	name: 'type',
	description: 'Print contents of a specified text file URL',
	fn: mfs.c.cmd.type
}, {
	name: 'exec',
	description: 'Executes a MFScript Console compatible batch file from URL',
	fn: mfs.c.cmd.exec
}, {
	names: ['alias', 'unalias'],
	description: '[un]Sets command aliases',
	fn: mfs.c.cmd.alias
}, {
	names: ['var', 'set'],
	description: 'Sets/unsets variables',
	fn: mfs.c.cmd.vars
}, {
	name: 'if',
	description: 'Conditionally execute command blocks',
	fn: mfs.c.cmd.if
}, {
	name: 'for',
	description: 'Execute a command block for a specified number of times, or for each item in an array/object',
	fn: mfs.c.cmd.for
}, {
	name: 'replace',
	description: 'Replace matching patterns on a string with new values',
	fn: mfs.c.cmd.replace
}, {
	name: 'dom_event',
	description: 'Dispatch DOM events on elements on the page',
	fn: mfs.c.cmd.domEvent
}, {
	name: 'dom_listen',
	description: 'Execute a command block when specified page elements raises specified DOM events',
	fn: mfs.c.cmd.domListen
}, {
	name: 'domspy',
	description: 'View the properties of the element under the mouse cursor',
	fn: mfs.c.cmd.domSpy
}, {
	name: 'wait',
	description: 'Waits the specified miliseconds before executing a command block (doesn\'t pause script)',
	fn: mfs.c.cmd.wait
}]);