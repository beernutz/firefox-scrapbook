
var sbContentSaver = {


	name         : "",
	item         : null,
	contentDir   : null,
	httpTask     : {},
	file2URL     : {},
	file2Doc     : {},
	option       : {},
	refURLObj    : null,
	favicon      : null,
	frameList    : [],
	frames      : [],
	isMainFrame  : true,
	selection    : null,
	linkURLs     : [],



	flattenFrames : function(aWindow)
	{
		var ret = [aWindow];
		for ( var i = 0; i < aWindow.frames.length; i++ )
		{
			ret = ret.concat(this.flattenFrames(aWindow.frames[i]));
		}
		return ret;
	},

	init : function(aPresetData)
	{
		this.item = ScrapBookData.newItem();
		this.name = "index";
		this.favicon = null;
		this.file2URL = { "index.dat" : true, "index.png" : true, "sitemap.xml" : true, "sb-file2url.txt" : true, "sb-url2name.txt" : true, };
		this.option   = { "dlimg" : false, "dlsnd" : false, "dlmov" : false, "dlarc" : false, "custom" : "", "inDepth" : 0, "isPartial" : false, "images" : true, "styles" : true, "script" : false };
		this.linkURLs = [];
		this.frameList = [];
		this.frames = [];
		this.isMainFrame = true;
		if ( aPresetData )
		{
			if ( aPresetData[0] ) this.item.id  = aPresetData[0];
			if ( aPresetData[1] ) this.name     = aPresetData[1];
			if ( aPresetData[2] ) this.option   = aPresetData[2];
			if ( aPresetData[3] ) this.file2URL = aPresetData[3];
			if ( aPresetData[4] >= this.option["inDepth"] ) this.option["inDepth"] = 0;
		}
		this.httpTask[this.item.id] = 0;
	},

	captureWindow : function(aRootWindow, aIsPartial, aShowDetail, aResName, aResIndex, aPresetData, aContext)
	{
		this.init(aPresetData);
		this.item.chars  = aRootWindow.document.characterSet;
		this.item.source = aRootWindow.location.href;
		if ( "gBrowser" in window && aRootWindow == gBrowser.contentWindow )
		{
			this.item.icon = gBrowser.mCurrentTab.image;
		}
		this.frameList = this.flattenFrames(aRootWindow);
		var titles = aRootWindow.document.title ? [aRootWindow.document.title] : [decodeURI(this.item.source)];
		if ( aIsPartial )
		{
			this.selection = aRootWindow.getSelection();
			var lines = this.selection.toString().split("\n");
			for ( var i = 0; i < lines.length; i++ )
			{
				lines[i] = lines[i].replace(/\r|\n|\t/g, "");
				if ( lines[i].length > 0 ) titles.push(lines[i].substring(0,72));
				if ( titles.length > 4 ) break;
			}
			this.item.title = ( titles.length > 0 ) ? titles[1] : titles[0];
		}
		else
		{
			this.selection = null;
			this.item.title = titles[0];
		}
		if ( document.getElementById("ScrapBookToolbox") && !document.getElementById("ScrapBookToolbox").hidden )
		{
			var modTitle = document.getElementById("ScrapBookEditTitle").value;
			if ( titles.indexOf(modTitle) < 0 )
			{
				titles.splice(1, 0, modTitle);
				this.item.title = modTitle;
			}
			this.item.comment = ScrapBookUtils.escapeComment(sbPageEditor.COMMENT.value);
			for ( var i = 0; i < this.frameList.length; i++ ) { sbPageEditor.removeAllStyles(this.frameList[i]); }
		}
		if ( aShowDetail )
		{
			var ret = this.showDetailDialog(titles, aResName, aContext);
			if ( ret.result == 0 ) { return null; }
			if ( ret.result == 2 ) { aResName = ret.resURI; aResIndex = 0; }
		}
		this.contentDir = ScrapBookUtils.getContentDir(this.item.id);
		var newName = this.saveDocumentInternal(aRootWindow.document, this.name);
		if ( this.item.icon && this.item.type != "image" && this.item.type != "file" )
		{
			var iconFileName = this.download(this.item.icon);
			this.favicon = iconFileName;
		}
		if ( this.httpTask[this.item.id] == 0 )
		{
			setTimeout(function(){ sbCaptureObserverCallback.onCaptureComplete(sbContentSaver.item); }, 100);
		}
		if ( this.option["inDepth"] > 0 && this.linkURLs.length > 0 )
		{
			if ( !aPresetData || aContext == "capture-again" )
			{
				this.item.type = "marked";
				this.option["isPartial"] = aIsPartial;
				window.openDialog(
					"chrome://scrapbook/content/capture.xul", "", "chrome,centerscreen,all,dialog=no",
					this.linkURLs, this.refURLObj.spec,
					false, null, 0,
					this.item, this.option, this.file2URL
				);
			}
			else
			{
				for ( var i = 0; i < this.linkURLs.length; i++ )
				{
					sbCaptureTask.add(this.linkURLs[i], aPresetData[4] + 1);
				}
			}
		}
		this.addResource(aResName, aResIndex);
		return [ScrapBookUtils.splitFileName(newName)[0], this.file2URL];
	},

	captureFile : function(aSourceURL, aReferURL, aType, aShowDetail, aResName, aResIndex, aPresetData, aContext)
	{
		this.init(aPresetData);
		this.item.title  = decodeURI(ScrapBookUtils.getFileName(aSourceURL));
		this.item.icon   = "moz-icon://" + this.item.title + "?size=16";
		this.item.source = aSourceURL;
		this.item.type   = aType;
		if ( aShowDetail )
		{
			var ret = this.showDetailDialog(null, aResName, aContext);
			if ( ret.result == 0 ) { return null; }
			if ( ret.result == 2 ) { aResName = ret.resURI; aResIndex = 0; }
		}
		this.contentDir = ScrapBookUtils.getContentDir(this.item.id);
		this.refURLObj  = ScrapBookUtils.convertURLToObject(aReferURL);
		var newName = this.saveFileInternal(aSourceURL, this.name, aType);
		this.addResource(aResName, aResIndex);
		return [ScrapBookUtils.splitFileName(newName)[0], this.file2URL];
	},

	showDetailDialog : function(aTitles, aResURI, aContext)
	{
		var ret = {
			item    : this.item,
			option  : this.option,
			titles  : aTitles || [this.item.title],
			resURI  : aResURI,
			result  : 1,
			context : aContext || "capture"
		};
		window.openDialog("chrome://scrapbook/content/detail.xul" + (aContext ? "?capture" : ""), "", "chrome,modal,centerscreen,resizable", ret);
		return ret;
	},

	saveDocumentInternal : function(aDocument, aFileKey)
	{
		// non-HTML document: process as file saving
		if ( !aDocument.body || !aDocument.contentType.match(/html|xml/i) )
		{
			var captureType = (aDocument.contentType.substring(0,5) == "image") ? "image" : "file";
			if ( this.isMainFrame ) this.item.type = captureType;
			var newLeafName = this.saveFileInternal(aDocument.location.href, aFileKey, captureType);
			return newLeafName;
		}

		// HTML document: save the current DOM
		this.refURLObj = ScrapBookUtils.convertURLToObject(aDocument.location.href);

		var arr = this.getUniqueFileName(aFileKey + ".html", this.refURLObj.spec, aDocument);
		var myHTMLFileName = arr[0];
		var myHTMLFileDone = arr[1];
		if (myHTMLFileDone) return myHTMLFileName;

		var arr = this.getUniqueFileName(aFileKey + ".css", this.refURLObj.spec, aDocument);
		var myCSSFileName = arr[0];

		// construct the tree, especially for capture of partial selection
		if ( this.selection )
		{
			var myRange = this.selection.getRangeAt(0);
			var myDocFrag = myRange.cloneContents();
			var curNode = myRange.commonAncestorContainer;
			if ( curNode.nodeName == "#text" ) curNode = curNode.parentNode;
		}
		// cloned frames has contentDocument = null
		// give all frames an unique id for later retrieving
		var htmlNode = aDocument.getElementsByTagName("html")[0];
		var frames = htmlNode.getElementsByTagName("frame");
		for (var i=0, len=frames.length; i<len; i++) {
			var frame = frames[i];
			var idx = this.frames.length;
			this.frames[idx] = frame;
			frame.setAttribute("data-sb-frame-id", idx);
			if (frame.src == this.refURLObj.spec) frame.setAttribute("data-sb-frame-id", idx);
		}
		var frames = htmlNode.getElementsByTagName("iframe");
		for (var i=0, len=frames.length; i<len; i++) {
			var frame = frames[i];
			var idx = this.frames.length;
			this.frames[idx] = frame;
			frame.setAttribute("data-sb-frame-id", idx);
			if (frame.src == this.refURLObj.spec) frame.setAttribute("data-sb-frame-id", idx);
		}
		// now make the clone
		var tmpNodeList = [];
		if ( this.selection )
		{
			do {
				tmpNodeList.unshift(curNode.cloneNode(false));
				curNode = curNode.parentNode;
			}
			while ( curNode.nodeName.toUpperCase() != "HTML" );
		}
		else
		{
			tmpNodeList.unshift(aDocument.body.cloneNode(true));
		}
		var rootNode = htmlNode.cloneNode(false);
		try {
			var headNode = aDocument.getElementsByTagName("head")[0].cloneNode(true);
			rootNode.appendChild(headNode);
			rootNode.appendChild(aDocument.createTextNode("\n"));
		} catch(ex) {
		}
		rootNode.appendChild(tmpNodeList[0]);
		rootNode.appendChild(aDocument.createTextNode("\n"));
		for ( var n = 0; n < tmpNodeList.length-1; n++ )
		{
			tmpNodeList[n].appendChild(aDocument.createTextNode("\n"));
			tmpNodeList[n].appendChild(tmpNodeList[n+1]);
			tmpNodeList[n].appendChild(aDocument.createTextNode("\n"));
		}
		if ( this.selection )
		{
			this.addCommentTag(tmpNodeList[tmpNodeList.length-1], "DOCUMENT_FRAGMENT");
			tmpNodeList[tmpNodeList.length-1].appendChild(myDocFrag);
			this.addCommentTag(tmpNodeList[tmpNodeList.length-1], "/DOCUMENT_FRAGMENT");
		}

		// process HTML DOM
		this.processDOMRecursively(rootNode);

		// process all inline and link CSS, will merge them into index.css later
		var myCSS = "";
		if ( this.option["styles"] )
		{
			var myStyleSheets = aDocument.styleSheets;
			for ( var i=0; i<myStyleSheets.length; i++ )
			{
				myCSS += this.processCSSRecursively(myStyleSheets[i], aDocument);
			}
			if ( myCSS )
			{
				var newLinkNode = aDocument.createElement("link");
				newLinkNode.setAttribute("media", "all");
				newLinkNode.setAttribute("href", myCSSFileName);
				newLinkNode.setAttribute("type", "text/css");
				newLinkNode.setAttribute("rel", "stylesheet");
				rootNode.firstChild.appendChild(aDocument.createTextNode("\n"));
				rootNode.firstChild.appendChild(newLinkNode);
				rootNode.firstChild.appendChild(aDocument.createTextNode("\n"));
				myCSS = myCSS.replace(/\*\|/g, "");
			}
		}

		// change the charset to UTF-8
		// also change the meta tag; generate one if none found
		this.item.chars = "UTF-8";
		var metas = rootNode.getElementsByTagName("meta"), meta, hasmeta = false;
		for (var i=0, len=metas.length; i<len; ++i) {
			meta = metas[i];
			if (meta.hasAttribute("http-equiv") && meta.hasAttribute("content") &&
				meta.getAttribute("http-equiv").toLowerCase() == "content-type" && 
				meta.getAttribute("content").match(/^[^;]*;\s*charset=(.*)$/i) )
			{
				hasmeta = true;
				meta.setAttribute("content", "text/html; charset=UTF-8");
			}
			else if ( meta.hasAttribute("charset") )
			{
				hasmeta = true;
				meta.setAttribute("charset", "UTF-8");
			}
		}
		if (!hasmeta) {
			// use older version for better compatibility
			var metaNode = aDocument.createElement("meta");
			metaNode.setAttribute("content", aDocument.contentType + "; charset=" + this.item.chars);
			metaNode.setAttribute("http-equiv", "Content-Type");
			rootNode.firstChild.insertBefore(aDocument.createTextNode("\n"), rootNode.firstChild.firstChild);
			rootNode.firstChild.insertBefore(metaNode, rootNode.firstChild.firstChild);
			rootNode.firstChild.insertBefore(aDocument.createTextNode("\n"), rootNode.firstChild.firstChild);
		}

		// generate the HTML and CSS file and save
		var myHTML;
		myHTML = this.surroundByTags(rootNode, rootNode.innerHTML);
		myHTML = this.doctypeToString(aDocument.doctype) + myHTML;
		myHTML = myHTML.replace(/\x00/g, " ");
		var myHTMLFile = this.contentDir.clone();
		myHTMLFile.append(myHTMLFileName);
		ScrapBookUtils.writeFile(myHTMLFile, myHTML, this.item.chars);
		if ( myCSS )
		{
			var myCSSFile = this.contentDir.clone();
			myCSSFile.append(myCSSFileName);
			ScrapBookUtils.writeFile(myCSSFile, myCSS, this.item.chars);
		}
		return myHTMLFile.leafName;
	},

	saveFileInternal : function(aFileURL, aFileKey, aCaptureType)
	{
		if ( !aFileKey ) aFileKey = "file" + Math.random().toString();
		if ( !this.refURLObj ) this.refURLObj = ScrapBookUtils.convertURLToObject(aFileURL);
		if ( this.isMainFrame )
		{
			this.item.icon  = "moz-icon://" + ScrapBookUtils.getFileName(aFileURL) + "?size=16";
			this.item.type  = aCaptureType;
			this.item.chars = "";
		}
		var newFileName = this.download(aFileURL);
		if ( aCaptureType == "image" ) {
			var myHTML = '<html><head><meta http-equiv="Content-Type" content="text/html; Charset=UTF-8"></head><body><img src="' + newFileName + '"></body></html>';
		} else {
			var myHTML = '<html><head><meta http-equiv="Content-Type" content="text/html; Charset=UTF-8"><meta http-equiv="refresh" content="0;URL=./' + newFileName + '"></head><body></body></html>';
		}
		var myHTMLFile = this.contentDir.clone();
		myHTMLFile.append(aFileKey + ".html");
		ScrapBookUtils.writeFile(myHTMLFile, myHTML, "UTF-8");
		return myHTMLFile.leafName;
	},

	addResource : function(aResName, aResIndex)
	{
		if ( !aResName ) return;
		var res = ScrapBookData.addItem(this.item, aResName, aResIndex);
		ScrapBookUtils.refreshGlobal(false);
		if ( this.favicon )
		{
			var iconURL = "resource://scrapbook/data/" + this.item.id + "/" + this.favicon;
			setTimeout(function(){
				ScrapBookData.setProperty(res, "icon", iconURL);
			}, 500);
			this.item.icon = this.favicon;
		}
		ScrapBookUtils.writeIndexDat(this.item);
		if ( "ScrapBookBrowserOverlay" in window ) ScrapBookBrowserOverlay.updateFolderPref(aResName);
	},


	surroundByTags : function(aNode, aContent)
	{
		var tag = "<" + aNode.nodeName.toLowerCase();
		for ( var i=0; i<aNode.attributes.length; i++ )
		{
			tag += ' ' + aNode.attributes[i].name + '="' + aNode.attributes[i].value + '"';
		}
		tag += ">\n";
		return tag + aContent + "</" + aNode.nodeName.toLowerCase() + ">\n";
	},

	addCommentTag : function(targetNode, aComment)
	{
		targetNode.appendChild(targetNode.ownerDocument.createTextNode("\n"));
		targetNode.appendChild(targetNode.ownerDocument.createComment(aComment));
		targetNode.appendChild(targetNode.ownerDocument.createTextNode("\n"));
	},

	removeNodeFromParent : function(aNode)
	{
		var newNode = aNode.ownerDocument.createTextNode("");
		aNode.parentNode.replaceChild(newNode, aNode);
		aNode = newNode;
		return aNode;
	},

	doctypeToString : function(aDoctype)
	{
		if ( !aDoctype ) return "";
		var ret = "<!DOCTYPE " + aDoctype.name;
		if ( aDoctype.publicId ) ret += ' PUBLIC "' + aDoctype.publicId + '"';
		if ( aDoctype.systemId ) ret += ' "'        + aDoctype.systemId + '"';
		ret += ">\n";
		return ret;
	},


	processDOMRecursively : function(rootNode)
	{
		for ( var curNode = rootNode.firstChild; curNode != null; curNode = curNode.nextSibling )
		{
			if ( curNode.nodeName == "#text" || curNode.nodeName == "#comment" ) continue;
			curNode = this.inspectNode(curNode);
			this.processDOMRecursively(curNode);
		}
	},

	inspectNode : function(aNode)
	{
		switch ( aNode.nodeName.toLowerCase() )
		{
			case "img" : 
			case "embed" : 
			case "source":  // in <audio> and <vedio>
				if ( aNode.hasAttribute("src") ) {
					if ( this.option["images"] ) {
						var aFileName = this.download(aNode.src);
						if (aFileName) aNode.setAttribute("src", aFileName);
					} else {
						aNode.setAttribute("src", aNode.src);
					}
				}
				break;
			case "object" : 
				if ( aNode.hasAttribute("data") ) {
					if ( this.option["images"] ) {
						var aFileName = this.download(aNode.data);
						if (aFileName) aNode.setAttribute("data", aFileName);
					} else {
						aNode.setAttribute("data", aNode.src);
					}
				}
				break;
			case "track" :  // in <audio> and <vedio>
				if ( aNode.hasAttribute("src") ) {
					aNode.setAttribute("src", aNode.src);
				}
				break;
			case "body" : 
			case "table" : 
			case "tr" : 
			case "th" : 
			case "td" : 
				// handle "background" attribute (HTML5 deprecated)
				if ( aNode.hasAttribute("background") ) {
					var url = ScrapBookUtils.resolveURL(this.refURLObj.spec, aNode.getAttribute("background"));
					if ( this.option["images"] ) {
						var aFileName = this.download(url);
						if (aFileName) aNode.setAttribute("background", aFileName);
					} else {
						aNode.setAttribute("background", url);
					}
				}
				break;
			case "input" : 
				switch (aNode.type.toLowerCase()) {
					case "image": 
						if ( aNode.hasAttribute("src") ) {
							if ( this.option["images"] ) {
								var aFileName = this.download(aNode.src);
								if (aFileName) aNode.setAttribute("src", aFileName);
							} else {
								aNode.setAttribute("src", aNode.src);
							}
						}
						break;
				}
				break;
			case "link" : 
				// gets "" if rel attribute not defined
				switch ( aNode.rel.toLowerCase() ) {
					case "stylesheet" :
						if ( aNode.href.indexOf("chrome://") != 0 || !this.option["styles"] ) {
							return this.removeNodeFromParent(aNode);
						}
						break;
					case "shortcut icon" :
					case "icon" :
						if ( aNode.hasAttribute("href") ) {
							var aFileName = this.download(aNode.href);
							if (aFileName) {
								aNode.setAttribute("href", aFileName);
								if ( this.isMainFrame && !this.favicon ) this.favicon = aFileName;
							}
						}
						break;
					default :
						if ( aNode.hasAttribute("href") ) {
							aNode.setAttribute("href", aNode.href);
						}
						break;
				}
				break;
			case "base" : 
				if ( aNode.hasAttribute("href") ) {
					aNode.setAttribute("href", "");
				}
				break;
			case "style" : 
				// CSS in the page will be handled in another way, so remove them here
				return this.removeNodeFromParent(aNode);
				break;
			case "script" : 
			case "noscript" : 
				if ( this.option["script"] ) {
					if ( aNode.hasAttribute("src") ) {
						var aFileName = this.download(aNode.src);
						if (aFileName) aNode.setAttribute("src", aFileName);
					}
				} else {
					return this.removeNodeFromParent(aNode);
				}
				break;
			case "a" : 
			case "area" : 
				if ( !aNode.href ) {
					break;
				}
				else if ( aNode.href.match(/^javascript:/i) && !this.option["script"] ) {
					aNode.removeAttribute("href");
					break;
				}
				// Relative links to self need not be parsed
				// If has selection (i.e. partial capture), the captured page is incomplete,
				// do the subsequent URL rewrite so that it is targeting the source page
				else if ( !this.selection && aNode.getAttribute("href").match(/^(?:#|$)/) ) {
					break;
				}
				// determine whether to download (copy) the link target file
				var ext = ScrapBookUtils.splitFileName(ScrapBookUtils.getFileName(aNode.href))[1].toLowerCase();
				var flag = false;
				switch ( ext )
				{
					case "jpg" : case "jpeg" : case "png" : case "gif" : case "tiff" : flag = this.option["dlimg"]; break;
					case "mp3" : case "wav"  : case "ram" : case "rm"  : case "wma"  : flag = this.option["dlsnd"]; break;
					case "mpg" : case "mpeg" : case "avi" : case "mov" : case "wmv"  : flag = this.option["dlmov"]; break;
					case "zip" : case "lzh"  : case "rar" : case "jar" : case "xpi"  : flag = this.option["dlarc"]; break;
					default : 
						// copy files with custom defined extensions
						if ( ext && this.option["custom"] &&
							( (", " + this.option["custom"] + ", ").indexOf(", " + ext + ", ") != -1 ) ) {
							flag = true;
						}
						// do not copy, but add to the link list if it's a work of deep capture
						else {
							if ( this.option["inDepth"] > 0 ) this.linkURLs.push(aNode.href);
						}
				}
				// do the copy or URL rewrite
				if ( flag ) {
					var aFileName = this.download(aNode.href);
					if (aFileName) aNode.setAttribute("href", aFileName);
				} else {
					aNode.setAttribute("href", aNode.href);
				}
				break;
			case "form" : 
				if ( aNode.hasAttribute("action") ) {
					aNode.setAttribute("action", aNode.action);
				}
				break;
			case "meta" : 
				if ( aNode.hasAttribute("property") ) {
					switch ( aNode.getAttribute("property").toLowerCase() ) {
						case "og:image" :
						case "og:image:url" :
						case "og:image:secure_url" :
						case "og:audio" :
						case "og:audio:url" :
						case "og:audio:secure_url" :
						case "og:video" :
						case "og:video:url" :
						case "og:video:secure_url" :
							if ( aNode.hasAttribute("content") ) {
								var url = ScrapBookUtils.resolveURL(this.refURLObj.spec, aNode.getAttribute("content"));
								if ( this.option["images"] ) {
									var aFileName = this.download(url);
									if (aFileName) aNode.setAttribute("content", aFileName);
								}
								else {
									aNode.setAttribute("content", url);
								}
							}
							break;
						case "og:url" :
							if ( aNode.hasAttribute("content") ) {
								var url = ScrapBookUtils.resolveURL(this.refURLObj.spec, aNode.getAttribute("content"));
								aNode.setAttribute("content", url);
							}
							break;
					}
				}
				break;
			case "frame"  : 
			case "iframe" : 
				this.isMainFrame = false;
				if ( this.selection ) this.selection = null;
				var tmpRefURL = this.refURLObj;
				// retrieve contentDocument from the corresponding real frame
				var idx = aNode.getAttribute("data-sb-frame-id");
				var newFileName = this.saveDocumentInternal(this.frames[idx].contentDocument, this.name + "_" + (parseInt(idx)+1));
				aNode.setAttribute("src", newFileName);
				aNode.removeAttribute("data-sb-frame-id");
				this.refURLObj = tmpRefURL;
				break;
			// Deprecated, like <pre> but inner contents are escaped to be plain text
			// Replace with <pre> since it breaks ScrapBook highlights
			case "xmp" : 
				var pre = aNode.ownerDocument.createElement("pre");
				pre.appendChild(aNode.firstChild);
				aNode.parentNode.replaceChild(pre, aNode);
				break;
		}
		if ( aNode.style && aNode.style.cssText )
		{
			var newCSStext = this.inspectCSSText(aNode.style.cssText, this.refURLObj.spec, true);
			if ( newCSStext ) aNode.setAttribute("style", newCSStext);
		}
		if ( !this.option["script"] )
		{
			// general: remove on* attributes
			var attrs = aNode.attributes;
			for (var i = 0; i < attrs.length; i++) {
				if (attrs[i].name.toLowerCase().indexOf("on") == 0) {
					aNode.removeAttribute(attrs[i].name);
					i--;  // removing an attribute shrinks the list
				}
			}
			// other specific
			aNode.removeAttribute("contextmenu");
		}
		return aNode;
	},

	processCSSRecursively : function(aCSS, aDocument, isImport)
	{
		if (!aCSS || aCSS.disabled) return "";
		if (aCSS.href && aCSS.href.indexOf("chrome://") == 0) return "";
		var content = "";
		if (aCSS.href) {
			if (isImport) {
				content += "/* ::::: " + "(import) " + aCSS.href + " ::::: */\n";
			}
			else {
				content += "/* ::::: " + aCSS.href + " ::::: */\n\n";
			}
		}
		// sometimes <link> cannot access remote css
		// and aCSS.cssRules fires an error (instead of returning undefined)...
		// we need this try block to catch that
		var skip = false;
		try {
			if (!aCSS.cssRules) skip = true;
		}
		catch(ex) {
			console.warn("Unable to access CSS from '" + aCSS.href + "' in page '" + aDocument.location.href + "' \n" + ex);
				content += "/* ERROR: Unable to access this CSS */\n\n";
			skip = true;
		}
		if (!skip) {
			Array.forEach(aCSS.cssRules, function(cssRule) {
				switch (cssRule.type) {
					case Ci.nsIDOMCSSRule.IMPORT_RULE: 
						content += this.processCSSRecursively(cssRule.styleSheet, aDocument, true);
						break;
					case Ci.nsIDOMCSSRule.FONT_FACE_RULE: 
						var cssText = this.inspectCSSText(cssRule.cssText, aCSS.href);
						if (cssText) content += cssText + "\n";
						break;
					case Ci.nsIDOMCSSRule.STYLE_RULE: 
					case Ci.nsIDOMCSSRule.MEDIA_RULE: 
					default: 
						var cssText = this.inspectCSSText(cssRule.cssText, aCSS.href, true);
						if (cssText) content += cssText + "\n";
						break;
				}
			}, this);
		}
		if (isImport) {
			content += "/* ::::: " + "(end import)" + " ::::: */\n";
		}
		return content;
	},

	inspectCSSText : function(aCSStext, aCSShref, isImage)
	{
		if (!aCSShref) aCSShref = this.refURLObj.spec;
		// CSS get by .cssText is always url("something-with-\"double-quote\"-escaped")
		// and no CSS comment is in
		// so we can parse it safely with this RegExp
		aCSStext = aCSStext.replace(/ url\(\"((?:\\.|[^"])+)\"\)/g, function() {
			var dataURL = arguments[1];
			if (dataURL.indexOf("data:") === 0) return ' url("' + dataURL + '")';
			dataURL = ScrapBookUtils.resolveURL(aCSShref, dataURL);
			if (isImage) {
				var dataFile = sbContentSaver.option["images"] ? sbContentSaver.download(dataURL) : dataURL;
			}
			else {
				var dataFile = sbContentSaver.download(dataURL);
			}
			return ' url("' + dataFile + '")';
		});
		return aCSStext;
	},

	download : function(aURLSpec)
	{
		if ( !aURLSpec ) return;
		if ( aURLSpec.indexOf("://") < 0 )
		{
			aURLSpec = ScrapBookUtils.resolveURL(this.refURLObj.spec, aURLSpec);
		}
		try {
			var aURL = Cc['@mozilla.org/network/standard-url;1'].createInstance(Ci.nsIURL);
			aURL.spec = aURLSpec;
		} catch(ex) {
			ScrapBookUtils.alert("ERROR: Failed to download: " + aURLSpec);
			return;
		}

		var arr = this.getUniqueFileName(aURL.fileName.toLowerCase(), aURLSpec);
		var newFileName = arr[0];
		var hasDownloaded = arr[1];
		if (hasDownloaded) return newFileName;

		if ( aURL.schemeIs("http") || aURL.schemeIs("https") || aURL.schemeIs("ftp") )
		{
			var targetFile = this.contentDir.clone();
			targetFile.append(newFileName);
			var refURL = this.refURLObj.schemeIs("http") || this.refURLObj.schemeIs("https") ? this.refURLObj : null;
			try {
				var WBP = Cc['@mozilla.org/embedding/browser/nsWebBrowserPersist;1'].createInstance(Ci.nsIWebBrowserPersist);
				WBP.persistFlags |= WBP.PERSIST_FLAGS_FROM_CACHE;
				WBP.persistFlags |= WBP.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
				WBP.saveURI(aURL, null, refURL, null, null, targetFile, null);
				this.httpTask[this.item.id]++;
				WBP.progressListener = new sbCaptureObserver(this.item, newFileName);
				return newFileName;
			}
			catch(ex) {
				dump("*** SCRAPBOOK_PERSIST_FAILURE: " + aURLSpec + "\n" + ex + "\n");
				this.httpTask[this.item.id]--;
				return "";
			}
		}
		else if ( aURL.schemeIs("file") )
		{
			var targetDir = this.contentDir.clone();
			try {
				var orgFile = ScrapBookUtils.convertURLToFile(aURLSpec);
				if ( !orgFile.isFile() ) return;
				orgFile.copyTo(targetDir, newFileName);
				return newFileName;
			}
			catch(ex) {
				dump("*** SCRAPBOOK_COPY_FAILURE: " + aURLSpec + "\n" + ex + "\n");
				return "";
			}
		}
	},

	leftZeroPad3 : function(num)
	{
		if ( num < 10 ) { return "00" + num; } else if ( num < 100 ) { return "0" + num; } else { return num; }
	},

	/**
	 * @return  [(string) newFileName, (bool) isDuplicated]
	 */
	getUniqueFileName: function(newFileName, aURLSpec, aDocumentSpec)
	{
		if ( !newFileName ) newFileName = "untitled";
		newFileName = decodeURI(newFileName);
		newFileName = ScrapBookUtils.validateFileName(newFileName);
		var fileLR = ScrapBookUtils.splitFileName(newFileName);
		fileLR[0] = ScrapBookUtils.crop(fileLR[0], 100);
		if ( !fileLR[1] ) fileLR[1] = "dat";
		newFileName = fileLR[0] + "." + fileLR[1];
		var seq = 0;
		while ( this.file2URL[newFileName] != undefined ) {
			if (this.file2URL[newFileName] == aURLSpec && this.file2Doc[newFileName] == aDocumentSpec) {
				return [newFileName, true];
			}
			newFileName = fileLR[0] + "_" + this.leftZeroPad3(++seq) + "." + fileLR[1];
		}
		this.file2URL[newFileName] = aURLSpec;
		this.file2Doc[newFileName] = aDocumentSpec;
		return [newFileName, false];
	},

};



