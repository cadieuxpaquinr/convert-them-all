/*
 * Audio conversion, with the browser alone.
 *
 * Measured on Firefox 159, by handing a two-second tone in each container to
 * decodeAudioData:
 *
 *   in   wav mp3 flac ogg opus m4a webm   all decode
 *   out  wav                              everything else needs an encoder
 *
 * MediaRecorder is the only encoder a page has, and it writes Opus and nothing
 * else: audio/mpeg, audio/wav and audio/mp4 are all refused. It also encodes in
 * real time, so a four-minute track would take four minutes. That is why the
 * list below offers WAV and marks the rest as coming: the honest answer for
 * them is ffmpeg, which the helper already needs for video.
 *
 * The sample rate is chosen before decoding rather than after. decodeAudioData
 * resamples into whatever rate its context was built with, so asking for the
 * rate up front is both exact and free; resampling afterwards would be a second
 * pass over the same samples.
 */
(() => {
  const FORMATS = [
    { id: "wav", label: "WAV", mime: "audio/wav", ext: "wav", encoder: "wav" },
    { id: "mp3", label: "MP3", mime: "audio/mpeg", ext: "mp3", encoder: null },
    { id: "ogg", label: "OGG", mime: "audio/ogg", ext: "ogg", encoder: null },
    { id: "opus", label: "OPUS", mime: "audio/opus", ext: "opus", encoder: null },
    { id: "flac", label: "FLAC", mime: "audio/flac", ext: "flac", encoder: null },
    { id: "m4a", label: "M4A", mime: "audio/mp4", ext: "m4a", encoder: null }
  ];

  const RATES = [48000, 44100, 32000, 24000, 22050, 16000, 8000];
  const DEFAULT_RATE = 48000;

  function format(id) {
    return FORMATS.find((f) => f.id === id) || null;
  }

  function available(target) {
    return !!(target && target.encoder);
  }

  function rateOf(wanted) {
    const rate = Number(wanted);
    return RATES.includes(rate) ? rate : DEFAULT_RATE;
  }

  // An OfflineAudioContext, not an AudioContext: nothing is being played, and
  // opening an output device to read a file would be rude.
  function decode(bytes, rate) {
    const context = new OfflineAudioContext(1, 1, rateOf(rate));
    return context.decodeAudioData(bytes);
  }

  function channelsOf(buffer) {
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i += 1) {
      channels.push(buffer.getChannelData(i));
    }
    return channels;
  }

  async function read(file, rate) {
    const bytes = await file.arrayBuffer();
    let buffer = null;
    try {
      buffer = await decode(bytes, rate);
    } catch (e) {
      throw new Error("this file could not be decoded");
    }
    return buffer;
  }

  // The whole job: decode at the rate asked for, then write it out.
  async function run(options) {
    const target = format(options.format);
    if (!available(target)) throw new Error("that format is not available yet");

    const buffer = await read(options.file, options.sampleRate);
    const written = CTAWav.write({
      channels: channelsOf(buffer),
      sampleRate: buffer.sampleRate,
      bitDepth: Number(options.bitDepth)
    });

    const blob = new Blob([written.buffer], { type: target.mime });
    return {
      url: URL.createObjectURL(blob),
      converted: true,
      ext: target.ext,
      size: blob.size,
      seconds: buffer.duration,
      channels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
      bitDepth: written.bitDepth
    };
  }

  window.CTAAudioConvert = {
    FORMATS, RATES, DEFAULT_RATE, format, available, decode, read, run
  };
})();
