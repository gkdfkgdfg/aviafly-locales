/* Audio is optional: an unsupported codec or stalled Safari decoder must not block startup. */
(function (root) {
  'use strict';
  function load(context, src, options = {}) {
    const fetchAudio = options.fetch || root.fetch.bind(root);
    const controller = new AbortController();
    const alternate = src.replace(/\.(ogg|aac)(?=[?#]|$)/, (_, ext) => ext === 'ogg' ? '.aac' : '.ogg');
    return new Promise(resolve => {
      let settled = false;
      const finish = buffer => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        controller.abort();
        resolve(buffer || null);
      };
      const timer = setTimeout(() => finish(null), options.timeoutMs ?? 7000);
      const decode = bytes => new Promise((accept, reject) => {
        // Older WebKit uses callbacks; modern implementations also return a Promise.
        const promise = context.decodeAudioData(bytes, accept, reject);
        if (promise && typeof promise.then === 'function') promise.then(accept, reject);
      });
      const attempt = async url => {
        const response = await fetchAudio(url, {signal: controller.signal});
        if (!response.ok) throw new Error('Audio HTTP ' + response.status);
        return decode(await response.arrayBuffer());
      };
      attempt(src).catch(error => {
        if (settled || alternate === src) throw error;
        return attempt(alternate);
      }).then(finish, () => finish(null));
    });
  }
  const api = {load, ready: sound => !!(sound && (sound.audioBuffer || sound.loadingComplete))};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AviaAudio = api;
})(typeof window === 'object' ? window : globalThis);
