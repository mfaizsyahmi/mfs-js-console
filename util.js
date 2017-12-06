//namespaces
mfs = this.mfs || {};
mfs.c = mfs.c || {};

// UTILITY FUNCTIONS
mfs.c.util = mfs.c.util||{};

// http://stackoverflow.com/questions/770523
mfs.c.util.addslashes = function( str ) {
    return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
}

mfs.c.util.txtfmt = function(s, ar) { // formats text, replace $n with array of strings (1-based)
	for(let x = 1; ; x++ ) {
		if (!ar.hasOwnProperty(x - 1)) {break}
		s = s.replace( '$'+x, ar[x - 1] || '');
	}
	return s;
}

mfs.c.util.txtfmt2 = function(s, obj) { // formats text, but with named arguments (used to subst variables)
	//if (typeof s !== 'string') return;
	
	// first pass - replace all variables within curly brackets (a-la Apache)
	// todo: replace loop - loop the string instead of the vars
	/*for (let n in obj) {
		if !(obj.hasOwnProperty(n)) continue;
		s = s.replace('${'+n+'}', obj[n]);
	}*/
	const replacer = (p1) => {
		let val = mfs.c.util.objectNotationValue(obj, p1, true);
		if (Array.isArray(val) || (typeof val === 'object' && val.constructor === Object)) {
			val = JSON.stringify(val);
		} else if (typeof val === 'function') {
			val = val();
		}
		return val;
	};
	s = s.replace(/\${(.*?)}/g, replacer);
	// second pass - replace variables *without* curly brackets
	for(let n in obj) {
		if (obj.hasOwnProperty(n)) {
			s = s.replace('$'+n, obj[n]);
		}
	}
	return s;
}
mfs.c.util.textFormatter = function(s, obj) {mfs.c.util.txtfmt2(s, obj)}

// i frankly don't know what this is or how it works
mfs.c.util.typeEscape = function(s) {
	var map = {
		b: '\b',
		f: '\f',
		n: '\n',
		r: '\r',
		t: '\t',
		v: '\v',
		'0': '\0',
		"'": "\'",
		'"': '\"',
		'\\': '',
	}
	return s.replace(/\\([\\'"])/g, '$1').replace(/\\([bfnrtv0])/g, (m, p1) => map[p1] );
}

// returns html fragment text of anchor tag
mfs.c.util.htmlLink = function(uri, s, title) {
	if (typeof s == 'undefined') s = uri;
	return `<a href="${uri}" target="_blank" title="${title}">${s}</a>`;
};

// parse [partial] Markdown
mfs.c.util.markdown = function(s) {
	return s.replace(/\[([^\[\]]*)\]\(cmd:([^\)]*)\)/g, '<span class="cmd" data-cmd="$2" title="command: $2">$1</span>') //command
			.replace(/\[([^\[\]]*)\]\(([^\)]*)\)/g, '<a href="$2" target="_blank">$1</a>') // link
			.replace(/\b_([^_]*)_\b/g, '<i>$1</i>') // italics
			.replace(/\*\b([^\*]*)\b\*/g, '<b>$1</b>'); // bold
}

// https://stackoverflow.com/a/15479354
mfs.c.util.naturalCompare = function(a, b) {
    var ax = [], bx = [];

    a.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { ax.push([$1 || Infinity, $2 || ""]) });
    b.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { bx.push([$1 || Infinity, $2 || ""]) });

    while(ax.length && bx.length) {
        var an = ax.shift();
        var bn = bx.shift();
        var nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
        if (nn) return nn;
    }

    return ax.length - bx.length;
}

