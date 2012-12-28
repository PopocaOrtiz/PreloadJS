/*
* XHRLoader for PreloadJS
* Visit http://createjs.com/ for documentation, updates and examples.
*
*
* Copyright (c) 2012 gskinner.com, inc.
*
* Permission is hereby granted, free of charge, to any person
* obtaining a copy of this software and associated documentation
* files (the "Software"), to deal in the Software without
* restriction, including without limitation the rights to use,
* copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the
* Software is furnished to do so, subject to the following
* conditions:
*
* The above copyright notice and this permission notice shall be
* included in all copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
* EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
* OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
* NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
* HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
* WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
* FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
* OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * @module PreloadJS
 */

// namespace:
this.createjs = this.createjs||{};

(function() {

	/**
	 * A preloader that loads items using XHR requests (usually XMLHttpRequest, however XDomainRequests will be used
	 * for cross-domain requests if possible. Older versions of IE fall back on to ActiveX objects when necessary. XHR
	 * requests load the content as data or binary files, provide progress, and consistent completion events. Note
	 * that XHR is not supported in IE 6 or earlier, and is not recommended for cross-domain loading.
	 * @class XHRLoader
	 * @constructor
	 * @param {Object} file The object that defines the file to load. Please see the addItem method in PreloadJS
	 *      for an overview of supported file properties.
	 * @extends AbstractLoader
	 */
	var XHRLoader = function (file) {
		this.init(file);
	};

	var p = XHRLoader.prototype = new createjs.AbstractLoader();

	//Protected
	/**
	 * A reference to the XHR request used to load the content.
	 * @property _request
	 * @type {XMLHttpRequest | XDomainRequest | ActiveX.XMLHTTP}
	 * @private
	 */
	p._request = null;

	/**
	 * A manual load timeout that is used for browsers that do not support the onTimeout event on XHR (XHR level 1,
	 * typically IE9).
	 * @property _loadTimeout
	 * @type {Number}
	 * @private
	 */
	p._loadTimeout = null;

	/**
	 * The browser's XHR (XMLHTTPRequest) version. Supported versions are 1 and 2. There is no official way to detect
	 * the version, so we use capabilities to make a best guess.
	 * @property _xhrLevel
	 * @type Number
	 * @default 1
	 * @private
	 */
	p._xhrLevel = 1;

	/**
	 * The response of a loaded file. This is set because it is expensive to look up constantly. This property will be
	 * null until the file is loaded.
	 * @property _response
	 * @type {null}
	 * @private
	 */
	p._response = null;

	/**
	 * The response of the loaded file, before it is modified. In most cases, content is converted from raw text to
	 * an HTML tag or a formatted object, but the user may still want to access the raw content.
	 * @property _rawResponse
	 * @type {Object}
	 * @private
	 */
	p._rawResponse = null;

	// Override AbstractLoader
	p.init = function (item) {
		this._item = item;
		if (!this._createXHR(item)) {
			//TODO: Throw error?
		}
	};

	/**
	 * Get the loaded content. The XHRLoader parses loaded content into a usable tag or object. To get the unparsed
	 * content, use <code>getRawResult</code>.
	 * @method getResult
	 * @return {Object} The loaded and parsed content.
	 */
	p.getResult = function() {
		return this._response;
	};

	/**
	 * Get the raw content loaded via XHR. If the content is not parsed (ie TEXT) this will be null.
	 * @method getRawResult
	 * @return {Object} The loaded content.
	 */
	p.getRawResult = function() {
		return this._rawResponse;
	}

	// Override AbstractLoader
	p.cancel = function() {
		this.canceled = true;
		this._clean();
		this._request.abort();
	};

	// Override AbstractLoader
	p.load = function() {
		if (this._request == null) {
			this._handleError();
			return;
		}

		//Events
		this._request.onloadstart = createjs.PreloadJS.proxy(this._handleLoadStart, this);
		this._request.onprogress = createjs.PreloadJS.proxy(this._handleProgress, this);
		this._request.onabort = createjs.PreloadJS.proxy(this._handleAbort, this);
		this._request.onerror = createjs.PreloadJS.proxy(this._handleError, this);
		this._request.ontimeout = createjs.PreloadJS.proxy(this._handleTimeout, this);
		// Set up a timeout if we don't have XHR2
		if (this._xhrLevel == 1) {
			this._loadTimeout = setTimeout(createjs.PreloadJS.proxy(this._handleTimeout, this), createjs.PreloadJS.TIMEOUT_TIME);
		}

		// Note: We don't get onload in all browsers (earlier FF and IE). onReadyStateChange handles these.
		this._request.onload = createjs.PreloadJS.proxy(this._handleLoad, this);
		this._request.onreadystatechange = createjs.PreloadJS.proxy(this._handleReadyStateChange, this);

		try { // Sometimes we get back 404s immediately, particularly when there is a cross origin request.
			this._request.send();
		} catch (error) {
			this._sendError({source:error});
		}
	};

	/**
	 * The XHR request has reported progress.
	 * @method _handleProgress
	 * @param {Object} event The XHR progress event.
	 * @private
	 */
	p._handleProgress = function(event) {
		if (event.loaded > 0 && event.total == 0) {
			return; // Sometimes we get no "total", so just ignore the progress event.
		}
		this._sendProgress({loaded:event.loaded, total:event.total});
	};

	/**
	 * The XHR request has reported a load start.
	 * @method _handleLoadStart
	 * @param {Object} event The XHR loadStart event.
	 * @private
	 */
	p._handleLoadStart = function(event) {
		clearTimeout(this._loadTimeout);
		this._sendLoadStart();
	};

	/**
	 * The XHR request has reported an abort event.
	 * @method handleAbort
	 * @param {Object} event The XHR abort event.
	 * @private
	 */
	p._handleAbort = function(event) {
		this._clean();
		this._sendError();
	};

	/**
	 * The XHR request has reported an error event.
	 * @method _handleError
	 * @param {Object} event The XHR error event.
	 * @private
	 */
	p._handleError = function(event) {
		this._clean();
		this._sendError();
	};

	/**
	 * The XHR request has reported a readyState change. Note that older browsers (IE 7 & 8) do not provide an onload
	 * event, so we must monitor the readyStateChange to determine if the file is loaded.
	 * @method _handleReadyStateChange
	 * @param {Object} event The XHR readyStateChange event.
	 * @private
	 */
	p._handleReadyStateChange = function(event) {
		if (this._request.readyState == 4) {
			this._handleLoad();
		}
	};

	/**
	 * The XHR request has completed. This is called by the XHR request directly, or by a readyStateChange that has
	 * <code>request.readyState == 4</code>. Only the first call to this method will be processed.
	 * @method _handleLoad
	 * @param {Object} event The XHR load event.
	 * @private
	 */
	p._handleLoad = function(event) {
		if (this.loaded) { return; }
		this.loaded = true;

		if(!this._checkError()) {
			this._handleError();
			return;
		}

		//TODO: Ensure this creates XML/JSON/TAG
		this._response = this._getResponse();

		this._clean();
		var isComplete = this._generateTag();

		if (isComplete) {
			this._sendComplete();
		}
	};

	/**
	 * The XHR request has timed out. This is called by the XHR request directly, or as a <code>setTimeout</code>
	 * callback.
	 * @method _handleTimeout
	 * @param {Object} event The XHR timeout event.
	 * @private
	 */
	p._handleTimeout = function(event) {
		this._clean();
		this._sendError();
	};


// Protected
	/**
	 * Determine if there is an error in the current load. This checks the status of the request for problem codes. This
	 * does not check for an actual response. Currently, it checks for 404 and 0 error codes.
	 * @method _checkError
	 * @todo Add more error codes, such as 501.
	 * @return {Boolean} If the request status returns an error code.
	 * @private
	 */
    p._checkError = function() {
		//LM: Probably need additional handlers here.
        var status = parseInt(this._request.status);

        switch (status) {
            case 404:   // Not Found
            case 0:     // Not Loaded
                return false;
		}
		return true;
    };

	/**
	 * Validate the response. Different browsers have different methods, some of which throw errors when accessed. If
	 * there is no response, the <code>_response</code>
	 * @method _getResponse
	 * @private
	 */
	p._getResponse = function () {
		if (this._response != null) {
			return this._response;
		}

		if (this._request.response != null) {
			return this._request.response;
		}

		// Android 2.2 uses .responseText
		try {
			if (this._request.responseText != null) {
				return this._request.responseText;
			}
		} catch (e) {}

		// When loading XML, IE9 does not return .response, instead it returns responseXML.xml
		//TODO: TEST
		try {
			if (this._request.responseXML != null) {
				return this._request.responseXML;
			}
		} catch (e) {}
		return null;
	};

	/**
	 * Create an XHR request. Depending on a number of factors, we get totally different results.
	 * <ol><li>Some browsers get an <code>XDomainRequest</code> when loading cross-domain.</li>
	 *      <li>XMLHttpRequest are created when available.</li>
	 *      <li>ActiveX.XMLHTTP objects are used in older IE browsers.</li>
	 *      <li>Text requests override the mime type if possible</li>
	 *      <li>Origin headers are sent for crossdomain requests in some browsers.</li>
	 *      <li>Binary loads set the response type to "arraybuffer"</li></ol>
	 * @method _createXHR
	 * @param item
	 * @return {Boolean}
	 * @private
	 */
	p._createXHR = function(item) {
		// Check for cross-domain loads. We can't fully support them, but we can try.
		var target = document.createElement("a");
        target.href = item.src;
        var host = document.createElement("a");
        host.href = location.href;
        var crossdomain = (target.hostname != "") && (target.port != host.port || target.protocol != host.protocol || target.hostname != host.hostname);

		// Create the request. Fall back to whatever support we have.
        var req;
        if (crossdomain && window.XDomainRequest) {
            req = new XDomainRequest(); // Note: IE9 will fail if this is not actually cross-domain.
        } else if (window.XMLHttpRequest) { // Old IE versions use a different approach
            req = new XMLHttpRequest();
        } else {
            try { req = new ActiveXObject("Msxml2.XMLHTTP.6.0");
            } catch (e) {
                try { req = new ActiveXObject("Msxml2.XMLHTTP.3.0");
                } catch (e) {
                    try { req = new ActiveXObject("Msxml2.XMLHTTP");
                    } catch (e) {
                        return false;
                    }
                }
            }
        }

		// IE9 doesn't support overrideMimeType(), so we need to check for it.
		if (item.type == createjs.PreloadJS.TEXT && req.overrideMimeType) {
			req.overrideMimeType("text/plain; charset=x-user-defined");
		}

		// Determine the XHR level
        this._xhrLevel = (typeof req.responseType === "string") ? 2 : 1;

		// Open the request.  Set cross-domain flags if it is supported (XHR level 1 only)
        req.open("GET", item.src, true);
        if (crossdomain && req instanceof XMLHttpRequest && this._xhrLevel == 1) {
            req.setRequestHeader("Origin", location.origin);
        }

		// Binary files are loaded differently.
		if (createjs.PreloadJS.isBinary(item.type)) {
			req.responseType = "arraybuffer";
		}

		this._request = req;
        return true;
	};

	/**
	 * A request has completed (or failed or canceled), and needs to be disposed.
	 * @method _clean
	 * @private
	 */
	p._clean = function() {
		clearTimeout(this._loadTimeout);

		var req = this._request;
		req.onloadstart = null;
		req.onprogress = null;
		req.onabort = null;
		req.onerror = null;
		req.onload = null;
		req.ontimeout = null;
		req.onloadend = null;
		req.onreadystatechange = null;

		clearInterval(this._checkLoadInterval);
	};

	/**
	 * Generate a tag for items that can be represented as tags. For example, IMAGE, SCRIPT, and LINK. This also handles
	 * XML and SVG.
	 * @method _generateTag
	 * @return {Boolean} If a tag was generated, but is not ready for instantiation, this method returns false.
	 * @private
	 */
	p._generateTag = function() {
		var type = this._item.type;
		var tag = this._item.tag;

		switch (type) {
			// Note: Images need to wait for onload, but do use the cache.
			case createjs.PreloadJS.IMAGE:
				tag.onload = createjs.PreloadJS.proxy(this._handleTagReady, this);
				tag.src = this._item.src;

				this._rawResponse = this._response;
				this._response = tag;
				return false; // Images need to get an onload event first

			case createjs.PreloadJS.JAVASCRIPT:
				tag = document.createElement("script");
	            tag.text = this._response;

				this._rawResponse = this._response;
				this._response = tag;
				return true;

			case createjs.PreloadJS.CSS:
				// Maybe do this conditionally?
				var head = document.getElementsByTagName("head")[0]; //Note: This is unavoidable in IE678
				head.appendChild(tag);

				if (tag.styleSheet) { // IE
				    tag.styleSheet.cssText = this._response;
				} else {
					var textNode = document.createTextNode(this._response);
				    tag.appendChild(textNode);
				}

				this._rawResponse = this._response;
				this._response = tag;
				return true;

			case createjs.PreloadJS.XML:
				var xml = this._parseXML(this._response, "text/xml");
				this._response = xml;
				return true;

			case createjs.PreloadJS.SVG:
				var xml = this._parseXML(this._response, "image/svg+xml");
				this._rawResponse = this._response;
				//TODO: Test
				tag.appendChild(xml.documentElement);
				this._response = tag;
				return true;

			case createjs.PreloadJS.JSON:
				var json;
				try {
					eval("json="+this._response);
				} catch(error) {
					// Log error?
					return true; // If we can't parse it, let the user have the broken JSON.
				}

				this._rawResponse = this._response;
				this._response = json;
				return true;

		}
		return true;
	};

	/**
	 * Parse XML using the DOM. This is required when preloading XML or SVG.
	 * @method _parseXML
	 * @param {String} text The raw text or XML that is loaded by XHR.
	 * @param {String} type The mime type of the XML.
	 * @return {XML} An XML document.
	 * @private
	 */
	p._parseXML = function(text, type) {
		var xml;
		if (window.DOMParser) {
			var parser = new DOMParser();
			xml = parser.parseFromString(text, type);
		} else { // IE
			xml = new ActiveXObject("Microsoft.XMLDOM");
			xml.async = false;
			xml.loadXML(text);
		}
		return xml;
	};

	/**
	 * A generated tag is now ready for use.
	 * @methid _handleTagReady
	 * @private
	 */
	p._handleTagReady = function() {
		this._sendComplete();
	}

	p.toString = function() {
		return "[PreloadJS XHRLoader]";
	}

	createjs.XHRLoader = XHRLoader;

}());