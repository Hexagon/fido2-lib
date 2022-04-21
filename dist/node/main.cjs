'use strict';

var crypto = require('crypto');
var url = require('url');
var jwkToPem = require('jwk-to-pem');
var tldts = require('tldts');
var asn1js = require('asn1js');
var pkijs = require('pkijs');
var cbor = require('cbor-x');
var punycode = require('punycode');
var jose = require('node-jose');
var webcrypto$1 = require('@peculiar/webcrypto');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
	if (e && e.__esModule) return e;
	var n = Object.create(null);
	if (e) {
		Object.keys(e).forEach(function (k) {
			if (k !== 'default') {
				var d = Object.getOwnPropertyDescriptor(e, k);
				Object.defineProperty(n, k, d.get ? d : {
					enumerable: true,
					get: function () { return e[k]; }
				});
			}
		});
	}
	n["default"] = e;
	return Object.freeze(n);
}

var crypto__namespace = /*#__PURE__*/_interopNamespace(crypto);
var jwkToPem__default = /*#__PURE__*/_interopDefaultLegacy(jwkToPem);
var pkijs__namespace = /*#__PURE__*/_interopNamespace(pkijs);
var cbor__namespace = /*#__PURE__*/_interopNamespace(cbor);
var punycode__namespace = /*#__PURE__*/_interopNamespace(punycode);
var jose__namespace = /*#__PURE__*/_interopNamespace(jose);

function checkOrigin(str) {

	let originUrl = new url.URL(str);
	let origin = originUrl.origin;

	if (origin !== str) {
		throw new Error("origin was malformatted");
	}

	let isLocalhost = (originUrl.hostname == "localhost" || originUrl.hostname.endsWith(".localhost"));

	if (originUrl.protocol !== "https:" && !isLocalhost) {
		throw new Error("origin should be https");
	}

	if ((!validDomainName(originUrl.hostname) || !validEtldPlusOne(originUrl.hostname)) && !isLocalhost) {
		throw new Error("origin is not a valid eTLD+1");
	}

	return origin;
}

function checkUrl(value, name, rules = {}) {
	if (!name) {
		throw new TypeError("name not specified in checkUrl");
	}

	if (typeof value !== "string") {
		throw new Error(`${name} must be a string`);
	}

	let urlValue = null;
	try {
		urlValue = new url.URL(value);
	} catch (err) {
		throw new Error(`${name} is not a valid eTLD+1/url`);
	}

	if (!value.startsWith("http")) {
		throw new Error(`${name} must be http protocol`);
	}

	if (!rules.allowHttp && urlValue.protocol !== "https:") {
		throw new Error(`${name} should be https`);
	}

	// origin: base url without path including /
	if (!rules.allowPath && (value.endsWith("/") || urlValue.pathname !== "/")) { // urlValue adds / in path always
		throw new Error(`${name} should not include path in url`);
	}

	if (!rules.allowHash && urlValue.hash) {
		throw new Error(`${name} should not include hash in url`);
	}

	if (!rules.allowCred && (urlValue.username || urlValue.password)) {
		throw new Error(`${name} should not include credentials in url`);
	}

	if (!rules.allowQuery && urlValue.search) {
		throw new Error(`${name} should not include query string in url`);
	}

	return value;
}

function validEtldPlusOne(value) {

	// Parse domain name
	const result = tldts.parse(value, { allowPrivateDomains: true });

	// Require valid public suffix
	if (result.publicSuffix === null) {
		return false;
	}

	// Require valid hostname
	if (result.domainWithoutSuffix === null) {
		return false;
	}

	return true;
}

function validDomainName(value) {

	// Before we can validate we need to take care of IDNs with unicode chars.
	let ascii = punycode__namespace.encode(value);

	if (ascii.length < 1) {
		// return 'DOMAIN_TOO_SHORT';
		return false;
	}
	if (ascii.length > 255) {
		// return 'DOMAIN_TOO_LONG';
		return false;
	}
	
	// Check each part's length and allowed chars.
	let labels = ascii.split(".");
	let label;
	
	for (let i = 0; i < labels.length; ++i) {
		label = labels[i];
		if (!label.length) {
			// LABEL_TOO_SHORT
			return false;
		}
		if (label.length > 63) {
			// LABEL_TOO_LONG
			return false;
		}
		if (label.charAt(0) === "-") {
			// LABEL_STARTS_WITH_DASH
			return false;
		}
		/*if (label.charAt(label.length - 1) === '-') {
			// LABEL_ENDS_WITH_DASH
			return false;
		}*/
		if (!/^[a-z0-9-]+$/.test(label)) {
			// LABEL_INVALID_CHARS
			return false;
		}
	}

	return true;
}

function checkDomainOrUrl(value, name, rules = {}) {
	if (!name) {
		throw new TypeError("name not specified in checkDomainOrUrl");
	}

	if (typeof value !== "string") {
		throw new Error(`${name} must be a string`);
	}

	if (validEtldPlusOne(value) && validDomainName(value)) return value; // if valid domain no need for futher checks

	return checkUrl(value, name, rules);
}

function checkRpId(rpId) {
	if (typeof rpId !== "string") {
		throw new Error("rpId must be a string");
	}

	let isLocalhost = (rpId === "localhost" || rpId.endsWith(".localhost"));

	if (isLocalhost) return rpId;

	return checkDomainOrUrl(rpId, "rpId");
}

function verifySignature(publicKey, expectedSignature, data, hashName) {
	const verify = crypto__namespace.createVerify(hashName || "SHA256");
	verify.write(new Uint8Array(data));
	verify.end();
	return verify.verify(publicKey, new Uint8Array(expectedSignature));
}

async function hashDigest(o, alg) {
	if (typeof o === "string") {
		o = new TextEncoder().encode(o);
	}
	let hash = crypto__namespace.createHash(alg || "sha256");
	hash.update(new Uint8Array(o));
	return new Uint8Array(hash.digest());
}

function randomValues(n) {
	return crypto__namespace.randomBytes(n);
}

function getHostname(urlIn) {
	return new url.URL(urlIn).hostname;
}

(typeof window !== "undefined") ? window.env : process.env;

let webcrypto;
webcrypto = new webcrypto$1.Crypto();

const jwsCreateVerify = jose__namespace.default.JWS.createVerify;

const ToolBox = {
	checkOrigin,
	checkRpId,
	checkDomainOrUrl,
	checkUrl,
	verifySignature,
	jwkToPem: jwkToPem__default["default"],
	hashDigest,
	randomValues,
	getHostname,
	webcrypto,
	fromBER: asn1js.fromBER,
	pkijs: pkijs__namespace,
	cbor: cbor__namespace,
	jwsCreateVerify,
};

const ToolBoxRegistration = {
	registerAsGlobal: () => {
		global.webauthnToolBox = ToolBox;
	},
};

/* ------------------------------------------------------------------------------------

  base64 - MIT License - Hexagon <hexagon@56k.guru>

  Sourced from https://github.com/Hexagon/base64 2022-04-09 1.0.18

  Unchanged

  Bundled to avoid problems when importing in both Node and Deno

  ------------------------------------------------------------------------------------

  License:

	Copyright (c) 2021 Hexagon <hexagon@56k.guru>

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:
	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.
	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	THE SOFTWARE.

  ------------------------------------------------------------------------------------  */

const 
	// Regular base64 characters
	chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",

	// Base64url characters
	charsUrl = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",

	genLookup = (target) => {
		let lookupTemp = typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
		for (let i = 0; i < chars.length; i++) {
			lookupTemp[target.charCodeAt(i)] = i;
		}
		return lookupTemp;
	},

	// Use a lookup table to find the index.
	lookup = genLookup(chars),
	lookupUrl = genLookup(charsUrl); 

let base64 = {};

/**
* Convenience function for converting a base64 encoded string to an ArrayBuffer instance
* @public
* 
* @param {string} data - Base64 representation of data
* @param {boolean} [urlMode] - If set to true, URL mode string will be expected
* @returns {ArrayBuffer} - Decoded data
*/
base64.toArrayBuffer = (data, urlMode) => {
	let bufferLength = data.length * 0.75,
		len = data.length,
		i,
		p = 0,
		encoded1,
		encoded2,
		encoded3,
		encoded4;

	if (data[data.length - 1] === "=") {
		bufferLength--;
		if (data[data.length - 2] === "=") {
			bufferLength--;
		}
	}

	const 
		arraybuffer = new ArrayBuffer(bufferLength),
		bytes = new Uint8Array(arraybuffer),
		target = urlMode ? lookupUrl : lookup;

	for (i = 0; i < len; i += 4) {
		encoded1 = target[data.charCodeAt(i)];
		encoded2 = target[data.charCodeAt(i + 1)];
		encoded3 = target[data.charCodeAt(i + 2)];
		encoded4 = target[data.charCodeAt(i + 3)];

		bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
		bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
		bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
	}

	return arraybuffer;

};