function sbCaptureObserver(aSBitem, aFileName)
{
	this.item     = aSBitem;
	this.fileName = aFileName;
	this.callback = sbCaptureObserverCallback;
}

sbCaptureObserver.prototype = {

	onStateChange : function(aWebProgress, aRequest, aStateFlags, aStatus)
	{
		if ( aStateFlags & Ci.nsIWebProgressListener.STATE_STOP )
		{
			if ( --sbContentSaver.httpTask[this.item.id] == 0 ) {
				this.callback.onAllDownloadsComplete(this.item);
			} else {
				this.callback.onDownloadComplete(this.item);
			}
		}
	},
	onProgressChange : function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
	{
		if ( aCurTotalProgress == aMaxTotalProgress ) return;
		var progress = (aMaxSelfProgress > 0) ? Math.round(aCurSelfProgress / aMaxSelfProgress * 100) + "%" : aCurSelfProgress + "Bytes";
		this.callback.onDownloadProgress(this.item, this.fileName, progress);
	},
	onStatusChange   : function() {},
	onLocationChange : function() {},
	onSecurityChange : function() {},
};


var sbCaptureObserverCallback = {

	getString : function(aBundleName){ return ScrapBookBrowserOverlay.STRING.getString(aBundleName); },

	trace : function(aText)
	{
		if (document.getElementById("statusbar-display"))
			document.getElementById("statusbar-display").label = aText;
	},

	onDownloadComplete : function(aItem)
	{
		this.trace(this.getString("SAVE") + "... (" + sbContentSaver.httpTask[aItem.id] + ") " + aItem.title);
	},

	onAllDownloadsComplete : function(aItem)
	{
		this.trace(this.getString("SAVE_COMPLETE") + ": " + aItem.title);
		this.onCaptureComplete(aItem);
	},

	onDownloadProgress : function(aItem, aFileName, aProgress)
	{
		this.trace(this.getString("TRANSFER_DATA") + "... (" + aProgress + ") " + aFileName);
	},

	onCaptureComplete : function(aItem)
	{
		if (!aItem) return;
		if ( aItem && ScrapBookData.getProperty(ScrapBookUtils.RDF.GetResource("urn:scrapbook:item" + aItem.id), "type") == "marked" ) return;
		if ( ScrapBookUtils.getPref("notifyOnComplete", true) )
		{
			var icon = aItem.icon ? "resource://scrapbook/data/" + aItem.id + "/" + aItem.icon
			         : ScrapBookUtils.getDefaultIcon();
			var title = "ScrapBook: " + this.getString("SAVE_COMPLETE");
			var text = ScrapBookUtils.crop(aItem.title, 40);
			var listener = {
				observe: function(subject, topic, data) {
					if (topic == "alertclickcallback")
						ScrapBookUtils.loadURL("chrome://scrapbook/content/view.xul?id=" + data, true);
				}
			};
			var alertsSvc = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
			alertsSvc.showAlertNotification(icon, title, text, true, aItem.id, listener);
		}
		if ( aItem && aItem.id in sbContentSaver.httpTask ) delete sbContentSaver.httpTask[aItem.id];
	},

};


