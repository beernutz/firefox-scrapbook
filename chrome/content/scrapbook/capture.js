
var gURLs       = [];
var gDepths     = [];
var gRefURL     = "";
var gShowDetail = false;
var gResName    = "";
var gResIdx     = 0;
var gReferItem  = null;
var gOption     = {};
var gFile2URL   = {};
var gURL2Name   = {};
var gPreset     = [];
var gContext    = "";




function SB_trace(aMessage)
{
	document.getElementById("sbCaptureTextbox").value = aMessage;
}


function SB_initCapture()
{
	var myURLs  = window.arguments[0];
	gRefURL     = window.arguments[1];
	gShowDetail = window.arguments[2];
	gResName    = window.arguments[3];
	gResIdx     = window.arguments[4];
	gReferItem  = window.arguments[5];
	gOption     = window.arguments[6];
	gFile2URL   = window.arguments[7];
	gPreset     = window.arguments[8];
	if ( gReferItem )
	{
		gContext = "indepth";
		gURL2Name[unescape(gReferItem.source)] = "index";
	}
	else if ( gPreset )
	{
		gContext = gPreset[1] == "index" ? "renew" : "renew-deep";
		if ( gContext == "renew-deep" )
		{
			var contDir = sbCommonUtils.getContentDir(gPreset[0]);
			var file = contDir.clone();
			file.append("sb-file2url.txt");
			if ( !file.exists() ) { alert("ScrapBook ERROR: Could not find 'sb-file2url.txt'."); window.close(); }
			var lines = sbCommonUtils.readFile(file).split("\n");
			for ( var i = 0; i < lines.length; i++ )
			{
				var arr = lines[i].split("\t");
				if ( arr.length == 2 ) gFile2URL[arr[0]] = arr[1];
			}
			file = sbCommonUtils.getContentDir(gPreset[0]).clone();
			file.append("sb-url2name.txt");
			if ( !file.exists() ) { alert("ScrapBook ERROR: Could not find 'sb-url2name.txt'."); window.close(); }
			lines = sbCommonUtils.readFile(file).split("\n");
			for ( i = 0; i < lines.length; i++ )
			{
				var arr = lines[i].split("\t");
				if ( arr.length == 2 )
				{
					gURL2Name[arr[0]] = arr[1];
					if ( arr[1] == gPreset[1] ) myURLs = [arr[0]];
				}
			}
			gPreset[3] = gFile2URL;
			if ( !myURLs[0] ) { alert("ScrapBook ERROR: Could not find the source URL for " + gPreset[1] + ".html."); window.close(); }
		}
	}
	else gContext = "link";
	if ( !gOption ) gOption = {};
	if ( !("script" in gOption ) ) gOption["script"] = false;
	if ( !("images" in gOption ) ) gOption["images"] = true;
	sbInvisibleBrowser.init();
	sbCaptureTask.init(myURLs);
	gURLs.length == 1 ? sbCaptureTask.start() : sbCaptureTask.countDown();
}


function SB_splitByAnchor(aURL)
{
	var pos = 0;
	return ( (pos = aURL.indexOf("#")) < 0 ) ? [aURL, ""] : [aURL.substring(0, pos), aURL.substring(pos, aURL.length)];
}


function SB_suggestName(aURL)
{
	var baseName = sbCommonUtils.validateFileName(sbCommonUtils.splitFileName(sbCommonUtils.getFileName(aURL))[0]);
	if ( baseName == "index" ) baseName = "default";
	if ( !baseName ) baseName = "default";
	var name = baseName + ".html";
	var seq = 0;
	while ( gFile2URL[name] ) name = baseName + "_" + sbContentSaver.leftZeroPad3(++seq) + ".html";
	name = sbCommonUtils.splitFileName(name)[0];
	gFile2URL[name + ".html"] = aURL;
	gFile2URL[name + ".css"]  = true;
	return name;
}


function SB_fireNotification(aItem)
{
	var win = sbCommonUtils.WINDOW.getMostRecentWindow("navigator:browser");
	win.sbCaptureObserverCallback.onCaptureComplete(aItem);
}




