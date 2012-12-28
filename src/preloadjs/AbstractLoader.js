/*
* AbstractLoader for PreloadJS
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
 * PreloadJS provides a consistent way to preload content for use in HTML applications. Preloading can be done using
 * HTML tags, as well as XHR. By default, PreloadJS will try and load content using XHR, since it provides better
 * support for progress and completion events, however due to cross-domain issues, it may still be preferable to use
 * tag-based loading instead. Note that some content requires XHR to work (plain text, web audio), and some requires
 * tags (HTML audio).
 * <br/><br/>
 * PreloadJS currently supports all modern browsers, and we have done our best to include support for most older
 * browsers is included. If you find an issue with any specific OS/browser combination, please visit
 * http://community.createjs.com/ and report it.
 * <br/><br/>
 * To get started:
 * <ol>
 *     <li>Create a preload queue. An instance of PreloadJS is all you need.</li>
 *     <li>Register any plugins you need. For example, if loading audio for playback with SoundJS, it is recommended
 *     to install SoundJS as a plugin.</li>
 *     <li>Subscribe to events. You can get notified of overall progress, item progress, overall completion,
 *     item completion, and errors.</li>
 *     <li>Load a file or manifest using <code>loadFile()</code> or <code>loadManifest()</code>. You can pass a simple
 *          string, an object with additional parameters and data, or even an HTML tag.</li>
 *     <li>Once your file or queue is loaded, look up results in event objects, or using simple APIs to use in your HTML
 *          applications.</li>
 * </ol>
 *
 * Loaded content can be accessed as the "result" of a fileLoad event, or looked up using the <code>getResult(id)</code>
 * method. This will always be the usable content, including:
 * <ul>
 *     <li>Image: An &lt;img /&gt; tag</li>
 *     <li>Audio: An &lt;audio /&gt; tag</a>
 *     <li>JavaScript: A &lt;script /&gt; tag</li>
 *     <li>CSS: A &lt;link /&gt; tag (tag loading) or a &lt;style /&gt; tag (xhr loading)</li>
 *     <li>XML: An XML DOM node</li>
 *     <li>SVG: An &lt;object /&gt; tag (tag loading) or a &lt;svg /&gt; tag (xhr loading)</li>
 *     <li>JSON: A formatted JavaScript Object</li>
 *     <li>Text: Raw text</li>
 *     <li>Binary: The binary loaded result</li>
 * </ul>
 *
 * Raw loaded content can be accessed using the "rawResult" property of the fileLoad event, or can be looked up using
 * <code>getResult(id, true)</code>. This is only applicable for content that has been parsed for the browser,
 * specifically, JavaScript, CSS, XML, SVG, and JSON objects.
 *
 * @example
 *      var queue = new createjs.PreloadJS();
 *      queue.installPlugin(createjs.SoundJS);
 *      queue.onComplete = handleComplete;
 *      queue.loadFile({id:"sound", src:"http://path/to/sound.mp3"});</code>
 *      queue.loadManifest([
 *          {id: "myImage", src:"path/to/myImage.jpg"}
 *      ]);
 *      function handleComplete() {
 *          createjs.SoundJS.play("mySound");
 *          var image = queue.getResult("mySound");
 *          document.appendChild(image.result);
 *      }
 *
 * @module PreloadJS
 */

// namespace:
this.createjs = this.createjs||{};

