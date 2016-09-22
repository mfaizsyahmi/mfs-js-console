// ==UserScript==
// @name        MFS JS Console
// @namespace   mfsfareast
// @description Something silly
// @include     *
// @version     0.1
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// ==/UserScript==
/*
GM_getValue = function(sth,def) {return def;}
*/

//namespaces
mfs = window.mfs ||{};
mfs.c= mfs.c ||{};

// private states
mfs.c.state = mfs.c.state||{
	visible		:false,
	title		:'MFS Javascript Console',
	ver			:'v0.1',
	togglekey	:'`',
	regex: {
		arg: /(^|\s)("([^"]*)"|-*[^\s]*)/g,
		// filenames from stackoverflow.com/a/26253039
		filename: /[^/\\&\?]+(?=([\?&].*$|$))/, // (no ext check)
		filename2: /[^/\\&\?]+\.\w{3,4}(?=([\?&].*$|$))/, // (ext check)
		filename3: /([^/\\&\?]+)\.\w{3,4}(?=([\?&].*$|$))/, // (exclude ext)
		video: /.(webm|mp4|ogv)(\?|#|$)/i,
		audio: /.(mp3|ogg|wav)(\?|#|$)/i,
		timedbatch: /^(\d*)\b(.*)$/m
	},
	hist : [],
	imgDlQueue: [],
	imgDlTimeoutID: 0
};
// public vars (editable from command)
mfs.c.vars = JSON.parse(GM_getValue('vars',JSON.stringify({
	echo: 1,
	mru: 1,
	imgDlType: 'image/jpeg',
	imgDlDelay: 500
})));
mfs.c.style= '#mfs-c-container{position:fixed;left:0;top:0;width:35em;height:25em;font-size:12px;text-align:left;z-index:2147483640}#mfs-c-container :link{color:#9999ff}#mfs-c-input,#mfs-c-output{background:rgba(0,0,0,0.65);color:#ddd;font-family:monospace;border:1px inset #ddd;text-shadow: 1px 1px black;}#mfs-c-input{width:100%;height:2em}#mfs-c-output{height:23em;overflow:auto;resize:both}#mfs-c-output .lnoutput {display:block;min-height:1em;}#mfs-c-output .normal {}#mfs-c-output .input,#mfs-c-output .input:before {color:lime}#mfs-c-output .input:before {content:"]"}#mfs-c-output .textdump {color:#fff}#mfs-c-output .info {color:#a4e9ff}#mfs-c-output .warn {color:#ff9900}#mfs-c-output .error {color:#ff2222}#mfs-c-output .important {color:lime;font-weight:bold}#mfs-c-output .lnoutput.mfs-c-gallery {display:inline-block!important;margin:4px}';

// Utility functions
mfs.c.util = mfs.c.util||{};
mfs.c.util.txtfmt = function(s,ar) { // formats text, replace $n with array of strings
	for(var x=1;x<=ar.length;x++){
		s = s.replace('$'+x,ar[x-1]||'');
	}
	return s;
};
mfs.c.util.htmlLink = function(uri,s) {
	if(typeof s=='undefined'){s=uri;}
	return mfs.c.util.txtfmt('<a href="$1">$2</a>',[uri,s]);
};
mfs.c.util.ajax = function(url,callback,argObj) {
	// a dumb ajax async fn. returns response regardless
	// callback is responsible to handle any errors
	if(typeof argObj=='undefined') argObj={};
	argObj.method = 'GET';
	argObj.url = url;
	if(typeof GM_xmlhttpRequest!= 'undefined') { // GM's method, can break through CORS
		argObj.onload = function(r){
			if(r.readyState===4) {
				console.log(r);
				callback(r);
			}
		};
		argObj.onerror = function(){console.log('error');};
		GM_xmlhttpRequest(argObj);
		console.log('GM xhr sent',argObj);
	} else { // standard method
		console.log('Standard xhr');
		var xhr = new XMLHttpRequest();
		if(argObj.responseType) xhr.responseType = argObj.responseType;
		if(argObj.mimeType) xhr.overrideMimeType(argObj.mimeType);
		xhr.onload = function(r){
				console.log('it\'s ready!');
				callback(r.target);
		};
		xhr.open('Get', url);
		xhr.send();
		console.log('Standard xhr sent');
	}
};
mfs.c.util.dlImg = function(imgEl,imgtype,callback) {
	if (!imgtype) imgtype=mfs.c.vars.imgDlType||'image/png';
	//mfs.c.print('Downloading '+name);
	//mfs.c.print(imgtype);
	
	// core functionality put in callback to handle both cached and uncached situations
	var hcallback = function(img,himgtype){
		console.log(himgtype);
		try {
		var canvas = document.createElement('canvas');
		canvas.width = img.width;
		canvas.height = img.height;
		var ctx = canvas.getContext('2d');
		ctx.drawImage(img,0,0);
		var dataURL = canvas.toDataURL(himgtype);
		
		var namergx = mfs.c.state.regex.filename3 || /([^/\\&\?]+)\.\w{3,4}(?=([\?&].*$|$))/;
		var name = namergx.exec(imgEl.src)[1] || imgEl.src,
			ext = (himgtype==='image/jpeg') ?'.jpg' :'.png';
		var a = document.createElement('a');
		a.download = (name||'image')+ext;
		a.href=dataURL.replace(himgtype,'application/mfs-c-png');
		//console.log(img, dataURL.replace('image/png','application/mfs-c-png'));
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
		hcallback(e.target,imgtype);
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
mfs.c.util.processImgDlQueue = function(){
	// quit if nothing in queue /or dl is in progress/
	if(mfs.c.state.imgDlQueue.length===0) return false;
	
	mfs.c.print(mfs.c.state.imgDlQueue.length + ' images in download queue',3);
	// call the dl fn, set callback fn
	mfs.c.util.dlImg(mfs.c.state.imgDlQueue[0],mfs.c.vars.imgDlType, function() {
		if(mfs.c.state.imgDlQueue.length<=1) { // no more img to process
			mfs.c.state.imgDlQueue=[];
			mfs.c.state.imgDlTimeoutID=0;
			mfs.c.print('Finished images in download queue',3);
		} else { // continue, call this fn again using the timeout
			mfs.c.state.imgDlQueue.shift();
			var delay = mfs.c.vars.imgDlDelay || 10;
			mfs.c.state.imgDlTimeoutID=setTimeout(mfs.c.util.processImgDlQueue,delay);
		}
	});
};

// built-in commands
mfs.c.cmd = mfs.c.cmd||{};
mfs.c.cmd.null = function() {}; // sinkhole
mfs.c.cmd.time = function(argObj) {
	now = new Date();
	if (argObj.iso) { mfs.c.print(now.toISOString()); }
	else if (argObj.t) { mfs.c.print(now.toTimeString()); }
	else if (argObj.d) { mfs.c.print(now.toDateString()); }
	else { mfs.c.print(now.toString()); }
};
mfs.c.cmd.listimg = function(args) {
	// main function, called as callback to ajax later in this fn
	var listimgCallback = function(docObj,args){
		var o=[];
		var domlist = docObj.getElementsByTagName('img'),
			imgarray = [].slice.call(domlist);
		mfs.c.print(docObj.title + ' - ' + imgarray.length + ' images:');
		for(var i=0;i<imgarray.length;i++){	
			//filter properties
			if (imgarray[i].width<args.w || imgarray[i].width>args.W) continue;
			if (imgarray[i].height<args.h || imgarray[i].height>args.H) continue;
			
			var src = imgarray[i].dataset.src || imgarray[i].src; //lazyload support
			var s = mfs.c.state.regex.filename.exec(src);
			s = (!s || !args['short'])? src : s;
			var dims = (args.dims)? ' (' + imgarray[i].width + 'x' + imgarray[i].height +')' : '';
			
			// add to array
			if (args.thumb) {
				o.push('<span class="lnoutput mfs-c-gallery">' +(i+1)+ ': <a href="' +src+ '" title="' +src+ '"><img src="' +src+ '" style="max-width:150px"/></a></span>');
			} else {
				o.push('<span class="lnoutput normal">' +(i+1)+ ': <a href="' +src+ '" title="' +src+ '">' +s+ '</a>' +dims+ '</span>');
			}
		}
		mfs.c.output.innerHTML+=o.join('');
	};
	
	// Async ajax layer for imglist. Allows ajax load of another document uri on which imglist is performed
	if(args[0]) {
		mfs.c.util.ajax(args[0],function(r){
			if(r.status===200) {
				listimgCallback(r.responseXML,args);
			} else {
				mfs.c.print('Error loading ' + args[0] + ' : ' + r.status,5);
			}
		},{responseType:'document'});
	} else {
		listimgCallback(document,args);
	}
};
mfs.c.cmd.dlimg = function(args){
	if (args.clear) { // clear the queue
		mfs.c.state.imgDlQueue = [];
		clearTimeout(mfs.c.state.imgDlTimeoutID);
		mfs.c.state.imgDlTimeoutID = 0;
		mfs.c.print('cleared download queue',3);
		return 0;
	} else if (args.listqueue) {
		for(var i=0; i<mfs.c.state.imgDlQueue.length; i++) {
			mfs.c.print(mfs.c.state.imgDlQueue[i].src)
		}
	} else if (args[0]||args[1]||args[2]) {
		mfs.c.print('Downloading the specified images...');
		var s = args[0],
		start=Number(args[1]) || 1,
		end  =Number(args[2]) || 10,
		d = (end>=start)?1:-1;
		var imgarray=[];
		for(var i=start;i<=end;i+=d) {
			var imgEl= document.createElement('img');
			imgEl.src = s.replace('$1',i);
			imgarray.push(imgEl);
		}
		console.log(imgarray);
	} else {
		mfs.c.print('Downloading images on this page...');
		//var domlist = document.getElementsByTagName('img')
		var imgarray = document.getElementsByTagName('img');//[].slice.call(domlist)
	}
	
	var checklist=[];
	var fileregex = mfs.c.state.regex.filename2 || /[^/\\&\?]+\.\w{3,4}(?=([\?&].*$|$))/g;
	for (var i=0; i<imgarray.length; i++) {	
		// discard improperly named resources
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

mfs.c.cmd.genlinks = function(argObj) {
	if (!argObj[0]) {
		mfs.c.print('Not enough arguments',5);
		return false;
	}
	var s = argObj[0],
		start=Number(argObj[1]) || 1,
		end  =Number(argObj[2])	|| 10;
	for(var i=start; i<=end; i++) {
		mfs.c.print(mfs.c.util.htmlLink(s.replace('$1',i)));
	}
};

mfs.c.cmd.type = function(argObj){
	if (!argObj[0]) {
		mfs.c.print('Not enough arguments',5);
		return false;
	}
	mfs.c.util.ajax(argObj[0],function(r){
		if(r.status==200) {
			mfs.c.print(decodeURI(encodeURI(r.responseText)), 2,true);
		} else {
			mfs.c.print('Error loading ' +argObj[0]+ ' : ' +r.status+ ' - ' +r.statusText,5);
		}
	});
};
mfs.c.cmd.exec = function(argObj){
	// batch parser with timestamp support
	if (!argObj[0]) {
		mfs.c.print('Not enough arguments',5);
		return false;
	}
	mfs.c.util.ajax(argObj[0],function(r){
		if(r.status==200) {
			var lines = r.responseText.split('\n'),
				rgx = mfs.c.state.regex.timedbatch || /^(\d*)\b(.*)$/m,
				m, t, s,
				tout=[];
			for(var i=0;i<lines.length;i++){
				m=rgx.exec(lines[i]);
				if(!m) continue;
				t=Number(m[1])||0;
				s=m[2].trim();
				if(t>0) {// timed 
					tout.push(setTimeout(function(s){mfs.c.parse(s,true);},t,s));
				} else {
					mfs.c.parse(s,true); // parse with batch flag on
				}
			}
		} else {
			mfs.c.print('Error loading ' + argObj[0] + ' : ' + r.status,5);
		}
	});
};

// command table (name as typed : fn)
mfs.c.cmdTable = {
	"listimg"	: mfs.c.cmd.listimg,
	"imglist"	: mfs.c.cmd.listimg,
	"time"		: mfs.c.cmd.time,		// disp time
	"play"		: mfs.c.cmd.av,			// play web media
	"genlinks"	: mfs.c.cmd.genlinks,	// given string and 2 ranges, generate links
	"dlimg"		: mfs.c.cmd.dlimg,		// dl images, can take same arg as genlinks
	"type"		: mfs.c.cmd.type,		// type file
	"exec"		: mfs.c.cmd.exec 		// batch parser
};
// just a list of commands directly interpreted by parser
mfs.c.cmdlist=['echo','clear','cls','clc','help','reload','var','savevar','rem'];

// PARSE ROUTINE
mfs.c.parse = function(s,batch) {
	// echo. suppress if batch
	if(!batch && mfs.c.vars.echo) {mfs.c.print(s,1);}
	
	// parse command and args
	var cmd=s.trim(),
		args='',
		argsObj={};
	if(s.indexOf(' ')>0) {
		cmd = s.substr(0,s.indexOf(' ')).trim().toLowerCase();
		args = s.substr(s.indexOf(' ')+1);
		argsObj = mfs.c.argObj(args);
	}
	console.log(cmd,args);
	//return false;//debug
	
	// start executing commands
	// note: maybe make this obsolete?
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
		case 'reload':
			location.reload();
			break;
		case 'help':
			var li=[].slice.call(mfs.c.cmdlist);
			for (var key in mfs.c.cmdTable) {
				if(mfs.c.cmdTable.hasOwnProperty(key)) li.push(key);
			}
			li.sort();
			mfs.c.print(li.join('\n'));
			//delete li;
			break;
		case 'var':
			if(args.length) {
				// set var
				key=args.split(' ')[0];
				value=args.split(' ')[1]||undefined;
				value=isNaN(value)?value:Number(value);//conv to number if possible
				mfs.c.vars[key]=value;
				mfs.c.print(key + '=' + value);
			} else {
				// print vars
				for(var key in mfs.c.vars){
					mfs.c.print(key + '=' + mfs.c.vars[key]);
				}
			}
			break;
		case 'savevar':
			GM_setValue('vars',JSON.stringify(mfs.c.vars));
			mfs.c.print('Saved',3); 
			break;
		case 'what':
			if(args=='is love?') mfs.c.cmd.exec({0:'http://localhost:28373/whatislove.txt'});
			break;
		default:
			// lookup command table
			var done=false;
			for(var key in mfs.c.cmdTable) {
				if(cmd==key) {
					mfs.c.cmdTable[key](argsObj);
					done=true;
					break;
				}
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
mfs.c.print=function(s,type,htmlescape,append) {
	var typedef = { // type definition
		0: 'normal',
		1: 'input',
		2: 'textdump',
		3: 'info',
		4: 'warn',
		5: 'error',
		6: 'important'
	};
	if (typeof type=='undefined') type=0;
	stype = typedef.hasOwnProperty(type)? typedef[type] : 'normal';
	var oel=document.createElement('span');
	oel.className="lnoutput " + stype;
	lines = s.replace(/\t/g,'    ').split('\n');
	if(htmlescape) {
		for(var i=0; i<lines.length; i++) {
			oel.appendChild(document.createTextNode(lines[i]));
			oel.appendChild(document.createElement('br'));
		}
	} else { oel.innerHTML+=lines.join('<br/>'); }
	mfs.c.output.appendChild(oel);
};
mfs.c.fprint=function(s,args,type) {
	mfs.c.print(mfs.c.util.txtfmt(s,args),type);
};

// COMMAND ADD-IN MANAGER
mfs.c.addCmd = function(typename,objname,fn) {
	if(mfs.c.cmd[objname]) {
		mfs.c.print('Error: Command of that name already exists!',5);
	} else {
		mfs.c.cmd[objname] = fn;
		mfs.c.cmdTable[typename]=mfs.c.cmd[objname];
	}
};
mfs.c.rmvCmd = function(objname) {
	//
};

mfs.c.init = function() {
	mfs.c.container = mfs.c.container || document.createElement('div');
	mfs.c.container.id = "mfs-c-container";
	
	mfs.c.input = mfs.c.input || document.createElement('input');
	mfs.c.input.type = 'text';
	mfs.c.input.id   = 'mfs-c-input';
	mfs.c.histDOM = mfs.c.histDOM || document.createElement('datalist');
	mfs.c.histDOM.id = 'mfs-c-inputlist';
	mfs.c.input.setAttribute('list','mfs-c-inputlist');
	
	mfs.c.output = mfs.c.output || document.createElement('div');
	mfs.c.output.id  = 'mfs-c-output';
	
	mfs.c.container.appendChild(mfs.c.input);
	mfs.c.container.appendChild(mfs.c.histDOM);
	mfs.c.container.appendChild(mfs.c.output);
	document.body.appendChild(mfs.c.container);
	mfs.c.container.style.display="none";
	
	mfs.c.container.addEventListener('keypress',function(e){
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
	/*mfs.c.output.onresize = function(){
		mfs.c.input.style.width = mfs.c.output.style.width
	}*/
	
	mfs.c.styleEl = document.createElement('style');
	mfs.c.styleEl.innerHTML = mfs.c.style;
	document.body.appendChild(mfs.c.styleEl);
	mfs.c.print([mfs.c.state.title,mfs.c.state.ver].join(' '));
	mfs.c.cmd.time({});
	
	mfs.c.state.loaded=true;
	console.log('mfs js console loaded');
};

document.addEventListener('keypress',function(e) {
		if(e.key!==mfs.c.state.togglekey) return false;
		if (!mfs.c.state.loaded) mfs.c.init();
		
		mfs.c.state.visible=!mfs.c.state.visible;
		mfs.c.container.style.display = (mfs.c.state.visible) ? "block" : "none";
		e.preventDefault();
		if(mfs.c.state.visible) mfs.c.input.focus();
	});
