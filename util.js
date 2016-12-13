//namespaces
mfs = this.mfs || {};
mfs.c = mfs.c || {};

// UTILITY FUNCTIONS
mfs.c.util = mfs.c.util||{};

// http://stackoverflow.com/questions/770523
mfs.c.util.addslashes = function( str ) {
    return (str + '').replace(/[\\"']/g, '\\$&').replace(/\u0000/g, '\\0');
}

mfs.c.util.txtfmt = function(s,ar) { // formats text, replace $n with array of strings (1-based)
	for(var x=1; ; x++ ) {
		if (!ar.hasOwnProperty(x-1)) {break;}
		s = s.replace( '$'+x, ar[x-1] || '');
	}
	return s;
};
mfs.c.util.txtfmt2 = function(s,obj) { // formats text, but with named arguments (used to subst variables)
//	s = s.replace('$$', '$')
	for(var n in obj) {
		if (obj.hasOwnProperty(n)) {
			s = s.replace('$'+n, obj[n]);
		}
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
mfs.c.util.processImgDlQueue = function() {
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

mfs.c.util.parseQueue = function(s,argsObj) {
	if (!mfs.c.state.parseQueue.length) {
		mfs.c.state.parseTimeoutID = 0;
		return false;
	}
	mfs.c.state.parseTimeoutID = setTimeout( function(s, argObj){
		mfs.c.parse( mfs.c.util.txtfmt(s, argsObj) ,true);
		//mfs.c.state.parseQueue.shift();
	}(mfs.c.state.parseQueue[0], argsObj), 0)
}

mfs.c.util.isGlobalPoster = function() {
	//console.log('isGlobalPoster is called', mfs.c.vars.global, GM_getValue('globalPosterRef',null));
	return ( mfs.c.vars.global && GM_getValue('globalPosterRef',null)===location.href );
}