(function() {

	/**
	 * The base loader, which handles all callbacks. All loaders should extend this class.
	 * @class AbstractLoader
	 * @constructor
	 */
	var AbstractLoader = function () {
		this.init();
	};

	AbstractLoader.prototype = {};
	var p = AbstractLoader.prototype;
	var s = AbstractLoader;

	/**
     * The RegExp pattern to use to parse file URIs. This supports simple file names, as well as full domain URIs with
     * query strings. The resulting match is: protocol:$1 domain:$2 path:$3 file:$4 ext:$5 params:$6.
     * @property FILE_PATTERN
     * @type {RegExp}
	 * @static
     * @protected
     */
	s.FILE_PATTERN = /(\w+:\/{2})?((?:\w+\.){2}\w+)?(\/?[\S]+\/|\/)?([\w\-%]+)(?:\.)(\w+)?(\?\S+)?/i;

	/**
	 * If the loader has completed loading. This provides a quick check, but also ensures that the different approaches
	 * used for loading do not pile up resulting in more than one <code>onComplete</code> event.
	 * @property loaded
	 * @type Boolean
	 * @default false
	 */
	p.loaded = false;

	/**
	 * Determine if a preload instance was canceled. Canceled loads will
	 * not fire complete events. Note that PreloadJS queues should be closed
	 * instead of canceled.
	 * @property canceled
	 * @type {Boolean}
	 * @default false
	 */
	p.canceled = false;

	/**
	 * The current load progress (percentage) for this item.
	 * @property progress
	 * @type Number
	 * @default 0
	 */
	p.progress = 0;

	/**
	 * The item this loader controls. Note that this is null in PreloadJS, but will be available on plugins such as
	 * XHRLoader and TagLoader.
	 * @property _item
	 * @type Object
	 * @private
	 */
	p._item = null;

//Callbacks

	/**
	 * The callback to fire as a file loads and the overall progress changes. The event contains the amount that is
	 * loaded, the total amount, and a progress property which is a 0-1 value. Alternately there is an
	 * <code>onProgress</code> callback that can be used as well.
	 * @event progress
	 */
	p.onProgress = null;

	/**
	 * The callback to fire when a load starts. Alternately, there is an <code>onLoadStart</code> callback that can be
	 * used as well.
	 * @event loadStart
	 */
	p.onLoadStart = null;

	/**
	 * The callback to fire when the entire queue has been loaded. Alternately, there is an <code>onComplete</code>
	 * callback that can be used as well.
	 * @event complete
	 */
	p.onComplete = null;

	/**
	 * The callback to fire when the loader encounters an error. If the error was encountered by a file, the event will
	 * contain the required file data, but the target will be the loader. Alternately, there is an
	 * <code>onError</code> callback you can use as well.
	 * @event error
	 */
	p.onError = null;


// mix-ins:
	// EventDispatcher methods:
	p.addEventListener = null;
	p.removeEventListener = null;
	p.removeAllEventListeners = null;
	p.dispatchEvent = null;
	p.hasEventListener = null;
	p._listeners = null;

	// we only use EventDispatcher if it's available:
	createjs.EventDispatcher && createjs.EventDispatcher.initialize(p); // inject EventDispatcher methods.


	/**
	 * Get a reference to the manifest item that is loaded by this loader.
	 * @return {Object} The manifest item.
	 */
	p.getItem = function() {
		return this._item;
	};

// Abstract methods. This is not properly doc'd in this class. Please see PreloadJS for full docs.

	/**
	 * Initialize the loader. This is called by the constructor.
	 * @method initialize
	 * @private
	 */
	p.init = function () {};

	/**
	 * Begin loading the queued items. This method is usually called when a preload queue is set up but not started
	 * immediately.
	 * @method load
	 */
	p.load = function() {};

	/**
	 * Close the active queue. Closing a queue completely empties the queue, and prevents any remaining items from
	 * starting to download. Note that currently there any active loads will remain open, and events may be processed.
	 * <br/><br/>
	 * To stop and restart a queue, use the <code>setPaused(true|false)</code> method instead.
	 * @method close
	 */
	p.close = function() {};


//Callback proxies
	/**
	 * Dispatch a loadStart event (onLoadStart callback). The dispatched event contains:
	 * <ul><li>target: A reference to the dispatching instance.</li></ul>
	 * @method _sendLoadStart
	 * @protected
	 */
	p._sendLoadStart = function() {
		if (this._isCanceled()) { return; }
		this.onLoadStart && this.onLoadStart({target:this});
		this._listeners && this.dispatchEvent("loadStart");
	};

	/**
	 * Dispatch a progress event (onProgress callback). The dispatched event contains:
	 * <ul><li>target: A reference to the dispatching instance</li>
	 *      <li>loaded: The amount that has been loaded.</li>
	 *      <li>total: The total amount that is being loaded.</li>
	 *      <li>progress: A normalized loaded value between 0 and 1</li></ol>
	 * @method _sendProgress
	 * @param {Number | Object} value The progress of the loaded item, or an object containing <code>loaded</code>
	 *      and <code>total</code> properties.f
	 * @protected
	 */
	p._sendProgress = function(value) {
		if (this._isCanceled()) { return; }
		var event;
		if (value instanceof Number) {
			this.progress = value;
			event = {loaded:this.progress, total:1};
		} else {
			event = value;
			this.progress = value.loaded / value.total;
			if (isNaN(this.progress) || this.progress == Infinity) { this.progress = 0; }
		}
		event.target = this;
		event.type = "progress";
		this.onProgress && this.onProgress(event);
		this._listeners && this.dispatchEvent(event);
	};

	/**
	 * Dispatch a complete event (onComplete callback). The dispatched event contains:
	 * <ul><li>target: A reference to the dispatching instance</li></ol>
	 * @method _sendComplete
	 * @protected
	 */
	p._sendComplete = function() {
		if (this._isCanceled()) { return; }
		this.onComplete && this.onComplete({target:this});
		this._listeners && this.dispatchEvent("complete");
	};

	/**
	 * Dispatch an error event (onError callback). The dispatched event contains:
	 * <ul><li>target: A reference to the dispatching instance</li>
	 *      <li>other: Dispatching objects may contain additional properties such as "text", "source", etc.</ol>
	 * @method _sendError
	 * @param {Object} event The event object containing specific error properties.
	 * @private
	 */
	p._sendError = function(event) {
		if (this._isCanceled()) { return; }
		if (event == null) { event = {}; }
		event.target = this;
		this.onError && this.onError(event);
		this._listeners && this.dispatchEvent("error", null, event);
	};

	/**
	 * Determine if the load has been canceled. This is important to ensure that method calls or asynchronous events
	 * do not cause issues after the queue has been cleaned up.
	 * @method _isCanceled
	 * @return {Boolean} If the loader has been canceled.
	 * @private
	 */
	p._isCanceled = function() {
		if (window.createjs == null || this.canceled) {
			return true;
		}
		return false;
	};

	/**
	 * Parse a file URI using the <code>FILE_PATTERN</code> RegExp pattern.
	 * @method _parseURI
	 * @param path
	 * @return {Array} The matched file contents. Please see the <code>FILE_PATTERN</code> for details on the return
	 *      value. This will return null if it does not match.
	 * @private
	 */
	p._parseURI = function(path) {
		if (!path) { return null; }

		return path.match(s.FILE_PATTERN);
	};

	p.toString = function() {
		return "[PreloadJS AbstractLoader]";
	};

	createjs.AbstractLoader = AbstractLoader;

}());