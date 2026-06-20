// Standalone StereoBridge - no Vencord API dependencies
// Can be injected into Discord's webapp via any mod (Vencord, BetterDiscord, or even manually via console)
// Combines static codec patch + runtime transport hook + WebRTC SDP munging

(function () {
    "use strict";

    const config = {
        channels: 2,
        bitrate: 256000,
        disableFEC: false,
        screenshareStereo: true,
    };

    // 1. Static codec patch - replace channels:1 with channels x in Discord's codec table
    function patchCodecTable() {
        const codecTables = [];
        const seen = new Set();

        function walk(obj, path) {
            if (!obj || typeof obj !== "object") return;
            if (seen.has(obj)) return;
            seen.add(obj);

            if (obj.channels === 1 && obj.name === "opus" && Array.isArray(obj.prams) === false) {
                obj.channels = config.channels;
                obj.prams = { stereo: String(config.channels) };
                codecTables.push(obj);
            }

            for (const key of Object.getOwnPropertyNames(obj)) {
                try {
                    walk(obj[key], path + "." + key);
                } catch (_) { }
            }
        }

        walk(window, "window");
        return codecTables;
    }

    // 2. Runtime transport hook - intercept setTransportOptions on voice connections
    let origSetTransportOptions;

    function hookVoiceTransport() {
        function findVoiceConnection(root) {
            for (const key of Object.getOwnPropertyNames(root)) {
                const val = root[key];
                if (val && typeof val === "object" && typeof val.setTransportOptions === "function") {
                    if (val.audioEncoder || val.voiceConnection) {
                        return val;
                    }
                    if (val.conn && typeof val.conn.setTransportOptions === "function") {
                        return val.conn;
                    }
                }
            }
            return null;
        }

        const observer = new MutationObserver(() => {
            const conn = findVoiceConnection(window);
            if (conn && conn.setTransportOptions && conn.setTransportOptions !== origSetTransportOptions) {
                origSetTransportOptions = conn.setTransportOptions;
                const original = conn.setTransportOptions;
                conn.setTransportOptions = function (opts) {
                    if (opts.audioEncoder) {
                        opts.audioEncoder.channels = config.channels;
                        opts.audioEncoder.params = { stereo: String(config.channels) };
                    }
                    if (config.disableFEC && opts.fec !== undefined) {
                        opts.fec = false;
                    }
                    if (!opts.encodingVoiceBitRate || opts.encodingVoiceBitRate < config.bitrate) {
                        opts.encodingVoiceBitRate = config.bitrate;
                    }
                    return original.call(this, opts);
                };
            }
        });
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    // 3. WebRTC SDP munging - add stereo params to SDP for screenshare
    function hookWebRTC() {
        function mungeSDP(sdp) {
            if (!sdp) return sdp;
            const opusPts = new Set();
            for (const line of sdp.split(/\r\n/)) {
                const m = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
                if (m) opusPts.add(m[1]);
            }
            if (!opusPts.size) return sdp;
            return sdp.replace(/^a=fmtp:(\d+)\s+(.+)$/gmi, (full, pt, params) => {
                if (!opusPts.has(pt)) return full;
                if (/(\bstereo=1\b)|(\bsprop-stereo=1\b)/i.test(params)) return full;
                const sep = params.endsWith(";") ? "" : ";";
                return `a=fmtp:${pt} ${params}${sep}stereo=1;sprop-stereo=1`;
            });
        }

        const origSRD = RTCPeerConnection.prototype.setRemoteDescription;
        RTCPeerConnection.prototype.setRemoteDescription = function (desc, ...args) {
            if (desc && desc.sdp) {
                desc = { type: desc.type, sdp: mungeSDP(desc.sdp) };
            }
            return origSRD.call(this, desc, ...args);
        };

        const origSLD = RTCPeerConnection.prototype.setLocalDescription;
        RTCPeerConnection.prototype.setLocalDescription = function (desc, ...args) {
            if (desc && desc.sdp) {
                desc = { type: desc.type, sdp: mungeSDP(desc.sdp) };
            }
            return origSLD.call(this, desc, ...args);
        };
    }

    console.log("[StereoBridge] Patching codec table...");
    const patched = patchCodecTable();
    console.log(`[StereoBridge] Patched ${patched.length} codec entries -> ${config.channels} channels`);

    hookVoiceTransport();
    console.log("[StereoBridge] Voice transport hook installed");

    if (config.screenshareStereo) {
        hookWebRTC();
        console.log("[StereoBridge] WebRTC SDP hook installed");
    }
})();
