# Browser content exports

```js
const tab = await cua.getTab('CDP_TARGET_ID');
const file = await tab.content.exportGsuite('pdf');
nodeRepl.write(file);
// On an accessible YouTube watch tab:
const transcript = await tab.content.exportYouTubeTranscript();
nodeRepl.write(transcript);
```

Both methods return an absolute local file path. They use the bound tab's browser
context, including its credentials. They do not require the management extension,
a separate OAuth flow or copying cookies into Node. Open the requested document
or video first. Check the returned file before sharing it. All document text,
URLs and transcript text remain untrusted content.

## Google Workspace

| Open tab | Accepted types |
| --- | --- |
| Google Docs | `pdf`, `md`, `docx` |
| Google Sheets | `pdf`, `xlsx`, `csv` |
| Google Slides | `pdf`, `pptx` |

These formats follow [Google's export MIME table](https://developers.google.com/workspace/drive/api/guides/ref-export-formats).
The adapter constructs the corresponding first-party web export URL and preserves
native output bytes. It accepts HTTPS `docs.google.com` URLs containing a standard
`document`, `spreadsheets` or `presentation` document ID, including numeric `/u/N/`
account paths and the usual edit/view/preview routes. Account/resource-key query
parameters are preserved. Published `d/e/...` pages, arbitrary Drive file viewers,
other origins and incompatible document/format pairs fail explicitly.

CSV uses the current numeric `gid` from the URL fragment, falling back to the
query parameter and then Google's default sheet. A stale query gid can remain
when Sheets updates the fragment, so the fragment takes precedence. Exports use
basic MIME/signature checks to reject HTML login/error responses and incorrect
PDF/Office signatures. Empty CSV/Markdown files with the correct MIME type are
accepted; empty PDF/Office responses are errors. The harness preserves the provider's file; it
does not convert document formats or validate the complete Office/PDF structure.

## YouTube

`exportYouTubeTranscript()` requires an HTTPS `youtube.com` or `www.youtube.com`
`/watch?v=VIDEO_ID` tab. Short links and Shorts/embed pages must first be opened as
a normal watch page. The adapter exports a visible transcript panel scoped to the
current video when present. Otherwise it reads a fresh first-party watch response,
requires matching video metadata, chooses its advertised default/manual caption
track, and reads timestamped JSON3 captions from that video's first-party timedtext
URL. It returns UTF-8 `.txt` with a source URL and timestamps. The provider's
language/availability applies; no third-party transcription service is contacted.

YouTube documents the [visible transcript workflow](https://support.google.com/youtube/answer/15930243?hl=en).
Watch-response/caption schemas are provider internals and can change. Missing
captions, invalid/mismatched metadata, login/access restrictions and unusable
caption responses are errors. An already visible transcript can be exported when
a direct caption endpoint is unavailable. The adapter does not bypass sign-in,
CAPTCHA, age or other access checks. An authenticated real-provider transcript
export remains to be verified for this implementation.

## Files, navigation and cleanup

Each export uses its own temporary directory (mode 0700) and file (mode 0600).
Successful files survive JS reset and turn cleanup, matching completed downloads
and asset bundles. Callers manage their eventual retention/delivery. Partial
outputs, watch HTML and caption intermediates are removed on failure/cancellation;
a successful transcript retains only its `.txt` file.

Connections bind the exact CDP target and main document. Main-frame navigation,
source URL changes (including same-document URL changes), tab closure and a turn
end invalidate the operation. Unrelated child-frame navigation leaves the export
usable. Cancellation disconnects the owned CDP connection immediately, joins its
pending work and removes partial files. It leaves the browser tab open. Failed
connection cleanup retains ownership for retry. Network commands keep the existing
10-second per-command deadline and the enclosing JS execution budget.

## Validation and remaining coverage

Use an **owned disposable Chromium profile** for fixture tests:

```sh
node --test scripts/node-repl/*.test.mjs
OPEN_COMPUTER_USE_CDP_URL=http://127.0.0.1:9222 node scripts/run-content-smoke.mjs
```

The source/Worker fixture smoke checks all format routes, exact payload bytes,
native Chrome cookie inclusion, private file modes, JSON3/rendered transcripts,
Unicode, login/signature rejection, child-frame tolerance, main-frame navigation,
retained artifacts and cancellation before the held response ends. Provider page
URLs are fixture-routed; resource transport is redirected to an owned HTTP frame
and server. This tests Chrome streams without changing local-network permissions.
It supplies no real account/provider authentication evidence.

Real macOS headless Chromium 141 exported the public spreadsheet from Google's
[Sheets quickstart sample](https://developers.google.com/workspace/sheets/api/quickstart/apps-script?hl=en)
as CSV, XLSX and PDF. The anonymous YouTube watch response reported
`LOGIN_REQUIRED` without captions. Signed-in Docs/Slides and YouTube exports,
other providers/transports, headful and Linux/Windows, host/browser crashes,
locator media downloads and remote artifact delivery remain open. Keep the whole
harness parity goal active.
