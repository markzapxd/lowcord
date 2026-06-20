import { definePluginSettings } from "@api/Settings";
import { TestcordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";

interface VoiceConnection {
    setTransportOptions?: (opts: any) => void;
    _stereoBridgeOrig?: Function;
}

interface AudioEncoderOpts {
    channels?: number;
    params?: Record<string, string>;
}

interface TransportOptions {
    audioEncoder?: AudioEncoderOpts;
    fec?: boolean;
    encodingVoiceBitRate?: number;
    prioritySpeaker?: boolean;
    prioritySpeakerDucking?: number;
}

const settings = definePluginSettings({
    masterToggle: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Master toggle for stereo"
    },
    staticMode: {
        type: OptionType.SELECT,
        description: "Static codec patch mode",
        options: [
            { label: "Mono (1.0)", value: 1 },
            { label: "Stereo (2.0)", value: 2, default: true },
            { label: "Surround (7.1)", value: 7.1 }
        ]
    },
    runtimeChannels: {
        type: OptionType.SLIDER,
        description: "Runtime channel count",
        markers: [1.0, 2.0, 4.0, 7.1],
        default: 2.0,
        stickToMarkers: true
    },
    bitrateKbps: {
        type: OptionType.SLIDER,
        description: "Audio bitrate (kbps)",
        markers: [64, 128, 256, 384, 512],
        default: 256,
        stickToMarkers: true
    },
    screenshareStereo: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Patch WebRTC SDP for stereo screenshare"
    },
    disableFEC: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Disable Forward Error Correction"
    },
    showToasts: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show toast notifications on connection"
    }
});

const VoiceSettingsStore = findByPropsLazy("getEchoCancellation");

const origRTCPeerConnection: Record<string, any> = {};

function mungeSDP(sdp: string): string {
    if (!sdp) return sdp;
    const opusPts = new Set<string>();
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

function patchSDPDesc(desc: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
    if (!desc?.sdp) return desc;
    return { type: desc.type, sdp: mungeSDP(desc.sdp) };
}

export default definePlugin({
    name: "StereoBridge",
    description: "All-in-one stereo audio: static codec patch + runtime transport hook + WebRTC SDP munging for voice and screenshare.",
    tags: ["Voice", "Utility"],
    authors: [TestcordDevs.x2b],

    settings,

    _patchedConns: new Set<VoiceConnection>(),

    patches: [
        {
            find: '"Audio codecs"',
            predicate: () => settings.store.masterToggle,
            replacement: {
                match: /channels:1,/,
                replace: 'channels:1,prams:{stereo:"1"},',
                predicate: () => settings.store.staticMode === 1
            }
        },
        {
            find: '"Audio codecs"',
            predicate: () => settings.store.masterToggle,
            replacement: {
                match: /channels:1,/,
                replace: 'channels:2,prams:{stereo:"2"},',
                predicate: () => settings.store.staticMode === 2
            }
        },
        {
            find: '"Audio codecs"',
            predicate: () => settings.store.masterToggle,
            replacement: {
                match: /channels:1,/,
                replace: 'channels:7.1,prams:{stereo:"7.1"},',
                predicate: () => settings.store.staticMode === 7.1
            }
        },
        {
            find: "updateVideoQuality",
            predicate: () => settings.store.masterToggle,
            replacement: {
                match: /updateVideoQuality\([^)]*\)\s*{/,
                replace: "$self.patchVoiceTransport(this);$&"
            }
        }
    ],

    patchVoiceTransport(thisObj: any) {
        if (!settings.store.masterToggle) return;

        const conn: VoiceConnection | undefined = thisObj?.conn;
        if (!conn?.setTransportOptions || conn._stereoBridgeOrig) return;

        const original = conn.setTransportOptions;
        conn._stereoBridgeOrig = original;
        this._patchedConns.add(conn);

        conn.setTransportOptions = function (opts: TransportOptions) {
            const channels = settings.store.runtimeChannels;

            if (opts.audioEncoder) {
                opts.audioEncoder.channels = channels;
                opts.audioEncoder.params = { stereo: channels.toString() };
            }

            if (settings.store.disableFEC && opts.fec !== undefined) {
                opts.fec = false;
            }

            const targetBitrate = settings.store.bitrateKbps * 1000;
            if (!opts.encodingVoiceBitRate || opts.encodingVoiceBitRate < targetBitrate) {
                opts.encodingVoiceBitRate = targetBitrate;
            }

            const result = original.call(this, opts);

            if (settings.store.showToasts) {
                showNotification({
                    title: "StereoBridge",
                    body: `${channels}ch @ ${settings.store.bitrateKbps}kbps`,
                    color: "var(--green-360)"
                });
            }

            return result;
        };
    },

    start() {
        if (!settings.store.masterToggle || !settings.store.screenshareStereo) return;

        const SRD = RTCPeerConnection.prototype.setRemoteDescription;
        const SLD = RTCPeerConnection.prototype.setLocalDescription;

        if (!(SRD as any)._stereoBridgeSRD) {
            origRTCPeerConnection.SRD = SRD;
            const wrappedSRD = function (this: RTCPeerConnection, desc: RTCSessionDescriptionInit, ...args: any[]) {
                return (origRTCPeerConnection.SRD as Function).call(this, patchSDPDesc(desc), ...args);
            };
            (wrappedSRD as any)._stereoBridgeSRD = true;
            RTCPeerConnection.prototype.setRemoteDescription = wrappedSRD as any;
        }

        if (!(SLD as any)._stereoBridgeSLD) {
            origRTCPeerConnection.SLD = SLD;
            const wrappedSLD = function (this: RTCPeerConnection, desc: RTCSessionDescriptionInit, ...args: any[]) {
                return (origRTCPeerConnection.SLD as Function).call(this, patchSDPDesc(desc), ...args);
            };
            (wrappedSLD as any)._stereoBridgeSLD = true;
            RTCPeerConnection.prototype.setLocalDescription = wrappedSLD as any;
        }
    },

    stop() {
        const srd = RTCPeerConnection.prototype.setRemoteDescription as any;
        if (srd?._stereoBridgeSRD && origRTCPeerConnection.SRD) {
            RTCPeerConnection.prototype.setRemoteDescription = origRTCPeerConnection.SRD;
        }
        const sld = RTCPeerConnection.prototype.setLocalDescription as any;
        if (sld?._stereoBridgeSLD && origRTCPeerConnection.SLD) {
            RTCPeerConnection.prototype.setLocalDescription = origRTCPeerConnection.SLD;
        }
        origRTCPeerConnection.SRD = undefined;
        origRTCPeerConnection.SLD = undefined;

        for (const conn of this._patchedConns) {
            if ((conn as any)._stereoBridgeOrig) {
                conn.setTransportOptions = (conn as any)._stereoBridgeOrig;
                delete (conn as any)._stereoBridgeOrig;
            }
        }
        this._patchedConns.clear();
    }
});
