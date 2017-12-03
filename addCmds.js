/* addCmds.js
 * This is a file allowing you to edit and add custom commands to MFSJSC.
 * Adding custom commands is achieved by passing structured objects to a mfs.c.customCommands array.
 * The object should have the following properties:
 *  name: (required) Name as typed. Should be unique.
 *  namespace: (required) Unique namespace. If name conflicts with existing commands namespace should be included.
 *  fn:   The command function itself, accepting a single argObj object
 * 
 * Be sure to regularly make backups of this file, just in case an update overwrites this file.
 */

// Namespace declarations
var mfs = this.mfs || {};
mfs.c = mfs.c || {};
// The container array for custom commands
mfs.c.customCommands = mfs.c.customCommands || [];

mfs.c.customCommands.push({
	name:"anidb",
	namespace: 'mfs',
	description: 'WIP',
	fn: (argObj) => {
		var db = JSON.parse(mfs.c.vars.anidb || "{}");
		var actions = {
			"list" : (argObj) => {
				for(var n in db.animes) {}
			}
		}
	}
});

mfs.c.customCommands.push({
	name: "echolrc",
	namespace: 'mfs',
	description: 'Opens LRC files and print lyrics set to their timecodes',
	fn: (argObj) => {
		if (!argObj[0]) {
			mfs.c.print('Not enough arguments',5);
			return false;
		}
		var rgx = /^\[(\d+):(\d+\.\d+)\](.*)/;
		
		mfs.c.util.ajax(argObj[0], (r) => {
			if (r.status===200) {
				var text = decodeURI(encodeURI(r.responseText));
				var lines = text.split('\n');
				console.log(lines.length);
				for (var i=0; i<lines.length; i++) {
					var s = lines[i].replace(/<\d+:\d+.\d+>/gm,"");
					var m = rgx.exec(s);
					if (!m) continue;
					if (m[2]) {
						var t = Number(m[1])*60000 + Number(m[2])*1000;
						console.log(t, m[3]);
						setTimeout(function(s) {mfs.c.print(s, 2)}, t, m[3]);
					}
				}
			} else {
				mfs.c.print('welp',5)
			}
		})
	}
})

mfs.c.customCommands.push({
	name: "nhdl",
	namespace: 'mfs',
	description: 'Prepares string to pass to the nhdl ahk script',
	fn: (argObj) => {
		if (!location.hostname.match('nhentai.net')) return;
		
		let imageUrl = document.body.querySelector('#cover img').dataset.src;
		let count = document.body.querySelectorAll('.thumb-container').length;
		let title = document.body.querySelector('h1').textContent;
		title = title.replace(/^\([^)]*\)\s?/, '') // remove (convention info) at the start
		infoPattern = /\s*(\[[^\]]*\]|{[^}]*}|(==).*\2)$/; // matches [tags] {tags} ==tags== at the end (but not series tag)
		while ( title.match(infoPattern) ) {
			title = title.replace(infoPattern, '');
		}
		
		// try to figure out categDir
		let categDir;
		// if specified, use it 
		if (argObj[0]) {
			categDir = argObj[0];
		} else {
			// if not, look firstly at the series
			const seriesPatterns = {
				'!AMAGAMI'  : /^amagami/i,
				'!ANGEL'    : /^angel beats!/i,
				'!CHUUNI'   : /^chuunibyou/i,
				'!GJ-BU'    : /^GJ-Bu/i,
				'!HARUHI'   : /haruhi suzumiya/i,
				'!HOLO'     : /^Spice and Wolf/i,
				'!HYOUKA'   : /^Hyouka/i,
				'!KONOSUBA'  : /^kono subarashii/i,
				'!KYOUKAI'  : /^Kyoukai no Kanata/i,
				'!LUCKY'    : /^Lucky Star/i,
				'!Monogatari' : /^(bake|nise|kuro)monogatari/i,
				'!NGE'      : /^Neon Genesis/i,
				'!Nisekoi'  : /^Nisekoi/i,
				'!OREGAIRU' : /^Yahari Ore no/i,
				'!OREIMO'   : /^Ore no Imouto ga Konna/i,
				'!RE:ZERO'  : /^Re Zero kara/i,
				'!SAO'      : /Sword Art Online/i,
				'!TOARU'    : /^Toaru (Majutsu|Kagaku)/i,
				'!TORADORA' : /^Toradora/i
			};
			
			let seriesCollection = document.body.querySelector('#tags .tag-container:first-child .tag');
			let seriesList = [];
			seriesCollection.forEach( item => { seriesList.push( item.childNodes[0].textContent.trim() ) } );
			let seriesMatches = {};
			
			for (let k in seriesPatterns) {
				for (let seriesName of seriesList) {
					if (seriesName.match(seriesPatterns[k])) {
						seriesMatches[k] = seriesMatches[k] + 1 || 1;
					}
				}
			}
			let bestMatch = Object.keys(seriesMatches).reduce( (a, b) => seriesMatches[a] > seriesMatches[b] ? a : b );
		}
		
		// then, failing that, look for tag that can suggest the correct category
		if (!categDir) {
			let wantedTags = {
				lolicon: 0,
				shotacon: 0,
				yaoi: 0
			};		
			let tagCollection = document.body.querySelectorAll('.tags .tag');		
			tagcollection.forEach( item => { 
				let text = item.childNodes[0].textContent.trim();
				if (wantedTags.hasOwnProperty(text)) wantedTags[text] = true;
			});
			if (wantedTags.yaoi) {
				categDir = 'SY';
			} else if (wantedTags.lolicon && wantedTags.shotacon) {
				categDir = 'LS';
			} else if (wantedTags.lolicon) {
				categDir = 'LOL';
			} else if (wantedTags.shotacon) {
				categDir = 'SY';
			} else {
				categDir = 'H';
			}
		}
		
		GM_setClipboard(`#NHDL§${imageUrl}§${count}§${categDir}§${title}`);
	}
});