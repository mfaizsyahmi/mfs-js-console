// BUILT-IN COMMANDS
mfs = this.mfs || {};
mfs.c = mfs.c || {};
mfs.c.cmd = mfs.c.cmd||{};

mfs.c.cmd.null = function() {}; // sinkhole
mfs.c.cmd.time = function(argObj) {
	now = new Date();
	if (argObj.iso||argObj.ISO) { mfs.c.print(now.toISOString()); }
	else if (argObj.t) { mfs.c.print(now.toTimeString()); }
	else if (argObj.d) { mfs.c.print(now.toDateString()); }
	else if (argObj.utc||argObj.UTC) { mfs.c.print(now.toUTCString()); }
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
				o.push('<span class="lnoutput mfs-c-gallery">' +(i+1)+ ': <a href="' +src+ '" title="' +src+ '" target="_blank"><img src="' +src+ '" style="max-width:150px"/></a></span>');
			} else {
				o.push('<span class="lnoutput normal">' +(i+1)+ ': <a href="' +src+ '" title="' +src+ '" target="_blank">' +s+ '</a>' +dims+ '</span>');
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
mfs.c.cmd.dlimg = function(args) {
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
		console.log(sp)
		
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
	for(var i=0; i<numrange.length; i++) {
		mfs.c.print(mfs.c.util.htmlLink(sp.replace('$1',numrange[i])));
	}
};

// TYPE - print contents of text file
mfs.c.cmd.type = function(argObj) {
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

// EXEC - batch parser with timestamp support
mfs.c.cmd.exec = function(argObj) {
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
		mfs.c.fprint('$1 aliases in total', [alist.length], 3);
		if (alist.length) { mfs.c.print( alist.join('\n') ); }
		
	} else if (!argObj[1]) { // remove alias
		if (mfs.c.aliases.hasOwnProperty(argObj[0]) ) {delete mfs.c.aliases[ argObj[0] ];}
		GM_setValue('aliases', JSON.stringify(mfs.c.aliases) ); // save
		
	} else if (argObj[1]) { // add alias
		mfs.c.aliases[ argObj[0] ] = argObj[1]; // always override existing aliases
		GM_setValue('aliases', JSON.stringify(mfs.c.aliases) ); // save
	}
};

// VAR - moved here after it expanded to do query selection
// "var name $ selector prop [name]"
mfs.c.cmd.vars = function(argsObj) {
	if (!argsObj[0]) {  // print vars
		for(var key in mfs.c.vars) {
			mfs.c.print(key + '=' + mfs.c.vars[key]);
		}
	} else { // set var
		var key=argsObj[0];
		if(argsObj[1]==='$' && argsObj[3]) { // args satisfy query syntax
			// do a query selection and get the attribute value
			var nl = document.querySelectorAll(argsObj[2]);
			switch(argsObj[3]) { // what property to read
			case "attr":
				var value = (argsObj[4])? nl[0].getAttribute( argsObj[4] ): el.innerText;
				break;
			case "text":
				var value = nl[0].innerText;
				break;
			case "count":
				var value = nl.length;
				break;
			}
		} else { var value = argsObj[1]||undefined;}
		value = isNaN(value)? value: Number(value);//conv to number if possible
		mfs.c.vars[key] = value;
		mfs.c.print(key + '=' + value);
	}
	
}

// command table (name as typed : fn)
mfs.c.cmdTable = {
	"listimg"	: mfs.c.cmd.listimg,
	"imglist"	: mfs.c.cmd.listimg,
	"time"		: mfs.c.cmd.time,		// disp time
	"play"		: mfs.c.cmd.av,			// play web media
	"genlinks"	: mfs.c.cmd.genlinks,	// given string and 2 ranges, generate links
	"dlimg"		: mfs.c.cmd.dlimg,		// dl images, can take same arg as genlinks
	"type"		: mfs.c.cmd.type,		// type file
	"exec"		: mfs.c.cmd.exec, 		// batch parser
	"alias"		: mfs.c.cmd.alias,		// alias registrar
	"var"		: mfs.c.cmd.vars		// variable get/set and query selector
};