var sbCaptureTask = {

	get INTERVAL() { return 3; },
	get LISTBOX()  { return document.getElementById("sbCaptureListbox"); },
	get STRING()   { return document.getElementById("sbCaptureString"); },
	get URL()      { return gURLs[this.index]; },

	index       : 0,
	contentType : "",
	isDocument  : false,
	canRefresh  : true,
	sniffer     : null,
	seconds     : 3,
	timerID     : 0,
	forceExit   : 0,

	init : function(myURLs)
	{
		if ( gContext != "indepth" && myURLs.length == 1 )
		{
			this.LISTBOX.collapsed = true;
			this.LISTBOX.setAttribute("class", "plain");
			document.getElementById("sbCaptureSkipButton").hidden = true;
		}
		else
		{
			this.LISTBOX.setAttribute("rows", 10);
		}
		if ( gContext == "indepth" )
		{
			var button = document.getElementById("sbCaptureFilterButton");
			button.hidden = false;
			button.nextSibling.hidden = false;
			button.firstChild.firstChild.label += " (" + sbCommonUtils.getRootHref(gReferItem.source) + ")" ;
			button.firstChild.firstChild.nextSibling.label += " (" + sbCommonUtils.getBaseHref(gReferItem.source) + ")";
		}
		for ( var i = 0; i < myURLs.length; i++ ) this.add(myURLs[i], 1);
	},

	add : function(aURL, aDepth)
	{
		if ( gURLs.length > 1000 ) return;
		if ( !aURL.match(/^(http|https|ftp|file):\/\//i) ) return;
		if ( gContext == "indepth" )
		{
			if ( aDepth > gOption["inDepth"] ) {
				return;
			}
			aURL = SB_splitByAnchor(aURL)[0];
			if ( !gOption["isPartial"] && aURL == gReferItem.source ) return;
			for ( var i = 0; i < gURLs.length; i++ ) if ( aURL == gURLs[i] ) return;
		}
		gURLs.push(aURL);
		gDepths.push(aDepth);
		var listitem = document.createElement("listitem");
		listitem.setAttribute("label", aDepth + " [" + (gURLs.length - 1) + "] " + aURL);
		listitem.setAttribute("type", "checkbox");
		listitem.setAttribute("checked", this.filter(gURLs.length - 1));
		this.LISTBOX.appendChild(listitem);
	},

	start : function()
	{
		this.seconds = -1;
		this.toggleStartPause(true);
		this.toggleSkipButton(true);
		this.LISTBOX.getItemAtIndex(this.index).setAttribute("indicated", true);
		if ( this.index > 0 ) this.LISTBOX.getItemAtIndex(this.index - 1).removeAttribute("indicated");
		this.LISTBOX.ensureIndexIsVisible(this.index);
		var listitem = this.LISTBOX.getItemAtIndex(this.index);
		listitem.setAttribute("disabled", true);
		if ( !listitem.checked )
		{
			this.next(true);
			return;
		}
		this.contentType = "";
		this.isDocument = true;
		this.canRefresh = true;
		SB_trace(this.STRING.getString("CONNECT") + "... " + gURLs[this.index]);
		if ( gURLs[this.index].indexOf("file://") == 0 ) {
			sbInvisibleBrowser.load(gURLs[this.index]);
		} else {
			this.sniffer = new sbHeaderSniffer(gURLs[this.index], gRefURL);
			this.sniffer.httpHead();
		}
	},

	succeed : function()
	{
		this.LISTBOX.getItemAtIndex(this.index).setAttribute("status", "succeed");
		this.next(false);
	},

	fail : function(aErrorMsg)
	{
		if ( aErrorMsg ) SB_trace(aErrorMsg);
		var listitem = this.LISTBOX.getItemAtIndex(this.index);
		listitem.setAttribute("label", gDepths[this.index] + " [" + this.index + "] " + aErrorMsg);
		listitem.setAttribute("status", "failure");
		if ( gURLs.length > 1 ) {
			this.next(true);
		} else {
			this.toggleStartPause(false);
		}
	},

	next : function(quickly)
	{
		this.toggleStartPause(true);
		this.toggleSkipButton(false);
		this.LISTBOX.getItemAtIndex(this.index).setAttribute("disabled", true);
		this.LISTBOX.getItemAtIndex(this.index).removeAttribute("indicated");
		if ( this.sniffer ) this.sniffer.onHttpSuccess = function(){};
		sbInvisibleBrowser.ELEMENT.stop();
		if ( ++this.index >= gURLs.length ) {
			this.finalize();
		} else {
			if ( quickly ) {
				window.setTimeout(function(){ sbCaptureTask.start(); }, 0);
			} else {
				this.seconds = this.INTERVAL;
				sbCaptureTask.countDown();
			}
		}
	},

	countDown : function()
	{
		SB_trace(this.STRING.getFormattedString("WAITING", [sbCaptureTask.seconds]) + "...");
		if ( --this.seconds > 0 )
			this.timerID = window.setTimeout(function(){ sbCaptureTask.countDown(); }, 1000);
		else
			this.timerID = window.setTimeout(function(){ sbCaptureTask.start(); }, 1000);
	},

	finalize : function()
	{
		if ( gContext == "indepth" )
		{
			sbCrossLinker.invoke();
		}
		else
		{
			if ( gURLs.length > 1 ) SB_fireNotification(null);
			window.setTimeout(function(){ window.close(); }, 1000);
		}
	},

	activate : function()
	{
		this.toggleStartPause(true);
		if ( this.seconds < 0 )
			sbCaptureTask.start();
		else
			this.countDown();
	},

	pause : function()
	{
		this.toggleStartPause(false);
		if ( this.seconds < 0 ) {
			sbInvisibleBrowser.ELEMENT.stop();
		} else {
			this.seconds++;
			window.clearTimeout(this.timerID);
		}
	},

	abort : function()
	{
		if ( gContext != "indepth" ) window.close();
		if ( ++this.forceExit > 2 ) window.close();
		if ( this.index < gURLs.length - 1 ) { this.index = gURLs.length - 1; this.next(); }
	},

	toggleStartPause : function(allowPause)
	{
		document.getElementById("sbCapturePauseButton").disabled = false;
		document.getElementById("sbCapturePauseButton").hidden = !allowPause;
		document.getElementById("sbCaptureStartButton").hidden =  allowPause;
		document.getElementById("sbCaptureTextbox").disabled   = !allowPause;
	},

	toggleSkipButton : function(willEnable)
	{
		document.getElementById("sbCaptureSkipButton").disabled = !willEnable;
	},

	filter : function(i)
	{
		return true;
	},

	applyFilter : function(type)
	{
		switch ( type )
		{
			case "D" : var ref = sbCommonUtils.getRootHref(gReferItem.source).toLowerCase(); this.filter = function(i){ return gURLs[i].toLowerCase().indexOf(ref) == 0; }; break;
			case "L" : var ref = sbCommonUtils.getBaseHref(gReferItem.source).toLowerCase(); this.filter = function(i){ return gURLs[i].toLowerCase().indexOf(ref) == 0; }; break;
			case "S" : 
				var ret = { value : "" };
				if ( !sbCommonUtils.PROMPT.prompt(window, "ScrapBook", this.STRING.getString("FILTER_BY_STRING"), ret, null, {}) ) return;
				if ( ret.value ) this.filter = function(i){ return gURLs[i].toLowerCase().indexOf(ret.value.toLowerCase()) != -1; };
				break;
			case "N" : this.filter = function(i){ return true;  }; break;
			case "F" : this.filter = function(i){ return false; }; break;
			case "I" : this.filter = function(i){ return !sbCaptureTask.LISTBOX.getItemAtIndex(i).checked; }; break;
			default  : return;
		}
		for ( var i = this.index; i < gURLs.length; i++ )
		{
			this.LISTBOX.getItemAtIndex(i).checked = this.filter(i);
		}
	},

};




var sbInvisibleBrowser = {

	get ELEMENT() { return document.getElementById("sbCaptureBrowser"); },

	fileCount : 0,
	onload    : null,

	init : function()
	{
		this.ELEMENT.webProgress.addProgressListener(this, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
		this.onload = function(){ sbInvisibleBrowser.execCapture(); };
		this.ELEMENT.addEventListener("load", sbInvisibleBrowser.onload, true);
	},

	refreshEvent : function(aEvent)
	{
		this.ELEMENT.removeEventListener("load", this.onload, true);
		this.onload = aEvent;
		this.ELEMENT.addEventListener("load", this.onload, true);
	},

	load : function(aURL)
	{
		this.fileCount = 0;
		this.ELEMENT.docShell.allowJavascript = gOption["script"];
		this.ELEMENT.docShell.allowImages     = gOption["images"];
		this.ELEMENT.docShell.allowMetaRedirects = false;
		this.ELEMENT.docShell.QueryInterface(Components.interfaces.nsIDocShellHistory).useGlobalHistory = false;
		this.ELEMENT.loadURI(aURL, null, null);
	},

	execCapture : function()
	{
		SB_trace(sbCaptureTask.STRING.getString("CAPTURE_START"));
		document.getElementById("sbCapturePauseButton").disabled = true;
		sbCaptureTask.toggleSkipButton(false);
		var ret = null;
		var preset = gReferItem ? [gReferItem.id, SB_suggestName(sbCaptureTask.URL), gOption, gFile2URL, gDepths[sbCaptureTask.index]] : null;
		if ( gPreset ) preset = gPreset;
		if ( this.ELEMENT.contentDocument.body && sbCaptureTask.isDocument )
		{
			var metaElems = this.ELEMENT.contentDocument.getElementsByTagName("meta");
			for ( var i = 0; i < metaElems.length; i++ )
			{
				if ( metaElems[i].hasAttribute("http-equiv") && metaElems[i].hasAttribute("content") &&
				     metaElems[i].getAttribute("http-equiv").toLowerCase() == "refresh" && 
				     metaElems[i].getAttribute("content").match(/URL\=(.*)$/i) )
				{
					var newURL = sbCommonUtils.resolveURL(sbCaptureTask.URL, RegExp.$1);
					if ( newURL != sbCaptureTask.URL && sbCaptureTask.canRefresh )
					{
						gURLs[sbCaptureTask.index] = newURL;
						sbCaptureTask.canRefresh = false;
						this.ELEMENT.loadURI(newURL, null, null);
						return;
					}
				}
			}
			ret = sbContentSaver.captureWindow(this.ELEMENT.contentWindow, false, gShowDetail, gResName, gResIdx, preset, gContext);
		}
		else
		{
			var type = sbCaptureTask.contentType.match(/image/i) ? "image" : "file";
			ret = sbContentSaver.captureFile(sbCaptureTask.URL, gRefURL ? gRefURL : sbCaptureTask.URL, type, gShowDetail, gResName, gResIdx, preset, gContext);
		}
		if ( ret )
		{
			if ( gContext == "indepth" )
			{
				gURL2Name[unescape(sbCaptureTask.URL)] = ret[0];
				gFile2URL = ret[1];
			}
			else if ( gContext == "renew-deep" )
			{
				gFile2URL = ret[1];
				var contDir = sbCommonUtils.getContentDir(gPreset[0]);
				var txtFile = contDir.clone();
				txtFile.append("sb-file2url.txt");
				var txt = "";
				for ( var f in gFile2URL ) txt += f + "\t" + gFile2URL[f] + "\n";
				sbCommonUtils.writeFile(txtFile, txt, "UTF-8");
			}
		}
		else
		{
			if ( gShowDetail ) window.close();
			SB_trace(sbCaptureTask.STRING.getString("CAPTURE_ABORT"));
			sbCaptureTask.fail("");
		}
	},

	QueryInterface : function(aIID)
	{
		if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
			aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
			aIID.equals(Components.interfaces.nsIXULBrowserWindow) ||
			aIID.equals(Components.interfaces.nsISupports))
			return this;
		throw Components.results.NS_NOINTERFACE;
	},

	onStateChange : function(aWebProgress, aRequest, aStateFlags, aStatus)
	{
		if ( aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_START )
		{
			SB_trace(sbCaptureTask.STRING.getString("LOADING") + "... " + (++this.fileCount) + " " + (sbCaptureTask.URL ? sbCaptureTask.URL : this.ELEMENT.contentDocument.title));
		}
	},

	onProgressChange : function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
	{
		if ( aCurTotalProgress != aMaxTotalProgress )
		{
			SB_trace(sbCaptureTask.STRING.getString("TRANSFER_DATA") + "... (" + aCurTotalProgress + " Bytes)");
		}
	},

	onStatusChange   : function() {},
	onLocationChange : function() {},
	onSecurityChange : function() {},

};




var sbCrossLinker = {

	get ELEMENT(){ return document.getElementById("sbCaptureBrowser"); },

	index    : -1,
	baseURL  : "",
	nameList : [],

	XML      : null,
	rootNode : null,
	nodeHash : {},

	invoke : function()
	{
		if ( !sbDataSource.data ) sbDataSource.init();
		sbDataSource.setProperty(sbCommonUtils.RDF.GetResource("urn:scrapbook:item" + gReferItem.id), "type", "site");
		sbDataSource.flush();
		sbInvisibleBrowser.refreshEvent(function(){ sbCrossLinker.exec(); });
		this.ELEMENT.docShell.allowImages = false;
		sbInvisibleBrowser.onStateChange = function(aWebProgress, aRequest, aStateFlags, aStatus)
		{
			if ( aStateFlags & Components.interfaces.nsIWebProgressListener.STATE_START )
			{
				SB_trace(sbCaptureTask.STRING.getFormattedString("REBUILD_LINKS", [sbCrossLinker.index + 1, sbCrossLinker.nameList.length]) + "... "
					+ ++sbInvisibleBrowser.fileCount + " : " + sbCrossLinker.nameList[sbCrossLinker.index] + ".html");
			}
		};
		this.baseURL = sbCommonUtils.IO.newFileURI(sbCommonUtils.getContentDir(gReferItem.id)).spec;
		this.nameList.push("index");
		for ( var url in gURL2Name )
		{
			this.nameList.push(gURL2Name[url]);
		}
		this.XML = document.implementation.createDocument("", "", null);
		this.rootNode = this.XML.createElement("site");
		this.start();
	},

	start : function()
	{
		if ( ++this.index < this.nameList.length )
		{
			dump("sbCrossLinker::start [" + this.index + "] " + this.nameList[this.index] + "\n");
			sbInvisibleBrowser.fileCount = 0;
			this.ELEMENT.loadURI(this.baseURL + this.nameList[this.index] + ".html", null, null);
		}
		else
		{
			SB_trace(sbCaptureTask.STRING.getString("REBUILD_LINKS_COMPLETE"));
			this.flushXML();
			SB_fireNotification(gReferItem);
			window.setTimeout(function(){ window.close(); }, 1000);
		}
	},

	exec : function()
	{
		if ( this.ELEMENT.currentURI.scheme != "file" )
		{
			return;
		}
		sbContentSaver.frameList = [this.ELEMENT.contentWindow];
		sbContentSaver.getFrameList(this.ELEMENT.contentWindow);
		if ( !this.nodeHash[this.nameList[this.index]] )
		{
			this.nodeHash[this.nameList[this.index]] = this.createNode(this.nameList[this.index], gReferItem.title);
			this.nodeHash[this.nameList[this.index]].setAttribute("title", sbDataSource.sanitize(this.ELEMENT.contentTitle));
		}
		else
		{
			this.nodeHash[this.nameList[this.index]].setAttribute("title", sbDataSource.sanitize(this.ELEMENT.contentTitle));
		}
		for ( var f = 0; f < sbContentSaver.frameList.length; f++ )
		{
			var doc = sbContentSaver.frameList[f].document;
			if ( !doc.links ) continue;
			var shouldSave = false;
			var linkList = doc.links;
			for ( var i = 0; i < linkList.length; i++ )
			{
				var urlLR = SB_splitByAnchor(unescape(linkList[i].href));
				if ( gURL2Name[urlLR[0]] )
				{
					var name = gURL2Name[urlLR[0]];
					linkList[i].href = name + ".html" + urlLR[1];
					linkList[i].setAttribute("indepth", "true");
					if ( !this.nodeHash[name] )
					{
						var text = linkList[i].text ? linkList[i].text.replace(/\r|\n|\t/g, " ") : "";
						if ( text.replace(/\s/g, "") == "" ) text = "";
						this.nodeHash[name] = this.createNode(name, text);
						if ( !this.nodeHash[name] ) this.nodeHash[name] = name;
						this.nodeHash[this.nameList[this.index]].appendChild(this.nodeHash[name]);
					}
					shouldSave = true;
				}
			}
			if ( shouldSave )
			{
				var rootNode = doc.getElementsByTagName("html")[0];
				var src = "";
				src = sbContentSaver.surroundByTags(rootNode, rootNode.innerHTML);
				src = sbContentSaver.doctypeToString(doc.doctype) + src;
				var file = sbCommonUtils.getContentDir(gReferItem.id);
				file.append(sbCommonUtils.getFileName(doc.location.href));
				sbCommonUtils.writeFile(file, src, doc.characterSet);
			}
		}
		this.forceReloading(gReferItem.id, this.nameList[this.index]);
		this.start();
	},

	createNode : function(aName, aText)
	{
		aText = sbCommonUtils.crop(aText, 100);
		var node = this.XML.createElement("page");
		node.setAttribute("file", aName + ".html");
		node.setAttribute("text", sbDataSource.sanitize(aText));
		return node;
	},

	flushXML : function()
	{
		this.rootNode.appendChild(this.nodeHash["index"]);
		this.XML.appendChild(this.rootNode);
		var src = "";
		src += '<?xml version="1.0" encoding="UTF-8"?>\n';
		src += '<?xml-stylesheet href="../../sitemap.xsl" type="text/xsl" media="all"?>\n';
		src += (new XMLSerializer()).serializeToString(this.XML).replace(/></g, ">\n<");
		src += '\n';
		var xslFile = sbCommonUtils.getScrapBookDir().clone();
		xslFile.append("sitemap.xsl");
		if ( !xslFile.exists() ) sbCommonUtils.saveTemplateFile("chrome://scrapbook/skin/sitemap.xsl", xslFile);
		var contDir = sbCommonUtils.getContentDir(gReferItem.id);
		var xmlFile = contDir.clone();
		xmlFile.append("sitemap.xml");
		sbCommonUtils.writeFile(xmlFile, src, "UTF-8");
		var txt = "";
		var txtFile1 = contDir.clone();
		txtFile1.append("sb-file2url.txt");
		for ( var f in gFile2URL ) txt += f + "\t" + gFile2URL[f] + "\n";
		sbCommonUtils.writeFile(txtFile1, txt, "UTF-8");
		txt = "";
		var txtFile2 = contDir.clone();
		txtFile2.append("sb-url2name.txt");
		for ( var u in gURL2Name ) txt += u + "\t" + gURL2Name[u] + "\n";
		sbCommonUtils.writeFile(txtFile2, txt, "UTF-8");
	},

	forceReloading : function(aID, aName)
	{
		try {
			var win = sbCommonUtils.WINDOW.getMostRecentWindow("navigator:browser");
			var nodes = win.gBrowser.mTabContainer.childNodes;
			for ( var i = 0; i < nodes.length; i++ )
			{
				var uri = win.gBrowser.getBrowserForTab(nodes[i]).currentURI.spec;
				if ( uri.indexOf("/data/" + aID + "/" + aName + ".html") > 0 )
				{
					win.gBrowser.getBrowserForTab(nodes[i]).reload();
				}
			}
		} catch(ex) {
		}
	},

};




function sbHeaderSniffer(aURLSpec, aRefURLSpec)
{
	this.URLSpec    = aURLSpec;
	this.refURLSpec = aRefURLSpec;
}


sbHeaderSniffer.prototype = {

	_URL     : Components.classes['@mozilla.org/network/standard-url;1'].createInstance(Components.interfaces.nsIURL),
	_channel : null,
	_headers : null,

	httpHead : function()
	{
		this._channel = null;
		this._headers = {};
		try {
			this._URL.spec = this.URLSpec;
			this._channel = sbCommonUtils.IO.newChannelFromURI(this._URL).QueryInterface(Components.interfaces.nsIHttpChannel);
			this._channel.loadFlags = this._channel.LOAD_BYPASS_CACHE;
			this._channel.setRequestHeader("User-Agent", navigator.userAgent, false);
			if ( this.refURLSpec ) this._channel.setRequestHeader("Referer", this.refURLSpec, false);
		} catch(ex) {
			this.onHttpError("Invalid URL");
		}
		try {
			this._channel.requestMethod = "HEAD";
			this._channel.asyncOpen(this, this);
		} catch(ex) {
			this.onHttpError(ex);
		}
	},

	getHeader : function(aHeader)
	{
	 	try { return this._channel.getResponseHeader(aHeader); } catch(ex) { return ""; }
	},

	getStatus : function()
	{
		try { return this._channel.responseStatus; } catch(ex) { return ""; }
	},

	visitHeader : function(aHeader, aValue)
	{
		this._headers[aHeader] = aValue;
	},

	onDataAvailable : function(aRequest, aContext, aInputStream, aOffset, aCount) {},
	onStartRequest  : function(aRequest, aContext) {},
	onStopRequest   : function(aRequest, aContext, aStatus) { this.onHttpSuccess(); },

	onHttpSuccess : function()
	{
		sbCaptureTask.contentType = this.getHeader("Content-Type");
		var httpStatus = this.getStatus();
		SB_trace(sbCaptureTask.STRING.getString("CONNECT_SUCCESS") + " (Content-Type: " + sbCaptureTask.contentType + ")");
		switch ( httpStatus )
		{
			case 404 : sbCaptureTask.fail(sbCaptureTask.STRING.getString("HTTP_STATUS_404") + " (404 Not Found)"); return;
			case 403 : sbCaptureTask.fail(sbCaptureTask.STRING.getString("HTTP_STATUS_403") + " (403 Forbidden)"); return;
			case 500 : sbCaptureTask.fail("500 Internal Server Error"); return;
		}
		var redirectURL = this.getHeader("Location");
		if ( redirectURL )
		{
			if ( redirectURL.indexOf("http") != 0 ) redirectURL = this._URL.resolve(redirectURL);
			gURLs[sbCaptureTask.index] = redirectURL;
			sbCaptureTask.start();
			return;
		}
		if ( !sbCaptureTask.contentType )
		{
			sbCaptureTask.contentType = "text/html";
		}
		if ( sbCaptureTask.contentType.match(/(text|html|xml)/i) )
		{
			sbCaptureTask.isDocument = true;
			sbInvisibleBrowser.load(this.URLSpec);
		}
		else
		{
			sbCaptureTask.isDocument = false;
			if ( gContext == "indepth" ) {
				sbCaptureTask.next(true);
			} else {
				sbInvisibleBrowser.execCapture();
			}
		}
	},

	onHttpError : function(aErrorMsg)
	{
		sbCaptureTask.fail(sbCaptureTask.STRING.getString("CONNECT_FAILURE") + " (" + aErrorMsg + ")");
	},

};




sbCaptureObserverCallback = {

	onDownloadComplete : function(aItem)
	{
		SB_trace(sbCaptureTask.STRING.getString("CAPTURE") + "... (" + sbContentSaver.httpTask[aItem.id] + ") " + aItem.title);
	},

	onAllDownloadsComplete : function(aItem)
	{
		this.onCaptureComplete(aItem);
	},

	onDownloadProgress : function(aItem, aFileName, aProgress)
	{
		SB_trace(sbCaptureTask.STRING.getString("TRANSFER_DATA") + "... (" + sbContentSaver.httpTask[aItem.id] + ") " + aProgress + " : " + aFileName);
	},

	onCaptureComplete : function(aItem)
	{
		SB_trace(sbCaptureTask.STRING.getString("CAPTURE_COMPLETE") + " : " + aItem.title);
		if ( gContext != "indepth" && gURLs.length == 1 ) SB_fireNotification(aItem);
		if ( gContext == "renew" || gContext == "renew-deep" )
		{
			sbCrossLinker.forceReloading(gPreset[0], gPreset[1]);
			sbDataSource.init();
			var res = sbCommonUtils.RDF.GetResource("urn:scrapbook:item" + gPreset[0]);
			sbDataSource.setProperty(res, "chars", aItem.chars);
			if ( gPreset[5] ) sbDataSource.setProperty(res, "type", "");
		}
		sbCaptureTask.succeed();
	},

};