// string goes in, a hash comes out
mfs.c.util.hashCode = function(s) {
  var hash = 0, i, chr;
  if (s.length === 0) return hash;
  for (i = 0; i < s.length; i++) {
    chr  = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
};

// a standardized way to have commands support -outputvar
// argObj: argObj as passed to command
//   this fn checks the outputvar or o keyvalue of the object
// s: value to output
// type: print type
// formatter: function that formats s to a printable output
//
// TODO: add support for array
mfs.c.util.outputVarOrPrint = function(argObj, s, type, formatter) {
	const isArray = Array.isArray(s);
	// get the varname
	let varName = argObj.outputvar || argObj.o;
	// for object notation support, figures out where to output
	let varRef = mfs.c.util.objectNotationValue(mfs.c.vars, varName, true, true);
	
	// outputvar specified and s is array -> directly assign (used to be JSON-stringified)
	if (varName && isArray) { varRef.obj[varRef.key] = s }
	
	// outputvar specified and s is NOT array -> directly assign
	else if (varName) { varRef.obj[varRef.key] = s }
	
	// outputvar NOT spefified, formatter exist -> print formatter's output
	else if (typeof formatter === 'function') { mfs.c.print(formatter(s), type) }
	
	// outputvar NOT spefified, formatter NON-exist -> print s directly
	else { mfs.c.print(s, type) }
}

// a dumb ajax async fn. returns response regardless
// callback is responsible to handle any errors
mfs.c.util.ajax = function (url, callback, argObj = {}) {
	const proxify = (url) => `http://whateverorigin.org/get?url=${encodeURIComponent(url)}`;
	
	// check callback
	if (typeof callback !== 'function') {
		console.log('ERROR: callback not a function');
		return;
	}
	
	let largObj = Object.assign({}, argObj);
	largObj.method = 'GET';
	largObj.url = url;
	if (typeof GM_xmlhttpRequest !== 'undefined') { // GM's method, can break through CORS
		largObj.onload = function (r) {
			if (r.readyState === 4) {
				callback(r);
			}
		};
		largObj.onerror = function () {console.log('error')};
		GM_xmlhttpRequest(largObj);
	} else if (mfs.c.vars.ajaxUseWhateverOrigin) { // Use the WhateverOrigin.org site
		mfs.c.util.jsonp(proxify(url), callback)
	} else { // standard method
		console.log('Standard xhr');
		var xhr = new XMLHttpRequest();
		if (largObj.responseType) xhr.responseType = largObj.responseType;
		if (largObj.mimeType) xhr.overrideMimeType(largObj.mimeType);
		xhr.onload = function (r) {
			callback(r.target);
		};
		xhr.open('get', url);
		xhr.send();
		console.log('Standard xhr sent');
	}
};

// http://stackoverflow.com/a/13230363
mfs.c.util.jsonp = function(url, cb) {
    var script = document.createElement('script');
    script.async = true;
    var callb = 'exec' + Math.floor((Math.random() * 65535) + 1);
    window[callb] = function jsonpCallback(data) {
        var scr = document.getElementById(callb);
        scr.parentNode.removeChild(scr);
		// WhateverOrigin returns data in data.contents(?) so copy that to responseText
		if (data.contents && !data.responseText) r.responseText = r.contents;
        cb(data);
        window[callb] = null;
        delete window[callb];
    }
    var sepchar = (url.indexOf('?') > -1) ? '&' : '?';
    script.src = url + sepchar + 'callback=' + callb;
    script.id = callb;
    document.body.appendChild(script);
}

// filter url by its parts
// is this the shared form of listlink?
mfs.c.util.urlFilter = function(urlList, argObj) {
	var out = [];
	for (var i = 0; i < urlList.length; i++) {
		
	}
}

mfs.c.util.dlImg = function(imgEl,imgtype,callback) {
	if (!imgtype) imgtype = mfs.c.vars.imgDlType || 'image/png';
	//mfs.c.print('Downloading '+name);
	//mfs.c.print(imgtype);
	
	// core functionality put in callback to handle both cached and uncached situations
	var hCallback = function(img, himgtype){
		console.log(himgtype);
		try {
		var canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		var ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		var dataURL = canvas.toDataURL(himgtype);
		
		var namergx = mfs.c.state.regex.filename3 || /([^/\\&\?]+)\.\w{3,4}(?=([\?&].*$|$))/;
		var name = namergx.exec(imgEl.src)[1] || imgEl.src,
			ext = (himgtype==='image/jpeg') ?'.jpg' :'.png';
		var a = document.createElement('a');
		a.download = (name||'image') + ext;
		a.href=dataURL.replace(himgtype, 'application/x-mfsconsoleimage');
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		} catch (e)	{
			console.log('error in hcallback');
		}
		if (callback) callback();
	};
	
	// set up img element to handle loading/cache retrieval
	var himg = new Image();
	himg.onload = function(e) { // if img not in cache
		hCallback(e.target, imgtype);
	};
	himg.onerror = function(e) {
		mfs.c.print('Image download failed!',5);
		callback();
	};
	himg.setAttribute('crossOrigin','anonymous');
	himg.src = imgEl.src;
	if (himg.complete) { // img in cache?
		//hcallback(himg,imgtype);
	}
};
mfs.c.util.processImgDlQueue = function() {
	// quit if nothing in queue /or dl is in progress/
	if(mfs.c.state.imgDlQueue.length===0) return false;
	
	mfs.c.print(mfs.c.state.imgDlQueue.length + ' images in download queue',3);
	// call the dl fn, set callback fn
	mfs.c.util.dlImg(mfs.c.state.imgDlQueue[0], mfs.c.vars.imgDlType, function dlImgCallback() {
		if(mfs.c.state.imgDlQueue.length<=1) { // no more img to process
			mfs.c.state.imgDlQueue=[];
			mfs.c.state.imgDlTimeoutID=0;
			mfs.c.print('Finished images in download queue', 3);
		} else { // continue, call this fn again using the timeout
			mfs.c.state.imgDlQueue.shift();
			var delay = mfs.c.vars.imgDlDelay || 10;
			mfs.c.state.imgDlTimeoutID = setTimeout(mfs.c.util.processImgDlQueue, delay);
		}
	});
};

mfs.c.util.isGlobalPoster = function() {
	return ( mfs.c.vars.global && GM_getValue('globalPosterRef', null) === location.href );
}



// WIP
//mfs.c.util.download = function(dataURL) { }

// Math expression (WIP)
/*mfs.c.util.expr = function(s) {
	var rgx_1 = /\(([^\(\)]*)\)/; // brackets
	var rgx_2 = /([-+]?\d+(?:\.\d+)?)(\*|\/|\%)([-+]?\d+(?:\.\d+)?)/;
	var rgx_3 = /([-+]?\d+(?:\.\d+)?)(\+|\-)([-+]?\d+(?:\.\d+)?)/; // arithmetic 2
	//tokenize
	
}
mfs.c.util.expr_tokenizer = function(s) {
	for (var i=0; i<s.length; i++) {
		// do something
	}
}*/

// adapted from MDN
mfs.c.util.delayedResolve = function(duration, value) { 
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(value);
    }, duration);
  });
};

