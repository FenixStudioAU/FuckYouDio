function getActionApi() {
  return chrome.action || chrome.browserAction;
}

async function runDownload(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async () => {
        const aEls = [...document.querySelectorAll('audio')];
        const el = aEls.find(a => !a.paused && (a.currentSrc || a.src)) || aEls.find(a => a.currentSrc || a.src);
        if (!el) return { ok: false, error: 'No <audio> elements found on this page.' };

        const src = el.currentSrc || el.src || '';
        if (!src) return { ok: false, error: 'No source found for the audio element.' };

        function safeFilename(s) {
          return (s || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
        }
        function deriveFilenameFromUrl(u) {
          try {
            const url = new URL(u, location.href);
            const last = url.pathname.split('/').filter(Boolean).pop() || 'audio.mp3';
            return /\.(mp3|wav|m4a|aac|ogg|flac|webm|mp4)(\?|$)/i.test(last) ? last : (last + '.mp3');
          } catch {
            return 'audio-' + Date.now() + '.mp3';
          }
        }
        async function downloadBlob(blob, filename) {
          const url = URL.createObjectURL(blob);
          try {
            const a = document.createElement('a');
            a.href = url;
            a.download = safeFilename(filename || ('audio-' + Date.now() + '.mp3'));
            a.rel = 'noopener';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
            return { ok: true, via: 'blob', filename: a.download };
          } finally {
            setTimeout(() => URL.revokeObjectURL(url), 30_000);
          }
        }
        async function downloadFromUrl(u, filename) {
          const a = document.createElement('a');
          a.href = u;
          a.download = safeFilename(filename || deriveFilenameFromUrl(u));
          a.rel = 'noopener';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
          return { ok: true, via: 'direct', filename: a.download };
        }

        if (src.startsWith('blob:') || src.startsWith('data:')) {
          try {
            const resp = await fetch(src);
            const blob = await resp.blob();
            return await downloadBlob(blob, document.title.trim().slice(0,80) + '.mp3');
          } catch (err) {
            return { ok: false, error: 'Failed to fetch blob/data URL: ' + String(err) };
          }
        } else {
          try {
            return await downloadFromUrl(src, deriveFilenameFromUrl(src));
          } catch (err) {
            try {
              const resp = await fetch(src, { credentials: 'include' });
              const blob = await resp.blob();
              return await downloadBlob(blob, deriveFilenameFromUrl(src));
            } catch (err2) {
              return { ok: false, error: 'Network fetch failed: ' + String(err2) };
            }
          }
        }
      },
    });

    if (!(result && result.ok)) {
      const msg = result && result.error ? ('Audio Downloader: ' + result.error) : 'Audio Downloader: Unknown error';
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (m) => alert(m),
        args: [msg],
      });
    }
  } catch (e) {
    console.error('Injection error', e);
  }
}

// Toolbar click
const actionApi = getActionApi();
if (actionApi && actionApi.onClicked) {
  actionApi.onClicked.addListener((tab) => {
    if (tab && tab.id) runDownload(tab.id);
  });
}

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "download-playing-audio",
    title: "Download playing audio",
    contexts: ["all"]
  }, () => void chrome.runtime.lastError);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "download-playing-audio" && tab && tab.id) {
    runDownload(tab.id);
  }
});