/**
* Convenience function for converting base64 encoded string to an ArrayBuffer instance
* @public
* 
* @param {ArrayBuffer} arrBuf - ArrayBuffer to be encoded
* @param {boolean} [urlMode] - If set to true, URL mode string will be returned
* @returns {string} - Base64 representation of data
*/
base64.fromArrayBuffer = (arrBuf, urlMode) => {
	let bytes = new Uint8Array(arrBuf),
		i,
		len = bytes.length,
		result = "",
		target = urlMode ? charsUrl : chars;

	for (i = 0; i < len; i += 3) {
		result += target[bytes[i] >> 2];
		result += target[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
		result += target[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
		result += target[bytes[i + 2] & 63];
	}

	if (len % 3 === 2) {
		result = result.substring(0, result.length - 1) + (urlMode ? "" : "=");
	} else if (len % 3 === 1) {
		result = result.substring(0, result.length - 2) + (urlMode ? "" : "==");
	}

	return result;
};

/**
* Convenience function for converting base64 to string
* @public
* 
* @param {string} str - Base64 encoded string to be decoded
* @param {boolean} [urlMode] - If set to true, URL mode string will be expected
* @returns {string} - Decoded string
*/
base64.toString = (str, urlMode) => {
	return new TextDecoder().decode(base64.toArrayBuffer(str, urlMode));
};

/**
* Convenience function for converting a javascript string to base64
* @public
* 
* @param {string} str - String to be converted to base64
* @param {boolean} [urlMode] - If set to true, URL mode string will be returned
* @returns {string} - Base64 encoded string
*/
base64.fromString = (str, urlMode) => {
	return base64.fromArrayBuffer(new TextEncoder().encode(str), urlMode);
};

/* 
   Based on https://raw.githubusercontent.com/apowers313/cose-to-jwk/master 1.1.0 2022-04-09 

   MIT License

   Changes by <hexagon@56k.guru>
     * Converted to ESM
     * Using bundled version of cbor-x instead of npm cbor

    Bundled to avoid dependency problems when supporting both Node and Deno
*/

// main COSE labels
// defined here: https://tools.ietf.org/html/rfc8152#section-7.1
const coseLabels = {
	"1": {
		name: "kty",
		values: {
			"2": "EC",
			"3": "RSA"
		}
	},
	"2": {
		name: "kid",
		values: {}
	},
	"3": {
		name: "alg",
		values: {
			"-7": "ECDSA_w_SHA256",
			"-8": "EdDSA",
			"-35": "ECDSA_w_SHA384",
			"-36": "ECDSA_w_SHA512",
			"-257": "RSASSA-PKCS1-v1_5_w_SHA256",
			"-258": "RSASSA-PKCS1-v1_5_w_SHA384",
			"-259": "RSASSA-PKCS1-v1_5_w_SHA512",
			"-65535": "RSASSA-PKCS1-v1_5_w_SHA1"
		}
	},
	"4": {
		name: "key_ops",
		values: {}
	},
	"5": {
		name: "base_iv",
		values: {}
	}
};

const algHashes = {
	"ECDSA_w_SHA256": "SHA256",
	// EdDSA: ""
	"ECDSA_w_SHA384": "SHA384",
	"ECDSA_w_SHA512": "SHA512",
	"RSASSA-PKCS1-v1_5_w_SHA256": "SHA256",
	"RSASSA-PKCS1-v1_5_w_SHA384": "SHA384",
	"RSASSA-PKCS1-v1_5_w_SHA512": "SHA512",
	"RSASSA-PKCS1-v1_5_w_SHA1": "SHA1"
};

function algToStr(alg) {
	if (typeof alg !== "number") {
		throw new TypeError("expected 'alg' to be a number, got: " + alg);
	}

	let algValues = coseLabels["3"].values;
	return algValues[alg];
}

function algToHashStr(alg) {
	if (typeof alg === "number") alg = algToStr(alg);

	if (typeof alg !== "string") {
		throw new Error("'alg' is not a string or a valid COSE algorithm number");
	}

	return algHashes[alg];
}

// key-specific parameters
const keyParamList = {
	// ECDSA key parameters
	// defined here: https://tools.ietf.org/html/rfc8152#section-13.1.1
	"EC": {
		"-1": {
			name: "crv",
			values: {
				"1": "P-256",
				"2": "P-384",
				"3": "P-521",
				"4": "X25519",
				"5": "X448",
				"6": "Ed25519",
				"7": "Ed448"
			}
		},
		"-2": {
			name: "x"
			// value = Buffer
		},
		"-3": {
			name: "y"
			// value = Buffer
		},
		"-4": {
			name: "d"
			// value = Buffer
		}
	},
	// RSA key parameters
	// defined here: https://tools.ietf.org/html/rfc8230#section-4
	"RSA": {
		"-1": {
			name: "n"
			// value = Buffer
		},
		"-2": {
			name: "e"
			// value = Buffer
		},
		"-3": {
			name: "d"
			// value = Buffer
		},
		"-4": {
			name: "p"
			// value = Buffer
		},
		"-5": {
			name: "q"
			// value = Buffer
		},
		"-6": {
			name: "dP"
			// value = Buffer
		},
		"-7": {
			name: "dQ"
			// value = Buffer
		},
		"-8": {
			name: "qInv"
			// value = Buffer
		},
		"-9": {
			name: "other"
			// value = Array
		},
		"-10": {
			name: "r_i"
			// value = Buffer
		},
		"-11": {
			name: "d_i"
			// value = Buffer
		},
		"-12": {
			name: "t_i"
			// value = Buffer
		}
	}

};


function coseToJwk(cose) {
	if (typeof cose !== "object") {
		throw new TypeError("'cose' argument must be an object, probably an Buffer conatining valid COSE");
	}

	cose = coerceToArrayBuffer(cose, "coseToJwk");

	let parsedCose;
	try {
		parsedCose = tools().cbor.decode(new Uint8Array(cose));
	} catch (err) {
		throw new Error("couldn't parse authenticator.authData.attestationData CBOR: " + err);
	}
	if (typeof parsedCose !== "object") {
		throw new Error("invalid parsing of authenticator.authData.attestationData CBOR");
	}
	let coseMap = new Map(Object.entries(parsedCose));

	let extraMap = new Map();

	let retKey = {};

	// parse main COSE labels
	for (let kv of coseMap) {
		let key = kv[0].toString();
		let value = kv[1].toString();

		if (!coseLabels[key]) {
			extraMap.set(kv[0], kv[1]);
			continue;
		}

		let name = coseLabels[key].name;
		if (coseLabels[key].values[value]) value = coseLabels[key].values[value];
		retKey[name] = value;
	}

	let keyParams = keyParamList[retKey.kty];

	// parse key-specific parameters
	for (let kv of extraMap) {
		let key = kv[0].toString();
		let value = kv[1];

		if (!keyParams[key]) {
			throw new Error("unknown COSE key label: " + retKey.kty + " " + key);
		}
		let name = keyParams[key].name;

		if (keyParams[key].values) {
			value = keyParams[key].values[value.toString()];
		}
		value = coerceToBase64Url(value, "coseToJwk");

		retKey[name] = value;
	}

	return retKey;
}

coseToJwk.algToStr = algToStr;
coseToJwk.algToHashStr = algToHashStr;

function abToStr(buf) {
	let str = "";
	new Uint8Array(buf).forEach((ch) => {
		str += String.fromCharCode(ch);
	});
	return str;
}

function isBase64Url(str) {
	return !!str.match(/^[A-Za-z0-9\-_]+={0,2}$/);
}

function isPem(pem) {
	if (typeof pem !== "string") {
		return false;
	}

	let pemRegex = /^-----BEGIN .+-----$\n([A-Za-z0-9+/=]|\n)*^-----END .+-----$/m;
	return !!pem.match(pemRegex);
}

function pemToBase64(pem) {
	if (!isPem(pem)) {
		throw new Error("expected PEM string as input");
	}

	let pemArr = pem.split("\n");
	// remove first and last lines
	pemArr = pemArr.slice(1, pemArr.length - 2);
	return pemArr.join("");
}

function isPositiveInteger(n) {
	return n >>> 0 === parseFloat(n);
}

function abToBuf(ab) {
	return new Uint8Array(ab).buffer;
}

function abToInt(ab) {
	if (!(ab instanceof ArrayBuffer)) {
		throw new Error("abToInt: expected ArrayBuffer");
	}

	let buf = new Uint8Array(ab);
	let cnt = ab.byteLength - 1;
	let ret = 0;
	buf.forEach((byte) => {
		ret |= (byte << (cnt * 8));
		cnt--;
	});

	return ret;
}

function abToPem(type, ab) {
	if (typeof type !== "string") {
		throw new Error("abToPem expected 'type' to be string like 'CERTIFICATE', got: " + type);
	}

	let str = coerceToBase64(ab, "pem buffer");

	return [
		`-----BEGIN ${type}-----\n`,
		...str.match(/.{1,64}/g).map((s) => s + "\n"),
		`-----END ${type}-----\n`,
	].join("");
}

/**
 * Creates a new Uint8Array based on two different ArrayBuffers
 *
 * @private
 * @param {ArrayBuffers} buffer1 The first buffer.
 * @param {ArrayBuffers} buffer2 The second buffer.
 * @return {ArrayBuffers} The new ArrayBuffer created out of the two.
 */
let appendBuffer = function(buffer1, buffer2) {
	let tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
	tmp.set(new Uint8Array(buffer1), 0);
	tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
	return tmp.buffer;
};

function coerceToArrayBuffer(buf, name) {
	
	if (!name) {
		throw new TypeError("name not specified in coerceToArrayBuffer");
	}

	// Handle empty strings
	if (typeof buf === "string" && buf === "") {
		buf = new Uint8Array(0);

	// Handle base64url and base64 strings
	} else if (typeof buf === "string") {
		// base64 to base64url
		buf = buf.replace(/\+/g, "-").replace(/\//g, "_").replace("=","");
		// base64 to Buffer
		buf = base64.toArrayBuffer(buf, true);
	}

	// Extract typed array from Array
	if(Array.isArray(buf)) {
		buf = new Uint8Array(buf);
	}

	// Extract ArrayBuffer from Node buffer
	if (typeof Buffer !== "undefined" && buf instanceof Buffer) {
		buf = new Uint8Array(buf);
		buf = buf.buffer;
	}

	// Extract arraybuffer from TypedArray
	if(buf instanceof Uint8Array) {
		buf = buf.slice(0, buf.byteLength, buf.buffer.byteOffset).buffer;
	}

	// error if none of the above worked
	if (!(buf instanceof ArrayBuffer)) {
		throw new TypeError(`could not coerce '${name}' to ArrayBuffer`);
	}

	return buf;
}


function coerceToBase64(thing, name) {
	if (!name) {
		throw new TypeError("name not specified in coerceToBase64");
	}
	
	if (typeof thing !== "string") {
		try {
			thing = base64.fromArrayBuffer(coerceToArrayBuffer(thing, name));
		} catch (e) {
			throw new Error(`could not coerce '${name}' to string`);
		}
	}

	if (typeof thing !== "string") {
		throw new Error(`could not coerce '${name}' to string`);
	}

	return thing;
}

function coerceToBase64Url(thing, name) {

	if (!name) {
		throw new TypeError("name not specified in coerceToBase64");
	}
	
	if (typeof thing !== "string") {
		try {
			thing = base64.fromArrayBuffer(coerceToArrayBuffer(thing, name), true);
		} catch (e) {
			throw new Error(`could not coerce '${name}' to string`);
		}
	}

	if (typeof thing !== "string") {
		throw new Error(`could not coerce '${name}' to string`);
	}
	
	return thing;
}

// Merged with previous abEqual
function abEqual(b1, b2) {
	if (!(b1 instanceof ArrayBuffer) ||
            !(b2 instanceof ArrayBuffer)) {
		console.log("not array buffers");
		return false;
	}

	if (b1.byteLength !== b2.byteLength) {
		console.log("not same length");
		return false;
	}
	b1 = new Uint8Array(b1);
	b2 = new Uint8Array(b2);
	for (let i = 0; i < b1.byteLength; i++) {
		if (b1[i] !== b2[i]) return false;
	}
	return true;
}

function abToHex(ab) {
	if (!(ab instanceof ArrayBuffer)) {
		throw new TypeError("Invalid argument passed to abToHex");
	}
	const result = Array.prototype.map.call(
		new Uint8Array(ab),	x => ("00" + x.toString(16)).slice(-2)
	).join("");

	return result;
}

function tools() {
	if (typeof window !== "undefined" && window.webauthnToolBox) {
		return window.webauthnToolBox;
	} else if (typeof global !== "undefined" && global.webauthnToolBox) {
		return global.webauthnToolBox;
	} else {
		//console.log('wat', global.watWat);
		throw new Error("Webauthn global ToolBox not registered");
	}	
}

function b64ToJsObject(b64, desc) {
	return JSON.parse(abToStr(coerceToArrayBuffer(b64, desc)));
}

function jsObjectToB64(obj) {
	return base64.fromString(JSON.stringify(obj).replace(/[\u{0080}-\u{FFFF}]/gu,""));
}

function validateCreateRequest() {
	let req = this.request;

	if (typeof req !== "object") {
		throw new TypeError("expected request to be Object, got " + typeof req);
	}

	if (!(req.rawId instanceof ArrayBuffer) &&
		!(req.id instanceof ArrayBuffer)) {
		throw new TypeError("expected 'id' or 'rawId' field of request to be ArrayBuffer, got rawId " + typeof req.rawId + " and id " + typeof req.id);
	}

	if (typeof req.response !== "object") {
		throw new TypeError("expected 'response' field of request to be Object, got " + typeof req.response);
	}

	if (typeof req.response.attestationObject !== "string" &&
		!(req.response.attestationObject instanceof ArrayBuffer)) {
		throw new TypeError("expected 'response.attestationObject' to be base64 String or ArrayBuffer");
	}

	if (typeof req.response.clientDataJSON !== "string" &&
		!(req.response.clientDataJSON instanceof ArrayBuffer)) {
		throw new TypeError("expected 'response.clientDataJSON' to be base64 String or ArrayBuffer");
	}

	this.audit.validRequest = true;

	return true;
}

function validateAssertionResponse() {
	let req = this.request;

	if (typeof req !== "object") {
		throw new TypeError("expected request to be Object, got " + typeof req);
	}

	if (!(req.rawId instanceof ArrayBuffer) &&
		!(req.id instanceof ArrayBuffer)) {
		throw new TypeError("expected 'id' or 'rawId' field of request to be ArrayBuffer, got rawId " + typeof req.rawId + " and id " + typeof req.id);
	}

	if (typeof req.response !== "object") {
		throw new TypeError("expected 'response' field of request to be Object, got " + typeof req.response);
	}

	if (typeof req.response.clientDataJSON !== "string" &&
		!(req.response.clientDataJSON instanceof ArrayBuffer)) {
		throw new TypeError("expected 'response.clientDataJSON' to be base64 String or ArrayBuffer");
	}

	if (typeof req.response.authenticatorData !== "string" &&
		!(req.response.authenticatorData instanceof ArrayBuffer)) {
		throw new TypeError("expected 'response.authenticatorData' to be base64 String or ArrayBuffer");
	}

	if (typeof req.response.signature !== "string" &&
		!(req.response.signature instanceof ArrayBuffer)) {
		throw new TypeError("expected 'response.signature' to be base64 String or ArrayBuffer");
	}

	if (typeof req.response.userHandle !== "string" &&
		!(req.response.userHandle instanceof ArrayBuffer) &&
		req.response.userHandle !== undefined) {
		throw new TypeError("expected 'response.userHandle' to be base64 String, ArrayBuffer, or undefined");
	}

	this.audit.validRequest = true;

	return true;
}

async function validateRawClientDataJson() {
	// XXX: this isn't very useful, since this has already been parsed...
	let rawClientDataJson = this.clientData.get("rawClientDataJson");

	if (!(rawClientDataJson instanceof ArrayBuffer)) {
		throw new Error("clientData clientDataJson should be ArrayBuffer");
	}

	this.audit.journal.add("rawClientDataJson");

	return true;
}

async function validateTransports() {
	let transports = this.authnrData.get("transports");

	if (transports != null && !Array.isArray(transports)) {
		throw new Error("expected transports to be 'null' or 'array<string>'");
	}

	for (const index in transports) {
		if (typeof transports[index] !== "string") {
			throw new Error("expected transports[" + index + "] to be 'string'");
		}
	}

	this.audit.journal.add("transports");

	return true;
}

async function validateId() {
	let rawId = this.clientData.get("rawId");

	if (!(rawId instanceof ArrayBuffer)) {
		throw new Error("expected id to be of type ArrayBuffer");
	}

	let credId = this.authnrData.get("credId");
	if (credId !== undefined && !abEqual(rawId, credId)) {
		throw new Error("id and credId were not the same");
	}
	
	let allowCredentials = this.expectations.get("allowCredentials");

	if (allowCredentials != undefined) {
		if (!allowCredentials.some(cred => {
			let result = abEqual(rawId, cred.id);
			return result;
		}
		)) {
			throw new Error("Credential ID does not match any value in allowCredentials");
		}
	}

	this.audit.journal.add("rawId");

	return true;
}

async function validateCreateType() {
	let type = this.clientData.get("type");

	if (type !== "webauthn.create") {
		throw new Error("clientData type should be 'webauthn.create', got: " + type);
	}

	this.audit.journal.add("type");

	return true;
}

async function validateGetType() {
	let type = this.clientData.get("type");

	if (type !== "webauthn.get") {
		throw new Error("clientData type should be 'webauthn.get'");
	}

	this.audit.journal.add("type");

	return true;
}

async function validateChallenge() {
	let expectedChallenge = this.expectations.get("challenge");
	let challenge = this.clientData.get("challenge");

	if (typeof challenge !== "string") {
		throw new Error("clientData challenge was not a string");
	}

	if (!isBase64Url(challenge)) {
		throw new TypeError("clientData challenge was not properly encoded base64url");
	}

	challenge = challenge.replace(/={1,2}$/, "");

	// console.log("challenge", challenge);
	// console.log("expectedChallenge", expectedChallenge);
	if (challenge !== expectedChallenge) {
		throw new Error("clientData challenge mismatch");
	}

	this.audit.journal.add("challenge");

	return true;
}

async function validateTokenBinding() {
	// TODO: node.js can't support token binding right now :(
	let tokenBinding = this.clientData.get("tokenBinding");

	if (typeof tokenBinding === "object") {
		if (tokenBinding.status !== "not-supported" &&
			tokenBinding.status !== "supported") {
			throw new Error("tokenBinding status should be 'not-supported' or 'supported', got: " + tokenBinding.status);
		}

		if (Object.keys(tokenBinding).length != 1) {
			throw new Error("tokenBinding had too many keys");
		}
	} else if (tokenBinding !== undefined) {
		throw new Error("Token binding field malformed: " + tokenBinding);
	}

	// TODO: add audit.info for token binding status so that it can be used for policies, risk, etc.
	this.audit.journal.add("tokenBinding");

	return true;
}

async function validateRawAuthnrData() {
	// XXX: this isn't very useful, since this has already been parsed...
	let rawAuthnrData = this.authnrData.get("rawAuthnrData");
	if (!(rawAuthnrData instanceof ArrayBuffer)) {
		throw new Error("authnrData rawAuthnrData should be ArrayBuffer");
	}

	this.audit.journal.add("rawAuthnrData");

	return true;
}

async function validateFlags() {
	let expectedFlags = this.expectations.get("flags");
	let flags = this.authnrData.get("flags");

	for (let expFlag of expectedFlags) {
		if (expFlag === "UP-or-UV") {
			if (flags.has("UV")) {
				if (flags.has("UP")) {
					continue;
				} else {
					throw new Error("expected User Presence (UP) flag to be set if User Verification (UV) is set");
				}
			} else if (flags.has("UP")) {
				continue;
			} else {
				throw new Error("expected User Presence (UP) or User Verification (UV) flag to be set and neither was");
			}
		}

		if (expFlag === "UV") {
			if (flags.has("UV")) {
				if (flags.has("UP")) {
					continue;
				} else {
					throw new Error("expected User Presence (UP) flag to be set if User Verification (UV) is set");
				}
			} else {
				throw new Error(`expected flag was not set: ${expFlag}`);
			}
		}

		if (!flags.has(expFlag)) {
			throw new Error(`expected flag was not set: ${expFlag}`);
		}
	}

	this.audit.journal.add("flags");

	return true;
}

async function validateInitialCounter() {
	let counter = this.authnrData.get("counter");

	// TODO: does counter need to be zero initially? probably not... I guess..
	if (typeof counter !== "number") {
		throw new Error("authnrData counter wasn't a number");
	}

	this.audit.journal.add("counter");

	return true;
}

async function validateAaguid() {
	let aaguid = this.authnrData.get("aaguid");

	if (!(aaguid instanceof ArrayBuffer)) {
		throw new Error("authnrData AAGUID is not ArrayBuffer");
	}

	if (aaguid.byteLength !== 16) {
		throw new Error("authnrData AAGUID was wrong length");
	}

	this.audit.journal.add("aaguid");

	return true;
}

async function validateCredId() {
	let credId = this.authnrData.get("credId");
	let credIdLen = this.authnrData.get("credIdLen");

	if (!(credId instanceof ArrayBuffer)) {
		throw new Error("authnrData credId should be ArrayBuffer");
	}

	if (typeof credIdLen !== "number") {
		throw new Error("authnrData credIdLen should be number, got " + typeof credIdLen);
	}

	if (credId.byteLength !== credIdLen) {
		throw new Error("authnrData credId was wrong length");
	}

	this.audit.journal.add("credId");
	this.audit.journal.add("credIdLen");

	return true;
}

async function validatePublicKey() {
	// XXX: the parser has already turned this into PEM at this point
	// if something were malformatted or wrong, we probably would have
	// thrown an error well before this.
	// Maybe we parse the ASN.1 and make sure attributes are correct?
	// Doesn't seem very worthwhile...

	let cbor = this.authnrData.get("credentialPublicKeyCose");
	let jwk = this.authnrData.get("credentialPublicKeyJwk");
	let pem = this.authnrData.get("credentialPublicKeyPem");

	// cbor
	if (!(cbor instanceof ArrayBuffer)) {
		throw new Error("authnrData credentialPublicKeyCose isn't of type ArrayBuffer");
	}
	this.audit.journal.add("credentialPublicKeyCose");

	// jwk
	if (typeof jwk !== "object") {
		throw new Error("authnrData credentialPublicKeyJwk isn't of type Object");
	}

	if (typeof jwk.kty !== "string") {
		throw new Error("authnrData credentialPublicKeyJwk.kty isn't of type String");
	}

	if (typeof jwk.alg !== "string") {
		throw new Error("authnrData credentialPublicKeyJwk.alg isn't of type String");
	}

	switch (jwk.kty) {
		case "EC":
			if (typeof jwk.crv !== "string") {
				throw new Error("authnrData credentialPublicKeyJwk.crv isn't of type String");
			}
			break;
		case "RSA":
			if (typeof jwk.n !== "string") {
				throw new Error("authnrData credentialPublicKeyJwk.n isn't of type String");
			}

			if (typeof jwk.e !== "string") {
				throw new Error("authnrData credentialPublicKeyJwk.e isn't of type String");
			}
			break;
		default:
			throw new Error("authnrData unknown JWK key type: " + jwk.kty);
	}

	this.audit.journal.add("credentialPublicKeyJwk");

	// pem
	if (typeof pem !== "string") {
		throw new Error("authnrData credentialPublicKeyPem isn't of type String");
	}

	if (!isPem(pem)) {
		throw new Error("authnrData credentialPublicKeyPem was malformatted");
	}
	this.audit.journal.add("credentialPublicKeyPem");

	return true;
}

async function validateCounter() {
	let prevCounter = this.expectations.get("prevCounter");
	let counter = this.authnrData.get("counter");
	let counterSupported = !(counter === 0 && prevCounter === 0);

	if (counter <= prevCounter && counterSupported) {
		throw new Error("counter rollback detected");
	}

	this.audit.journal.add("counter");
	this.audit.info.set("counter-supported", "" + counterSupported);

	return true;
}

async function validateAudit() {
	let journal = this.audit.journal;
	let clientData = this.clientData;
	let authnrData = this.authnrData;

	for (let kv of clientData) {
		let val = kv[0];
		if (!journal.has(val)) {
			throw new Error(`internal audit failed: ${val} was not validated`);
		}
	}

	for (let kv of authnrData) {
		let val = kv[0];
		if (!journal.has(val)) {
			throw new Error(`internal audit failed: ${val} was not validated`);
		}
	}

	if (journal.size !== (clientData.size + authnrData.size)) {
		throw new Error(`internal audit failed: ${journal.size} fields checked; expected ${clientData.size + authnrData.size}`);
	}

	if (!this.audit.validExpectations) {
		throw new Error("internal audit failed: expectations not validated");
	}

	if (!this.audit.validRequest) {
		throw new Error("internal audit failed: request not validated");
	}

	this.audit.complete = true;

	return true;
}


async function validateRpIdHash() {
	let rpIdHash = this.authnrData.get("rpIdHash");

	if (typeof Buffer !== "undefined" && rpIdHash instanceof Buffer) {
		rpIdHash = new Uint8Array(rpIdHash).buffer;
	}

	if (!(rpIdHash instanceof ArrayBuffer)) {
		throw new Error("couldn't coerce clientData rpIdHash to ArrayBuffer");
	}

	let domain = this.expectations.has("rpId")
		? this.expectations.get("rpId")
		: tools().getHostname(this.expectations.get("origin"));

	let createdHash = new Uint8Array(await tools().hashDigest(domain)).buffer;

	// wouldn't it be weird if two SHA256 hashes were different lengths...?
	if (rpIdHash.byteLength !== createdHash.byteLength) {
		throw new Error("authnrData rpIdHash length mismatch");
	}

	rpIdHash = new Uint8Array(rpIdHash);
	createdHash = new Uint8Array(createdHash);
	
	for (let i = 0; i < rpIdHash.byteLength; i++) {
		if (rpIdHash[i] !== createdHash[i]) {
			throw new TypeError("authnrData rpIdHash mismatch");
		}
	}

	this.audit.journal.add("rpIdHash");

	return true;
}

async function validateAttestation() {
	return Fido2Lib.validateAttestation.call(this);
}

async function validateExpectations() {
	/* eslint complexity: ["off"] */
	let req = this.requiredExpectations;
	let opt = this.optionalExpectations;
	let exp = this.expectations;

	if (!(exp instanceof Map)) {
		throw new Error("expectations should be of type Map");
	}

	if (Array.isArray(req)) {
		req = new Set([req]);
	}

	if (!(req instanceof Set)) {
		throw new Error("requiredExpectaions should be of type Set");
	}

	if (Array.isArray(opt)) {
		opt = new Set([opt]);
	}

	if (!(opt instanceof Set)) {
		throw new Error("optionalExpectations should be of type Set");
	}

	for (let field of req) {
		if (!exp.has(field)) {
			throw new Error(`expectation did not contain value for '${field}'`);
		}
	}

	let optCount = 0;
	for (const [field] of exp) {
		if (opt.has(field)) {
			optCount++;
		}
	}

	if (req.size !== exp.size - optCount) {
		throw new Error(`wrong number of expectations: should have ${req.size} but got ${exp.size - optCount}`);
	}

	// origin - isValid
	if (req.has("origin")) {
		let expectedOrigin = exp.get("origin");

		tools().checkOrigin(expectedOrigin);
	}

	// rpId - optional, isValid
	if (exp.has("rpId")) {
		let expectedRpId = exp.get("rpId");

		tools().checkRpId(expectedRpId);
	}

	// challenge - is valid base64url string
	if (exp.has("challenge")) {
		let challenge = exp.get("challenge");
		if (typeof challenge !== "string") {
			throw new Error("expected challenge should be of type String, got: " + typeof challenge);
		}

		if (!isBase64Url(challenge)) {
			throw new Error("expected challenge should be properly encoded base64url String");
		}
	}

	// flags - is Array or Set
	if (req.has("flags")) {
		let validFlags = new Set(["UP", "UV", "UP-or-UV", "AT", "ED"]);
		let flags = exp.get("flags");

		for (let flag of flags) {
			if (!validFlags.has(flag)) {
				throw new Error(`expected flag unknown: ${flag}`);
			}
		}
	}

	// prevCounter
	if (req.has("prevCounter")) {
		let prevCounter = exp.get("prevCounter");

		if (!isPositiveInteger(prevCounter)) {
			throw new Error("expected counter to be positive integer");
		}
	}

	// publicKey
	if (req.has("publicKey")) {
		let publicKey = exp.get("publicKey");
		if (!isPem(publicKey)) {
			throw new Error("expected publicKey to be in PEM format");
		}
	}

	// userHandle
	if (req.has("userHandle")) {
		let userHandle = exp.get("userHandle");
		if (userHandle !== null &&
			typeof userHandle !== "string") {
			throw new Error("expected userHandle to be null or string");
		}
	}


	// allowCredentials
	if (exp.has("allowCredentials")) {
		let allowCredentials = exp.get("allowCredentials");
		if (allowCredentials != null) {
			if (!Array.isArray(allowCredentials)) {
				throw new Error("expected allowCredentials to be null or array");
			} else {
				for (const index in allowCredentials) {
					if (typeof allowCredentials[index].id === "string") {
						allowCredentials[index].id = coerceToArrayBuffer(allowCredentials[index].id, "allowCredentials[" + index + "].id");
					}
					if (allowCredentials[index].id == null || !(allowCredentials[index].id instanceof ArrayBuffer)) {
						throw new Error("expected id of allowCredentials[" + index + "] to be ArrayBuffer");
					}
					if (allowCredentials[index].type == null || allowCredentials[index].type !== "public-key") {
						throw new Error("expected type of allowCredentials[" + index + "] to be string with value 'public-key'");
					}
					if (allowCredentials[index].transports != null && !Array.isArray(allowCredentials[index].transports)) {
						throw new Error("expected transports of allowCredentials[" + index + "] to be array or null");
					} else if (allowCredentials[index].transports != null && !allowCredentials[index].transports.every(el => ["usb", "nfc", "ble", "internal"].includes(el))) {
						throw new Error("expected transports of allowCredentials[" + index + "] to be string with value 'usb', 'nfc', 'ble', 'internal' or null");
					}
				}
			}
		}

	}

	this.audit.validExpectations = true;

	return true;
}

async function validateUserHandle() {
	let userHandle = this.authnrData.get("userHandle");

	if (userHandle === undefined ||
		userHandle === null ||
		userHandle === "") {
		this.audit.journal.add("userHandle");
		return true;
	}

	userHandle = coerceToBase64Url(userHandle, "userHandle");
	let expUserHandle = this.expectations.get("userHandle");
	if (typeof userHandle === "string" &&
		userHandle === expUserHandle) {
		this.audit.journal.add("userHandle");
		return true;
	}

	throw new Error("unable to validate userHandle");
}

async function validateAssertionSignature() {
	let expectedSignature = this.authnrData.get("sig");
	let publicKey = this.expectations.get("publicKey");
	let rawAuthnrData = this.authnrData.get("rawAuthnrData");
	let rawClientData = this.clientData.get("rawClientDataJson");

	let clientDataHashBuf = await tools().hashDigest(rawClientData);
	let clientDataHash = new Uint8Array(clientDataHashBuf).buffer;

	let res = await tools().verifySignature(publicKey, expectedSignature, appendBuffer(rawAuthnrData,clientDataHash));
	if (!res) {
		throw new Error("signature validation failed");
	}

	this.audit.journal.add("sig");

	return true;
}

async function validateOrigin() {
	let expectedOrigin = this.expectations.get("origin");
	let clientDataOrigin = this.clientData.get("origin");

	let origin = tools().checkOrigin(clientDataOrigin);

	if (origin !== expectedOrigin) {
		throw new Error("clientData origin did not match expected origin");
	}

	this.audit.journal.add("origin");

	return true;
}

function attach(o) {
	let mixins = {
		validateExpectations,
		validateCreateRequest,
		// clientData validators
		validateRawClientDataJson,
		validateOrigin,
		validateId,
		validateCreateType,
		validateGetType,
		validateChallenge,
		validateTokenBinding,
		validateTransports,
		// authnrData validators		
		validateRawAuthnrData,
		validateAttestation,
		validateAssertionSignature,
		validateRpIdHash,
		validateAaguid,
		validateCredId,
		validatePublicKey,
		validateFlags,
		validateUserHandle,
		validateCounter,
		validateInitialCounter,
		validateAssertionResponse,
		// audit structures
		audit: {
			validExpectations: false,
			validRequest: false,
			complete: false,
			journal: new Set(),
			warning: new Map(),
			info: new Map(),
		},
		validateAudit,
	};

	for (let key of Object.keys(mixins)) {
		o[key] = mixins[key];
	}
}

// NOTE: throws if origin is https and has port 443
// use `new URL(originstr).origin` to create a properly formatted origin
function parseExpectations(exp) {
	if (typeof exp !== "object") {
		throw new TypeError("expected 'expectations' to be of type object, got " + typeof exp);
	}

	let ret = new Map();

	// origin
	if (exp.origin) {
		if (typeof exp.origin !== "string") {
			throw new TypeError("expected 'origin' should be string, got " + typeof exp.origin);
		}

		let origin = tools().checkOrigin(exp.origin);
		ret.set("origin", origin);
	}

	// rpId
	if (exp.rpId) {
		if (typeof exp.rpId !== "string") {
			throw new TypeError("expected 'rpId' should be string, got " + typeof exp.rpId);
		}

		let rpId = tools().checkRpId(exp.rpId);
		ret.set("rpId", rpId);
	}

	// challenge
	if (exp.challenge) {
		let challenge = exp.challenge;
		challenge = coerceToBase64Url(challenge, "expected challenge");
		ret.set("challenge", challenge);
	}

	// flags
	if (exp.flags) {
		let flags = exp.flags;

		if (Array.isArray(flags)) {
			flags = new Set(flags);
		}

		if (!(flags instanceof Set)) {
			throw new TypeError("expected flags to be an Array or a Set, got: " + typeof flags);
		}

		ret.set("flags", flags);
	}

	// counter
	if (exp.prevCounter !== undefined) {
		if (typeof exp.prevCounter !== "number") {
			throw new TypeError("expected 'prevCounter' should be Number, got " + typeof exp.prevCounter);
		}

		ret.set("prevCounter", exp.prevCounter);
	}

	// publicKey
	if (exp.publicKey) {
		if (typeof exp.publicKey !== "string") {
			throw new TypeError("expected 'publicKey' should be String, got " + typeof exp.publicKey);
		}

		ret.set("publicKey", exp.publicKey);
	}

	// userHandle
	if (exp.userHandle !== undefined) {
		let userHandle = exp.userHandle;
		if (userHandle !== null && userHandle !== "") userHandle = coerceToBase64Url(userHandle, "userHandle");
		ret.set("userHandle", userHandle);
	}


	// allowCredentials
	if (exp.allowCredentials !== undefined) {

		let allowCredentials = exp.allowCredentials;

		if (allowCredentials !== null && !Array.isArray(allowCredentials)) {
			throw new TypeError("expected 'allowCredentials' to be null or array, got " + typeof allowCredentials);
		}

		for (const index in allowCredentials) {
			if (allowCredentials[index].id != null) {
				allowCredentials[index].id = coerceToArrayBuffer(allowCredentials[index].id, "allowCredentials[" + index + "].id");
			}
		}
		ret.set("allowCredentials", allowCredentials);
	}

	return ret;
}

async function parseAuthnrAttestationResponse(msg) {

	if (typeof msg !== "object") {
		throw new TypeError("expected msg to be Object");
	}

	if (typeof msg.response !== "object") {
		throw new TypeError("expected response to be Object");
	}

	let attestationObject = msg.response.attestationObject;

	// update docs to say ArrayBuffer-ish object
	attestationObject = coerceToArrayBuffer(attestationObject, "attestationObject");

	let parsed;
	try {
		parsed = tools().cbor.decode(new Uint8Array(attestationObject));
	} catch (err) {
		throw new TypeError("couldn't parse attestationObject cbor" + err);
	}

	if (typeof parsed !== "object") {
		throw new TypeError("invalid parsing of attestationObject cbor");
	}

	if (typeof parsed.fmt !== "string") {
		throw new Error("expected attestation  to contain a 'fmt' string");
	}

	if (typeof parsed.attStmt !== "object") {
		throw new Error("expected attestation cbor to contain a 'attStmt' object");
	}

	if (!(parsed.authData instanceof Uint8Array)) {
		throw new Error("expected attestation cbor to contain a 'authData' byte sequence");
	}

	if (msg.transports != undefined && !Array.isArray(msg.transports)) {
		throw new Error("expected transports to be 'null' or 'array<string>'");
	}

	// have to require here to prevent circular dependency
	let ret = new Map([
		...Fido2Lib.parseAttestation(parsed.fmt, parsed.attStmt),
		// return raw buffer for future signature verification
		["rawAuthnrData", coerceToArrayBuffer(parsed.authData, "authData")],
		["transports", msg.transports],
		// parse authData
		...await parseAuthenticatorData(parsed.authData),
	]);

	return ret;
}

async function parseAuthenticatorData(authnrDataArrayBuffer) {
	
	authnrDataArrayBuffer = coerceToArrayBuffer(authnrDataArrayBuffer, "authnrDataArrayBuffer");
	let ret = new Map();
	let authnrDataBuf = new DataView(authnrDataArrayBuffer);
	let offset = 0;
	ret.set("rpIdHash", authnrDataBuf.buffer.slice(offset, offset + 32));
	offset += 32;
	let flags = authnrDataBuf.getUint8(offset);
	let flagsSet = new Set();
	ret.set("flags", flagsSet);
	if (flags & 0x01) flagsSet.add("UP");
	if (flags & 0x02) flagsSet.add("RFU1");
	if (flags & 0x04) flagsSet.add("UV");
	if (flags & 0x08) flagsSet.add("RFU3");
	if (flags & 0x10) flagsSet.add("RFU4");
	if (flags & 0x20) flagsSet.add("RFU5");
	if (flags & 0x40) flagsSet.add("AT");
	if (flags & 0x80) flagsSet.add("ED");
	offset++;
	ret.set("counter", authnrDataBuf.getUint32(offset, false));
	offset += 4;

	// see if there's more data to process
	let attestation = flagsSet.has("AT");
	let extensions = flagsSet.has("ED");

	if (attestation) {
		ret.set("aaguid", authnrDataBuf.buffer.slice(offset, offset + 16));
		offset += 16;
		let credIdLen = authnrDataBuf.getUint16(offset, false);
		ret.set("credIdLen", credIdLen);
		offset += 2;
		ret.set("credId", authnrDataBuf.buffer.slice(offset, offset + credIdLen));
		offset += credIdLen;
		let credentialPublicKeyCose = authnrDataBuf.buffer.slice(offset, authnrDataBuf.buffer.byteLength);
		ret.set("credentialPublicKeyCose", credentialPublicKeyCose);
		let jwk = coseToJwk(credentialPublicKeyCose);
		ret.set("credentialPublicKeyJwk", jwk);
		ret.set("credentialPublicKeyPem", await tools().jwkToPem(jwk));
	}

	// TODO: parse extensions
	if (extensions) {
		// extensionStart = offset
		throw new Error("authenticator extensions not supported");
	}

	return ret;
}

async function parseAuthnrAssertionResponse(msg) {
	if (typeof msg !== "object") {
		throw new TypeError("expected msg to be Object");
	}

	if (typeof msg.response !== "object") {
		throw new TypeError("expected response to be Object");
	}

	let userHandle;
	if (msg.response.userHandle !== undefined) {
		userHandle = coerceToArrayBuffer(msg.response.userHandle, "response.userHandle");
		if (userHandle.byteLength === 0) {
			userHandle = undefined;
		}
	}

	let sigAb = coerceToArrayBuffer(msg.response.signature, "response.signature");
	let ret = new Map([
		["sig", sigAb],
		["userHandle", userHandle],
		["rawAuthnrData", coerceToArrayBuffer(msg.response.authenticatorData, "response.authenticatorData")],
		...await parseAuthenticatorData(msg.response.authenticatorData),
	]);

	return ret;
}

/**
 * Parses the clientData JSON byte stream into an Object
 * @param  {ArrayBuffer} clientDataJSON The ArrayBuffer containing the properly formatted JSON of the clientData object
 * @return {Object}                The parsed clientData object
 */
function parseClientResponse(msg) {
	if (typeof msg !== "object") {
		throw new TypeError("expected msg to be Object");
	}

	if (msg.id && !msg.rawId) {
		msg.rawId = msg.id;
	}
	let rawId = coerceToArrayBuffer(msg.rawId, "rawId");

	if (typeof msg.response !== "object") {
		throw new TypeError("expected response to be Object");
	}

	let clientDataJSON = coerceToArrayBuffer(msg.response.clientDataJSON, "clientDataJSON");
	if (!(clientDataJSON instanceof ArrayBuffer)) {
		throw new TypeError("expected 'clientDataJSON' to be ArrayBuffer");
	}

	// convert to string
	let clientDataJson = abToStr(clientDataJSON);

	// parse JSON string
	let parsed;
	try {
		parsed = JSON.parse(clientDataJson);
	} catch (err) {
		throw new Error("couldn't parse clientDataJson: " + err);
	}

	let ret = new Map([
		["challenge", parsed.challenge],
		["origin", parsed.origin],
		["type", parsed.type],
		["tokenBinding", parsed.tokenBinding],
		["rawClientDataJson", clientDataJSON],
		["rawId", rawId],
	]);

	return ret;
}

const lockSym = Symbol();

/**
 * The base class of {@link Fido2AttestationResult} and {@link Fido2AssertionResult}
 * @property {Map} authnrData Authenticator data that was parsed and validated
 * @property {Map} clientData Client data that was parsed and validated
 * @property {Map} expectations The expectations that were used to validate the result
 * @property {Object} request The request that was validated
 * @property {Map} audit A collection of audit information, such as useful warnings and information. May be useful for risk engines or for debugging.
 * @property {Boolean} audit.validExpectations Whether the expectations that were provided were complete and valid
 * @property {Boolean} audit.validRequest Whether the request message was complete and valid
 * @property {Boolean} audit.complete Whether all fields in the result have been validated
 * @property {Set} audit.journal A list of the fields that were validated
 * @property {Map} audit.warning A set of warnings that were generated while validating the result
 * @property {Map} audit.info A set of informational fields that were generated while validating the result. Includes any x509 extensions of the attestation certificate during registration, and whether the key supports a rollback counter during authentication.
 */
class Fido2Result {
	constructor(sym) {
		if (sym !== lockSym) {
			throw new Error("Do not create with 'new' operator. Call 'Fido2AttestationResult.create()' or 'Fido2AssertionResult.create()' instead.");
		}

		attach(this);
	}

	parse() {
		// TODO: id
		this.clientData = parseClientResponse(this.request);
	}

	async validate() {
		// clientData, except type
		await this.validateRawClientDataJson();
		await this.validateOrigin();
		await this.validateChallenge();
		await this.validateTokenBinding();
		await this.validateId();

		// authenticatorData, minus attestation
		await this.validateRawAuthnrData();
		await this.validateRpIdHash();
		await this.validateFlags();
	}

	async create(req, exp) {
		if (typeof req !== "object") {
			throw new TypeError("expected 'request' to be object, got: " + typeof req);
		}

		if (typeof exp !== "object") {
			throw new TypeError("expected 'expectations' to be object, got: " + typeof exp);
		}

		this.expectations = parseExpectations(exp);
		this.request = req;
		
		// validate that input expectations and request are complete and in the right format
		await this.validateExpectations();

		// parse and validate all the request fields (CBOR, etc.)
		await this.parse();
		await this.validate();

		// ensure the parsing and validation went well
		await this.validateAudit();

		return this;
	}
}

/**
 * A validated attesetation result
 * @extends {Fido2Result}
 */
class Fido2AttestationResult extends Fido2Result {
	constructor(sym) {
		super(sym);

		this.requiredExpectations = new Set([
			"origin",
			"challenge",
			"flags",
		]);
		this.optionalExpectations = new Set([
			"rpId",
		]);
	}

	async parse() {
		this.validateCreateRequest();
		await super.parse();
		this.authnrData = await parseAuthnrAttestationResponse(this.request);
	}

	async validate() {
		await this.validateCreateType();
		await this.validateAaguid();
		await this.validatePublicKey();
		await super.validate();
		await this.validateAttestation();
		await this.validateInitialCounter();
		await this.validateCredId();
		await this.validateTransports();
	}

	static create(req, exp, tools) {
		return new Fido2AttestationResult(lockSym).create(req, exp, tools);
	}
}

/**
 * A validated assertion result
 * @extends {Fido2Result}
 */
class Fido2AssertionResult extends Fido2Result {
	constructor(sym, tools) {
		super(sym, tools);
		this.requiredExpectations = new Set([
			"origin",
			"challenge",
			"flags",
			"prevCounter",
			"publicKey",
			"userHandle",
		]);
		this.optionalExpectations = new Set([
			"rpId",
			"allowCredentials",
		]);
	}

	async parse() {
		this.validateAssertionResponse();
		await super.parse();
		this.authnrData = await parseAuthnrAssertionResponse(this.request);
	}

	async validate() {
		await this.validateGetType();
		await super.validate();
		await this.validateAssertionSignature();
		await this.validateUserHandle();
		await this.validateCounter();
	}

	static create(req, exp, tools) {
		return new Fido2AssertionResult(lockSym).create(req, exp, tools);
	}
}

let initiated = false,
	CryptoEngine,
	PkijsCertificate,
	PkijsCertificateRevocationList,
	CertificateChainValidationEngine;

function ensureInitiated() {
	if (!initiated) {
		const pkijsResult = tools().pkijs;

		CryptoEngine = pkijsResult.CryptoEngine;
		PkijsCertificate = pkijsResult.Certificate;
		PkijsCertificateRevocationList = pkijsResult.CertificateRevocationList;
		CertificateChainValidationEngine = pkijsResult.CertificateChainValidationEngine;

		// install crypto engine in pkijs
		tools().pkijs.setEngine("newEngine", tools().webcrypto, new CryptoEngine({
			name: "",
			crypto: tools().webcrypto,
			subtle: tools().webcrypto.subtle,
		}));

		initiated = true;
	}
}

class Certificate {
	constructor(cert) {
		
		ensureInitiated();

		if (isPem(cert)) {
			cert = pemToBase64(cert);
		}

		cert = coerceToArrayBuffer(cert, "certificate");
		if (cert.byteLength === 0) {
			throw new Error("cert was empty (0 bytes)");
		}

		let asn1 = tools().fromBER(cert);
		if (asn1.offset === -1) {
			throw new Error("error parsing ASN.1");
		}

		this._cert = new PkijsCertificate({ schema: asn1.result });
		this.warning = new Map();
		this.info = new Map();
	}

	verify() {
		let issuerSerial = this.getIssuer();
		let issuerCert = CertManager.getCertBySerial(issuerSerial);
		let _issuerCert = issuerCert ? issuerCert._cert : undefined;
		return this._cert.verify(_issuerCert)
			.catch((err) => {
				// who the hell throws a string?
				if (typeof err === "string") {
					err = new Error(err);
				}

				return Promise.reject(err);
			});
	}

	getPublicKey() {
		let key;
		return this._cert.getPublicKey()
			.then((k) => {
				key = k;
				return tools().webcrypto.subtle.exportKey("jwk", key);
			});
	}

	getIssuer() {
		return this._cert.issuer.typesAndValues[0].value.valueBlock.value;
	}

	getSerial() {
		return this._cert.subject.typesAndValues[0].value.valueBlock.value;
	}

	getVersion() {
		// x.509 versions:
		// 0 = v1
		// 1 = v2
		// 2 = v3
		return (this._cert.version + 1);
	}

	getSubject() {
		let ret = new Map();
		let subjectItems = this._cert.subject.typesAndValues;
		for (let subject of subjectItems) {
			let kv = resolveOid(subject.type, decodeValue(subject.value.valueBlock));
			ret.set(kv.id, kv.value);
		}

		return ret;
	}

	getExtensions() {
		let ret = new Map();

		if (this._cert.extensions === undefined) return ret;

		for (let ext of this._cert.extensions) {

			let kv;

			let v = ext.parsedValue || ext.extnValue;
			if (v.valueBlock) v = decodeValue(v.valueBlock);
			try {
				kv = resolveOid(ext.extnID, v);
			} catch (err) {
				if (ext.critical === false) {
					this.warning.set("x509-extension-error", ext.extnID + ": " + err.message);
					continue;
				} else {
					throw err;
				}
			}

			ret.set(kv.id, kv.value);
		}

		return ret;
	}
}

function resolveOid(id, value) {
	/* eslint complexity: ["off"] */
	let ret = {
		id,
		value,
	};

	// console.log("resolveOid id", id, "value", value);
	if (value && value.valueHex) value = value.valueHex;

	let retMap;
	switch (id) {
	// FIDO
		case "1.3.6.1.4.1.45724.2.1.1":
			ret.id = "fido-u2f-transports";
			ret.value = decodeU2FTransportType(value);
			return ret;
		case "1.3.6.1.4.1.45724.1.1.4":
			ret.id = "fido-aaguid";
			ret.value = decodeFidoAaguid(value);
			return ret;

		// Subject
		case "2.5.4.6":
			ret.id = "country-name";
			return ret;
		case "2.5.4.10":
			ret.id = "organization-name";
			return ret;
		case "2.5.4.11":
			ret.id = "organizational-unit-name";
			return ret;
		case "2.5.4.3":
			ret.id = "common-name";
			return ret;

		// cert attributes
		case "2.5.29.14":
			ret.id = "subject-key-identifier";
			return ret;
		case "2.5.29.15":
			ret.id = "key-usage";
			ret.value = decodeKeyUsage(value);
			return ret;
		case "2.5.29.19":
			ret.id = "basic-constraints";
			return ret;
		case "2.5.29.35":
			retMap = new Map();
			ret.id = "authority-key-identifier";
			retMap.set("key-identifier", decodeValue(value.keyIdentifier));
			// TODO: other values
			ret.value = retMap;
			return ret;
		case "2.5.29.32":
			ret.id = "certificate-policies";
			ret.value = decodeCertificatePolicies(value);
			return ret;
		case "1.3.6.1.4.1.311.21.31":
			ret.id = "policy-qualifiers";
			ret.value = decodePolicyQualifiers(value);
			return ret;
		case "2.5.29.37":
			ret.id = "ext-key-usage";
			ret.value = decodeExtKeyUsage(value);
			return ret;
		case "2.5.29.17":
			ret.id = "subject-alt-name";
			ret.value = decodeAltNames(value);
			return ret;
		case "1.3.6.1.5.5.7.1.1":
			ret.id = "authority-info-access";
			ret.value = decodeAuthorityInfoAccess(value);
			return ret;
		case "1.3.6.1.5.5.7.48.2":
			ret.id = "cert-authority-issuers";
			if (typeof value !== "object") {
				throw new Error("expect cert-authority-issues to have Object as value");
			}
			ret.value = decodeGeneralName(value.type, value.value);
			return ret;
		case "1.3.6.1.5.5.7.2.2":
			ret.id = "policy-qualifier";
			ret.value = decodeValue(value.valueBlock);
			return ret;

		// TPM
		case "2.23.133.8.3":
			ret.id = "tcg-kp-aik-certificate";
			return ret;
		case "2.23.133.2.1":
			ret.id = "tcg-at-tpm-manufacturer";
			return ret;
		case "2.23.133.2.2":
			ret.id = "tcg-at-tpm-model";
			return ret;
		case "2.23.133.2.3":
			ret.id = "tcg-at-tpm-version";
			return ret;

		// Yubico
		case "1.3.6.1.4.1.41482.2":
			ret.id = "yubico-device-id";
			ret.value = resolveOid(abToStr(value)).id;
			return ret;
		case "1.3.6.1.4.1.41482.1.1":
			ret.id = "Security Key by Yubico";
			return ret;
		case "1.3.6.1.4.1.41482.1.2":
			ret.id = "YubiKey NEO/NEO-n";
			return ret;
		case "1.3.6.1.4.1.41482.1.3":
			ret.id = "YubiKey Plus";
			return ret;
		case "1.3.6.1.4.1.41482.1.4":
			ret.id = "YubiKey Edge";
			return ret;
		case "1.3.6.1.4.1.41482.1.5":
			ret.id = "YubiKey 4/YubiKey 4 Nano";
			return ret;

			// TODO
			// 1.3.6.1.4.1.45724.1.1.4 FIDO AAGUID
			// basic-constraints Yubico FIDO2, ST Micro
			// 2.5.29.35 ST Micro
			// subject-key-identifier ST Micro
			// 1.3.6.1.4.1.41482.3.3 Yubico Firmware version, encoded as 3 bytes, like: 040300 for 4.3.0
			// 1.3.6.1.4.1.41482.3.7 Yubico serial number of the YubiKey, encoded as an integer
			// 1.3.6.1.4.1.41482.3.8 Yubico two bytes, the first encoding pin policy and the second touch policy
			// Pin policy: 01 - never, 02 - once per session, 03 - always
			// Touch policy: 01 - never, 02 - always, 03 - cached for 15s

		default:
			return ret;
	}
}

function decodeValue(valueBlock) {
	let blockType = Object.getPrototypeOf(valueBlock).constructor.name;
	// console.log("blockType", blockType);
	// console.log("valueBlock", valueBlock);
	switch (blockType) {
		case "LocalOctetStringValueBlock":
			return valueBlock.valueHex;
		case "LocalUtf8StringValueBlock":
			return valueBlock.value;
		case "LocalSimpleStringValueBlock":
			return valueBlock.value;
		case "OctetString":
			return valueBlock.valueBlock.valueHex;
		case "LocalBitStringValueBlock":
			return new Uint8Array(valueBlock.valueHex)[0];
		case "LocalBmpStringValueBlock":
			return valueBlock.value;
		case "LocalConstructedValueBlock":
			if (typeof valueBlock === "object" &&
                Array.isArray(valueBlock.value)) {
				return valueBlock.value.map((v) => decodeValue(v));
			}
			return valueBlock;
		case "BmpString":
			return decodeValue(valueBlock.valueBlock);
		case "Utf8String":
			return valueBlock.valueBlock.value;
		default:
			throw new TypeError("unknown value type when decoding certificate: " + blockType);
	}
}

function decodeU2FTransportType(u2fRawTransports) {
	if (!(u2fRawTransports instanceof ArrayBuffer) ||
                u2fRawTransports.byteLength !== 4) {
		throw new Error("u2fRawTransports was malformatted");
	}
	u2fRawTransports = new Uint8Array(u2fRawTransports);
	if (u2fRawTransports[0] !== 0x03 ||
                u2fRawTransports[1] !== 0x02 ||
                u2fRawTransports[2] > 7) {
		throw new Error("u2fRawTransports had unknown data");
	}
	let bitLen = u2fRawTransports[2];
	let bitCount = 8 - bitLen - 1;
	let type = (u2fRawTransports[3] >> bitLen);

	let ret = new Set();
	for (let i = bitCount; i >= 0; i--) {
		// https://fidoalliance.org/specs/fido-u2f-v1.2-ps-20170411/fido-u2f-authenticator-transports-extension-v1.2-ps-20170411.html
		if (type & 0x1) switch (i) {
			case 0:
				ret.add("bluetooth-classic");
				break;
			case 1:
				ret.add("bluetooth-low-energy");
				break;
			case 2:
				ret.add("usb");
				break;
			case 3:
				ret.add("nfc");
				break;
			case 4:
				ret.add("usb-internal");
				break;
			default:
				throw new Error("unknown U2F transport type: " + type);
		}
		type >>= 1;
	}
	return ret;
}

function decodeKeyUsage(value) {
	if (typeof value !== "number") {
		throw new Error("certificate: expected 'keyUsage' value to be number");
	}

	let retSet = new Set();

	if (value & 0x80) retSet.add("digitalSignature");
	if (value & 0x40) retSet.add("contentCommitment");
	if (value & 0x20) retSet.add("keyEncipherment");
	if (value & 0x10) retSet.add("dataEncipherment");
	if (value & 0x08) retSet.add("keyAgreement");
	if (value & 0x04) retSet.add("keyCertSign");
	if (value & 0x02) retSet.add("cRLSign");
	if (value & 0x01) retSet.add("encipherOnly");
	if (value & 0x01) retSet.add("decipherOnly");


	return retSet;
}

function decodeExtKeyUsage(value) {
	let keyPurposes = value.keyPurposes;
	if (typeof value !== "object" || !Array.isArray(keyPurposes)) {
		throw new Error("expected extended key purposes to be an Array");
	}

	keyPurposes = keyPurposes.map((oid) => resolveOid(oid).id);
	return keyPurposes;
}

function decodeFidoAaguid(value) {
	if (!(value instanceof ArrayBuffer)) {
		throw new Error("expected AAGUID to be ArrayBuffer");
	}

	if (value.byteLength !== 18) {
		throw new Error("AAGUID ASN.1 was wrong size. Should be 18, got " + value.byteLength);
	}

	let aaguidBuf = new Uint8Array(value);
	if (aaguidBuf[0] !== 0x04) {
		throw new Error("AAGUID ASN.1 should start with 0x04 (octet string)");
	}

	if (aaguidBuf[1] !== 0x10) {
		throw new Error("AAGUID ASN.1 should have length 16");
	}

	return aaguidBuf.buffer.slice(2);
}

function decodeCertificatePolicies(value) {
	if (value && Array.isArray(value.certificatePolicies)) {
		value = value.certificatePolicies.map(() => resolveOid(value.certificatePolicies[0].policyIdentifier, value.certificatePolicies[0].policyQualifiers));
	}

	return value;
}

function decodePolicyQualifiers(value) {
	if (value && Array.isArray(value)) {
		value = value.map((qual) => resolveOid(qual.policyQualifierId, qual.qualifier));
	}

	return value;
}

function decodeAltNames(value) {
	if (typeof value !== "object" || !Array.isArray(value.altNames)) {
		throw new Error("expected alternate names to be an Array");
	}
	let altNames = value.altNames;
	altNames = altNames.map((name) => {
		if (typeof name !== "object") {
			throw new Error("expected alternate name to be an object");
		}

		if (name.type !== 4) {
			throw new Error("expected all alternate names to be of general type");
		}

		if (typeof name.value !== "object" || !Array.isArray(name.value.typesAndValues)) {
			throw new Error("malformatted alternate name");
		}

		return decodeGeneralName(name.type, name.value.typesAndValues);
	});

	return altNames;
}

function decodeAuthorityInfoAccess(v) {
	if (typeof v !== "object" || !Array.isArray(v.accessDescriptions)) {
		throw new Error("expected authority info access descriptions to be Array");
	}

	let retMap = new Map();
	v.accessDescriptions.forEach((desc) => {
		let { id, value } = resolveOid(desc.accessMethod, desc.accessLocation);
		retMap.set(id, value);
	});
	return retMap;
}

function decodeGeneralName(type, v) {
	if (typeof type !== "number") {
		throw new Error("malformed general name in x509 certificate");
	}

	let nameList;
	switch (type) {
		case 0: // other name
			throw new Error("general name 'other name' not supported");
		case 1: // rfc822Name
			throw new Error("general name 'rfc822Name' not supported");
		case 2: // dNSName
			throw new Error("general name 'dNSName' not supported");
		case 3: // x400Address
			throw new Error("general name 'x400Address' not supported");
		case 4: // directoryName
			if (!Array.isArray(v)) {
				throw new Error("expected general name 'directory name' to be Array");
			}

			nameList = new Map();
			v.forEach((val) => {
				let { id, value } = resolveOid(val.type, decodeValue(val.value));
				nameList.set(id, value);
			});
			return { directoryName: nameList };
		case 5: // ediPartyName
			throw new Error("general name 'ediPartyName' not supported");
		case 6: // uniformResourceIdentifier
			return { uniformResourceIdentifier: v };
		case 7: // iPAddress
			throw new Error("general name 'iPAddress' not supported");
		case 8: // registeredID
			throw new Error("general name 'registeredID' not supported");
		default:
			throw new Error("unknown general name type: " + type);
	}
}

class CRL {
	constructor(crl) {
		if (isPem(crl)) {
			crl = pemToBase64(crl);
		}
		crl = coerceToArrayBuffer(crl, "crl");
		const asn1 = tools().fromBER(crl);
		this._crl = new PkijsCertificateRevocationList({ schema: asn1.result });
	}
}

const certMap = new Map();
class CertManager {
	static addCert(certBuf) {
		let cert = new Certificate(certBuf);
		let serial = cert.getSerial();
		certMap.set(serial, cert);

		return true;
	}

	static getCerts() {
		return new Map([...certMap]);
	}

	static getCertBySerial(serial) {
		return certMap.get(serial);
	}

	static removeAll() {
		certMap.clear();
	}

	static async verifyCertChain(certs, roots, crls) {
		if (!Array.isArray(certs) ||
            certs.length < 1) {
			throw new Error("expected 'certs' to be non-empty Array, got: " + certs);
		}

		certs = certs.map((cert) => {
			if (!(cert instanceof Certificate)) {
				// throw new Error("expected 'cert' to be an instance of Certificate");
				cert = new Certificate(cert);
			}

			return cert._cert;
		});

		if (!Array.isArray(roots) ||
            roots.length < 1) {
			throw new Error("expected 'roots' to be non-empty Array, got: " + roots);
		}

		roots = roots.map((r) => {
			if (!(r instanceof Certificate)) {
				// throw new Error("expected 'root' to be an instance of Certificate");
				r = new Certificate(r);
			}

			return r._cert;
		});

		crls = crls || [];
		if (!Array.isArray(crls)) {
			throw new Error("expected 'crls' to be undefined or Array, got: " + crls);
		}

		crls = crls.map((crl) => {
			if (!(crl instanceof CRL)) {
				// throw new Error("expected 'crl' to be an instance of Certificate");
				crl = new CRL(crl);
			}

			return crl._crl;
		});

		let chain = new CertificateChainValidationEngine({
			trustedCerts: roots,
			certs: certs,
			crls: crls,
		});

		return chain.verify().then((res) => {
			if (!res.result) return Promise.reject(new Error(res.resultMessage));
			return res;
		});
	}

}

const fidoMdsRootCert =
	"-----BEGIN CERTIFICATE-----\n" +
	"MIIDXzCCAkegAwIBAgILBAAAAAABIVhTCKIwDQYJKoZIhvcNAQELBQAwTDEgMB4G\n" +
	"A1UECxMXR2xvYmFsU2lnbiBSb290IENBIC0gUjMxEzARBgNVBAoTCkdsb2JhbFNp\n" +
	"Z24xEzARBgNVBAMTCkdsb2JhbFNpZ24wHhcNMDkwMzE4MTAwMDAwWhcNMjkwMzE4\n" +
	"MTAwMDAwWjBMMSAwHgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSMzETMBEG\n" +
	"A1UEChMKR2xvYmFsU2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjCCASIwDQYJKoZI\n" +
	"hvcNAQEBBQADggEPADCCAQoCggEBAMwldpB5BngiFvXAg7aEyiie/QV2EcWtiHL8\n" +
	"RgJDx7KKnQRfJMsuS+FggkbhUqsMgUdwbN1k0ev1LKMPgj0MK66X17YUhhB5uzsT\n" +
	"gHeMCOFJ0mpiLx9e+pZo34knlTifBtc+ycsmWQ1z3rDI6SYOgxXG71uL0gRgykmm\n" +
	"KPZpO/bLyCiR5Z2KYVc3rHQU3HTgOu5yLy6c+9C7v/U9AOEGM+iCK65TpjoWc4zd\n" +
	"QQ4gOsC0p6Hpsk+QLjJg6VfLuQSSaGjlOCZgdbKfd/+RFO+uIEn8rUAVSNECMWEZ\n" +
	"XriX7613t2Saer9fwRPvm2L7DWzgVGkWqQPabumDk3F2xmmFghcCAwEAAaNCMEAw\n" +
	"DgYDVR0PAQH/BAQDAgEGMA8GA1UdEwEB/wQFMAMBAf8wHQYDVR0OBBYEFI/wS3+o\n" +
	"LkUkrk1Q+mOai97i3Ru8MA0GCSqGSIb3DQEBCwUAA4IBAQBLQNvAUKr+yAzv95ZU\n" +
	"RUm7lgAJQayzE4aGKAczymvmdLm6AC2upArT9fHxD4q/c2dKg8dEe3jgr25sbwMp\n" +
	"jjM5RcOO5LlXbKr8EpbsU8Yt5CRsuZRj+9xTaGdWPoO4zzUhw8lo/s7awlOqzJCK\n" +
	"6fBdRoyV3XpYKBovHd7NADdBj+1EbddTKJd+82cEHhXXipa0095MJ6RMG3NzdvQX\n" +
	"mcIfeg7jLQitChws/zyrVQ4PkX4268NXSb7hLi18YIvDQVETI53O9zJrlAGomecs\n" +
	"Mx86OyXShkDOOyyGeMlhLxS67ttVb9+E7gUJTb0o2HLO02JQZR7rkpeDMdmztcpH\n" +
	"WD9f\n" +
	"-----END CERTIFICATE-----\n";

/**
 * Holds a single MDS entry that provides the metadata for an authenticator. Contains
 * both the TOC data (such as `statusReports` and `url`) as well as all the metadata
 * statment data. All the metadata has been converted from the integers found in the
 * [FIDORegistry](https://fidoalliance.org/specs/fido-v2.0-id-20180227/fido-registry-v2.0-id-20180227.html)
 * and [FIDO UAF Registry](https://fidoalliance.org/specs/fido-uaf-v1.2-rd-20171128/fido-uaf-reg-v1.2-rd-20171128.html)
 * have been converted to more friendly values. The following values are converted:
 * * attachmentHint - converted to Array of Strings
 * * attestationTypes - converted to Array of Strings
 * * authenticationAlgorithm - converted to String
 * * keyProtection - converted to Array of Strings
 * * matcherProtection - converted to Array of Strings
 * * publicKeyAlgAndEncoding - converted to String
 * * tcDisplay - converted to Array of Strings
 * * userVerificationDetails - converted to Array of Array of {@link UserVerificationDesc}
 *
 * See the [FIDO Metadata Specification]{@link https://fidoalliance.org/specs/fido-v2.0-id-20180227/fido-metadata-statement-v2.0-id-20180227.html}
 * for a description of each of the properties of this class.
 */
class MdsEntry {
	/**
     * Creates a new MDS entry. It is assumed that the entry has already been validated.
     * The typical way of creating new MdsEntry objects is via the {@link MdsCollection#addEntry} and {@link MdsCollection#validate}
     * methods, which will take care of parsing and validing the MDS entry for you.
     * @param  {Object} mdsEntry The parsed and validated metadata statement Object for this entry
     * @param  {Object} tocEntry The parsed and validated TOC information Object for this entry
     * @return {mdsEntry}          The properly formatted MDS entry
     */
	constructor(mdsEntry, tocEntry) {
		for (let key of Object.keys(tocEntry)) {
			this[key] = tocEntry[key];
		}

		for (let key of Object.keys(mdsEntry)) {
			this[key] = mdsEntry[key];
		}

		if (this.metadataStatement)
			delete this.metadataStatement;

		// make fields more useable:

		// attachmentHint
		this.attachmentHint = this.attachmentHint instanceof Array ? this.attachmentHint : attachmentHintToArr(this.attachmentHint);
		function attachmentHintToArr(hint) {
			let ret = [];
			if (hint & 0x0001) ret.push("internal");
			if (hint & 0x0002) ret.push("external");
			if (hint & 0x0004) ret.push("wired");
			if (hint & 0x0008) ret.push("wireless");
			if (hint & 0x0010) ret.push("nfc");
			if (hint & 0x0020) ret.push("bluetooth");
			if (hint & 0x0040) ret.push("network");
			if (hint & 0x0080) ret.push("ready");
			if (hint & 0xFF00) throw new Error("unknown attachment hint flags: " + hint & 0xFF00);
			return ret;
		}

		// attestationTypes
		if (!Array.isArray(this.attestationTypes)) throw new Error("expected attestationTypes to be Array, got: " + this.attestationTypes);
		this.attestationTypes = this.attestationTypes.map((att) => typeof(att) === "string" ? att : attestationTypeToStr(att));
		function attestationTypeToStr(att) {
			switch (att) {
				case 0x3E07: return "basic-full";
				case 0x3E08: return "basic-surrogate";
				case 0x3E09: return "ecdaa";
				default:
					throw new Error("uknown attestation type: " + att);
			}
		}

		// authenticationAlgorithm
		if (this.authenticationAlgorithms)
			this.authenticationAlgorithm = this.authenticationAlgorithms[0];

		this.authenticationAlgorithm = typeof(this.authenticationAlgorithm) === "string" ? this.authenticationAlgorithm : algToStr(this.authenticationAlgorithm);
		function algToStr(alg) {
			switch (alg) {
				case 0x0001: return "ALG_SIGN_SECP256R1_ECDSA_SHA256_RAW";
				case 0x0002: return "ALG_SIGN_SECP256R1_ECDSA_SHA256_DER";
				case 0x0003: return "ALG_SIGN_RSASSA_PSS_SHA256_RAW";
				case 0x0004: return "ALG_SIGN_RSASSA_PSS_SHA256_DER";
				case 0x0005: return "ALG_SIGN_SECP256K1_ECDSA_SHA256_RAW";
				case 0x0006: return "ALG_SIGN_SECP256K1_ECDSA_SHA256_DER";
				case 0x0007: return "ALG_SIGN_SM2_SM3_RAW";
				case 0x0008: return "ALG_SIGN_RSA_EMSA_PKCS1_SHA256_RAW";
				case 0x0009: return "ALG_SIGN_RSA_EMSA_PKCS1_SHA256_DER";
				default:
					throw new Error("unknown authentication algorithm: " + alg);
			}
		}

		//certificates
		if (this.attestationRootCertificates)
			for (const certificate of this.attestationRootCertificates)
				CertManager.addCert(certificate);

		// icon: TODO

		// keyProtection
		this.keyProtection = this.keyProtection instanceof Array ? this.keyProtection : keyProtToArr(this.keyProtection);
		function keyProtToArr(kp) {
			let ret = [];
			if (kp & 0x0001) ret.push("software");
			if (kp & 0x0002) ret.push("hardware");
			if (kp & 0x0004) ret.push("tee");
			if (kp & 0x0008) ret.push("secure-element");
			if (kp & 0x0010) ret.push("remote-handle");
			if (kp & 0xFFE0) throw new Error("unknown key protection flags: " + kp & 0xFFE0);
			return ret;
		}

		// matcherProtection
		this.matcherProtection = this.matcherProtection instanceof Array ? this.matcherProtection : matcherProtToArr(this.matcherProtection);
		function matcherProtToArr(mp) {
			let ret = [];
			if (mp & 0x0001) ret.push("software");
			if (mp & 0x0002) ret.push("hardware");
			if (mp & 0x0004) ret.push("tee");
			if (mp & 0xFFF8) throw new Error("unknown key protection flags: " + mp & 0xFFF8);
			return ret;
		}

		// publicKeyAlgAndEncoding
		if (this.publicKeyAlgAndEncodings)
			this.publicKeyAlgAndEncoding = `ALG_KEY_${this.publicKeyAlgAndEncodings[0].toUpperCase()}`;

		this.publicKeyAlgAndEncoding = typeof(this.publicKeyAlgAndEncoding) === "string" ? this.publicKeyAlgAndEncoding : pkAlgAndEncodingToStr(this.publicKeyAlgAndEncoding);
		function pkAlgAndEncodingToStr(pkalg) {
			switch (pkalg) {
				case 0x0100: return "ALG_KEY_ECC_X962_RAW";
				case 0x0101: return "ALG_KEY_ECC_X962_DER";
				case 0x0102: return "ALG_KEY_RSA_2048_RAW";
				case 0x0103: return "ALG_KEY_RSA_2048_DER";
				case 0x0104: return "ALG_KEY_COSE";
				default:
					throw new Error("unknown public key algorithm and encoding: " + pkalg);
			}
		}

		// tcDisplay
		this.tcDisplay = this.tcDisplay instanceof Array ? this.tcDisplay : tcDisplayToArr(this.tcDisplay);
		function tcDisplayToArr(tcd) {
			let ret = [];
			if (tcd & 0x0001) ret.push("any");
			if (tcd & 0x0002) ret.push("priviledged-software");
			if (tcd & 0x0004) ret.push("tee");
			if (tcd & 0x0008) ret.push("hardware");
			if (tcd & 0x0010) ret.push("remote");
			if (tcd & 0xFFE0) throw new Error("unknown transaction confirmation display flags: " + tcd & 0xFFE0);
			return ret;
		}

		// userVerificationDetails
		this.userVerificationDetails = uvDetailsToSet(this.userVerificationDetails);
		function uvDetailsToSet(uvList) {
			let ret = [];
			if (!Array.isArray(uvList)) throw new Error("expected userVerificationDetails to be an Array, got: " + uvList);
			uvList.forEach((uv) => {
				if (!Array.isArray(uv)) throw new Error("expected userVerification to be Array, got " + uv);
				let d = uv.map((desc) => {
					/**
                     * @typedef {Object} UserVerificationDesc
                     * @description A description of a user verification method that an authenticator will peform.
                     * The properties are as described below, plus the contents of `caDesc`, `baDesc` or `paDesc`
                     * (depending on whether "code", "biometrics", or "pattern" are being described)
                     * as described in the [FIDO Metadata specification]{@link https://fidoalliance.org/specs/fido-v2.0-id-20180227/fido-metadata-statement-v2.0-id-20180227.html}
                     * @property {String} type The type of user verification that the authenticator performs.
                     * Valid options are "code" (i.e. PIN), "biometric", or "pattern".
                     * @property {String} userVerification The specific type of user verification performed,
                     * such as "fingerprint", "presence", "passcode", etc.
					 * @property {String} userVerificationMethod The method of user verification performed,
					 * such as "passcode_internal", "presence_internal", etc.
                     */
					let newDesc = {};
					let descKey;

					if ("caDesc" in desc) {
						newDesc.type = "code";
						descKey = "caDesc";
					}

					if ("baDesc" in desc) {
						newDesc.type = "biometric";
						descKey = "baDesc";
					}

					if ("paDesc" in desc) {
						newDesc.type = "pattern";
						descKey = "paDesc";
					}

					newDesc.userVerification = uvToArr(desc.userVerification);

					if (desc.userVerificationMethod)
						newDesc.userVerification = (desc.userVerificationMethod.match(/(\w+)_internal/) || [ "none", "none" ])[1];

					if (descKey) for (let key of Object.keys(desc[descKey])) {
						newDesc[key] = desc[descKey][key];
					}

					return newDesc;
				});
				ret.push(d);
			});
			return ret;
		}

		function uvToArr(uv) {
			let ret = [];
			if (uv & 0x00000001) ret.push("presence");
			if (uv & 0x00000002) ret.push("fingerprint");
			if (uv & 0x00000004) ret.push("passcode");
			if (uv & 0x00000008) ret.push("voiceprint");
			if (uv & 0x00000010) ret.push("faceprint");
			if (uv & 0x00000020) ret.push("location");
			if (uv & 0x00000040) ret.push("eyeprint");
			if (uv & 0x00000080) ret.push("pattern");
			if (uv & 0x00000100) ret.push("handprint");
			if (uv & 0x00000200) ret.push("none");
			if (uv & 0x00000400) ret.push("all");
			return ret;
		}
		// userVerificationDetails
		if (this.protocolFamily === undefined) this.protocolFamily = "uaf";

		// fix boolean values, since NNL doesn't validate them very well
		realBoolean(this, "isSecondFactorOnly");
		realBoolean(this, "isKeyRestricted");
		realBoolean(this, "isFreshUserVerificationRequired");
		// TODO: read spec for other values
	}
}

/**
 * A class for managing, validating, and finding metadata that describes authenticators
 *
 * This class does not do any of the downloading of the TOC or any of the entries in the TOC,
 * but assumes that you can download the data and pass it to this class. This allows for cleverness
 * and flexibility in how, when, and what is downloaded -- while at the same time allowing this class
 * to take care of the not-so-fun parts of validating signatures, hashes, certificat chains, and certificate
 * revocation lists.
 *
 * Typically this will be created through {@link Fido2Lib#createMdsCollection} and then set as the global
 * MDS collection via {@link Fido2Lib#setMdsCollection}
 *
 * @example
 * var mc = Fido2Lib.createMdsCollection()
 * // download TOC from https://mds.fidoalliance.org ...
 * var tocObj = await mc.addToc(tocBase64);
 * tocObj.entries.forEach((entry) => {
 *     // download entry.url ...
 *     mc.addEntry(entryBase64);
 * });
 * Fido2Lib.setMdsCollection(mc); // performs validation
 * var entry = Fido2Lib.findEntry("4e4e#4005");
 */
class MdsCollection {
	/**
     * Creates a new MdsCollection
     * @return {MdsCollection} The MDS collection that was created. The freshly created MDS collection has
     * no Table of Contents (TOC) or entries, which must be added through {@link addToc} and {@link addEntry}, respectively.
     */
	constructor(collectionName) {
		if (typeof collectionName !== "string" ||
            collectionName.length < 1) {
			throw new Error("expected 'collectionName' to be non-empty string, got: " + collectionName);
		}

		this.toc = null;
		this.unvalidatedEntryList = new Map();
		this.entryList = new Map();
		this.validated = false;
		this.name = collectionName;
	}

	/**
     * Validates and stores the Table of Contents (TOC) for future reference. This method validates
     * the TOC JSON Web Token (JWT) signature, as well as the certificate chain. The certiciate chain
     * is validated using the `rootCert` and `crls` that are provided.
     * @param {String} tocStr   The base64url encoded Table of Contents, as described in the [FIDO Metadata Service specification]{@link https://fidoalliance.org/specs/fido-v2.0-id-20180227/fido-metadata-service-v2.0-id-20180227.html}
     * @param {Array.<String>|Array.<ArrayBuffer>|String|ArrayBuffer|undefined} rootCert One or more root certificates that serve as a trust anchor for the Metadata Service.
     * Certificate format is flexible, and can be a PEM string, a base64 encoded string, or an ArrayBuffer, provieded that each of those formats can be decoded to valid ASN.1
     * If the `rootCert` is `undefined`, then the default [FIDO MDS root certificate](https://mds.fidoalliance.org/Root.cer) will be used.
     * @param {Array.<String>|Array.<ArrayBuffer>} crls     An array of Certificate Revocation Lists (CRLs) that should be used when validating
     * the certificate chain. Like `rootCert` the format of the CRLs is flexible and can be PEM encoded, base64 encoded, or an ArrayBuffer
     * provied that the CRL contains valid ASN.1 encoding.
     * @returns {Promise.<Object>} Returns a Promise that resolves to a TOC object, or that rejects with an error.
     */
	async addToc(tocStr, rootCert, crls) {
		if (typeof tocStr !== "string" ||
            tocStr.length < 1) {
			throw new Error("expected MDS TOC to be non-empty string");
		}

		// https://fidoalliance.org/specs/fido-v2.0-id-20180227/fido-metadata-service-v2.0-id-20180227.html#metadata-toc-object-processing-rules
		// The FIDO Server MUST follow these processing rules:
		//    The FIDO Server MUST be able to download the latest metadata TOC object from the well-known URL, when appropriate. The nextUpdate field of the Metadata TOC specifies a date when the download SHOULD occur at latest.
		//    If the x5u attribute is present in the JWT Header, then:
		//        The FIDO Server MUST verify that the URL specified by the x5u attribute has the same web-origin as the URL used to download the metadata TOC from. The FIDO Server SHOULD ignore the file if the web-origin differs (in order to prevent loading objects from arbitrary sites).
		//        The FIDO Server MUST download the certificate (chain) from the URL specified by the x5u attribute [JWS]. The certificate chain MUST be verified to properly chain to the metadata TOC signing trust anchor according to [RFC5280]. All certificates in the chain MUST be checked for revocation according to [RFC5280].
		//        The FIDO Server SHOULD ignore the file if the chain cannot be verified or if one of the chain certificates is revoked.
		//    If the x5u attribute is missing, the chain should be retrieved from the x5c attribute. If that attribute is missing as well, Metadata TOC signing trust anchor is considered the TOC signing certificate chain.
		//    Verify the signature of the Metadata TOC object using the TOC signing certificate chain (as determined by the steps above). The FIDO Server SHOULD ignore the file if the signature is invalid. It SHOULD also ignore the file if its number (no) is less or equal to the number of the last Metadata TOC object cached locally.
		//    Write the verified object to a local cache as required.

		// JWT verify
		let parsedJws;
		try {
			parsedJws = await tools().jwsCreateVerify().verify(tocStr, { allowEmbeddedKey: true });
			this.toc = JSON.parse(abToStr(coerceToArrayBuffer(parsedJws.payload, "MDS TOC payload")));
		} catch (e) {
			e.message = "could not parse and validate MDS TOC: " + e.message;
			throw e;
		}

		// add rootCert
		if (rootCert === undefined) {
			if (parsedJws.kid === "Metadata TOC Signer 3" || parsedJws.key && parsedJws.key.kid === "Metadata TOC Signer 3") {
				rootCert = "-----BEGIN CERTIFICATE-----\n" +
				"MIICQzCCAcigAwIBAgIORqmxkzowRM99NQZJurcwCgYIKoZIzj0EAwMwUzELMAkG\n" +
				"A1UEBhMCVVMxFjAUBgNVBAoTDUZJRE8gQWxsaWFuY2UxHTAbBgNVBAsTFE1ldGFk\n" +
				"YXRhIFRPQyBTaWduaW5nMQ0wCwYDVQQDEwRSb290MB4XDTE1MDYxNzAwMDAwMFoX\n" +
				"DTQ1MDYxNzAwMDAwMFowUzELMAkGA1UEBhMCVVMxFjAUBgNVBAoTDUZJRE8gQWxs\n" +
				"aWFuY2UxHTAbBgNVBAsTFE1ldGFkYXRhIFRPQyBTaWduaW5nMQ0wCwYDVQQDEwRS\n" +
				"b290MHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEFEoo+6jdxg6oUuOloqPjK/nVGyY+\n" +
				"AXCFz1i5JR4OPeFJs+my143ai0p34EX4R1Xxm9xGi9n8F+RxLjLNPHtlkB3X4ims\n" +
				"rfIx7QcEImx1cMTgu5zUiwxLX1ookVhIRSoso2MwYTAOBgNVHQ8BAf8EBAMCAQYw\n" +
				"DwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQU0qUfC6f2YshA1Ni9udeO0VS7vEYw\n" +
				"HwYDVR0jBBgwFoAU0qUfC6f2YshA1Ni9udeO0VS7vEYwCgYIKoZIzj0EAwMDaQAw\n" +
				"ZgIxAKulGbSFkDSZusGjbNkAhAkqTkLWo3GrN5nRBNNk2Q4BlG+AvM5q9wa5WciW\n" +
				"DcMdeQIxAMOEzOFsxX9Bo0h4LOFE5y5H8bdPFYW+l5gy1tQiJv+5NUyM2IBB55XU\n" +
				"YjdBz56jSA==\n" +
				"-----END CERTIFICATE-----\n";
			} else {
				rootCert = fidoMdsRootCert;
			}
		}

		// verify cert chain
		let rootCerts;
		if (Array.isArray(rootCert)) rootCerts = rootCert;
		else rootCerts = [rootCert];
		await CertManager.verifyCertChain(parsedJws.header.x5c, rootCerts, crls);

		// save the raw TOC
		this.toc.raw = tocStr;
		
		// check for MDS v2
		if (this.toc.entries.some(entry => !entry.metadataStatement)) console.warn("[DEPRECATION WARNING] FIDO MDS v2 will be removed in October 2022. Please update to MDS v3!");

		return this.toc;
	}

	/**
     * Returns the parsed and validated Table of Contents object from {@link getToc}
     * @return {Object|null} Returns the TOC if one has been provided to {@link getToc}
     * or `null` if no TOC has been provided yet.
     */
	getToc() {
		return this.toc;
	}

	/**
     * Parses and adds a new MDS entry to the collection. The entry will not be available
     * through {@link findEntry} until {@link validate} has been called
     * @param {String} entryStr The base64url encoded entry, most likely downloaded from
     * the URL that was found in the Table of Contents (TOC)
     */
	addEntry(entryStr) {
		if (typeof entryStr !== "string" ||
            entryStr.length < 1) {
			throw new Error("expected MDS entry to be non-empty string");
		}

		let newEntry = b64ToJsObject(entryStr, "MDS entry");
		if (newEntry.metadataStatement) {
			newEntry = newEntry.metadataStatement;
			//Get the base64 string with all non-ASCII characters removed
			entryStr = jsObjectToB64(newEntry);
		}

		newEntry.raw = entryStr;
		let newEntryId = getMdsEntryId(newEntry);

		if (Array.isArray(newEntryId)) {
			// U2F array of IDs
			newEntryId.forEach((id) => {
				this.unvalidatedEntryList.set(id, newEntry);
			});
		} else {
			// UAF and FIDO2
			this.unvalidatedEntryList.set(newEntryId, newEntry);
		}
	}

	/**
     * Validates all entries that have been added. Note that {@link MdsCollection#findEntry}
     * will not find an {@link MdsEntry} until it has been validated.
     * @throws {Error} If a validation error occurs
     * @returns {Promise} Returns a Promise
     */
	async validate() {
		// throw if no TOC
		if (typeof this.toc !== "object" || this.toc === null) {
			throw new Error("add MDS TOC before attempting to validate MDS collection");
		}

		// throw if no new entries
		if (this.unvalidatedEntryList.size < 1) {
			throw new Error("add MDS entries before attempting to validate MDS collection");
		}

		// https://fidoalliance.org/specs/fido-v2.0-id-20180227/fido-metadata-service-v2.0-id-20180227.html#metadata-toc-object-processing-rules
		//    Iterate through the individual entries (of type MetadataTOCPayloadEntry). For each entry:
		//        Ignore the entry if the AAID, AAGUID or attestationCertificateKeyIdentifiers is not relevant to the relying party (e.g. not acceptable by any policy)
		//        Download the metadata statement from the URL specified by the field url. Some authenticator vendors might require authentication in order to provide access to the data. Conforming FIDO Servers SHOULD support the HTTP Basic, and HTTP Digest authentication schemes, as defined in [RFC2617].
		//        Check whether the status report of the authenticator model has changed compared to the cached entry by looking at the fields timeOfLastStatusChange and statusReport. Update the status of the cached entry. It is up to the relying party to specify behavior for authenticators with status reports that indicate a lack of certification, or known security issues. However, the status REVOKED indicates significant security issues related to such authenticators.
		//        Note
		//        Authenticators with an unacceptable status should be marked accordingly. This information is required for building registration and authentication policies included in the registration request and the authentication request [UAFProtocol].
		//        Compute the hash value of the (base64url encoding without padding of the UTF-8 encoded) metadata statement downloaded from the URL and verify the hash value to the hash specified in the field hash of the metadata TOC object. Ignore the downloaded metadata statement if the hash value doesn't match.
		//        Update the cached metadata statement according to the dowloaded one.

		let mapEntry;
		for(mapEntry of this.unvalidatedEntryList) {
			let entry = mapEntry[1];
			// find matching TOC entry
			let entryId = getMdsEntryId(entry);
			let tocEntry = this.toc.entries.filter((te) => {
				let teId = getMdsEntryId(te);
				let eq = idEquals(teId, entryId);
				return eq;
			});

			if (tocEntry.length !== 1) {
				throw new Error(`found the wrong number of TOC entries for '${entryId}': ${tocEntry.length}`);
			}
			tocEntry = tocEntry[0];

			// validate hash
			const entryHash = await tools().hashDigest(entry.raw);
			let tocEntryHash;

			if (tocEntry.hash) {
				tocEntryHash = tocEntry.hash;
			} else {
				tocEntryHash = await tools().hashDigest(jsObjectToB64(tocEntry.metadataStatement));
			}

			tocEntryHash = coerceToArrayBuffer(tocEntryHash, "MDS TOC entry hash");

			if (!(abEqual(entryHash.buffer, tocEntryHash))) {
				throw new Error("MDS entry hash did not match corresponding hash in MDS TOC");
			}

			// validate status report
			// TODO: maybe setValidateEntryCallback(fn);

			// add new entry to collection entryList
			const newEntry = new MdsEntry(entry, tocEntry);
			newEntry.collection = this;

			if (Array.isArray(entryId)) {
				// U2F array of IDs
				entryId.forEach((id) => {
					this.entryList.set(tocEntry.metadataStatement ? id.replace(/-/g, "") : id, newEntry);
				});
			} else {
				// UAF and FIDO2
				this.entryList.set(tocEntry.metadataStatement ? entryId.replace(/-/g, "") : entryId, newEntry);
			}
		}
	}

	/**
     * Looks up an entry by AAID, AAGUID, or attestationCertificateKeyIdentifiers.
     * Only entries that have been validated will be found.
     * @param  {String|ArrayBuffer} id The AAID, AAGUID, or attestationCertificateKeyIdentifiers of the entry to find
     * @return {MdsEntry|null}    The MDS entry that was found, or null if no entry was found.
     */
	findEntry(id) {
		if (id instanceof ArrayBuffer) {
			id = coerceToBase64Url(id, "MDS entry id");
		}

		if (typeof id !== "string") {
			throw new Error("expected 'id' to be String, got: " + id);
		}

		return this.entryList.get(id.replace(/-/g, "")) || this.entryList.get(abToHex(base64.toArrayBuffer(id, true)).replace(/-/g, "")) || null;
	}
}

function getMdsEntryId(obj) {
	if (typeof obj !== "object") {
		throw new Error("getMdsEntryId expected 'obj' to be object, got: " + obj);
	}

	if (typeof obj.aaid === "string") {
		return obj.aaid;
	}

	if (typeof obj.aaguid === "string") {
		return obj.aaguid;
	}

	if (Array.isArray(obj.attestationCertificateKeyIdentifiers)) {
		return obj.attestationCertificateKeyIdentifiers;
	}

	throw new Error("MDS entry didn't have a valid ID");
}

function idEquals(id1, id2) {
	if (id1 instanceof ArrayBuffer) {
		id1 = coerceToBase64Url(id1);
	}

	if (id2 instanceof ArrayBuffer) {
		id2 = coerceToBase64Url(id2);
	}

	// UAF, FIDO2
	if (typeof id1 === "string" && typeof id2 === "string") {
		return id1 === id2;
	}

	// U2F
	if (Array.isArray(id1) && Array.isArray(id2)) {
		if (id1.length !== id2.length) return false;
		let allSame = id1.reduce((acc, val) => acc && id2.includes(val), true);
		if (!allSame) return false;
		return true;
	}

	// no match
	return false;
}

function realBoolean(obj, prop) {
	if (obj[prop] === "true") obj[prop] = true;
	if (obj[prop] === "false") obj[prop] = false;
}

/* eslint-disable no-invalid-this */
// validators are a mixin, so it's okay that we're using 'this' all over the place

function noneParseFn(attStmt) {
	if (Object.keys(attStmt).length !== 0) {
		throw new Error("'none' attestation format: attStmt had fields");
	}

	return new Map();
}

async function noneValidateFn() {
	this.audit.journal.add("fmt");

	return true;
}

const noneAttestation = {
	name: "none",
	parseFn: noneParseFn,
	validateFn: noneValidateFn,
};

const u2fRootCerts = [
	// Yubico Root Cert
	// https://developers.yubico.com/U2F/yubico-u2f-ca-certs.txt
	"MIIDHjCCAgagAwIBAgIEG0BT9zANBgkqhkiG9w0BAQsFADAuMSwwKgYDVQQDEyNZ\n" +
    "dWJpY28gVTJGIFJvb3QgQ0EgU2VyaWFsIDQ1NzIwMDYzMTAgFw0xNDA4MDEwMDAw\n" +
    "MDBaGA8yMDUwMDkwNDAwMDAwMFowLjEsMCoGA1UEAxMjWXViaWNvIFUyRiBSb290\n" +
    "IENBIFNlcmlhbCA0NTcyMDA2MzEwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK\n" +
    "AoIBAQC/jwYuhBVlqaiYWEMsrWFisgJ+PtM91eSrpI4TK7U53mwCIawSDHy8vUmk\n" +
    "5N2KAj9abvT9NP5SMS1hQi3usxoYGonXQgfO6ZXyUA9a+KAkqdFnBnlyugSeCOep\n" +
    "8EdZFfsaRFtMjkwz5Gcz2Py4vIYvCdMHPtwaz0bVuzneueIEz6TnQjE63Rdt2zbw\n" +
    "nebwTG5ZybeWSwbzy+BJ34ZHcUhPAY89yJQXuE0IzMZFcEBbPNRbWECRKgjq//qT\n" +
    "9nmDOFVlSRCt2wiqPSzluwn+v+suQEBsUjTGMEd25tKXXTkNW21wIWbxeSyUoTXw\n" +
    "LvGS6xlwQSgNpk2qXYwf8iXg7VWZAgMBAAGjQjBAMB0GA1UdDgQWBBQgIvz0bNGJ\n" +
    "hjgpToksyKpP9xv9oDAPBgNVHRMECDAGAQH/AgEAMA4GA1UdDwEB/wQEAwIBBjAN\n" +
    "BgkqhkiG9w0BAQsFAAOCAQEAjvjuOMDSa+JXFCLyBKsycXtBVZsJ4Ue3LbaEsPY4\n" +
    "MYN/hIQ5ZM5p7EjfcnMG4CtYkNsfNHc0AhBLdq45rnT87q/6O3vUEtNMafbhU6kt\n" +
    "hX7Y+9XFN9NpmYxr+ekVY5xOxi8h9JDIgoMP4VB1uS0aunL1IGqrNooL9mmFnL2k\n" +
    "LVVee6/VR6C5+KSTCMCWppMuJIZII2v9o4dkoZ8Y7QRjQlLfYzd3qGtKbw7xaF1U\n" +
    "sG/5xUb/Btwb2X2g4InpiB/yt/3CpQXpiWX/K4mBvUKiGn05ZsqeY1gx4g0xLBqc\n" +
    "U9psmyPzK+Vsgw2jeRQ5JlKDyqE0hebfC1tvFu0CCrJFcw==",
];

const algMap = new Map([
	[-7, {
		algName: "ECDSA_w_SHA256",
		hashAlg: "SHA256",
	}],
	// [-8, {
	//     name: "EdDSA",
	//     hash: undefined
	// }],
	[-35, {
		algName: "ECDSA_w_SHA384",
		hashAlg: "SHA384",
	}],
	[-36, {
		algName: "ECDSA_w_SHA512",
		hashAlg: "SHA512",
	}],
]);

function packedParseFn(attStmt) {

	let ret = new Map();

	// alg
	let algEntry = algMap.get(attStmt.alg);
	if (algEntry === undefined) {
		throw new Error("packed attestation: unknown algorithm: " + attStmt.alg);
	}
	ret.set("alg", algEntry);

	// x5c
	let x5c = attStmt.x5c;
	let newX5c = [];
	if (Array.isArray(x5c)) {
		for (let cert of x5c) {
			cert = coerceToArrayBuffer(cert, "packed x5c cert");
			newX5c.push(cert);
		}
		ret.set("attCert", newX5c.shift());
		ret.set("x5c", newX5c);
	} else {
		ret.set("x5c", x5c);
	}

	// ecdaaKeyId
	let ecdaaKeyId = attStmt.ecdaaKeyId;
	if (ecdaaKeyId !== undefined) {
		ecdaaKeyId = coerceToArrayBuffer(ecdaaKeyId, "ecdaaKeyId");
		ret.set("ecdaaKeyId", ecdaaKeyId);
	}

	// sig
	let sig = attStmt.sig;
	sig = coerceToArrayBuffer(sig, "packed signature");
	ret.set("sig", sig);

	return ret;
}

async function packedValidateFn() {
	let x5c = this.authnrData.get("x5c");
	let ecdaaKeyId = this.authnrData.get("ecdaaKeyId");

	if (x5c !== undefined && ecdaaKeyId !== undefined) {
		throw new Error("packed attestation: should be 'basic' or 'ecdaa', got both");
	}

	if (x5c) return packedValidateBasic.call(this);
	if (ecdaaKeyId) return packedValidateEcdaa.call(this);
	return packedValidateSurrogate.call(this);
}

async function packedValidateBasic() {
	// see what algorithm we're working with
	let {
		algName,
		hashAlg,
	} = this.authnrData.get("alg");

	if (algName === undefined) {
		throw new Error("packed attestation: unknown algorithm " + algName);
	}

	// from: https://w3c.github.io/webauthn/#packed-attestation
	// Verify that sig is a valid signature over the concatenation of authenticatorData and clientDataHash using the attestation public key in x5c with the algorithm specified in alg.
	let res = validateSignature(
		this.clientData.get("rawClientDataJson"),
		this.authnrData.get("rawAuthnrData"),
		this.authnrData.get("sig"),
		hashAlg,
		this.authnrData.get("attCert")
	);
	if (!res) {
		throw new Error("packed attestation signature verification failed");
	}
	this.audit.journal.add("sig");
	this.audit.journal.add("alg");

	// Verify that x5c meets the requirements in §8.2.1 Packed attestation statement certificate requirements.
	await validateCerts(
		this.authnrData.get("attCert"),
		this.authnrData.get("aaguid"),
		this.authnrData.get("x5c"),
		this.audit
	);

	// If successful, return attestation type Basic and attestation trust path x5c.
	this.audit.info.set("attestation-type", "basic");

	this.audit.journal.add("fmt");

	return true;
}

function validateSignature(rawClientData, authenticatorData, sig, hashAlg, parsedAttCert) {
	// create clientDataHash
	const hash = tools().hashDigest(rawClientData);
	let clientDataHash = new Uint8Array(hash).buffer;

	// convert cert to PEM
	let attCertPem = abToPem("CERTIFICATE", parsedAttCert);

	// verify signature
	const verify = tools().verifySignature(hashAlg, attCertPem, sig, appendBuffer(authenticatorData, clientDataHash));
	return verify;
}

async function validateCerts(parsedAttCert, aaguid, x5c, audit) {
	// make sure our root certs are loaded
	if (CertManager.getCerts().size === 0) {
		u2fRootCerts.forEach((cert) => CertManager.addCert(cert));
	}

	// decode attestation cert
	let attCert = new Certificate(coerceToBase64(parsedAttCert, "parsedAttCert"));
	try {
		await attCert.verify();
	} catch (e) {
		let err = e;
		if (err.message === "Please provide issuer certificate as a parameter") {
			// err = new Error("Root attestation certificate for this token could not be found. Please contact your security key vendor.");
			audit.warning.set("attesation-not-validated", "could not validate attestation because the root attestation certification could not be found");
		} else {
			throw err;
		}
	}
	// TODO: validate chain?
	audit.journal.add("x5c");

	// cert MUST be x.509v3
	if (attCert.getVersion() !== 3) {
		throw new Error("expected packed attestation certificate to be x.509v3");
	}

	// save certificate warnings, info, and extensions in our audit information
	let exts = attCert.getExtensions();
	exts.forEach((v, k) => audit.info.set(k, v));
	attCert.info.forEach((v, k) => audit.info.set(k, v));
	attCert.warning.forEach((v, k) => audit.warning.set(k, v));
	audit.journal.add("attCert");
	// console.log("_cert", attCert._cert);
	// console.log("_cert.subject", attCert._cert.subject);

	// from: https://w3c.github.io/webauthn/#packed-attestation
	// Version MUST be set to 3 (which is indicated by an ASN.1 INTEGER with value 2).
	if (attCert.getVersion() !== 3) {
		throw new Error("expected packed attestation certificate to be x.509v3");
	}

	// Subject field MUST be set to:
	// Subject-C ISO 3166 code specifying the country where the Authenticator vendor is incorporated (PrintableString)
	// Subject-O Legal name of the Authenticator vendor (UTF8String)
	// Subject-OU Literal string “Authenticator Attestation” (UTF8String)
	// Subject-CN A UTF8String of the vendor’s choosing
	let subject = attCert.getSubject();
	if (typeof subject.get("country-name") !== "string") {
		throw new Error("packed attestation: attestation certificate missing 'country name'");
	}

	if (typeof subject.get("organization-name") !== "string") {
		throw new Error("packed attestation: attestation certificate missing 'organization name'");
	}

	if (subject.get("organizational-unit-name") !== "Authenticator Attestation") {
		throw new Error("packed attestation: attestation certificate 'organizational unit name' must be 'Authenticator Attestation'");
	}

	if (typeof subject.get("common-name") !== "string") {
		throw new Error("packed attestation: attestation certificate missing 'common name'");
	}

	// If the related attestation root certificate is used for multiple authenticator models, the Extension OID 1.3.6.1.4.1.45724.1.1.4 (id-fido-gen-ce-aaguid) MUST be present, containing the AAGUID as a 16-byte OCTET STRING. The extension MUST NOT be marked as critical.
	// XXX: no way to tell if AAGUID is required on the server side...

	// The Basic Constraints extension MUST have the CA component set to false.
	let basicConstraints = exts.get("basic-constraints");
	if (basicConstraints.cA !== false) {
		throw new Error("packed attestation: basic constraints 'cA' must be 'false'");
	}

	// An Authority Information Access (AIA) extension with entry id-ad-ocsp and a CRL Distribution Point extension [RFC5280] are both OPTIONAL as the status of many attestation certificates is available through authenticator metadata services
	// TODO: no example of this is available to test against

	// If x5c contains an extension with OID 1.3.6.1.4.1.45724.1.1.4 (id-fido-gen-ce-aaguid) verify that the value of this extension matches the aaguid in authenticatorData.
	let certAaguid = exts.get("fido-aaguid");
	if (certAaguid !== undefined && !abEqual(aaguid, certAaguid)) {
		throw new Error("packed attestation: authnrData AAGUID did not match AAGUID in attestation certificate");
	}
}

async function validateSelfSignature(rawClientData, authenticatorData, sig, hashAlg, publicKeyPem) {
	// create clientDataHash
	const clientDataHash = await tools().hashDigest(rawClientData);

	// verify signature
	const verify = tools().verifySignature(publicKeyPem,sig,appendBuffer(authenticatorData,clientDataHash));
	return verify;
}

function packedValidateSurrogate() {
	// see what algorithm we're working with
	let {
		algName,
		hashAlg,
	} = this.authnrData.get("alg");

	if (algName === undefined) {
		throw new Error("packed attestation: unknown algorithm " + algName);
	}

	// from: https://w3c.github.io/webauthn/#packed-attestation
	// Verify that sig is a valid signature over the concatenation of authenticatorData and clientDataHash using the credential public key with alg.

	let res = validateSelfSignature(
		this.clientData.get("rawClientDataJson"),
		this.authnrData.get("rawAuthnrData"),
		this.authnrData.get("sig"),
		hashAlg,
		this.authnrData.get("credentialPublicKeyPem")
	);
	if (!res) {
		throw new Error("packed attestation signature verification failed");
	}
	this.audit.journal.add("sig");
	this.audit.journal.add("alg");
	this.audit.journal.add("x5c");

	// If successful, return attestation type Self and an empty trust path
	this.audit.info.set("attestation-type", "self");

	this.audit.journal.add("fmt");

	return true;
}

function packedValidateEcdaa() {
	throw new Error("packed attestation: ECDAA not implemented, please open a GitHub issue.");
}

const packedAttestation = {
	name: "packed",
	parseFn: packedParseFn,
	validateFn: packedValidateFn,
};

function fidoU2fParseFn(attStmt) {
	let ret = new Map();
	let x5c = attStmt.x5c;
	let sig = attStmt.sig;

	if (!Array.isArray(x5c)) {
		throw new TypeError("expected U2F attestation x5c field to be of type Array");
	}

	if (x5c.length < 1) {
		throw new TypeError("no certificates in U2F x5c field");
	}

	let newX5c = [];
	for (let cert of x5c) {
		cert = coerceToArrayBuffer(cert, "U2F x5c cert");
		newX5c.push(cert);
	}
	// first certificate MUST be the attestation cert
	ret.set("attCert", newX5c.shift());
	// the rest of the certificates (if any) are the certificate chain
	ret.set("x5c", newX5c);

	sig = coerceToArrayBuffer(sig, "U2F signature");
	ret.set("sig", sig);

	return ret;
}

async function fidoU2fValidateFn() {
	let x5c = this.authnrData.get("x5c");
	let parsedAttCert = this.authnrData.get("attCert");

	// validate cert chain
	if (x5c.length > 0) {
		throw new Error("cert chain not validated");
	}
	this.audit.journal.add("x5c");

	// make sure our root certs are loaded
	if (CertManager.getCerts().size === 0) {
		u2fRootCerts.forEach((cert) => CertManager.addCert(cert));
	}

	// decode attestation cert
	let attCert = new Certificate(coerceToBase64(parsedAttCert, "parsedAttCert"));
	try {
		await attCert.verify();
	} catch (e) {
		let err = e;
		if (err.message === "Please provide issuer certificate as a parameter") {
			// err = new Error("Root attestation certificate for this token could not be found. Please contact your security key vendor.");
			this.audit.warning.set("attesation-not-validated", "could not validate attestation because the root attestation certification could not be found");
		} else {
			throw err;
		}
	}

	// https: //fidoalliance.org/specs/fido-u2f-v1.2-ps-20170411/fido-u2f-authenticator-transports-extension-v1.2-ps-20170411.html
	// cert MUST be x.509v3
	if (attCert.getVersion() !== 3) {
		throw new Error("expected U2F attestation certificate to be x.509v3");
	}

	// save certificate warnings, info, and extensions in our audit information
	attCert.getExtensions().forEach((v, k) => this.audit.info.set(k, v));
	attCert.info.forEach((v, k) => this.audit.info.set(k, v));
	attCert.warning.forEach((v, k) => this.audit.warning.set(k, v));
	this.audit.journal.add("attCert");

	// https://w3c.github.io/webauthn/#fido-u2f-attestation
	// certificate public key is not an Elliptic Curve (EC) public key over the P-256 curve, terminate this algorithm and return an appropriate error
	let jwk = this.authnrData.get("credentialPublicKeyJwk");
	if (jwk.kty !== "EC" ||
        jwk.crv !== "P-256") {
		throw new Error("bad U2F key type");
	}

	// rpIdHash from authenticatorData, and the claimed credentialId and credentialPublicKey from authenticatorData.attestedCredentialData
	let rpIdHash = this.authnrData.get("rpIdHash");
	let credId = this.authnrData.get("credId");

	// create clientDataHash
	let rawClientData = this.clientData.get("rawClientDataJson");
	const clientDataHash = abToBuf(tools().hashDigest(abToBuf(rawClientData)));

	// Convert the COSE_KEY formatted credentialPublicKey (see Section 7 of [RFC8152]) to CTAP1/U2F public Key format [FIDO-CTAP]
	//      Let publicKeyU2F represent the result of the conversion operation and set its first byte to 0x04. Note: This signifies uncompressed ECC key format.
	//      Extract the value corresponding to the "-2" key (representing x coordinate) from credentialPublicKey, confirm its size to be of 32 bytes and concatenate it with publicKeyU2F. If size differs or "-2" key is not found, terminate this algorithm and return an appropriate error.
	let x = coerceToArrayBuffer(jwk.x, "U2F public key x component");
	if (x.byteLength !== 32) {
		throw new Error("U2F public key x component was wrong size");
	}

	//      Extract the value corresponding to the "-3" key (representing y coordinate) from credentialPublicKey, confirm its size to be of 32 bytes and concatenate it with publicKeyU2F. If size differs or "-3" key is not found, terminate this algorithm and return an appropriate error.
	let y = coerceToArrayBuffer(jwk.y, "U2F public key y component");
	if (y.byteLength !== 32) {
		throw new Error("U2F public key y component was wrong size");
	}

	// Let verificationData be the concatenation of (0x00 || rpIdHash || clientDataHash || credentialId || publicKeyU2F) (see Section 4.3 of [FIDO-U2F-Message-Formats]).
	let verificationData = new Uint8Array([
		0x00,
		...new Uint8Array(rpIdHash),
		...new Uint8Array(clientDataHash),
		...new Uint8Array(credId),
		0x04,
		...new Uint8Array(x),
		...new Uint8Array(y),
	]);

	// Verify the sig using verificationData and certificate public key per [SEC1].
	let sig = this.authnrData.get("sig");
	let attCertPem = abToPem("CERTIFICATE", parsedAttCert);

	// ToDo: This need to be tested
	let res = await tools().verifySignature(attCertPem, abToBuf(sig), abToBuf(verificationData));
	if (!res) {
		throw new Error("U2F attestation signature verification failed");
	}
	this.audit.journal.add("sig");

	// If successful, return attestation type Basic with the attestation trust path set to x5c.
	this.audit.info.set("attestation-type", "basic");

	this.audit.journal.add("fmt");
	return true;
}

const fidoU2fAttestation = {
	name: "fido-u2f",
	parseFn: fidoU2fParseFn,
	validateFn: fidoU2fValidateFn,
};

function androidSafetyNetParseFn(attStmt) {
	let ret = new Map();

	// console.log("android-safetynet", attStmt);

	ret.set("ver", attStmt.ver);

	let response = abToStr(attStmt.response);
	ret.set("response", response);

	// console.log("returning", ret);
	return ret;
}

// Validation:
// https://www.w3.org/TR/webauthn/#android-safetynet-attestation (verification procedure)

async function androidSafetyNetValidateFn() {
	let response = this.authnrData.get("response");
	
	// parse JWS
	let parsedJws = await tools().jwsCreateVerify().verify(response, { allowEmbeddedKey: true });
	parsedJws.payload = JSON.parse(abToStr(coerceToArrayBuffer(parsedJws.payload, "MDS TOC payload")));
	this.authnrData.set("payload", parsedJws.payload);

	// Required: verify that ctsProfileMatch attribute in the parsedJws.payload is true
	if (!parsedJws.payload.ctsProfileMatch){
		throw new Error("android-safetynet attestation: ctsProfileMatch: the device is not compatible");
	}

	// Required: verify nonce 
	// response.nonce === base64( sha256( authenticatorData concatenated with clientDataHash ))
	let rawClientData = this.clientData.get("rawClientDataJson");
	let rawAuthnrData = this.authnrData.get("rawAuthnrData");
	
	// create clientData SHA-256 hash
	let clientDataHash = await tools().hashDigest(rawClientData);
	
	// concatenate buffers
	let rawAuthnrDataBuf = new Uint8Array(rawAuthnrData);
	let clientDataHashBuf = new Uint8Array(clientDataHash);

	let concatenated = appendBuffer(rawAuthnrDataBuf,clientDataHashBuf);
	
	// create hash of the concatenation
	let hash = await tools().hashDigest(concatenated);

	let nonce = base64.fromArrayBuffer(hash);
	
	// check result
	if(nonce!==parsedJws.payload.nonce){
		throw new Error("android-safetynet attestation: nonce check hash failed");
	}

	// check for any safetynet errors
	if(parsedJws.payload.error){
		throw new Error("android-safetynet: " + parsedJws.payload.error + "advice: " + parsedJws.payload.advice);
	}

	this.audit.journal.add("payload");
	this.audit.journal.add("ver");
	this.audit.journal.add("response");

	// get certs
	this.authnrData.set("attCert", parsedJws.header.x5c.shift());
	this.authnrData.set("x5c", parsedJws.header.x5c);

	this.audit.journal.add("attCert");
	this.audit.journal.add("x5c");

	// TODO: verify attCert is issued to the hostname "attest.android.com"
	let attCert = new Certificate(coerceToBase64(parsedJws.header.x5c.shift(), "parsedAttCert"));
	this.audit.info.set("organization-name", attCert.getSubject().get("organization-name"));
	// attCert.getExtensions()

	// TODO: verify cert chain
	// var rootCerts;
	// if (Array.isArray(rootCert)) rootCerts = rootCert;
	// else rootCerts = [rootCert];
	// var ret = await CertManager.verifyCertChain(parsedJws.header.x5c, rootCerts, crls);
	
	// If successful, return attestation type Basic and attestation trust path attCert.
	this.audit.info.set("attestation-type", "basic");

	this.audit.journal.add("fmt");
	
	return true;
}

const androidSafetyNetAttestation = {
	name: "android-safetynet",
	parseFn: androidSafetyNetParseFn,
	validateFn: androidSafetyNetValidateFn,
};

function tpmParseFn(attStmt) {
	let ret = new Map();

	if (attStmt.ecdaaKeyId !== undefined) {
		throw new Error("TPM ECDAA attesation is not currently supported.");
	}

	// x5c
	let x5c = attStmt.x5c;

	if (!Array.isArray(x5c)) {
		throw new TypeError("expected TPM attestation x5c field to be of type Array");
	}

	if (x5c.length < 1) {
		throw new TypeError("no certificates in TPM x5c field");
	}

	let newX5c = [];
	for (let cert of x5c) {
		cert = coerceToArrayBuffer(cert, "TPM x5c cert");
		newX5c.push(cert);
	}
	// first certificate MUST be the attestation cert
	ret.set("attCert", newX5c.shift());
	// the rest of the certificates (if any) are the certificate chain
	ret.set("x5c", newX5c);

	// ecdaa
	if (attStmt.ecdaaKeyId) ret.set("ecdaaKeyId", attStmt.ecdaaKeyId);

	// sig
	ret.set("sig", coerceToArrayBuffer(attStmt.sig, "tpm signature"));

	// sig
	ret.set("ver", attStmt.ver);

	// alg
	let alg = {
		algName: coseToJwk.algToStr(attStmt.alg),
		hashAlg: coseToJwk.algToHashStr(attStmt.alg),
	};
	ret.set("alg", alg);

	// certInfo
	let certInfo = parseCertInfo(coerceToArrayBuffer(attStmt.certInfo, "certInfo"));
	ret.set("certInfo", certInfo);

	// pubArea
	let pubArea = parsePubArea(coerceToArrayBuffer(attStmt.pubArea, "pubArea"));
	ret.set("pubArea", pubArea);

	return ret;
}

function parseCertInfo(certInfo) {
	if (!(certInfo instanceof ArrayBuffer)) {
		throw new Error("tpm attestation: expected certInfo to be ArrayBuffer");
	}

	let dv = new DataView(certInfo);
	let offset = 0;
	let ret;
	let ci = new Map();
	ci.set("rawCertInfo", certInfo);

	// TPM_GENERATED_VALUE magic number
	let magic = dv.getUint32(offset);
	// if this isn't the magic number, the rest of the parsing is going to fail
	if (magic !== 0xff544347) { // 0xFF + 'TCG'
		throw new Error("tpm attestation: certInfo had bad magic number: " + magic.toString(16));
	}
	ci.set("magic", magic);
	offset += 4;


	// TPMI_ST_ATTEST type
	let type = decodeStructureTag(dv.getUint16(offset));
	// if this isn't the right type, the rest of the parsing is going to fail
	if (type !== "TPM_ST_ATTEST_CERTIFY") {
		throw new Error("tpm attestation: got wrong type. expected 'TPM_ST_ATTEST_CERTIFY' got: " + type);
	}
	ci.set("type", type);
	offset += 2;

	// TPM2B_NAME qualifiedSigner
	ret = getTpm2bName(dv, offset);
	ci.set("qualifiedSignerHashType", ret.hashType);
	ci.set("qualifiedSigner", ret.nameHash);
	offset = ret.offset;

	// TPM2B_DATA extraData
	ret = getSizedElement(dv, offset);
	ci.set("extraData", ret.buf);
	offset = ret.offset;

	// TPMS_CLOCK_INFO clockInfo
	// UINT64 clock
	ci.set("clock", dv.buffer.slice(offset, offset + 8));
	offset += 8;
	// UINT32 resetCount
	ci.set("resetCount", dv.getUint32(offset));
	offset += 4;
	// UINT32 restartCount
	ci.set("restartCount", dv.getUint32(offset));
	offset += 4;
	// boolean safe
	ci.set("safe", !!dv.getUint8(offset));
	offset++;

	// UINT64 firmwareVersion
	ci.set("firmwareVersion", dv.buffer.slice(offset, offset + 8));
	offset += 8;

	// TPMU_ATTEST attested
	// TPM2B_NAME name
	ret = getTpm2bName(dv, offset);
	ci.set("nameHashType", ret.hashType);
	ci.set("name", ret.nameHash);
	offset = ret.offset;

	// TPM2B_NAME qualifiedName
	ret = getTpm2bName(dv, offset);
	ci.set("qualifiedNameHashType", ret.hashType);
	ci.set("qualifiedName", ret.nameHash);
	offset = ret.offset;

	if (offset !== certInfo.byteLength) {
		throw new Error("tpm attestation: left over bytes when parsing cert info");
	}

	return ci;
}

function parsePubArea(pubArea) {
	if (!(pubArea instanceof ArrayBuffer)) {
		throw new Error("tpm attestation: expected pubArea to be ArrayBuffer");
	}

	let dv = new DataView(pubArea);
	let offset = 0;
	let ret;
	let pa = new Map();
	pa.set("rawPubArea", pubArea);

	// TPMI_ALG_PUBLIC type
	let type = algIdToStr(dv.getUint16(offset));
	pa.set("type", type);
	offset += 2;

	// TPMI_ALG_HASH nameAlg
	pa.set("nameAlg", algIdToStr(dv.getUint16(offset)));
	offset += 2;

	// TPMA_OBJECT objectAttributes
	pa.set("objectAttributes", decodeObjectAttributes(dv.getUint32(offset)));
	offset += 4;

	// TPM2B_DIGEST authPolicy
	ret = getSizedElement(dv, offset);
	pa.set("authPolicy", ret.buf);
	offset = ret.offset;

	// TPMU_PUBLIC_PARMS parameters
	if (type !== "TPM_ALG_RSA") {
		throw new Error("tpm attestation: only TPM_ALG_RSA supported");
	}
	// TODO: support other types
	pa.set("symmetric", algIdToStr(dv.getUint16(offset)));
	offset += 2;
	pa.set("scheme", algIdToStr(dv.getUint16(offset)));
	offset += 2;
	pa.set("keyBits", dv.getUint16(offset));
	offset += 2;
	let exponent = dv.getUint32(offset);
	if (exponent === 0) exponent = 65537;
	pa.set("exponent", exponent);
	offset += 4;

	// TPMU_PUBLIC_ID unique
	ret = getSizedElement(dv, offset);
	pa.set("unique", ret.buf);
	offset = ret.offset;

	if (offset !== pubArea.byteLength) {
		throw new Error("tpm attestation: left over bytes when parsing public area");
	}

	return pa;
}

// eslint-disable complexity
function decodeStructureTag(t) {
	/* eslint complexity: ["off"] */
	switch (t) {
		case 0x00C4: return "TPM_ST_RSP_COMMAND";
		case 0x8000: return "TPM_ST_NULL";
		case 0x8001: return "TPM_ST_NO_SESSIONS";
		case 0x8002: return "TPM_ST_SESSIONS";
		case 0x8003: return "TPM_RESERVED_0x8003";
		case 0x8004: return "TPM_RESERVED_0x8004";
		case 0x8014: return "TPM_ST_ATTEST_NV";
		case 0x8015: return "TPM_ST_ATTEST_COMMAND_AUDIT";
		case 0x8016: return "TPM_ST_ATTEST_SESSION_AUDIT";
		case 0x8017: return "TPM_ST_ATTEST_CERTIFY";
		case 0x8018: return "TPM_ST_ATTEST_QUOTE";
		case 0x8019: return "TPM_ST_ATTEST_TIME";
		case 0x801A: return "TPM_ST_ATTEST_CREATION";
		case 0x801B: return "TPM_RESERVED_0x801B";
		case 0x8021: return "TPM_ST_CREATION";
		case 0x8022: return "TPM_ST_VERIFIED";
		case 0x8023: return "TPM_ST_AUTH_SECRET";
		case 0x8024: return "TPM_ST_HASHCHECK";
		case 0x8025: return "TPM_ST_AUTH_SIGNED";
		case 0x8029: return "TPM_ST_FU_MANIFEST";
		default:
			throw new Error("tpm attestation: unknown structure tag: " + t.toString(16));
	}
}

function decodeObjectAttributes(oa) {
	let attrList = [
		"RESERVED_0",
		"FIXED_TPM",
		"ST_CLEAR",
		"RESERVED_3",
		"FIXED_PARENT",
		"SENSITIVE_DATA_ORIGIN",
		"USER_WITH_AUTH",
		"ADMIN_WITH_POLICY",
		"RESERVED_8",
		"RESERVED_9",
		"NO_DA",
		"ENCRYPTED_DUPLICATION",
		"RESERVED_12",
		"RESERVED_13",
		"RESERVED_14",
		"RESERVED_15",
		"RESTRICTED",
		"DECRYPT",
		"SIGN_ENCRYPT",
		"RESERVED_19",
		"RESERVED_20",
		"RESERVED_21",
		"RESERVED_22",
		"RESERVED_23",
		"RESERVED_24",
		"RESERVED_25",
		"RESERVED_26",
		"RESERVED_27",
		"RESERVED_28",
		"RESERVED_29",
		"RESERVED_30",
		"RESERVED_31",
	];

	let ret = new Set();

	for (let i = 0; i < 32; i++) {
		let bit = 1 << i;
		if (oa & bit) {
			ret.add(attrList[i]);
		}
	}

	return ret;
}

function getSizedElement(dv, offset) {
	let size = dv.getUint16(offset);
	offset += 2;
	let buf = dv.buffer.slice(offset, offset + size);
	dv = new DataView(buf);
	offset += size;

	return {
		size,
		dv,
		buf,
		offset,
	};
}

function getTpm2bName(dvIn, oIn) {
	let {
		offset,
		dv,
	} = getSizedElement(dvIn, oIn);

	let hashType = algIdToStr(dv.getUint16(0));
	let nameHash = dv.buffer.slice(2);

	return {
		hashType,
		nameHash,
		offset,
	};
}

function algIdToStr(hashType) {
	let hashList = [
		"TPM_ALG_ERROR", // 0
		"TPM_ALG_RSA", // 1
		null,
		null,
		"TPM_ALG_SHA1", // 4
		"TPM_ALG_HMAC", // 5
		"TPM_ALG_AES", // 6
		"TPM_ALG_MGF1", // 7
		null,
		"TPM_ALG_KEYEDHASH", // 8
		"TPM_ALG_XOR", // A
		"TPM_ALG_SHA256", // B
		"TPM_ALG_SHA384", // C
		"TPM_ALG_SHA512", // D
		null,
		null,
		"TPM_ALG_NULL", // 10
		null,
		"TPM_ALG_SM3_256", // 12
		"TPM_ALG_SM4", // 13
		"TPM_ALG_RSASSA", // 14
		"TPM_ALG_RSAES", // 15
		"TPM_ALG_RSAPSS", // 16
		"TPM_ALG_OAEP", // 17
		"TPM_ALG_ECDSA", // 18
	];

	return hashList[hashType];
}

async function tpmValidateFn() {
	let parsedAttCert = this.authnrData.get("attCert");
	let certInfo = this.authnrData.get("certInfo");
	let pubArea = this.authnrData.get("pubArea");

	let ver = this.authnrData.get("ver");
	if (ver != "2.0") {
		throw new Error("tpm attestation: expected TPM version 2.0");
	}
	this.audit.journal.add("ver");

	// https://www.w3.org/TR/webauthn/#tpm-attestation
	// Verify that the public key specified by the parameters and unique fields of pubArea is identical to the credentialPublicKey in the attestedCredentialData in authenticatorData.
	let pubAreaPkN = pubArea.get("unique");
	let pubAreaPkExp = pubArea.get("exponent");
	let credentialPublicKeyJwk = this.authnrData.get("credentialPublicKeyJwk");
	let credentialPublicKeyJwkN = coerceToArrayBuffer(credentialPublicKeyJwk.n, "credentialPublicKeyJwk.n");
	let credentialPublicKeyJwkExpBuf = coerceToArrayBuffer(credentialPublicKeyJwk.e, "credentialPublicKeyJwk.e");
	let credentialPublicKeyJwkExp = abToInt(credentialPublicKeyJwkExpBuf);

	if (credentialPublicKeyJwk.kty !== "RSA" ||
        pubArea.get("type") !== "TPM_ALG_RSA") {
		throw new Error("tpm attestation: only RSA keys are currently supported");
	}

	if (pubAreaPkExp !== credentialPublicKeyJwkExp) {
		throw new Error("tpm attestation: RSA exponents of WebAuthn credentialPublicKey and TPM publicArea did not match");
	}

	if (!abEqual(credentialPublicKeyJwkN, pubAreaPkN)) {
		throw new Error("tpm attestation: RSA 'n' of WebAuthn credentialPublicKey and TPM publicArea did not match");
	}

	// Validate that certInfo is valid:
	//     Verify that magic is set to TPM_GENERATED_VALUE.
	let magic = certInfo.get("magic");
	if (magic !== 0xff544347) { // 0xFF + 'TCG'
		throw new Error("tpm attestation: certInfo had bad magic number: " + magic.toString(16));
	}

	//     Verify that type is set to TPM_ST_ATTEST_CERTIFY.
	let type = certInfo.get("type");
	if (type !== "TPM_ST_ATTEST_CERTIFY") {
		throw new Error("tpm attestation: got wrong type. expected 'TPM_ST_ATTEST_CERTIFY' got: " + type);
	}

	//     Verify that extraData is set to the hash of attToBeSigned using the hash algorithm employed in "alg".
	let rawAuthnrData = this.authnrData.get("rawAuthnrData");
	let rawClientData = this.clientData.get("rawClientDataJson");
	const clientDataHashBuf = await tools().hashDigest(abToBuf(rawClientData));

	let alg = this.authnrData.get("alg");
	if (alg.hashAlg === undefined) {
		throw new Error("tpm attestation: unknown algorithm: " + alg);
	}
	this.audit.journal.add("alg");

	const extraDataHashBuf = tools().hashDigest(appendBuffer(abToBuf(rawAuthnrData),clientDataHashBuf), alg.hashAlg);
	let generatedExtraDataHash = new Uint8Array(extraDataHashBuf).buffer;
	let extraData = certInfo.get("extraData");
	if (!abEqual(generatedExtraDataHash, extraData)) {
		throw new Error("extraData hash did not match authnrData + clientDataHash hashed");
	}

	//     Verify that attested contains a TPMS_CERTIFY_INFO structure as specified in [TPMv2-Part2] section 10.12.3,
	//     [see parser]
	//     whose name field contains a valid Name for pubArea, as computed using the algorithm in the nameAlg field of pubArea using the procedure specified in [TPMv2-Part1] section 16.
	let pubAreaName = certInfo.get("name");
	let pubAreaNameHashAlg = tpmHashToNpmHash(certInfo.get("nameHashType"));
	const pubAreaNameHashBuf = tools.hashDigest(abToBuf(pubArea.get("rawPubArea")), pubAreaNameHashAlg);
	let generatedPubAreaNameHash = new Uint8Array(pubAreaNameHashBuf).buffer;
	if (!abEqual(generatedPubAreaNameHash, pubAreaName)) {
		throw new Error("pubAreaName hash did not match hash of publicArea");
	}
	this.audit.journal.add("pubArea");

	//     Note that the remaining fields in the "Standard Attestation Structure" [TPMv2-Part1] section 31.2, i.e., qualifiedSigner, clockInfo and firmwareVersion are ignored.
	//     These fields MAY be used as an input to risk engines.

	// If x5c is present, this indicates that the attestation type is not ECDAA. In this case:
	//     Verify the sig is a valid signature over certInfo using the attestation public key in x5c with the algorithm specified in alg.
	let sig = this.authnrData.get("sig");
	let rawCertInfo = certInfo.get("rawCertInfo");
	let attCertPem = abToPem("CERTIFICATE", parsedAttCert);
	// ToDo: Untested?
	const res = await tools().verifySignature(attCertPem,sig,abToBuf(rawCertInfo),alg.hashAlg);
	if (!res) {
		throw new Error("TPM attestation signature verification failed");
	}
	this.audit.journal.add("sig");
	this.audit.journal.add("certInfo");

	//     Verify that x5c meets the requirements in §8.3.1 TPM attestation statement certificate requirements.
	// https://www.w3.org/TR/webauthn/#tpm-cert-requirements
	// decode attestation cert
	let attCert = new Certificate(coerceToBase64(parsedAttCert, "parsedAttCert"));
	try {
		await attCert.verify();
	} catch (e) {
		let err = e;
		if (err.message === "Please provide issuer certificate as a parameter") {
			// err = new Error("Root attestation certificate for this token could not be found. Please contact your security key vendor.");
			this.audit.warning.set("attesation-not-validated", "could not validate attestation because the root attestation certification could not be found");
		} else {
			throw err;
		}
	}

	// Version MUST be set to 3.
	if (attCert.getVersion() !== 3) {
		throw new Error("expected TPM attestation certificate to be x.509v3");
	}

	// Subject field MUST be set to empty.
	let attCertSubject = attCert.getSubject();
	if (attCertSubject.size !== 0) {
		throw new Error("tpm attestation: attestation certificate MUST have empty subject");
	}

	// The Subject Alternative Name extension MUST be set as defined in [TPMv2-EK-Profile] section 3.2.9.
	// [save certificate warnings, info, and extensions in our audit information]
	let attCertExt = attCert.getExtensions();
	attCertExt.forEach((v, k) => this.audit.info.set(k, v));
	attCert.info.forEach((v, k) => this.audit.info.set(k, v));
	attCert.warning.forEach((v, k) => this.audit.warning.set(k, v));

	let altName = attCertExt.get("subject-alt-name");
	if (altName === undefined ||
        !Array.isArray(altName) ||
        altName.length < 1) {
		throw new Error("tpm attestation: Subject Alternative Name extension MUST be set as defined in [TPMv2-EK-Profile] section 3.2.9");
	}

	// TCG EK Credential Profile For TPM Family 2.0; Level 0 Specification Version 2.0 Revision 14 4 November 2014
	// The issuer MUST include TPM manufacturer, TPM part number and TPM firmware version, using the directoryNameform within the GeneralName structure.
	let directoryName;
	altName.forEach((name) => {
		if (name.directoryName !== undefined) {
			directoryName = name.directoryName;
		}
	});

	if (directoryName === undefined) {
		throw new Error("tpm attestation: subject alternative name did not contain directory name");
	}

	// The TPM manufacturer identifies the manufacturer of the TPM. This value MUST be the vendor ID defined in the TCG Vendor ID Registry
	if (!directoryName.has("tcg-at-tpm-manufacturer")) {
		throw new Error("tpm attestation: subject alternative name did not list manufacturer");
	}
	// TODO: lookup manufacturer in registry

	// The TPM part number is encoded as a string and is manufacturer-specific. A manufacturer MUST provide a way to the user to retrieve the part number physically or logically. This information could be e.g. provided as part of the vendor string in the command TPM2_GetCapability(property = TPM_PT_VENDOR_STRING_x; x=1…4).
	if (!directoryName.has("tcg-at-tpm-model")) {
		throw new Error("tpm attestation: subject alternative name did not list model number");
	}

	// The TPM firmware version is a manufacturer-specific implementation version of the TPM. This value SHOULD match the version reported by the command TPM2_GetCapability (property = TPM_PT_FIRMWARE_VERSION_1).
	if (!directoryName.has("tcg-at-tpm-version")) {
		throw new Error("tpm attestation: subject alternative name did not list firmware version");
	}

	// The Extended Key Usage extension MUST contain the "joint-iso-itu-t(2) internationalorganizations(23) 133 tcg-kp(8) tcg-kp-AIKCertificate(3)" OID.
	let extKeyUsage = attCertExt.get("ext-key-usage");
	if (!Array.isArray(extKeyUsage) || !extKeyUsage.includes("tcg-kp-aik-certificate")) {
		throw new Error("tpm attestation: the Extended Key Usage extension MUST contain 'tcg-kp-aik-certificate'");
	}

	// The Basic Constraints extension MUST have the CA component set to false.
	let basicConstraints = attCertExt.get("basic-constraints");
	if (typeof basicConstraints !== "object" || basicConstraints.cA !== false) {
		throw new Error("tpm attestation: the Basic Constraints extension MUST have the CA component set to false");
	}
	// An Authority Information Access (AIA) extension with entry id-ad-ocsp and a CRL Distribution Point extension [RFC5280]
	// are both OPTIONAL as the status of many attestation certificates is available through metadata services. See, for example, the FIDO Metadata Service [FIDOMetadataService].
	// [will use MDS]

	//     If x5c contains an extension with OID 1 3 6 1 4 1 45724 1 1 4 (id-fido-gen-ce-aaguid) verify that the value of this extension matches the aaguid in authenticatorData.
	let certAaguid = attCertExt.get("fido-aaguid");
	let aaguid = this.authnrData.get("aaguid");
	if (certAaguid !== undefined && !abEqual(aaguid, certAaguid)) {
		throw new Error("tpm attestation: authnrData AAGUID did not match AAGUID in attestation certificate");
	}
	this.audit.journal.add("x5c");
	this.audit.journal.add("attCert");

	//     If successful, return attestation type AttCA and attestation trust path x5c.
	this.audit.info.set("attestation-type", "AttCA");

	this.audit.journal.add("fmt");

	return true;

	// If ecdaaKeyId is present, then the attestation type is ECDAA.
	//     Perform ECDAA-Verify on sig to verify that it is a valid signature over certInfo (see [FIDOEcdaaAlgorithm]).
	//     If successful, return attestation type ECDAA and the identifier of the ECDAA-Issuer public key ecdaaKeyId.
	// [not currently supported, error would have been thrown in parser]
}

function tpmHashToNpmHash(tpmHash) {
	switch (tpmHash) {
		case "TPM_ALG_SHA1": return "SHA1";
		case "TPM_ALG_SHA256": return "SHA256";
		case "TPM_ALG_SHA384": return "SHA384";
		case "TPM_ALG_SHA512": return "SHA512";
		default:
			throw new TypeError("Unsupported hash type: " + tpmHash);
	}
}

const tpmAttestation = {
	name: "tpm",
	parseFn: tpmParseFn,
	validateFn: tpmValidateFn,
};

let globalAttestationMap = new Map();
let globalExtensionMap = new Map();
let globalMdsCollection = new Map();

class Fido2Lib {
	/**
    * Creates a FIDO2 server class
    * @param {Object} opts Options for the server
    * @param {Number} [opts.timeout=60000] The amount of time to wait, in milliseconds, before a call has timed out
    * @param {String} [opts.rpId="localhost"] The name of the server
    * @param {String} [opts.rpName="Anonymous Service"] The name of the server
    * @param {String} [opts.rpIcon] A URL for the service's icon. Can be a [RFC 2397]{@link https://tools.ietf.org/html/rfc2397} data URL.
    * @param {Number} [opts.challengeSize=64] The number of bytes to use for the challenge
    * @param {Object} [opts.authenticatorSelectionCriteria] An object describing what types of authenticators are allowed to register with the service.
    * See [AuthenticatorSelectionCriteria]{@link https://w3.org/TR/webauthn/#authenticatorSelection} in the WebAuthn spec for details.
    * @param {String} [opts.authenticatorAttachment] Indicates whether authenticators should be part of the OS ("platform"), or can be roaming authenticators ("cross-platform")
    * @param {Boolean} [opts.authenticatorRequireResidentKey] Indicates whether authenticators must store the key internally (true) or if they can use a KDF to generate keys
    * @param {String} [opts.authenticatorUserVerification] Indicates whether user verification should be performed. Options are "required", "preferred", or "discouraged".
    * @param {String} [opts.attestation="direct"] The preferred attestation type to be used.
    * See [AttestationConveyancePreference]{https://w3.org/TR/webauthn/#enumdef-attestationconveyancepreference} in the WebAuthn spec
    * @param {Array<Number>} [opts.cryptoParams] A list of COSE algorithm identifiers (e.g. -7)
    * ordered by the preference in which the authenticator should use them.
    */
	constructor(opts) {
		/* eslint complexity: ["off"] */
		opts = opts || {};

		// set defaults
		this.config = {};

		// timeout
		this.config.timeout = (opts.timeout === undefined) ? 60000 : opts.timeout; // 1 minute
		checkOptType(this.config, "timeout", "number");
		if (!(this.config.timeout >>> 0 === parseFloat(this.config.timeout))) {
			throw new RangeError("timeout should be zero or positive integer");
		}

		// challengeSize
		this.config.challengeSize = opts.challengeSize || 64;
		checkOptType(this.config, "challengeSize", "number");
		if (this.config.challengeSize < 32) {
			throw new RangeError("challenge size too small, must be 32 or greater");
		}

		// rpId
		this.config.rpId = opts.rpId;
		checkOptType(this.config, "rpId", "string");

		// rpName
		this.config.rpName = opts.rpName || "Anonymous Service";
		checkOptType(this.config, "rpName", "string");

		// rpIcon
		this.config.rpIcon = opts.rpIcon;
		checkOptType(this.config, "rpIcon", "string");

		// authenticatorRequireResidentKey
		this.config.authenticatorRequireResidentKey = opts.authenticatorRequireResidentKey;
		checkOptType(this.config, "authenticatorRequireResidentKey", "boolean");

		// authenticatorAttachment
		this.config.authenticatorAttachment = opts.authenticatorAttachment;
		if (this.config.authenticatorAttachment !== undefined &&
            (this.config.authenticatorAttachment !== "platform" &&
            this.config.authenticatorAttachment !== "cross-platform")) {
			throw new TypeError("expected authenticatorAttachment to be 'platform', or 'cross-platform', got: " + this.config.authenticatorAttachment);
		}

		// authenticatorUserVerification
		this.config.authenticatorUserVerification = opts.authenticatorUserVerification;
		if (this.config.authenticatorUserVerification !== undefined &&
            (this.config.authenticatorUserVerification !== "required" &&
            this.config.authenticatorUserVerification !== "preferred" &&
            this.config.authenticatorUserVerification !== "discouraged")) {
			throw new TypeError("expected authenticatorUserVerification to be 'required', 'preferred', or 'discouraged', got: " + this.config.authenticatorUserVerification);
		}

		// attestation
		this.config.attestation = opts.attestation || "direct";
		if (this.config.attestation !== "direct" &&
            this.config.attestation !== "indirect" &&
            this.config.attestation !== "none") {
			throw new TypeError("expected attestation to be 'direct', 'indirect', or 'none', got: " + this.config.attestation);
		}

		// cryptoParams
		this.config.cryptoParams = opts.cryptoParams || [-7, -257];
		checkOptType(this.config, "cryptoParams", Array);
		if (this.config.cryptoParams.length < 1) {
			throw new TypeError("cryptoParams must have at least one element");
		}
		this.config.cryptoParams.forEach((param) => {
			checkOptType({ cryptoParam: param }, "cryptoParam", "number");
		});

		this.attestationMap = globalAttestationMap;
		this.extSet = new Set(); // enabled extensions (all disabled by default)
		this.extOptMap = new Map(); // default options for extensions

		// TODO: convert icon file to data-URL icon
		// TODO: userVerification
	}
	/**
		 * Creates a new {@link MdsCollection}
		 * @param {String} collectionName The name of the collection to create.
		 * Used to identify the source of a {@link MdsEntry} when {@link Fido2Lib#findMdsEntry}
		 * finds multiple matching entries from different sources (e.g. FIDO MDS 1 & FIDO MDS 2)
		 * @return {MdsCollection} The MdsCollection that was created
		 * @see  MdsCollection
		 */
	static createMdsCollection(collectionName) {
		return new MdsCollection(collectionName);
	}

	/**
	 * Adds a new {@link MdsCollection} to the global MDS collection list that will be used for {@link findMdsEntry}
	 * @param {MdsCollection} mdsCollection The MDS collection that will be used
	 * @see  MdsCollection
	 */
	static async addMdsCollection(mdsCollection) {
		if (!(mdsCollection instanceof MdsCollection)) {
			throw new Error("expected 'mdsCollection' to be instance of MdsCollection, got: " + mdsCollection);
		}
		await mdsCollection.validate();
		globalMdsCollection.set(mdsCollection.name, mdsCollection);
	}

	/**
	 * Removes all entries from the global MDS collections list. Mostly used for testing.
	 */
	static clearMdsCollections() {
		globalMdsCollection.clear();
	}

	/**
	 * Returns {@link MdsEntry} objects that match the requested id. The
	 * lookup is done by calling {@link MdsCollection#findEntry} on the current global
	 * MDS collection. If no global MDS collection has been specified using
	 * {@link setMdsCollection}, an `Error` will be thrown.
	 * @param  {String|ArrayBuffer} id The authenticator id to look up metadata for
	 * @return {Array.<MdsEntry>}    Returns an Array of {@link MdsEntry} for the specified id.
	 * If no entry was found, the Array will be empty.
	 * @see  MdsCollection
	 */
	static findMdsEntry(id) {
		if (globalMdsCollection.size < 1) {
			throw new Error("must set MDS collection before attempting to find an MDS entry");
		}

		let ret = [];
		for (let collection of globalMdsCollection.values()) {
			let entry = collection.findEntry(id);
			if (entry) ret.push(entry);
		}

		return ret;
	}

	/**
     * Adds a new global extension that will be available to all instantiations of
     * {@link Fido2Lib}. Note that the extension must still be enabled by calling
     * {@link enableExtension} for each instantiation of a Fido2Lib.
     * @param {String} extName     The name of the extension to add. (e.g. - "appid")
     * @param {Function} optionGeneratorFn Extensions are included in
     * @param {Function} resultParserFn    [description]
     * @param {Function} resultValidatorFn [description]
     */
	static addExtension(extName, optionGeneratorFn, resultParserFn, resultValidatorFn) {
		if (typeof extName !== "string") {
			throw new Error("expected 'extName' to be String, got: " + extName);
		}

		if (globalExtensionMap.has(extName)) {
			throw new Error(`the extension '${extName}' has already been added`);
		}

		if (typeof optionGeneratorFn !== "function") {
			throw new Error("expected 'optionGeneratorFn' to be a Function, got: " + optionGeneratorFn);
		}

		if (typeof resultParserFn !== "function") {
			throw new Error("expected 'resultParserFn' to be a Function, got: " + resultParserFn);
		}

		if (typeof resultValidatorFn !== "function") {
			throw new Error("expected 'resultValidatorFn' to be a Function, got: " + resultValidatorFn);
		}

		globalExtensionMap.set(extName, {
			optionGeneratorFn,
			resultParserFn,
			resultValidatorFn,
		});
	}

	/**
     * Removes all extensions from the global extension registry. Mostly used for testing.
     */
	static deleteAllExtensions() {
		globalExtensionMap.clear();
	}


	/**
     * Generates the options to send to the client for the specified extension
     * @private
     * @param  {String} extName The name of the extension to generate options for. Must be a valid extension that has been registered through {@link Fido2Lib#addExtension}
     * @param  {String} type    The type of options that are being generated. Valid options are "attestation" or "assertion".
     * @param  {Any} [options] Optional parameters to pass to the generator function
     * @return {Any}         The extension value that will be sent to the client. If `undefined`, this extension won't be included in the
     * options sent to the client.
     */
	generateExtensionOptions(extName, type, options) {
		if (typeof extName !== "string") {
			throw new Error("expected 'extName' to be String, got: " + extName);
		}

		if (type !== "attestation" && type !== "assertion") {
			throw new Error("expected 'type' to be 'attestation' or 'assertion', got: " + type);
		}

		let ext = globalExtensionMap.get(extName);
		if (typeof ext !== "object" ||
            typeof ext.optionGeneratorFn !== "function") {
			throw new Error(`valid extension for '${extName}' not found`);
		}
		let ret = ext.optionGeneratorFn(extName, type, options);

		return ret;
	}

	static parseExtensionResult(extName, clientThing, authnrThing) {
		if (typeof extName !== "string") {
			throw new Error("expected 'extName' to be String, got: " + extName);
		}

		let ext = globalExtensionMap.get(extName);
		if (typeof ext !== "object" ||
            typeof ext.parseFn !== "function") {
			throw new Error(`valid extension for '${extName}' not found`);
		}
		let ret = ext.parseFn(extName, clientThing, authnrThing);

		return ret;
	}

	static validateExtensionResult(extName) {
		let ext = globalExtensionMap.get(extName);
		if (typeof ext !== "object" ||
            typeof ext.validateFn !== "function") {
			throw new Error(`valid extension for '${extName}' not found`);
		}
		let ret = ext.validateFn.call(this);

		return ret;
	}

	/**
     * Enables the specified extension.
     * @param  {String} extName The name of the extension to enable. Must be a valid extension that has been registered through {@link Fido2Lib#addExtension}
     */
	enableExtension(extName) {
		if (typeof extName !== "string") {
			throw new Error("expected 'extName' to be String, got: " + extName);
		}

		if (!globalExtensionMap.has(extName)) {
			throw new Error(`valid extension for '${extName}' not found`);
		}

		this.extSet.add(extName);
	}

	/**
     * Disables the specified extension.
     * @param  {String} extName The name of the extension to enable. Must be a valid extension that has been registered through {@link Fido2Lib#addExtension}
     */
	disableExtension(extName) {
		if (typeof extName !== "string") {
			throw new Error("expected 'extName' to be String, got: " + extName);
		}

		if (!globalExtensionMap.has(extName)) {
			throw new Error(`valid extension for '${extName}' not found`);
		}

		this.extSet.delete(extName);
	}

	/**
     * Specifies the options to be used for the extension
     * @param  {String} extName The name of the extension to set the options for (e.g. - "appid". Must be a valid extension that has been registered through {@link Fido2Lib#addExtension}
     * @param {Any} options The parameter that will be passed to the option generator function (e.g. - "https://webauthn.org")
     */
	setExtensionOptions(extName, options) {
		if (typeof extName !== "string") {
			throw new Error("expected 'extName' to be String, got: " + extName);
		}

		if (!globalExtensionMap.has(extName)) {
			throw new Error(`valid extension for '${extName}' not found`);
		}

		this.extOptMap.set(extName, options);
	}


	/**
     * Validates an attestation response. Will be called within the context (`this`) of a {@link Fido2AttestationResult}
     * @private
     */
	static async validateAttestation() {
		let fmt = this.authnrData.get("fmt");

		// validate input
		if (typeof fmt !== "string") {
			throw new TypeError("expected 'fmt' to be string, got: " + typeof fmt);
		}

		// get from attestationMap
		let fmtObj = globalAttestationMap.get(fmt);
		if (typeof fmtObj !== "object" ||
            typeof fmtObj.parseFn !== "function" ||
            typeof fmtObj.validateFn !== "function") {
			throw new Error(`no support for attestation format: ${fmt}`);
		}

		// call fn
		let ret = await fmtObj.validateFn.call(this);

		// validate return
		if (ret !== true) {
			throw new Error(`${fmt} validateFn did not return 'true'`);
		}

		// return result
		return ret;
	}


	/**
     * Adds a new attestation format that will automatically be recognized and parsed
     * for any future {@link Fido2CreateRequest} messages
     * @param {String} fmt The name of the attestation format, as it appears in the
     * ARIN registry and / or as it will appear in the {@link Fido2CreateRequest}
     * message that is received
     * @param {Function} parseFn The function that will be called to parse the
     * attestation format. It will receive the `attStmt` as a parameter and will be
     * called from the context (`this`) of the `Fido2CreateRequest`
     * @param {Function} validateFn The function that will be called to validate the
     * attestation format. It will receive no arguments, as all the necessary
     * information for validating the attestation statement will be contained in the
     * calling context (`this`).
     */
	static addAttestationFormat(fmt, parseFn, validateFn) {
		// validate input
		if (typeof fmt !== "string") {
			throw new TypeError("expected 'fmt' to be string, got: " + typeof fmt);
		}

		if (typeof parseFn !== "function") {
			throw new TypeError("expected 'parseFn' to be string, got: " + typeof parseFn);
		}

		if (typeof validateFn !== "function") {
			throw new TypeError("expected 'validateFn' to be string, got: " + typeof validateFn);
		}

		if (globalAttestationMap.has(fmt)) {
			throw new Error(`can't add format: '${fmt}' already exists`);
		}

		// add to attestationMap
		globalAttestationMap.set(fmt, {
			parseFn,
			validateFn,
		});

		return true;
	}

	/**
     * Deletes all currently registered attestation formats.
     */
	static deleteAllAttestationFormats() {
		globalAttestationMap.clear();
	}

	/**
     * Parses an attestation statememnt of the format specified
     * @private
     * @param {String} fmt The name of the format to be parsed, as specified in the
     * ARIN registry of attestation formats.
     * @param {Object} attStmt The attestation object to be parsed.
     * @return {Map} A Map of all the attestation fields that were parsed.
     * At this point the fields have not yet been verified.
     * @throws {Error} when a field cannot be parsed or verified.
     * @throws {TypeError} when supplied parameters `fmt` or `attStmt` are of the
     * wrong type
     */
	static parseAttestation(fmt, attStmt) {
		// validate input
		if (typeof fmt !== "string") {
			throw new TypeError("expected 'fmt' to be string, got: " + typeof fmt);
		}

		if (typeof attStmt !== "object") {
			throw new TypeError("expected 'attStmt' to be object, got: " + typeof attStmt);
		}

		// get from attestationMap
		let fmtObj = globalAttestationMap.get(fmt);
		if (typeof fmtObj !== "object" ||
            typeof fmtObj.parseFn !== "function" ||
            typeof fmtObj.validateFn !== "function") {
			throw new Error(`no support for attestation format: ${fmt}`);
		}

		// call fn
		let ret = fmtObj.parseFn.call(this, attStmt);

		// validate return
		if (!(ret instanceof Map)) {
			throw new Error(`${fmt} parseFn did not return a Map`);
		}

		// return result
		return new Map([
			["fmt", fmt],
			...ret,
		]);
	}


	/**
     * Parses and validates an attestation response from the client
     * @param {Object} res The assertion result that was generated by the client.
     * See {@link https://w3.org/TR/webauthn/#authenticatorattestationresponse AuthenticatorAttestationResponse} in the WebAuthn spec.
     * @param {String} [res.id] The base64url encoded id returned by the client
     * @param {String} [res.rawId] The base64url encoded rawId returned by the client. If `res.rawId` is missing, `res.id` will be used instead. If both are missing an error will be thrown.
     * @param {String} res.response.clientDataJSON The base64url encoded clientDataJSON returned by the client
     * @param {String} res.response.authenticatorData The base64url encoded authenticatorData returned by the client
     * @param {Object} expected The expected parameters for the assertion response.
     * If these parameters don't match the recieved values, validation will fail and an error will be thrown.
     * @param {String} expected.challenge The base64url encoded challenge that was sent to the client, as generated by [assertionOptions]{@link Fido2Lib#assertionOptions}
     * @param {String} expected.origin The expected origin that the authenticator has signed over. For example, "https://localhost:8443" or "https://webauthn.org"
     * @param {String} expected.factor Which factor is expected for the assertion. Valid values are "first", "second", or "either".
     * If "first", this requires that the authenticator performed user verification (e.g. - biometric authentication, PIN authentication, etc.).
     * If "second", this requires that the authenticator performed user presence (e.g. - user pressed a button).
     * If "either", then either "first" or "second" is acceptable
     * @return {Promise<Fido2AttestationResult>} Returns a Promise that resolves to a {@link Fido2AttestationResult}
     * @throws {Error} If parsing or validation fails
     */
	async attestationResult(res, expected) {
		expected.flags = factorToFlags(expected.factor, ["AT"]);
		delete expected.factor;
		return Fido2AttestationResult.create(res, expected);
	}

	/**
     * Parses and validates an assertion response from the client
     * @param {Object} res The assertion result that was generated by the client.
     * See {@link https://w3.org/TR/webauthn/#authenticatorassertionresponse AuthenticatorAssertionResponse} in the WebAuthn spec.
     * @param {String} [res.id] The base64url encoded id returned by the client
     * @param {String} [res.rawId] The base64url encoded rawId returned by the client. If `res.rawId` is missing, `res.id` will be used instead. If both are missing an error will be thrown.
     * @param {String} res.response.clientDataJSON The base64url encoded clientDataJSON returned by the client
     * @param {String} res.response.attestationObject The base64url encoded authenticatorData returned by the client
     * @param {String} res.response.signature The base64url encoded signature returned by the client
     * @param {String|null} [res.response.userHandle] The base64url encoded userHandle returned by the client. May be null or an empty string.
     * @param {Object} expected The expected parameters for the assertion response.
     * If these parameters don't match the recieved values, validation will fail and an error will be thrown.
     * @param {String} expected.challenge The base64url encoded challenge that was sent to the client, as generated by [assertionOptions]{@link Fido2Lib#assertionOptions}
     * @param {String} expected.origin The expected origin that the authenticator has signed over. For example, "https://localhost:8443" or "https://webauthn.org"
     * @param {String} expected.factor Which factor is expected for the assertion. Valid values are "first", "second", or "either".
     * If "first", this requires that the authenticator performed user verification (e.g. - biometric authentication, PIN authentication, etc.).
     * If "second", this requires that the authenticator performed user presence (e.g. - user pressed a button).
     * If "either", then either "first" or "second" is acceptable
     * @param {String} expected.publicKey A PEM encoded public key that will be used to validate the assertion response signature.
     * This is the public key that was returned for this user during [attestationResult]{@link Fido2Lib#attestationResult}
     * @param {Number} expected.prevCounter The previous value of the signature counter for this authenticator.
     * @param {String|null} expected.userHandle The expected userHandle, which was the user.id during registration
     * @return {Promise<Fido2AssertionResult>} Returns a Promise that resolves to a {@link Fido2AssertionResult}
     * @throws {Error} If parsing or validation fails
     */
	async assertionResult(res, expected) {
		expected.flags = factorToFlags(expected.factor, []);
		delete expected.factor;
		return Fido2AssertionResult.create(res, expected);
	}

	/**
     * Gets a challenge and any other parameters for the `navigator.credentials.create()` call
     * The `challenge` property is an `ArrayBuffer` and will need to be encoded to be transmitted to the client.
     * @param {Object} [opts] An object containing various options for the option creation
     * @param {Object} [opts.extensionOptions] An object that contains the extensions to enable, and the options to use for each of them.
     * The keys of this object are the names of the extensions (e.g. - "appid"), and the value of each key is the option that will
     * be passed to that extension when it is generating the value to send to the client. This object overrides the extensions that
     * have been set with {@link enableExtension} and the options that have been set with {@link setExtensionOptions}. If an extension
     * was enabled with {@link enableExtension} but it isn't included in this object, the extension won't be sent to the client. Likewise,
     * if an extension was disabled with {@link disableExtension} but it is included in this object, it will be sent to the client.
     * @param {String} [extraData] Extra data to be signed by the authenticator during attestation. The challenge will be a hash:
     * SHA256(rawChallenge + extraData) and the `rawChallenge` will be returned as part of PublicKeyCredentialCreationOptions.
     * @returns {Promise<PublicKeyCredentialCreationOptions>} The options for creating calling `navigator.credentials.create()`
     */
	async attestationOptions(opts) {
		opts = opts || {};

		// The object being returned is described here:
		// https://w3c.github.io/webauthn/#dictdef-publickeycredentialcreationoptions
		let challenge = tools().randomValues(this.config.challengeSize);
		challenge = coerceToArrayBuffer(challenge, "challenge");
		let pubKeyCredParams = [];
		this.config.cryptoParams.forEach((coseId) => {
			pubKeyCredParams.push({
				type: "public-key",
				alg: coseId });
		});

		// mix extraData into challenge
		let rawChallenge;
		if (opts.extraData) {
			rawChallenge = challenge;
			let extraData = coerceToArrayBuffer(opts.extraData, "extraData");
			let hash = await tools().hashDigest(appendBuffer(challenge,extraData));
			challenge = new Uint8Array(hash).buffer;
		}

		let options = {
			rp: {},
			user: {},
		};

		let extensions = createExtensions.call(this, "attestation", opts.extensionOptions);

		/**
         * @typedef {Object} PublicKeyCredentialCreationOptions
         * @description This object is returned by {@link attestationOptions} and is basially the same as
         * the [PublicKeyCredentialCreationOptions]{@link https://w3.org/TR/webauthn/#dictdef-publickeycredentialcreationoptions}
         * object that is required to be passed to `navigator.credentials.create()`. With the exception of the `challenge` property,
         * all other properties are optional and only set if they were specified in the configuration paramater
         * that was passed to the constructor.
         * @property {Object} rp Relying party information (a.k.a. - server / service information)
         * @property {String} [rp.name] Relying party name (e.g. - "ACME"). This is only set if `rpName` was specified during the `new` call.
         * @property {String} [rp.id] Relying party ID, a domain name (e.g. - "example.com"). This is only set if `rpId` was specified during the `new` call.
         * @property {Object} user User information. This will be an empty object
         * @property {ArrayBuffer} challenge An ArrayBuffer filled with random bytes. This will be verified in {@link attestationResult}
         * @property {Array} [pubKeyCredParams] A list of PublicKeyCredentialParameters objects, based on the `cryptoParams` that was passed to the constructor.
         * @property {Number} [timeout] The amount of time that the call should take before returning an error
         * @property {String} [attestation] Whether the client should request attestation from the authenticator or not
         * @property {Object} [authenticatorSelectionCriteria] A object describing which authenticators are preferred for registration
         * @property {String} [authenticatorSelectionCriteria.attachment] What type of attachement is acceptable for new authenticators.
         * Allowed values are "platform", meaning that the authenticator is embedded in the operating system, or
         * "cross-platform", meaning that the authenticator is removeable (e.g. USB, NFC, or BLE).
         * @property {Boolean} [authenticatorSelectionCriteria.requireResidentKey] Indicates whether authenticators must store the keys internally, or if they can
         * store them externally (using a KDF or key wrapping)
         * @property {String} [authenticatorSelectionCriteria.userVerification] Indicates whether user verification is required for authenticators. User verification
         * means that an authenticator will validate a use through their biometrics (e.g. fingerprint) or knowledge (e.g. PIN). Allowed
         * values for `userVerification` are "required", meaning that registration will fail if no authenticator provides user verification;
         * "preferred", meaning that if multiple authenticators are available, the one(s) that provide user verification should be used; or
         * "discouraged", which means that authenticators that don't provide user verification are preferred.
         * @property {ArrayBuffer} [rawChallenge] If `extraData` was passed to {@link attestationOptions}, this
         * will be the original challenge used, and `challenge` will be a hash:
         * SHA256(rawChallenge + extraData)
         * @property {Object} [extensions] The values of any enabled extensions.
         */
		setOpt(options.rp, "name", this.config.rpName);
		setOpt(options.rp, "id", this.config.rpId);
		setOpt(options.rp, "icon", this.config.rpIcon);
		setOpt(options, "challenge", challenge);
		setOpt(options, "pubKeyCredParams", pubKeyCredParams);
		setOpt(options, "timeout", this.config.timeout);
		setOpt(options, "attestation", this.config.attestation);
		if (this.config.authenticatorAttachment !== undefined ||
            this.config.authenticatorRequireResidentKey !== undefined ||
            this.config.authenticatorUserVerification !== undefined) {
			options.authenticatorSelection = {};
			setOpt(options.authenticatorSelection, "authenticatorAttachment", this.config.authenticatorAttachment);
			setOpt(options.authenticatorSelection, "requireResidentKey", this.config.authenticatorRequireResidentKey);
			setOpt(options.authenticatorSelection, "userVerification", this.config.authenticatorUserVerification);
		}
		setOpt(options, "rawChallenge", rawChallenge);

		if (Object.keys(extensions).length > 0) {
			options.extensions = extensions;
		}

		return options;
	}
	/**
     * Creates an assertion challenge and any other parameters for the `navigator.credentials.get()` call.
     * The `challenge` property is an `ArrayBuffer` and will need to be encoded to be transmitted to the client.
     * @param {Object} [opts] An object containing various options for the option creation
     * @param {Object} [opts.extensionOptions] An object that contains the extensions to enable, and the options to use for each of them.
     * The keys of this object are the names of the extensions (e.g. - "appid"), and the value of each key is the option that will
     * be passed to that extension when it is generating the value to send to the client. This object overrides the extensions that
     * have been set with {@link enableExtension} and the options that have been set with {@link setExtensionOptions}. If an extension
     * was enabled with {@link enableExtension} but it isn't included in this object, the extension won't be sent to the client. Likewise,
     * if an extension was disabled with {@link disableExtension} but it is included in this object, it will be sent to the client.
     * @param {String} [extraData] Extra data to be signed by the authenticator during attestation. The challenge will be a hash:
     * SHA256(rawChallenge + extraData) and the `rawChallenge` will be returned as part of PublicKeyCredentialCreationOptions.
     * @returns {Promise<PublicKeyCredentialRequestOptions>} The options to be passed to `navigator.credentials.get()`
     */
	async assertionOptions(opts) {
		opts = opts || {};

		// https://w3c.github.io/webauthn/#dictdef-publickeycredentialcreationoptions
		let challenge = tools().randomValues(this.config.challengeSize);
		challenge = coerceToArrayBuffer(challenge, "challenge");
		let options = {};

		// mix extraData into challenge
		let rawChallenge;
		if (opts.extraData) {
			rawChallenge = challenge;
			let extraData = coerceToArrayBuffer(opts.extraData, "extraData");
			challenge = abToBuf(await tools().hashDigest(appendBuffer(challenge,extraData)));
		}

		let extensions = createExtensions.call(this, "assertion", opts.extensionOptions);

		/**
         * @typedef {Object} PublicKeyCredentialRequestOptions
         * @description This object is returned by {@link assertionOptions} and is basially the same as
         * the [PublicKeyCredentialRequestOptions]{@link https://w3.org/TR/webauthn/#dictdef-publickeycredentialrequestoptions}
         * object that is required to be passed to `navigator.credentials.get()`. With the exception of the `challenge` property,
         * all other properties are optional and only set if they were specified in the configuration paramater
         * that was passed to the constructor.
         * @property {ArrayBuffer} challenge An ArrayBuffer filled with random bytes. This will be verified in {@link attestationResult}
         * @property {Number} [timeout] The amount of time that the call should take before returning an error
         * @property {String} [rpId] Relying party ID, a domain name (e.g. - "example.com"). This is only set if `rpId` was specified during the `new` call.
         * @property {String} [attestation] Whether the client should request attestation from the authenticator or not
         * @property {String} [userVerification] Indicates whether user verification is required for authenticators. User verification
         * means that an authenticator will validate a use through their biometrics (e.g. fingerprint) or knowledge (e.g. PIN). Allowed
         * values for `userVerification` are "required", meaning that authentication will fail if no authenticator provides user verification;
         * "preferred", meaning that if multiple authenticators are available, the one(s) that provide user verification should be used; or
         * "discouraged", which means that authenticators that don't provide user verification are preferred.
         * @property {ArrayBuffer} [rawChallenge] If `extraData` was passed to {@link attestationOptions}, this
         * will be the original challenge used, and `challenge` will be a hash:
         * SHA256(rawChallenge + extraData)
         * @property {Object} [extensions] The values of any enabled extensions.
         */
		setOpt(options, "challenge", challenge);
		setOpt(options, "timeout", this.config.timeout);
		setOpt(options, "rpId", this.config.rpId);
		setOpt(options, "userVerification", this.config.authenticatorUserVerification);

		setOpt(options, "rawChallenge", rawChallenge);

		if (Object.keys(extensions).length > 0) {
			options.extensions = extensions;
		}

		return options;
	}
    
}

function checkOptType(opts, prop, type) {
	if (typeof opts !== "object") return;

	// undefined
	if (opts[prop] === undefined) return;

	// native type
	if (typeof type === "string") {
		if (typeof opts[prop] !== type) {
			throw new TypeError(`expected ${prop} to be ${type}, got: ${opts[prop]}`);
		}
	}

	// class type
	if (typeof type === "function") {
		if (!(opts[prop] instanceof type)) {
			throw new TypeError(`expected ${prop} to be ${type.name}, got: ${opts[prop]}`);
		}
	}
}

function setOpt(obj, prop, val) {
	if (val !== undefined) {
		obj[prop] = val;
	}
}

function factorToFlags(expectedFactor, flags) {
	// var flags = ["AT"];
	flags = flags || [];

	switch (expectedFactor) {
		case "first":
			flags.push("UP");
			flags.push("UV");
			break;
		case "second":
			flags.push("UP");
			break;
		case "either":
			flags.push("UP-or-UV");
			break;
		default:
			throw new TypeError("expectedFactor should be 'first', 'second' or 'either'");
	}

	return flags;
}

function createExtensions(type, extObj) {
	/* eslint-disable no-invalid-this */
	let extensions = {};

	// default extensions
	let enabledExtensions = this.extSet;
	let extensionsOptions = this.extOptMap;

	// passed in extensions
	if (typeof extObj === "object") {
		enabledExtensions = new Set(Object.keys(extObj));
		extensionsOptions = new Map();
		for (let key of Object.keys(extObj)) {
			extensionsOptions.set(key, extObj[key]);
		}
	}

	// generate extension values
	for (let extension of enabledExtensions) {
		let extVal = this.generateExtensionOptions(extension, type, extensionsOptions.get(extension));
		if (extVal !== undefined) extensions[extension] = extVal;
	}

	return extensions;
}
Fido2Lib.addAttestationFormat(
	noneAttestation.name,
	noneAttestation.parseFn,
	noneAttestation.validateFn
);
Fido2Lib.addAttestationFormat(
	packedAttestation.name,
	packedAttestation.parseFn,
	packedAttestation.validateFn
);
Fido2Lib.addAttestationFormat(
	fidoU2fAttestation.name,
	fidoU2fAttestation.parseFn,
	fidoU2fAttestation.validateFn
);
Fido2Lib.addAttestationFormat(
	androidSafetyNetAttestation.name,
	androidSafetyNetAttestation.parseFn,
	androidSafetyNetAttestation.validateFn
);
Fido2Lib.addAttestationFormat(
	tpmAttestation.name,
	tpmAttestation.parseFn,
	tpmAttestation.validateFn
);

// This is only to be used by bundler, to generate commonjs code
ToolBoxRegistration.registerAsGlobal();

module.exports = Fido2Lib;