// given two objects, see if object one has all the properties and values of object two


mfs.c.util.objMatch = function(searchObj, matchObj, own) {
	for (let key in matchObj) {
		if ( (own)? !searchObj.hasOwnProperty(key): false || searchObj[key] != matchObj[key]) {
			return false;
		}
	}
	return true;
}

// parse dot notation
mfs.c.util.dotGetValue = function (obj, str, own) {
	var part = str.split('.'),
		cur = obj;
	for (var i=0; i<part.length; i++) {
		if ( (own)? cur.hasOwnProperty(part[i]): true && cur[part[i]]) {
			cur = cur[part[i]];
		} else {
			return undefined;
		}
	}
	return cur;
}

// Given a base object and a object notation string, attempt to get the value or a reference to the property
//  obj: base object
//  str: the string of the object notation to get value to/ref of within obj
//  own: check each object's hasOwnProperty
//  ref: if true returns a reference object (more info inside the function block), otherwise return the prop's value
mfs.c.util.objectNotationValue = function (obj, str, own, ref) {
	const pattern = /(?:(?:^|\b|\.)(\w+)(?:\b)|\[(['"]?)(.*?)\2\])/g;
	const mStr = (match) => match[3] || match[1];
	const allowedMethods = ['toString', 'toDateString', 'toTimeString', 'toLocaleDateString', 'toLocaleTimeString'];
	// reference object. properties:
	//   obj: the parent object (analogous to "this")
	//   key: the last key in the notation
	//   use this to access the properties in mfs.c.vars and their children
	var refObj = {obj, key: str};
	var cur = obj;
	var match;
	while (match = pattern.exec(str)) {
		let part = mStr(match);
		if ( (own)? cur.hasOwnProperty(part): true && cur[part]) {
			refObj = {obj: cur, key: part};
			cur = cur[part];
		} else if (allowedMethods.includes(part) && typeof cur[part] === 'function') {
			refObj = {obj: cur, key: part};
			cur = cur[part];
		} else {
			return (ref)? refObj : undefined;
		}
	}
	return (ref)? refObj : cur;
}