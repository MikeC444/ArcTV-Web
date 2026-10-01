# Third-party notices

## @stremio/stremio-video

Two files are adapted from [@stremio/stremio-video](https://github.com/Stremio/stremio-video):

* `client/src/domain/relay.ts` (`buildRelayUrl`) from `src/withStreamingServer/buildProxyUrl.js`;
* `client/src/domain/contentType.ts` (`getContentType`) from `src/HTMLVideo/getContentType.js`.

The author is Smart Code OOD and the package is licensed under the MIT License
(declared as `"license": "MIT"` in that package's `package.json`; the repository ships no separate LICENSE file, so the
standard MIT text is reproduced below with the copyright holder named in the package's `author` field).

```
MIT License

Copyright (c) Smart Code OOD

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Stremio Web (reference only — no code copied)

[Stremio Web](https://github.com/Stremio/stremio-web) is licensed under the GNU GPL v2. It was **read** to understand how
streams are resolved and played; none of its code is included in this project, so no GPL obligations attach to it. The
Torrentio addon (Apache-2.0) was not read at all — how its links behave is only inferred from what its responses look
like, and is labelled as such in `docs/PLAYBACK.md`. The playback *behaviour* that was adopted (proxying header-locked
and mixed-content streams through a server, keeping the stream's path in the proxy URL) is described in
`docs/PLAYBACK.md`.

## FFmpeg (via @ffmpeg-installer/ffmpeg)

Audio compatibility mode runs the `ffmpeg` command-line program as a separate process (it is not linked into this code). The
`@ffmpeg-installer/ffmpeg` npm package (LGPL-2.1, per its `package.json`) supplies prebuilt FFmpeg binaries from
[johnvansickle.com/ffmpeg](https://johnvansickle.com/ffmpeg/); those static builds are distributed under the GPL — their own licence
text is in the package's platform folder (`node_modules/@ffmpeg-installer/<platform>/`). Set `FFMPEG_PATH` to use your own build.
